// PreToolUse(Bash): refuse the commands that would let an agent skip the wall.
// The local husky hooks are the backpressure; --no-verify, HUSKY=0 or a hooksPath
// override switch them off, and a direct push to main skips the PR + CI gate.
// Input: the hook JSON on stdin.
//
// Rules match real usage, not text: a doc or commit message that mentions a flag must
// not be blocked. So heredoc bodies and quoted strings *with spaces* (prose) are
// blanked out, while a quoted single word ("--no-verify") is unquoted, since the
// shell passes it as the bare argument.
import { readFileSync } from 'node:fs';

const input = JSON.parse(readFileSync(0, 'utf8'));
const command = String(input?.tool_input?.command ?? '');

const segments = command
  .replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2(?=\n|$)/g, '<<heredoc')
  .replace(/'([^']*)'|"((?:[^"\\]|\\.)*)"/g, (_m, single, double) => {
    const text = single ?? double ?? '';
    return /\s/.test(text) ? '""' : text;
  })
  .split(/\n|;|&&|\|\||\|/);

// `git` plus any global options (-C dir, -c key=value, --git-dir=…) before the subcommand.
const GIT = String.raw`^\s*(\S+=\S*\s+)*git(\s+(-[Cc]\s+\S+|--\S+))*\s+`;

const rules = [
  [new RegExp(`${GIT}(commit|push|merge|rebase|am)\\b.*\\s(--no-verify|-n)(\\s|$)`), 'skips the husky hooks (the local gate)'],
  [/^\s*(export\s+)?(\S+=\S*\s+)*HUSKY=0(\s|$)/, 'disables the husky hooks (the local gate)'],
  [/^\s*(\S+=\S*\s+)*git\b.*\s-c\s+core\.hooksPath=/, 'redirects git hooks away from husky (the local gate)'],
  [new RegExp(`${GIT}config\\s+(--(global|local|system)\\s+)?core\\.hooksPath\\s+\\S`), 'redirects git hooks away from husky (the local gate)'],
  [new RegExp(`${GIT}push\\b.*(\\s|:|/)(main|master)(\\s|$)`), 'pushes straight to main — open a PR'],
];

for (const segment of segments) {
  const hit = rules.find(([pattern]) => pattern.test(segment));
  if (hit) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `Blocked by .claude/hooks/guard-bash.mjs: this ${hit[1]}.`,
        },
      }),
    );
    break;
  }
}
