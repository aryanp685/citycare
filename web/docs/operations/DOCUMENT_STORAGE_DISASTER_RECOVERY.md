# CityCare — Document Storage Disaster Recovery (NG-S09 companion)

**Status (2026-11-02, final-verification update):** the database-level recovery path for
documents is **covered by the executed restore drill** (the `DocumentBlob` section restored
byte-identical row-for-row — order-independent compare, A88 — `ledger_verify() = 0` — see
`RESTORE_DRILL_REPORT.md`). The **dedicated
document-level recovery drill** (decrypt + checksum an actual document from a restored
scratch database with the application's own crypto) **was EXECUTED 2026-11-02** — drill
gate `--verify-document <id>` (`scripts/verify-document.ts`) + e2e §16d, happy and negative
paths, evidence in `RESTORE_DRILL_REPORT.md` §5. The automated execution used a **synthetic
canary document** (the only document an automated suite may decrypt — it contains no PHI);
the drill against a *real* patient document remains an owner-run action on request
(§6 step 4), not an automated one, by design.

**Factual basis (code, read 2026-11-02):** `src/lib/storage.ts`,
`src/app/api/patient/documents/route.ts`, `src/app/api/documents/[id]/route.ts`,
`schema/citycare_init.sql` (`Document`), `schema/migrations/0004` (`DocumentBlob`),
`src/lib/erasure.ts`. A correction: documents are **not** stored in Vercel Blob — they are in
Postgres. (Vercel Blob in production holds the **backup files**, which contain the encrypted
document bytes.)

---

## 1. How documents are stored (what a recovery must restore)

| Fact | Value |
|---|---|
| Object identifier | `Document.id` (UUID as text); `DocumentBlob.documentId` is a 1:1 primary key / FK to it |
| Where the bytes live | Postgres `DocumentBlob.data` (BYTEA) — **not** an external object store (`Document.storageKey` is the literal `'pg'`) |
| Encryption | AES-256-GCM: 12-byte nonce in `Document.encryptionIv` (base64), ciphertext + 16-byte auth tag in `DocumentBlob.data`, key = `DOCUMENT_KEY` (32-byte base64 env) or HKDF-derived from `SESSION_SECRET` when unset (`/api/health` reports which: `documentKey: "env" | "derived"`) |
| Plaintext integrity anchor | `Document.checksumSha256` = SHA-256 of the **plaintext** (stored, and served as `x-checksum-sha256` on download) |
| Rotation readiness | `DocumentBlob.keyVersion` (default 1, currently unused — v1 has no rotation) |
| Ownership / references | `Document.patientId` (owner), `encounterId`, `uploadedByDoc`, `uploadedByUserId` (guardian, F13); children: `LabResult.documentId`, `AiExtraction.documentId` (FK **RESTRICT** — children must be deleted before the parent) |
| Extracted text | `Document.ocrText` (plaintext clinical text, in the same DB, covered by the same backup) |
| Size limits | 3 MB/file, 30 MB/patient (enforced on upload over non-deleted rows) |
| Access | every endpoint session-required; download = 60 s signed HMAC link **bound to the document and the user** + session/role re-check at download time (patient = owner only; doctor = **live FULL_RECORD consent** re-verified; admin = denied). **There is no public document endpoint and none is planned here.** |

## 2. How documents are backed up

They are backed up **as part of the daily database backup** — `DocumentBlob` is one of the 36
tables in the `CCB1` container (FK-topological COPY dump). The bytes reach the backup store
**double-encrypted**: AES-256-GCM under `DOCUMENT_KEY` inside, then the whole container under
`BACKUP_KEY`. The store (Vercel Blob `access:"private"` in prod, local 0600 in dev) therefore
never holds plaintext, and a leaked object name without both keys yields nothing usable.
(✅ As of the 2026-11-02 final-verification batch the `@vercel/blob` dependency **is** in
the manifest — `@vercel/blob@^2.8.2` in `web/package.json` + lock; A85/D69 closed. Note for
maintainers: 2.8.2 exports `del`, not `delete` — `pruneBackups` resolves the name
tolerantly; a unit test pins the shape.)

- **RPO for documents = RPO for the database** (≤ ~24 h + run time; backup cron 21:30 UTC =
  03:00 IST).
- **What is NOT protected:** losing `DOCUMENT_KEY` makes every document byte undecryptable —
  live *and* in every backup (key-management failure, not a backup-schedule failure; see
  `BACKUP_CONFIGURATION.md` §6 for storage/escrow/rotation of both keys).

## 3. How object integrity is verified (three independent layers)

1. **Plaintext checksum (per file):** the uploader's plaintext SHA-256 is stored in
   `Document.checksumSha256`. Any consumer can verify a decrypted file against it.
2. **GCM authentication (per read):** `decryptBlob` fails on any bit-flip of ciphertext or
   tag — the download route returns `500 integrity_failure` and **does not serve** the bytes.
3. **Backup-level (per file and per table):** the `CCB1` container's GCM tag + manifest
   (`backup.mjs verify`) catch file-level tampering; the restore drill's `contentMatch` gate
   re-COPYs every table (including `DocumentBlob`) from the restored scratch DB and
   byte-compares against the manifest. The 2026-11-02 drill verified this green.

## 4. Reconciling database references with stored objects

Run these against the database you are recovering (or auditing). All must return **0 rows** on
a healthy system:

```sql
-- (a) LIVE document with no bytes (the real corruption case — should never happen:
--     row + bytes are inserted in ONE transaction)
SELECT d.id, d.title FROM "Document" d
  LEFT JOIN "DocumentBlob" b ON b."documentId" = d.id
 WHERE NOT d."isDeleted" AND b.data IS NULL;

-- (b) orphan bytes without a metadata row (FK prevents; belt-and-braces after a restore)
SELECT b."documentId" FROM "DocumentBlob" b
  LEFT JOIN "Document" d ON d.id = b."documentId" WHERE d.id IS NULL;

-- (c) owner-deleted document still holding bytes (delete removes bytes immediately)
SELECT d.id FROM "Document" d JOIN "DocumentBlob" b ON b."documentId" = d.id
 WHERE d."isDeleted";

-- (d) size drift: ciphertext length must equal plaintext size + 16-byte GCM tag
SELECT d.id, d."sizeBytes", length(b.data) AS stored FROM "Document" d
  JOIN "DocumentBlob" b ON b."documentId" = d.id
 WHERE length(b.data) <> d."sizeBytes" + 16;
```

A live document with no bytes is **recoverable from the newest backup that predates the
corruption** (procedure in §6, step 4). Queries (b)–(d) non-empty after a restore are
restore defects — stop and treat the scratch as untrustworthy.

## 5. How deleted or unavailable objects are handled

- **Owner-deleted** (`DELETE /api/documents/[id]`): the `Document` row is **tombstoned**
  (`isDeleted = true`, kept for the ledger story) and the `DocumentBlob` bytes are deleted
  **immediately** (not retained in any store, no soft-deleted copies). Ledger: `DELETE_DOC`.
  A tombstoned row without bytes is the **expected** state (reconciliation query (c)).
- **Erased patient** (`erasePatientData`): `LabResult`/`AiExtraction` children deleted first,
  then `DELETE FROM "Document" WHERE "patientId"=…` → `DocumentBlob` **cascades** (FK
  `ON DELETE CASCADE`). No document bytes of an erased patient exist anywhere in the system —
  backups cannot resurrect them either, because the bytes were gone from the source before
  the next backup ran. Ledger: `DATA_ERASED` (kept ≥ 1 yr post-erasure by policy).
- **Unavailable at download time** (missing row/blob): the download query joins
  `Document` + `DocumentBlob`, so a missing blob yields the same `404 not_found` as a missing
  row — no existence oracle, no partial bytes. Recovery is the incident path in §6.
- **Corrupted at read time** (GCM auth failure): the route refuses to serve
  (`500 integrity_failure`). The operator then checks the newest backup's copy of the section
  (`backup.mjs verify` + restore to scratch) — if the backup copy decrypts and matches
  `checksumSha256`, the live row is repaired from it (§6, step 4) and the incident is logged.

## 6. Restoration without exposing patient data

The same invariants as the database restore apply and are **stricter here** (PHI bytes):

1. **Scratch-only target.** Restore goes to `citycare_drill_YYYYMMDD_HHMMSS` (name regex
   enforced; existing name refused). There is **no restore endpoint and no way to restore
   into the live database** — the drill script is the only path.
2. **Double encryption in transit and at rest.** The file is `BACKUP_KEY`-sealed; the document
   bytes inside are additionally `DOCUMENT_KEY`-sealed. Neither key is in the file, the DB,
   or any log.
3. **Verification without plaintext exposure.** Gates 1–6 (file integrity, schema, COPY,
   `ledger_verify() = 0`, row counts, content byte-identical row multiset) operate on **ciphertext** —
   they prove fidelity without ever decrypting a document.
4. **Document-level check — EXECUTED 2026-11-02 as drill gate 7 (evidence:
   `RESTORE_DRILL_REPORT.md` §5).** The manual procedure below is now implemented as
   `scripts/restore-drill.mjs --verify-document <documentId>`: after gates 1–6, a child
   process (`scripts/verify-document.ts`) reads exactly ONE document's bytes from the
   scratch DB, decrypts them with the **application's own** `decryptBlob` (same AES-256-GCM
   path as downloads), and checks `sha256(plaintext) = Document.checksumSha256` and
   `len(plaintext) = Document.sizeBytes`. It prints **status only** (booleans, byte counts,
   key version, ms) — never content; the drill fails (`status: "failed"`) on a negative
   verdict and **still drops the scratch** (cleanup on every path). Executed 2026-11-02 with
   a synthetic canary document (e2e §16d): match on both checks, canary absent from all
   output, scratch dropped; negative path (unknown id) ⇒ `found: false`, scratch dropped.
   No endpoint was created — the check runs only as an operator script against the scratch
   DB, which is dropped afterwards.
   For a **real** patient document (rights request / incident), the operator runs the same
   command with the patient's id, in a restricted environment; the fallback manual form:

   ```
   SELECT b.data, d."encryptionIv", d."checksumSha256"
     FROM "Document" d JOIN "DocumentBlob" b ON b."documentId" = d.id
    WHERE d.id = '<documentId>';
   -- decrypt with DOCUMENT_KEY (aes-256-gcm, tag = last 16 bytes),
   -- assert sha256(plaintext) = checksumSha256 and byte length = sizeBytes.
   ```

   The document id is chosen by the patient (rights request) or by the incident — never a
   bulk scan of patient files. No endpoint is created on the scratch DB; no bytes leave the
   restricted environment; the check's result (match / mismatch) is recorded in the incident
   log, not the file contents.
