# CityCare — Backup & Disaster Recovery (NG-S09)

**Status (2026-11-02):** implemented and **executed in the sandbox** — a real restore drill
against an isolated scratch database succeeded with `ledger_verify() = 0`, byte-identical
table content, and a verified login (see `RESTORE_DRILL_REPORT.md`). Production execution
(Vercel cron against the Neon database) is **owner-side** and has not been run; until then
the finding is **PARTIALLY IMPLEMENTED**, not RESOLVED.

This document describes *what* protects the data and *why*. Procedures live in
`RESTORE_RUNBOOK.md`; environment details in `BACKUP_CONFIGURATION.md`.

---

## 1. Why app-managed backups (and not the provider's)

Production is **Neon Free** (via Vercel): no point-in-time recovery, ~0.5 GB storage cap,
autosuspend, and logical-dump-only tooling. A single `DROP DATABASE`, a bad migration, or a
tenant-side error is unrecoverable from the provider alone. CityCare therefore takes its own
**daily encrypted logical backup**, stored **outside the database**, to a **private**
object store (Vercel Blob `access: "private"`, or a local directory in dev).

| Property | Value | Where |
|---|---|---|
| Frequency | daily, `30 21 * * *` UTC = 21:30 UTC = **03:00 IST** (next calendar day; 30 min after the `0 21 * * *` maintenance cron, which is the 02:30 IST one) | `web/vercel.json` → cron `/api/cron/backup` |
| Trigger auth | `Authorization: Bearer $CRON_SECRET` (unset ⇒ 503, mismatch ⇒ 401) | `src/app/api/cron/backup/route.ts` |
| Transport | PostgreSQL `COPY … TO STDOUT` (text), table-by-table in FK topological order | `src/lib/backup-core.mjs` (`createBackup`) |
| Encryption | AES-256-GCM, 12-byte nonce, 16-byte tag, keyed by `BACKUP_KEY` (32 B base64) | `encryptContainer` |
| Container | `CCB1` magic \| nonce \| ciphertext \| tag; inner = header JSON + per-table sections with a manifest of exact byte lengths (no pattern-based re-parsing) | `buildContainer` / `verifyContainer` |
| File name | `citycare-backup-YYYYMMDD-HHMMSS-<sha8>.ccbk` (UTC, all-lowercase) | `backupFileName` |
| Store | Vercel Blob **private** (prod) or `BACKUP_DIR` local 0600 (dev) — chosen by env, never public | `writeBackupFile` / `storeKind` |
| Retention | `BACKUP_RETENTION_DAYS` (default 30, clamped 1–365); newest always kept, never prunes to zero | `pruneBackups` |
| Failure observability | every attempt (ok **and** failed) is recorded in the `"Backup"` metadata table (`schema/migrations/0006_backup_metadata.sql`); `/api/health` surfaces `{configured, lastSuccessAt, ageMs, stale}` — stale = > 30 h | `recordBackupMeta`, `backupStaleness`, `api/health` |
| All-or-nothing | a 20 s soft budget inside the 30 s Vercel function; on breach **no partial file is written** and the attempt is recorded `status='failed', errorClass='time_budget'` | `createBackup` |

The backup endpoint is **read-only over the database**: it cannot restore, delete, or
overwrite anything. Restore exists only as a human-run script (`web/scripts/restore-drill.mjs`)
that can only target a scratch database whose name matches `^citycare_drill_\d{8}_\d{6}$`.

### What the backup covers

- **All 36 public tables** (schema is versioned separately — see restore; data is the
  payload), including the append-only **Ledger** tables and the **AuditLog**.
- Per-table row counts in the manifest and in the metadata row (JSONB `rowCounts`).
- A `dbFingerprint` = `sha256(host:port/dbname)` — an identity hash with **no credentials**.
- `schemaVersion` (highest migration stem in the checkout) and `pgVersion` in the header.

### What it does NOT cover (know these before you rely on it)

1. **Document bytes are covered (they live in the database) — the key is the real dependency.**
   Uploaded documents are **not** in an external blob store: the bytes sit in Postgres
   (`DocumentBlob.data`), AES-256-GCM encrypted under `DOCUMENT_KEY`, so the 36-table backup
   **includes them** (the 2026-11-02 drill verified the `DocumentBlob` section byte-identical).
   What the backup does NOT protect against: **losing `DOCUMENT_KEY`** — every document byte
   (live *and* in every backup) becomes undecryptable, records included. And the **dedicated
   document-level recovery drill** (decrypt + checksum a document from a restored scratch DB)
   has **not been executed** — the executed drill proves byte fidelity of the encrypted rows,
   not that a specific document decrypts and matches its plaintext checksum. The full procedure,
   integrity checks, reconciliation queries and the not-yet-executed drill are in
   `DOCUMENT_STORAGE_DISASTER_RECOVERY.md`. (Corrected 2026-11-02: an earlier draft of this
   section wrongly described documents as Vercel Blob objects outside the backup.)
2. **RPO is bounded by the daily schedule** (≤ ~24 h + run time). Changes made today can be
   lost until tomorrow's run. There is no continuous/WAL-level replication (Neon Free has
   no PITR).
3. The backup is a **point-in-time snapshot of the moment of the run**; in-flight writes are
   not included. `COPY TO` per table is not a single global transaction — table N+1 is
   captured slightly after table N. For this clinic workload (small, low-write) the skew is
   milliseconds and the consistency invariants that matter (ledger integrity, FK closure) are
   verified after restore, not assumed.
4. Backups are only as safe as `BACKUP_KEY`. It is a single long-lived key (v1, no rotation —
   tracked as a drawback); it must never be committed, logged, or placed in the database.

