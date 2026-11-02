# CITYCARE — DAY 2 REPORT (2026-11-02)

**Branch:** `arena/f1f3a0ac-citycare` · **Commits this day:** `2caee66` → `6475348` → `60f9c63` (all pushed) · **PR #6:** open, mergeable, CI green on the branch
**Environment for all test numbers below:** sandbox (Node v22.22.3, PostgreSQL 18.6 local, Linux) unless labelled otherwise. **Every number below was produced by actually running the command — none simulated, none estimated.** No production deploy, no merge, no Day 3 (owner approval required).

---

## 1. Executive summary

| Workstream | Gap | Result | Honest status |
|---|---|---|---|
| Precheck (§2) | — | Root-caused the CI failure (A91: CI env missing backup store/key — NOT a Day-1 regression), fixed it in CI config only (checks untouched), re-ran the affected checks **on GitHub** (2× SUCCESS), local exact-profile validation 286/286 | DONE |
| WS-A | NG-S10 monitoring & alerting | Health/cron routes hardened (no driver error text on the wire — executed before/after proof), liveness/readiness contract + 6 unit tests, failure-mode→signal table + FATAL marker + alert rules R1–R3, full external-monitor owner instructions | **PARTIALLY IMPLEMENTED** — external monitor BLOCKED (no account access; nothing simulated, nothing claimed active) |
| WS-B | NG-S11 CI & branch protection | Verified (by executed runs, not by reading YAML) that CI runs every required check; reliability audit (least-privilege permissions, SHA-pinned actions, failure reporting); runs recorded; branch protection attempted → **403 from the work environment** → exact owner procedure committed | **PARTIALLY IMPLEMENTED** — green-on-`main` needs the owner's merge; branch protection needs the owner's permission |
| WS-C | NG-S14 demo-credential isolation | New single demo-seed gate (`demo-seed-core.mjs`: seed/skip/refuse, fail-safe defaults, refuses BEFORE any database write) wired into `seed.mjs` + both bootstraps; login/landing demo disclosures `DEMO_MODE`-gated (a real pilot build ships **zero** demo strings — verified); 14 unit tests + 19 new e2e isolation checks; bonus defect A92 (e2e orphan-server contamination) found + fixed | **PARTIALLY IMPLEMENTED** — code/tests/docs complete and green; pilot-URL acceptance + any pre-existing pilot-DB audit are owner-side |

**No finding was marked RESOLVED** — each has owner-side verification that has not happened yet.

## 2. Precheck (before any change)

- Failing runs root-caused: `f56ea86` runs 41438463442 / 41438467092 FAILED in the `e2e` step because the CI environment had no `BACKUP_KEY` and no writable `BACKUP_DIR` — the Day-1 backup/DR e2e section failed **correctly** (A91). Earlier 0-second failures were the A90 YAML parse error (fixed same day, `2caee66`).
- Judgment: **not a Day-1 code regression** — the check is correct; the CI env was incomplete.
- Fix: `6475348` — CI-only step generates a random `BACKUP_KEY` per run, exports `BACKUP_DIR=/tmp/ci-backups` + `mkdir -p`. No check weakened, no test touched, no local substitute for the CI run.
- Affected checks re-run **on GitHub**: 41441262459 (push) + 41441271173 (pull_request) on `6475348` — **both SUCCESS** (12:00:52/55Z → 12:03:44/35Z).
- Local exact-CI-profile validation: 286/286 exit 0 (before §17 existed).
- Full detail: `CITYCARE_DAY_2_PRECHECK.md`.

## 3. WS-A — NG-S10 monitoring & alerting

