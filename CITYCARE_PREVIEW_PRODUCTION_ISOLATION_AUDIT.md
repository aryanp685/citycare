# CityCare — Preview–Production Isolation Audit

**Date:** 2026-11-02 (IST) · **Auditor:** agent (strictly read-only this pass — no deployments triggered, no env-var/project-setting changes, no migrations run, no production-database tests, no sandbox→production connections)
**Trigger:** owner brief — PR #9 merged (`main` = `b8d4e74`), the automatic production deployment for that merge was canceled before alias assignment; production must remain on the promoted `ad6f71a` deployment.
**Companion docs:** `CITYCARE_DAY3_DATABASE_AUDIT.md` §L (deployment disclosure), `web/DRAWBACKS_AND_BUGFIXES.md` (D62/A76 prebuild pattern, A93 seed gate).

> **Status of this file:** draft for owner review — **not yet committed** (the brief required stopping after the report; committing + any remediation waits for explicit approval).

---

## 1. Verified states (evidence-backed)

### 1.1 Merged main + CI
- `git fetch origin main` → `origin/main` head = **`b8d4e7413a2ffc5d047ae3a9df097985eceb35a2`** ("Merge pull request #9 from aryanp685/arena/c0875faf-citycare").
- GitHub Actions on the merge: **run `41470762461` completed/success** (ci, main, push, 2m5s); check-runs on `b8d4e74`: `web | completed | success`. PR #9 state: **MERGED** (mergedAt 2026-11-02T15:21:17Z).

### 1.2 Canceled deployment has NO production alias
`dpl_2vWFcvuDqwAaYeDBaDccKFGwLH4T` (target `production`, commit `b8d4e74`, created 15:21:24.564Z):
- `ready_state: CANCELED` · `readyStateReason: "The deployment was canceled through the Vercel API."` · `canceledAt: 1793632912040` (15:21:52.040Z)
- `aliasAssigned: false` · `aliasAssignedAt: null` — **no alias of any kind was assigned to the edge network.**
- Its alias list contains only the auto-generated project/branch placeholders (`citycare-z95n-iamjarvis9896-3988s-projects.vercel.app`, `citycare-z95n-git-main-…`); the production alias **`citycare-z95n.vercel.app` is absent** from it.

### 1.3 Production still on the promoted `ad6f71a` deployment
`dpl_963rr6Ha5zak2ixfihYZ8Pv4yQAQ` (commit `ad6f71a`): `status READY` · `readySubstate PROMOTED` · `aliasAssigned true` with aliases `citycare-z95n.vercel.app` + project + git-main. **Production was never repointed.**

### 1.4 ⚠️ THE KEY FINDING — cancellation happened AFTER prebuild schema-sync completed
Build-log timeline for the canceled production build (verbatim lines, UTC 2026-11-02, offsets from build start 15:21:25.732Z):

