#!/usr/bin/env bash
set -euo pipefail

# Suppression directives are banned outright in core/games, and elsewhere require
# a justification comment on the line directly above.
BYPASS='(@ts-ignore|@ts-nocheck|@ts-expect-error|biome-ignore|type-coverage:ignore)'

# 1) Banned outright in the pure packages.
core_hits=$(grep -rnE "$BYPASS" packages/core packages/games 2>/dev/null \
  --include='*.ts' || true)
if [ -n "$core_hits" ]; then
  echo "✖ bypass directives are banned in core/games:"
  echo "$core_hits"
  exit 1
fi

# 2) Elsewhere: require a justification on the immediately preceding line.
status=0
matches=$(grep -rnE "$BYPASS" packages apps 2>/dev/null \
  --include='*.ts' --include='*.tsx' | grep -vE '^packages/(core|games)/' || true)

while IFS= read -r match; do
  [ -z "$match" ] && continue
  file=$(echo "$match" | cut -d: -f1)
  lineno=$(echo "$match" | cut -d: -f2)
  prev=$((lineno - 1))
  if [ "$prev" -lt 1 ]; then
    echo "✖ $file:$lineno — bypass on the first line, no room for a justification"
    status=1
    continue
  fi
  above=$(sed -n "${prev}p" "$file")
  # A justification is a comment line above (biome-ignore carries its own reason after ':').
  if ! echo "$above" | grep -qE '(BYPASS-JUSTIFICATION:|//.+|/\*.+)'; then
    echo "✖ $file:$lineno — bypass needs a justification comment on the line above"
    status=1
  fi
done <<< "$matches"

if [ "$status" -ne 0 ]; then
  exit 1
fi
echo "✓ bypass directives justified (none in core/games)"
