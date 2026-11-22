#!/usr/bin/env bash
set -euo pipefail

# Export only browser-facing files. Never publish source ZIPs, backend code,
# Git metadata, or secret files to a public static host.
rm -rf dist
mkdir -p dist/icons dist/assets/audio
cp index.html privacy.html manifest.webmanifest sw.js dist/
# Public reference catalog (only links and credits, no clinical data).
cp ressources-complementaires.html ressources-jardin-mental.json dist/
cp icons/icon-192.png icons/icon-512.png dist/icons/
cp assets/audio/*.mp3 dist/assets/audio/

cat > dist/_headers <<'HEADERS'
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Strict-Transport-Security: max-age=31536000; includeSubDomains

/index.html
  Cache-Control: no-cache

/
  Cache-Control: no-cache

/sw.js
  Cache-Control: no-cache

/manifest.webmanifest
  Cache-Control: no-cache
HEADERS

bash scripts/verify-cloudflare.sh

echo "Cloudflare static bundle ready in dist/"
find dist -type f | sort
