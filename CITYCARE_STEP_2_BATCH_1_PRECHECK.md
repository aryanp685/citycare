# CityCare — Step 2 Batch 1 Precheck

**Date:** 2026-11-01 · **Branch:** `arena/f1f3a0ac-citycare` @ `9c50e63` (PR #6 open, unmerged) · **Baseline snapshot:** `main@9212ee4`

This precheck was run **before touching any code** in Batch 1, per the brief: inspect git state, DB provider, cron, erasure/anonymisation/ledger paths, migrations; re-run the full baseline gauntlet against the current checkout; write this doc; stop on anything unexpected.

## 1. Git / working-tree state

- Working tree **clean** at `9c50e63`; matches remote tip of `arena/f1f3a0ac-citycare` (verified file-by-file after the 8th sandbox reset; no unexplained changes, no conflicting user changes).
- `main` still at `9212ee4`. PR #6 carries all Step-1 + consolidation docs. Batch-1 commits ride the same branch.
- No tracked file was modified between `9212ee4` and `9c50e63` except the 11 Step-1/consolidation docs (audit, register, reconciliation, dependency map, scorecard, recommendation).

## 2. Database & hosting

| | Sandbox | Production |
|---|---|---|
| Engine | PostgreSQL 18.6 (embedded, `@embedded-postgres/linux-x64` binaries, data in `/home/user/pgbox/data`) | **Neon Free** (Singapore `sin1`), owner-side credentials only |
| Connection | `citycare:citycare@127.0.0.1:5432/citycare` | via `schema/.env` (1 line, gitignored, never committed) + Vercel env |
| Runtime access | full (psql-equivalent via node `pg`) | **none from sandbox** — no external egress to `*.vercel.app` / Neon pooler |
| Serverless | `next start` :3000 (0.0.0.0) | Vercel Hobby, Root Dir `web`, cron "0 21 * * *" |

Consequences (govern the whole batch):
- **Production verification is impossible from the sandbox** → any acceptance criterion that needs live prod evidence can end at **PARTIALLY IMPLEMENTED** at best (brief rule 7).
- Backup **production execution stays owner-side** (real backups of the prod DB cannot be created from the sandbox; the sandbox drill uses the sandbox DB on an isolated scratch DB).
- Neon Free: no PITR, autosuspend, ~0.5 GB cap → app-managed daily encrypted dumps are the right mechanism; provider comparison is documented in `web/docs/operations/BACKUP_CONFIGURATION.md`.

## 3. Schema / migrations / ledger facts (code-verified)

- Base schema = `schema/citycare_init.sql` + `schema/sql/constraints.sql` + `schema/sql/ledger.sql` (per `web/scripts/db-bootstrap.sh` / `db-bootstrap-node.mjs`), then migrations `schema/migrations/0001…0005`. Migration discovery is a **glob of `schema/migrations/*.sql` sorted** (`db-bootstrap-node.mjs:56-58`) → a new `0006_*.sql` is picked up automatically by local bootstrap, the prebuild hook, and Vercel deploys.
- Prebuild hook (`web/scripts/prebuild-schema-sync.mjs`, A76 2026-11-01): when `DATABASE_URL` is set (Vercel), every build runs the full idempotent bootstrap + assertions — schema and code move together.
- Live schema in the sandbox (fresh rebuild 2026-11-01 after a partial-apply incident): **35 tables, 2 ledger functions, 1 user trigger, 1 `one_active_consent` index; `ledger_verify()` → no breaks**.
- Ledger: `ledger_append()` / `ledger_verify()` are **plain functions** (`schema/sql/ledger.sql:38,82`), not table triggers — the only trigger in the schema is `audit_no_update` (`constraints.sql:63`, BEFORE UPDATE). Restore via SQL COPY does not fire UPDATE triggers, and the ledger chain is restored byte-identical.
- Erasure: `web/src/lib/erasure.ts` — `erasePatientData` (revoke consents → delete clinical rows → redact Encounter/Prescription/Notification/Patient → `anonymiseUser`; audit ledger rows **survive**) and `anonymiseDoctor`. Both are idempotent and append-only-safe.
- `pg` 8.23.0 `Client` has **no** `dump()`/`restore()` methods (verified at runtime) and there is no `pg_dump`/`pg_restore` binary in the sandbox or on Vercel serverless → **backup mechanics = app-managed logical dump**: schema rebuilt from the repo SQL files (source-controlled, drift-guarded by the prebuild), data captured with the SQL `COPY` protocol over node `pg`. Full design + provider comparison in `web/docs/operations/BACKUP_CONFIGURATION.md`.

## 4. Env surface (verified against all consumers 2026-11-01)

Code reads exactly: `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `SESSION_SECRET` (≥32, required), `CRON_SECRET`, `DEMO_RETENTION_DAYS` (default 7, clamp 1–365), `NEXT_PUBLIC_DEMO_MODE`, `NEXT_PUBLIC_GRIEVANCE_OFFICER`, `NEXT_PUBLIC_GRIEVANCE_EMAIL`, `ANCHOR_SIGNING_KEY` (Ed25519 PKCS8 b64), `ANCHOR_OTS`, `RESEND_API_KEY`, `EMAIL_FROM`, `DOCUMENT_KEY` (32-B b64), `process.env.TZ`. **There is no `TZ_POLICY` in code** (it only exists in the old onboarding narrative → fixed under NG-G01).

`web/.env.example` is **absent** (NG-G01). Fresh sandbox keys (SESSION_SECRET/CRON_SECRET/DOCUMENT_KEY/ANCHOR_SIGNING_KEY) generated 2026-11-01; `.env.local` is gitignored (`.gitignore:34 .env*`).

## 5. Baseline gauntlet (re-run today against the current checkout — not assumed)

| Check | Result | Recorded Step-1 baseline |
|---|---|---|
| `npx vitest run` | **162 passed, 0 failed** | 162/162 ✓ |
| `npx tsc --noEmit` | clean | clean ✓ |
| `npm run lint` (ESLint 9 flat, Next core-web-vitals) | clean | clean ✓ |
| `NODE_OPTIONS=--max-old-space-size=1150 npx next build` | clean (BUILD_ID present) | clean ✓ |
| `node scripts/e2e.mjs` (single fresh run, reseeded, server :3000) | **241 passed, 0 failed** | 241/241 ✓ |

**No drift.** No reconciliation needed. (e2e counts will grow as this batch adds tests; every change is explained in the report.)

## 6. Cron / safety surfaces relevant to this batch

- `/api/cron/daily` (Bearer `CRON_SECRET`, timing-safe; unset secret → 503): demo retention sweep (non-seed, older than `DEMO_RETENTION_DAYS`, excludes `demo.in` seed domain, LIMIT 200, 20 s budget) + D13 anchor + D49 handover reminders + housekeeping. Response includes `retention{days, protectedDomain, …, swept}` — **e2e L1 pins both `retention.days` integer and `protectedDomain==="demo.in"`** (`web/scripts/e2e.mjs:528`).
- Health route (`/api/health`, public) already exposes a **no-secrets `config{documentKey, anchorSigning, emailDelivery}`** pattern — retention/backup facts extend this same pattern.
- `vercel.json`: all functions `maxDuration: 30` (backup duration ceiling — documented), cron `0 21 * * *`.

## 7. Stop-condition check (brief rule 10)

- Unexpected working-tree changes: **none**.
- Missing prod DB access: confirmed (by design) → prod-touching acceptance criteria capped at PARTIALLY IMPLEMENTED; sandbox drill is a real execution on an isolated scratch DB.
- Backup could overwrite/expose prod data: **no** — backup is read-only over the DB, writes only to a new private store path; restore targets a brand-new scratch DB and is never pointed at the live DB by any code path.
- Provider-native backup undeterminable: determined — Neon Free has no PITR/retention (documented in BACKUP_CONFIGURATION.md).
- Retention conflicts with legal/contractual requirements: **none introduced** — this batch only makes the existing demo sweep *explicitly gated*; no legal retention period is changed, no notice version is bumped, no user-facing policy text changes.

**Precheck verdict: GO for Batch 1** — WS-A (NG-S09 backup/DR) → WS-B (NG-S15 retention-sweep safety) → WS-C (NG-G01 docs/env hygiene), in that order, per workstream: explain → files → smallest solution → targeted tests → regression → security diff review → docs → register update → commit+push.
