// Day 2 (NG-S10, A1) — /api/health contract for uptime monitoring.
//
// Pins the monitoring contract:
//   1. DB down  ⇒ 503 with a STABLE, SAFE body — the response must never carry driver
//      error text (pg error messages can embed host:port / user; this is a public URL).
//   2. healthy  ⇒ 200 "ok" with safe config/retention/backup facts and NO secret values.
//   3. ledger break or non-UTC ⇒ 503 "degraded" (readiness gate).
//   4. backup table absent (pre-migration) ⇒ still 200, reported as unconfigured/stale —
//      backup health is a reported fact, never a liveness failure.
//
// Only the DB layer and the response helpers are mocked; storage/legal/retention/backup
// cores run for real so the asserted fields are the real production computations.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db", () => ({ one: vi.fn(), run: vi.fn() }));
vi.mock("@/lib/api", () => ({
  ok: (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } }),
  err: (status: number, code: string, message: string, extra?: Record<string, unknown>) =>
    new Response(JSON.stringify({ error: message, code, ...(extra ?? {}) }), {
      status,
      headers: { "content-type": "application/json" },
    }),
}));

import { one } from "@/lib/db";
import { GET } from "../../app/api/health/route";

const mockedOne = vi.mocked(one);

type HealthBody = {
  status: string;
  db: { reachable: boolean; timezone: string; statementTimeout: string; postgres: string; ledgerBreaks: number };
  config: { documentKey: string; anchorSigning: boolean; emailDelivery: boolean };
  retention: { policy: string; enabled: boolean; reason: string; days: number; protectedDomain: string };
  backups: { configured: boolean; lastSuccessAt: string | null; ageMs: number | null; stale: boolean };
  latencyMs: number;
  at: string;
};

const HEALTHY_MAIN_ROW = { tz: "UTC", st: "8s", breaks: 0, version: "17.4" };
const FRESH_BACKUP_ROW = { createdAt: new Date(Date.now() - 3600_000).toISOString() };

// A fake connection detail a careless error path could leak (worst case).
const LEAKY = "connect ECONNREFUSED db-pooler.internal:5432 (postgresql://citycare:hunter2@db-pooler.internal:5432/citycare)";

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {};
  for (const k of ["BACKUP_DIR", "BLOB_READ_WRITE_TOKEN", "DOCUMENT_KEY", "ANCHOR_SIGNING_KEY", "RESEND_API_KEY", "EMAIL_FROM", "RETENTION_POLICY"]) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  mockedOne.mockReset();
});

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("1. DB down ⇒ safe 503 (no connection details leak)", () => {
  it("rejects with a leaky driver message ⇒ body is static; no host/port/URL/password anywhere", async () => {
    const e = Object.assign(new Error(LEAKY), { code: "ECONNREFUSED" });
    mockedOne.mockRejectedValueOnce(e);

    const res = await GET();
    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    const wire = JSON.stringify(body);
    expect(body.code).toBe("db_unreachable");
    expect(wire).not.toContain("db-pooler.internal");
    expect(wire).not.toContain("hunter2");
    expect(wire).not.toContain("postgresql://");
    expect(wire).not.toContain("5432");
    expect(wire).not.toContain("LEAKY");
  });

  it("non-Error throw ⇒ same static safe 503", async () => {
    mockedOne.mockRejectedValueOnce("weird-non-error");
    const res = await GET();
    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.code).toBe("db_unreachable");
    expect(JSON.stringify(body)).not.toContain("weird-non-error");
  });
});

describe("2. healthy ⇒ 200 with safe facts and no secrets", () => {
  it("200 ok: db facts + retention policy + fresh backup; secret env values absent from the wire", async () => {
    const docKey = "dGVzdC1rZXktMzItYnl0ZXMtZm9yLXVuaXQtdGVzdA==";
    const anchor = "YW5jaG9yLXNlY3JldC12YWx1ZQ==";
    process.env.DOCUMENT_KEY = docKey;
    process.env.ANCHOR_SIGNING_KEY = anchor;
    process.env.BACKUP_DIR = "/tmp/test-backups";
    process.env.RETENTION_POLICY = "demo";

    mockedOne.mockResolvedValueOnce(HEALTHY_MAIN_ROW as never);
    mockedOne.mockResolvedValueOnce(FRESH_BACKUP_ROW as never);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as HealthBody;
    const wire = JSON.stringify(body);

    expect(body.status).toBe("ok");
    expect(body.db).toMatchObject({ reachable: true, timezone: "UTC", postgres: "17.4", ledgerBreaks: 0 });
    expect(body.config.documentKey).toBe("env");
    expect(body.config.anchorSigning).toBe(true);
    expect(body.retention).toMatchObject({ policy: "demo", enabled: true, reason: "ok", protectedDomain: "demo.in" });
    expect(body.backups).toMatchObject({ configured: true, stale: false });
    expect(typeof body.latencyMs).toBe("number");
    expect(Number.isFinite(Date.parse(body.at))).toBe(true);

    // the endpoint exposes SOURCE (env/derived) and booleans — never the values
    expect(wire).not.toContain(docKey);
    expect(wire).not.toContain(anchor);
    expect(wire).not.toContain("hunter2");
  });
});

describe("3. readiness gates ⇒ 503 degraded", () => {
  it("ledger break ⇒ 503 status:degraded", async () => {
    mockedOne.mockResolvedValueOnce({ ...HEALTHY_MAIN_ROW, breaks: 2 } as never);
    const res = await GET();
    expect(res.status).toBe(503);
    const jb = (await res.json()) as { status?: string };
    expect(jb.status).toBe("degraded");
  });

  it("non-UTC database ⇒ 503 status:degraded", async () => {
    mockedOne.mockResolvedValueOnce({ ...HEALTHY_MAIN_ROW, tz: "Asia/Kolkata" } as never);
    const res = await GET();
    expect(res.status).toBe(503);
    const jb = (await res.json()) as { status?: string };
    expect(jb.status).toBe("degraded");
  });
});

describe("4. backup table absent (pre-migration) ⇒ 200, reported unconfigured", () => {
  it("second query throws ⇒ 200 ok with backups {configured:false, stale:true} (never a 503)", async () => {
    process.env.BACKUP_DIR = "/tmp/test-backups"; // configured in env, but the table is gone
    mockedOne.mockResolvedValueOnce(HEALTHY_MAIN_ROW as never);
    mockedOne.mockRejectedValueOnce(new Error('relation "Backup" does not exist'));

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as HealthBody;
    expect(body.status).toBe("ok");
    expect(body.backups).toEqual({ configured: false, lastSuccessAt: null, ageMs: null, stale: true });
    const wire = JSON.stringify(body);
    expect(wire).not.toContain('relation "Backup"');
    expect(wire).not.toContain("does not exist");
  });
});
