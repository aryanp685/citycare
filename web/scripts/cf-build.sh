#!/usr/bin/env bash
# Build the Cloudflare Worker bundle (.open-next/) WITHOUT baking local dev secrets in.
# `.env.local` holds the sandbox DATABASE_URL + dev SESSION_SECRET; OpenNext would ship
# any .env* it finds inside the bundle, so it is parked outside the tree during the build.
set -euo pipefail
cd "$(dirname "$0")/.."
parked=""
if [ -f .env.local ]; then
  parked="$(mktemp /tmp/citycare-env.XXXXXX)"
  mv .env.local "$parked"
fi
restore() { if [ -n "$parked" ] && [ -f "$parked" ]; then mv "$parked" .env.local; fi; }
trap restore EXIT
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1150}"   # 2 GB box: next build OOMs at the default heap
npx opennextjs-cloudflare build
# size gate: Workers FREE plan rejects bundles > 3 MiB gzipped. `.open-next/worker.js` is
# only a stub that imports the server function, so measure what wrangler would upload.
out="$(mktemp -d)"
npx wrangler deploy --dry-run --outdir="$out" 2>&1 | grep -E "Total Upload" || true
gz=$(gzip -9 -c "$out/worker.js" | wc -c); rm -rf "$out"
printf 'final Worker bundle gzipped: %d KiB (free-plan limit 3072 KiB)\n' $((gz/1024))
if [ "$gz" -gt $((3*1024*1024)) ]; then echo "!! bundle exceeds the free-plan size limit" >&2; exit 1; fi
