# CityCare — Day 1 Report (Step 2 Batch 1) — includes post-implementation correction audit of 2026-11-02

**Date:** 2026-11-02 · **Branch:** `arena/f1f3a0ac-citycare` · **Commits:** `29706c9` (precheck) → `e51e437` (WS-A) → `77dd7aa` (WS-B) → `4b76258` (WS-C)
**Scope:** exactly the three workstreams from the 2026-11-01 brief — NG-S09 (P0 backup/DR), NG-S15 (P0 retention-sweep safety), NG-G01 (P2 onboarding docs). Non-goals respected (no UI/OCR/AI/ABDM/payments/microservices/Redis/new runtime dependencies — corrected 2026-11-02: the Vercel Blob SDK is lazy-imported by `backup-core.mjs` for the **backup file store** but was **not** declared in the manifest, finding 6/A85; the patient-document bytes live in Postgres `DocumentBlob`, not in Blob — finding 2; both details in §10).

**Post-implementation correction audit (2026-11-02):** this report was audited the day after delivery per owner review. All five owner findings were corrected, plus one self-discovered issue (missing `@vercel/blob` declaration) — see §10 for what changed and the honest status of each.

---

## 1. Status summary

| Finding | Implementation | Tests | Production verification | Final status |
|---|---|---|---|---|
| **NG-S09** (P0) — no database backup / DR | Daily encrypted backup (COPY-based logical dump in a self-verifying AES-256-GCM container), private store, bearer-protected cron (21:30 UTC), `"Backup"` metadata trail (ok **and** failed attempts), `/api/health` staleness fact, human-run **scratch-only** restore script, 4 ops docs | 38 new unit tests (backup-core 28 + pg-copy 10) + 16 new e2e checks (incl. a full create→verify→**drill** cycle over real Postgres) | **Not executed** — prod cron has never run; prod env vars (`BACKUP_KEY`, `BLOB_READ_WRITE_TOKEN`) not set (owner-side) | **PARTIALLY IMPLEMENTED** |
| **NG-S15** (P0) — demo sweep erases real users | `RETENTION_POLICY=demo\|internal\|pilot` fail-safe gate (`retention-core.mjs`): sweep runs **only** for an explicit, consistent `demo` declaration; real-data/missing/invalid/contradictory config ⇒ sweep off + loud warning; policy exposed safely on `/api/health` + cron; all disclosure copy states what *this* deployment does | **Code-level:** 13 new unit tests (full policy matrix) + 15 new e2e checks (decision-level **and** behavioural: 10-day demo account erased end-to-end, fresh account survives, seed protected, no secret leak, notice matches) | **Deployment-level: NOT verified** — the production env vars (esp. `RETENTION_POLICY` on the instance that will serve pilot users) and the actual pilot deployment are unverified; **owner note:** prod demo must set `RETENTION_POLICY=demo`, a pilot instance `RETENTION_POLICY=pilot` (unset ⇒ sweep off + warning) | **PARTIALLY IMPLEMENTED — OWNER VERIFICATION PENDING** (corrected from RESOLVED, 2026-11-02: code complete and locally proven ≠ deployed and verified; owner criterion — no RESOLVED until production env + pilot deployment confirmed) |
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

Every count change is explained by the tests added in this batch; no test was deleted, weakened or skipped, and no existing assertion was changed (the pre-existing L1 cron check and the L14-era backup checks were left untouched and still pass). §2 records the state at `4b76258`; the final-verification batch (§11, same day) moved the suites to **vitest 216/216 + e2e 286/286** — full count reconciliation with scope + date + commit in `RESTORE_DRILL_REPORT.md` §7.

## 3. WS-A — backup architecture (NG-S09)

**Why app-managed:** production Neon Free has no PITR, autosuspends, and `pg_dump` is unavailable in the sandbox and in Vercel functions (no binary; pooler-hostile). The equivalent is a per-table `COPY TO/FROM` **logical dump** over a dedicated direct connection, wrapped in a versioned self-verifying container:

