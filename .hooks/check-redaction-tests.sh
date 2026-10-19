#!/usr/bin/env bash
set -euo pipefail

# Every game must prove it leaks nothing (packages/CLAUDE.md). 100% coverage forces
# view() to *execute*, not to *withhold* — only these tests prove the no-leak
# property. Each immediate subdirectory of packages/games/src is a game and must ship:
#   redaction.test.ts   — covering BOTH a player viewer and the host viewer
#   conformance.test.ts — feeding both kits from @klatchr/core/conformance
GAMES_DIR='packages/games/src'

problems=''
add() { problems="${problems}  $1"$'\n'; }

for dir in "$GAMES_DIR"/*/; do
  [ -d "$dir" ] || continue # no game dirs yet ⇒ vacuously fine
  redaction="${dir}redaction.test.ts"
  conformance="${dir}conformance.test.ts"
  if [ ! -f "$redaction" ]; then
    add "${dir}: no redaction.test.ts"
  else
    grep -q "role: 'host'" "$redaction" || add "$redaction: never checks the host viewer"
    grep -q "role: 'player'" "$redaction" || add "$redaction: never checks a player viewer"
  fi
  if [ ! -f "$conformance" ]; then
    add "${dir}: no conformance.test.ts"
  else
    grep -q 'stormConformance' "$conformance" || add "$conformance: does not run stormConformance"
    grep -q 'redactionNonInterference' "$conformance" ||
      add "$conformance: does not run redactionNonInterference"
  fi
done

if [ -n "$problems" ]; then
  echo "✖ game(s) missing their proof of no leaks:"
  printf '%s' "$problems"
  exit 1
fi
echo "✓ every game has redaction (host + player) and conformance tests"
