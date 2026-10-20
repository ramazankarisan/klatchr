# 0002 — Pure reducers; games reach core by injection

**Status:** accepted · origin: [plan-0](../plans/plan-0.md), [plan-1](../plans/plan-1.md), [plan-3](../plans/plan-3.md)

## Context

The platform is the product; games are meant to be added without touching it. Multiplayer
logic is also where the hardest bugs live, and those are cheapest to find without sockets,
timers or a browser.

## Decision

- A room is a pure value reduced by `roomReduce(room, event, actor, ctx)`; a game is a pure
  module (`init`, `reduce`, `view`, `scores`, `isComplete`) in `packages/games`.
- No I/O, clocks or randomness inside core or games: time, ids and randomness are injected
  (`RoomDeps` through `ctx`, and `GameDeps { random, now, round }` into a game's `init`).
  The gate's purity check rejects clocks, `Math.random`, timers, `crypto` and `process.env`;
  dependency-cruiser rejects Node built-ins and frameworks.
- Dependencies point `core <- games`. Core never imports a game: the server builds a
  registry and hands it in (Dependency direction, enforced by dependency-cruiser).

## Consequences

- Every transition is unit-testable, and core and games hold 100% coverage.
- Property-based conformance (`@klatchr/core/conformance`) can fuzz any game with random
  event sequences, and the scenario DSL replays reconnect stories without a network.
- The server is a thin shell: it owns sockets, timers and fan-out, not rules.
- Anything stateful in time (grace windows, heartbeats) has to live outside the reducer.
