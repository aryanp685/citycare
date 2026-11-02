import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  BackupError,
  FORMAT_MAGIC,
  FORMAT_VERSION,
  BACKUP_STALE_MS,
  backupKey,
  storeKind,
  retentionDays,
  dbFingerprintFromUrl,
  schemaVersionFromDir,
  quoteIdent,
  topoTableOrder,
  encryptContainer,
  decryptContainer,
  buildContainer,
  verifyContainer,
  verifyBackupFile,
  backupFileName,
  writeBackupFile,
  readBackupFile,
  listBackupFiles,
  pruneBackups,
  copyTableOut,
  createBackup,
  recordBackupMeta,
  backupStaleness,
  TABLES_SQL,
  type QueryRunner,
  type CreateBackupOpts,
} from "../backup-core.mjs";

const KEY = crypto.randomBytes(32);

function tmpdir(name: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `ccbk-${name}-`));
}

describe("backup core — config", () => {
  it("backupKey validates 32-byte base64 and refuses anything else", () => {
    expect(backupKey({ BACKUP_KEY: KEY.toString("base64") })!.length).toBe(32);
    expect(backupKey({})).toBeNull();
    expect(() => backupKey({ BACKUP_KEY: crypto.randomBytes(8).toString("base64") })).toThrowError(BackupError);
    expect(() => backupKey({ BACKUP_KEY: "nope" })).toThrowError(/32 bytes/);
  });
  it("storeKind: blob wins over local; neither → null", () => {
    expect(storeKind({ BLOB_READ_WRITE_TOKEN: "t", BACKUP_DIR: "/x" })).toBe("blob");
    expect(storeKind({ BACKUP_DIR: "/x" })).toBe("local");
    expect(storeKind({})).toBeNull();
  });
  it("retentionDays clamps to 1..365, default 30", () => {
    expect(retentionDays({})).toBe(30);
    expect(retentionDays({ BACKUP_RETENTION_DAYS: "0" })).toBe(1);
    expect(retentionDays({ BACKUP_RETENTION_DAYS: "99999" })).toBe(365);
    expect(retentionDays({ BACKUP_RETENTION_DAYS: "junk" })).toBe(30);
    expect(retentionDays({ BACKUP_RETENTION_DAYS: "45" })).toBe(45);
  });
  it("dbFingerprint ignores credentials but distinguishes host/port/db", () => {
    const a = dbFingerprintFromUrl("postgresql://u1:p1@db.example.com:5432/citycare");
    const b = dbFingerprintFromUrl("postgresql://u2:p2@db.example.com:5432/citycare");
    const c = dbFingerprintFromUrl("postgresql://u1:p1@db.example.com:5432/other");
    const d = dbFingerprintFromUrl("postgresql://u1:p1@db.example.com:5433/citycare");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toBe(d);
    expect(() => dbFingerprintFromUrl("not a url")).toThrowError(/valid postgres URL/);
  });
  it("schemaVersionFromDir returns the max migration stem, or null when absent/empty", () => {
    const dir = tmpdir("migs");
    afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
    fs.writeFileSync(path.join(dir, "0002_foo.sql"), "");
    fs.writeFileSync(path.join(dir, "0001_bar.sql"), "");
    expect(schemaVersionFromDir(dir)).toBe("0002_foo");
    expect(schemaVersionFromDir(path.join(dir, "nope"))).toBeNull();
    const empty = tmpdir("migs-empty");
    expect(schemaVersionFromDir(empty)).toBeNull();
    fs.rmSync(empty, { recursive: true, force: true });
  });
});

