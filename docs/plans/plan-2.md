# plan-2 — Spec shift: events-scale + mixed-audience (core amendments)

**Why this plan exists.** Cycle 1 built `packages/core` correctly against the
*original* spec: a small party game, ~2–12 friends who know each other. Two
product decisions have since moved that spec:

- **Room size → 50+** (events / offsites / conferences, not just a small team).
- **Audience → both** existing teams *and* strangers meeting for the first time.

Neither is a party-game vs icebreaker rename — both are already true of the
platform. But they turn three pre-known interface gaps and one deliberate
Cycle-1 choice into genuine mismatches. This plan amends `core` (and only
`core`) so the seam is right *before* the first game (currently plan-1's
"Cycle 2") and the server/web cycles build on it. It is pure, game-agnostic,
100%-covered, TDD under the live gate — same rules as plan-1.

> **Sequencing (open):** this inserts a core-revision cycle. Either it becomes
> Cycle 2 and the first game shifts to Cycle 3, or E1–E4 fold into the front of
> the game cycle. Recommend the former: land the seam change on its own, small,
> reviewable, before any game depends on it. Needs your call.

## What Cycle 1 actually shipped (the baseline)

Verified on `origin/main`:

- `bounds.ts` — `MIN_PLAYERS = 2`, `MAX_PLAYERS = 12`.
- `room.ts:54` — join refuses at `MAX_PLAYERS` (`ROOM_FULL`). `index.test.ts:6`
  locks the constant to `12`.
- `MIN_PLAYERS` is **exported but unused in logic** — only asserted in a test.
  Games gate on their own `game.minPlayers`; the platform floor is decorative.
- `game.ts:25` declares `game.maxPlayers`, but **nothing reads it**. `startGame`
  (`room.ts:96`) checks `minPlayers` only; the registry does no bound
  validation. The `bounds.ts` comment "a game may narrow these, never widen" is
  unenforced.
- `room.ts:50` — rejoin identity is **nickname-keyed**
  (`p.nickname.toLowerCase() === key`). A second person with a taken nickname
  returns `ok(room)` — silently merged into the first person's slot, no new
  player, no error. This was C3's deliberate no-auth reconnect design.
- `Player.joinedDuringGame` exists (`room.ts:60`) but no code path routes an
  over-capacity player to spectator.

None of this is a defect against the small-friends spec. All of it mismatches
50+/strangers.

## Resolved decisions (E1–E4)

Approved 2026-07-23: E1 ceiling = **50**; E2 = **seat-and-spectate**; E3 =
reconnect by **`Player.id`** exposed as an opaque handle.

### E1 — Raise platform room capacity to event scale

Set the ceiling to the stated target and make `MIN_PLAYERS` real instead of
decorative.

```ts
// bounds.ts
export const MIN_PLAYERS = 2;   // platform floor, now ENFORCED (E2)
export const MAX_PLAYERS = 50;  // was 12
```

- One-line constant + update `index.test.ts` (`expect(MAX_PLAYERS).toBe(50)`).
- 50 is the confirmed ceiling for "50+", not a hard limit of the design.
  Going materially past ~50 starts to need roster **paging** on the host screen
  and likely **team split** (see S8 tension below); pick a number we'll actually
  design the lobby for rather than an open-ended "+".
- **Downstream, not in this plan:** at N≈50 the server's per-viewer `view()`
  fan-out (50 redactions + 50 sends per state change) needs a batching story
  (server cycle), and the host lobby must render 50 names compactly (web cycle,
  design-surface first per rule 9). Flagged here so those cycles plan for 50,
  not 6.

### E2 — Enforce game bounds ⊆ platform bounds; overflow → spectator

Make the `bounds.ts` promise real, at two points.

**Registration-time (registry, dev-time invariant).** `createRegistry`
validates each game and fails loudly on a game that widens the platform:

```
require:  MIN_PLAYERS <= game.minPlayers <= game.maxPlayers <= MAX_PLAYERS
```

A violation is a programmer error (a misconfigured game module), not a runtime
rejection — so it throws at registry construction with a clear message, caught
by a unit test. This does not violate the no-throw reducer rule: registration
is wiring, not a `reduce` transition.

**Start-time (room, runtime).** Today `room` can hold up to `MAX_PLAYERS` while
a chosen game's `maxPlayers` may be smaller (e.g. Guess-Who at ~12). Decision
for the fork:

- **(chosen) Seat-and-spectate.** At `startGame`, the room seats the first
  `game.maxPlayers` players (join order) as active and marks the remainder
  spectators; `game.init` receives **only the active players**. Games stay
  ignorant of capacity policy — one place owns it. A `Player.spectator` marker
  (or a room-level `spectators` list) records it; this unifies with
  `joinedDuringGame` (a player who joins mid-round is also a spectator until the
  next round).
- (rejected) Reject `startGame` with `TOO_MANY_PLAYERS` — leaves the host stuck
  at a full room with no way to start; bad event UX.

New surface: a `spectator` concept promoted to a first-class Room fact, and
`game.init(activePlayers, …)` receiving the seated subset. Confirm the seat rule
is **join-order** (vs random) — recommend join-order (predictable, fair-ish,
deterministic without `GameDeps`).