```
CCB1 magic | nonce(12) | AES-256-GCM( payload + manifest ) | tag(16)
payload  = per-table COPY text sections, FK-topological order
manifest = exact marker bytes + byte lengths of every section (no regex re-parsing)
```

- **Schedule:** `vercel.json` cron `30 21 * * *` UTC = 21:30 UTC = **03:00 IST** (the `0 21 * * *` maintenance cron is the 02:30 IST one) → `GET /api/cron/backup` (`Bearer $CRON_SECRET`; 503 unset / 401 mismatch, timing-safe). The Vercel Hobby 2-cron limit is exactly met (D65).
- **Store:** Vercel Blob `access:"private"` in production (`BLOB_READ_WRITE_TOKEN`), local 0600 dir in dev (`BACKUP_DIR`); neither set ⇒ refuses to run (visible). File names `citycare-backup-YYYYMMDD-HHMMSS-<sha8>.ccbk`, 20 s soft budget inside the 30 s function — breach ⇒ **no partial file**, `errorClass='time_budget'` (D64).
- **Observability:** every attempt (ok + failed) → `"Backup"` table (15 cols, JSONB row counts); `/api/health` → `backups {configured, lastSuccessAt, ageMs, stale(30 h)}`. No secrets, no PHI in any response/metadata row (sha256 + `dbFingerprint` = identity hash only).
- **Restore = human-run, scratch-only, all-gates:** `scripts/restore-drill.mjs` — scratch name **must** match `^citycare_drill_\d{8}_\d{6}$` (structurally cannot target a real DB), refuses an existing scratch, gates: file integrity → schema (base + 6 migrations) → 36-table single-tx COPY → **`ledger_verify() = 0`** → row counts → **content byte-identical (re-COPY compare)** → login/record check → scratch dropped. Always prints the JSON report (A81).
- **The pg 8.23 COPY gap** had to be bridged with a `Query` subclass adapter (`pg-copy.mjs`, D67) — its development surfaced **three real server/data bugs**, all fixed and regression-pinned: thenable self-unwrap deadlock (A77), pg-protocol chunk-aliasing corruption (A78 — NUL bytes inside UUIDs, invisible to row counts *and* the payload sha), callback error swallowing (A79).

### Executed restore drill (the P0 acceptance evidence)

`RESTORE_DRILL_REPORT.md` status: **Executed — success** (sandbox, 2026-11-02 ~06:05 UTC).

| Measurement | Value |
|---|---|
| File | `citycare-backup-20261102-060520-c3f13680.ccbk` (196,013 B; 36 tables / 765 rows; PG 18.6; schema `0006_backup_metadata`) |
| Result | exit 0, all 7 gates green, `ledger_verify() = 0 breaks`, content byte-identical row multiset (order-independent — A88), login ok (ramesh 1/3/2), scratch dropped |
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
| D66 | **(corrected 2026-11-02)** document bytes are *in* the DB (`DocumentBlob`) and *in* the backup — the real gap is the not-yet-executed document-level recovery drill + `DOCUMENT_KEY` escrow; runbook: `web/docs/operations/DOCUMENT_STORAGE_DISASTER_RECOVERY.md` |
| D67 | `pg-copy.mjs` adapter leans on `pg-protocol` internals (version-pinned behaviour) — isolated to the backup path, invariants regression-pinned |
| D68 | The demo sweep is now opt-in: a demo that forgets `RETENTION_POLICY=demo` stops erasing (deliberate fail-safe; observable in `/api/health` + cron warning) |

## 7. External dependencies

- **(corrected 2026-11-02, A85)** the batch-1 text here claimed the Vercel Blob SDK was
  "existing, lazy-imported" — **false on the "declared" part**: `@vercel/blob` is **not** in
  `web/package.json` / `package-lock.json` / `node_modules`; only `backup-core.mjs` imports
  it (dynamically, for the **backup file store** — patient documents are Postgres rows, not
  blob objects). Consequence: on Vercel the blob store fails **loudly** until
  `npm i @vercel/blob` is run (see §10 finding 6) — no partial files, metadata row records
  the failure, `backups.stale:true` is visible. Local store (sandbox) unaffected.
