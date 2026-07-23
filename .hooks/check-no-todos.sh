#!/usr/bin/env bash
set -euo pipefail

# No TODO-style markers in committed source. Unfinished work is a red test, not a comment.
PATTERN='(TODO|FIXME|XXX|HACK)'

hits=$(grep -rnE "$PATTERN" packages apps 2>/dev/null \
  --include='*.ts' --include='*.tsx' || true)

if [ -n "$hits" ]; then
  echo "✖ TODO-style markers found (finish it or write a failing test):"
  echo "$hits"
  exit 1
fi
echo "✓ no TODO markers"
