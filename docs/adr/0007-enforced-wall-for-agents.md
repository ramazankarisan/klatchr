# 0007 — AI-agent work is held to an enforced gate

**Status:** accepted · origin: [plan-0](../plans/plan-0.md), extended in [plan-15](../plans/plan-15.md)

## Context

Most of Klatchr is written by an AI coding agent. Written guidance alone drifts: an agent
under pressure to finish can skip a hook, loosen a threshold or report success for code it
did not run.

## Decision

- `pnpm gate` (`scripts/gate.sh`) is the definition of done: lint, dead code, duplication,
  types, type coverage, architecture, audit, licenses, the project's own checks (purity,
  redaction tests, boundary casts, hardcoded hosts, dependency allowlist, line caps) and
  tests with coverage thresholds. Husky runs it before every push; CI runs it plus
  Playwright end-to-end on every PR.
- Claude Code hooks (`.claude/hooks/`) refuse bypasses (`--no-verify`, `HUSKY=0`, pushing to
  `main`) and ask before an agent edits the gate itself.
- Rules live in short `CLAUDE.md` files per area, cited by name in code comments; work
  goes research → written plan → approval → TDD.

## Consequences

- A red check means fixing the code; changing the wall needs the owner's approval.
- The gate is slower than a bare test run, and some checks are blunt (line caps, banned
  patterns), which occasionally forces a file split.
- The plans in `docs/plans/` double as the project's history.
