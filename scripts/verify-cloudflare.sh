#!/usr/bin/env bash
set -euo pipefail

# Static publishing smoke checks; intentionally do not exercise payments or AI.
for file in \
  dist/index.html \
  dist/privacy.html \
  dist/manifest.webmanifest \
  dist/sw.js \
  dist/_headers \
  dist/icons/icon-192.png \
  dist/icons/icon-512.png \
  dist/assets/audio/relax.mp3 \
  dist/assets/audio/seance1.mp3
do
  if [ ! -s "$file" ]; then
    echo "ERROR: missing or empty published asset: $file" >&2
    exit 1
  fi
done

# Frontend must retain the server-side Supabase integration points.
for marker in 'ai-support' 'premium-access' 'stripe-checkout' 'stripe-portal'; do
  if ! grep -q "$marker" dist/index.html; then
    echo "ERROR: missing expected client integration: $marker" >&2
    exit 1
  fi
done

# Detect accidental exposure of server code, archives or common secret formats.
for path in dist/supabase dist/.git dist/.env dist/.env.local dist/allo-psycho-v9.2.0-mistral-stripe.zip; do
  if [ -e "$path" ]; then
    echo "ERROR: private build input included in public assets: $path" >&2
    exit 1
  fi
done

if grep -ERq 'sk_(live|test)_[a-zA-Z0-9]{12,}|whsec_[a-zA-Z0-9]{12,}' dist; then
  echo "ERROR: potential payment secret in public assets" >&2
  exit 1
fi

echo "Cloudflare smoke checks passed (assets, integration markers, exclusions)."


# Anti-regression checks for validated public resources library.
if ! grep -q 'ALLO_PUBLIC_RESOURCES_V954' dist/index.html; then
  echo "ERROR: validated public resources library missing from Cloudflare bundle" >&2
  exit 1
fi
if ! grep -q 'RESSOURCES PUBLIQUES & COMPLÉMENTAIRES' dist/index.html; then
  echo "ERROR: public resources section label missing from Cloudflare bundle" >&2
  exit 1
fi
if ! grep -q '66 ressources' dist/index.html; then
  echo "ERROR: expected 66 public resources marker missing from Cloudflare bundle" >&2
  exit 1
fi
