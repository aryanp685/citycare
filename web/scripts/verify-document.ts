// NG-S09 / document-level recovery drill (final technical verification, 2026-11-02, finding 3).
//
// Verifies ONE explicitly selected document on an ISOLATED drill scratch database:
//   1. fetch the Document row + its DocumentBlob bytes (ciphertext) from the SCRATCH DB;
//   2. decrypt with the ACTUAL application implementation (src/lib/storage.ts decryptBlob —
//      the same AES-256-GCM code the download endpoint runs, keyed by DOCUMENT_KEY or the
//      documented SESSION_SECRET derivation);
//   3. verify SHA-256(plaintext) === Document.checksumSha256 (the stored plaintext anchor);
//   4. verify plaintext byte length === Document.sizeBytes.
//
// SECURITY INVARIANTS (do not weaken):
//   * connects ONLY to the scratch DB (SCRATCH_DATABASE_URL env — never the app's
//     DATABASE_URL; the drill derives it from the exact scratch name it created);
//   * NEVER prints or logs plaintext or PHI: the output is booleans, byte counts, timings
//     and error CLASSES only. A GCM authentication failure reports "decrypt_failed" with
//     no message body.
//   * read-only: a single SELECT; no writes of any kind; the client is always closed.
//
// Usage:  node scripts/verify-document.ts <documentId>
// Env:    SCRATCH_DATABASE_URL (required), plus DOCUMENT_KEY or SESSION_SECRET.
// Exit:   0 verified ok · 1 verification failed · 2 usage/environment error.
import crypto from "node:crypto";
import pg from "pg";
import { loadLocalEnv } from "./read-env-local.mjs";
import { decryptBlob } from "../src/lib/storage.ts";

type Verdict = {
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

const docId: string = process.argv[2] ?? "";
const t0 = Date.now();
const out = (v: Verdict): never => {
  console.log(JSON.stringify({ ...v, ms: Date.now() - t0 }));
  process.exit(v.ok ? 0 : 1);
};

if (!docId || !/^[0-9a-fA-F-]{8,64}$/.test(docId)) out({ ok: false, found: false, errorClass: "usage", ms: 0 });
loadLocalEnv(["DOCUMENT_KEY", "SESSION_SECRET"]);
const url = process.env.SCRATCH_DATABASE_URL;
if (!url) out({ ok: false, found: false, errorClass: "env_missing_scratch_url", ms: Date.now() - t0 });

const client = new pg.Client({ connectionString: url, options: "-c timezone=UTC" });
try {
  await client.connect();
} catch {
  out({ ok: false, found: false, errorClass: "scratch_connect_failed", ms: Date.now() - t0 });
}
try {
  // ONE read: metadata + ciphertext together (the same join the download endpoint uses).
  const r = await client.query(
    `SELECT d."checksumSha256", d."sizeBytes", d."encryptionIv", d."isDeleted",
            b.data AS "blobData", b."keyVersion"
       FROM "Document" d
       JOIN "DocumentBlob" b ON b."documentId" = d.id
      WHERE d.id = $1`,
    [docId],
  );
  if (!r.rows.length) out({ ok: false, found: false, errorClass: "not_found", ms: Date.now() - t0 });
  const row = r.rows[0];
  // owner-deleted documents have their bytes removed immediately — a tombstone WITH bytes
  // is a reconciliation anomaly (DOCUMENT_STORAGE_DISASTER_RECOVERY.md §4 query c), not a
  // verifiable document: flag it, do not silently pass it
  if (row.isDeleted === true) out({ ok: false, found: true, errorClass: "tombstoned_anomaly", ms: Date.now() - t0 });

  let verdict: Verdict;
  try {
    // the application's own decryption (AES-256-GCM, tag = last 16 bytes of DocumentBlob.data)
    const plain = decryptBlob(Buffer.from(row.blobData), String(row.encryptionIv));
    const sha = crypto.createHash("sha256").update(plain).digest("hex");
    const checksumMatch = sha === String(row.checksumSha256);
    const sizeMatch = plain.length === Number(row.sizeBytes);
    verdict = {
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
    verdict = { ok: false, found: true, errorClass: "decrypt_failed", ms: Date.now() - t0 };
  }
  out(verdict);
} finally {
  await client.end().catch(() => null);
}
