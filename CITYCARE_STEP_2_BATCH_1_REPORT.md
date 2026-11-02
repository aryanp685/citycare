# CityCare — Step 2 Batch 1 Report

**Date:** 2026-11-02 · **Branch:** `arena/f1f3a0ac-citycare` · **Commits:** `29706c9` (precheck) → `e51e437` (WS-A) → `77dd7aa` (WS-B) → `4b76258` (WS-C)
**Scope:** exactly the three workstreams from the 2026-11-01 brief — NG-S09 (P0 backup/DR), NG-S15 (P0 retention-sweep safety), NG-G01 (P2 onboarding docs). Non-goals respected (no UI/OCR/AI/ABDM/payments/microservices/Redis/new runtime dependencies; `pg` and the already-present Vercel Blob SDK are the only libraries touched — Blob is lazy-imported and was already a declared dependency for documents).

---

## 1. Status summary

| Finding | Implementation | Tests | Production verification | Final status |
|---|---|---|---|---|
| **NG-S09** (P0) — no database backup / DR | Daily encrypted backup (COPY-based logical dump in a self-verifying AES-256-GCM container), private store, bearer-protected cron (21:30 UTC), `"Backup"` metadata trail (ok **and** failed attempts), `/api/health` staleness fact, human-run **scratch-only** restore script, 4 ops docs | 38 new unit tests (backup-core 28 + pg-copy 10) + 16 new e2e checks (incl. a full create→verify→**drill** cycle over real Postgres) | **Not executed** — prod cron has never run; prod env vars (`BACKUP_KEY`, `BLOB_READ_WRITE_TOKEN`) not set (owner-side) | **PARTIALLY IMPLEMENTED** |
| **NG-S15** (P0) — demo sweep erases real users | `RETENTION_POLICY=demo\|internal\|pilot` fail-safe gate (`retention-core.mjs`): sweep runs **only** for an explicit, consistent `demo` declaration; real-data/missing/invalid/contradictory config ⇒ sweep off + loud warning; policy exposed safely on `/api/health` + cron; all disclosure copy states what *this* deployment does | 13 new unit tests (full policy matrix) + 15 new e2e checks (decision-level **and** behavioural: 10-day demo account erased end-to-end, fresh account survives, seed protected, no secret leak, notice matches) | Nothing to execute in prod (no prod-run criterion); **owner note:** prod demo must set `RETENTION_POLICY=demo` (until then sweep is off — visible in health) | **RESOLVED** |
| **NG-G01** (P2) — stale docs + missing `.env.example` | `web/.env.example` created (exact code-read var set, generation commands, no values) — after fixing the root cause (A84: `.gitignore .env*` made it un-trackable); 8 live docs synced (URL, counts, migrations, ranges); architecture doc re-measured | Mechanical template↔code cross-check (0 invented / 0 missing); all generation commands executed; **onboarding flow executed** (template → secrets → bootstrap → app healthy → login 200); committed spot-check list | N/A (docs) | **RESOLVED** |

## 2. Before / after (full gauntlet, same machine, embedded PG 18.6)

| Check | Before (2026-11-01, `29706c9`) | After (2026-11-02, `4b76258`) | Delta |
|---|---|---|---|
| Vitest (unit) | 162/162 | **213/213** | +51 (backup-core 28, pg-copy 10, retention-core 13) |
| E2E (HTTP, real DB) | 241/241 | **272/272** | +31 (16 backup/DR §14, 15 retention §15) |
| `tsc --noEmit` | 0 errors | 0 errors | — |
| ESLint | clean | clean | — |
| `next build` | OK | OK | — |
| Schema | 35 tables, migrations 0001–0005 | **36 tables** (`Backup`), migrations **0001–0006** | +1 migration |
| API routes | 54 | **55** (`cron/backup`) | +1 |