describe("backup core — table ordering", () => {
  it("quoteIdent escapes embedded quotes", () => {
    expect(quoteIdent("User")).toBe('"User"');
    expect(quoteIdent('We"ird')).toBe('"We""ird"');
  });
  it("topological order: diamond graph, deterministic alphabetical tie-break", () => {
    const edges = [
      { child: '"B"', parent: '"A"' },
      { child: '"C"', parent: '"A"' },
      { child: '"D"', parent: '"B"' },
      { child: '"D"', parent: '"C"' },
      { child: '"E"', parent: '"D"' },
      { child: '"Z"', parent: '"Z"' }, // self-FK ignored
    ];
    const { order, warning } = topoTableOrder(["Z", "A", "B", "C", "D", "E"], edges);
    expect(warning).toBeNull();
    expect(order.indexOf("A")).toBeLessThan(order.indexOf("B"));
    expect(order.indexOf("A")).toBeLessThan(order.indexOf("C"));
    expect(order.indexOf("B")).toBeLessThan(order.indexOf("D"));
    expect(order.indexOf("C")).toBeLessThan(order.indexOf("D"));
    expect(order.indexOf("D")).toBeLessThan(order.indexOf("E"));
    expect(order).toHaveLength(6);
  });
  it("a cycle never blocks a backup — remainder appended, warning recorded", () => {
    const { order, warning } = topoTableOrder(["X", "Y"], [{ child: '"X"', parent: '"Y"' }, { child: '"Y"', parent: '"X"' }]);
    expect(warning).toBe("fk_cycle");
    expect(order.sort()).toEqual(["X", "Y"]);
  });
});

describe("backup core — container + crypto", () => {
  const makeTables = (extra?: string) => [
    { name: "User", rows: 2, copyText: `a\t1\nb\t2\n${extra ?? ""}` },
    { name: "Patient", rows: 0, copyText: "" },
  ];
  const opts = (tables: { name: string; rows: number; copyText: string }[]) => ({
    createdAt: "2026-11-01T12:00:00.000Z",
    pgVersion: "18.6",
    dbFingerprint: "fp-fingerprint",
    schemaVersion: "0006",
    tables,
  });

  it("build→verify round-trips content, counts, and lengths", () => {
    const { container, header } = buildContainer(opts(makeTables()));
    expect(header.magic).toBe(FORMAT_MAGIC);
    expect(header.version).toBe(FORMAT_VERSION);
    expect(header.tableCount).toBe(2);
    expect(header.totalRows).toBe(2);
    const { header: h2, sections } = verifyContainer(container);
    expect(h2.payloadSha256).toBe(header.payloadSha256);
    expect(sections[0].copyText).toBe(makeTables()[0].copyText);
    expect(sections[0].quoted).toBe('"User"');
    expect(sections[1].copyText).toBe("");
    expect(sections[1].rows).toBe(0);
  });

  it("a data row that LOOKS like a section marker cannot misalign the split", () => {
    // "evil" row's first field is exactly the text of the next section's marker
    const evil = "===TABLE 1===\ttricky\tvalue\n";
    const { container } = buildContainer(opts(makeTables(evil)));
    const { sections } = verifyContainer(container);
    expect(sections[0].copyText).toBe(makeTables(evil)[0].copyText);
    expect(sections[1].copyText).toBe("");
  });

  it("encrypt/decrypt round-trips; bad magic is rejected", () => {
    const { container } = buildContainer(opts(makeTables()));
    const file = encryptContainer(container, KEY);
    expect(file.subarray(0, 4).toString("latin1")).toBe(FORMAT_MAGIC);
    expect(decryptContainer(file, KEY).equals(container)).toBe(true);
    const badMagic = Buffer.from(file);
    badMagic[0] = 0x58;
    expect(() => decryptContainer(badMagic, KEY)).toThrowError(/magic/);
  });

  it("any bit flip in the ciphertext fails GCM verification", () => {
    const { container } = buildContainer(opts(makeTables()));
    const file = encryptContainer(container, KEY);
    const tampered = Buffer.from(file);
    tampered[20] ^= 0x01;
    expect(() => decryptContainer(tampered, KEY)).toThrowError(BackupError);
  });

  it("wrong key fails verification", () => {
    const { container } = buildContainer(opts(makeTables()));
    const file = encryptContainer(container, KEY);
    expect(() => verifyBackupFile(file, crypto.randomBytes(32))).toThrowError(/GCM/);
  });

  it("payload sha256 catches a tampered (re-encrypted) container", () => {
    const { container } = buildContainer(opts(makeTables()));
    const tampered = Buffer.concat([
      container.subarray(0, container.length - 1),
      Buffer.from([container[container.length - 1] ^ 1]),
    ]);
    expect(() => verifyContainer(tampered)).toThrowError(/sha256|unparseable/);
  });

  it("swapped sections are caught by the marker check", () => {
    const tables = makeTables();
    const s = `===TABLE 0===\n${tables[0].copyText}===TABLE 1===\n`;
    const payload = Buffer.from(s, "utf8");
    const header = {
      magic: FORMAT_MAGIC,
      version: FORMAT_VERSION,
      tableCount: 2,
      payloadBytes: payload.length,
      payloadSha256: crypto.createHash("sha256").update(payload).digest("hex"),
      tables: [
        { name: "User", quoted: '"User"', rows: 2, bytes: payload.length / 2 },
        { name: "Patient", quoted: '"Patient"', rows: 0, bytes: payload.length / 2 },
      ],
    };
    // sections reversed: first body belongs to Patient, so section 0's marker is intact but
    // section 1's marker is missing → the walk must fail
    const container = Buffer.concat([Buffer.from(JSON.stringify(header) + "\n", "utf8"), payload]);
    expect(() => verifyContainer(container)).toThrowError(BackupError);
  });

  it("file sha256 is exposed for the metadata table", () => {
    const { container } = buildContainer(opts(makeTables()));
    const file = encryptContainer(container, KEY);
    const v = verifyBackupFile(file, KEY);
    expect(v.fileSha256).toBe(crypto.createHash("sha256").update(file).digest("hex"));
  });

  it("backupFileName is deterministic, sortable, and matches the store regex", () => {
    const n = backupFileName(new Date("2026-11-01T08:09:10.000Z"), "deadbeefcafe");
    expect(n).toBe("citycare-backup-20261101-080910-deadbeef.ccbk");
    expect(/^[a-z0-9][a-z0-9-]*\.ccbk$/.test(n)).toBe(true);
    // and the store must accept its own filenames (the original bug this guards)
    expect(n).not.toMatch(/[^a-z0-9.-]/);
  });
});

