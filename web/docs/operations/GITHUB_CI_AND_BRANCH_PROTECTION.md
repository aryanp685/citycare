# CityCare — GitHub CI & Branch Protection (NG-S11)

**Status: CI gate verified executing + green on the Day 2 branch; branch protection BLOCKED (sandbox token lacks repository administration rights — owner-side action below).**
Last updated: 2026-11-02 (Day 2).

---

## 1. B1 — what `ci.yml` actually executes (verified, not assumed)

File: `.github/workflows/ci.yml`. Trigger: every `push` and `pull_request`. Runner:
`ubuntu-latest`, `timeout-minutes: 20`, service container **PostgreSQL 17**
(`POSTGRES_USER/PASSWORD/DB = citycare`, health-checked with `pg_isready` before steps run).

| # | Step | What it proves |
|---|---|---|
| 1 | `actions/checkout` (SHA-pinned, v4.2.2) | source integrity |
| 2 | `actions/setup-node` (SHA-pinned, v4.3.0, Node 22, npm cache keyed on `web/package-lock.json`) | reproducible toolchain |
| 3 | `npm ci` | lockfile install, no drift |
| 4 | generate CI-only keys | `DOCUMENT_KEY`, `ANCHOR_SIGNING_KEY`, `BACKUP_KEY` — random per run, **never a secret at rest, never logged** |
| 5 | `npx eslint .` | lint gate |
| 6 | `npx tsc --noEmit -p .` | type gate |
| 7 | `npx vitest run` | unit gate (243 tests as of Day 2) |
| 8 | `node scripts/licenses.mjs` | open-source licence manifest check (382 packages) |
| 9 | schema + demo data | `apt-get install postgresql-client` + `FORCE_SEED=1 bash scripts/db-bootstrap.sh` (fresh PG 17: schema, 6 migrations, seeded demo data, `mkdir -p $BACKUP_DIR`) |
| 10 | `npx next build` | production build |
| 11 | e2e (HTTP, against the built app) | `next start` on 127.0.0.1:3000 → **full e2e suite (305 HTTP checks as of Day 2)** including the backup/DR section (backup cron, encrypted-file verify, full isolated restore drill, concurrent-writer backups, document-level drill) and the NG-S14 isolation section (scratch databases + a second app instance on a fresh pilot DB) |

Job env (synthetic, throwaway): `DATABASE_URL` (local service), `SESSION_SECRET` /
`CRON_SECRET` (synthetic constants), `ANCHOR_OTS=0` (no external calendar calls),
`TZ_POLICY=Asia/Kolkata`, `RETENTION_POLICY=demo`, `BACKUP_DIR=/tmp/ci-backups`.
Generated per run: `DOCUMENT_KEY`, `ANCHOR_SIGNING_KEY`, `BACKUP_KEY`.

> **CI config ≠ production config.** `RETENTION_POLICY=demo`, the synthetic secrets, the
> local `BACKUP_DIR`, and the throwaway keys are **CI-only** for a synthetic throwaway
> environment. Production (Vercel + real Postgres) needs its own values
> (`RETENTION_POLICY=internal|pilot`, `SEED_DEMO=0`, `NEXT_PUBLIC_DEMO_MODE=0`, real
> keys — see `DEMO_AND_PILOT_ENVIRONMENT_ISOLATION.md` §5 and the owner checklist in
> `MONITORING_AND_ALERTING.md` §5). Copying the CI env block into a deployment is a
> deployment error.

## 2. B2 — reliability audit (Day 2 changes included)

| Item | State | Notes |
|---|---|---|
| YAML validity | ✅ block-style throughout | the old flow-style `concurrency: { group: ci-${{ … }} }` was a parse error that killed every run since the PR #5 merge (A90); now block style, re-validated with js-yaml after every edit |
| Job dependencies | single job, linear steps | step order = dependency order; no hidden parallelism |
| Concurrency | ✅ `group: ci-${{ github.ref }}`, `cancel-in-progress: true` | stale runs on the same ref are cancelled; push + PR runs have different refs (both run — the PR run is the merge-candidate verdict) |
| Timeouts | ✅ job-level 20 min | the e2e step (heaviest, ~1 min) has headroom; the runner itself enforces a 6 h cap |
| Least-privilege permissions | ✅ top-level `permissions: { contents: read }` | the job only reads the repository; no write/pull-request/packages scopes |
| Third-party actions | ✅ only official `actions/checkout` + `actions/setup-node` | no other third-party actions; **both pinned to immutable commit SHAs** (verified against the GitHub tags API on 2026-11-02): checkout `11bd719…` (v4.2.2), setup-node `cdca736…` (v4.3.0) |
| Cache correctness | ✅ npm cache keyed on `web/package-lock.json` | cache miss is a slow build, never a wrong build (`npm ci` enforces the lockfile) |
| Artifact retention | no artifacts are produced | by design: all evidence is in the job log (no secrets can ride in an artifact; nothing to retain). If logs-outside-GitHub are needed later, add `actions/upload-artifact` **also SHA-pinned**, with an explicit retention-days |
| Failure reporting | ✅ improved (Day 2) | the e2e streams its own summary + full failure list to the job log; on failure the last 200 app-server log lines are appended (`tail -50` → `tail -200`). No secrets in the log (keys are generated per run and never echoed) |
| Secret handling | ✅ no repository secrets are consumed | every key is generated inside the run; CI env constants are synthetic and labelled as such |
| DB bootstrap | ✅ PG 17 service + `FORCE_SEED=1` | the schema step is green in every executed run; the e2e re-checks ledger integrity itself (breaks must be 0) |

