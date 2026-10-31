#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  CityCare → Vercel (Hobby is enough) + hosted Postgres (Neon, Singapore)
#
#  One command, idempotent. Re-running redeploys code and leaves data alone.
#
#  REQUIRED env:
#    VERCEL_TOKEN     vercel.com → Account Settings → Tokens → Create
#                     (scope: your personal account, expiry: 1 day — delete it after)
#  DATABASE — one of:
#    a) export DATABASE_URL   Neon *direct* connection string (…neon.tech/neondb?sslmode=require)
#    b) nothing: the project already has a Neon Marketplace resource
#       (`vercel integration add neon -m region=sin1 --plan free`) — the script pulls
#       DATABASE_URL_UNPOOLED from the project's production env and uses that.
#  OPTIONAL env:
#    SESSION_SECRET   ≥ 32 chars; generated + printed if absent (SAVE IT: rotating it signs everyone out)
#    DOCUMENT_KEY     32-byte base64; generated + printed if absent (SAVE IT: files are unreadable without it)
#    ANCHOR_SIGNING_KEY  Ed25519 PKCS8 base64; generated if absent
#    RESEND_API_KEY + EMAIL_FROM   optional; enables real e-mail for verification / forgot-password
#    VERCEL_PROJECT   default citycare          VERCEL_SCOPE  team slug (only if deploying into a team)
#    FORCE_SCHEMA=1 / FORCE_SEED=1   passed through to scripts/db-bootstrap.sh
#
#  Needs: node ≥ 20, psql, curl.        Run:  bash scripts/vercel-deploy.sh   (from anywhere)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."
PROJECT="${VERCEL_PROJECT:-citycare}"
VC=(npx --yes vercel@latest --token "${VERCEL_TOKEN:-}")
[ -n "${VERCEL_SCOPE:-}" ] && VC+=(--scope "$VERCEL_SCOPE")
step() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
trap 'printf "\n\033[1;31m✗ aborted at line %s: %s\033[0m\n" "$LINENO" "$BASH_COMMAND" >&2' ERR   # never die silently under set -e

step "0/6 preflight"
[ -n "${VERCEL_TOKEN:-}" ] || die "VERCEL_TOKEN is not set"
command -v psql >/dev/null || die "psql not found (apt install postgresql-client)"
WHO="$("${VC[@]}" whoami 2>/dev/null)" || die "vercel cannot authenticate — check VERCEL_TOKEN"
echo "  vercel auth OK (user: $WHO) · project=$PROJECT · region=sin1 (vercel.json)"
[ -z "${SESSION_SECRET:-}" ] || [ "${#SESSION_SECRET}" -ge 32 ] || die "SESSION_SECRET must be ≥ 32 chars"

step "1/6 project link"
"${VC[@]}" project add "$PROJECT" >/dev/null 2>&1 || true        # no-op if it already exists
# `vercel link` auto-pulls the project's development env into .env.local — keep ours intact.
ENV_BAK=""; if [ -f .env.local ]; then ENV_BAK="$(mktemp)"; cp .env.local "$ENV_BAK"; fi
"${VC[@]}" link --yes --project "$PROJECT" >/dev/null 2>&1 || die "could not link project $PROJECT"
if [ -n "$ENV_BAK" ]; then cp "$ENV_BAK" .env.local; rm -f "$ENV_BAK"; fi
echo "  linked ./.vercel → $PROJECT"

step "2/6 database connection"
DB_MANAGED=0
if [ -z "${DATABASE_URL:-}" ]; then
  # Marketplace path: Neon's integration stores DATABASE_URL (pooled) + DATABASE_URL_UNPOOLED (direct)
  PULLED="$(mktemp)"
  "${VC[@]}" env pull "$PULLED" --environment production --yes >/dev/null 2>&1 || die "env pull failed"
  DATABASE_URL="$(grep -E '^DATABASE_URL_UNPOOLED=' "$PULLED" | head -1 | cut -d= -f2- | tr -d '"')"
  [ -n "$DATABASE_URL" ] || DATABASE_URL="$(grep -E '^DATABASE_URL=' "$PULLED" | head -1 | cut -d= -f2- | tr -d '"')"
  rm -f "$PULLED"
  [ -n "$DATABASE_URL" ] || die "no DATABASE_URL given and the project has none — either export DATABASE_URL (Neon direct string) or run: vercel integration add neon -m region=sin1 --plan free"
  DB_MANAGED=1
  echo "  using the project's Marketplace database (host: $(printf '%s' "$DATABASE_URL" | sed -E 's#.*@([^/?]+).*#\1#'))"