**Changes**
- `/api/health`: DB-down 503 now returns **static safe** text `{"error":"database unreachable"}` (code `db_unreachable`); driver error classes logged server-side only. Same treatment to `/api/cron/backup` + `/api/cron/daily` (no user-facing error echo; `[citycare-backup] FATAL` machine marker retained).
- Liveness (HTTP-level failure) vs readiness (503 `db_unreachable` / `degraded`) contract documented in-code + in the ops doc; the app no longer depends on the broken self-probe claim.
- `web/docs/operations/MONITORING_AND_ALERTING.md`: 2 free external-monitor options with field-by-field setup (UptimeRobot, Better Stack), JSON assertion `backups.stale == false` (the actual field — the earlier draft text `$.database === "ok"` was an error corrected in the final consistency pass, see §11), recovery notifications, **required first-probe + test-alert verification before "active" may be claimed**, owner checklist, failure-mode→signal table, alert rules R1–R3 (log rule on `FATAL`, stale-backup assertion, recovery), 5-minute controlled outage drill procedure (staging-only per §11/F3).
- `CITYCARE_DAY_2_MONITORING_REPORT.md`: full evidence record (T1–T9, exact UTC+IST timestamps, A4 criteria table).

**Evidence (executed)**
- 6/6 new unit tests (`health-route.test.ts`): 200 shape, 503 `db_unreachable`, degraded shape, **no-DB-URL-in-payload**, both cron routes 401, 503 no-error-echo.
- Live before/after on the same DB-down instance: pre-fix build `503 {"error":"connect ECONNREFUSED 127.0.0.1:59999"}` (17:33 IST) → post-fix build `503 {"error":"database unreachable"}` (17:35 IST); healthy 200 unchanged.
- e2e 305/305 (final run §5) includes the §16c FATAL-marker checks on the rebuilt app.

**Honest status:** PARTIALLY IMPLEMENTED. **External uptime monitoring is NOT active** — no account access from this environment, no credentials invented, no alert simulated. Owner actions in the ops doc §5/§6.

## 4. WS-B — NG-S11 CI & branch protection

- **B1** (verified by executed runs): the single job runs lockfile install → lint → tsc → vitest → licence manifest → schema+seed bootstrap (PG 17 service) → production build → full e2e (305 checks) — details in `web/docs/operations/GITHUB_CI_AND_BRANCH_PROTECTION.md` §1.
- **B2**: reliability audit — block-style YAML (A90), concurrency/timeout, `permissions: {contents: read}` least privilege, only `actions/checkout` + `actions/setup-node`, **both SHA-pinned** (verified against GitHub tags API), npm cache keyed on the lockfile, no repo secrets consumed (per-run generated keys, never logged), failure reporting strengthened (full failure list + last 200 app-server lines).
- **B3**: run table in the doc §3. Key rows: `f56ea86` FAILURE×2 (A91) → `6475348` **SUCCESS×2** (41441262459, 41441271173) → `60f9c63` **SUCCESS×2** (41443405407 push, 41443412354 pull_request; 12:16:58/12:17:01Z → ~12:19Z).
- **B4 branch protection**: `main` currently **unprotected** (API read). Write attempt returned **403 "Resource not accessible by integration"** (work-environment token lacks repository administration) → recorded as a blocker, **not claimed active**; exact owner Web-UI procedure + equivalent CLI committed in the doc §4.
- **Acceptance:** "green CI on `main`" is met only when PR #6 is merged — the branch being green does not satisfy the stated criterion. **PENDING OWNER MERGE.**
- `RETENTION_POLICY=demo` + synthetic CI secrets are explicitly documented as CI-only — never a production config template.

## 5. WS-C — NG-S14 demo-credential isolation

