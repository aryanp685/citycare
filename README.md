# CityCare — BCA Final Year Group Project

Unified healthcare & patient health record platform. Patient-owned longitudinal
record, consent-based sharing with doctors, appointment booking, and a guarded
AI layer.

## Read in this order

1. **`PLAN_REVIEW_AND_DRAWBACKS.md`** — start here (28 Sep). The plan audited
   against the built system: 21-row plan-vs-built table, the facts the plan got
   wrong (RxNav, retention, DPDP dates) with sources, a 40-item drawback register
   with severity/mitigation/status, fixes A37–A46 with evidence, a 16-item
   roadmap and a 5-person team split.
2. **`CITYCARE_PROJECT_PLAN.md`** (v2) — the original teardown with inline
   `[v2: …]` corrections. Pros, cons with alternatives, scope discipline, demo
   script, viva prep.
3. **`AI_ACCURACY_AND_HALLUCINATION.md`** — how the AI layer is kept safe, with
   measured accuracy numbers.
4. **`schema/README.md`** — the database, and the double-booking bug that
   testing found.
5. **`web/FEATURES.md`** — the feature programme: stack versions (and the two
   blocked upgrades with reasons), F1–F4 + L1–L4 + F7/F8/F13/F15 shipped with
   proof, the rest queued in payoff order.
6. **`web/LEGAL_COMPLIANCE.md`** — the legal register: which Indian laws apply
   (DPDP Act 2023 + Rules 2025, IT Act/SPDI, NMC ethics, Copyright), the control
   matrix with proof, the honest gaps (L-G1/3/5 closed in code; L-G2/4 partial;
   L-G6/7/8 open and why) and the breach runbook around `/admin/incidents`.
7. **`web/DEPLOY_SUPABASE.md`** — the scripted move to Supabase Postgres (Mumbai)
   + Vercel `bom1`; waiting only on a Supabase session-pooler URI.

## Run everything

```bash
# Database: schema -> SQL -> clean DB -> smoke test -> guardrail test
# Needs a running PostgreSQL with role/db "citycare":
#   sudo apt-get install -y postgresql
#   sudo pg_ctlcluster 17 main start
#   sudo -u postgres psql -c "CREATE ROLE citycare LOGIN PASSWORD 'citycare' SUPERUSER;"
cd schema && npm install && bash run_tests.sh

# AI layer: accuracy benchmark (pure Python, no dependencies)
cd ai_layer && python3 eval.py

# AI layer: 20 regression tests
cd .. && python3 -m unittest discover -s ai_layer -v
```

Two environment notes found while verifying:
- `prisma` is pinned to **6.19.3** in `schema/package.json`. Prisma 8 is a
  different product and does not implement `prisma validate` or
  `prisma migrate diff`, which this script depends on.
- `node_modules` and installed system packages do not survive a workspace
  snapshot, so run `npm install` again in a fresh session. If `run_tests.sh`
  reports `psql: command not found` even though the server is installed, it
  will now fall back to `/usr/lib/postgresql/<version>/bin` automatically.

## What has actually been verified

| Claim | How it was checked |
|---|---|
| Schema is valid and complete | `prisma validate`; 25 tables / 71 indexes / 38 FKs applied to a real PostgreSQL 17.11 |
| The product story works end to end | `smoke_test.sql` — patient, scoped consent, doctor access, audit log, five real queries |
| Double-booking is prevented | `gap_test.sql` — rejected by a partial unique index, and a cancelled booking correctly frees the slot |
| The audit log cannot be tampered with | DB trigger refuses UPDATE and DELETE |
| The rule engine is exact | 6 expected alerts, 0 missed, 0 spurious |
| Hallucinated claims are caught | 6/6 injected hallucinations caught, 0 correct summaries wrongly blocked |
| The guard layer has tests | 20 unit tests, all passing |
| The audit ledger is tamper-evident **in the live database** | `schema/sql/ledger.sql` — 31-row stress, in-place edit detected, row deletion detected, 4-way concurrent-append race clean, and verify reports 0 breaks even when the session timezone is switched to +14 |
| **The website exists and works** | `web/` — Next.js 16 + React 19 + Tailwind 4 on this exact schema; `tsc` strict clean, 48 unit tests, `next build` OK, and `scripts/e2e.mjs` 43/43 over HTTP: signup → booking 409s → consent 403/grant/200 → safety 422/override → revoke → instant 403 → patient-visible ledger verified |

## The website (`web/`)

Full stack app over this schema — no Prisma in the runtime (raw `pg`; the SQL files are
the source of truth). Quick start:

```bash
cd web
npm install && npm run seed && npm test     # 48 unit tests
npm run dev                                 # dev server on :3000
node scripts/e2e.mjs                        # 43 HTTP assertions (server must be running)
```

Demo logins (password `city1234`): `ramesh@demo.in`, `anita@demo.in`, `vikas@demo.in`
(patients) · `dr.kulkarni@demo.in` (doctor). Everything about its honest gaps, and the
~20 real bugs found & fixed while building it (timezone-ghost chains, cancelled-token
deadlock, plpgsql traps…), is in **`web/DRAWBACKS_AND_BUGFIXES.md`**.

## What has NOT been verified

- **No real LLM was called.** `extract.py` ships a `MockExtractor` for offline
  benchmarking and a `GeminiExtractor` stub for real use. Extraction accuracy
  on a real model must be measured by you and reported honestly.
- **No real patient data.** Everything here is synthetic by design.
- **No live integrations.** ABDM sandbox, RxNav and the SMS gateway are
  described, not connected. Likewise OCR is simulated (pasted text) and file
  storage is unimplemented — `Document` rows carry checksum/IV fields by design.
- **`npm run build` needs ~1.5 GB free RAM** (worked here with
  `NODE_OPTIONS=--max-old-space-size=1150`; OOM-killed at default on this 2 GB box).

### Deploy

**Live: https://citycare-xi.vercel.app** (Vercel Hobby, functions in `sin1`, Neon Free Postgres in Singapore via the Vercel Marketplace; demo `ramesh@demo.in` / `city1234`). Verified with the full e2e suite against the live URL (52 passed · 0 failed · 5 not-applicable).
```bash
cd web && export VERCEL_TOKEN=… DATABASE_URL='postgresql://…neon.tech/neondb?sslmode=require'
npm run vercel:deploy      # db bootstrap → link → env → deploy → smoke test   (web/DEPLOY_VERCEL.md)
```
Alternative, also prepared and verified on the Cloudflare runtime locally (free plan has a 10 ms CPU limit → weaker scrypt; better on Workers Paid):

```bash
cd web
export CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… DATABASE_URL='postgresql://…?sslmode=require'
npm run cf:deploy          # schema → seed → Hyperdrive → build → deploy → secret → smoke test
```
Details, trade-offs (free-plan 10 ms CPU → scrypt 4096, per-query connections through
Hyperdrive) and what was / was not verified: `web/DEPLOY_CLOUDFLARE.md`.
Sandbox note: wrangler needs Node ≥ 22 → `curl -sSL https://nodejs.org/dist/latest-v22.x/node-v22.23.3-linux-x64.tar.xz | tar -xJ -C ~/.local && mv ~/.local/node-v22* ~/.local/node22; export PATH=~/.local/node22/bin:$PATH`.
