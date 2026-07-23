#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

step() { printf '\n\033[1;34m▶ %s\033[0m\n' "$1"; }

# Phased, fail-fast: cheap/local checks first, expensive last.

step "1 · no-todos";           bash .hooks/check-no-todos.sh
step "2 · bypass-directives";  bash .hooks/check-bypass-directives.sh
step "3 · purity (core/games)"; bash .hooks/check-purity.sh
step "3b · max-lines";          bash .hooks/check-max-lines.sh

step "4 · gitleaks (secrets)"
if command -v gitleaks >/dev/null 2>&1; then
  gitleaks detect --no-banner --source .
else
  echo "gitleaks not installed — skipped (install: brew install gitleaks)"
fi

step "5 · biome (lint + format)";        pnpm exec biome check .
step "6 · knip (dead code)";             pnpm exec knip
step "7 · jscpd (duplication)";          pnpm exec jscpd .
step "8 · typecheck";                    pnpm -r typecheck
step "9 · type-coverage (no any)";       pnpm type-coverage
step "10 · dependency-cruiser (arch)";   pnpm exec depcruise packages apps --config .dependency-cruiser.cjs
step "11 · tests (100% core/games)";     pnpm exec vitest run --coverage

printf '\n\033[1;32m✅ gate green\033[0m\n'
