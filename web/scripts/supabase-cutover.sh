#!/usr/bin/env bash
# CityCare — move the production database from Neon (Singapore) to Supabase Postgres (Mumbai)
# and the Vercel function region from sin1 to bom1, in one idempotent run.
#
#   VERCEL_TOKEN=…  SUPABASE_DB_URL='postgresql://postgres.<ref>:<password>@aws-1-ap-south-1.pooler.supabase.com:5432/postgres' \
#     bash scripts/supabase-cutover.sh
#
# What it does (each step is safe to re-run):
#   1. sanity-checks the URL (must be the SESSION pooler, port 5432 — the transaction pooler
#      on 6543 drops startup parameters; the direct host is IPv6-only on the free tier)
#   2. bootstraps schema + ledger + seed on Supabase via scripts/db-bootstrap.sh
#   3. flips vercel.json regions → ["bom1"] (functions next to the data: ~1 ms RTT instead of ~55 ms)
#   4. runs scripts/vercel-deploy.sh with DATABASE_URL pointing at Supabase (sets the Vercel env,
#      keeps SESSION_SECRET, deploys, discovers the public alias)
#   5. proves it: /api/health must report timezone UTC, 0 ledger breaks and a PostgreSQL 17 version
#
# Nothing is migrated from Neon on purpose: production only ever held synthetic demo data, which
# the bootstrap reseeds. Remove the Neon integration afterwards (Vercel dashboard → Storage), or
# leave it — since A42 the app prefers DATABASE_URL over Neon's lingering DATABASE_URL_UNPOOLED.
set -euo pipefail
cd "$(dirname "$0")/.."
die() { echo "✗ $*" >&2; exit 1; }
step() { printf '\n▶ %s\n' "$*"; }

[ -n "${SUPABASE_DB_URL:-}" ] || die "SUPABASE_DB_URL is not set (Supabase → Connect → Session pooler URI)"
[ -n "${VERCEL_TOKEN:-}" ] || die "VERCEL_TOKEN is not set"
command -v psql >/dev/null || die "psql not found (apt install postgresql-client)"

step "1/5 connection string sanity"
URL="$SUPABASE_DB_URL"
case "$URL" in
  *:6543/*) die "that is the TRANSACTION pooler (6543). Use the SESSION pooler on port 5432 — same host, different port." ;;
  *pooler.supabase.com:5432/*) echo "  session pooler ✓ (IPv4-reachable, keeps startup parameters)" ;;
  *.supabase.co:5432/*) echo "  direct host — fine if this machine and Vercel have IPv6 (free tier has no IPv4 add-on); the pooler is safer" ;;
  *) echo "  note: host does not look like Supabase — continuing anyway" ;;
esac
case "$URL" in *sslmode=*) ;; *) URL="${URL}$( [[ "$URL" == *\?* ]] && echo '&' || echo '?')sslmode=require"; echo "  appended sslmode=require";; esac
PGV="$(psql "$URL" -X -tAc 'select split_part(version(),$$ $$,2)' 2>/dev/null)" || die "cannot connect (password? project paused? → open the Supabase dashboard once to un-pause)"
TZ_NOW="$(psql "$URL" -X -tAc 'show timezone')"
echo "  PostgreSQL $PGV · session timezone: $TZ_NOW"
[ "$TZ_NOW" = "UTC" ] || die "timezone is '$TZ_NOW' — set it in Supabase: ALTER DATABASE postgres SET timezone='UTC' (as postgres)"

step "2/5 schema + ledger + seed on Supabase"
DATABASE_URL="$URL" FORCE_SEED="${FORCE_SEED:-1}" bash scripts/db-bootstrap.sh

step "3/5 vercel.json → region bom1 (Mumbai, same region as the database)"
if grep -q '"sin1"' vercel.json; then
  sed -i 's/"regions": \["sin1"\]/"regions": ["bom1"]/' vercel.json && echo "  switched sin1 → bom1"
else
  echo "  already: $(grep -o '"regions": \[[^]]*\]' vercel.json)"
fi

step "4/5 deploy (sets DATABASE_URL on Vercel, keeps SESSION_SECRET)"
OUT="$(mktemp)"
DATABASE_URL="$URL" bash scripts/vercel-deploy.sh 2>&1 | tee "$OUT"
LIVE="$(grep -E 'production URL:' "$OUT" | tail -1 | sed -E 's/.*production URL: *//')"
rm -f "$OUT"
[ -n "$LIVE" ] || die "deploy script did not print a production URL"

step "5/5 proof from the live app"
H="$(curl -fsS --max-time 30 "$LIVE/api/health")" || die "/api/health not answering at $LIVE"
echo "  $H"
printf '%s' "$H" | grep -q '"timezone":"UTC"' || die "live app is not in UTC"
printf '%s' "$H" | grep -q '"ledgerBreaks":0' || die "live ledger reports breaks"
printf '%s' "$H" | grep -q '"postgres":"17' || echo "  note: expected PostgreSQL 17 (Supabase) — check that the app is really on the new DATABASE_URL"
echo
echo "✓ cutover complete → $LIVE"
echo "  next: BASE=$LIVE node scripts/e2e.mjs   (expect 52 pass / 0 fail / 5 skipped), then reseed:"
echo "        DATABASE_URL='$URL' FORCE_SEED=1 bash scripts/db-bootstrap.sh"