- `pg` (existing) and Node built-in `crypto` are the other runtime dependencies touched. No
  **new** packages were added in this batch; the one-line `@vercel/blob` addition is an
  **owner-approved prerequisite for production** (exact command in `BACKUP_CONFIGURATION.md`
  prod prerequisite 0).
- Owner-side prerequisites for production: **`@vercel/blob` installed + rebuilt**, `BACKUP_KEY`, `BLOB_READ_WRITE_TOKEN`, `RETENTION_POLICY=demo` (Vercel env), and the explicit deploy approval this brief requires.

## 8. Changed files (Batch 1 total: 41 files, +3365/−91, `29706c9..4b76258`)

**New (19):** `schema/migrations/0006_backup_metadata.sql` · `web/.env.example` · `web/docs/operations/{BACKUP_AND_DISASTER_RECOVERY,RESTORE_RUNBOOK,BACKUP_CONFIGURATION,RESTORE_DRILL_REPORT}.md` · `web/scripts/{backup,restore-drill,read-env-local}.mjs` · `web/src/app/api/cron/backup/route.ts` · `web/src/lib/{backup-core,pg-copy,retention-core}.{mjs,d.mts}` · `web/src/lib/__tests__/{backup-core,pg-copy,retention-core}.test.ts`
**Modified (22):** `web/vercel.json` (2nd cron) · `web/src/app/api/{health,cron/daily}/route.ts` · `web/src/lib/db.ts` (`nodeConnectionString`) · `web/src/lib/legal-i18n.ts` (`howLongBody`) · `web/src/{app/legal/privacy,app/legal/terms,app/signup}/page.tsx` · `web/src/components/demo-banner.tsx` · `web/scripts/e2e.mjs` (§14 backup/DR, §15 retention, D6 pre-booking cleanup) · `web/.gitignore` (`!.env.example`) · docs: `README.md`, `START_HERE.md`, `CITYCARE_CURRENT_ARCHITECTURE.md`, `CITYCARE_MASTER_GAP_REGISTER.md`, `.github/workflows/ci.yml`, `web/{README,FEATURES,LEGAL_COMPLIANCE,DEPLOY_VERCEL,DEPLOY_SUPABASE,DRAWBACKS_AND_BUGFIXES}.md`

## 9. Remaining blockers + owner-side deploy/verify instructions

Nothing in this batch blocks the owner from reviewing. For production (after explicit approval — **no deploy has been done and no prod env has been touched**):

1. **Deploy the branch** (merge to `main` per the git-linked Vercel project) — the `prebuild` hook applies migration 0006 automatically. **First (owner approval):** `npm i @vercel/blob` in `web/` + rebuild + re-run e2e (§10 finding 6 / A85 — without it the production backup cron fails loudly every cycle; local/sandbox unaffected).
2. **Set production env vars:** `BACKUP_KEY` (fresh 32-byte b64, separate from `SESSION_SECRET`), `BLOB_READ_WRITE_TOKEN` (existing), `RETENTION_POLICY=demo` on the demo instance / `pilot` on any pilot instance. (`DOCUMENT_KEY`/`ANCHOR_SIGNING_KEY` untouched — never rotate without intent.) **Escrow `BACKUP_KEY` and `DOCUMENT_KEY`** per `BACKUP_CONFIGURATION.md` §6 (offline two-person copy; losing `DOCUMENT_KEY` = all document bytes undecryptable, live and in backups).
3. **First-run verification (S09):** wait for the 03:00 IST backup cron (or trigger with `CRON_SECRET`) → `/api/health` shows `backups.lastSuccessAt` advancing, `stale:false`; `"Backup"` table shows `status='ok'`.
4. **Production drill (S09 RTO):** run `RESTORE_RUNBOOK.md` §8 once against the production backup into a scratch DB; record `restoreMs` at production size in `RESTORE_DRILL_REPORT.md` → then S09 can move to RESOLVED.
5. **Confirm retention (S15):** `/api/health` → `retention:{policy:"demo",enabled:true}`; the 7-day demo sweep resumes automatically (it is off on the live instance **until** step 2 — the fail-safe working as designed). This owner confirmation (steps 1–5) is exactly what the pending verification requires: only after production env + deployment are verified does NG-S15 move to RESOLVED (see §10, finding 3).
6. **Onboarding (G01):** `cp web/.env.example web/.env.local` now works from a fresh clone (verified this batch).

