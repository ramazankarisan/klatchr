# Klatchr

A party-game platform for teams. A host opens a room on a shared screen, players
join from their phones with a four-letter room code, and the group plays a short
game together.

The platform is the product; games are modules that plug into it. Two games ship
today: **Guess Who Said It** and **Most Likely To**. A host can play the built-in
questions in one tap, or bring their own — pour in a themed pack, reorder it, and
add custom questions in the lobby. A question set is a session: it plays through
once, in order, then the game ends to the final standings.

**Live:** <https://klatchr.duckdns.org> — a host opens a room, players join from
their phones. Rooms are in-memory, so a redeploy resets them.

> Side project. This README is intentionally minimal and will grow as the project does.

## What it does

- Host opens a room → gets a four-letter code, shown on a shared screen.
- Players join on their phones with the code.
- The group plays a round together; the shared screen shows public state, each
  phone shows only what that player is allowed to see.
- Rooms live in server memory and vanish when empty — no accounts, no database.

## Stack

TypeScript monorepo (pnpm workspaces).

| Package            | Role                                                        |
| ------------------ | ----------------------------------------------------------- |
| `packages/core`    | Room + player lifecycle, the `Game` interface, registry. Pure. |
| `packages/games`   | One directory per game, each exporting a `Game`. Pure.      |
| `packages/protocol`| zod schemas for every client↔server message.                |
| `apps/server`      | NestJS + WebSocket gateway, room registry.                  |
| `apps/web`         | React + TS + MUI. Platform shell + one view per game.       |

## Commands

```bash
pnpm install
pnpm dev        # server + web
pnpm test       # vitest
pnpm gate       # full pre-commit wall — run before calling any task done
```

## Agentic coding

This project is built with an AI coding agent (Claude Code) under a fixed method:

- **RPI cycle** — Research → Plan (written to `docs/plan-N.md`, approved before
  code) → Implement.
- **TDD inside implement** — red → green → refactor. `core` and `games` are pure
  with a 100% coverage threshold; redaction tests are written first.
- **`CLAUDE.md`** — the agent's standing instructions: a short root file with the
  architecture rules and working style, plus one per area (`packages/`,
  `apps/server/`, `apps/web/`, `e2e/`) that loads only when the agent works there.
- **Gate wall** (`pnpm gate`, `scripts/gate.sh`) — a fail-fast wall: custom checks
  (purity, redaction tests, bypass directives, line caps), secrets scan, biome,
  dead code, duplication, types, type coverage, module architecture, audit, tests.
  A task is not done until the wall is green. End-to-end tests (`pnpm e2e`) run in CI on every
  PR and at cycle end, not on every commit.

See `CLAUDE.md` and the per-area `CLAUDE.md` files for the full rules and `SPEC.md` for the design.
