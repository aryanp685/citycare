# CityCare — Demo & Pilot Environment Isolation (NG-S14)

**Status: code + tests complete (local + CI evidence); existing pilot-DB cleanup and production env vars are owner-side actions.**
Last updated: 2026-11-02 (Day 2 + final security correction — the seed gate is now **strictly fail-closed**, see §2).

The risk (NG-S14): published demo credentials (`ramesh@demo.in` / `city1234`, and the other
`@demo.in` identities — they are in the README, the runbook, and the UI on demo deployments)
must **never** become valid accounts in a real-data (internal/pilot) deployment. This document
defines the five environments, the single chokepoint that enforces the separation, and the
exact owner-side actions.

---

## 1. The five environments

| # | Environment | `RETENTION_POLICY` | `SEED_DEMO` | `NEXT_PUBLIC_DEMO_MODE` | Demo accounts? | Demo sweep |
|---|---|---|---|---|---|---|
| 1 | **Public synthetic demo** (the deployed demo site) | `demo` | unset or `1` | unset (banner ON) | YES — seeded by `seed.mjs` | armed (7-day erasure of demo signups) |
| 2 | **Local development** (this sandbox / a dev laptop) | `demo` | unset or `1` | unset (banner ON) | YES (same as #1) | armed |
| 3 | **Internal testing / CI** (throwaway DBs) | `demo` | unset or `1` | unset (banner ON) | YES — CI bootstraps `FORCE_SEED=1` with `RETENTION_POLICY=demo` | armed (the S15 e2e checks assert it) |
| 4 | **Internal testing without demo data** (pure schema) | `demo` | `0` | either | NO — `seed.mjs` skips (nothing written) | armed but nothing to sweep |
| 5 | **Real-data pilot / production** | `internal` or `pilot` | **`0` (required, explicit)** | `0` (banner OFF) | **No** — with `SEED_DEMO=0` the gate skips (nothing written); with `SEED_DEMO` unset or `1` the gate **refuses** (exit 2). Demo identities cannot exist; published demo credentials get 401 | permanently OFF (real data is never auto-erased) |
| — | **Unverified environment** (missing/invalid `RETENTION_POLICY`) | missing/invalid | anything | — | **No — REFUSED regardless of `SEED_DEMO`** (strictly fail-closed; an unverified DB is never seeded, and the run does not silently "skip" either) | — |

Rules encoded in code (not convention):

- **No hostname inference** — the decision is made only from explicit env vars
  (`RETENTION_POLICY` + `SEED_DEMO`). Nothing inspects the domain/hostname.
- **Strictly fail-closed (final security correction, 2026-11-02)** — the **only** path that
  creates demo accounts is `RETENTION_POLICY=demo` with `SEED_DEMO` unset or exactly `1`.
  A missing/invalid `RETENTION_POLICY` **refuses regardless of `SEED_DEMO`** (an unverified
  environment is never seeded, and does not silently "skip" either); an invalid `SEED_DEMO`
  value (anything not exactly `0`/`1`) **refuses** instead of being guessed as unset. The
  earlier "explicit `SEED_DEMO=1` on an unverified environment seeds with a loud warning"
  path was **removed** in that correction.
- **The public demo keeps working in its synthetic environments** — nothing was removed
  from envs 1–4; e2e check "existing public demo is still functional" pins this.
- **Demo cleanup stays compatible with Day 1 retention safeguards** — the demo sweep
  (NG-S15) is unchanged; in real-data envs the sweep is off by the pre-existing policy
  rule, and `@demo.in` remains the protected domain + reserved signup domain regardless.

## 2. The chokepoint: `src/lib/demo-seed-core.mjs`

`scripts/seed.mjs` is the **only** code that creates demo accounts — self-signup on
`@demo.in` is refused server-side (`reserved_domain`, unconditional, in
`/api/auth/signup`). Day 2 added the gate:

```
resolveDemoSeedAction(env) → { action: "seed" | "skip" | "refuse", reason, warning, exitCode }
```

**Strictly fail-closed matrix** (final security correction, 2026-11-02 — an invalid
`SEED_DEMO` value = present, non-empty, and not exactly `0`/`1`; an empty/unset value = unset):

| `RETENTION_POLICY` | `SEED_DEMO` | action |
|---|---|---|
| `demo` | unset / `1` | **seed** (synthetic-demo default; backward-compatible — the ONLY seed path) |
| `demo` | `0` | **skip** (exit 0, nothing written, nothing truncated) |
| `demo` | invalid value | **REFUSE** (exit 2 — never guessed as unset) |
| `internal` / `pilot` | `0` | **skip** (exit 0 — operator explicitly opted out) |
| `internal` / `pilot` | `1` | **REFUSE** (exit 2 — contradictory) |
| `internal` / `pilot` | unset | **REFUSE** (exit 2 — fail-safe default) |
| `internal` / `pilot` | invalid value | **REFUSE** (exit 2) |
| missing / invalid | `0` | **REFUSE** (exit 2 — the environment itself is unverified) |
| missing / invalid | `1` | **REFUSE** (exit 2 — unverified envs never seed, even when explicitly requested) |
| missing / invalid | unset / invalid | **REFUSE** (exit 2) |

The gate fires **before any database connection or write**: a refused or skipped run leaves
the target database byte-for-byte untouched (no TRUNCATE, no inserts). `seed.mjs` exits `0`
on skip, `2` on refuse, and both bootstrap scripts (`db-bootstrap.sh`,
`db-bootstrap-node.mjs`) honour the decision — a skipped bootstrap reports
"schema only, no demo data" and succeeds; a refused one fails loudly with the reason.

`SEED_DEMO` values: only exactly `0`/`1` (trimmed) are recognised; anything else is treated
as *unset* (never a silent enable). Added to `web/.env.example` with the full matrix.

## 3. UI disclosures (accurate per environment)

`DEMO_MODE` (from `NEXT_PUBLIC_DEMO_MODE`, baked at build time — a real deployment is
**built** with `NEXT_PUBLIC_DEMO_MODE=0`):

- Demo banner, landing "Try it with the demo accounts" CTA, login-page demo-credential
  hint, and the legal pages' "Public demo notice" are all shown **only** when `DEMO_MODE`.
- Day 2 fixed the two spots that were *not* gated: the login page pre-filled
  `ramesh@demo.in` on every deployment and showed the demo-credential hint line unconditionally;
  the landing CTA listed demo credentials unconditionally. Both are now `DEMO_MODE`-gated
  (the non-demo build gets a plain sign-in/sign-up CTA).
- A pilot/production build therefore presents **no** demo credentials anywhere in the UI,
  and `@demo.in` signups are refused even if someone tries (reserved domain, unconditional).

## 4. Test evidence (2026-11-02, Day 2 + final security correction)

> **Isolated test deployment — not a production pilot (F4).** Every "pilot mode" result in
> this document was produced against an **isolated throwaway test deployment and database**:
> e2e section 17 creates fresh scratch PostgreSQL databases (`citycare_e2e_pilot_*`) and a
> **local** `next start` instance bound to `127.0.0.1` (port 3007) pointed at one of those
> scratch DBs, then drops all of them. It is NOT the live `citycare-z95n.vercel.app`
> deployment and NOT any real pilot database. No claim in this section is a claim about a
> production pilot.

**Unit — `web/src/lib/__tests__/demo-seed-core.test.ts`: 20/20 passed** (the full 25-way
`RETENTION_POLICY × SEED_DEMO` matrix asserted exactly, strictly fail-closed defaults,
contradiction refusal, invalid-flag refusal, missing-policy + `SEED_DEMO=1` refusal, flag
normalisation, and no-secrets-in-decision-output for every combination).

**E2E — `scripts/e2e.mjs` section 17 "NG-S14" (20 checks), executed on isolated scratch
databases + a local pilot app instance; 306/306 suite green, exit 0:**

1. demo mode: seed runs (SEED_DEMO=1) → 11 demo identities; default (unset) also seeds
2. pilot mode: unset SEED_DEMO REFUSES (exit 2, zero rows); SEED_DEMO=0 skips cleanly
3. production-grade mode (internal): SEED_DEMO=0 skips (zero rows)
4. contradictory (SEED_DEMO=1 on real data) REFUSED — **and a pre-seeded marker row
   survives**, proving the gate fires before any write
5. unverified env (no RETENTION_POLICY, no SEED_DEMO) REFUSED by default — **and**
   unverified env + `SEED_DEMO=1` REFUSED as well (strictly fail-closed; the pre-seeded
   marker row survives, zero users) — the final-security-correction headline case
6. pilot app boots on a fresh pilot DB; `/api/health` reports `policy=pilot,
   enabled=false, policy_disables_sweep`
7. published demo credentials (`ramesh@demo.in`, `dr.kulkarni@demo.in`) → **401** on the
   fresh pilot DB
8. normal patient registration → 201 + live session (role PATIENT)
9. normal doctor registration → 201 + fresh login 200
10. no demo records in the pilot DB (zero `@demo.in` users, zero seeded hospitals) while
    the real registration is present
11. retention safe on pilot: daily cron → sweep disabled, 0 patients/doctors swept
12. existing public demo still functional on the synthetic demo env (login + home 200)
13. cleanup: all scratch DBs dropped, no leftovers (pilot app killed as a whole process
    group — an orphaned `next-server` child from an earlier run had contaminated one
    previous run and was root-caused; fixed with `detached` spawn + group kill + port
    pre-check; see `DRAWBACKS_AND_BUGFIXES.md` A92)

## 5. Owner-side actions (not done by the agent — no production access)

**Current Vercel production configuration (set 2026-11-02 during the owner-approved
deploy — logged as A93, Day-2 report §11.7).** The production project
`citycare-z95n` (`citycare-z95n.vercel.app`) is the **public demo** environment and now
runs with `RETENTION_POLICY=demo`, `SEED_DEMO=0` (deploys schema-sync + verify only —
the seeded demo database is never touched by a deploy), and `NEXT_PUBLIC_DEMO_MODE=1`
(demo-credential disclosures stay visible, as the previously-live build already showed
them). This is a different environment from the pilot/production checklist below: the
pilot gets its **own project + own database** with `RETENTION_POLICY=internal|pilot`,
`SEED_DEMO=0`, `NEXT_PUBLIC_DEMO_MODE=0` + a dedicated redeploy.


- [ ] **Pilot/production deployment env vars** (Vercel project → Settings → Environment
  Variables, all environments):
  - `RETENTION_POLICY=internal` (or `pilot`)
  - `SEED_DEMO=0`
  - `NEXT_PUBLIC_DEMO_MODE=0` (**build-time** var — the production project must be
    **redeployed** after setting it so the client bundle bakes the banner-off state)
- [ ] **Existing pilot database audit**: `SELECT count(*) FROM "User" WHERE email
  ILIKE '%@demo.in';` — if the pilot DB was ever bootstrapped with demo data (pre-NG-S14),
  the seeded demo accounts **still exist there** (this Day 2 patch prevents future seeding
  and removes the UI presentation, but it deliberately does not touch existing rows —
  no silent deletion, no modification of patient records/audit history). Decision +
  execution is the owner's, with the documented erasure path per account (Access & trust →
  Erase my data) or a controlled, recorded deletion of exactly the seeded identities
  (`@demo.in` users + their synthetic rows), keeping the ledger verifiable.
