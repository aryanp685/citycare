# CityCare — Backup Configuration (NG-S09)

Environment reference for the daily encrypted backup. The behaviour is defined by
`web/src/lib/backup-core.mjs` (the single implementation shared by the Vercel cron route
`src/app/api/cron/backup/route.ts` and the CLI `scripts/backup.mjs`) — configuring an
environment means setting the right variables; there are no per-environment code paths.

---

## 1. Variables

| Variable | Required | Format | Meaning |
|---|---|---|---|
| `BACKUP_KEY` | **yes** (for create/verify/restore) | 32 bytes, base64 (44 chars) | AES-256-GCM key for all backup files. **Not** derived from `SESSION_SECRET`. Losing it loses every backup file. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| Store: **exactly one** of the two below | **yes** (for create) | — | The store is chosen by presence: `BLOB_READ_WRITE_TOKEN` wins over `BACKUP_DIR` (`storeKind()`) |
| `BLOB_READ_WRITE_TOKEN` | prod (Vercel) | Vercel blob token | Backups go to Vercel Blob with `access: "private"` (objects are never publicly readable). Lazy-imported — no dependency when unused |
| `BACKUP_DIR` | dev/local | absolute path | Backups written to a local directory; files created 0600 via tmp+fsync+rename. The sandbox/dev value: `/tmp/cc-backups` |
| `BACKUP_RETENTION_DAYS` | optional | int 1–365 (default **30**) | Files older than the window are pruned after each successful backup. The newest file is always kept; pruning never removes the last file |
| `CRON_SECRET` | **yes** (for the cron endpoint) | any high-entropy string | `Authorization: Bearer $CRON_SECRET`. Unset ⇒ endpoint 503 (refuses to run unauthenticated); mismatch ⇒ 401. The **same** secret guards `/api/cron/daily` |
| `DATABASE_URL` | **yes** | standard postgres URL | The database to back up. The cron uses a **dedicated** client (no 8 s pool `statement_timeout`), 15 s connect timeout, `timezone=UTC` pinned |
| `SCRYPT_N` | — (seed only) | power of two | unrelated to backups; listed because it appears in seed tooling |

Notes:

- `DATABASE_URL` for the backup client must reach the database **directly** (COPY works over
  a plain connection; the app pooler is not involved).
- The `"Backup"` metadata table (migration `0006_backup_metadata.sql`) must exist for
  attempt recording; it is created by the schema bootstrap (like every migration). If the
  table is missing (pre-0006 checkout), the backup still runs and the metadata write fails
  softly — the response/metadata gap is visible, the backup file is still produced.
- The backup response and metadata row contain **no secrets and no patient data**: size,
  sha256, store kind, object name, counts, duration, and `dbFingerprint`
  (`sha256(host:port/dbname)` — an identity hash, no credentials).

## 2. Store selection and behaviour

`storeKind()`: `BLOB_READ_WRITE_TOKEN` → `"blob"` (wins) → else `BACKUP_DIR` → `"local"` →
else **no store** → `createBackup` throws `BackupError("config")` and the attempt is recorded
failed. There is intentionally **no default**: a backup job must be explicitly pointed at a
store.

| Store | Where files land | Access | Pruning |
|---|---|---|---|
| `blob` (prod) | Vercel Blob bucket, `access: "private"` | only the app (token) and humans with the token | `listBackupFiles` + `pruneBackups` by mtime |
| `local` (dev) | `BACKUP_DIR/*.ccbk`, 0600 | filesystem | same, plus the operator can `rm` manually |

File names: `citycare-backup-YYYYMMDD-HHMMSS-<sha256-8hex>.ccbk` — UTC timestamp, all
lowercase (the store path regex is strict), suffix = first 8 hex of the file sha256 so a name
collision implies a content collision.

## 3. Schedules

| Platform | Mechanism | Schedule |
|---|---|---|
| **Vercel (production)** | `web/vercel.json` `crons` | `30 21 * * *` UTC = **02:30 IST daily** (offset from the `0 21 * * *` daily maintenance cron so a slow maintenance run never starves the backup) |
| Vercel function budget | `maxDuration: 30` (all `src/app/**`) | backup carries a **20 s soft limit** inside; on breach: no partial file, `errorClass='time_budget'` |
| Local / any machine | CLI | `node scripts/backup.mjs create` (cron it yourself: `30 21 * * *` works) |
| Cloudflare (if ever deployed there) | Workers cron + `WRANGLER` env | same CLI shape via a worker calling `createBackup`; the 10 ms-free-tier CPU budget does **not** fit scrypt-era workloads, so a paid plan is assumed — the backup path itself is storage/IO-bound, not CPU-bound |

The Vercel Hobby cron limit (≤ 2 crons per project at the time of writing) is exactly met:
`/api/cron/daily` + `/api/cron/backup`. Adding a third cron requires a plan upgrade — tracked
as a constraint, not silently worked around.

## 4. Observability

```
GET /api/health  →  { "backups": { "configured": true, "lastSuccessAt": "…", "ageMs": 12345, "stale": false } }
```

- `stale` = no successful backup within **30 h** (`BACKUP_STALE_MS`) — a warning fact; it does
  not flip the liveness status (a stale backup is an operational incident, not a down site).
- Full history (ok **and** failed attempts, with `errorClass`):

```sql
SELECT "createdAt", "status", "storeKind", "objectName", "fileSize", "sha256",
       "durationMs", "errorClass", "tableCount", "rowCounts"
FROM "Backup" ORDER BY "createdAt" DESC LIMIT 14;
```

- File-level integrity without restoring: `node scripts/backup.mjs verify <file>`.

## 5. Per-environment checklist

**Local / sandbox (this repo's dev loop)**

```
DATABASE_URL=postgresql://citycare:citycare@127.0.0.1:5432/citycare
BACKUP_DIR=/tmp/cc-backups
BACKUP_KEY=<fresh 32-byte b64>
```

`node scripts/backup.mjs create` → `node scripts/restore-drill.mjs <file> --scratch citycare_drill_…`
(the exact sequence the e2e suite runs in section 14).

**Vercel production (owner-side, after explicit approval)**

1. `BACKUP_KEY` — generate fresh, store as a Vercel **production** env var (not in git, not in
   the repo `.env*`).
2. `BLOB_READ_WRITE_TOKEN` — Vercel Blob token (the same store the app uses for documents;
   backups are separate objects, private access).
3. `CRON_SECRET` — already required by `/api/cron/daily`; the backup cron reuses it.
4. Verify the `"Backup"` table exists on production (migration 0006 applied by the deploy
   script's bootstrap step).
5. Wait for the first cron run (or trigger manually with the secret), confirm
   `/api/health` → `backups.lastSuccessAt` advances and `stale` clears.
6. Run the restore runbook §8 once (production-size drill) and record the measurements.

**What must never be configured:** a public/blob-readable backup store, a `BACKUP_KEY` shared
with any other service, a backup cron with an empty/weak `CRON_SECRET`, or a schedule that
makes the RPO window exceed 24 h.