## 3. B3 — runs executed on the Day 2 branch (recorded)

| Run | SHA | Trigger | Start (UTC) | End (UTC) | Result | Failing step |
|---|---|---|---|---|---|---|
| [41438463442](https://github.com/aryanp685/citycare/actions/runs/41438463442) | `f56ea86` | push | 2026-11-02T11:3x | +2m32s | **FAILURE** | `e2e (HTTP, against the built app)` — CI env had no backup store/key (A91; root-caused + fixed on Day 2) |
| [41438467092](https://github.com/aryanp685/citycare/actions/runs/41438467092) | `f56ea86` | pull_request | 2026-11-02T11:3x | +2m36s | **FAILURE** | same |
| [41441262459](https://github.com/aryanp685/citycare/actions/runs/41441262459) | `6475348` | push | 2026-11-02T12:00:52 | 12:03:44 | **SUCCESS** | — (all steps green, incl. the now-executing backup/DR e2e section) |
| [41441271173](https://github.com/aryanp685/citycare/actions/runs/41441271173) | `6475348` | pull_request | 2026-11-02T12:00:55 | 12:03:35 | **SUCCESS** | — |
| (final Day 2 run) | `60f9c63` | push + pull_request | 2026-11-02T~12:3x | — | tracked in `CITYCARE_DAY_2_REPORT.md` | — (expected SUCCESS: local exact-profile validation was green before push) |

Earlier runs (`bdb37df`, `e11063d`, …) failed in 0 s as "workflow file issue" — the A90
YAML parse error; they are historical, not regressions.

**Acceptance criterion (per brief): green CI on `main`.** A green branch with the PR
unmerged does **not** meet acceptance. The branch is green (above); `main` becomes green
only after the owner merges PR #6 — recorded as the remaining owner action.

## 4. B4 — branch protection

**Current state (read via API, 2026-11-02):** `main` is **not protected**
(`branches/main → protected: false`; repository is public, default branch `main`).

**Blocker (recorded, not bypassed):** the sandbox's GitHub identity is an integration
without repository administration rights — writing branch protection returns
**403 "Resource not accessible by integration"** (verified: `PUT
repos/aryanp685/citycare/branches/main/protection` → 403). Per the brief, branch
protection is therefore **NOT claimed active**; the owner configures it:

### Owner procedure (Web UI, ~3 min)

Repository → **Settings** → **Branches** → **Add rule**:

- Rule name: `main`
- ✅ **Require pull request before merging** → required approving reviews: **1**
  (solo-owner note: you cannot approve your own PR — also enable the bypass below, or
  add a second account for reviews)
- ✅ **Require status checks to pass before merging** → select the check **`ci`**
  (the workflow's name) and tick "must be up to date before merging" if offered
- ✅ **Block force pushes**
- ✅ **Prevent branches from being deleted**
- ✅ **Require branches to be up to date before merging**
- **Include administrators**: leave **unchecked** (keeps the owner from locking
  themselves out of their own repository; tighten later if a second account exists)

Then verify: a direct `git push origin main` from a branch is rejected, and merging PR #6
shows the `ci` status check as required.

### Equivalent CLI (owner's own token)

```bash
gh api -X put repos/aryanp685/citycare/branches/main/protection \
  -f required_status_checks=1 -F 'contexts[]=ci' \
  -F 'required_pull_request_reviews[required_approving_review_count]=1' \
  -f enforce_admins=false \
  -f block_force_pushes=true
```

(Deletion prevention is set via the Web UI / rulesets API; the classic API above covers
PR requirement, status checks, force pushes.)

**Status: BLOCKED (owner-side permission)** — exact blocker + exact instructions recorded
here; nothing is claimed active.

## 5. NG-S11 final status (honest)

- CI actually executes every required check class (install, lockfile, eslint, tsc, vitest,
  DB bootstrap, build, e2e incl. backup + retention + isolation sections, licences) —
  **verified by executed runs, not by reading the YAML** (§3).
- CI green on the Day 2 branch: **YES** (`6475348` ×2 SUCCESS; `60f9c63` tracked).
- Green CI on `main`: **PENDING OWNER MERGE** (PR #6 open, mergeable, check currently green).
- Branch protection: **BLOCKED** — owner procedure in §4.
