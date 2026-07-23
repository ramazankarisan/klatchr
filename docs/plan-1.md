# plan-1 — Cycle 1: `packages/core`

Room + player lifecycle, the `Game` interface, the game registry. Pure,
game-agnostic, 100% covered. Built test-first (P1–P7 drive the loop) under the
live gate. This cycle resolves the platform blockers C1–C5.

## Resolved decisions (C1–C5)

**C1 — Host.** The room carries a `hostId`. `createRoom(deps)` mints it (the
host is the shared screen, never in `players`). Room-level control events
(`selectGame`, `startGame`, `endGame`) are **host-only**, enforced in `core`.
Every room event carries an `actor: Viewer` so the reducer can check authority.

**C2 — RoomDeps.** The platform analog of `GameDeps`:

```ts
interface RoomDeps {
  random(): number; // [0,1) — room code
  id(): string;     // opaque unique — playerId, hostId
}
```

Injected at `createRoom`. No `Math.random`/`Date.now` in `core` (purity gate).

**C3 — PlayerId ↔ nickname + reconnect.** Nickname is normalised (trim,
collapse inner whitespace, case-insensitive match, reject empty, cap 20 chars).
The room keeps `Map<normalisedNickname, Player>`. First join with a new
nickname mints a stable `PlayerId` via `deps.id()`; rejoin with an existing
nickname returns the **same** player (P2, no duplicate). Because game state is
keyed by `PlayerId`, a reconnect keeps its slot; only a genuinely new nickname
mid-game is a spectator (that policy lives in the game, Cycle 2).

**C4 — State machine edges** (no new events; reuse the existing set):

```
LOBBY   --selectGame(host, registered id)-->      LOBBY    (sets selectedGameId)
LOBBY   --startGame(host, >=minPlayers, selected)--> IN_GAME (game.init)
IN_GAME --gameEvent → game.isComplete(next)-->     SCORES
IN_GAME --endGame(host)-->                          SCORES   (host abort)
SCORES  --selectGame(host)-->                       LOBBY
SCORES  --startGame(host)-->                        IN_GAME  (re-init same game)
join / leave: allowed in LOBBY; while IN_GAME they are ALSO forwarded to the
game as RosterEvent (playerJoined / playerLeft).
```

**C5 — Result + errors.** No throwing; rejections return a typed error.

```ts
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
type RoomError = { code: RoomErrorCode; message?: string };
type RoomErrorCode =
  | 'ROOM_FULL' | 'NOT_HOST' | 'GAME_NOT_REGISTERED' | 'BELOW_MIN_PLAYERS'
  | 'NO_GAME_SELECTED' | 'GAME_EVENT_OUTSIDE_GAME' | 'EMPTY_NICKNAME'
  | 'WRONG_PHASE';
```

Rejections return the **unchanged** room plus the error.

## Module layout (`packages/core/src`)

```
result.ts     Result<T,E>, ok(), err()
deps.ts       RoomDeps, GameDeps
nickname.ts   normalise(nickname) + validation
roomCode.ts   4-letter code from deps.random, collision-retry against live set
ids.ts        PlayerId, Player, Viewer
game.ts       Game<TState,TEvent>, RosterEvent, Score, GameError
registry.ts   createRegistry(games): { get(id), has(id), list() }
room.ts       Room, createRoom(deps, registry), roomReduce(room, event, actor)
index.ts      barrel: MIN_PLAYERS, MAX_PLAYERS, + all public types/fns
```

Every `*.ts` has a `*.test.ts`. 100% lines+branches or the gate fails.

## Room shape

```ts
type Phase = 'LOBBY' | 'IN_GAME' | 'SCORES';

interface Room {
  code: string;
  hostId: string;
  phase: Phase;
  players: Player[];              // join order; keyed for lookup by id/nickname
  selectedGameId: string | null;
  gameState: unknown | null;      // opaque; only the active Game understands it
  closed: boolean;                // true once host leaves (P6)
}

type RoomEvent =
  | { type: 'join'; nickname: string }
  | { type: 'leave' }                              // actor identifies who
  | { type: 'selectGame'; gameId: string }
  | { type: 'startGame' }
  | { type: 'gameEvent'; event: unknown }          // forwarded verbatim to reduce
  | { type: 'endGame' };

function roomReduce(
  room: Room,
  event: RoomEvent,
  actor: Viewer,
  registry: Registry,
): Result<Room, RoomError>;
```

The room never inspects `gameEvent.event` — it forwards it to the active
game's `reduce` (via the registry-resolved game) and stores the returned state,
then checks `isComplete` for the IN_GAME→SCORES edge.

## Test-first order (red → green)

Redaction has no core surface (games own it), so P-cases drive the loop. Use a
**stub Game** (a minimal test-double implementing the interface) injected via
the registry to exercise room↔game wiring without any real game.

| # | Red test | Green behaviour |
|---|---|---|
| P4 | `selectGame` unknown id | `err(GAME_NOT_REGISTERED)`, room unchanged |
| P1 | `join` at `MAX_PLAYERS` | `err(ROOM_FULL)`, room unchanged |
| P2 | `join` existing nickname | same `Player`, no duplicate |
| P3 | `startGame` below `minPlayers` | `err(BELOW_MIN_PLAYERS)` |
| P5 | `gameEvent` in LOBBY | `err(GAME_EVENT_OUTSIDE_GAME)` |
| P6 | host `leave` | `room.closed = true` |
| P7 | last player `leave` | room discarded (empty + closable signal) |
| — | non-host `selectGame`/`startGame`/`endGame` | `err(NOT_HOST)` |
| — | full happy path LOBBY→IN_GAME→SCORES→LOBBY with the stub game | edges per C4 |
| — | `RoomDeps` determinism: same seed → same code/ids | reproducible |

## Out of scope for this cycle

No real game (Cycle 2), no zod/protocol (Cycle 3), no server/web. `core`
imports nothing from other packages — dependency-cruiser enforces it.

## Definition of done

`pnpm gate` green with `packages/core` at 100% lines+branches, P1–P7 + the
authority/edge/determinism tests passing, and the C1–C5 decisions realised in
code exactly as above.
