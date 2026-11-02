# CityCare — Backup Configuration (NG-S09)

Environment reference for the daily encrypted backup. The behaviour is defined by
`web/src/lib/backup-core.mjs` (the single implementation shared by the Vercel cron route
`src/app/api/cron/backup/route.ts` and the CLI `scripts/backup.mjs`) — configuring an
environment means setting the right variables; there are no per-environment code paths.

---

## 1. Variables

| Variable | Required | Format | Meaning |
|---|---|---|---|
| `BACKUP_KEY` | **yes** (for create/verify/restore) | 32 bytes, base64 (44 chars) | AES-256-GCM key for all backup files. **Not** derived from `SESSION_SECRET`. Losing it loses every backup file. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Storage / access / escrow / rotation: **§6** |
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
| **Vercel (production)** | `web/vercel.json` `crons` | `30 21 * * *` UTC = 21:30 UTC = **03:00 IST daily** (the `0 21 * * *` daily maintenance cron is the 02:30 IST one; the 30-minute offset means a slow maintenance run never starves the backup) |
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
- **DB-down failure (the one the `"Backup"` row cannot cover):** the function log and the
  CLI stdout carry a stable marker — `[citycare-backup] FATAL` (constant
  `BACKUP_FATAL_MARKER`, identical in both callers) — plus a non-zero CLI exit. **v1 has no
  automated alerting on this marker** (the log line says so explicitly); monitoring the log
  or wiring a log-based alert is an owner-side action. Details + verified behaviour:
  `BACKUP_AND_DISASTER_RECOVERY.md` §4.1.

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

