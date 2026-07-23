# CLAUDE.md — Klatchr

A party-game platform for teams. A host opens a room on a shared screen,
players join on their phones with a four-letter room code, and the group plays
a short game together. The platform hosts many games; the first is
Guess Who Said It.

The platform is the product. Games are modules that plug into it.

## Commands

```bash
pnpm install
pnpm test           # vitest, all packages
pnpm test:core      # vitest, packages/core only
pnpm typecheck      # tsc --noEmit, all packages
pnpm lint           # biome check (lint + format)
pnpm e2e            # playwright
pnpm dev            # server + web, concurrently
pnpm gate           # full pre-commit wall — all phases, fail_fast
```

Run `pnpm gate` before claiming any task is done. It runs the phased wall
(syntax → format → dead code → static analysis → types → module architecture →
build → tests → e2e) and fails fast. A task is not complete until the wall is
green. Do not report success on the basis of code you have written but not run.

## Structure

```
packages/core       room + player lifecycle, the Game interface, the game
                    registry. PURE. Knows nothing about any specific game.
packages/games      one directory per game, each exporting a Game
                    implementation. PURE.
packages/protocol   zod schemas for every client<->server message.
apps/server         NestJS + WebSocket gateway, room registry. Thin.
apps/web            React + TS + MUI. Platform shell + one view per game.
```

Dependency direction is one-way:

```
core  <-  games  <-  protocol  <-  server
                                <- web
```

`core` imports nothing from the other packages. `core` never imports from
`games` — the dependency points the other way, and the registry receives game
modules by injection, not by importing them. `server` and `web` never import
each other.

## The Game interface

Every game implements this. It lives in `packages/core`.

```ts
// A viewer is either a player (with an id) or the host's shared screen.
// The same type stamps who a redaction is for.
type Viewer =
  | { role: 'player'; id: PlayerId }
  | { role: 'host' };

// Room-authored roster facts. The room emits these and forwards them into the
// active game's reduce while IN_GAME. Defined in core; games never redefine it.
type RosterEvent =
  | { type: 'playerJoined'; player: Player }
  | { type: 'playerLeft'; id: PlayerId };

interface Game<TState, TEvent> {
  id: string;
  name: string;         // display name for the game picker
  description: string;  // one-line blurb for the game picker
  minPlayers: number;
  maxPlayers: number;
  init(players: Player[], deps: GameDeps, config?: unknown): TState;
  reduce(state: TState, event: TEvent | RosterEvent): Result<TState, GameError>;
  view(state: TState, viewer: Viewer): unknown;
  scores(state: TState): Score[];
  isComplete(state: TState): boolean;
}
```

`GameDeps` carries everything non-deterministic — a random source, a clock —
so that games stay pure and tests stay reproducible. `config` is reserved for
games that need setup (rounds, category); Guess Who ignores it.

**`view()` is a redaction boundary, not a convenience.** It returns what one
specific viewer is allowed to see. The server sends `view(state, viewer)` and
never the raw state. `{ role: 'host' }` is the shared screen — it is redacted
too, and its redaction is the strictest, because everyone in the room sees it.
If a game leaks hidden information through `view()`, that is a correctness bug
of the same severity as a crash.

**Roster changes reach a game as events, not a method.** A player joining or
leaving mid-round arrives at `reduce` as a `RosterEvent`. The game decides the
policy: a known id rejoining resumes its slot; a new id mid-round is a
spectator (not in the answer pool or guess targets); a player who left keeps
whatever they already submitted.

**Phase advance is a host-driven game event.** A phased game puts
`{ type: 'advance'; from: PhaseTag }` in its own `TEvent`. The reducer no-ops
when `state.phase !== from`, so a double-send is idempotent and never skips a
phase. Advance is never gated on everyone having acted — the host forces it.
Only the host may advance, but the pure reducer does not check that (it cannot
see the host); the server forwards an `advance` only from the host connection.

Adding a game means adding a directory under `packages/games` and registering
it. It must not require a change to `packages/core`. If it does, the interface
is wrong — stop and say so rather than special-casing the game in core.

