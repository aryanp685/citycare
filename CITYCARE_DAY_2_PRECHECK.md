# CITYCARE — DAY 2 PRECHECK (NG-S10 · NG-S11 · NG-S14)

**Date:** 2026-11-02 (all times IST, UTC+05:30)
**Performed before any Day 2 workstream change**, per the Day 2 master brief §2 (Strict precheck — DO NOT SKIP).

---

## 1. Branch, commit, tree

| Item | Value |
|---|---|
| Branch | `arena/f1f3a0ac-citycare` (session branch; PR #6 head) |
| Commit at precheck start | `f56ea86` — "Final Day 1 cleanup & safety patch (F1–F5 + A89 + A90)" |
| Working tree at precheck start | **clean** (`git status` empty; object integrity `git fsck` clean) |
| Origin main | `9212ee4` (unchanged) |
| User changes | **None to preserve** — tree was clean at start; no uncommitted or stashed user work was found or disturbed |
| Sandbox state | INTACT, not reset since Day 1 final patch: node_modules present, PG 18.6 daemon alive (data dir `/home/user/pgbox/data`), app on `:3000` healthy (`/api/health` ok, `ledgerBreaks: 0`), `web/.env.local` present (`RETENTION_POLICY=demo`), `/tmp/cc-backups` populated |

## 2. PR #6 status

| Item | Value |
|---|---|
| State | **OPEN** |
| Mergeable | YES |
| CI check | **UNSTABLE** (failed runs — see §3) |
| Merged? | No. **Not merged — owner approval required; nothing was merged on Day 2.** |

## 3. CI run inspection (verdict: **FAIL**)

Runs on the branch (newest first at precheck time):

| Run ID | SHA | Trigger | Result | Duration | Detail |
|---|---|---|---|---|---|
| [41438467092](https://github.com/aryanp685/citycare/actions/runs/41438467092) | `f56ea86` | pull_request | **FAILURE** | 2m36s | failed at `e2e (HTTP, against the built app)`, exit 1 |
| [41438463442](https://github.com/aryanp685/citycare/actions/runs/41438463442) | `f56ea86` | push | **FAILURE** | 2m32s | failed at `e2e (HTTP, against the built app)`, exit 1 |
| [41416303366](https://github.com/aryanp685/citycare/actions/runs/41416303366) | `e11063d` | push | FAILURE | 0s | "workflow file issue" (A90 YAML parse error — pre-existing) |
| [41400366095](https://github.com/aryanp685/citycare/actions/runs/41400366095) | `bdb37df` | push | FAILURE | 0s | same A90 parse error |

Key observation: the `f56ea86` pair were the **first CI runs on this branch that ever actually executed steps** (A90, in the Day 1 final patch, fixed the parse error). In both, every step was green through `Run npx next build` (checkout, setup-node, npm ci, CI keys, eslint, tsc, vitest, licenses, schema + demo data, build) and **the single failing step was `e2e (HTTP, against the built app)` (exit 1)**.

**Log access note (honest limitation):** raw step logs could not be fetched from this sandbox (`results-receiver.actions.githubusercontent.com` is not on the sandbox egress allowlist — all `gh run view --log` / `--log-failed` attempts ended in EOF). Failure localization was done via the step-level ✓/✗ list from `gh run view`, then **reproduced locally with an exact CI-environment profile** (§4) — the reproduced failure set is the authoritative diagnosis.

## 4. Root-cause investigation (per brief: investigate the ACTUAL failure)

### 4.1 Reproduction method (exact CI profile, local)

1. Created a **fresh database** `citycare_ci`; applied schema + all 6 migrations (36 tables); seeded with CI's scrypt cost `SCRYPT_N=16384` (CI `db-bootstrap` default).
2. Started the built app on `:3001` with **only the CI workflow env** (`DATABASE_URL`, `SESSION_SECRET=ci-only-…`, `CRON_SECRET=ci-cron-secret`, fresh generated `DOCUMENT_KEY` / `ANCHOR_SIGNING_KEY`, `ANCHOR_OTS=0`, `TZ_POLICY=Asia/Kolkata`, `RETENTION_POLICY=demo`) — deliberately **no** `BACKUP_KEY`/`BACKUP_DIR`, no `.env.local` involvement (same as CI).
3. Ran `node scripts/e2e.mjs` against it with the same env.

Result: **`e2e: 273 passed, 3 failed, 1 skipped`, exit 1** — failures:

```
- B: backup cron runs with the secret and reports file facts (no secrets/PHI in the response)
    — 500 {"error":"BACKUP_KEY is not set","code":"backup_failed_config"}
- B: a 'Backup' metadata row (status ok) was recorded — {"n":0}
- B: /api/health surfaces the backup fact (configured, lastSuccessAt set, not stale, no secrets)
    — {"configured":false,"lastSuccessAt":null,"ageMs":null,"stale":true}
```

Repeating the run on the dirty DB also showed transient 429 rate-limit cascades — that was an artifact of my dirty local table (the CI DB is always fresh; a fresh-DB run has none), so it is **not** part of the CI failure.

### 4.2 Root cause

The e2e backup section (`B: backup cron…`, `B: Backup metadata row…`, `B: /api/health surfaces the backup fact…`) executes **unconditionally**, but the CI job env defined neither `BACKUP_KEY` nor `BACKUP_DIR` — so on CI the app can only answer `500 backup_failed_config`, no `Backup` row is ever written, and `/api/health` reports `configured:false`. Three failed checks ⇒ exit 1.

### 4.3 Attribution: Day 1 vs pre-existing

- `B: backup cron runs with the secret…` and `B: a 'Backup' metadata row…` — introduced in **`e51e437`** (NG-S09 encrypted-backup work, **pre-Day-1**).
- `B: /api/health surfaces the backup fact…` — introduced in **`e11063d`** (Day 1 final-verification batch).
- **None of these checks had ever executed on CI**, because the A90 YAML parse error (`9212ee4`, all runs since the PR #5 merge) killed every run before step 1.

**Verdict:** the CI failure is a **CI-environment configuration defect (missing backup store/key), pre-existing in origin, only now unmasked** because A90 made CI actually run for the first time. It is not a Day 1 behavioral regression in app code — but per the brief it is treated exactly the same: **fixed first, before any other Day 2 work**, with affected checks re-run.

## 5. Fix (committed on this branch before Day 2 workstreams)

| Commit | Content |
|---|---|
| `2caee66` | `ci.yml`: per-run throwaway `BACKUP_KEY` (generated, never a secret at rest) + `BACKUP_DIR: /tmp/ci-backups` (created in the schema step) ⇒ the e2e backup/DR section now **fully executes in CI** (backup cron, encrypted-file verify, full isolated restore drill, S16b concurrent-writer backups, S16d document-level drill) instead of failing or skipping. Plus least-privilege token (`permissions: contents: read`), both third-party actions pinned to immutable commit SHAs (checkout `11bd719…` = v4.2.2, setup-node `cdca736…` = v4.3.0; verified against the GitHub tags API), and improved e2e failure reporting (app-log tail 50 → 200 lines). `web/DRAWBACKS_AND_BUGFIXES.md`: bug log **A91** (root cause + attribution + validation). |
| `6475348` | `web/src/data/licenses.json`: manifest refresh 367 → 382 packages (committed manifest predated the Day 1 owner-approved `@vercel/blob 2.8.2` install; regenerated 2026-11-02 by the standard `node scripts/licenses.mjs` check). |

**Nothing was hidden or bypassed:** no checks were deleted or weakened, no assertions relaxed, no steps skipped; the fix adds the missing CI config so the existing checks can pass where they are meant to run.

### 5.1 Affected checks re-run (local, exact CI profile)

Fresh `citycare_ci` DB + CI env only (incl. the fixed `BACKUP_KEY`/`BACKUP_DIR`), `SCRYPT_N=16384`, app `:3001`, e2e `BASE=http://127.0.0.1:3001`:

- **`e2e: 286 passed, 0 failed, 0 skipped`, exit 0** (17:2x IST, 2026-11-02; log kept at `/tmp/cimi/e2e_fixed.log`).

The authoritative re-run is the **new GitHub Actions run on `6475348`** (started after the push at ~17:30 IST; status tracked in `CITYCARE_DAY_2_REPORT.md`).

## 6. Baseline test results at `f56ea86` (for §7 end-of-day comparison)

Environment: sandbox, PG 18.6, production build (`next start`), `RETENTION_POLICY=demo` baked; 2026-11-02.

| Check | Command | Result |
|---|---|---|
| Unit | `npx vitest run` | **223/223 passed (22 files)** |
| E2E (full) | `node scripts/e2e.mjs` (server `:3000`) | **286/286 passed, 0 failed, exit 0** |
| Types | `npx tsc --noEmit -p .` | 0 errors |
| Lint | `npm run lint` | 0 errors / 0 warnings |
| Build | `npx next build` (with `RETENTION_POLICY=demo` in build env) | OK (55 routes) |
| License check | `node scripts/licenses.mjs` | exit 0 (382 prod packages after refresh) |
| Restore drill (positive) | `node scripts/backup.mjs create` + `restore-drill.mjs --scratch citycare_drill_… --verify-document <canary>` | exit 0, `documentVerify {ok:true, checksumMatch, sizeMatch}`, scratch dropped |
| Restore drill (negative) | same with unknown doc id | exit 1, `found:false`, scratch still dropped |
| Scratch-identity safety gate | drill with non-conforming scratch name | exit 2 (conformance refusal, by design) |
| Leftover scratch DBs | — | 0 |

## 7. Integrity / hygiene checks at precheck time

- `.env.local` **not tracked** (git-ignored); repo contains only value-free `.env.example` (A84). No secrets in the diff of any Day 2 change so far.
- CI env values in `ci.yml` are synthetic throwaway constants + per-run generated keys; **none of them is a production secret**, and the file explicitly marks them as non-prod (§5, and in-workflow comments).
- Production deployment (`citycare-z95n.vercel.app`) **untouched**; no deploy, no merge, no force-push on Day 2 so far.

## 8. Precheck verdict

| Workstream area | Status at start of Day 2 work |
|---|---|
| Branch/commit/tree | OK — `f56ea86`, clean |
| CI gate | **FAIL → fixed (`2caee66`/`6475348`), local exact-profile validation 286/286, CI re-run pending** |
| Day 1 regressions | None in app code; the CI failure was a pre-existing CI-env defect unmasked by A90 — fixed first per brief |
| Sandbox baseline | Intact; gauntlet numbers recorded for §7 comparison |
| GO / NO-GO for Day 2 workstreams | **GO** (after the CI fix commit above) |
