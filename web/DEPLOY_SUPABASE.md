# CityCare on Supabase Postgres (Mumbai) + Vercel `bom1`

Status: **prepared, not yet executed** — it needs a Supabase project, which only the account
owner can create. Everything below is scripted; the human part is ~3 minutes of clicking.

## Why Supabase, and why *only* as Postgres

| Concern | Neon (current) | Supabase | Decision |
|---|---|---|---|
| Region | Singapore (`ap-southeast-1`) — no India region | **Mumbai (`ap-south-1`)** | DPDP-friendly data residency + ~55 ms lower RTT for Pune users |
| Free-tier pause | scale-to-zero after 5 min idle (cold start 0.5–3 s) | project **paused after 7 idle days** (manual un-pause) | mitigated: daily Vercel cron → `/api/health` keeps it active |
| Free storage | 0.5 GB | 0.5 GB DB + 1 GB file storage | enough for a demo/seminar |
| Connection from serverless | direct + PgBouncer | **Supavisor**: session pooler `:5432` (keeps startup params), transaction pooler `:6543` (drops them) | use **session pooler** — the app pins `timezone=UTC` and `statement_timeout` at connect time |
| IPv4 | yes | direct host is **IPv6-only** on free tier | pooler host is IPv4 → always use the pooler URL |

**Not adopted:** Supabase Auth, Row-Level Security, Storage, Edge Functions.
The app already has session auth (scrypt 2^17 + HS256 JWT), a consent engine with *server-side*
checks on every request, and a trigger-protected hash-chained ledger — all covered by 78 unit
tests and a 55-check e2e suite. Replacing them with Supabase Auth + RLS would mean re-writing the
consent model as SQL policies for no user-visible gain and a real risk of regressions two weeks
before a seminar. Supabase Storage *is* the right home for scanned documents later (see the roadmap
in `../PLAN_REVIEW_AND_DRAWBACKS.md`) — it needs a signed-URL layer first.

## One-time setup (account owner)

1. <https://supabase.com/dashboard> → **New project** → name `citycare`, region **Mumbai (ap-south-1)**,
   a strong database password (save it — it is the only credential we need).
2. Project → **Connect** (top bar) → *Connection string* → **Session pooler** → copy the URI. It looks like
   `postgresql://postgres.<project-ref>:<password>@aws-1-ap-south-1.pooler.supabase.com:5432/postgres`
3. Hand over **only** that URI (or run the script yourself). We never need the service-role key or the
   dashboard login.

## Cutover (idempotent, ~4 minutes)

```bash
cd web
export VERCEL_TOKEN=…                       # a fresh token; delete it afterwards
export SUPABASE_DB_URL='postgresql://postgres.<ref>:<pw>@aws-1-ap-south-1.pooler.supabase.com:5432/postgres'
bash scripts/supabase-cutover.sh
```

The script (1) refuses the transaction pooler, (2) bootstraps schema + ledger + seed
(`scripts/db-bootstrap.sh`, which already tolerates the `ALTER DATABASE … timezone` that a
non-owner role cannot run — it asserts `show timezone = UTC` instead), (3) switches `vercel.json`
to `bom1`, (4) deploys via `scripts/vercel-deploy.sh` (keeps `SESSION_SECRET`, sets `DATABASE_URL`),
(5) proves the live app is on the new database through `/api/health`. Then:

```bash
BASE=https://citycare-xi.vercel.app node scripts/e2e.mjs      # expect 52 pass / 0 fail / 5 skipped
DATABASE_URL="$SUPABASE_DB_URL" FORCE_SEED=1 bash scripts/db-bootstrap.sh   # e2e locks anita@demo.in → reseed
```

Nothing is migrated from Neon deliberately — production only ever held synthetic demo rows.
Afterwards remove the Neon integration (Vercel → Storage) or leave it: since fix A42 the app prefers
`DATABASE_URL` over Neon's lingering `DATABASE_URL_UNPOOLED` unless `DATABASE_URL` is itself a
transaction pooler.

## Hardening that Supabase makes easy (do after the cutover)

* **Least-privilege app role** (closes the "owner can drop the ledger trigger" gap, drawback D-L1):
  ```sql
  create role citycare_app login password '…';
  grant usage on schema public to citycare_app;
  grant select, insert, update, delete on all tables in schema public to citycare_app;
  revoke update, delete on "AuditLog" from citycare_app;          -- belt (trigger is braces)
  grant execute on function ledger_append(text,text,text,text,jsonb), ledger_verify() to citycare_app;
  grant usage, select on all sequences in schema public to citycare_app;
  ```
  then point `DATABASE_URL` at `citycare_app` (pooler URL: `postgres.<ref>` → `citycare_app.<ref>`).
* **Backups**: free tier has none → weekly `pg_dump "$SUPABASE_DB_URL" | gzip > backup-$(date +%F).sql.gz`
  from a laptop cron, or the `cron` extension + Storage on a paid tier.
* **Point-in-time recovery / read replicas**: paid features — out of scope for the seminar, listed as a limit.

## Things that will bite if ignored

* `?sslmode=require` is appended automatically; if the local `psql` complains about the certificate,
  add `&sslrootcert=system` (PG ≥ 16 client) — never `sslmode=disable`.
* The free project pauses after 7 idle days **even with the cron** if the cron itself stops (e.g. Vercel
  project deleted). A paused project answers `/api/health` with 503 `db_unreachable`; un-pause in the dashboard.
* Supavisor session mode holds one backend connection per client connection; the app's Pool is `max: 10`
  per function instance and Vercel Hobby rarely runs more than a handful concurrently — inside the free
  pooler limit (200). If you ever see `MaxClientsInSessionMode`, lower `max` to 4 in `src/lib/db.ts`.
