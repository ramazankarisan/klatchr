#!/usr/bin/env bash
set -euo pipefail

# Every game must ship a redaction test (CLAUDE.md § Testing). 100% coverage
# forces view() to *execute*, but not to *withhold* hidden info — only a
# redaction test proves the no-leak property. This asserts the file exists so a
# new game directory cannot skip it. Each immediate subdirectory of
# packages/games/src is a game and must contain a redaction.test.ts.
GAMES_DIR='packages/games/src'

missing=''
for dir in "$GAMES_DIR"/*/; do
  [ -d "$dir" ] || continue # no game dirs yet ⇒ vacuously fine
  if [ ! -f "${dir}redaction.test.ts" ]; then
    missing="${missing}  ${dir}"$'\n'
  fi
done

if [ -n "$missing" ]; then
  echo "✖ game(s) with no redaction.test.ts — a game must prove view() leaks nothing:"
  printf '%s' "$missing"
  exit 1
fi
echo "✓ every game has a redaction test"
