# CityCare — Restore Drill Report (NG-S09)

## Status: **Executed — success** (sandbox, 2026-11-02; re-executed ~08:38 UTC after the snapshot-transaction change — §6) · **document-level verification gate executed 2026-11-02 — §5** · **not yet executed in production**

The drill was **actually run** against the sandbox PostgreSQL (embedded PG 18.6, demo
dataset) — not simulated, not skipped. The same drill must be executed once against the
production Neon database (owner-side; `RESTORE_RUNBOOK.md` §8) before the RTO target can be
claimed for production. Until that run, the finding's status is **PARTIALLY IMPLEMENTED** —
code complete, sandbox-proven, production verification outstanding.

---

## 1. The executed drill (primary evidence)

| Item | Value |
|---|---|
| Date (UTC) | 2026-11-02 ~06:05 |
| Backup file | `citycare-backup-20261102-060520-c3f13680.ccbk` (196,013 B, `store: local`) |
| File sha256 | `c3f13680793fa34234c91d2d6dd9d461cc93e5d4de350c32e7df117dc524d47f` |
| Backup createdAt | 2026-11-02T06:05:20.354Z |
| Backup content | 36 tables, 765 rows, `schemaVersion: 0006_backup_metadata`, PG 18.6 |
| Scratch DB | `citycare_drill_20261102_060520` (freshly created, dropped after the drill) |
| Verify pair | `ramesh@demo.in` / demo password (demo environment) |
| **Exit code** | **0** |
| **Report status** | **`"status": "success"`, `"scratchDropped": true`** |

### Gates (all green)

