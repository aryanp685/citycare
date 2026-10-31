# Deploying CityCare to Cloudflare (Workers + Hyperdrive + hosted Postgres)

Status: **everything up to the actual upload is done and verified on the Cloudflare
runtime (workerd) locally.** The last step needs two things only the account owner
has: a Cloudflare API token and a hosted Postgres URL. With those, it is one command.

```
                    ┌────────────────────────────┐        ┌──────────────┐
 browser ── https ─▶│ Cloudflare Worker (OpenNext)│─ TCP ─▶│  Hyperdrive  │─ pooled TLS ─▶ Postgres (Neon)
                    │  Next.js 16 · pg · scrypt  │        │ (edge pool)  │
                    └────────────────────────────┘        └──────────────┘
```

## What was verified here (commands actually run)

| Check | Result |
|---|---|
| `bash scripts/cf-build.sh` (OpenNext build, `.env.local` parked outside the tree) | OK — **1858 KiB gzipped**, free-plan limit 3072 KiB |
| `wrangler dev` on workerd + Hyperdrive local binding → local Postgres | login 72–100 ms, pages 90–310 ms |
| Full HTTP e2e against workerd (`BASE=http://127.0.0.1:8787 node scripts/e2e.mjs`) ×2 | **51 passed, 0 failed, 5 skipped** (the 5 simulate a reverse proxy via `X-Forwarded-*`, which wrangler dev rewrites; on real Cloudflare the Worker sees the public Host and an https URL directly) |
| Same suite against the Node production server ×2 | **55/55** |
| Unit tests (`npx vitest run`) | **70/70** |
| Actual `wrangler deploy` to an account | **NOT run — needs your token** |
| Real Hyperdrive → Neon round-trip | **NOT run — needs your DB** |

## One-time setup (≈15 min)

1. **Hosted Postgres.** Neon free tier (https://neon.tech): create project → region
   `ap-southeast-1` (Singapore, closest to Pune) → Postgres 17 → copy the **direct** connection
   string (not the `-pooler` one; Hyperdrive is the pooler). It ends in `?sslmode=require`.
   Supabase works too (use the session-mode/direct string).
2. **Cloudflare account** → Workers & Pages → if asked, register a `*.workers.dev` subdomain
   (free). Note the **Account ID** (right sidebar).
3. **API token**: My Profile → API Tokens → Create → template **"Edit Cloudflare Workers"**
   → *add* permission **Account → Hyperdrive → Edit** → Continue → copy the token.
4. Local machine needs **Node ≥ 22** (wrangler refuses 20), `psql`, `curl`.

## Deploy

```bash
cd citycare/web
npm install
export CLOUDFLARE_API_TOKEN=...      # step 3
export CLOUDFLARE_ACCOUNT_ID=...     # step 2
export DATABASE_URL='postgresql://user:pass@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require'
npm run cf:deploy                    # = bash scripts/cf-deploy.sh
```

The script is idempotent and prints what it does:

| Step | What happens | Re-run behaviour |
|---|---|---|
| 0 preflight | validates env, Node ≥ 22, `wrangler whoami`; generates `SESSION_SECRET` if you did not export one (**save the printed value**) | — |
| 1 schema | applies `schema/citycare_init.sql` + `constraints.sql` + `ledger.sql`; `ALTER DATABASE … SET timezone='UTC'`; asserts 25 tables, both ledger functions, `SHOW timezone = UTC` | skips if tables exist (`FORCE_SCHEMA=1` only on a fresh DB — init.sql is not idempotent) |
| 2 demo data | `scripts/seed.mjs` with `SCRYPT_N=4096`; asserts `ledger_verify()` = 0 breaks | skips if users exist (`FORCE_SEED=1` truncates + reseeds) |
| 3 Hyperdrive | `wrangler hyperdrive create citycare-db` (or reuse) and writes its id into `wrangler.jsonc` | reuses by name |
| 4 build | `scripts/cf-build.sh` — OpenNext build with `.env.local` moved out of the tree so the dev secret is never bundled; size gate at 3 MiB | — |
| 5 deploy | `opennextjs-cloudflare deploy`, then `wrangler secret put SESSION_SECRET` | new version each time |
| 6 smoke | `GET /login` → 200, `POST /api/auth/login` (ramesh@demo.in) → 200 + `Set-Cookie … SameSite=Lax; Secure` | — |

Result: `https://citycare.<your-subdomain>.workers.dev` · demo password `city1234`.

Manual equivalent, if you prefer to see every step: the commands are literally the
numbered blocks in `scripts/cf-deploy.sh`.

## Decisions you should know about (and can reverse)

**Free plan CPU budget → scrypt cost 4096.** Workers Free allows **10 ms CPU per request**
(paid: 30 s default). scrypt at 2^14 costs ~40–80 ms, so both the Worker (`vars.SCRYPT_N`)
and the seed use **4096** (~¼). The cost is stored inside every hash, so changing it never
breaks existing passwords. This is weaker than the OWASP recommendation (2^17) — an honest
demo trade-off, not a production setting. On the **paid plan ($5/mo)**: set `SCRYPT_N=16384`
(or higher), add `"limits": { "cpu_ms": 30000 }` to `wrangler.jsonc`, redeploy, and users
get re-hashed at their next login only if you add that (not implemented; simplest is
`FORCE_SEED=1` for demo data).
Also note Cloudflare's own numbers: SSR pages "typically use 10–20 ms" — the free plan
tolerates *occasional* overruns per isolate but throttles consistent ones (error 1102).
Low-traffic college demo: fine. Public traffic: paid plan.

**No connection pool inside the Worker.** workerd forbids using a TCP socket opened in one
request from another request, so a module-level `pg.Pool` would fail randomly. On Workers
every `one/all/run` opens a Client against Hyperdrive and closes it; `tx()` keeps one Client
for the whole transaction. Hyperdrive *is* the pool (warm, authenticated connections to the
origin). Cost: one extra local hop per query — measured 90–310 ms per page on workerd with a
local DB. `"placement": { "mode": "smart" }` moves the Worker next to the database, which
is the right call for a DB-chatty app. Production path: request-scoped client via
`AsyncLocalStorage` + `after()`.

**Session cookie on the deployed site is `SameSite=Lax; Secure`.** `None + Partitioned` is
issued only when the login page detects it is inside a cross-site iframe (it sends
`embedded: true`). Logout expires both shapes.

**Startup parameters are not sent on the Workers path** (`options`, `statement_timeout`)
because Hyperdrive does not forward them. UTC is pinned with `ALTER DATABASE` instead and
asserted by the deploy script; the ledger never depended on the session timezone anyway
(canonical `createdAtIso` text, see `schema/sql/ledger.sql`).

**`.env.local` is never bundled.** OpenNext ships any `.env*` it finds; `cf-build.sh` moves
the file out and back (trap-protected). Secrets live in `wrangler secret`, not in vars.

**Node 22.** wrangler 4.141 requires it. In this sandbox it is at `~/.local/node22/bin`
(not persisted across resets — re-download with the tarball command in the root README).

## Where to look when something is off

- `npx wrangler tail citycare` — live logs of the deployed Worker (includes `console.error` from `handler()`).
- `Error 1102 / exceededCpu` in the dashboard → CPU budget (see above).
- `Could not resolve "pg-cloudflare"` during build → `next.config.ts` `outputFileTracingIncludes` was removed (bug A25).
- Login returns 200 but pages bounce to `/login` → cookie problem; `/api/auth/me` tells you whether the server sees the session.
- Do not run `cf:build` while `wrangler dev` is running on a 2 GB machine — the build gets OOM-killed (A27).
