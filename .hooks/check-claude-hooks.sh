#!/usr/bin/env bash
set -euo pipefail

# The Claude guard hook is code too: replay its case table so a refactor can't
# silently stop it blocking (or start blocking ordinary commands).
node - <<'NODE'
const { execFileSync } = require('node:child_process');
const cases = require('./.claude/hooks/guard-bash.cases.json');
const wrong = [];
for (const [command, want] of cases) {
  const out = execFileSync('node', ['.claude/hooks/guard-bash.mjs'], {
    input: JSON.stringify({ tool_input: { command } }),
  }).toString();
  const got = out.includes('"deny"') ? 'deny' : 'allow';
  if (got !== want) {
    wrong.push(`  expected ${want}, got ${got}: ${JSON.stringify(command)}`);
  }
}
if (wrong.length > 0) {
  console.log('✖ .claude/hooks/guard-bash.mjs disagrees with its case table:');
  console.log(wrong.join('\n'));
  process.exit(1);
}
console.log(`✓ Claude guard hook passes ${cases.length} cases`);
NODE