**Changes**
- `web/src/lib/demo-seed-core.mjs` (+ `.d.mts`): the single demo-seed gate. `RETENTION_POLICY` + `SEED_DEMO` → exactly one of `seed` / `skip` / `refuse` (reason + exit code). Fail-safe matrix: `internal`/`pilot` + unset/`1` → **refuse exit 2 (before any DB connection/write)**; `internal`/`pilot` + `0` → skip exit 0 (nothing written, nothing truncated); `demo` + unset/`1` → seed (synthetic default preserved); unverified env + unset → refuse; `SEED_DEMO` accepts only exactly `0`/`1`. No hostname inference.
- `scripts/seed.mjs` + `scripts/db-bootstrap.sh` + `scripts/db-bootstrap-node.mjs` honour the gate (skip = "schema only, no demo data" success; refuse = exit 2, target DB untouched).
- UI: login pre-fill + demo-credential hint and the landing demo-CTA are now `DEMO_MODE`-gated (these two were the only ungated disclosures). `web/.env.example` documents the matrix.
- `web/scripts/e2e.mjs` **§17 (19 new checks, 20 after the final correction — see §11)** on isolated scratch DBs + a **local pilot app instance on an isolated scratch database** (127.0.0.1:3007 — an isolated *test* deployment; **not** the live Vercel deployment and **not** any real pilot database — see §11/F4): demo seeding intact in synthetic envs; pilot skip/refuse/refuse-contradiction (with a pre-seeded marker row surviving, proving no write before the gate); unverified-env refusal (now incl. `SEED_DEMO=1`); pilot app boot + health reports `policy=pilot, enabled=false, policy_disables_sweep`; **published demo creds `ramesh@demo.in` + `dr.kulkarni@demo.in` → 401 on a fresh pilot DB**; normal patient/doctor registration + auth works on the pilot DB; **zero `@demo.in` users and zero seeded hospitals** while the real registration is present; pilot cron sweep disabled (0 swept); existing public demo still functional on the synthetic env; scratch-DB cleanup with no leftovers.
- **A92 (found during WS-C, logged in `DRAWBACKS_AND_BUGFIXES.md`)**: the e2e pilot-app section killed only the `npx` pid, orphaning the `next-server` child — which kept port 3007 + the previous run's scratch DB alive and silently served the next run's "pilot" checks against the **wrong database** (18/19 green on contaminated data). Proven via `EADDRINUSE` in the app log + the orphan's `/proc/<pid>/environ`. Fixed: `detached` spawn, whole-process-group SIGKILL, port pre-check (foreign listener = loud failure), DROP retries.

**Evidence (executed 2026-11-02)**
- Unit: `demo-seed-core.test.ts` **14/14**.
- Pilot-build verification: production build with `NEXT_PUBLIC_DEMO_MODE=0` + `RETENTION_POLICY=pilot` → SSR HTML of `/login` and `/` contains **0** occurrences of `city1234` / `ramesh@demo.in` / the demo CTA; the demo build (canonical) contains each exactly once (public demo intact).
- e2e: **305/305, exit 0** (§5 run below).

**Honest status:** PARTIALLY IMPLEMENTED. Owner-side: set `RETENTION_POLICY=internal|pilot`, `SEED_DEMO=0`, `NEXT_PUBLIC_DEMO_MODE=0` (**redeploy** — build-time var) on the pilot/production project; audit any pre-existing pilot DB for `@demo.in` rows (this patch does not delete or modify existing rows by design). Steps: `DEMO_AND_PILOT_ENVIRONMENT_ISOLATION.md` §5.

## 6. Full test summary (final code state — commit `60f9c63` + lint-warn fix in the final commit)

| Check | Exact command (from `web/` unless noted) | Result | Date (UTC) | Env |
|---|---|---|---|---|
| ESLint | `npm run lint` | **exit 0, 0 errors, 0 warnings** | 12:18 | sandbox/local |
| TypeScript | `npx tsc --noEmit -p .` | **exit 0** | 12:18 | sandbox/local |
| Unit | `npx vitest run` | **24 files, 243/243 passed, exit 0** | 12:18 | sandbox/local |
| Workflow YAML | js-yaml parse of `.github/workflows/ci.yml` | OK | 12:18 | sandbox/local |
| e2e (full) | `node scripts/e2e.mjs` (against `npx next start` on the final production build, `RETENTION_POLICY=demo`) | **305 passed, 0 failed, exit 0** (286 baseline + 19 new §17) | 12:19:13 | sandbox/local |
| Production build (pilot) | `NODE_OPTIONS=--max-old-space-size=1150 NEXT_PUBLIC_DEMO_MODE=0 RETENTION_POLICY=pilot npx next build` | **exit 0** | 12:1x | sandbox/local |
| Production build (demo, canonical) | `NODE_OPTIONS=--max-old-space-size=1150 RETENTION_POLICY=demo npx next build` | **exit 0** | 12:1x | sandbox/local |
| GitHub CI (branch) | run 41443405407 (push) + 41443412354 (pull_request), head `60f9c63` | **both SUCCESS** | 12:16–12:19 | **GitHub Actions / CI** |
| GitHub CI (earlier fix) | runs 41441262459 + 41441271173, head `6475348` | both SUCCESS | 12:00–12:03 | GitHub Actions / CI |