**After this report: STOP.** Batch 2 / Phase 2 starts only on explicit owner approval.

## 10. Post-implementation correction audit (2026-11-02, owner-directed)

Scope: review + correct the delivered Batch 1; **no Day 2 work, no redesign of working components, no production deploy, no key rotation/re-encryption.**

| # | Owner finding | What was wrong | Correction applied | Status after |
|---|---|---|---|---|
| 1 | Backup cron IST time | Batch-1 docs called the `30 21 * * *` UTC backup "02:30 IST"; it is **21:30 UTC = 03:00 IST (next day)** — 02:30 IST belongs to the `0 21` maintenance cron | All wrong mentions corrected (DR doc, config doc, register, this report, runbook cross-check); cron **expression preserved** in `vercel.json` | Docs consistent with the real schedule |
| 2 | Private medical document backup gap | Batch-1 docs claimed documents live in **Vercel Blob outside the DB backup** — **false**: the bytes are Postgres `DocumentBlob` rows (AES-256-GCM under `DOCUMENT_KEY`) and are inside the 36-table backup (drill: section byte-identical) | All false claims corrected **with explicit correction notes** (DR doc §1+§6, `DRAWBACKS` D66, drill report §3, this report §4/§6) — not silently rewritten; **new runbook** `web/docs/operations/DOCUMENT_STORAGE_DISASTER_RECOVERY.md` covering: backup/recovery path, 3-layer integrity verification, DB↔object reconciliation SQL (4 queries), deleted/unavailable/corrupted handling, PHI-safe restore (scratch-only, ciphertext gates, scoped decrypt-only-verification), retention/erasure preservation | DB-level (ciphertext) recovery **drilled** (2026-11-02); document-level drill **defined, NOT executed** → no claim made; blockers + exact owner actions listed in its §8 |
| 3 | NG-S15 status overstated | Register + report said **RESOLVED** although production env vars + pilot deployment were never verified | NG-S15 → **PARTIALLY IMPLEMENTED — OWNER VERIFICATION PENDING**; local test evidence preserved; code-level vs deployment-level explicitly separated (register entry, this table row, header line) | Correct standard applied |
| 4 | Backup key management | v1 docs covered the key minimally (generate + don't leak) | `BACKUP_CONFIGURATION.md` §6 (new): secure storage (Vercel sensitive env, .env.local, generation, single system of record), restricted access (exactly two actors; object-name leak ≠ data), recovery escrow (offline two-person, exercised-on-rotation), key-loss consequences (plain-language), rotation plan v2 (keyVersion header + re-key script + grace period where both keys work — **not implemented; no keys rotated or backups re-encrypted in this batch**); DR doc §5 re-pointed to it | Key-management doc complete; rotation remains a plan (D63) |
| 5 | Final verification | — | Tests re-run after the corrections (below); no assertions deleted or weakened; no code changes in this audit (docs-only), so the behavioural evidence of §2 remains valid | See below |
| 6 | **(self-discovered during finding 2's inspection)** `@vercel/blob` not declared | The batch-1 docs claimed the Blob SDK was "an existing declared dependency" (and "for documents") — neither true: not in `package.json`/lockfile/`node_modules`; imported only by `backup-core.mjs` for the backup file store | A85 + D69 logged; all doc claims corrected with notes; **exact required action documented** (`npm i @vercel/blob` + rebuild + e2e + redeploy — owner approval, deliberately NOT done in a docs-only batch); failure mode is loud + auditable (`"Backup"` row + `stale:true`), never a partial file | Prod backup blocked until the owner runs the one-line install; sandbox evidence unaffected |

**Changed files in this correction audit (precise list):**
- `CITYCARE_DAY_1_REPORT.md` — renamed from `CITYCARE_STEP_2_BATCH_1_REPORT.md` (owner naming) + this §10 + S15 row + D66 row + scope/times (git rename, history preserved)
- `CITYCARE_MASTER_GAP_REGISTER.md` — NG-S15 status + header note + NG-S09 document-storage cross-ref + backup-cron time + A/D count sync
- `web/docs/operations/BACKUP_AND_DISASTER_RECOVERY.md` — schedule row; §1 item 1 (documents-in-DB correction); §5 key management; §6 non-goals
- `web/docs/operations/BACKUP_CONFIGURATION.md` — schedule row; `BACKUP_KEY` row pointer; **new §6 key management**
- `web/docs/operations/RESTORE_DRILL_REPORT.md` — §3.4 scope note corrected
- `web/docs/operations/DOCUMENT_STORAGE_DISASTER_RECOVERY.md` — **new**
- `web/DRAWBACKS_AND_BUGFIXES.md` — D66 corrected (correction stated in-row); **A85 + D69 added** (the missing `@vercel/blob` dependency, self-discovered during finding 2)
- **No source files, no migrations, no tests, no `vercel.json` touched** in this audit.

**Test evidence (this audit, docs-only — re-run after edits, 2026-11-02):** vitest **213/213** (6.9 s) · `tsc --noEmit` **0 errors** · `npm run lint` **0** · full e2e **272/272** (19.0 s, after clearing `RateLimit` as always). No assertions deleted or weakened; no source files touched in this audit, so the §2 behavioural evidence stands unchanged.

## 11. Day 1 final technical verification (2026-11-02, owner-directed)

Scope: the owner's six findings against the delivered Day 1. Findings 1–3 **authorized
implementation** (explicit owner approval — this batch is *not* docs-only); findings 4–6 are
observability, procedure and reporting work. Hard constraints honoured: no public document
endpoint, no plaintext/PHI in any log or output, no secrets generated/displayed beyond the
local sandbox `.env.local` (regenerated after a session reset — values never leave the
sandbox), no key rotation/re-encryption, no production deploy, **NG-S09 and NG-S15 stay
PARTIALLY IMPLEMENTED** until their acceptance requirements are verified.

| # | Finding | What was done | Evidence (all executed 2026-11-02) |
|---|---|---|---|
| F1 | Backup must be a consistent snapshot | The whole dump (all per-table `count(*)` + all 36 `COPY TO`s) now runs inside **one** `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY … COMMIT` on the dedicated copy client; any failure ⇒ `ROLLBACK` + **no file**. MVCC trade-offs documented (snapshot held for dump duration, bounded by the 20 s soft budget; writers never blocked; read-only guard) — `BACKUP_AND_DISASTER_RECOVERY.md` §1 item 3 | Unit: statement-order pin + ROLLBACK-on-mid-dump-failure (2 new). E2e **§16a** (deterministic: open REPEATABLE READ snapshot unaffected by a concurrent commit) + **§16b** (8 real backups taken while a writer's commit lands *during* the dump; every captured cross-table (User, Patient) pair matched exactly one committed state — a mix is impossible under the snapshot and possible under the old per-table autocommit). Drill re-run after the change: all gates green, `restoreMs` 229 (`RESTORE_DRILL_REPORT.md` §6) |
| F2 | `@vercel/blob` must be a real manifest dependency | `@vercel/blob@^2.8.2` (2.8.2 = latest stable at install time) installed in `web/` → `package.json` + `package-lock.json` (owner-approved; **not** a temporary production-only install). Installed-package API verified directly: 2.8.2 exports `put/get/list/del` — **no `delete`** (A86) | `pruneBackups` made version-tolerant (`blob.delete ?? blob.del`, loud failure if neither) + unit test pinning the installed shape. Build + vitest **216/216** + full e2e **286/286** green on the change. D69 **closed** |
| F3 | Document-level recovery must be drilled, not just COPY-tested | Drill **gate 7** `--verify-document <id>` + new `scripts/verify-document.ts`: scratch-DB-only, decrypts **one** explicit document with the **application's own** `decryptBlob` (same crypto as downloads), checks SHA-256 vs `Document.checksumSha256` + byte length vs `Document.sizeBytes`; prints **status-only JSON** (booleans, counts, ms — never content); non-zero exit = verification problem, verdict still parsed; drill cleanup (`DrillFail` + `createdScratch`) drops the scratch on **every** path; **no endpoint created anywhere** | E2e **§16d** (synthetic canary PDF — real upload → backup → drill): `documentVerify.ok`, `checksumMatch`, `sizeMatch`, canary **absent** from stdout+stderr, `scratchDropped:true`; **negative path** unknown id ⇒ `found:false`, drill failed, scratch still dropped; cleanup deletes the synthetic doc. `DOCUMENT_STORAGE_DISASTER_RECOVERY.md` §6 step 4 executed, §8 item 1 **closed**. A successful COPY test is never presented as a decryption test — the two are separate gates |
| F4 | A backup failure caused by the DB itself must be observable independently | The same-DB `"Backup"` row *cannot* be written when the DB is down — so both callers now emit a stable, grep-able **`[citycare-backup] FATAL`** marker (constant `BACKUP_FATAL_MARKER`, shared so it cannot drift) naming the `errorClass` (no credentials) to the **platform log**, and the CLI exits non-zero. The message and docs state plainly that **v1 has no automated alerting** — log monitoring/alert wiring is an owner-side action, not a configured capability | E2e **§16c** (4 checks, `DATABASE_URL` → dead port): exit ≠ 0, marker present, **no** `.ccbk` written, **no** spurious `"Backup"` row. Docs: `BACKUP_AND_DISASTER_RECOVERY.md` §4.1 (new), `BACKUP_CONFIGURATION.md` §4 |
| F5 | Both `BACKUP_KEY` and `DOCUMENT_KEY` need documented escrow procedures | `BACKUP_CONFIGURATION.md` §6.3 now states its scope covers **both** keys and its status plainly: **documented, not yet executed** — the procedure (offline split copy, second holder, cross-check, exercise-on-rotation, loss consequences) is written; the **owner must perform** the escrow. No secrets were generated, rotated, displayed or transmitted in this batch (the sandbox-local `.env.local` values are regenerated per session reset and never leave the sandbox) | Owner action list below (item 2). Distinction "documented procedure ≠ executed escrow" is explicit in the doc and in this report |
| F6 | Test counts disagree across documents (257 vs 272) | Reconciled: both were true for **different code states** (WS-A `e51e437` vs WS-B `4b76258`). Full table — suite, count, date, commit, where cited — in `RESTORE_DRILL_REPORT.md` §7; convention fixed: no bare count without scope + date + commit | Current (this commit): e2e **286/286**, vitest **216/216** (21 files), tsc 0, lint 0 (1 pre-existing-style warning fixed), build OK, drill `restoreMs` 229 @ 1,079 rows |

**Changed files (this batch, precise list):**
- `web/package.json`, `web/package-lock.json` — `@vercel/blob@^2.8.2` (F2)
- `web/src/lib/backup-core.mjs` (+ `.d.mts`) — snapshot transaction in `createBackup` (F1); tolerant blob-prune (A86); `BACKUP_FATAL_MARKER` + `formatBackupFatalLog` (F4)
- `web/src/app/api/cron/backup/route.ts` — FATAL marker on connect failure + unrecordable failure (F4)
- `web/scripts/backup.mjs` — FATAL marker + clean non-zero exit on connect failure (F4)
- `web/scripts/restore-drill.mjs` — gate 7 `--verify-document` (F3); `DrillFail`/`createdScratch` total cleanup; verdict parsing on child non-zero exit (A87)
- `web/scripts/verify-document.ts` — **new** (F3)
- `web/src/lib/__tests__/backup-core.test.ts` — +3 unit tests (F1 ×2, A86 ×1)
- `web/scripts/e2e.mjs` — **section 16** (14 checks: §16a/b snapshot, §16c DB-down, §16d document drill)
- `web/docs/operations/BACKUP_AND_DISASTER_RECOVERY.md` — snapshot §1 item 3, §4.1 DB-down observability, status header
- `web/docs/operations/BACKUP_CONFIGURATION.md` — prerequisite 0 ✅ (F2), §4 FATAL bullet, §6.3 both-keys escrow scope/status (F5)
- `web/docs/operations/RESTORE_DRILL_REPORT.md` — §5 document-level drill executed, §6 post-change re-run, §7 count reconciliation (F3, F6)
- `web/docs/operations/DOCUMENT_STORAGE_DISASTER_RECOVERY.md` — §6 step 4 executed, §8 item 1 closed, status header (F3)
- `web/DRAWBACKS_AND_BUGFIXES.md` — **A86 + A87 added; D69 closed; D66 sub-gap (b) closed** (F2, F3)
- `CITYCARE_MASTER_GAP_REGISTER.md` — NG-S09 final-verification block (stays PARTIALLY IMPLEMENTED), NG-S15 note (unchanged, stays PARTIALLY IMPLEMENTED), doc refs
- `CITYCARE_DAY_1_REPORT.md` — this §11 + §2 pointer

**Test evidence (this batch, 2026-11-02, after all changes):** vitest **216/216** (21 files) · `tsc --noEmit` **0 errors** · `npm run lint` **0 errors / 0 warnings** · `next build` **OK** · full e2e **286/286** (after `DELETE FROM "RateLimit"` as always) · standalone drill re-run **exit 0**, all gates green, `restoreMs` 229, `scratchDropped: true`.

**Outstanding owner-side actions (unchanged items + new):**
1. **NG-S15 verification** (key to both P0 gaps): set/confirm production env vars (esp. `RETENTION_POLICY` on the pilot instance) + perform the actual pilot deployment → only then may NG-S15 move to RESOLVED.
2. **Execute the key escrow for BOTH keys** (`BACKUP_KEY`, `DOCUMENT_KEY`) per `BACKUP_CONFIGURATION.md` §6.3 — the procedure is documented; the escrow itself is owner-executed. Until then both keys have a single system of record.
3. **NG-S09 production verification:** deploy (with `BACKUP_KEY` + `BLOB_READ_WRITE_TOKEN` — the `@vercel/blob` prerequisite is now satisfied), first cron run, one production-size drill (`RESTORE_RUNBOOK.md` §8) → then NG-S09 can move to RESOLVED.
4. **Backup-failure monitoring:** wire log-based alerting on the `[citycare-backup] FATAL` marker (Vercel function log) if/when desired — v1 has **no** automated alerting; the marker + non-zero CLI exit are what exist.
5. **Optional:** manual private export of the newest `.ccbk` to a second store (durability of the Vercel Blob provider side) — only if the owner decides it is required; no public export endpoint exists or will be built.

**After this verification: STOP.** No Day 2, no production deploy, no redesign — as directed.

---

## 12. Final Day 1 cleanup & safety patch (2026-11-02, owner-directed)

Small, bounded patch on top of §11 — no Day 2, no redesign, no deploy. Commit on
`arena/f1f3a0ac-citycare` (parent `e11063d`, PR #6).

### What changed

1. **F1 — `scripts/verify-document.ts` cleanup (A89).** The old `out()` called
   `process.exit()` from *inside* try/finally, which skips `finally` — so
   `client.end()` never ran on early-return verdicts (`not_found`,
   `tombstoned_anomaly`, …). Refactored: the verdict is **collected**, the client is
   **closed in `finally` on every path**, and the exit code is applied only after
   cleanup (`main()` returns the code; only the direct-invocation guard exits). The
   one-JSON-line stdout contract and 0/1 exit codes are unchanged (parent drill gate 7,
   A87, untouched). 7 unit tests added (`src/lib/__tests__/verify-document.test.ts`):
   successful verification, document not found, decryption failure, DB connection
   failure, cleanup-after-negative (event order `identity → docSelect → end`), identity
   refusal, usage/env contract.
2. **F2 — scratch identity gate.** Before any document SELECT the helper now verifies
   `current_database()` matches `^citycare_drill_\d{8}_\d{6}$`; a non-scratch target
   refuses with `errorClass: "unsafe_database_identity"` **without running the document
   query** and still closes the connection. A fat-fingered production URL can no longer
   read/decrypt a live document through this path. Parent scratch-drop cleanup unchanged
   (independent, every path).
3. **F3 — Gap-register consistency.** The NG-S09 statements that `@vercel/blob` was
   missing from the manifest (A85/D69) and that the document-level drill was not executed
   are now explicitly marked **historical/superseded** with pointers to the final-
   verification block (item 2 / item 6). NG-S09 and NG-S15 **remain PARTIALLY
   IMPLEMENTED** — not RESOLVED.
4. **A90 (found while preparing F4) — the CI workflow was unparseable.**
   `.github/workflows/ci.yml` used a flow-style mapping with an unquoted `${{ … }}`
   expression (`concurrency: { group: ci-${{ github.ref }}, … }`) — a YAML syntax error
   that makes **every** CI run fail at workflow-parse time, *before any test step*. The
   line dates from `9212ee4` (PR #5 merge), so all 5 CI runs on this branch failed that
   way: the branch was never actually CI-verified — only by the sandbox gauntlet. Fixed:
   block-style `concurrency` (validated by re-parse) + `RETENTION_POLICY: demo` in the
   CI env (CI is a demo-equivalent throwaway env; the S15 e2e checks assert the armed
   sweep, and Next.js bakes build-time env into the statically-prerendered legal pages).
   Logged as A90.

### F4 — final test run (2026-11-02, sandbox, embedded PG 18.6)

| Suite | Result |
|---|---|
| `npx vitest run` | **223/223 passed (22 files)** — 216 baseline + 7 new A89/F2 tests |
| full e2e (`node scripts/e2e.mjs`, after `DELETE FROM "RateLimit"`) | **286/286 passed, 0 failed** |
| `npx tsc --noEmit` | **0 errors** |
| `npm run lint` | **0 errors / 0 warnings** |
| `next build` (production) | **OK, 0 errors** — built with `RETENTION_POLICY=demo` in the env (legal pages are statically prerendered from build-time env) |
| standalone restore drill — positive | **exit 0** — all gates ok, `documentVerify {ok:true, checksumMatch:true, sizeMatch:true, plaintextBytes:106}`, `restoreMs` 360, scratch dropped |
| standalone restore drill — negative (unknown document id) | **exit 1** — `documentVerify {ok:false, found:false, errorClass:"not_found"}`, data gates green, scratch **still** dropped |
| scratch-name safety refusal | **exit 2** — non-conforming scratch name refused (restore can never target an unrecognised DB) |
| leftovers | **zero** `citycare_drill_*` databases; canary document deleted (bytes removed, tombstone kept) |

### F5 — owner-side actions (explicitly OPEN — no production-readiness claim)

1. **Production backup execution** — Vercel cron against the prod Neon DB with
   `BACKUP_KEY` + `BLOB_READ_WRITE_TOKEN` set; first successful production run.
2. **Production restore drill** — one drill at production data size
   (`RESTORE_RUNBOOK.md` §8); the RTO target must be demonstrated on the real database.
3. **`BACKUP_KEY` escrow** — procedure documented (`BACKUP_CONFIGURATION.md` §6.3);
   the escrow itself is owner-executed (two-person, offline, exercised).
4. **`DOCUMENT_KEY` escrow** — same discipline; loss of `DOCUMENT_KEY` = total document
   loss (live and in every backup).
5. **Production retention environment verification** — `RETENTION_POLICY`
   (`demo`/`internal`/`pilot`) on the instance that will serve pilot users (NG-S15;
   unset ⇒ sweep off by fail-safe).
6. **Automated alerting for backup FATAL logs** — the `[citycare-backup] FATAL` marker
   is grep-able by design, but **no alerting is configured in v1**; wiring a monitor is
   an owner-side action.

NG-S09 and NG-S15 stay **PARTIALLY IMPLEMENTED — OWNER VERIFICATION PENDING** until the
above is done. **After this patch: STOP.** No Day 2, no production deploy, no redesign.
