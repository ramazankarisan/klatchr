# Klatchr

A party-game platform for teams. A host opens a room on a shared screen, players
join from their phones with a four-letter room code, and the group plays a short
game together.

The platform is the product; games are modules that plug into it. The first game
is **Guess Who Said It**.

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
  code) → Implement. One cycle per session.
- **TDD inside implement** — red → green → refactor. `core` and `games` are pure
  with a 100% coverage threshold; redaction tests are written first.
- **`CLAUDE.md`** — the agent's standing instructions: architecture, hard rules,
  and working style. It overrides default agent behavior.
- **Gate wall** (`pnpm gate`) — a phased, fail-fast check (syntax → format → dead
  code → static analysis → types → module architecture → build → tests → e2e). A
  task is not done until the wall is green.

See `CLAUDE.md` for the full rules and `SPEC.md` for the design.
