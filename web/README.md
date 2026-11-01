# CityCare Web — the application

Next.js 16 (App Router) · React 19 · TypeScript 5 strict · Tailwind 4 · node-postgres.
Talks **directly** to the PostgreSQL database built by `../schema/` — the SQL files
there are the single source of truth (Prisma is not in the runtime path; see
DRAWBACKS §D1 for why).

## Run it

```bash
# 0) one-time per fresh machine/sandbox:
sudo -n apt-get update -qq && sudo -n apt-get install -y postgresql
sudo -n pg_ctlcluster 17 main start
sudo -u postgres psql -c "CREATE ROLE citycare LOGIN PASSWORD 'citycare' SUPERUSER;" || true
sudo -u postgres createdb -O citycare citycare || true
# if the db is empty or stale — rebuild schema + guardrails + ledger from scratch:
(cd ../schema && npm install && bash run_tests.sh)

# 1) deps + demo data + tests:
cd ../web
npm install
npm run seed            # demo users, doctors, records — and a VERIFIED audit chain
npm test                # 72 unit tests (slots/rules/parser/consent/auth/cookie+CSRF policy/scrypt knob/pg retry policy)

# 2a) PREFERRED for demos / the sandbox preview: production build (≈160 MB RSS, no
#     on-demand compiles; dev-mode Turbopack was OOM-killed on a 2 GB box — bug A24)
NODE_OPTIONS=--max-old-space-size=1150 npm run build
npm run start -- -H 0.0.0.0 -p 3000
# 2b) development with hot reload:
npm run dev -- -H 0.0.0.0 -p 3000

# 3) full product flow over HTTP (54 assertions incl. consent + ledger + locking + the
#    proxied-HTTPS / iframe sign-in path):
node scripts/e2e.mjs    # needs the server running; re-seeds are NOT required after

# 4) Deploy — LIVE at https://citycare-xi.vercel.app (Vercel Hobby sin1 + Neon Free Singapore) — DEPLOY_VERCEL.md
npm run db:bootstrap    # DATABASE_URL=… → schema + UTC + seed on a hosted Postgres (asserted, idempotent)
npm run vercel:deploy   # needs VERCEL_TOKEN + DATABASE_URL — see DEPLOY_VERCEL.md
# Cloudflare alternative: local Worker preview on the real runtime, and the one-command deploy
npm run cf:preview      # OpenNext build + wrangler dev on :8787 (Hyperdrive → local Postgres)
npm run cf:deploy       # needs CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID / DATABASE_URL — see DEPLOY_CLOUDFLARE.md
```

`.env.local` needs `DATABASE_URL`, `SESSION_SECRET`, `CRON_SECRET`, `DOCUMENT_KEY` (32-byte
base64 — encrypts uploaded files; without it a key is *derived* from `SESSION_SECRET` and
`/api/health` says `documentKey: "derived"`), `ANCHOR_SIGNING_KEY` (Ed25519 PKCS8 base64 — signs the
nightly ledger head; optional) and `ANCHOR_OTS=0` locally (skip public OpenTimestamps calendars).
Optional: `RESEND_API_KEY` + `EMAIL_FROM` turn the e-mail `Outbox` into real delivery.
`scripts/vercel-deploy.sh` generates and stores all keys on the Vercel project when missing.

## Demo accounts (password for all: `city1234`)

| Who | Email | Seeded state |
|---|---|---|
| Patient (full record) | `ramesh@demo.in` | Penicillin allergy, T2D+BP, 3 visits, labs, **pending access request** to approve, closed+revoked consent history for the transparency screen |
| Patient (live sharing) | `anita@demo.in` | ACTIVE `FULL_RECORD` consent with Dr. Sheikh → revoke it and watch her doctor get 403 mid-session |
| Patient (day one) | `vikas@demo.in` | Empty on purpose — shows the app works with 0 records |
| Patient (drafts) | `sunita@demo.in` | Unconfirmed OCR draft med — rule engine ignores it until she confirms |
| Doctors | `dr.kulkarni@demo.in`, `dr.nair@demo.in`, `dr.joshi@demo.in`, `dr.sheikh@demo.in`, `dr.rane@demo.in` | Today-list with real booked slots; Nair is blocked from Ramesh until the patient approves |

## Where the trust lives (read these files first)

