# CityCare — P0 Isolation Remediation Plan (PREPARATION ONLY)

**Date:** 2026-11-02 (IST) · **Status:** DRAFT for owner review — **NOT committed, NOTHING implemented**
**Source of truth:** `CITYCARE_PREVIEW_PRODUCTION_ISOLATION_AUDIT.md` (corrected this pass — see §1)
**Scope of this pass (read-only):** code inspection of the prebuild/bootstrap chain, Vercel read-only enumeration (deployment list paginated to project creation; env-var **names+targets only — no value decrypted, ever**), audit-report corrections. **No Vercel environment changes, no preview deletion, no code modifications, no commits/pushes, no migrations, no deployment, no production DB access, no D74, no Day 4.**

**Evidence gathered this pass (read-only):**
- Full deployment inventory: `list_deployments` paginated from newest (15:21:24Z Nov 2) back to the project's first known deployment (`dpl_8HV9xZ`, prod `3062e7d`, 19:02:51Z Oct 31). One older window remains below cursor `1793473571180` (Oct 31, project-creation era) — the execution pass must re-enumerate first (protocol in §3.3).
- Orphan `web` project (`prj_s5CpxvzWAjHxNfJyO7AT2rvIRPs4`): **env-var list = EMPTY** (`"envs": []`). Every preview/production deployment of that project runs with **zero** environment variables — none of them carry production credentials. This also explains the A93 asymmetry (its builds "succeeded" precisely because the prebuild skipped with no `DATABASE_URL`).
- Env-var creation timeline (from deployment env lists, names only): the 6 sensitive vars were **present by 07:55:37Z Nov 1** (first citycare branch preview `dpl_CMH7KA`); the 3 plain vars (`RETENTION_POLICY`, `SEED_DEMO`, `NEXT_PUBLIC_DEMO_MODE`) were created **before 13:14Z Nov 2** (the successful `dpl_B5fBt` build per A93). So previews built before 13:14Z carry the 6 sensitive vars only.
- `get_deployment` env-name verification (3 deployments, names only): `dpl_5rSZTJVc` (f56ea86), `dpl_Ht4g9a` (9c50e63), `dpl_CMH7KA` (dcee992) — each lists all 6 sensitive vars in its runtime env.

---

## 1. Task A — Audit report corrections (APPLIED to the file this pass)

Two technical statements in `CITYCARE_PREVIEW_PRODUCTION_ISOLATION_AUDIT.md` were overbroad. Both are corrected **in the file** (the file is still the uncommitted draft; no findings were weakened — the corrections make the proven/unproven boundary exact):

1. **Shared `SESSION_SECRET` (§2.4, finding 1).** Removed the claim that "session cookies are interchangeable" as if cookies automatically moved between domains. Cookies are **domain-scoped**; they do not transfer between `*.vercel.app` preview domains and the production domain. The corrected, precise risk: a valid session **token value** minted under the shared signing key is **accepted by the other environment's session verification** (cross-environment acceptance/replay, **conditional on token possession** — e.g. token captured via referrer exposure, client-side exfiltration, log leak, or a user carrying it over). Additionally, via the shared `DATABASE_URL`, both environments read/write the **same production session table**, so session state and revocation are shared.
2. **Preview database connectivity (§2.2 + §2.5 verdict).** Corrected to three tiers: (a) **PROVEN** — production `DATABASE_URL` + all production secrets are injected into the preview runtime env (deployment record); (b) **PROVEN** — Vercel build infrastructure reaches the production Neon with these credentials (prebuild logs, incl. 15:21:33Z in the build under audit); (c) **NOT directly tested** — whether a live preview runtime actually connects/queries (no preview URL was probed, per the read-only brief). "Preview can read/write production data" is therefore stated as a **capability-from-configuration**, not an executed observation.

---

## 2. Task B — Owner-side Vercel action checklist (execute in console; agent must not touch env vars)

Project: **`citycare-z95n`** → Settings → **Environment Variables**.
**Standing rule: no secret value is ever printed, pasted into chat, or shown in any report.** Value generation is done locally by the owner (commands given; outputs never shared).

### 2.1 Target model (recommended: Option A — isolated preview DB)

