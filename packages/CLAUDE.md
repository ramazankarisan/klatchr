# packages — core, games, protocol

The Game contract: @core/src/game.ts

## Purity

`core` and `games` are pure: no React, NestJS, sockets, timers, `Date.now()` or
`Math.random()`. Randomness, the clock and the round arrive through `GameDeps`
(`core/src/deps.ts`). Reducers are `(state, event) => Result` and return new
objects — never mutate the input. Enforced by `.hooks/check-purity.sh`.

## Game semantics

- **`view(state, viewer)` is a redaction boundary.** It returns only what that
  viewer may see. The host screen (`{ role: 'host' }`) is seen by everyone, so
  its redaction is the strictest. A leak through `view()` is as severe as a crash.
- **Roster changes arrive as `RosterEvent`s in `reduce`.** A known id rejoining
  resumes its slot; a new id mid-round is a spectator; a leaver keeps what they
  submitted. The room forfeits a mid-round leaver's round: only seated players'
  scores are folded or shown (`roundScores` in `core/src/room.ts`).
- **Phase advance is a host-driven game event** `{ type: 'advance', from }`.
  The reducer no-ops when `state.phase !== from` (idempotent double-send) and
  never waits for everyone to act. The server forwards it only from the host.
- `config` is an opaque per-game blob the host authors; the game validates it,
  the room never looks inside. `roundCount(config)` bounds the session.
- **Every reducer transition has a unit test, rejections included** — in the
  room reducer and in every game. A refused transition needs a test proving it
  is refused. Rejections return the unchanged state plus a typed error; they
  never throw.

## Adding a game

Touches only `games/src/<game>/` and `apps/web`. If it needs a `core` change,
the interface is wrong — stop and say so; never special-case a game in core.

1. The pure module: `state`, `events`, `reduce`, `view`, `scores`.
2. Register it in `games/src/index.ts`.
3. A unit test for every transition, rejections included (see above).
4. `redaction.test.ts` covering both a player and the host viewer (the gate
   refuses a game without one).
5. `conformance.test.ts`: fast-check arbitraries fed to
   `stormConformance` + `redactionNonInterference` from `@klatchr/core/conformance`
   — copy either existing game's file.
6. A web view (see `apps/web/CLAUDE.md`: design first).

## Testing

- 100% line and branch coverage in core and games. Never lower the threshold.
- Tests are behavioural: assert on returned state, views and scores.
- Reconnect behaviour is written with the scenario DSL
  (`@klatchr/core/scenario`): drop-within-grace is no event, reap is `leave`,
  resume is the token join. See the per-game `reconnect.matrix.test.ts`.
- The conformance kit checks, at every step of a fuzzed event storm: never
  throws, typed rejections, no input mutation (deep-freeze), redaction
  non-interference, scores only for seated players. A failure prints a
  fast-check seed and shrunk trace — an exact repro.
