#!/usr/bin/env bash
set -euo pipefail

# The VITE_WS_URL rule: apps/web never hardcodes a host or port — the server URL
# comes from VITE_WS_URL (expanded at runtime for same-origin). Tests may use fixtures.
hits=$(grep -rnE 'localhost|127\.0\.0\.1|wss?://|https?://[^"'\''`[:space:]]*:[0-9]{2,5}' \
  apps/web/src --include='*.ts' --include='*.tsx' | grep -vE '\.test\.tsx?:' || true)

if [ -n "$hits" ]; then
  echo "✖ hardcoded host/port in apps/web — use VITE_WS_URL:"
  echo "$hits"
  exit 1
fi
echo "✓ no hardcoded host in apps/web"