- [ ] After redeploy: confirm `/api/health` shows `retention.policy = internal|pilot`,
  `backups.configured = true`, and the login page shows no demo hint (visual, 10 s).

## 6. What this is NOT

- Not a removal of the public demo from its synthetic environments (still fully functional
  — pinned by e2e).
- Not a data migration or deletion (no patient records or audit history modified).
- Not a claim about the live production/pilot DB state — that is the owner's audit above.

## 7. Build-time database access — the R1 prebuild target gate (2026-11-02, P0 isolation remediation)

Background: the original `prebuild` hook (A76) had a single "is `DATABASE_URL` set?"
guard with no target awareness. Vercel injects the production credentials into
**every** build (production and preview), so every preview build connected to the
**production** database and ran the full DDL pass. The 2026-11-02 read-only isolation
audit (`CITYCARE_PREVIEW_PRODUCTION_ISOLATION_AUDIT.md`) confirmed this and the shared
secrets. R1 makes the build target an explicit input and fails closed on anything
unexpected.

### 7.1 The gate (`web/src/lib/prebuild-gate-core.mjs`, unit-tested; enforced by `web/scripts/prebuild-schema-sync.mjs`)

| `VERCEL_ENV` | `DATABASE_URL` | `SCHEMA_SYNC_MODE` | behaviour |
|---|---|---|---|
| `preview` | anything | anything (ignored) | **hard skip, exit 0** — preview builds never touch a database; flag-proof (even `apply`) |
| `production` | missing / unparseable / non-postgres | — | **refuse, exit 1** — there is no fallback connection string anywhere |
| `production` | ok | missing → `verify` | **read-only verify** (`db-verify-node.mjs`): the same invariants the bootstrap asserts (tables, ledger functions, tamper trigger, partial indexes, UTC), using only SELECT/SHOW |
| `production` | ok | `apply` | **apply only as a controlled migration operation** — additionally requires `MIGRATION_TARGET` = the **newest** migration filename present in `schema/migrations/`; the mode variable alone refuses |
| `production` | ok | unknown value | **refuse, exit 1** |
| `development` | missing | — | skip, exit 0 (no implicit local default) |
| `development` | ok | ignored | full idempotent bootstrap (the explicit local dev flow) |
| missing / unknown (e.g. `ci`, `prod`, `test`) | anything | anything | **refuse, exit 1 — FAIL CLOSED**: CI and any unexpected environment can never run bootstrap/migrations through the build hook |

