#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  CityCare → Cloudflare Workers (OpenNext) + Hyperdrive → hosted Postgres
#
#  One command, idempotent. Re-running it re-deploys code and leaves data alone.
#
#  REQUIRED env:
#    CLOUDFLARE_API_TOKEN    API token: template "Edit Cloudflare Workers"
#                            + add permission  Account → Hyperdrive → Edit
#    CLOUDFLARE_ACCOUNT_ID   dashboard → Workers & Pages → right sidebar
#    DATABASE_URL            hosted Postgres (Neon / Supabase / any PG ≥ 15 with pgcrypto)
#                            e.g. postgresql://user:pass@ep-xxx.ap-southeast-1.aws.neon.tech/citycare?sslmode=require
#  OPTIONAL env:
#    SESSION_SECRET          ≥ 32 chars. Generated + printed if absent. SAVE IT — rotating it signs everyone out.
#    SCRYPT_N                default 4096 (free-plan CPU budget). Paid plan: 16384 + "limits":{"cpu_ms":30000}.
#    WORKER_NAME             default citycare        HYPERDRIVE_NAME  default citycare-db
#    FORCE_SCHEMA=1          re-apply SQL even if tables exist (init.sql is NOT idempotent — fresh DB only)
#    FORCE_SEED=1            re-seed even if users exist (seed TRUNCATES demo tables)
#
#  Needs: node ≥ 22 (wrangler), psql, curl.   Run from anywhere:  bash web/scripts/cf-deploy.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."
WEB="$PWD"; SCHEMA="$WEB/../schema"
WORKER_NAME="${WORKER_NAME:-citycare}"; HYPERDRIVE_NAME="${HYPERDRIVE_NAME:-citycare-db}"
export SCRYPT_N="${SCRYPT_N:-4096}"
step() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

step "0/6 preflight"
for v in CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID DATABASE_URL; do [ -n "${!v:-}" ] || die "$v is not set"; done
command -v psql >/dev/null || die "psql not found (apt install postgresql-client)"
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]'); [ "$NODE_MAJOR" -ge 22 ] || die "wrangler needs Node ≥ 22 (found $(node -v))"
case "$DATABASE_URL" in *sslmode=*) ;; *) echo "  note: no sslmode in DATABASE_URL — hosted Postgres normally needs ?sslmode=require";; esac
if [ -z "${SESSION_SECRET:-}" ]; then
  SESSION_SECRET="$(node -e 'console.log(require("crypto").randomBytes(48).toString("base64url"))')"
  printf '  generated SESSION_SECRET (store it somewhere safe!):\n  %s\n' "$SESSION_SECRET"
fi
[ "${#SESSION_SECRET}" -ge 32 ] || die "SESSION_SECRET must be ≥ 32 chars"
npx wrangler whoami >/dev/null 2>&1 || die "wrangler cannot authenticate — check CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID"
echo "  wrangler auth OK · worker=$WORKER_NAME · hyperdrive=$HYPERDRIVE_NAME · SCRYPT_N=$SCRYPT_N"

step "1-2/6 database schema + demo data (scripts/db-bootstrap.sh, SCRYPT_N=$SCRYPT_N)"
SCRYPT_N="$SCRYPT_N" DATABASE_URL="$DATABASE_URL" bash scripts/db-bootstrap.sh

step "3/6 Hyperdrive config"
HD_ID="$(npx wrangler hyperdrive list --json 2>/dev/null | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const a=JSON.parse(s);const h=a.find(x=>x.name===process.argv[1]);console.log(h?h.id:"")}catch{console.log("")}})' "$HYPERDRIVE_NAME")"
if [ -z "$HD_ID" ]; then
  OUT="$(npx wrangler hyperdrive create "$HYPERDRIVE_NAME" --connection-string="$DATABASE_URL" 2>&1)" || { echo "$OUT"; die "hyperdrive create failed (token needs Hyperdrive:Edit; DB must be reachable from the internet)"; }
  HD_ID="$(printf '%s' "$OUT" | grep -oE '"id": *"[0-9a-f]{32}"' | head -1 | grep -oE '[0-9a-f]{32}')"
  [ -n "$HD_ID" ] || { echo "$OUT"; die "could not parse Hyperdrive id"; }
  echo "  created $HYPERDRIVE_NAME → $HD_ID"
else
  echo "  reusing $HYPERDRIVE_NAME → $HD_ID"
fi
node -e '
  const fs=require("fs");let s=fs.readFileSync("wrangler.jsonc","utf8");
  s=s.replace(/("binding":\s*"HYPERDRIVE",\s*"id":\s*")[0-9a-f]{32}(")/, `$1${process.argv[1]}$2`);
  s=s.replace(/"name":\s*"citycare"/, `"name": "${process.argv[2]}"`).replace(/"service":\s*"citycare"/, `"service": "${process.argv[2]}"`);
  s=s.replace(/"SCRYPT_N":\s*"\d+"/, `"SCRYPT_N": "${process.env.SCRYPT_N}"`);
  fs.writeFileSync("wrangler.jsonc", s);' "$HD_ID" "$WORKER_NAME"
grep -q "$HD_ID" wrangler.jsonc || die "failed to write Hyperdrive id into wrangler.jsonc"

step "4/6 build Worker bundle (dev .env.local parked outside the tree)"
bash scripts/cf-build.sh

step "5/6 deploy + secret"
DEPLOY_OUT="$(npx opennextjs-cloudflare deploy 2>&1)" || { echo "$DEPLOY_OUT"; die "deploy failed (first time on an account: enable a workers.dev subdomain in the dashboard → Workers & Pages)"; }
echo "$DEPLOY_OUT" | grep -E "Uploaded|Deployed|workers.dev|Version ID" || echo "$DEPLOY_OUT" | tail -15
URL="$(echo "$DEPLOY_OUT" | grep -oE 'https://[a-z0-9.-]+\.workers\.dev' | head -1)"
printf '%s' "$SESSION_SECRET" | npx wrangler secret put SESSION_SECRET >/dev/null
echo "  SESSION_SECRET set (new version published)"

step "6/6 smoke test"
[ -n "$URL" ] || { echo "  could not detect URL from wrangler output; check the dashboard"; exit 0; }
sleep 5
LOGIN_PAGE="$(curl -s -o /dev/null -w '%{http_code}' "$URL/login")"
LOGIN_API="$(curl -s -i -X POST "$URL/api/auth/login" -H 'content-type: application/json' -H "origin: $URL" \
  -d '{"email":"ramesh@demo.in","password":"city1234"}')"
API_CODE="$(printf '%s' "$LOGIN_API" | head -1 | grep -oE '[0-9]{3}' | head -1)"
COOKIE="$(printf '%s' "$LOGIN_API" | grep -i '^set-cookie' | sed 's/=[^;]*;/=…;/' | tr -d '\r')"
echo "  GET  $URL/login            → $LOGIN_PAGE"
echo "  POST $URL/api/auth/login   → $API_CODE"
echo "  $COOKIE"
[ "$LOGIN_PAGE" = "200" ] && [ "$API_CODE" = "200" ] && printf '\n\033[1;32m✔ CityCare is live: %s   (demo: ramesh@demo.in / city1234)\033[0m\n' "$URL" \
  || printf '\n\033[1;33m! deployed to %s but the smoke test did not pass — run: npx wrangler tail %s\033[0m\n' "$URL" "$WORKER_NAME"
