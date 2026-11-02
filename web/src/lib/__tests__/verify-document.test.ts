import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import crypto from "node:crypto";
import { encryptBlob } from "../storage";
import { verifyDocument, main, SCRATCH_DB_NAME_RE, DOCUMENT_ID_RE, type DrillClient } from "../../../scripts/verify-document.ts";

// The app's own crypto key for the test process (call-time env read in storage.ts).
beforeAll(() => {
  process.env.DOCUMENT_KEY = crypto.randomBytes(32).toString("base64");
});
afterAll(() => {
  delete process.env.DOCUMENT_KEY;
});

const SCRATCH_NAME = "citycare_drill_20261102_123456";

type FakeCalls = { identity: number; docSelect: number; ended: number };
function fakeClient(opts: { db?: string; row?: Record<string, unknown> | null; connectError?: boolean } = {}) {
  const calls: FakeCalls = { identity: 0, docSelect: 0, ended: 0 };
  const client: DrillClient = {
    async query(sql: string) {
      if (/current_database\(\)/.test(sql)) {
        calls.identity++;
        return { rows: [{ db: opts.db ?? SCRATCH_NAME }] };
      }
      if (/FROM "Document"/.test(sql)) {
        calls.docSelect++;
        return { rows: opts.row ? [opts.row] : [] };
      }
      return { rows: [] };
    },
    async end() {
      calls.ended++;
    },
  };
  const connect = opts.connectError
    ? (async () => {
        throw new Error("connect ECONNREFUSED (test)");
      })
    : (async () => client);
  return { connect, calls };
}

function makeRow(plain: Buffer) {
  const sealed = encryptBlob(plain); // the application's own AES-256-GCM
  return {
    checksumSha256: sealed.sha256,
    sizeBytes: plain.length,
    encryptionIv: sealed.iv,
    isDeleted: false,
    blobData: sealed.data,
    keyVersion: 1,
  };
}

