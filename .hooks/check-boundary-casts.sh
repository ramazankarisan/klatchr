#!/usr/bin/env bash
set -euo pipefail

# The parse-at-the-boundary rule: an incoming payload is parsed (zod, or a type
# predicate), never cast. In the code that touches wire data — the server, the web
# transport, the protocol — no `as` cast is allowed at all (`as const` and import
# aliases are fine). Comments are ignored. Tests and testkits may cast fixtures.
DIRS='apps/server/src apps/web/src/transport packages/protocol/src'

hits=$(
  # shellcheck disable=SC2086 # DIRS is a deliberate word list
  find $DIRS -type f \( -name '*.ts' -o -name '*.tsx' \) \
    ! -name '*.test.ts' ! -name '*.test.tsx' ! -name '*.testkit.ts' -print0 |
    xargs -0 awk '
      /^[[:space:]]*(\*|\/\*|\/\/)/ { next }            # comment lines
      # import/export alias lists (`{ a as b }`, `* as ns`), single- or multi-line
      inlist { if ($0 ~ /\}/) inlist = 0; next }
      /^[[:space:]]*(import|export)[[:space:]]+(type[[:space:]]+)?(\{|\*)/ {
        if ($0 ~ /\{/ && $0 !~ /\}/) inlist = 1
        next
      }
      {
        line = $0
        sub(/\/\/.*$/, "", line)                          # trailing // comments
        gsub(/as const/, "", line)
        if (line ~ /(^|[^A-Za-z0-9_.$])as[ \t]+[A-Za-z_{(\[]/) {
          printf "%s:%d: %s\n", FILENAME, FNR, $0
        }
      }'
)

if [ -n "$hits" ]; then
  echo "✖ \`as\` casts in boundary code — parse the payload instead (zod or a type predicate):"
  echo "$hits"
  exit 1
fi
echo "✓ no casts in boundary code"