### E3 — Reconnect by id, not nickname (revises C3)

C3 chose nickname as the reconnect key under the small-friends assumption. With
50 strangers, nickname collisions are routine ("Alex" ×3) and the current
silent-merge hands a stranger someone else's slot. Move identity to the id we
already mint:

- `RoomDeps.id()` already stamps every `Player.id`. Expose that id to its own
  client as an **opaque reconnect handle** (client stores it; dies with the
  room — no persistence, no account, still within rule 7).
- `join` gains an optional `reconnectId`:
  - present **and** matches a live player → resume that slot (works mid-game,
    keeps their game state, keyed by id);
  - absent → new player, mint a fresh id. **Nickname collisions are allowed** —
    two real "Alex"es coexist (display can suffix, e.g. "Alex", "Alex (2)", a
    web concern).
- Nickname reverts to display-only + non-empty validation. `EMPTY_NICKNAME`
  stays; the implicit "nickname == identity" dedup at `room.ts:50` is removed.

This realigns the code with CLAUDE.md's stated rule ("a known id rejoining
resumes its slot; a new id mid-round is a spectator") — which the Cycle-1
nickname-keying had drifted from.

### E4 — Declare game audience/context on the `Game` interface

"Both audiences" means the platform stays neutral and each game says who it
suits, so the picker can label/filter. Extend the picker metadata added in S5:

```ts
type GameContext = 'teams' | 'strangers';

interface Game<TState, TEvent> {
  // …id, name, description, minPlayers, maxPlayers…
  contexts?: readonly GameContext[]; // omitted ⇒ shown in all contexts
}
```

- Guess Who Said It → `contexts: ['teams']` (needs shared history; weak with
  strangers).
- A future name-matching / mixer game → `['strangers']` or both.
- Pure interface add. `core` stores/exposes it via the registry; **no core
  logic** keys on it — filtering/labelling is the web picker's job (S4, web
  cycle). Typed enum over free-form `string[]` so the picker can be exhaustive.

## Consequences to flag (not resolving here)

- **S8 (teams) pressure.** At 50, a single flat guess-pool is weak; teams/
  subgroups become attractive. S8 was recommended out of v1 with `Player[]`
  flat. E1 doesn't force teams, but it sharpens the question. Kept out of scope;
  reopen S8 separately if events want subgroups.
- **S6 (leaderboard).** Unaffected; per-game scoring stands.
- **Server fan-out & host-lobby-at-50** — named above, owned by later cycles.

## Module touch-list (`packages/core/src`)

```
bounds.ts     MAX_PLAYERS 12 → 50; MIN_PLAYERS becomes enforced       (E1)
registry.ts   validate each game's bounds ⊆ platform; throw on widen   (E2)
game.ts       Game.contexts?: readonly GameContext[]; GameContext type (E4)
roomTypes.ts  Player.spectator (or Room.spectators); +error codes      (E2/E3)
room.ts       startGame seat-and-spectate; join gains reconnectId,
              drop nickname-as-identity dedup                          (E2/E3)
ids.ts        (reconnect handle is the existing Player.id — likely no change)
```

Every touched `*.ts` keeps its `*.test.ts` at 100% lines+branches.

## Test-first order (red → green)

| # | Red test | Green behaviour |
|---|---|---|
| E1a | `join` at 50 | `err(ROOM_FULL)` at 50, not 12 |
| E1b | `MAX_PLAYERS`/`MIN_PLAYERS` constants | 50 / 2 |
| E1c | `startGame` below `MIN_PLAYERS` platform floor | `err(BELOW_MIN_PLAYERS)` even if a game set `minPlayers: 1` |
| E2a | register a game with `maxPlayers > MAX_PLAYERS` | registry construction throws, message names the game |
| E2b | register with `minPlayers > maxPlayers` | throws |
| E2c | `startGame` with players > `game.maxPlayers` | IN_GAME; first `maxPlayers` active, rest `spectator`; `init` got only active |
| E2d | mid-game `join` past `game.maxPlayers` | player added as spectator, not in game pool |
| E3a | `join` with `reconnectId` of a live player | same slot resumed, no duplicate, game state intact |
| E3b | `join`, no `reconnectId`, nickname already present | **new** distinct player (collision allowed), both exist |
| E3c | `join` mid-game with valid `reconnectId` | resumes slot mid-round (keyed by id) |
| E3d | `join` with unknown `reconnectId` | treated as new player, fresh id |
| E4a | `Game.contexts` surfaced via registry `list()` | picker metadata present; omitted ⇒ undefined |

Existing P1–P7 tests are updated where E1/E3 change their expectations (P1 cap,
P2 rejoin semantics). Any P-case whose behaviour changes gets its assertion
rewritten in the same red step, not silently relaxed.

## Out of scope

Server fan-out batching, host-lobby-at-50 design, teams (S8), any real game,
protocol/zod, web. `core` still imports nothing from other packages —
dependency-cruiser enforces it.

## Definition of done

`pnpm gate` green, `packages/core` at 100% lines+branches, E1–E4 realised
exactly as approved above, C3's revision reflected in code and noted in
CLAUDE.md's roster/reconnect paragraph, and the E-table plus updated P-cases
passing.