describe("verify-document (drill gate 7 helper — final cleanup patch A89/F2)", () => {
  it("successful verification: application crypto decrypts, both anchors match, client closed", async () => {
    const plain = Buffer.from("%PDF-1.7 canary plaintext for the drill — not real PHI");
    const { connect, calls } = fakeClient({ row: makeRow(plain) });
    const v = await verifyDocument({ documentId: "11111111-1111-4111-8111-111111111111", url: "postgresql://x", connect });
    expect(v).toMatchObject({
      ok: true,
      found: true,
      checksumMatch: true,
      sizeMatch: true,
      plaintextBytes: plain.length,
      declaredBytes: plain.length,
      keyVersion: 1,
    });
    expect(v).not.toHaveProperty("errorClass"); // a clean pass carries no error class
    expect(calls).toEqual({ identity: 1, docSelect: 1, ended: 1 }); // identity gate ran, ONE doc SELECT, client closed
    expect(typeof v.ms).toBe("number");
  });

  it("document not found: safe class, no plaintext surface, client still closed", async () => {
    const { connect, calls } = fakeClient({ row: null });
    const v = await verifyDocument({ documentId: "22222222-2222-4222-8222-222222222222", url: "postgresql://x", connect });
    expect(v).toMatchObject({ ok: false, found: false, errorClass: "not_found" });
    expect(v).not.toHaveProperty("plaintextBytes"); // nothing was ever decrypted
    expect(calls).toEqual({ identity: 1, docSelect: 1, ended: 1 });
  });

  it("decryption failure (tampered ciphertext): decrypt_failed with no message body, client closed", async () => {
    const plain = Buffer.from("%PDF-1.7 tamper me");
    const row = makeRow(plain);
    const data = Buffer.from(row.blobData as Buffer);
    data[5] ^= 0xff; // flip one ciphertext byte → GCM auth tag mismatch
    row.blobData = data;
    const { connect, calls } = fakeClient({ row });
    const v = await verifyDocument({ documentId: "33333333-3333-4333-8333-333333333333", url: "postgresql://x", connect });
    expect(v).toMatchObject({ ok: false, found: true, errorClass: "decrypt_failed" });
    expect(v).not.toHaveProperty("checksumMatch"); // never claimed a match
    expect(calls).toEqual({ identity: 1, docSelect: 1, ended: 1 });
  });

  it("database connection failure: scratch_connect_failed, no crash, nothing to close", async () => {
    const { connect, calls } = fakeClient({ connectError: true });
    const v = await verifyDocument({ documentId: "44444444-4444-4444-8444-444444444444", url: "postgresql://dead", connect });
    expect(v).toMatchObject({ ok: false, found: false, errorClass: "scratch_connect_failed" });
    expect(calls).toEqual({ identity: 0, docSelect: 0, ended: 0 }); // connect never succeeded
  });

  it("cleanup after a NEGATIVE verification: client.end() completes before the verdict is returned (A89 regression)", async () => {
    // old shape: out() → process.exit() inside try/finally skipped client.end() on every
    // early-return verdict. The refactor must close the connection BEFORE returning.
    const plain = Buffer.from("%PDF-1.7 owner-deleted but bytes still present");
    const row = makeRow(plain);
    row.isDeleted = true; // tombstoned_anomaly — a negative verdict AFTER the SELECT
    const events: string[] = [];
    let ended = 0;
    const client: DrillClient = {
      async query(sql: string) {
        if (/current_database\(\)/.test(sql)) {
          events.push("identity");
          return { rows: [{ db: SCRATCH_NAME }] };
        }
        if (/FROM "Document"/.test(sql)) {
          events.push("docSelect");
          return { rows: [row] };
        }
        return { rows: [] };
      },
      async end() {
        ended++;
        events.push("end");
      },
    };
    const v = await verifyDocument({
      documentId: "55555555-5555-4555-8555-555555555555",
      url: "postgresql://x",
      connect: async () => client,
    });
    expect(v).toMatchObject({ ok: false, found: true, errorClass: "tombstoned_anomaly" });
    expect(ended).toBe(1);
    // the client is closed LAST — after the verdict logic, before the caller could exit
    expect(events).toEqual(["identity", "docSelect", "end"]);
  });

  it("F2 identity gate: a non-scratch database name refuses BEFORE any document SELECT", async () => {
    // pointing the helper at anything that is not a drill scratch (prod, old env, typo)
    // must refuse without ever running the document query
    for (const bad of ["citycare", "citycare_prod", "postgres", "citycare_drill_20261102_12345", "CITYCARE_DRILL_20261102_123456", "citycare_drill_20261102_123456_extra"]) {
      const { connect, calls } = fakeClient({ db: bad, row: makeRow(Buffer.from("%PDF")) });
      const v = await verifyDocument({ documentId: "66666666-6666-4666-8666-666666666666", url: "postgresql://x", connect });
      expect(v, bad).toMatchObject({ ok: false, found: false, errorClass: "unsafe_database_identity" });
      expect(calls.docSelect, bad).toBe(0); // the document SELECT never ran
      expect(calls.ended, bad).toBe(1); // and the connection was still closed
    }
    // the accepted shape
    expect(SCRATCH_DB_NAME_RE.test(SCRATCH_NAME)).toBe(true);
    expect(DOCUMENT_ID_RE.test("66666666-6666-4666-8666-666666666666")).toBe(true);
  });

  it("main(): usage + env refusals emit the JSON contract and return the exit code without exiting the process", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const savedUrl = process.env.SCRATCH_DATABASE_URL;
    try {
      const c1 = await main([]); // no id
      expect(c1).toBe(1);
      expect(JSON.parse(String(log.mock.calls.at(-1)?.[0]))).toMatchObject({ ok: false, found: false, errorClass: "usage" });

      delete process.env.SCRATCH_DATABASE_URL;
      const c2 = await main(["77777777-7777-4777-8777-777777777777"]);
      expect(c2).toBe(1);
      expect(JSON.parse(String(log.mock.calls.at(-1)?.[0]))).toMatchObject({ ok: false, found: false, errorClass: "env_missing_scratch_url" });
    } finally {
      if (savedUrl === undefined) delete process.env.SCRATCH_DATABASE_URL;
      else process.env.SCRATCH_DATABASE_URL = savedUrl;
      log.mockRestore();
    }
  });
});
