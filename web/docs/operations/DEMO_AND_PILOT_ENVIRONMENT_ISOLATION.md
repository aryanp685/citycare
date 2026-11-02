# CityCare — Demo & Pilot Environment Isolation (NG-S14)

**Status: code + tests complete (local + CI evidence); existing pilot-DB cleanup and production env vars are owner-side actions.**
Last updated: 2026-11-02 (Day 2).

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
| 5 | **Real-data pilot / production** | `internal` or `pilot` | **`0` (required, explicit)** | `0` (banner OFF) | **REFUSED** — the seed gate refuses to run (exit 2); demo identities cannot exist; published demo credentials get 401 | permanently OFF (real data is never auto-erased) |

Rules encoded in code (not convention):

- **No hostname inference** — the decision is made only from explicit env vars
  (`RETENTION_POLICY` + `SEED_DEMO`). Nothing inspects the domain/hostname.
- **No contradictory setting silently enables demo accounts** — the only paths that create
  demo accounts are `RETENTION_POLICY=demo` (with `SEED_DEMO != 0`) or an explicit
  `SEED_DEMO=1` on an *unverified* environment (which prints a loud warning). Any
  real-data policy with `SEED_DEMO=1` or unset `SEED_DEMO` is **refused (exit 2)**.
- **The public demo keeps working in its synthetic environments** — nothing was removed
  from envs 1–3; e2e check "existing public demo is still functional" pins this.
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

| `RETENTION_POLICY` | `SEED_DEMO` | action |
|---|---|---|
| `demo` | unset / `1` | **seed** (synthetic-demo default; backward-compatible) |
| `demo` | `0` | **skip** (exit 0, nothing written, nothing truncated) |
| `internal` / `pilot` | `0` | **skip** (exit 0 — operator explicitly opted out) |
| `internal` / `pilot` | `1` | **REFUSE** (exit 2 — contradictory) |
| `internal` / `pilot` | unset | **REFUSE** (exit 2 — fail-safe default) |
| missing / invalid | `0` | **skip** |
| missing / invalid | `1` | **seed + LOUD warning** (explicit operator decision on an unverified env) |
| missing / invalid | unset | **REFUSE** (exit 2 — fail-safe default) |

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

## 4. Test evidence (2026-11-02, commit `arena/f1f3a0ac-citycare` Day 2)

**Unit — `web/src/lib/__tests__/demo-seed-core.test.ts`: 14/14 passed** (full config matrix,
fail-safe defaults, contradiction refusal, flag normalisation, no secrets in decision output).

**E2E — `scripts/e2e.mjs` section 17 "NG-S14" (19 checks), executed on isolated scratch
databases + a real pilot app instance; 305/305 suite green, exit 0:**

1. demo mode: seed runs (SEED_DEMO=1) → 11 demo identities; default (unset) also seeds
2. pilot mode: unset SEED_DEMO REFUSES (exit 2, zero rows); SEED_DEMO=0 skips cleanly
3. production-grade mode (internal): SEED_DEMO=0 skips (zero rows)
4. contradictory (SEED_DEMO=1 on real data) REFUSED — **and a pre-seeded marker row
   survives**, proving the gate fires before any write
5. unverified env (no RETENTION_POLICY, no SEED_DEMO) REFUSED by default
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
