#!/usr/bin/env bash
set -euo pipefail

# The no-new-deps rule: every dependency in a tracked package.json must appear in
# .hooks/deps-allowlist.txt, so adding one is a visible, reviewed change.
node - <<'NODE'
const { readFileSync } = require('node:fs');
const { execSync } = require('node:child_process');
const allowed = new Set(
  readFileSync('.hooks/deps-allowlist.txt', 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#')),
);
const files = execSync('git ls-files "package.json" "*/package.json"').toString().trim().split('\n');
const unknown = [];
for (const file of files) {
  const pkg = JSON.parse(readFileSync(file, 'utf8'));
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const name of Object.keys(pkg[field] ?? {})) {
      if (!name.startsWith('@klatchr/') && !allowed.has(name)) {
        unknown.push(`  ${file}: ${name}`);
      }
    }
  }
}
if (unknown.length > 0) {
  console.log('✖ dependency not on .hooks/deps-allowlist.txt — ask before adding one:');
  console.log(unknown.join('\n'));
  process.exit(1);
}
console.log('✓ every dependency is on the allowlist');
NODE
