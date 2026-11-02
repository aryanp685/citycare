# CityCare — Restore Drill Report (NG-S09)

## Status: **Executed — success** (sandbox, 2026-11-02) · **not yet executed in production**

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
| `contentMatch` (re-COPY every table from scratch, byte-compare vs manifest) | ok — 0 mismatches |
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
4. **Document-level recovery is out of scope** of this drill: the document bytes are in the
   same dump (`DocumentBlob` section — verified byte-identical), but *decrypting* a specific
   document from the restored scratch is defined in `DOCUMENT_STORAGE_DISASTER_RECOVERY.md`
   §6 and has **not yet been executed**. (Corrected 2026-11-02: an earlier version of this
   note wrongly described the documents as a separate blob store outside this backup.)

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
section 14 on every full run: **257/257 passed** on 2026-11-02 (16 of the checks are the
backup/DR checks).