else
  echo "  using DATABASE_URL from the environment (host: $(printf '%s' "$DATABASE_URL" | sed -E 's#.*@([^/?]+).*#\1#'))"
fi
case "$DATABASE_URL" in *sslmode=*) ;; *) echo "  note: no sslmode in DATABASE_URL — Neon needs ?sslmode=require";; esac
case "$DATABASE_URL" in *-pooler.*) echo "  note: this is Neon's POOLER endpoint; the app's pg Pool works better with the direct one";; esac

step "3/6 database schema + demo data (scripts/db-bootstrap.sh)"
DATABASE_URL="$DATABASE_URL" bash scripts/db-bootstrap.sh

step "4/6 environment variables (production)"
setenv() {  # name value — create-or-overwrite as a *sensitive* var (never readable back, never echoed)
  "${VC[@]}" env add "$1" production --value "$2" --force --sensitive >/dev/null 2>&1 || die "failed to set $1"
  echo "  set $1 (sensitive)"
}
if [ "$DB_MANAGED" = "1" ]; then echo "  DATABASE_URL / DATABASE_URL_UNPOOLED: managed by the Neon integration (left alone)"; else setenv DATABASE_URL "$DATABASE_URL"; fi
# SESSION_SECRET signs every session cookie. Re-running this script must NOT rotate it
# (that would sign everyone out) — only set it when given explicitly or missing on the project.
if [ -n "${SESSION_SECRET:-}" ]; then
  setenv SESSION_SECRET "$SESSION_SECRET"
elif "${VC[@]}" env ls production 2>/dev/null | grep -qE '^\s*SESSION_SECRET\s'; then
  echo "  SESSION_SECRET already set on the project (kept — pass SESSION_SECRET=… to rotate deliberately)"
else
  SESSION_SECRET="$(node -e 'console.log(require("crypto").randomBytes(48).toString("base64url"))')"
  printf '  generated SESSION_SECRET (store it somewhere safe!):\n  %s\n' "$SESSION_SECRET"
  setenv SESSION_SECRET "$SESSION_SECRET"
fi

# CRON_SECRET authenticates the daily job (/api/cron/daily: demo-retention sweep + ledger check).
# Vercel sends it as "Authorization: Bearer …". Same keep-unless-given policy as SESSION_SECRET.
if [ -n "${CRON_SECRET:-}" ]; then
  setenv CRON_SECRET "$CRON_SECRET"
elif "${VC[@]}" env ls production 2>/dev/null | grep -qE '^\s*CRON_SECRET\s'; then
  echo "  CRON_SECRET already set on the project (kept)"
else
  CRON_SECRET="$(node -e 'console.log(require("crypto").randomBytes(24).toString("base64url"))')"
  printf '  generated CRON_SECRET (needed only to trigger the daily job by hand):\n  %s\n' "$CRON_SECRET"
  setenv CRON_SECRET "$CRON_SECRET"
fi

# DOCUMENT_KEY (D4/L-G8) encrypts uploaded files: 32 random bytes, base64. NEVER rotate casually —
# existing blobs are decryptable only with the key they were sealed under (keyVersion column
# exists for a future re-wrap job). Keep-unless-given, like SESSION_SECRET.
if [ -n "${DOCUMENT_KEY:-}" ]; then
  setenv DOCUMENT_KEY "$DOCUMENT_KEY"
elif "${VC[@]}" env ls production 2>/dev/null | grep -qE '^\s*DOCUMENT_KEY\s'; then
  echo "  DOCUMENT_KEY already set on the project (kept)"
else
  DOCUMENT_KEY="$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64"))')"
  printf '  generated DOCUMENT_KEY (store it with the SESSION_SECRET — losing it loses every uploaded file):\n  %s\n' "$DOCUMENT_KEY"
  setenv DOCUMENT_KEY "$DOCUMENT_KEY"
fi

# ANCHOR_SIGNING_KEY (D13) signs the daily ledger head (Ed25519, PKCS8 base64). Rotating it is
# harmless for old anchors (each row stores the public key it was signed with).
if [ -n "${ANCHOR_SIGNING_KEY:-}" ]; then
  setenv ANCHOR_SIGNING_KEY "$ANCHOR_SIGNING_KEY"