Every count change is explained by the tests added in this batch; no test was deleted, weakened or skipped, and no existing assertion was changed (the pre-existing L1 cron check and the L14-era backup checks were left untouched and still pass).

## 3. WS-A — backup architecture (NG-S09)

**Why app-managed:** production Neon Free has no PITR, autosuspends, and `pg_dump` is unavailable in the sandbox and in Vercel functions (no binary; pooler-hostile). The equivalent is a per-table `COPY TO/FROM` **logical dump** over a dedicated direct connection, wrapped in a versioned self-verifying container:

```
CCB1 magic | nonce(12) | AES-256-GCM( payload + manifest ) | tag(16)
payload  = per-table COPY text sections, FK-topological order
manifest = exact marker bytes + byte lengths of every section (no regex re-parsing)
```

- **Schedule:** `vercel.json` cron `30 21 * * *` UTC (02:30 IST) → `GET /api/cron/backup` (`Bearer $CRON_SECRET`; 503 unset / 401 mismatch, timing-safe). The Vercel Hobby 2-cron limit is exactly met (D65).
- **Store:** Vercel Blob `access:"private"` in production (`BLOB_READ_WRITE_TOKEN`), local 0600 dir in dev (`BACKUP_DIR`); neither set ⇒ refuses to run (visible). File names `citycare-backup-YYYYMMDD-HHMMSS-<sha8>.ccbk`, 20 s soft budget inside the 30 s function — breach ⇒ **no partial file**, `errorClass='time_budget'` (D64).
- **Observability:** every attempt (ok + failed) → `"Backup"` table (15 cols, JSONB row counts); `/api/health` → `backups {configured, lastSuccessAt, ageMs, stale(30 h)}`. No secrets, no PHI in any response/metadata row (sha256 + `dbFingerprint` = identity hash only).
- **Restore = human-run, scratch-only, all-gates:** `scripts/restore-drill.mjs` — scratch name **must** match `^citycare_drill_\d{8}_\d{6}$` (structurally cannot target a real DB), refuses an existing scratch, gates: file integrity → schema (base + 6 migrations) → 36-table single-tx COPY → **`ledger_verify() = 0`** → row counts → **content byte-identical (re-COPY compare)** → login/record check → scratch dropped. Always prints the JSON report (A81).
- **The pg 8.23 COPY gap** had to be bridged with a `Query` subclass adapter (`pg-copy.mjs`, D67) — its development surfaced **three real server/data bugs**, all fixed and regression-pinned: thenable self-unwrap deadlock (A77), pg-protocol chunk-aliasing corruption (A78 — NUL bytes inside UUIDs, invisible to row counts *and* the payload sha), callback error swallowing (A79).

### Executed restore drill (the P0 acceptance evidence)

`RESTORE_DRILL_REPORT.md` status: **Executed — success** (sandbox, 2026-11-02 ~06:05 UTC).

| Measurement | Value |
|---|---|
| File | `citycare-backup-20261102-060520-c3f13680.ccbk` (196,013 B; 36 tables / 765 rows; PG 18.6; schema `0006_backup_metadata`) |
| Result | exit 0, all 7 gates green, `ledger_verify() = 0 breaks`, content byte-identical, login ok (ramesh 1/3/2), scratch dropped |
| RTO (file → verified scratch DB) | **609 ms** (createDb 36 / schema 98 / data 41 / content 15) |
| RPO | design-bound ≤ ~24 h (daily cron); drill measured a fresh backup (age 118 ms) |

**Claim discipline:** RTO ≤ 1 h is *demonstrated on the sandbox demo dataset*; the ≤ 24 h RPO holds only while the cron runs (staleness observable). **Production RTO must be re-demonstrated on the real Neon DB (runbook §8) before being quoted as a production guarantee** — that is exactly why S09 is PARTIALLY IMPLEMENTED, not RESOLVED. The drill's earlier failed attempts (deadlock, corruption, swallowed errors, TDZ) are documented in the report — the drill demonstrably fails when it should.