Notes:
- The URL is parsed with `new URL()` (never regex — A98 lesson); only the host is
  ever logged, never the connection string.
- The seed dimension is closed at its own chokepoint too: `demo-seed-core.mjs`
  refuses **all** demo seeding on a `production` target (the only skip is
  `SEED_DEMO=0` on a verified `RETENTION_POLICY`), whatever the build path is.
- `SCHEMA_SYNC_MODE` is a **build-time** knob; it changes nothing at runtime.
- **Honest trade-off:** `verify` asserts end-state invariants, not per-file
  migration application. A *future* unapplied migration is therefore NOT detected
  by a normal build — deploying a new migration requires the controlled operation
  below (until the P2 `schema_migrations` ledger table lands).

### 7.2 Controlled migration operation (runbook)

Deploying a **new migration** is a two-step, explicitly-authorized operation:
1. Merge the migration (in `schema/migrations/`, named `NNNN_snake_name.sql`) to `main`.
2. For that one production build only, set the two production-only build variables:
   - `SCHEMA_SYNC_MODE=apply`
   - `MIGRATION_TARGET=<the newest migration filename>`
   (Optionally, once R7 lands: `MIGRATION_DATABASE_URL` for a least-privilege
   DDL-capable migration role.)
3. The build log is the audit record: it must contain
   `controlled migration operation: MIGRATION_TARGET=<file>` and
   `migration applied: <file>`. A normal merge-deploy (no variables) stays
   read-only `verify`.