| Key | Today (targets / value) | Target after R2 | Value after R2 |
|---|---|---|---|
| `DATABASE_URL` | production, preview / prod Neon | **both** (same key, per-target values) | production → unchanged (prod Neon); preview → **fresh isolated Neon DB** (Option A) **or removed entirely** (Option B) |
| `SESSION_SECRET` | both / shared | both, per-target | production → unchanged; preview → **new** `openssl rand -base64 32` |
| `DOCUMENT_KEY` | both / shared | both, per-target | production → unchanged; preview → **new** 32-byte base64 key |
| `ANCHOR_SIGNING_KEY` | both / shared | both, per-target | production → unchanged; preview → **new** Ed25519 keypair (PKCS8 base64) — preview anchors form a separate, clearly-labelled chain |
| `CRON_SECRET` | both / shared | both, per-target | production → unchanged; preview → **new** random value (defense-in-depth; Vercel crons fire on the production environment — §2.3) |
| `TZ_POLICY` | both / shared (sensitive) | **decision needed** (see below) | non-credential policy string; if identical semantics are desired in both envs, keep one value on both targets and document the rationale; if preview should demo a different policy, split per-target |
| `RETENTION_POLICY` | both / `demo` | both, per-target | production → owner decision (`demo` today = documented demo-mode production; `pilot` when moving to real data) — this is the R5 decision, record it; preview → `demo` |
| `SEED_DEMO` | both / `0` | both, per-target | production → `0` (never seed production from a build — R1 additionally makes this refuse-by-code); preview → `1` **only if Option A** (so the isolated preview DB gets demo data) |
| `NEXT_PUBLIC_DEMO_MODE` | both / `1` | both, per-target | production → **`0`** (pilot UI, zero demo strings baked in); preview → `1`. **`NEXT_PUBLIC_*` is baked at build time** — the new value takes effect on the *next build* of that target (a fresh production deploy is required; previews rebuild on every branch push). |

**Option A (recommended):** preview gets its own Neon database (new Neon project, or a new database in the existing Neon project with its own role). Previews stay fully functional and testable; production is unreachable from preview by *configuration* (separate cluster/role), not just by a gate.
**Option B:** remove `DATABASE_URL` from the preview target. Previews become visual-only: DB-backed routes fail in preview (the R1-gated build tolerates the missing URL). Cheaper, but previews lose their test value.

### 2.2 Exact console steps (per variable, one pattern)

For each sensitive key (`SESSION_SECRET`, `DOCUMENT_KEY`, `ANCHOR_SIGNING_KEY`, `CRON_SECRET`, and `DATABASE_URL` for Option A):
1. Settings → Environment Variables → select the key.
2. Change **Environments** to **Production Only** (value stays; do not display it).
3. Create a **new entry with the same key name** targeting **Preview Only**, with the **new** value generated locally:
   - symmetric/random: `openssl rand -base64 32` (SESSION_SECRET, CRON_SECRET)
   - `DOCUMENT_KEY`: 32 random bytes, base64 (same command)
   - `ANCHOR_SIGNING_KEY`: generate a fresh Ed25519 keypair, encode the **private** key PKCS8 in base64 (same toolchain as the existing key; the public half is derived in code)
   - `DATABASE_URL` (Option A): the isolated Neon DB's connection string.
4. For the plain keys (`RETENTION_POLICY`, `SEED_DEMO`, `NEXT_PUBLIC_DEMO_MODE`): set per-target values as in §2.1 (visible in console — they are not secrets, but still never commit them to the repo).
5. `TZ_POLICY`: record the decision (keep single shared value with documented rationale, or split) — one line in the ops doc.

**Ordering rule:** do R2 **after** R1 is merged to `main` (so the next preview build no longer needs `DATABASE_URL` — R1 makes the preview build skip all DB work and tolerate a missing URL). Existing deployments keep their old baked env regardless of these changes — only **new** builds pick up the new targets (hence Task C).

### 2.3 Cron note (feeds R4)

`vercel.json` declares `/api/cron/daily` (`0 21 * * *`) and `/api/cron/backup` (`30 21 * * *`). Vercel crons are **project-scoped and fire against the production environment**; preview deployment records merely carry the same manifest. The per-target `CRON_SECRET` is defense-in-depth (a stray preview-side cron invocation would fail auth), not the primary control. **Owner action:** open the Vercel dashboard → project → **Cron Jobs** page and confirm the firing target is production-only; record the confirmation (date + screenshot note) in the ops doc.

### 2.4 How to verify the environment targets after the changes (read-only; no values)