## 4. WS-B — retention-sweep safety (NG-S15)

The daily cron previously erased every self-registered non-`@demo.in` account older than 7 days **unconditionally** — a pilot reusing this code would silently delete real patients on day 8. Now:

| `RETENTION_POLICY` | banner | sweep | reason |
|---|---|---|---|
| `demo` | on | **ON** | `ok` |
| `demo` | off | off | `contradictory_policy` + warning |
| `internal` / `pilot` | either | off | `policy_disables_sweep` (+ warning if banner on) |
| missing / empty / invalid | either | off | `missing_policy` / `invalid_policy` + warning |

- When disabled the cron executes **zero sweep SQL** (`enabled ? query : []`) — real-data survival is by construction, not by luck.
- `/api/health` + cron response expose the safe subset (`policy`/`enabled`/`reason`/`days`/`protectedDomain`); e2e secret-scans both bodies (A84-era leak check: no CRON/SESSION/BACKUP key ever appears).
- All five disclosure surfaces (demo banner, privacy §1/§6 + English i18n summary, terms, signup) now state what *this* deployment does; the signup line additionally became DEMO_MODE-gated (it previously claimed "Public demo" on **every** deployment).
- L2 discipline: no `PRIVACY_NOTICE_VERSION` bump — demo-branch wording is byte-identical (only deployed config); the new non-demo wording targets a never-deployed environment.

**Required test results (2026-11-02, real DB + real HTTP):** demo sweep works (10-day backdated account erased end-to-end: User `DELETED` + anonymised, hash `!`, Patient `[REDACTED]`; cron reports `demo/enabled/ok` + swept count) ✓ · real mode: 10-day account survives (decision matrix pinned: pilot/internal/missing/invalid/contradictory ⇒ disabled; route path is the single reviewed conditional) ✓ · missing config fails safe (off + warning) ✓ · health policy without secrets (safe fields + secret scan) ✓ · regression (fresh account survives, `@demo.in` seed untouched, ledger 0 breaks, pre-existing L1 check untouched and green, notice copy matches the armed sweep) ✓.

## 5. WS-C — onboarding (NG-G01)

- **Root cause (A84):** `web/.gitignore`'s `.env*` ignored `.env.example` itself — the template could never be tracked. Fixed with `!.env.example` (verified: template trackable, `.env.local` still ignored).
- **`web/.env.example`:** the exact var set the code reads (machine cross-check: 0 invented / 0 missing), generation commands inline, no real values; documents the new backup + retention vars.
- **Docs synced** (live docs only; dated historical reports/journal/audit evidence left intact): START_HERE, root README, ci.yml, DEPLOY_VERCEL, DEPLOY_SUPABASE, LEGAL_COMPLIANCE, web/README, CITYCARE_CURRENT_ARCHITECTURE (re-measured: 55 routes / 36 tables / 6 migrations / both crons). Committed spot-check list in the register.
- **Verified:** onboarding executed on this machine (template → generated secrets → bootstrap 11 users / 0 breaks → app healthy with honest minimal-env facts → demo login 200).

## 6. Trade-offs (logged in `web/DRAWBACKS_AND_BUGFIXES.md` — A77–A84, D63–D68)