A temporary `SCHEMA_SYNC_MODE=apply` **alone** can never apply migrations — the
gate refuses without `MIGRATION_TARGET`, and refuses any target that is not the
newest migration present in the code being built.

### 7.3 Local + CI builds (2026-11-02 behaviour change)

- The implicit local fallback in `db-bootstrap-node.mjs`
  (`?? postgres://citycare:citycare@127.0.0.1:5432/citycare`) is **removed**: a
  missing `DATABASE_URL` now fails loudly (direct bootstrap runs included).
- `npm run build` (fires the prebuild hook) now requires an explicit `VERCEL_ENV`:
  local development = `VERCEL_ENV=development npm run build` (with
  `DATABASE_URL` exported for the auto-bootstrap, or without it for a no-DB
  build). The plain `npx next build` used by the ops contract and by CI does not
  fire the hook at all and is unchanged.
- CI declares the build step as an explicit development environment
  (`VERCEL_ENV=development`) with `DATABASE_URL` removed from that step, so the
  CI build performs **no** database work; the throwaway CI Postgres is prepared
  only by the explicit "schema + demo data" step (direct bootstrap of the
  isolated CI database).

### 7.4 Environment decisions recorded (owner, 2026-11-02)

- **Preview database: Option A** — an isolated Neon database (separate project or
  database + role) for the preview target; production and preview get separate
  `DATABASE_URL` values and separate `SESSION_SECRET` / `DOCUMENT_KEY` /
  `ANCHOR_SIGNING_KEY` / `CRON_SECRET` values. (Console execution is a separate
  owner action — see `CITYCARE_P0_ISOLATION_REMEDIATION_PLAN.md` §2.)
- **`TZ_POLICY`: keep the SAME value on both targets** — the policy semantics are
  identical in production and preview (it is a display/normalisation policy, not a
  credential and not environment-specific data); splitting would create two
  sources of truth for one policy with no functional gain. Revisit only if a
  preview-specific policy experiment is ever needed.
