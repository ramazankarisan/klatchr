#!/usr/bin/env bash
set -euo pipefail

# packages/core and packages/games are PURE. Every non-deterministic value must
# arrive through GameDeps / RoomDeps — never a direct call. This is the semgrep
# replacement (no Python): a grep gate over the two pure packages.
PATTERN='Math\.random|Date\.now|(^|[^A-Za-z.])Date\(|setTimeout|setInterval|setImmediate|queueMicrotask|requestAnimationFrame|performance\.now|process\.(env|hrtime)|crypto\.|globalThis|fetch\('

hits=$(grep -rnE "$PATTERN" packages/core packages/games 2>/dev/null \
  --include='*.ts' | grep -vE '\.test\.ts:' || true)

if [ -n "$hits" ]; then
  echo "✖ impurity in core/games — nondeterminism must arrive via deps, not direct calls:"
  echo "$hits"
  exit 1
fi
echo "✓ core/games pure"