1. **Console:** each key's row must show exactly the intended Environments (e.g. `SESSION_SECRET` → Production Only **and** a second `SESSION_SECRET` entry → Preview Only).
2. **API read (names+targets only):** `vercel env ls` / the Vercel API list — assert the 6 sensitive keys each appear for the intended targets and **no** sensitive key appears on both targets with a single shared entry.
3. **Build-time proof (new builds only):**
   - push a throwaway branch (approved pass) → its preview build log must show `[prebuild] VERCEL_ENV=preview — skipping all database work` and **zero** `database:` lines;
   - `get_deployment` on the new preview deployment → its `env` name-list must **not** contain `DATABASE_URL`/the production secrets (Option B) or must contain the preview-target values (Option A — names only, values never);
   - next production build → `get_deployment` env name-list unchanged (production values intact), build log shows the R1 `verify` summary line.
4. **Behavioral proof (separate approved pass):** §5 canary + session-token checks (E2).

---

## 3. Task C — Existing Preview cleanup (NOT deleted — awaiting explicit approval)

**Why deletion is required, not optional:** env vars are baked at build time. Changing targets in the console does **not** un-bake the production credentials from already-READY deployments. The only removal is deployment deletion.

### 3.1 Live (READY/STAGED) citycare-z95n previews — full verified inventory (14)

Evidence key: **env-proven** = `get_deployment` env name-list verified this pass; **env-by-timeline** = built on/after 07:55:37Z Nov 1, when the 6 sensitive vars were proven present on the first branch preview (same project, same targets); **probable** = see note.

