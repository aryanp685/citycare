// NG-S09 / document-level recovery drill (final technical verification, 2026-11-02, finding 3).
//
// Verifies ONE explicitly selected document on an ISOLATED drill scratch database:
//   0. verify the connected database's IDENTITY (`current_database()` must match
//      ^citycare_drill_\d{8}_\d{6}$) BEFORE any document lookup — a helper pointed
//      (accidentally or deliberately) at any non-scratch database refuses to run;
//   1. fetch the Document row + its DocumentBlob bytes (ciphertext) from the SCRATCH DB;
//   2. decrypt with the ACTUAL application implementation (src/lib/storage.ts decryptBlob —
//      the same AES-256-GCM code the download endpoint runs, keyed by DOCUMENT_KEY or the
//      documented SESSION_SECRET derivation);
//   3. verify SHA-256(plaintext) === Document.checksumSha256 (the stored plaintext anchor);
//   4. verify plaintext byte length === Document.sizeBytes.
//
// SECURITY INVARIANTS (do not weaken):
//   * connects ONLY to a database whose NAME is a drill scratch (gate 0 above; the drill
//     additionally derives the URL from the exact scratch name it created);
//   * NEVER prints or logs plaintext or PHI: the output is booleans, byte counts, timings
//     and error CLASSES only. A GCM authentication failure reports "decrypt_failed" with
//     no message body.
//   * read-only: an identity SELECT + one document SELECT; no writes of any kind.
//   * CLEANUP FIRST, EXIT SECOND (A89, 2026-11-02 final cleanup patch): the verdict is
//     collected, the client is closed in `finally` on EVERY path, and only then does the
//     process exit. `process.exit()` inside try/finally (the old shape) skipped `client.end()`
//     on every early-return verdict (not_found, tombstoned_anomaly, …).
//
// Usage:  node scripts/verify-document.ts <documentId>
// Env:    SCRATCH_DATABASE_URL (required), plus DOCUMENT_KEY or SESSION_SECRET.
// Exit:   0 verified ok · 1 verification failed (incl. usage/env/identity/connection refusals).
// Output: ONE JSON line on stdout (the verdict) — the parent drill (gate 7) parses it.
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadLocalEnv } from "./read-env-local.mjs";
import { decryptBlob } from "../src/lib/storage.ts";

/** The only database names this helper may ever read documents from (F2). */
export const SCRATCH_DB_NAME_RE = /^citycare_drill_\d{8}_\d{6}$/;
/** Document ids are UUID-shaped; anything else is a usage error, not a lookup. */
export const DOCUMENT_ID_RE = /^[0-9a-fA-F-]{8,64}$/;

export type Verdict = {
  ok: boolean;
  found: boolean;
  checksumMatch?: boolean;
  sizeMatch?: boolean;
  plaintextBytes?: number;
  declaredBytes?: number;
  keyVersion?: number;
  errorClass?: string;
  ms: number;
};

/** The slice of pg.Client this script needs (tests inject a fake). */
export type DrillClient = {
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
  end(): Promise<void>;
};

const realConnect = async (url: string): Promise<DrillClient> => {
  const client = new pg.Client({ connectionString: url, options: "-c timezone=UTC" });
  await client.connect();
  return client;
};

/**
 * The verifiable core (no process.exit, no argv, no env reading) — importable for tests.
 * Returns the verdict; ALWAYS closes the client (finally) before returning, on every path.
 */