elif "${VC[@]}" env ls production 2>/dev/null | grep -qE '^\s*ANCHOR_SIGNING_KEY\s'; then
  echo "  ANCHOR_SIGNING_KEY already set on the project (kept)"
else
  ANCHOR_SIGNING_KEY="$(node -e 'const {privateKey}=require("crypto").generateKeyPairSync("ed25519");console.log(privateKey.export({format:"der",type:"pkcs8"}).toString("base64"))')"
  echo "  generated ANCHOR_SIGNING_KEY (public key is shown on /legal/transparency after deploy)"
  setenv ANCHOR_SIGNING_KEY "$ANCHOR_SIGNING_KEY"
fi

# Optional e-mail delivery (D3): pass RESEND_API_KEY + EMAIL_FROM to enable real mail; without them
# codes are still issued (Outbox table) but never leave the server, and the UI says so.
[ -z "${RESEND_API_KEY:-}" ] || { setenv RESEND_API_KEY "$RESEND_API_KEY"; setenv EMAIL_FROM "${EMAIL_FROM:?EMAIL_FROM required with RESEND_API_KEY}"; }

# L1 licence gate: refuse to ship code we are not allowed to distribute (GPL/AGPL/unknown).
echo "▶ licence audit"; node scripts/licenses.mjs || die "licence audit failed — see scripts/licenses.mjs"

step "5/6 deploy (Vercel builds in the cloud: next build, Node 22, 8 GB — no heap flag needed)"
OUT="$(mktemp)"
"${VC[@]}" deploy --prod --yes 2>&1 | tee "$OUT" | grep -E "Production:|Aliased:|Inspect:|Error|error" || true
DEPLOY_URL="$(grep -oE 'https://[a-z0-9.-]+\.vercel\.app' "$OUT" | head -1 || true)"
[ -n "$DEPLOY_URL" ] || { cat "$OUT"; die "deploy did not print a URL"; }
# The per-deployment URL sits behind Vercel Deployment Protection (SSO → 302) by default;
# the project's production aliases are public. Ask Vercel for them instead of guessing.
# NB: `vercel inspect` writes its report to STDERR — hence 2>&1 (a 2>/dev/null here silently lost the aliases once).
ALIASES="$("${VC[@]}" inspect "$DEPLOY_URL" 2>&1 | grep -oE 'https://[a-z0-9.-]+\.vercel\.app' | grep -v "$DEPLOY_URL" | sort -u | awk '{ print length, $0 }' | sort -n | cut -d' ' -f2- || true)"
URL=""
for c in $ALIASES; do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 40 "$c/login" || true)"
  if [ "$code" = "200" ]; then URL="$c"; break; fi
done
[ -n "$URL" ] || { echo "  deployed as $DEPLOY_URL but no production alias answered 200 on /login — aliases seen: ${ALIASES:-none}"; URL="$DEPLOY_URL"; }
echo "  production URL: $URL"

step "6/6 smoke test against $URL"
LOGIN_PAGE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$URL/login")"
LOGIN_API="$(curl -s -i --max-time 30 -X POST "$URL/api/auth/login" -H 'content-type: application/json' -H "origin: $URL" \
  -d '{"email":"ramesh@demo.in","password":"city1234"}')"
API_CODE="$(printf '%s' "$LOGIN_API" | head -1 | grep -oE '[0-9]{3}' | head -1)"
COOKIE="$(printf '%s' "$LOGIN_API" | grep -i '^set-cookie' | sed 's/=[^;]*;/=…;/' | tr -d '\r')"
ANON="$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$URL/patient")"
echo "  GET  /login             → $LOGIN_PAGE   (expect 200)"
echo "  POST /api/auth/login    → $API_CODE   (expect 200; cookie must say SameSite=Lax; Secure)"
echo "  $COOKIE"
echo "  GET  /patient anonymous → $ANON   (expect 307 → /login)"
if [ "$LOGIN_PAGE" = "200" ] && [ "$API_CODE" = "200" ] && printf '%s' "$COOKIE" | grep -qi "secure"; then
  printf '\n\033[1;32m✔ CityCare is live: %s   (demo: ramesh@demo.in / city1234)\033[0m\n' "$URL"
  echo "  now: delete the Vercel token you created for this (Account Settings → Tokens)."
else
  printf '\n\033[1;33m! deployed but the smoke test did not pass — check: vercel logs %s --token …\033[0m\n' "$URL"
  exit 1
fi
