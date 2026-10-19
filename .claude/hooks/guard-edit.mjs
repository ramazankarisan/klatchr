// PreToolUse(Edit|Write): the guard files define the wall itself (coverage
// thresholds, gate phases, architecture rules, CI). An agent loosening them to get
// green is the failure this prevents — so editing one always asks a human first.
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8'));
// Resolve against the project root, not the session cwd: from a subdirectory a
// cwd-relative path would start with ../ and slip past every pattern.
const root = process.env.CLAUDE_PROJECT_DIR ?? input?.cwd ?? process.cwd();
const file = resolve(input?.cwd ?? root, String(input?.tool_input?.file_path ?? ''));
const path = relative(root, file).replaceAll('\\', '/');

const GUARDED = [
  /^vitest\.config\.ts$/,
  /^scripts\/gate\.sh$/,
  /^\.hooks\//,
  /^\.husky\//,
  /^\.dependency-cruiser\.cjs$/,
  /^biome\.json$/,
  /^knip\.json$/,
  /^\.jscpd\.json$/,
  /^\.github\/workflows\//,
  /^\.claude\/(settings\.json|hooks\/)/,
];

if (GUARDED.some((pattern) => pattern.test(path))) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason: `${path} is part of the gate wall — confirm this change is intended, not a way around a failing check.`,
      },
    }),
  );
}