## 2. The pg COPY protocol — and why `src/lib/pg-copy.mjs` exists

`node-pg` 8.23 does **not** implement the wire COPY protocol: `Query.handleCopyData` is a
no-op (COPY TO data silently dropped) and `handleCopyInResponse` fails with *"No source
stream defined"*. So `pg-copy.mjs` subclasses `pg.Query` for both directions and wraps a
**dedicated** client (never the app pool — the pool pins `statement_timeout=8 s`, which a
large COPY exceeds, and a long dump must not hold a pooled connection):

```
client.query("COPY … TO STDOUT …")          → async-iterable of Buffer chunks
client.query("COPY … FROM STDIN …", [text]) → Promise settling on CommandComplete/error
anything else                                → delegated to the underlying pg client
```

Three hard-won invariants are documented in the module header and pinned by regression tests
(`src/lib/__tests__/pg-copy.test.ts`):

1. **No `then` method** on the query objects — a thenable whose promise resolves with the
   object itself deadlocks in the promise-resolution procedure (self-unwrap).
2. **Copy every CopyData chunk immediately** — `msg.chunk` is a `Buffer` *view* into
   pg-protocol's reusable parse buffer, which `mergeBuffer()` overwrites on the next socket
   event. Holding the view corrupts data (caught by the 2026-11-01 drill: NUL bytes inside
   UUIDs).
3. **Construct `pg.Query` without a callback** — `Query.handleError` calls
   `this.callback(err)` when a callback exists and never emits `'error'`; a no-op callback
   swallows server-side COPY errors and the promise hangs instead of rejecting.

## 3. RPO / RTO — measured, not assumed

From the **executed** sandbox drill (2026-11-02, PG 18.6, demo dataset 36 tables / 765 rows /
~192 KB backup):

| Metric | Target | Measured | How |
|---|---|---|---|
| RPO (data loss window) | ≤ 24 h | structurally ≤ ~24 h + run time (daily cron); drill measured backup age 0.1 s (fresh) | cron schedule + drill `backupAgeMs` |
| RTO (file → verified usable DB) | ≤ 1 h | **0.61 s** end-to-end (CREATE DB 36 ms + schema 98 ms + data COPY 41 ms + content verify 15 ms + verification) | drill `restoreMs` |

These numbers are from the **sandbox demo dataset**. On the production Neon database the
sizes differ (the file grows with data) and the *schedule* dominates RPO; the *measured*
RTO scales with database size and should be re-verified in production (owner-side, see
`RESTORE_RUNBOOK.md` §8). **Do not quote the 0.6 s as a production guarantee** — quote the
target (≤ 1 h) and the sandbox evidence.

## 4. Failure modes and how they are observed

| Failure | What happens | Where you see it |
|---|---|---|
| Cron secret unset | endpoint 503, job refuses to run | Vercel cron logs; `/api/health` → `backups.configured` / `stale` |
| DB connect failure | 500 `backup_failed_connect`, failure row recorded | `"Backup"` table `status='failed'`, `errorClass='connect'` |
| Time budget breach | 500 `backup_failed_time_budget`, **no partial file** | metadata row `errorClass='time_budget'` |
| Store write failure | 500 `backup_failed_store`, no file persisted | metadata row |
| Stale backup (>30 h) | `backups.stale=true` in health (warning fact, not a liveness flip) | `/api/health` |
| Backup file tampered/rotated | decrypt/tag fails or section manifest mismatch → `BackupError('verify')` | `backup.mjs verify` / drill gate 1 |

Every failed attempt is a **row**, never a silent gap: the metadata table is the audit trail
of backup health, and the health endpoint makes staleness visible without secrets.

## 5. Key management (v1 — full procedure in `BACKUP_CONFIGURATION.md` §6)

Security facts (the *how* is in the configuration doc):

- `BACKUP_KEY` (32-byte base64) is the **only** key needed to read backups. Losing it loses
  **all** backup files (the files are useless without it; the key is useless without the
  files). The live database is unaffected — but the RPO becomes meaningless: no point in time
  before the next successful backup-and-key-escrow-recovery is recoverable at all.
- **Key separation**: it is not derived from (or identical to) `SESSION_SECRET`, `CRON_SECRET`
  or `DOCUMENT_KEY` — a session-key leak must not expose backups, and vice versa.
- **Access surface**: exactly two actors ever see the key — the Vercel function that runs the
  backup cron (to create files) and the human operator running `backup.mjs verify` /
  `restore-drill.mjs` (to read them). The rest of the app never reads it. Store objects are
  private, so a leaked *object name* without the key is useless.
- **Rotation is not implemented (v1)** — D63. Until the versioned re-key procedure exists
  (header `keyVersion` + re-encrypt retained files + grace period where both keys work), a
  "rotation" means **every old file is lost**. That is why rotation is documented as a plan,
  not a practice — and why the escrow below matters.
- Storage, restricted access, recovery escrow and the rotation plan (incl. how old backups
  stay recoverable during a future rotation) are specified in
  `BACKUP_CONFIGURATION.md` §6. **Never** commit, log, or store the key in the database; the
  backup response and metadata carry only size, sha256, counts and the db fingerprint.

## 6. Non-goals (deliberately not built)

No multi-region replication, no continuous WAL shipping, no database-level HA beyond what
Neon provides, no *separate* document backup (the document bytes are inside the database —
`DocumentBlob` — and are covered by the DB backup; see `DOCUMENT_STORAGE_DISASTER_RECOVERY.md`),
no automated production restore (restore is human-run by design — a failed automated restore
into the live database is worse than none).