| Mechanism | File |
|---|---|
| Consent verdict, checked on EVERY read, DB clock | `src/lib/consent.ts` |
| Doctor record access — refuses + logs the refusal | `src/app/api/doctor/patients/[id]/record/route.ts` |
| Booking: server-owned slot grid, tx re-check, DB index, 409s | `src/lib/slots.ts` + `api/patient/appointments` |
| Safety rules (deterministic, 0-LLM) | `src/lib/rules.ts` |
| Tamper-evident ledger (hash chain IN Postgres) | `../schema/sql/ledger.sql` + `src/lib/ledger.ts` |
| Erasure that erases (and keeps the receipt) | `src/app/api/patient/purge/route.ts` |
| Patient transparency screen | `src/app/patient/access/page.tsx` |

## Verified on 2026-11-01 — A76: production 500 fixed (schema ⇄ code now move together)

- **Incident**: the live site 500'd on `/patient` (and every record page) — F5's migration `0005` had never been applied to the production Neon, because Vercel deploys run `next build` and **nothing applies migrations**. Reproduced locally: scratch DB with base SQL + migrations 0001–0004 only, then the exact `recordSections` Observation query → `ERROR 42703: column "refLow" does not exist`
- **Fix**: a `prebuild` hook (`web/scripts/prebuild-schema-sync.mjs`) — every `npm run build` first runs the idempotent `db-bootstrap-node.mjs` when `DATABASE_URL` is set: migrations always, base SQL + seed only on a fresh database. A schema the code can't run against now **fails the build loudly** (negative-tested: unreachable URL → prebuild exits 1 before `next build` starts) instead of shipping a 500; local builds without `DATABASE_URL` are untouched
- On the repro DB: prebuild applied `0005` + seeded the empty DB → the failing query returns rows; idempotent re-run exits 0; no-`DATABASE_URL` no-op exits 0
- `npx vitest run` → **162/162** (18 files) · `npx tsc --noEmit` clean · `npx eslint .` clean · `next build` clean (`BUILD_ID` present)
- `node scripts/e2e.mjs` on a fresh seed → **241 passed / 0 failed** (240 + 1 new `A76:` check — the logged-in `/patient` home that shipped broken now has a regression guard over real HTTP)
- **The merge IS the fix**: Vercel's build of the merge runs `prebuild` → applies `0005` to the production Neon → the site self-heals. The sandbox cannot reach `*.vercel.app`; owner confirmation on the live URL is the last step

## Verified on 2026-11-01 — F5 + F18 shipped (this sandbox, commands actually run)

- `npx tsc --noEmit` → clean · `npx eslint .` → clean · `npx vitest run` → **162/162** (18 files)
- `node scripts/e2e.mjs` (local, Node prod server, migrations through `0005`) → **240 passed / 0 failed** (217 baseline + 15 `F5:` + 8 `F18:`); the production `BASE=https://<new>.vercel.app` run happens right after the next deploy (this sandbox cannot reach `*.vercel.app`)
- `NODE_OPTIONS=--max-old-space-size=1150 npx next build` → clean, `BUILD_ID` present
- New this round: **F5 longitudinal trends** — the dead `Observation` table is wired (D60 closed): 21 seed rows over 4 realistic series, reference bands + hand-rolled SVG sparkline (zero libraries), consent-scoped read-only on the doctor side, Zod-validated + ledgered log/delete API, direction decided in the pure deterministic `src/lib/trends.ts`. **F18 print / PDF visit summary** — hidden `#print-summary` block becomes the entire page under `@media print` (native Save-as-PDF, zero PDF libs); pure unit-tested `lib/print-summary` (confirmed-medicines-only, DRAFT rows explicitly excluded and counted); patient export ledgered (`EXPORT_PRINT_SUMMARY`); doctor side consent-gated server-side (no consent → no block). Plus **A75**: the e2e suite's `now − N×365.25d` synthetic DOBs drifted a day on exact anniversaries (surfaced on 2026-11-01, the synthetic child's 7th birthday) — replaced with calendar-year math, all five sites swept.
- Note: e2e is a **single fresh run** per seed — the suite's own logins/forgot-codes trip the app's D8 rate limits on a second run from the same IP (seen while developing; re-seed and re-run green).
- Demo data was re-seeded after the e2e run (e2e creates users/appointments)

## Verified on 2026-09-29, round 3 (this machine + live, commands actually run)