0. ✅ **DONE (2026-11-02, owner-approved final-verification batch; A85/D69 closed):** the
   audit found `@vercel/blob` was **not** in the manifest (the batch-1 report's "already a
   declared dependency" was wrong). It is now pinned in `web/package.json` +
   `web/package-lock.json` at **`@vercel/blob@^2.8.2`** (2.8.2 = latest stable at install
   time) — a real manifest dependency, not a temporary production-only install. Verified
   against the **installed** package (not the docs): v2.8.2 exports `put`, `get`, `list`,
   `del` — **no `delete` export** (Vercel renamed `del`→`delete` across v2 minors and 2.8.2
   ships only `del`). `pruneBackups` therefore resolves the name tolerantly
   (`blob.delete ?? blob.del`) and fails loudly if neither exists; a unit test
   (`backup-core.test.ts`, "prune tolerates the v2 del API") pins the installed shape.
   Build + full unit + full e2e re-run green on this change (2026-11-02). (Patient documents
   are **not** in this store — they are Postgres rows; see
   `DOCUMENT_STORAGE_DISASTER_RECOVERY.md`.)
1. `BACKUP_KEY` — generate fresh, store as a Vercel **production** env var (not in git, not in
   the repo `.env*`).
2. `BLOB_READ_WRITE_TOKEN` — Vercel Blob token (the store the **backup files** use in
   production; private access. Patient documents are **not** stored here — they are Postgres
   `DocumentBlob` rows; corrected 2026-11-02).
3. `CRON_SECRET` — already required by `/api/cron/daily`; the backup cron reuses it.
4. Verify the `"Backup"` table exists on production (migration 0006 applied by the deploy
   script's bootstrap step).
5. Wait for the first cron run (or trigger manually with the secret), confirm
   `/api/health` → `backups.lastSuccessAt` advances and `stale` clears.
6. Run the restore runbook §8 once (production-size drill) and record the measurements.

**What must never be configured:** a public/blob-readable backup store, a `BACKUP_KEY` shared
with any other service, a backup cron with an empty/weak `CRON_SECRET`, or a schedule that
makes the RPO window exceed 24 h.

## 6. Backup key management (v1)

This is the operational procedure for `BACKUP_KEY` (and, by the same discipline,
`DOCUMENT_KEY`, which protects the document bytes inside the database — see
`DOCUMENT_STORAGE_DISASTER_RECOVERY.md`). v1 is deliberately honest about what it can and
cannot do: there is **no automatic rotation** yet, so the storage and escrow rules below are
what actually keep the backups recoverable.

### 6.1 Secure storage

- **Production (Vercel):** `BACKUP_KEY` lives only in the Vercel project's production
  environment (marked *sensitive*, so it is masked in the dashboard and `vercel env pull`
  returns a placeholder). It is never in the repo, never in a build artifact, never in the
  `"Backup"` metadata table, and never in a log or error message.
- **Local / dev:** `web/.env.local` (gitignored). The value-free template `web/.env.example`
  carries a generation command, not a value.
- **Generation:** `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
  — 256 bits of OS CSPRNG entropy. Do not derive it from `SESSION_SECRET` (key separation).
- **No secret-sharing service is required**, but if the team adopts one (a password manager,
  Vault, etc.) the key should move there and Vercel should reference it; the invariant is
  "exactly one system of record for the key, and it is not the code."

### 6.2 Restricted access

- **Two actors only:** (1) the Vercel function running the backup cron (to *write* files),
  and (2) the human operator running `backup.mjs verify` / `restore-drill.mjs` (to *read*
  them). The application runtime, other functions, and all API routes never read it.
- **Store access is independent:** objects are `access:"private"` (blob) or `0600` (local).
  A leaked object *name* without the key yields ciphertext + a GCM tag — not plaintext.
- **Credential hygiene:** the Vercel project's team access is the effective access control
  for the key. Treat "can edit Vercel env" and "holds the backup key" as the same privilege.
  Audit who has it; remove departed members.

### 6.3 Recovery escrow

**Scope: this section applies verbatim to BOTH long-lived data keys — `BACKUP_KEY` and
`DOCUMENT_KEY`** (which protects every document byte, live and in backups — losing it is
total document loss, §6.4). **Status of the procedure itself: documented, not yet
executed.** The owner must actually perform each escrow (offline copy, second holder,
cross-check) — a written procedure is not an escrow. Until the owner executes it, both keys
have a single system of record (the environment) and no second holder.

A key that only lives in one cloud env var dies with that account's access. The escrow rule:

- **The key value is recorded offline, split, and held by a second person** who is not the
  day-to-day operator (e.g. a teammate or the supervising faculty member). Document *where*
  the escrow lives (which password manager / sealed envelope) in the team's incident runbook —
  **never the key itself** in a shared document.
- **Two-person knowledge:** recovery of a lost key requires both the system of record (Vercel)
  and the offline escrow to be cross-checkable, so a single compromised or forgotten login is
  not total loss.
- **Escrow is exercised:** when the key is ever rotated (see 6.5) or re-generated, the escrow
  copy is updated in the same operation, and the operator confirms the escrow holder has the
  new value. An un-exercised escrow is a paper escrow.

### 6.4 Key loss consequences (stated plainly)

- **Losing `BACKUP_KEY`** → every `.ccbk` file becomes undecryptable. The live database is
  fine; the RPO is not — you can no longer recover *any* point in time. This is a
  reportable-incident candidate (DPDP s.8(5) recoverability) and must follow the incident
  runbook, not be papered over.
- **Losing `DOCUMENT_KEY`** → every uploaded document byte (live and in backups) is
  undecryptable; the clinical *record* (notes, observations, consents — which live in plain
  DB rows) survives. See `DOCUMENT_STORAGE_DISASTER_RECOVERY.md` §7.
- **Mitigation is the escrow (6.3) + never rotating carelessly (6.5).** A "reset" that
  generates a new key while old files still need the old one silently orphans the old files.

### 6.5 Rotation planning (v2 — not yet implemented, tracked as D63)

Rotation is a **plan**, not a practice. Implementing it changes nothing about the v1 files
until the versioned format ships:

1. **Versioned header.** Add `keyVersion` (int) to the `CCB1` header. v1 files are
   `keyVersion: 1`. The restore tooling selects the key *by version*, so a file always states
   which key opens it.
2. **Re-key script (new).** For each retained file: read + decrypt under the current key,
   re-encrypt under the new key as `keyVersion: 2`, write under a version-stamped name. Old
   files are only removed after the *new* files verify.
3. **Grace period (how old backups stay recoverable).** During rotation, **both** keys are
   available (old key in env/escrow, new key in env). The restore tool reads a file's
   `keyVersion` and picks the matching key, so a v1 file and a v2 file can coexist and both
   restore. The old key is destroyed **only after** every file it protected has been
   re-keyed *and* the drill passes on a v2 file. This is what "old backups remain recoverable
   during rotation" means concretely.
4. **Drill after rotation.** Run `restore-drill.mjs` against a freshly re-keyed file before
   declaring the rotation complete (a re-key that corrupts a file is silent until you restore
   it).

**This correction batch deliberately did NOT rotate any key or re-encrypt any backup** —
there are no v2 files, and the v1 files remain the only recovery point.
