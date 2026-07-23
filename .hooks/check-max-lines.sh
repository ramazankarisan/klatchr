#!/usr/bin/env bash
set -euo pipefail

# File-size caps. core/games are the pure "small" packages — held stricter.
STRICT=200   # packages/core, packages/games production files
NORMAL=400   # packages/protocol, apps production files
TESTS=400    # any *.test.ts / *.test.tsx

violations=0

check() {
  local max=$1
  shift
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    lines=$(wc -l < "$file")
    if [ "$lines" -gt "$max" ]; then
      echo "✖ $file: $lines lines (max $max)"
      violations=$((violations + 1))
    fi
  done < <("$@" 2>/dev/null)
}

prod() { find "$1" -type f \( -name '*.ts' -o -name '*.tsx' \) \
  ! -name '*.test.ts' ! -name '*.test.tsx' ! -path '*/node_modules/*' ! -path '*/dist/*'; }
tests() { find "$1" -type f \( -name '*.test.ts' -o -name '*.test.tsx' \) \
  ! -path '*/node_modules/*' ! -path '*/dist/*'; }

check "$STRICT" prod packages/core
check "$STRICT" prod packages/games
check "$NORMAL" prod packages/protocol
check "$NORMAL" prod apps
check "$TESTS"  tests packages
check "$TESTS"  tests apps

if [ "$violations" -gt 0 ]; then
  echo "✖ $violations file(s) over the line cap — split them."
  exit 1
fi
echo "✓ line caps ok (core/games ≤$STRICT prod, rest ≤$NORMAL, tests ≤$TESTS)"