| ID | Trade-off / drawback |
|---|---|
| D63 | `BACKUP_KEY` is a single long-lived key (v1, no rotation) — losing it loses every backup; rotation = re-key script (documented, not built) |
| D64 | 20 s backup budget inside the 30 s Vercel function — a large enough DB fails `time_budget` (safe: no partial file); current run ~40 ms (~500× headroom) |
| D65 | Hobby 2-cron limit exactly met — no headroom for a third job without a plan change |
| D66 | Blob document store is outside the DB backup (records are; attachments aren't) — separate track |
| D67 | `pg-copy.mjs` adapter leans on `pg-protocol` internals (version-pinned behaviour) — isolated to the backup path, invariants regression-pinned |
| D68 | The demo sweep is now opt-in: a demo that forgets `RETENTION_POLICY=demo` stops erasing (deliberate fail-safe; observable in `/api/health` + cron warning) |

## 7. External dependencies

- **None new.** `pg` (existing), Vercel Blob SDK (existing, lazy-imported), Node built-in `crypto`. No new npm packages, no new services.
- Owner-side prerequisites for production: `BACKUP_KEY`, `BLOB_READ_WRITE_TOKEN`, `RETENTION_POLICY=demo` (Vercel env), and the explicit deploy approval this brief requires.

## 8. Changed files (Batch 1 total: 41 files, +3365/−91, `29706c9..4b76258`)

**New (19):** `schema/migrations/0006_backup_metadata.sql` · `web/.env.example` · `web/docs/operations/{BACKUP_AND_DISASTER_RECOVERY,RESTORE_RUNBOOK,BACKUP_CONFIGURATION,RESTORE_DRILL_REPORT}.md` · `web/scripts/{backup,restore-drill,read-env-local}.mjs` · `web/src/app/api/cron/backup/route.ts` · `web/src/lib/{backup-core,pg-copy,retention-core}.{mjs,d.mts}` · `web/src/lib/__tests__/{backup-core,pg-copy,retention-core}.test.ts`
**Modified (22):** `web/vercel.json` (2nd cron) · `web/src/app/api/{health,cron/daily}/route.ts` · `web/src/lib/db.ts` (`nodeConnectionString`) · `web/src/lib/legal-i18n.ts` (`howLongBody`) · `web/src/{app/legal/privacy,app/legal/terms,app/signup}/page.tsx` · `web/src/components/demo-banner.tsx` · `web/scripts/e2e.mjs` (§14 backup/DR, §15 retention, D6 pre-booking cleanup) · `web/.gitignore` (`!.env.example`) · docs: `README.md`, `START_HERE.md`, `CITYCARE_CURRENT_ARCHITECTURE.md`, `CITYCARE_MASTER_GAP_REGISTER.md`, `.github/workflows/ci.yml`, `web/{README,FEATURES,LEGAL_COMPLIANCE,DEPLOY_VERCEL,DEPLOY_SUPABASE,DRAWBACKS_AND_BUGFIXES}.md`

## 9. Remaining blockers + owner-side deploy/verify instructions

Nothing in this batch blocks the owner from reviewing. For production (after explicit approval — **no deploy has been done and no prod env has been touched**):

1. **Deploy the branch** (merge to `main` per the git-linked Vercel project) — the `prebuild` hook applies migration 0006 automatically.
2. **Set production env vars:** `BACKUP_KEY` (fresh 32-byte b64, separate from `SESSION_SECRET`), `BLOB_READ_WRITE_TOKEN` (existing), `RETENTION_POLICY=demo`. (`DOCUMENT_KEY`/`ANCHOR_SIGNING_KEY` untouched — never rotate without intent.)
3. **First-run verification (S09):** wait for the 02:30 IST cron (or trigger with `CRON_SECRET`) → `/api/health` shows `backups.lastSuccessAt` advancing, `stale:false`; `"Backup"` table shows `status='ok'`.
4. **Production drill (S09 RTO):** run `RESTORE_RUNBOOK.md` §8 once against the production backup into a scratch DB; record `restoreMs` at production size in `RESTORE_DRILL_REPORT.md` → then S09 can move to RESOLVED.
5. **Confirm retention (S15):** `/api/health` → `retention:{policy:"demo",enabled:true}`; the 7-day demo sweep resumes automatically (it is off on the live instance **until** step 2 — the fail-safe working as designed).
6. **Onboarding (G01):** `cp web/.env.example web/.env.local` now works from a fresh clone (verified this batch).

**After this report: STOP.** Batch 2 / Phase 2 starts only on explicit owner approval.
