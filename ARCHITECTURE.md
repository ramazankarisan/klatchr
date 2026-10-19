# Architecture

How Klatchr is put together and why. For the rules an agent works under, see `CLAUDE.md`.

## Shape

```
core  <-  games            pure: reducers, no I/O
protocol                   zod schemas only
server  -> core, games, protocol
web     -> core, games, protocol      (server and web never import each other)
```

The direction is enforced by dependency-cruiser in `pnpm gate`. `core` never imports a game:
the server builds a registry from `@klatchr/games` and hands it to the room by injection,
which is what lets a new game ship without touching `core`.

## The room

A room is a pure value reduced by `roomReduce(room, event, actor, ctx)` in
`packages/core/src/room.ts`.

- **Phases:** `LOBBY` → `IN_GAME` → `SCORES` → (next round) `IN_GAME` … The host picks a game,
  optionally configures its question set, and starts rounds. A question set is the session:
  once it is spent the game ends on the final standings.
- **Players:** a join mints a player id and a secret reconnect token. Nicknames are display
  only (duplicates allowed). Rooms seat up to 50; a game seats up to its own maximum per
  round, and the rest spectate and rotate in.
- **Scores:** each round's scores fold into a session tally on entry to `SCORES`. A player who
  leaves mid-round forfeits that round; their earlier total is parked by nickname so a
  same-name rejoin gets it back.
- **Closing:** the room closes when its host goes (after the host's grace window). It stays
  open with no players while the host is there.

## The Game contract

`packages/core/src/game.ts`. A game is a pure module: `init`, `reduce`, `view`, `scores`,
`isComplete`, optional `roundCount` and picker metadata.

- `reduce` returns `Result<State, GameError>`: a rejection is a typed error with the state
  unchanged, never a throw. Events arrive from the wire as `unknown`, so each game checks
  their shape first.
- **`view(state, viewer)` is the redaction boundary.** A viewer is one player or the host's
  shared screen. Only `view` output ever leaves the server, per socket. Progress counts are
  designed not to leak either (a vote for a player who left still counts as cast; it is
  only void in the final tally).
- Phase advance is a host-only event `{ type: 'advance', from }`, idempotent on a mismatch.
- Roster changes reach a game as `playerJoined` / `playerLeft` events authored by the room;
  a client cannot forge them.

## The server

`apps/server` is thin: it owns authority, fan-out and time.

- **Authority:** the actor handed to `roomReduce` comes from the connection's registered
  identity, never from the message.
- **Fan-out:** after each applied event, one coalesced frame per connection per microtask, each
  carrying that connection's own `view`.
- **Time:** grace and reap timers sit behind an injected `schedule`, so tests drive them.

### Connections

| Situation | What happens |
| --- | --- |
| A phone drops (lock, Wi-Fi blip) | its seat is held for 3 minutes; the same token resumes it |
| The board drops | the room is held for 60 seconds; the host token resumes it |
| A socket goes silent without closing | the server's 20 s heartbeat terminates it, then grace applies |
| A seat is resumed on another device | the old socket gets `SUPERSEDED` and is closed; it does not reconnect |
| A socket never joins a room | closed after 10 s |
| One client floods or opens too much | per-socket rate limit, per-address socket and room caps, payload cap |

On the client, the transport (`apps/web/src/transport/socket.ts`) reconnects with backoff,
treats 40 s of silence as a dead socket (the server answers every ping), probes on wake and
retries at once when the network returns. A terminal error or leaving the screen ends it.

## Testing layers

Cheapest first: unit tests for every reducer transition (100% in core and games) →
conformance fuzzing per game (`@klatchr/core/conformance`) → the reconnect scenario DSL
(`@klatchr/core/scenario`) → real-socket integration tests in vitest → Playwright end-to-end
rounds across browser contexts → `pnpm bots`, a manual soak with many real clients.

The multiplayer and network scenario matrix lives in `docs/plans/plan-15.md`.