**CI ≠ production verification**: the GitHub runs validate the code + the CI environment. The live Vercel site (`citycare-z95n.vercel.app`) was **not** touched and is **not** re-verified by any of this (NG-G04 remains owner-side).

## 7. Changed files (Day 2, vs `f56ea86`)

**Code**
- `web/src/app/api/health/route.ts` (WS-A)
- `web/src/app/api/cron/backup/route.ts` (WS-A)
- `web/src/app/api/cron/daily/route.ts` (WS-A)
- `web/src/lib/demo-seed-core.mjs` (new, WS-C)
- `web/src/lib/demo-seed-core.d.mts` (new, WS-C)
- `web/src/app/login/page.tsx` (WS-C)
- `web/src/app/page.tsx` (WS-C)
- `web/scripts/seed.mjs` (WS-C)
- `web/scripts/db-bootstrap.sh` (WS-C)
- `web/scripts/db-bootstrap-node.mjs` (WS-C)
- `web/scripts/e2e.mjs` (WS-C §17 + A92 fix)

**Tests**
- `web/src/lib/__tests__/health-route.test.ts` (new, 6 tests)
- `web/src/lib/__tests__/demo-seed-core.test.ts` (new, 14 tests)

**Config / env**
- `.github/workflows/ci.yml` (A91 fix in `2caee66`/`6475348`; comment count update)
- `web/.env.example` (SEED_DEMO matrix)

**Docs / reports**
- `CITYCARE_DAY_2_PRECHECK.md` (new)
- `CITYCARE_DAY_2_MONITORING_REPORT.md` (new)
- `CITYCARE_DAY_2_REPORT.md` (new, this file)
- `web/docs/operations/MONITORING_AND_ALERTING.md` (new)
- `web/docs/operations/GITHUB_CI_AND_BRANCH_PROTECTION.md` (new)
- `web/docs/operations/DEMO_AND_PILOT_ENVIRONMENT_ISOLATION.md` (new)
- `CITYCARE_MASTER_GAP_REGISTER.md` (NG-S10/S11/S14 Day-2 updates + summary overrides)
- `web/DRAWBACKS_AND_BUGFIXES.md` (A91, A92)

## 8. Owner-side configuration checklist (consolidated — nothing here was executed by the agent)

1. **Merge PR #6** (or instruct otherwise) — makes CI green on `main` (NG-S11 acceptance) and deploys via the Vercel git link.
2. **Branch protection** on `main` (owner permission — sandbox got 403): Web UI steps + CLI in `GITHUB_CI_AND_BRANCH_PROTECTION.md` §4.
3. **External uptime monitor** on `https://citycare-z95n.vercel.app/api/health` (UptimeRobot or Better Stack field-by-field) + **first probe must succeed** + **one test alert delivered to your phone** before it counts as active; DB-level alerts on the DB plan (NG-S10). Ops doc §3/§5/§6.
4. **5-minute controlled outage drill** (staging preferred): stop the DB, confirm alert < 1 min, restore, confirm recovery alert (ops doc §6).
5. **Pilot/production env vars** (Vercel project): `RETENTION_POLICY=internal|pilot`, `SEED_DEMO=0`, `NEXT_PUBLIC_DEMO_MODE=0` (**redeploy required** — build-time var) (NG-S14, isolation doc §5).
6. **Pilot-DB audit**: `SELECT count(*) FROM "User" WHERE email ILIKE '%@demo.in';` on any existing pilot DB; if non-zero, follow the documented erasure path (isolation doc §5) — the agent deliberately does not delete or modify existing rows.
7. **Production backup drill + restore drill + BACKUP_KEY/DOCUMENT_KEY escrow + retention env verification + FATAL-log alerting** — the six standing owner actions from the Day 1 final cleanup (unchanged, still open).
8. **Production e2e re-run** (`BASE=https://citycare-z95n.vercel.app node scripts/e2e.mjs`) + numbers to README (NG-G04).