- `npx tsc --noEmit -p .` → clean · `npx eslint .` → clean · `npx vitest run` → **131/131** (16 files)
- `node scripts/e2e.mjs` (local, Node prod server, migration 0004) → **217 passed / 0 failed**; against `https://citycare-xi.vercel.app` → **190 passed / 0 failed / 9 skipped** (5 proxy-specific, 4 need direct DB access)
- Live: migration 0004 applied (35 tables), `DOCUMENT_KEY` + `ANCHOR_SIGNING_KEY` set, `/api/health` → `config{documentKey:"env", anchorSigning:true, emailDelivery:false}`, cron → `anchor{anchored:true, seq:9, signed:true, ots:"https://a.pool.opentimestamps.org"}`, `/api/ledger/anchors/9/ots` → 207-byte `application/vnd.opentimestamps.v1` receipt, `/legal/transparency` 200
- New this round: encrypted file uploads + signed links, recovery codes + e-mail verification/reset scaffold, handover at 18, ledger anchoring, slot capacity + live grid, verification attestation, sliding sessions, multipart CSRF, cold-start warm-up, notice v2026-09-29 (everyone re-accepts once), CI workflow file
- Demo data was re-seeded after the live run (e2e creates users/appointments)

## Verified on 2026-09-29, round 2 (this machine + live, commands actually run)

- `npx tsc --noEmit -p .` → clean · `npx eslint .` → clean · `npx vitest run` → **116/116** (13 files)
- `node scripts/e2e.mjs` (local, Node prod server) → **169 passed / 0 failed**; against `https://citycare-xi.vercel.app` → **160 passed / 0 failed / 6 runtime-skipped** (5 proxy-shape checks + the 428 backdate that needs local DB access)
- Live after deploy: `/api/health` ok (Postgres 18.6, 0 ledger breaks), `/api/cron/daily` ok with `housekeeping{sessionsPruned,rateWindowsPruned}`, `/legal/privacy?lang=hi` 200; migration `0003` applied on Neon by the deploy script
- New this round: server sessions + device list + sign-out-everywhere, rate limiting, 428 re-consent gate, grievance desk, breach register, break-glass review queue with auto-suspension, dependents (guardian ↔ minor), admin unlock, ledger pagination, Hindi/Marathi legal summary — details and proof counts in `FEATURES.md`; fixes A57–A66 and drawbacks D48–D52 in `DRAWBACKS_AND_BUGFIXES.md`
- **Note:** every session minted before this deploy is invalid (tokens now carry a server-side `sid`) — users just sign in again

## Verified on 2026-09-27 (this machine, commands actually run)

- `npx tsc --noEmit` → clean (strict mode)
- `npx vitest run` → **72/72**
- `node scripts/e2e.mjs` → **55/55 × 2 consecutive runs** against the Node production server; **51 passed / 0 failed / 5 runtime-skipped × 2** against the Worker on workerd (`wrangler dev`, port 8787) (idempotent — no re-seed between runs) (signup → book → 409 double-book → cancel frees slot →
  consent 403 → grant → 200 → allergy safety 422 → override logged → revoke → instant 403 →
  ledger shows all of it → chain intact → lockout → drafts excluded from clinical logic →
  sign-in through a TLS proxy with internal Host → cookie `SameSite=None; Secure; Partitioned` →
  foreign Origin 403 → `Origin: null` 403 → text/plain smuggling 415 → logout expires with matching attributes)
- `npx next build` → success (26 routes, incl. new `/api/auth/me`)
- `bash scripts/cf-build.sh` → OpenNext Worker bundle **1858 KiB gzipped** (free-plan limit 3072) — actual upload to Cloudflare NOT run (needs account token; `DEPLOY_CLOUDFLARE.md`)
- `(cd ../schema && bash run_tests.sh)` → exit 0 with `sql/ledger.sql` now IN the pipeline
- ledger under hostile session timezone (`+14:00`) → `ledger_verify()` reports **0 breaks**
- Not verified here (can't be in a sandbox): real SMS/email, OCR on photos, ABDM live
  sandbox (see `../AI_ACCURACY_AND_HALLUCINATION.md` and DRAWBACKS doc).

## Known gaps

All listed honestly in **[DRAWBACKS_AND_BUGFIXES.md](./DRAWBACKS_AND_BUGFIXES.md)** —
including ~20 real bugs found while building this (Postgres lowercase folding, plpgsql
reserved `FOUND`, naive-timestamp TZ trap, cancelled queue-token deadlock, …).