export async function verifyDocument(opts: {
  documentId: string;
  url: string;
  connect?: (url: string) => Promise<DrillClient>;
}): Promise<Verdict> {
  const t0 = Date.now();
  const connect = opts.connect ?? realConnect;
  let client: DrillClient | null = null;
  try {
    try {
      client = await connect(opts.url);
    } catch {
      // no connection, no data — but still a parseable verdict, never a crash
      return { ok: false, found: false, errorClass: "scratch_connect_failed", ms: Date.now() - t0 };
    }

    // F2 — IDENTITY GATE, before the document SELECT. The connected database must be a
    // drill scratch by name; anything else (a fat-fingered prod URL, an old env) refuses
    // WITHOUT ever running the document query.
    const idr = await client.query("SELECT current_database() AS db");
    const dbName = typeof idr.rows[0]?.db === "string" ? (idr.rows[0].db as string) : "";
    if (!SCRATCH_DB_NAME_RE.test(dbName)) {
      return { ok: false, found: false, errorClass: "unsafe_database_identity", ms: Date.now() - t0 };
    }

    // ONE read: metadata + ciphertext together (the same join the download endpoint uses).
    const r = await client.query(
      `SELECT d."checksumSha256", d."sizeBytes", d."encryptionIv", d."isDeleted",
              b.data AS "blobData", b."keyVersion"
         FROM "Document" d
         JOIN "DocumentBlob" b ON b."documentId" = d.id
        WHERE d.id = $1`,
      [opts.documentId],
    );
    if (!r.rows.length) return { ok: false, found: false, errorClass: "not_found", ms: Date.now() - t0 };
    const row = r.rows[0];
    // owner-deleted documents have their bytes removed immediately — a tombstone WITH bytes
    // is a reconciliation anomaly (DOCUMENT_STORAGE_DISASTER_RECOVERY.md §4 query c), not a
    // verifiable document: flag it, do not silently pass it
    if (row.isDeleted === true) return { ok: false, found: true, errorClass: "tombstoned_anomaly", ms: Date.now() - t0 };

    try {
      // the application's own decryption (AES-256-GCM, tag = last 16 bytes of DocumentBlob.data)
      const plain = decryptBlob(Buffer.from(row.blobData as Uint8Array), String(row.encryptionIv));
      const sha = crypto.createHash("sha256").update(plain).digest("hex");
      const checksumMatch = sha === String(row.checksumSha256);
      const sizeMatch = plain.length === Number(row.sizeBytes);
      return {
        ok: checksumMatch && sizeMatch,
        found: true,
        checksumMatch,
        sizeMatch,
        plaintextBytes: plain.length, // a length is not content
        declaredBytes: Number(row.sizeBytes),
        keyVersion: Number(row.keyVersion),
        ms: Date.now() - t0,
      };
    } catch {
      // a tampered ciphertext or a wrong/lost DOCUMENT_KEY must not leak any content
      return { ok: false, found: true, errorClass: "decrypt_failed", ms: Date.now() - t0 };
    }
  } catch {
    // any unexpected failure (query error, bad row shape, …) — safe class, no detail,
    // the client is still closed below
    return { ok: false, found: false, errorClass: "verification_error", ms: Date.now() - t0 };
  } finally {
    // F1 — the client is closed on EVERY path (success, not_found, tombstone, decrypt
    // failure, identity refusal, connection failure, unexpected error) BEFORE the verdict
    // is handed back. The parent drill's scratch-drop cleanup is independent and still
    // runs on every path (A87).
    await client?.end().catch(() => null);
  }
}

/**
 * CLI entry: validates usage/env, runs the core, prints the ONE-JSON-line verdict, and
 * RETURNS the exit code (0 ok · 1 any failure). It never calls process.exit itself —
 * only the direct-invocation guard below exits, and only AFTER main() has finished
 * (verdict printed, client closed).
 */
export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const t0 = Date.now();
  const emit = (v: Verdict): number => {
    console.log(JSON.stringify({ ...v, ms: Date.now() - t0 }));
    return v.ok ? 0 : 1;
  };
  const docId = argv[0] ?? "";
  if (!docId || !DOCUMENT_ID_RE.test(docId)) return emit({ ok: false, found: false, errorClass: "usage", ms: 0 });
  loadLocalEnv(["DOCUMENT_KEY", "SESSION_SECRET"]);
  const url = process.env.SCRATCH_DATABASE_URL;
  if (!url) return emit({ ok: false, found: false, errorClass: "env_missing_scratch_url", ms: Date.now() - t0 });
  return emit(await verifyDocument({ documentId: docId, url }));
}

// Direct invocation only (node/tsx running this file): exit AFTER main completes.
// Imported callers (the unit tests) get the plain exported functions, no exit.
const invokedDirectly = (() => {
  try {
    return process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();
if (invokedDirectly) {
  void main().then(
    (code) => process.exit(code),
    () => {
      // a crash before main resolved still emits a parseable verdict (A81 discipline)
      console.log(JSON.stringify({ ok: false, found: false, errorClass: "runner_crash", ms: 0 }));
      process.exit(1);
    },
  );
}