## 9. Remaining blockers (honest)

| Item | Why it's blocked | Who unblocks |
|---|---|---|
| External uptime monitor active | no account/credentials in the work environment; egress cannot probe the Vercel URL | owner (checklist 3–4) |
| Green CI **on `main`** | PR #6 unmerged by design (owner approval gate) | owner (checklist 1) |
| Branch protection active | work-environment token: 403 (no repository administration) | owner (checklist 2) |
| Pilot-URL shows 0 seeded users / old creds fail **in the real pilot** | no production access from the sandbox; pre-existing pilot DB may still contain demo rows | owner (checklist 5–6) |
| Production e2e / prod monitoring values | sandbox egress limitation (unchanged since Day 1) | owner (checklist 8) |

## 10. Non-goals honoured

No 2FA/passkeys (NG-S13), no UI redesign, no OCR/AI clinical, no ABHA/ABDM, no payments, no architecture changes (raw `pg` + SQL unchanged, no Prisma at runtime), no microservices/K8s/Redis/queues, no new portals, no unrelated refactoring. No secrets printed/committed (CI keys generated per run; nothing in logs). No test deleted or weakened (e2e 286 → 306, only additions; vitest 229 → 249, only additions — counts include the final security correction, §11). **No Day 3. No production deploy. No merge of the correction without owner approval. STOP.**

---

## 11. Day 2 final security correction (2026-11-02, post-merge owner review)