describe("backup core — local store", () => {
  let dir: string;
  beforeAll(() => {
    dir = tmpdir("store");
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("write is atomic + 0600; read round-trips; list sees only .ccbk files", async () => {
    const env = { BACKUP_DIR: dir };
    const file = crypto.randomBytes(256);
    await writeBackupFile(env, "citycare-backup-20261101-000000-aaaa1111.ccbk", file);
    const st = fs.statSync(path.join(dir, "citycare-backup-20261101-000000-aaaa1111.ccbk"));
    expect(st.mode & 0o777).toBe(0o600);
    expect(await readBackupFile(env, "citycare-backup-20261101-000000-aaaa1111.ccbk").then((b) => b.equals(file))).toBe(true);
    fs.writeFileSync(path.join(dir, "notes.txt"), "x"); // non-backup files are invisible to the store
    const names = (await listBackupFiles(env)).map((e) => e.name);
    expect(names).toEqual(["citycare-backup-20261101-000000-aaaa1111.ccbk"]);
  });

  it("rejects bad object names and missing store config", async () => {
    await expect(writeBackupFile({ BACKUP_DIR: dir }, "../escape.ccbk", Buffer.from("x"))).rejects.toThrowError(/bad object name/);
    await expect(writeBackupFile({}, "x.ccbk", Buffer.from("x"))).rejects.toThrowError(/no store configured/);
  });

  it("prune deletes files older than the window, keeps fresh ones, and a lone file always survives", async () => {
    const env = { BACKUP_DIR: dir };
    const now = Date.now();
    const mk = async (name: string, ageDays: number) => {
      await writeBackupFile(env, name, crypto.randomBytes(16));
      const t = (now - ageDays * 86_400_000) / 1000;
      fs.utimesSync(path.join(dir, name), t, t);
    };
    // aaaa1111 (age 0, from the earlier test) is the newest → entries[0], always kept.
    await mk("citycare-backup-20261001-000000-bbbb2222.ccbk", 31); // older than window → delete
    await mk("citycare-backup-20261005-000000-cccc3333.ccbk", 32); // older than window → delete
    await mk("citycare-backup-20261014-000000-dddd4444.ccbk", 18); // within window → keep
    const deleted = await pruneBackups(env, 30, now);
    const left = (await listBackupFiles(env)).map((e) => e.name);
    expect(deleted).toContain("citycare-backup-20261001-000000-bbbb2222.ccbk");
    expect(deleted).toContain("citycare-backup-20261005-000000-cccc3333.ccbk");
    expect(deleted).not.toContain("citycare-backup-20261014-000000-dddd4444.ccbk");
    expect(left).toContain("citycare-backup-20261014-000000-dddd4444.ccbk");
    expect(left).toContain("citycare-backup-20261101-000000-aaaa1111.ccbk"); // newest survives
  });

  it("outage scenario: when the ONLY file is old, it must still survive", async () => {
    const env = { BACKUP_DIR: dir };
    const now = Date.now();
    const name = "citycare-backup-20260901-000000-ffff5555.ccbk";
    await writeBackupFile(env, name, crypto.randomBytes(16));
    const t = (now - 90 * 86_400_000) / 1000; // 90 days old, far past the window
    fs.utimesSync(path.join(dir, name), t, t);
    // temporarily move the other files into a subdir so this is the only one listed
    const hidden = path.join(dir, "_hidden");
    fs.mkdirSync(hidden, { recursive: true });
    const others = (await listBackupFiles(env)).map((e) => e.name).filter((n) => n !== name);
    for (const n of others) await fs.promises.rename(path.join(dir, n), path.join(hidden, n));
    try {
      const deleted = await pruneBackups(env, 30, now);
      expect(deleted).toEqual([]);
      expect((await listBackupFiles(env)).map((e) => e.name)).toEqual([name]);
    } finally {
      for (const n of others) await fs.promises.rename(path.join(hidden, n), path.join(dir, n));
      fs.rmSync(hidden, { recursive: true, force: true });
    }
  });
});

describe("backup core — createBackup orchestration (fake pg)", () => {
  function fakePg(tables: Record<string, string>, slowMs = 0) {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const client = {
      query: (text: string, values?: unknown[]) => {
        const m = text.match(/^COPY "([^"]+)" TO STDOUT/);
        if (m) {
          const body = tables[m[1]] ?? "";
          return (async function* () {
            if (slowMs) await sleep(slowMs);
            if (body) yield body;
          })();
        }
        if (/^COPY "([^"]+)" FROM STDIN/.test(text)) return Promise.resolve({ copied: String(values?.[0] ?? "").split("\n").length - 1 });
        if (text.includes("pg_class"))
          return Promise.resolve({ rows: Object.keys(tables).sort().map((relname) => ({ relname })) });
        if (text.includes("pg_constraint")) return Promise.resolve({ rows: [{ child: '"Child"', parent: '"Parent"' }] });
        if (text.includes("server_version")) return Promise.resolve({ rows: [{ v: "18.6" }] });
        const cm = text.match(/count\(\*\)::int AS n FROM "([^"]+)"/);
        if (cm) return Promise.resolve({ rows: [{ n: (tables[cm[1]] ?? "").split("\n").filter(Boolean).length }] });
        return Promise.resolve({ rows: [] });
      },
    };
    const query: QueryRunner = (async (text: string) => (client.query as unknown as (t: string) => Promise<{ rows: Record<string, unknown>[] }>)(text)) as QueryRunner;
    return { client: client as unknown as CreateBackupOpts["client"], query };
  }

  it("produces an encrypted, verifiable file in the right FK order", async () => {
    const dir = tmpdir("create");
    const { client, query } = fakePg({
      Parent: "p1\t1\np2\t2\n",
      Child: "c1\t1\tp1\n",
      Solo: "s1\t9\n",
    });
    const res = await createBackup({
      env: { BACKUP_KEY: KEY.toString("base64"), BACKUP_DIR: dir },
      query,
      client,
      url: "postgresql://u:p@127.0.0.1:5432/citycare",
      migrationsDir: path.join(process.cwd(), "..", "schema", "migrations"),
      now: new Date("2026-11-01T12:00:00.000Z"),
    });
    expect(res.storeKind).toBe("local");
    expect(res.header.tables.map((t) => t.name)).toEqual(["Parent", "Child", "Solo"]); // parents before children
    expect(res.header.totalRows).toBe(4);
    expect(res.header.schemaVersion).toBe(schemaVersionFromDir(path.join(process.cwd(), "..", "schema", "migrations")));
    const file = await readBackupFile({ BACKUP_DIR: dir }, res.objectName);
    const v = verifyBackupFile(file, KEY);
    expect(v.fileSha256).toBe(res.sha256);
    expect(v.header.dbFingerprint).toBe(dbFingerprintFromUrl("postgresql://u:p@127.0.0.1:5432/citycare"));
    expect(v.sections.find((s) => s.name === "Child")!.copyText).toBe("c1\t1\tp1\n");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("refuses an empty database and writes nothing", async () => {
    const dir = tmpdir("empty");
    const { client, query } = fakePg({});
    await expect(
      createBackup({ env: { BACKUP_KEY: KEY.toString("base64"), BACKUP_DIR: dir }, query, client, url: "postgresql://u:p@h:5432/x" }),
    ).rejects.toThrowError(/no public tables/);
    expect(fs.readdirSync(dir)).toEqual([]);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("time budget: throws time_budget and leaves NO file behind", async () => {
    const dir = tmpdir("budget");
    const { client, query } = fakePg({ A: "a\n", B: "b\n", C: "c\n" }, 40); // 40 ms per table
    const t0 = Date.now();
    await expect(
      createBackup({
        env: { BACKUP_KEY: KEY.toString("base64"), BACKUP_DIR: dir },
        query,
        client,
        url: "postgresql://u:p@h:5432/x",
        softLimitMs: 50,
      }),
    ).rejects.toThrowError(BackupError);
    expect(Date.now() - t0).toBeGreaterThan(50);
    expect(fs.readdirSync(dir).filter((f) => f.endsWith(".ccbk"))).toEqual([]);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("backup core — COPY streaming + metadata + staleness", () => {
  it("copyTableOut hands every chunk to the callback as a Buffer", async () => {
    const chunks: Buffer[] = [];
    const client = {
      query: () => (async function* () {
        yield "row1\t1\n";
        yield Buffer.from("row2\t2\n");
      })(),
    };
    await copyTableOut(client, "T", (c) => chunks.push(c));
    expect(Buffer.concat(chunks).toString("utf8")).toBe("row1\t1\nrow2\t2\n");
  });

  it("recordBackupMeta passes the 11 values in order and returns the row id", async () => {
    let seen: unknown[] = [];
    const query = async (sql: string, params: unknown[] = []) => {
      seen = params;
      expect(sql.includes('INSERT INTO "Backup"')).toBe(true);
      return { rows: [{ id: "uuid-1", createdAt: "2026-11-01T00:00:00Z" }] };
    };
    const out = await recordBackupMeta(query, {
      status: "ok",
      dbFingerprint: "fp",
      schemaVersion: "0006",
      pgVersion: "18.6",
      fileSize: 123,
      sha256: "ab",
      storeKind: "local",
      objectName: "x.ccbk",
      durationMs: 9,
      errorClass: null,
      tableCount: 5,
      rowCounts: { User: 2 },
    });
    expect(out).toEqual({ id: "uuid-1", createdAt: "2026-11-01T00:00:00Z" });
    expect(seen).toEqual(["fp", "0006", "18.6", 123, "ab", "local", "x.ccbk", "ok", 9, null, 5, '{\"User\":2}']);
  });

  it("backupStaleness: null → stale; 25 h → fresh; 31 h → stale (24 h + 6 h grace)", () => {
    const now = Date.now();
    expect(backupStaleness(null, now)).toEqual({ lastSuccessAt: null, ageMs: null, stale: true });
    expect(backupStaleness(new Date(now - 25 * 3_600_000).toISOString(), now).stale).toBe(false);
    expect(backupStaleness(new Date(now - 31 * 3_600_000).toISOString(), now).stale).toBe(true);
    expect(BACKUP_STALE_MS).toBe(30 * 3_600_000);
  });

  it("TABLES_SQL only selects public relkind=r tables (no views, no system)", () => {
    expect(TABLES_SQL).toContain("nspname = 'public'");
    expect(TABLES_SQL).toContain("relkind = 'r'");
  });
});