5. **Scratch hygiene.** The scratch DB is dropped after verification (`scratchDropped: true`
   in the report). For a real incident, `--keep` is used only for the promotion window
   described in `RESTORE_RUNBOOK.md` §6, after which the same erasure/retention rules as §7
   apply to the promoted database.

## 7. Retention and erasure requirements preserved by restore

- A restored database is a **faithful state at the backup moment**: erased patients have no
  document rows (and never will — cascade + hard delete), owner-deleted documents are
  tombstone-only. Restore therefore **cannot** violate DPDP s.12 erasure or s.8(7) purpose
  limits that were already honoured before the backup.
- The **ledger** (kept ≥ 1 yr post-erasure; NMC 3 yr / DGHS 10 yr clinical records belong to
  the doctor's shell, not to us) is part of the same restore and chain-verifies with
  `ledger_verify() = 0` — so the restored DB's `UPLOAD_DOC` / `DELETE_DOC` / `DATA_ERASED`
  history is internally consistent with the document state.
- Statutory **doctor-authored** records are redacted-to-shell by erasure, not deleted — a
  restore reproduces exactly that state (the shells, not the prose).

## 8. What is NOT yet true (blockers + exact required actions)

1. ~~**Standalone document recovery drill: NOT EXECUTED.** …~~ **CLOSED 2026-11-02 (final
   technical verification, owner-approved code change):** `--verify-document <documentId>`
   exists in `restore-drill.mjs` (gate 7, `scripts/verify-document.ts`, §6 step 4) and the
   e2e section 16d executes it end-to-end with a synthetic canary document (upload → backup →
   drill → decrypt + checksum + no-plaintext-leak + scratch-dropped, plus the unknown-id
   negative path) — **green 2026-11-02** (e2e 286/286; evidence table in
   `RESTORE_DRILL_REPORT.md` §5). Document-level recovery is now "drilled end-to-end" for
   synthetic content; a real-document drill remains owner-run on request (rights/incident),
   which is the correct scope for PHI.
2. **`DOCUMENT_KEY` escrow: not yet performed** — apply the escrow discipline of
   `BACKUP_CONFIGURATION.md` §6 to `DOCUMENT_KEY` (same two-person, offline, exercised rule).
   Until then, loss of `DOCUMENT_KEY` is total document loss.
3. **Production execution: outstanding** (same owner-side steps as NG-S09 in the batch-1
   report: deploy, set env vars, first cron run, production-size drill — which automatically
   covers `DocumentBlob` at production size).
4. **Backup-store durability:** in production the `.ccbk` files (containing all document
   bytes) live in Vercel Blob; provider-side loss is outside app control. Owner decision if
   required: export the newest backup file to a second store periodically (manual, private —
   **no public export endpoint exists or is being built here**).