| # (delete order) | Deployment ID | Commit (short) | Created (Z, 2026) | State | Credentials evidence |
|---|---|---|---|---|---|
| 1 | `dpl_DqZBuWTCBZi1hyZRgZeYcXRQo9QZ` | `5e0e75c` (A76, PR #5) | Nov 1 04:01:44 | READY/STAGED | **probable** — built in the same window that first applied 0005 to the prod Neon (A76's purpose); env presence not individually fetched |
| 2 | `dpl_CMH7KAzaomR2aiRUNiFQoH812EXE` | `dcee992` (PR #6, first branch deploy) | Nov 1 07:55:37 | READY/STAGED | **env-proven** (all 6 sensitive vars in runtime env) |
| 3 | `dpl_Ht4g9aaZk2XJaEpxeFxzkKuR9gE1` | `9c50e63` (PR #6) | Nov 1 09:15:03 | READY/STAGED | **env-proven** (all 6 sensitive vars in runtime env) |
| 4 | `dpl_8L3cX8cTWnnNzSRtE3KkJUUZ7HJ4` | `e51e437` (PR #6, NG-S09) | Nov 2 06:07:54 | READY/STAGED | env-by-timeline (6 sensitive vars) |
| 5 | `dpl_9qkCHfFZ572b8F1rQfafuohL2bBL` | `77dd7aa` (PR #6, NG-S15) | Nov 2 06:17:22 | READY/STAGED | env-by-timeline |
| 6 | `dpl_5okxQHNWXTKLJupjTYw2Qp3gRu93` | `f009420` (PR #6, Step-2 B1) | Nov 2 06:20:28 | READY/STAGED | env-by-timeline |
| 7 | `dpl_56DTyWxxxz8Jtzv8oQStAG6fZyt4` | (intermediate PR #6 commit) | Nov 2 06:30:46 | READY/STAGED | env-by-timeline |
| 8 | `dpl_2rr5CpKBJqXw8tuGxEpfG68E7XTB` | `e11063d` (PR #6, final tech verify) | Nov 2 08:53:10 | READY/STAGED | env-by-timeline |
| 9 | `dpl_5rSZTJVc7uLr9PUgbmfKWnVWp7PL` | `f56ea86` (Day-1 cleanup) | Nov 2 11:38:52 | READY/STAGED | **env-proven** (all 6 sensitive vars in runtime env) |
| 10 | `dpl_Gyy9QyDBHgnD1AG8wWCwN2x9B7D1` | `6475348` (PR #6, licenses) | Nov 2 12:00:52 | READY/STAGED | env-by-timeline |
| 11 | `dpl_9BVtnY7hQZXWa6kZhCCGMoaitv9X` | `aee68db` (PR #8 docs) | Nov 2 13:18:07 | READY/STAGED | env-by-timeline (all **9** vars — plain 3 existed by then) |
| 12 | `dpl_2cM2PRMnHUTJCsQusHMZJWXMceeF` | `e950f26` (PR #9 initial) | Nov 2 14:08:37 | READY/STAGED | env-by-timeline (9 vars) |
| 13 | `dpl_BqBixZww9fkW2dmxeeWi53V2ec66` | `79bc78e` (PR #9 F1–F3) | Nov 2 14:42:37 | READY/STAGED | env-by-timeline (9 vars) |
| 14 | `dpl_2zqKaAvTDD7Bruo9cNtvpcyKdq8n` | `c28604b` (PR #9 head = merged code) | Nov 2 15:05:27 | READY/STAGED | env-by-timeline (9 vars) — **last**, so the owner can review the merged-code preview until deletion |

**Orphan `web` project:** 0 credentials on every deployment (project env list = empty, verified this pass). Its previews are not in the deletion list above; the fix for that project is **project deletion** (owner action, pre-existing checklist item) — note its "production" deployment `dpl_95q7dz` (b8d4e74, PROMOTED) serves an app with no DB and no secrets: broken but harmless; deleting the project removes the Hobby build-minute waste from every push.
**Uncovered window (honest bound):** deployments older than 19:02:51Z Oct 31 (below cursor `1793473571180`) were not enumerated — project-creation era. The execution pass re-enumerates first (§3.3); if any additional citycare READY previews appear there, they enter the deletion list before deletion.

### 3.2 Deletion order + protocol (execute ONLY on explicit owner approval)

Order = oldest → newest as tabled above (most-diverged/stale first; #14 last so the merged-code preview survives until the owner is ready).

Per deployment:
1. `delete_deployment <id>` (Vercel API — reversible? **NO, deletion is permanent**; the code remains in Git, any deployment can be recreated by re-pushing the branch).
2. Re-list → confirm the ID is gone (or marked deleted).
3. After all 14: re-list and assert **zero** `target=null` READY deployments remain in `citycare-z95n` (excluding any created between now and execution).
4. Production is **untouched**: none of these hold `citycare-z95n.vercel.app` (all branch-scoped aliases only — verified in the inventory); production stays on `dpl_963rr6…` @ `ad6f71a` until the separately-approved deploy.

**Optional hygiene (no live runtime, same approval scope):** CANCELED/ERROR records — `dpl_4Zj2Sj` (4b76258), `dpl_E81Mg3` (93d5c5d), `dpl_C3uSmh` (0fe6b4e), `dpl_JALPEz` (60f9c63), `dpl_H6V9Hu` (2b5122c, prod build error), `dpl_EwXSui` (c47f9ff, prod build error), `dpl_2vWF` (b8d4e74, the audited cancel). Purely cosmetic — skip if preferred.

---

## 4. Task D — R1 code remediation design (design only — NOT implemented)

### 4.1 Current code facts (inspected this pass)

- `web/package.json`: `"prebuild": "node scripts/prebuild-schema-sync.mjs"` runs before **every** `npm run build` (Vercel build, local build, CI).
- `web/scripts/prebuild-schema-sync.mjs` (31 lines): the **only** guard is `if (!process.env.DATABASE_URL) { …skip…; exit 0 }`; otherwise it spawns `db-bootstrap-node.mjs` with the full process env — **no target awareness** (`VERCEL_ENV` is set by Vercel on every build but never read). This is the structural root cause.
- `web/scripts/db-bootstrap-node.mjs` (134 lines): implicit fallback `const URL_ = process.env.DATABASE_URL ?? "postgres://citycare:citycare@127.0.0.1:5432/citycare"` (silent-default anti-pattern); full bootstrap = base SQL on fresh DB + **all migration files on every run** + `ALTER DATABASE`/`ALTER ROLE` + read-only assertions + seed-gate (`resolveDemoSeedAction`) + seed; the seed gate runs **after** the schema section (it gates seeding only, not schema work).
- `web/vercel.json`: crons manifest; `functions` config. No prebuild config there (wiring is the npm hook).
- The seed gate core (`web/src/lib/demo-seed-core.mjs`) is a **pure function on `process.env`** with a 25-combination unit-test matrix (Day-2, A/WS-C) — the established pattern to extend.

### 4.2 Target state (requirements → design)

| Requirement (brief) | Design |
|---|---|
| Normal Vercel builds never automatically execute production migrations | Production builds run **verify-only** by default (read-only checks); the migration/DDL path runs only under an explicit `SCHEMA_SYNC_MODE=apply` |
| Preview builds never connect to production databases | `VERCEL_ENV=preview` → **hard skip before any DB code is loaded/spawned**; no flag can override; missing `DATABASE_URL` is fine (exit 0) |
| Missing `DATABASE_URL` never silently falls back | Preview: skip (exit 0). Production: **fail the build** (exit 1). The bootstrap's `?? local-default` line is **removed** — no implicit default anywhere |
| Migration execution requires an explicit controlled operation | `SCHEMA_SYNC_MODE` closed enum `{verify, apply}` (default `verify`; unknown value → exit 1). `apply` is an owner-controlled, production-only env (or an explicit manual script run); documented runbook step for every new migration |
| Runtime and migration credentials separable | New optional `MIGRATION_DATABASE_URL`: the **apply engine** uses it when set (future R7: DDL-capable migration role), else `DATABASE_URL`; the **verify engine** always uses `DATABASE_URL` (read checks work with a no-DDL runtime role) |
| Fail-closed validation is tested | New pure decision module + ~27-case unit matrix + LOCAL-DEMO e2e §18.10/§18.11 (child-process runs of the real scripts against the loopback demo PG with before/after `pg_stat_activity` diffs, same pattern as §18.9) |
| Existing production builds remain compatible | Verify-only asserts exactly the invariants the current production DB already satisfies (36 tables, ledger fns, tamper trigger, 3 partial indexes, UTC — proven by the last three builds) → the post-R1 production build of `b8d4e74`-plus-R1 passes without any schema change; local `npx next build` without `DATABASE_URL` is unchanged |

### 4.3 File-level design (minimal diff)

**D1. `web/scripts/prebuild-schema-sync.mjs` — rewrite as a policy gate (~80 lines, no `pg` import, no DB code):**
```
target = process.env.VERCEL_ENV ?? "development"     // Vercel sets {production, preview, development}

preview:     log "[prebuild] VERCEL_ENV=preview — skipping all database work (no DB access from preview builds, by design)"
             → exit 0    (SCHEMA_SYNC_MODE / force flags IGNORED on preview — migration execution is structurally impossible)

development: no DATABASE_URL → log skip → exit 0     (unchanged local behavior)
             else → run db-bootstrap-node.mjs as today (local dev flow, local DB from .env.local)

production:  no DATABASE_URL → log error → exit 1    (FAIL — never a default)
             validate: new URL(DATABASE_URL); protocol ∈ {postgres:, postgresql:}; host non-empty
                       (parse, never regex — A98 lesson; failure → exit 1)
             mode = SCHEMA_SYNC_MODE ?? "verify"     // closed enum; unknown → exit 1
             verify → run db-verify-node.mjs (read-only) ; exit with its status
             apply  → run db-bootstrap-node.mjs (unchanged engine) ; exit with its status

always:      one-line summary to build log (R9):
             "[prebuild] summary: target=<t> mode=<m|skip> db=<host only, no creds> dml=0 ddl=0"
```

**D2. `web/scripts/db-verify-node.mjs` — new (~70 lines, read-only):** connect with `DATABASE_URL`; run the bootstrap's existing **read-only assertion block verbatim** (current_database, version, `≥25 tables`, `ledger_append/verify`, tamper trigger, 3 partial unique indexes, fresh-session `show timezone = UTC`); exit 0/1. **No DDL, no ALTER, no seed, no file writes.** Log the same `verified: N tables · …` line operators already recognize.
*Honest trade-off (stated, not hidden):* with no applied-migrations ledger table, verify asserts **end-state invariants**, not per-file application. A *future* unapplied migration would not be detected by verify — the controlled `apply` step is the mechanism for it, and the runbook makes it mandatory (below). Automatic per-file drift detection = P2 enhancement (add a `schema_migrations` ledger table in a later, separately-approved migration).

**D3. `web/scripts/db-bootstrap-node.mjs` — minimal changes (it remains the **only** DDL/seed engine):**
- remove the `?? "postgres://citycare:citycare@127.0.0.1:5432/citycare"` fallback → missing `DATABASE_URL` = exit 1 with an explicit message;
- `const URL_ = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL` (apply path only; verify uses `DATABASE_URL` directly);
- nothing else changes (migrations order, assertions, seed spawn unchanged).

**D4. `web/src/lib/demo-seed-core.mjs` — target-aware hardening (pure function, env extended with `VERCEL_ENV`):**
- NEW rule: `VERCEL_ENV=production` + `SEED_DEMO=1` (any `RETENTION_POLICY`) → **refuse** (a build must never demo-seed a production database; fail-closed, exit non-zero from the bootstrap, DB untouched);
- all existing 25-combination matrix cases unchanged; add ~6 new matrix rows (production×SEED_DEMO×{demo,pilot,missing}); existing `web/test` seed-gate file extends; e2e §17 gains the production+SEED_DEMO=1 refusal check (LOCAL-DEMO: simulate `VERCEL_ENV=production` against the loopback demo PG — loopback-gated like §18.9, so no production-accessible switch exists).
- Retention purge: already policy-gated (`retention-core.mjs`, fail-safe) and reachable only via the production cron + owner-run scripts; R2 gives preview a separate DB/`RETENTION_POLICY=demo`, and §5 (E5) proves the sweep never runs outside a `demo`-policy environment. No new purge surface is created by R1.

**D5. `web/vercel.json` / `package.json`:** unchanged (wiring stays; crons unchanged).

### 4.4 Runbook addition (docs, part of the R1 pass)

`web/docs/operations/…` (isolation doc, §5 update): **"Deploying a new migration" = 2 steps:** (1) merge the migration to `main`; (2) for that one production build, set `SCHEMA_SYNC_MODE=apply` (production-only env, removed afterward) so the build log must show `migration applied: 000N`; a normal merge-deploy stays verify-only. Also: preview builds never require `DATABASE_URL` at all (Option B) or point at the isolated preview DB (Option A) — either way, never the production URL.

### 4.5 DRAWBACKS entries to add when implementing (per standing rule — nothing fixed silently)

- new A-entry: R1 target-gate + verify/apply split (what changed, why, compatibility proof: production build passes verify-only on the current DB; local no-URL build unchanged);
- new D-entry (if D4 lands): the `?? local-default` removal is a behavior change for direct `db-bootstrap-node.mjs` invocations without `DATABASE_URL` (they now fail loudly instead of defaulting to loopback);
- NG-S10/S11/S14 register: no status change (S15-style PARTIALLY IMPLEMENTED only after the full E1–E5 evidence exists).

---

## 5. Task E — Verification strategy (each property → executable proof)

All tests labeled with environment (LOCAL-DEMO loopback / Vercel build-log / deployment-record / canary). **None of these were executed in this pass — all are the plan for the approved implementation/verification passes.**

| # | Property to prove | Test / evidence | Where it runs |
|---|---|---|---|
| E1 | Preview build does **not** connect to the production DB | (a) unit: preview target → decision `skip`, **no** bootstrap spawn, no `pg` import path exercised (spy on `spawnSync`); (b) e2e **§18.10** (LOCAL-DEMO): child-process run of the real prebuild script with `{VERCEL_ENV: "preview", DATABASE_URL: <loopback demo PG>}` → exit 0 + log line `skipping all database work` + **zero** delta in `pg_stat_activity`/connection count (before/after diff, §18.9 pattern — proves no connection attempt even when a URL *is* present); (c) Vercel build log: throwaway-branch push (approved) → preview build shows the skip line and **zero** `database:` lines; (d) deployment record: post-R2 new preview env name-list lacks the production secrets (Option B) | vitest + e2e (local) + build log + `get_deployment` (names only) |
| E2 | Preview runtime cannot use production credentials | post-R2: (a) new preview deployment env name-list = preview-only values (names only); (b) **canary** (approved pass): isolated preview DB seeded; a canary marker row inserted in the **production** DB (owner/agent, approved, then deleted) is **not** visible in any preview API/UI read, and preview demo logins work against the preview DB only; (c) **session-token incompatibility**: a session token minted under the preview `SESSION_SECRET` is rejected by production verification (and vice versa) — cryptographic consequence of distinct keys, demonstrated with a single failed auth attempt in each direction | deployment record + canary (approved) + one auth probe per direction (approved) |
| E3 | Preview migration execution is **blocked** | unit: `VERCEL_ENV=preview` + `SCHEMA_SYNC_MODE=apply` (and any force flag) → still `skip` (flags ignored on preview — closed by the gate, not by a check that can be bypassed); build-log check (E1c) shows no `migration applied:` lines in any preview build | vitest + build log |
| E4 | Production migration execution available **only** through the explicitly authorized process | unit: `{production, mode unset} → verify` (e2e §18.11 LOCAL-DEMO: run against loopback demo PG → exit 0, **zero** DDL: no `migration applied:` lines, before/after schema-identity check via `pg_class`/`pg_index` snapshot diff); `{production, mode=apply} → apply` (same local run → migrations execute, assertions pass); `{production, no URL} → exit 1`; `{production, bogus mode} → exit 1`. Runbook step documented (§4.4). Post-R7 (later): least-privilege proof — runtime role without DDL rights → `CREATE INDEX` attempt as runtime user fails 42501 (owner console step, separate pass) | vitest + e2e §18.11 (LOCAL-DEMO) + runbook + (later) role test |
| E5 | No demo seed or retention purge reaches production | unit: D4 matrix — `production × SEED_DEMO=1 × {demo,pilot,missing}` → **refuse** (build fails, DB untouched); existing 25-case matrix unchanged; e2e §17 extension: `VERCEL_ENV=production` (simulated, LOCAL-DEMO loopback) + `SEED_DEMO=1` + `RETENTION_POLICY=demo` → refused, marker row + user count unchanged. Retention: existing `retention-core` tests (sweep runs only under verified `RETENTION_POLICY=demo`) + cron facts (§2.3: crons fire on the production environment; R4 dashboard confirmation) + post-R2 `RETENTION_POLICY` per-target values | vitest + e2e §17 (LOCAL-DEMO) + cron confirmation |

**Gauntlet for the R1 pass (all LOCAL-DEMO, on the fix branch, before merge):** `npx vitest run` (249 existing + ~33 new gate/seed-gate cases) · `tsc` 0 · `eslint` 0 · `npm run build` 0 errors (no `DATABASE_URL` → skip path; with `.env.local` → dev path) · `node scripts/e2e.mjs` (336 existing + §18.10/§18.11 ≈ 8 new checks; ≤1 run per rate-limit window; fresh reseed before final run per standing discipline).
**Post-merge evidence (approved passes):** production build log shows the `verify` summary line (no DDL) · production `/api/health` → 200, `db.reachable=true`, `ledgerBreaks=0` · throwaway-branch preview build log shows the skip line · E2 canary. Every claim reported with command + count + SHA + env label (standing rule).

**Important sequencing note:** merging R1 to `main` **auto-deploys to production** (the chosen model: merges = deploys). That production build is verify-only against the current prod DB (no schema change) and **supersedes** the still-pending standalone `b8d4e74` deploy decision — the owner should state this explicitly when approving the R1 merge (it includes the previously-withheld `b8d4e74` code).

---

## 6. Execution sequence (for approval, nothing starts without it)

| Step | Actor | Gated by |
|---|---|---|
| S1 | **R1 code pass** (D1–D5 + tests + runbook + DRAWBACKS) on a branch; local gauntlet (E-unit + §18.10/§18.11); PR with full evidence in description | owner approval to implement (this brief is preparation only) |
| S2 | **Merge R1** → auto production build (verify-only, no DDL; includes b8d4e74 code) + CI green | owner approval (merge = deploy, stated) |
| S3 | **R2 env split** in Vercel console (§2, per-target values; never printed) | after S2 merged (so the next preview build tolerates the missing/changed preview DB) |
| S4 | **R3 preview deletion** — 14 IDs in §3.2 order + re-enumeration first (closes the Oct 31 window) | owner approval; owner may delete in console instead |
| S5 | **Verification pass** — throwaway-branch preview build log (E1c), E2 canary + session probe, R4 cron dashboard confirmation, post-S3 list assertion (zero live previews) | owner approval (preview/prod probes happen only here) |
| S6 | Optional: orphan `web` project deletion · R5 `RETENTION_POLICY` production decision recorded · P2 items (R7 least-privilege roles, R8 CI dual-target guard, R9 already inside D1, migration ledger table) | separate approvals |

**Strict stop conditions honored in this pass:** no Vercel environment changes · no preview deletion · no code modifications (audit-report corrections = documentation of an uncommitted draft, per this brief's Task A) · no commits or pushes · no migrations · no deployment · no production DB access (zero sandbox→production connections; all Vercel calls read-only) · no D74 · no Day 4.

**STOP — plan delivered. Awaiting explicit owner approval on: (a) commit both docs? (b) implement R1 (S1) now? (c) R2 Option A vs B + TZ_POLICY decision? (d) R3 deletion scope (14 IDs)? (e) merge = deploy acknowledgment for S2.**
