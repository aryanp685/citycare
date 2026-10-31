# Deploying CityCare to Vercel (Hobby) + Neon Postgres

> **Live:** https://citycare-xi.vercel.app — demo `ramesh@demo.in` / `city1234` (all demo users share it;
> doctors: `dr.kulkarni@demo.in` …). Deployed 27 Sep 2026 from this tree; function region `sin1`,
> database Neon Free (Postgres 18.6) in `ap-southeast-1`, provisioned through the Vercel Marketplace.

Recommended target for the college demo (see the comparison in the chat / root README):
native Next.js 16, full Node runtime (scrypt at full strength, real `pg` Pool), one region
pinned next to the database, free tier that fits a non-commercial project.

```
 browser ── https ─▶ Vercel Function (sin1, Node 22, Next.js 16) ── TLS ─▶ Neon Postgres (ap-southeast-1)
```

## What is verified here vs. what needs your account

| Item | Status |
|---|---|
| `next build` of this exact tree (locally and on Vercel's builder) | OK (26 routes) |
| `scripts/db-bootstrap.sh` on a **fresh** database → schema + UTC pin + seed, all asserted | OK locally (2nd run idempotent; tampered ledger → **exit 1**) **and on Neon** (25 tables · UTC · 9 users · ledger 0 breaks; re-run skipped both steps) |
| Pool hardening for serverless Postgres (`error` listener, idle/connect timeouts, one retry on server-went-away) | OK — unit 72/72; local prod e2e 55/55 ×2; 9 idle backends killed server-side while serving → next request still 200 |
| **Real deploy** (`vercel deploy --prod`) | **DONE** — https://citycare-xi.vercel.app, Ready, target production, `x-vercel-id … sin1` |
| **e2e against the live URL** | **52 passed · 0 failed · 5 skipped** ×2 (skips = X-Forwarded-* proxy simulation, meaningless behind Vercel's real proxy) |
| Live smoke (script step 6) | `/login` 200 · login API 200 + `Secure; HttpOnly; SameSite=lax` · anonymous `/patient` 307 · wrong password 401 · foreign Origin 403 |
| `vercel-deploy.sh` re-run | idempotent: schema/seed skipped, `SESSION_SECRET` kept, redeploy + smoke ✔ (exit 0) |
| Neon Marketplace provisioning from the CLI | works after a one-time browser terms acceptance; plan id is `free_v3`, region key `sin1` |
| `sslmode=verify-full` pinned to Neon's CA | not done (node-postgres already verifies against system CAs for `sslmode=require`) |
| Custom domain / HTTPS cert | not needed — `*.vercel.app` has TLS |

## You need

**Only a Vercel token.** The database can come from the Vercel Marketplace (this is what the live
deployment uses — no separate Neon account, billing stays on the Hobby plan at ₹0):

1. **Vercel** (https://vercel.com, free Hobby) → avatar → *Account Settings* → *Tokens* → Create:
   scope your personal account, **expiration 1 day** → copy. Delete it after the deploy.
2. **Neon via Marketplace** (one-time, from the CLI):
   ```bash
   cd citycare/web
   npx vercel@latest project add citycare --token $VERCEL_TOKEN
   npx vercel@latest link --yes --project citycare --token $VERCEL_TOKEN
   npx vercel@latest integration add neon --name citycare-db -m region=sin1 --plan free_v3 \
       -e production -e preview -e development --no-env-pull --non-interactive --token $VERCEL_TOKEN
   ```
   The first attempt returns `integration_terms_acceptance_required` with a `verification_uri`
   (`https://vercel.com/<team>/~/integrations/accept-terms/neon?source=cli`) — open it once in the
   browser, click Accept, re-run the same command. It provisions a Free Neon project in Singapore
   and injects 18 env vars into the project (`DATABASE_URL` = pooled, `DATABASE_URL_UNPOOLED` =
   direct, `PG*`, `POSTGRES_*`). The app prefers `DATABASE_URL_UNPOOLED` (see `db.ts`).
   It also drops two vendor "agent skills" folders (`.agents/`, `agent/`) into the project — delete them.

**Alternative:** your own Neon account (https://neon.tech): project in **Singapore
(ap-southeast-1)**, copy the **direct** connection string (host without `-pooler`, ending in
`?sslmode=require`) and `export DATABASE_URL=…` before the script — it then sets the var itself.

## Deploy — option A: one command (from this sandbox or your laptop)

```bash
cd citycare/web && npm install
export VERCEL_TOKEN=…                       # from step 1
# export DATABASE_URL='postgresql://…'      # ONLY for the own-Neon-account alternative; omit with the Marketplace DB
npm run vercel:deploy                       # = bash scripts/vercel-deploy.sh
```

What it does (each step asserts its result and stops on failure):

| Step | Action | Re-run |
|---|---|---|
| 0 | `vercel whoami`; validates an explicitly given `SESSION_SECRET` | — |
| 1 | `vercel project add citycare` (no-op if exists) + `vercel link --yes` — `.env.local` is backed up and restored around it because `link` silently pulls the project's development env into that file | idempotent |
| 2 | Resolve the database: `DATABASE_URL` from your shell, else `vercel env pull` → `DATABASE_URL_UNPOOLED` from the Marketplace resource | — |
| 3 | `db-bootstrap.sh`: applies `citycare_init.sql` + `constraints.sql` + `ledger.sql`, `ALTER DATABASE … timezone='UTC'`, seeds demo users, asserts 25 tables / ledger functions / tamper trigger / 3 partial indexes / `ledger_verify()` = 0 breaks | skips schema if tables exist, seed if users exist (`FORCE_SCHEMA=1` / `FORCE_SEED=1`) |
| 4 | env: `DATABASE_URL` only when you supplied it (Marketplace vars are left alone); `SESSION_SECRET`, `CRON_SECRET`, `DOCUMENT_KEY`, `ANCHOR_SIGNING_KEY` **only if missing** on the project — re-runs never rotate them (rotating `SESSION_SECRET` signs everyone out; rotating `DOCUMENT_KEY` makes every uploaded file unreadable); pass `NAME=…` to rotate deliberately; `RESEND_API_KEY` + `EMAIL_FROM` are set only when you pass them | safe |
| 5 | `vercel deploy --prod --yes` (cloud build, ~1 min), then the production aliases are read from `vercel inspect` (the per-deployment URL is behind Vercel's SSO deployment protection by design) | new deployment |
| 6 | smoke test on the public alias: `GET /login` 200 · `POST /api/auth/login` 200 with `Set-Cookie … Secure; SameSite=lax` · anonymous `/patient` 307 | — |

Verify the whole application afterwards (creates + cleans its own users, but **locks `anita@demo.in`
for the lockout test** — reseed after: `FORCE_SEED=1 DATABASE_URL=… npm run db:bootstrap`):
```bash
BASE=https://citycare-xi.vercel.app node scripts/e2e.mjs     # expect 52 passed, 0 failed, 5 skipped
```

## Deploy — option B: no CLI, no token (GitHub import)

1. Push `citycare/` to a GitHub repo.
2. Run **only** the database step yourself: `DATABASE_URL=… npm run db:bootstrap`.
3. vercel.com → *Add New → Project* → import the repo → **Root Directory: `web`** → Environment
   Variables: `DATABASE_URL`, `SESSION_SECRET` (≥ 32 random chars), `CRON_SECRET`, `DOCUMENT_KEY` (32-byte base64), `ANCHOR_SIGNING_KEY` (Ed25519 PKCS8 base64, optional) → Deploy.
4. Project → *Settings → Functions → Function Region* should read **Singapore (sin1)** (picked up
   from `vercel.json`; set it by hand if not).
Every later `git push` redeploys — handy between viva iterations.

## Things to know

- **Cold start.** First request after idle: Vercel ~0.3–0.5 s + Neon wake 0.5–3 s (free tier
  scales to zero after 5 min). Open the URL once, two minutes before the demo.
- **Region.** If you ever see slow pages, check the function region is `sin1`. The US default
  (`iad1`) adds ~200 ms *per query*, and every page runs several.
- **Hobby = non-commercial.** Exactly a college project. Going commercial → Pro ($20/mo) or the
  prepared Cloudflare path (`DEPLOY_CLOUDFLARE.md`, $5/mo Workers Paid to lift the CPU limit).
- **Connections.** Each Fluid-compute instance keeps a `pg` Pool (max 10, idle 20 s). Neon's
  free compute allows ~100 direct connections — plenty for a demo. The pooled URL
  (`-pooler`, PgBouncer transaction mode) was **not** tested with this app: the Pool sends
  `statement_timeout` and `options=-c timezone=UTC` as startup parameters, which a transaction
  pooler may reject. UTC is also pinned at the database level, so if you ever must switch,
  remove those two Pool options first and re-run the e2e.
- **Deployment protection.** `https://citycare-<hash>-<team>.vercel.app` URLs redirect to Vercel
  SSO (302, `_vercel_sso_nonce` cookie) — that is Vercel's default and not a bug. Share the
  production alias `https://citycare-xi.vercel.app` (or `citycare-iamjarvis9896-3988s-projects.vercel.app`).
- **Node version.** The project setting says Node 24.x (Vercel default); Next 16 is fine on it, and
  the build ran on it. `engines` is not pinned on purpose.
- **Cookies.** Deployed site issues `SameSite=Lax; Secure`; iframe embedding gets
  `None; Secure; Partitioned` automatically (login page detects framing).
- **Logs.** `npx vercel logs <url> --token …` or dashboard → Deployments → Functions.
