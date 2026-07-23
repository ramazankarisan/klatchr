#!/usr/bin/env bash
set -euo pipefail

# License allowlist gate. Fails if any production dependency ships a license
# that is not permissive — keeps copyleft (GPL/AGPL/LGPL/SSPL/BUSL) out of the
# tree before it can taint distribution. Node/bash-native, no new dependency.

# Permissive SPDX ids. Compound "(A OR B)" strings pass if they name any of
# MIT / Apache / BSD / ISC (you can satisfy the OR with a permissive option).
ALLOW='^(MIT|MIT-0|ISC|Apache-2\.0|BSD-2-Clause|BSD-3-Clause|0BSD|BlueOak-1\.0\.0|Unlicense|CC0-1\.0|Python-2\.0|\(.*(MIT|Apache|BSD|ISC).*\))$'

pnpm licenses list --prod --json 2>/dev/null | ALLOW="$ALLOW" node -e '
let s = "";
process.stdin.on("data", (d) => (s += d)).on("end", () => {
  const o = JSON.parse(s || "{}");
  const re = new RegExp(process.env.ALLOW);
  const bad = [];
  for (const [lic, pkgs] of Object.entries(o)) {
    if (!re.test(lic)) for (const p of pkgs) bad.push(`${p.name} — ${lic}`);
  }
  if (bad.length) {
    console.error("✖ non-allowlisted licenses:");
    for (const b of bad) console.error("  " + b);
    process.exit(1);
  }
  console.log("✓ all production dependency licenses allowlisted");
});'