| Offset | Time (Z) | Log line (verbatim) |
|---|---|---|
| +4.9 s | 15:21:30.626 | `> web@0.1.0 prebuild` → `> node scripts/prebuild-schema-sync.mjs` |
| +5.2 s | 15:21:30.887 | pg-connection-string SSL-mode warning (DB connection in progress) |
| +7.8 s | 15:21:33.302 | `▶ database: neondb (PostgreSQL 18.6 (4e5fd08))` — **connected to the production Neon DB** |
| +8.0 s | 15:21:33.534 | `schema: tables already present — skipping` |
| +8.3→+9.6 s | 15:21:33.797→35.233 | `migration applied: 0001…0007` (all seven re-executed — **idempotent no-ops**: 0001–0006 already applied; 0007's `DROP INDEX IF EXISTS` targeted an index already dropped by the earlier PR-#9 preview build at 14:08:49Z ⇒ **zero net schema change**) |
| +12.9 s | 15:21:38.658 | `verified: 36 tables · ledger_append/verify · tamper trigger · 3 partial unique indexes · timezone=UTC` |
| +12.9 s | 15:21:38.659 | `seed gate: skip — SEED_DEMO=0 — demo seed disabled; nothing was written and nothing was truncated` |
| +12.9 s | 15:21:38.660 | `✔ database ready (schema only, no demo data — demo-seed gate: skip)` — **prebuild COMPLETE** |
| +13.0 s | 15:21:38.677 | `> next build` (Turbopack) |
| +26.1 s | 15:21:51.809 | `Build Completed in /vercel/output [23s]` |
| +26.1 s | 15:21:51.855 | `Deploying outputs…` |
| +26.3 s | **15:21:52.040** | **CANCELED** (Vercel API) |
| +28.7 s | 15:21:54.430 | build container exit |

**Answer to the owner's explicit question: YES — the cancellation happened after the prebuild schema-sync had fully completed** (~13.4 s earlier). Per the brief's own warning, I do **not** assume cancellation prevented database access: it did not. The production Neon DB **was accessed and the full migration pass executed to completion at 15:21:33–15:21:38Z**; the cancellation (15:21:52Z) only stopped the artifact-deploy/alias-assignment stage. Net effect of this build on the production DB: **zero rows written/truncated/seeded (seed gate SKIP), zero schema change (all statements idempotent no-ops)** — but *access* did occur, and "access without change" is not "no access".

## 2. Preview–Production isolation assessment

### 2.1 Environment variables — targets (names + targets only; no values decrypted or revealed)
From the Vercel project `citycare-z95n` env-var list (single value per key, `decrypted: false` for all sensitive entries):

| Key | Type | Targets |
|---|---|---|
| `DATABASE_URL` | sensitive (visibility: secret) | **production, preview** |
| `SESSION_SECRET` | sensitive | **production, preview** |
| `CRON_SECRET` | sensitive | **production, preview** |
| `DOCUMENT_KEY` | sensitive | **production, preview** |
| `ANCHOR_SIGNING_KEY` | sensitive | **production, preview** |
| `TZ_POLICY` | sensitive | **production, preview** |
| `RETENTION_POLICY` | plain (value `demo`) | production, preview |
| `SEED_DEMO` | plain (value `0`) | production, preview |
| `NEXT_PUBLIC_DEMO_MODE` | plain (value `1`) | production, preview |

**There is no per-environment differentiation of any kind.** Every secret and the production database URL are shared, with the *same value*, between production and preview.

### 2.2 Preview runtime scope (verified on the READY c28604b branch preview `dpl_2zqKaAvTDD7Bruo9cNtvpcyKdq8n`)
- OIDC environment: `preview` · status READY/STAGED · alias = branch-scoped `citycare-z95n-git-arena-c08-eac69c-…vercel.app` (reachable by anyone who can read the **public** repo / PR checks).
- Its runtime env list contains **`DATABASE_URL`, `SESSION_SECRET`, `CRON_SECRET`, `DOCUMENT_KEY`, `ANCHOR_SIGNING_KEY`, `TZ_POLICY`** — i.e. **the production credentials and the production database connection string are injected into every preview function at build time** (verified on the deployment record). Precision on what is and is not proven here: (a) **PROVEN** — the production `DATABASE_URL` and all production secrets are present in the preview runtime environment; (b) **PROVEN** — Vercel's build infrastructure reaches the production Neon successfully with these credentials (the prebuild connected and ran the full migration pass at 15:21:33Z in the very build under audit, and earlier preview builds did the same); (c) **NOT directly tested** — whether a live preview runtime actually opens database connections or executes queries: this pass probed no preview URLs (read-only brief), so "a preview instance can read and write production data" is a **capability statement from configuration** (credential present in the runtime env of a reachable, public preview), not an executed observation. Any exploit on a preview build runs with production credentials in its environment.
- Its `crons` manifest lists `/api/cron/daily` (`0 21 * * *`) and `/api/cron/backup` (`30 21 * * *`) — Vercel crons are project-scoped and the scheduler fires them against the production deployment; the preview record merely carries the same manifest. (Owner should confirm the firing target on the Vercel dashboard's Cron page — not determinable from deployment metadata alone.)

### 2.3 Build pipeline (structural root cause, now proven at production-build level)
Every git push (any branch, preview **or** main) runs `scripts/prebuild-schema-sync.mjs` during build with whatever `DATABASE_URL` the build env carries — and that URL is the production Neon one for **all** targets. Documented consequences, each now evidenced by build logs:
1. The PR-#9 branch preview build **applied migration 0007 to the production DB** at 14:08:49Z (before any review/merge).
2. The later branch previews (`79bc78e`, `c28604b`) and this canceled production build **re-executed the whole migration set against production** (idempotent no-ops — but direct DDL-capable access, every single time).
3. A broken or malicious migration in any unreviewed branch becomes a **direct, pre-merge path to mutate production schema** — CI e2e runs against its own sandbox DB, not the one the prebuild just touched.

### 2.4 Session/key consequences of the shared values
- `SESSION_SECRET` shared ⇒ **session tokens are cryptographically compatible across environments**. Precision (correcting an earlier overstatement in this draft): browser cookies are **domain-scoped** and do **not** automatically transfer between a `*.vercel.app` preview domain and the production domain. The actual risk is that a valid session **token value** minted under the shared secret — e.g. one obtained from a preview session via referrer exposure, client-side exfiltration, log leak, or a logged-in user carrying it over — is **accepted by the other environment's session verification** (both verify signatures with the same key). That is a cross-environment session acceptance/replay risk, **conditional on token possession**, not automatic cookie transfer. Compounding factor: with the shared `DATABASE_URL`, both environments read and write the **same production session table**, so session state — and any session revocation — is shared across environments by configuration.
- `DOCUMENT_KEY`/`ANCHOR_SIGNING_KEY`/`CRON_SECRET` shared ⇒ preview can decrypt/produce production ciphertext and ledger anchors, and can call the cron endpoint.
- `RETENTION_POLICY=demo` (7-day erasure, `protectedDomain=demo.in`) is the value in **production** as well — intentional for the current Hobby/non-commercial demo posture, but it means "production" is a demo-mode database; noted so the decision is visible, not accidental.

### 2.5 Verdict
**Isolation status: NOT ISOLATED (current configuration).**
- Preview **builds** → production DB: **connected, DDL executed** (evidence §1.4 + Day-3 §L).
- Preview **runtime** → production DB + all production secrets: **credentials injected by configuration** (§2.2) — capability established from the deployment record + proven build-stage connectivity; live runtime DB connectivity was **not** directly tested in this pass.
- The cancel action protected the **production deployment URL** (alias never moved) — it did **not** protect the **database** (access already complete) nor establish any ongoing isolation (nothing changes after the cancel: the env-var targets remain shared).

## 3. Prioritized remediation plan (NOT implemented — awaiting owner approval)

### P0 — before the next push of any branch (and before deploying `b8d4e74`)
| # | Action | Where | Why / effect |
|---|---|---|---|
| R1 | **Target-gate the prebuild**: in `scripts/prebuild-schema-sync.mjs`, if `VERCEL_ENV=preview` (or if a new explicit opt-out env is set) → log `prebuild: DB sync skipped (preview)` and exit 0; keep full sync only for production-target builds. Also make it tolerate a missing `DATABASE_URL` (skip + warn) so preview builds can run without a DB at all. | code (small, one script) — needs an approved pass + the standard gauntlet | Kills the structural root cause: **no future push of any branch can touch the production DB during build**. |
| R2 | **Split secrets/DB by target** (owner executes in Vercel console): `DATABASE_URL`, `SESSION_SECRET`, `CRON_SECRET`, `DOCUMENT_KEY`, `ANCHOR_SIGNING_KEY` → **production-only**; decide the preview DB policy: (a) preview gets an **isolated DB** (fresh Neon project or dedicated database + own secrets) — previews fully functional; or (b) preview gets **no DB** — previews become visual-only, app routes that need DB will fail in preview (acceptable if previews are only for UI review). Recommend (a) since previews are actually used for testing. | Vercel project env vars | After this: preview runtime cannot reach production data; sessions non-interchangeable; shared-key class of risk gone. Order: **R1 first** (so preview builds don't break when `DATABASE_URL` disappears from the preview target). |
| R3 | **Delete the currently-live stale previews** (`dpl_2cM2PRMnHUTJCsQusHMZJWXMceeF` e950f26, `dpl_BqBixZww9fkW2dmxeeWi53V2ec66` 79bc78e, `dpl_2zqKaAvTDD7Bruo9cNtvpcyKdq8n` c28604b, plus the two Day-2 branch previews) — they are READY, reachable, and each carries production credentials. Keep none, or keep only the one you're actively reviewing. | Vercel (owner or me with approval) | Removes live preview surfaces that hold production secrets. |

### P1 — before real (non-demo) users
| # | Action | Why |
|---|---|---|
| R4 | Confirm cron firing target on the Vercel dashboard (Cron Jobs page) — expect production-only; document the confirmation. | Closes the one item not determinable from metadata (§2.2). |
| R5 | Decide `RETENTION_POLICY` for production: keep `demo` (current, documented) or switch when moving to a real pilot DB. Owner decision — record it. | Makes the demo-mode production a visible choice. |
| R6 | After R1+R2 land: re-verify production `/api/health` + run the e2e suite against production; push a throwaway branch and confirm its build log shows `prebuild: DB sync skipped (preview)` and the production DB activity is clean. | Verifies the fix end-to-end with evidence. |

### P2 — hardening (design pass, later)
| # | Action | Why |
|---|---|---|
| R7 | **Least-privilege DB users**: a runtime user (no DDL) for the app and a separate migration user used only by the production prebuild. Even a leaked runtime key could not then alter schema. | Removes DDL from the runtime credential's blast radius. |
| R8 | CI guard: a check that fails if any sensitive Vercel env var has both `production` and `preview` targets (drift prevention). | Makes the shared-secret regression loud, not silent. |
| R9 | Log every prebuild DB touch (timestamp, target, migrations re-executed, net changes) to the build output summary line, so "did this build touch the DB" is answerable from one line. | Operability for exactly the question this audit had to reconstruct from 26 s of logs. |

## 4. What I did / did not do this pass (honest scope log)
- **Did (read-only):** `git fetch`/`log` on main; GitHub check-runs/runs; Vercel `list_deployments`, `get_deployment` ×3 (canceled, promoted-production, c28604b preview), `get_deployment_events` ×2 (windowed) on the canceled build, `list_env_vars` (names+targets; **no value decrypted, no secret revealed**).
- **Deviation, disclosed:** one GET to the production homepage (`citycare-z95n.vercel.app`) — a static marketing page (no API, no DB, no deployment trigger, no settings touched). It was unnecessary and is recorded here as a process slip; no further production probes were made.
- **Did not:** trigger/cancel/create any deployment (the cancel under audit was performed in the previous pass under the owner's explicit gate), change any env var or project setting, run any migration, execute any production-database test, or connect the sandbox to production in any way.

**STOP — report delivered. No remediation implemented. Awaiting explicit owner approval (including whether to commit this report and which R-items to proceed with).**
