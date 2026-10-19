#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

step() { printf '\n\033[1;34m▶ %s\033[0m\n' "$1"; }

# Phased, fail-fast: cheap/local checks first, expensive last.

step "1 · no-todos";           bash .hooks/check-no-todos.sh
step "2 · bypass-directives";  bash .hooks/check-bypass-directives.sh
step "3 · purity (core/games)"; bash .hooks/check-purity.sh
step "3b · max-lines";          bash .hooks/check-max-lines.sh
step "3c · redaction + conformance tests"; bash .hooks/check-redaction-tests.sh
step "3d · boundary casts";     bash .hooks/check-boundary-casts.sh
step "3e · no hardcoded host";  bash .hooks/check-web-host.sh
step "3f · dependency allowlist"; bash .hooks/check-deps.sh
step "3g · Claude guard hook";  bash .hooks/check-claude-hooks.sh

step "4 · gitleaks (secrets)"
if command -v gitleaks >/dev/null 2>&1; then
  gitleaks detect --no-banner --source .
elif [ -n "${CI:-}" ]; then
  echo "✖ gitleaks is required in CI" && exit 1
else
  printf '\033[1;33m⚠ gitleaks not installed — secrets scan SKIPPED locally (CI still runs it).\033[0m\n'
fi

step "5 · biome (lint + format)";        pnpm exec biome check .
step "6 · knip (dead code)";             pnpm exec knip
step "7 · jscpd (duplication)";          pnpm exec jscpd .
step "8 · typecheck";                    pnpm -r typecheck
step "9 · type-coverage (no any)";       pnpm type-coverage
step "10 · dependency-cruiser (arch)";   pnpm exec depcruise packages apps --config .dependency-cruiser.cjs
step "11 · audit (prod, high+)";         pnpm audit --prod --audit-level=high
step "11b · licenses (allowlist)";       bash .hooks/check-licenses.sh
step "12 · tests (100% core/games)";     pnpm exec vitest run --coverage

printf '\n\033[1;32m✅ gate green\033[0m\n'