## Hard rules

1. **`packages/core` and `packages/games` are pure.** No React, no NestJS, no
   sockets, no timers, no `Date.now()`, no `Math.random()`. Anything
   non-deterministic arrives through `GameDeps`. Reducers are
   `(state, event) => Result` and return new objects; never mutate the input.
2. **Every client<->server message is defined in `packages/protocol` and
   parsed with zod at the boundary.** The server parses every inbound message
   before touching it; the client parses every inbound message before
   rendering it. Never cast an incoming payload with `as`. If a message shape
   is missing, add it to `protocol` first, then use it.
3. **The server never broadcasts raw game state.** Every outbound state
   message is the result of `view(state, viewer)` for that recipient — a
   player gets `{ role: 'player', id }`, the host screen gets `{ role: 'host' }`.
4. **Every reducer transition needs a unit test**, including the rejections.
   A transition that should be refused needs a test proving it is refused.
   Rejections return an unchanged state plus a typed error. They do not throw.
5. **No `any`.** No `@ts-expect-error` or `eslint-disable` without a comment
   on the same line explaining why, and never in `core` or `games`.
6. **Server URL comes from `VITE_WS_URL`.** Never hardcode a host or port in
   `apps/web`.
7. **No database, no auth, no accounts.** Rooms live in server memory and are
   discarded when empty. Do not add persistence.
8. **Do not add dependencies** without asking first. Runtime stack is fixed:
   pnpm, TypeScript, vitest, zod, NestJS, React, MUI, playwright. Approved
   tooling: **biome** (lint + format, replaces eslint), dependency-cruiser,
   knip, jscpd, type-coverage, husky + lint-staged, gitleaks.
   **No Python.** The `pre-commit` framework and semgrep are excluded; the gate
   wall is node/bash-native, orchestrated by `pnpm gate`. Call-level purity in
   `core`/`games` (no `Math.random`/`Date.now`/timers) is enforced by
   `.hooks/check-purity.sh` + dependency-cruiser, not semgrep.
9. **UI is designed before it is built.** For any UI addition or change in
   `apps/web`, first produce a design sketch on a Claude design surface and
   publish it for the user to review and control. Do **not** write component
   code until the sketch is approved. `design.md` is the design-system source
   of truth (tokens, the two surfaces, component style); keep it current and
   design against it. Applies to every screen: host lobby, join, game views,
   scores.

## Testing

- `packages/core` and `packages/games` have a coverage threshold of 100% lines
  and branches. They are pure and small; there is no excuse for a gap. If
  coverage drops the build fails — fix the test, do not lower the threshold.
- Every game must have a **redaction test**: assert that
  `view(state, { role: 'player', id })` for a player in a hidden-information
  phase contains no field that would reveal another player's hidden data. Cover
  the host viewer too — `view(state, { role: 'host' })` on the shared screen is
  the strictest case, since everyone sees it.
- Tests are behavioural: assert on returned state, views and scores, not on
  internal helper calls.
- `apps/web` tests use React Testing Library, query by role and label, never
  by test id or class name.
- E2E uses two Playwright browser contexts in one test to exercise a real
  two-player round. E2E is written at the **end of Cycle 4 as verification**,
  not as a red-green driver — the acceptance rows (P1–P7, G1–G10) drive the
  unit loop; the browser E2E confirms the whole stack once web exists.

## Working style

- Follow the RPI cycle: research, then a written plan in `docs/plan-N.md`,
  then implement. Do not start implementing before the plan is approved.
- **RPI is TDD inside.** In the implement step, work red → green → refactor:
  write the failing unit test from the acceptance row first, then the code to
  pass it. `core`/`games` are pure with a 100% threshold, so TDD is the natural
  fit. Redaction tests (G8–G10) are written first, before the game logic.
- One cycle per session. Start a fresh session for the next cycle and load
  only the package that cycle touches, plus its plan file.
- When something in this file turns out to be wrong or unworkable, say so and
  propose a change. Do not silently work around it.