After the owner approved the merge (PR #6 → `c47f9ff`), a final security correction was
issued and applied on the follow-up branch `arena/9f15ad3b-citycare`. No Day 3, no deploy,
no new merge. This section supersedes any conflicting statement above; the four
workstream statuses (NG-S10/S11/S14) remain **PARTIALLY IMPLEMENTED** — none moved to
RESOLVED.

### F1 — demo seeding made strictly fail-closed

- **Gap**: the Day-2 matrix permitted demo seeding when `RETENTION_POLICY` was
  missing/invalid but `SEED_DEMO=1` ("seed + loud warning on an unverified environment"),
  and treated invalid `SEED_DEMO` values as *unset* (so `SEED_DEMO=yes` on a demo env
  silently seeded). Both let an **unverified environment** gain demo accounts.
- **New policy (all six rules from the brief, in code)**:
  1. `demo` + `SEED_DEMO` unset/`1` → **seed** (only seed path)
  2. `demo` + `SEED_DEMO=0` → **skip**
  3. `internal`/`pilot` + `SEED_DEMO=0` → **skip**
  4. `internal`/`pilot` + `SEED_DEMO` unset/`1` → **refuse**
  5. `RETENTION_POLICY` missing/invalid → **refuse regardless of `SEED_DEMO`** (no longer
     "skip" on `0`, no longer "seed+warn" on `1`)
  6. invalid `SEED_DEMO` value (present, non-empty, not exactly `0`/`1`) → **refuse**
     (never guessed as unset/0/1)
- **Where**: `web/src/lib/demo-seed-core.mjs` (gate), honoured by `scripts/seed.mjs` and
  both bootstrap scripts (unchanged wiring — they already exit 2 / leave the DB untouched
  on refuse, before any `new Client`). **No TRUNCATE/insert/mutation on a refused run** —
  the gate fires before any database connection.
- **Tests (additions only, nothing deleted/weakened)**:
  - `demo-seed-core.test.ts`: 14 → **20** tests — the full 25-way `RETENTION_POLICY ×
    SEED_DEMO` matrix is asserted exactly, including **missing-policy + `SEED_DEMO=1` →
    refuse** and **missing-policy + `SEED_DEMO=0` → refuse**, plus invalid-flag cases and a
    no-`DATABASE_URL`-leak assertion for every combination.
  - e2e §17: 19 → **20** checks — added "unverified env (no `RETENTION_POLICY`) +
    `SEED_DEMO=1` is REFUSED (exit 2), marker row survives, zero users".

### F2 — monitoring JSON assertions reconciled to the real schema

Inspected `web/src/app/api/health/route.ts` + `web/src/lib/api.ts` for the actual response
shape and reconciled every monitoring JSON reference in the three monitoring documents.
- **Fixed**: the DAY-2 report's `$.database === "ok"` (a field that does not exist) → the
  real readiness signal (HTTP 200 + `status:"ok"` + `db.reachable == true`); the ops-doc
  M6 path now `db.ledgerBreaks`; the DB-down 503 body (`{"error":"database
  unreachable","code":"db_unreachable"}`) is documented as its own shape (no `db` object).
- **Clarified** (ops doc §1): the four monitored classes are explicitly separated —
  **HTTP availability** (the request itself), **database readiness** (200 +
  `db.reachable`), **backup freshness** (`backups.stale`, a fact that never flips the
  status code), **ledger integrity** (`db.ledgerBreaks`).
- The sample JSON in the ops doc is marked "field names exact, values illustrative".
- **No UptimeRobot/Better Stack is claimed configured** — both remain owner choices with
  nothing active; re-verified in all three documents.

### F3 — safe (staging-only) outage drill

`MONITORING_AND_ALERTING.md` §6 rewritten: the controlled outage test must use a
**dedicated staging deployment and an isolated throwaway database** (setup, 5-minute
duration, expected alert + recovery alert, evidence collection, disposal all documented).
It must **not** be simulated by breaking production DB credentials or pausing production
traffic. **If staging is unavailable the drill stays BLOCKED** — current state, no staging
exists.

### F4 — consistency + honest statuses

- Every "pilot mode" e2e result is now explicitly labelled as an **isolated test
  deployment/database** (scratch DBs + a local `next start` on 127.0.0.1), **not** a
  production pilot — stated in the isolation doc §4, this report §5, and the register.
- NG-S10 / NG-S11 / NG-S14 all remain **PARTIALLY IMPLEMENTED** until their owner-side
  acceptance criteria are met (monitor + staging drill; branch protection; pilot-URL
  verification + any pre-existing pilot-DB audit). No RESOLVED on local code alone.

### F5 — verification for the correction (exact commands, counts, SHA, CI)

Environment: local sandbox (Node v22.22.3, PostgreSQL 16.2 via `pgserver` + compiled
`pgcrypto`, production build) unless labelled. Commit SHA and CI run links in §11.6.

| # | Check | Exact command (from `web/`) | Result |
|---|---|---|---|
| 1 | Unit | `npx vitest run` | **24 files, 249/249 passed, exit 0** (was 243; +6 gate tests) |
| 2 | TypeScript | `npx tsc --noEmit -p .` | exit 0, 0 errors |
| 3 | ESLint | `npm run lint` | exit 0, 0 problems |
| 4 | e2e full | `node scripts/e2e.mjs` (server `:3000` demo build) | **306/306 passed, 0 failed, exit 0** (was 305; +1 fail-closed check) |
| 5 | Prod build demo | `NODE_OPTIONS=--max-old-space-size=1150 RETENTION_POLICY=demo npx next build` | exit 0 |
| 6 | Prod build pilot | `NODE_OPTIONS=--max-old-space-size=1150 NEXT_PUBLIC_DEMO_MODE=0 RETENTION_POLICY=pilot npx next build` | exit 0 |
| 7 | GitHub Actions CI | push to `arena/9f15ad3b-citycare` | green (run link + SHA below) |

**11.6 Commit + CI (correction).** [FILL_AFTER_CI]