| Gate | Result |
|---|---|
| `fileIntegrity` (decrypt + GCM + manifest walk; repo schema ≥ backup schema) | ok |
| `schema` (base + 6 migrations applied to scratch) | ok (9 files) |
| `dataCopied` (36 COPY sections, ONE transaction) | ok |
| **`ledgerVerify`** | **ok — `ledger_verify()` reports 0 breaks** |
| `rowCounts` (per-table counts vs manifest) | ok — 0 mismatches |
| `contentMatch` (re-COPY every table from scratch; **row multiset byte-identical**, order-independent — PostgreSQL doesn't guarantee COPY row order, A88) | ok — 0 mismatches |
| `login` (scrypt verify + record check) | ok — 1 patient, 3 encounters, 2 consents present |

### Measurements

| Phase | ms |
|---|---|
| `createdDbMs` (CREATE DATABASE scratch) | 36 |
| `schemaMs` (9 SQL files) | 98 |
| `dataMs` (36-table COPY FROM, one tx) | 41 |
| `contentMs` (36-table re-COPY compare) | 15 |
| **`restoreMs` (file → verified scratch DB, full RTO proxy)** | **609** |
| `backupAgeMs` (RPO at drill time; backup taken immediately prior) | 118 |

### Targets vs evidence

| Target | Verdict |
|---|---|
| RPO ≤ 24 h | **Met by design** — daily cron (21:30 UTC) bounds the loss window to ≤ ~24 h + run time; the drill measured backup *age* (118 ms, fresh backup), which exercises the measurement, not the bound |
| RTO ≤ 1 h | **Met and demonstrated** — 0.609 s end-to-end on the sandbox demo dataset (36 tables / ~192 KB). Production data size is larger; the target must be re-demonstrated there (runbook §8) before being quoted as a production guarantee |

## 2. Earlier failed attempts (the drill doing its job)

The drill is only evidence if it can fail. It failed — repeatedly — and each failure was a
real defect, all fixed and pinned by regression tests:

| Date (UTC) | Attempt | Outcome | Root cause (fixed) |
|---|---|---|---|
| 2026-11-01 | e2e-driven drill (pre-adapter) | fail | `node-pg` 8.23 has no COPY protocol support → `src/lib/pg-copy.mjs` adapter written |
| 2026-11-01 | drill with adapter v1 | hang | **thenable self-unwrap deadlock**: the query object defined `then` while its promise resolved with itself → promise machinery awaited the very promise being unwrapped (silent, forever). Fixed: no `then` methods; regression test pins the shape |
| 2026-11-01 | drill with adapter v2 | restore aborted server-side | **chunk aliasing**: `msg.chunk` is a `Buffer` view into pg-protocol's reusable parse buffer; held chunks were overwritten on later socket events → NUL bytes materialised inside UUIDs (the server rejected the COPY: `idle in transaction (aborted)` + ClientRead). Row counts and even the payload sha would NOT have caught this. Fixed: copy bytes in `handleCopyData`; regression test pins it |
| 2026-11-01 | same | hang on server error | **callback swallowing**: `pg.Query.handleError` calls `this.callback(err)` when a callback exists and never emits `'error'`; the adapter's no-op callback ate server errors. Fixed: construct without a callback; regression test pins it |
| 2026-11-02 | drill with all fixes | `login` gate false | **TDZ bug in the drill itself**: `verifyScrypt` (hoisted) referenced `const SCRYPT_MAXMEM` declared near the bottom of the module — "Cannot access before initialization", swallowed by the `catch` as "wrong password". Fixed: constant moved to module top. (The scrypt `maxmem` requirement itself — N=2^17 needs 128 MiB > Node's 32 MiB default — was a genuine earlier gap in the same function.) |
| 2026-11-02 | final | **success** | — |

Each of these bugs was independently invisible to the other checks (unit tests, row counts,
ledger) — the full-gate drill is what surfaces end-to-end correctness.

## 3. What this report does NOT claim

1. **No production claim.** The production Neon database has not been backed up or restored
   by this code (deployment is owner-side, pending explicit approval). All measurements above
   are sandbox measurements on the demo dataset.
2. **No RPO guarantee beyond the schedule.** The ≤ 24 h RPO holds only while the cron runs
   daily; a cron outage makes RPO grow unbounded until the next run (observable via
   `/api/health` → `backups.stale`).
3. **No legal compliance claim.** Backup/DR here is an operational control; DPDP/IT Act
   retention obligations (NMC 3 yr / DGHS 10 yr, ledger ≥ 1 yr post-erasure) are legal-hold
   decisions tracked separately (`LEGAL_COMPLIANCE.md`).
4. **Document-level recovery was a separate gap until 2026-11-02 and is now closed:** the
   document bytes are in the same dump (`DocumentBlob` section — verified row-by-row
   byte-identical),
   but *decrypting* a specific document from the restored scratch with the application's own
   crypto was defined in `DOCUMENT_STORAGE_DISASTER_RECOVERY.md` §6 step 4 and was
   **executed 2026-11-02** — see §5 of this report (drill gate `--verify-document <id>` +
   e2e §16d, happy and negative paths). A successful COPY/content test is still **not**
   presented as a document-decryption test; both kinds of evidence are now separate and both
   executed. (Corrected 2026-11-02: an earlier version of this note wrongly described the
   documents as a separate blob store outside this backup.)

## 4. Reproduction (exact commands)

```bash
cd web
# 1. take a backup
BACKUP_DIR=/tmp/cc-backups BACKUP_KEY=<32-byte b64> DATABASE_URL=postgresql://citycare:citycare@127.0.0.1:5432/citycare \
  node scripts/backup.mjs create
# 2. drill it
BACKUP_DIR=/tmp/cc-backups BACKUP_KEY=<32-byte b64> DATABASE_URL=postgresql://citycare:citycare@127.0.0.1:5432/citycare \
  node scripts/restore-drill.mjs /tmp/cc-backups/citycare-backup-20261102-060520-c3f13680.ccbk \
    --scratch citycare_drill_20261102_060520 \
    --verify-email ramesh@demo.in --verify-password city1234
# expected: exit 0, status success, all gates ok, scratchDropped true
```

The e2e suite runs the identical sequence (create → verify → drill → health fact) in
section 14 on every full run. Test counts change with the code state — every count in this
project is cited with **scope + date + commit**; see the reconciliation table in §7.
(Current: **e2e 286/286** including section 16, 2026-11-02, final-verification commit.)

## 5. Document-level verification drill — EXECUTED 2026-11-02 (owner-directed, finding 3)

The row-by-row byte-faithful `contentMatch` gate proves the *ciphertext* round-trips. It does not
prove that a document **decrypts** and matches its plaintext checksum. That is now a first
class drill gate:

- **`scripts/verify-document.ts`** (new, child-only plaintext holder): connects to the
  **scratch** DB URL only, selects ONE explicit `Document` + `DocumentBlob` row by id,
  decrypts with the **application's own implementation** (`decryptBlob` from
  `src/lib/storage.ts` — the same AES-256-GCM path downloads use), and compares
  `sha256(plaintext) = Document.checksumSha256` and `len(plaintext) = Document.sizeBytes`.
  It prints a **status-only JSON line** (`ok`, `found`, `checksumMatch`, `sizeMatch`,
  byte counts, key version, ms) — **never** content or PHI. Non-zero exit = verification
  problem (not a crash); the verdict is still parsed from stdout by the drill.
- **Drill gate 7** (`restore-drill.mjs --verify-document <documentId>`): optional, runs
  **after** gates 1–6, **before** the scratch is dropped; a negative verdict fails the drill
  (`status: "failed"`), and the scratch-drop cleanup runs on **every** path (the
  `DrillFail`/`createdScratch` rework — a verification failure can never leave an orphan
  scratch DB).
- **Not a public endpoint.** No route, no API, no way to fetch a document by id over HTTP
  from the scratch or the live DB through this path — it is an operator-run script against
  an isolated database that is dropped afterwards.
- **Executed evidence (e2e §16d, 2026-11-02, synthetic canary document — real upload →
  backup → drill):**
  | Check | Result |
  |---|---|
  | synthetic PDF uploaded (unique canary string; server sha256 = local sha256) | ✓ |
  | fresh backup taken after the upload | ✓ |
  | drill `--verify-document <id>` → `status: success`, `documentVerify.ok: true` | ✓ |
  | decrypted bytes match stored SHA-256 **and** declared byte length | ✓ (`checksumMatch`, `sizeMatch`) |
  | canary string **absent** from drill stdout **and** stderr (no plaintext leak) | ✓ |
  | scratch DB dropped after the verify gate ran | ✓ (`scratchDropped: true`) |
  | **negative path:** unknown document id ⇒ `found: false`, drill `status: failed`, scratch **still** dropped | ✓ |
  | synthetic document deleted afterwards (bytes removed, tombstone kept) | ✓ |

  Owner-run variant against a **real** document (rights request): same command, the patient's
  document id, in the restricted environment described in
  `DOCUMENT_STORAGE_DISASTER_RECOVERY.md` §6 — the result (match/mismatch) goes in the
  incident log, never the content.

## 6. Re-run after the snapshot-transaction change (2026-11-02, ~08:38 UTC)

The 2026-11-02 final-verification change moved the whole dump into one
`REPEATABLE READ READ ONLY` transaction. The drill was re-executed on a fresh backup to
confirm the pipeline is unaffected at the larger, post-e2e dataset size:

| Item | Value |
|---|---|
| Backup file | `citycare-backup-20261102-083824-2c0fa7d7.ccbk` (307,054 B, `store: local`) |
| File sha256 | `2c0fa7d77d192b05037ee531cc9cff2cbe81735aee0791388372c9200ae2bbb4` |
| Backup content | 36 tables, **1,079 rows**, `schemaVersion: 0006_backup_metadata`, PG 18.6 |
| Scratch DB | `citycare_drill_20261102_083851` (freshly created, dropped after the drill) |
| Gates | all ok — `ledger_verify()` 0 breaks, row counts 0 mismatches, content byte-identical row multiset |
| Measurements | createdDb 46 ms · schema 110 ms · data 44 ms · content 12 ms · **restoreMs 229** · backupAgeMs 27,886 |
| **Exit code / status** | **0 / `"status": "success"`, `"scratchDropped": true`** |

### Re-run after the A88 gate fix (2026-11-02, ~08:50 UTC)

The same-day e2e re-run surfaced **A88**: the old raw-text `contentMatch` gate went
false-red on a correct restore (identical row multiset + identical total bytes, only the
physical row order differed). After the gate was changed to the order-independent
row-multiset compare, the drill was re-executed on **the very backup file that had
false-positived**:

| Item | Value |
|---|---|
| Backup file | `citycare-backup-20261102-084114-8ec477b8.ccbk` (the A88 trigger; 36 tables, 1,302 rows) |
| Gates | all ok — incl. `contentMatch` ok (the check that false-positived before the fix) |
| Measurements | **restoreMs 704** (content compare now row-sorted; +475 ms vs the 08:38 run is the sort over the larger dataset) |
| Negative-path control | `--verify-document <unknown-uuid>` ⇒ `documentVerify {ok:false, found:false, errorClass:"not_found"}`, status `failed`, **exit 1**, scratch still dropped — failure paths stay loud and clean |
| **Exit code / status** | **0 / `"status": "success"`, `"scratchDropped": true`** |

## 7. Test-count reconciliation (2026-11-02, owner-directed finding 6)

The owner correctly flagged "257/257" vs "272/272" in different documents. Both were true —
for **different code states**. Every count now carries scope + date + commit:

| Suite | Count | Date (UTC) | Commit / code state | Where it was cited |
|---|---|---|---|---|
| e2e (full) | 241 | 2026-11-01 | `29706c9` (Batch-1 start, pre-WS-A) | Day 1 report §2 (baseline) |
| e2e (full) | **257** | 2026-11-01 | `e51e437` (**WS-A**: backup architecture + drill added; §14 = 16 checks) | **this report** (old §4), drill-time evidence |
| e2e (full) | **272** | 2026-11-02 | `4b76258` (WS-B retention + WS-C onboarding; §15 = 15 checks) → re-verified at `bdb37df` (correction audit, docs-only) | Day 1 report §2 |
| e2e (full) | **286** | 2026-11-02 | final-verification commit (this batch: §16 = 14 checks) | this report |
| vitest (unit) | 162 | 2026-11-01 | `29706c9` | Day 1 report §2 (baseline) |
| vitest (unit) | 213 | 2026-11-02 | `bdb37df` | Day 1 report §2 (corrected) |
| vitest (unit) | **216** (21 files) | 2026-11-02 | final-verification commit (+3: snapshot order, snapshot ROLLBACK, blob-`del` pin) | this report |

The discrepancy was a **citation freshness** problem (documents frozen at their write time),
not a contradictory measurement. Convention going forward: no bare counts — always
"suite, count, date, commit/scope".
