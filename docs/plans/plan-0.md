# plan-0 — Scaffold & gate wall

**Cycle 0 (pre-game setup).** Stand up the pnpm monorepo skeleton and a
node/bash pre-commit gate wall (no Python), so every later cycle is born green
under the gates. No game logic here — just the frame and the backpressure.

## Deliverable / exit criteria

- `pnpm install` succeeds.
- `pnpm gate` runs the full phased wall and is **green** on the empty-but-valid
  skeleton (each package has a trivial typed export + one passing test so the
  100% threshold and build have something real to chew).
- The dependency-cruiser rules are in place and provably fail when a forbidden
  import is added (verify with one throwaway bad import, then delete it).

## Dependencies to add (dev only — approved in CLAUDE.md rule 8)

`typescript`, `vitest`, `@vitest/coverage-v8`, `zod`, `@biomejs/biome`,
`dependency-cruiser`, `knip`, `jscpd`, `type-coverage`, `husky`, `lint-staged`,
`@playwright/test`. Runtime deps (`@nestjs/*`, `react`, `mui`, ws) are added by
the cycle that first needs them, not here. `gitleaks` is a Go binary installed
out-of-band (brew); the hook skips gracefully if absent.

## Monorepo layout

```
pnpm-workspace.yaml         packages/*, apps/*
tsconfig.base.json          strict: true, noUncheckedIndexedAccess, etc.
biome.json                  lint + format config (replaces eslint/prettier)
.dependency-cruiser.cjs     the architecture rules (below)
knip.json  .jscpd.json
package.json                scripts incl. `gate` (phased runner)
.husky/pre-commit           runs `pnpm gate`
.hooks/                     check-purity.sh, check-bypass-directives.sh,
                            check-no-todos.sh   (bash, ported from source repo)
packages/core/              trivial seed export + test
packages/games/             (empty index, seed test)
packages/protocol/          (empty index, seed test)
apps/server/                (empty, seed test)
apps/web/                   (empty, seed test)
```

## `pnpm gate` — phases (fail_fast, cheap → expensive)

1. **Syntax/safety** — biome format check; JSON validity; merge-conflict &
   TODO scan (`check-no-todos.sh`); gitleaks (skip if not installed).
2. **Dead code** — knip (unused files, exports, deps).
3. **Duplication** — jscpd.
4. **Static** — biome lint; `check-purity.sh` (core+games); `check-bypass-directives.sh`.
5. **Types** — `tsc --noEmit` all packages; type-coverage ≥ 99.9% (no `any`).
6. **Architecture** — dependency-cruiser (rules below).
7. **Build** — tsc build of server/web (added when those cycles land).
8. **Tests** — vitest, 100% lines+branches on core & games.
9. **E2E** — playwright (wired now, populated end of Cycle 4; not on pre-commit
   — runs on pre-push/CI).

## dependency-cruiser rules (the arch enforcement — the key artifact)

Encodes the one-way direction `core ← games ← protocol ← server/web`:

- `core` may import **nothing** from `games`, `protocol`, `apps/*`.
- `games` may import **only** `core` (not `protocol`, not `apps/*`).
- `protocol` may import `games`, `core`, `zod` — nothing from `apps/*`.
- `apps/server` ↛ `apps/web` and `apps/web` ↛ `apps/server`.
- **Purity imports:** no `react`, `@nestjs/*`, `ws`/socket libs, node `timers`
  in `packages/core` or `packages/games`.
- no circular deps; production code must not import `*.test.*`/`*.spec.*`.

## Bash micro-gates (ported from the source repo, no Python)

- **check-purity.sh** — greps `packages/core` + `packages/games` for
  `Math.random`, `Date.now`, `new Date(`, `setTimeout`, `setInterval`,
  `setImmediate`, `performance.now`, `process.hrtime`. Any hit fails. (Covers
  what semgrep did.)
- **check-bypass-directives.sh** — any `@ts-expect-error` / `@ts-ignore` /
  `@ts-nocheck` / `biome-ignore` / `type-coverage:ignore` needs a
  justification comment on the line directly above; **banned outright** in
  `core`/`games`.
- **check-no-todos.sh** — no `TODO`/`FIXME`/`XXX` in committed source.

## TDD wiring

- vitest configured per package; coverage thresholds (100% core/games) fail the
  build if unmet — this is what makes red→green→refactor enforceable.
- The seed tests are real (assert the trivial export), so the wall is honestly
  green, not green-because-empty.

## Not in this cycle

Game logic, room logic, protocol schemas, server, web — those are Cycles 1–4.
Runtime deps for them are installed by their cycle. Security scanners beyond
gitleaks (osv/trivy) are optional and can be added later without touching code.
