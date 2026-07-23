# SPEC — Klatchr

Input for the RPI cycles. This is *what* to build, not *how*.

## The platform

A host opens a room on a laptop or TV. The host screen shows a four-letter
room code. Players join on their phones with that code and a nickname. The
host does not play — the host screen is display and phase control only.

The host picks a game from a list, the group plays a round, scores show, the
host can start another round or switch games. Players stay in the room across
games.

Reference model: Jackbox. Shared screen, phones as controllers, room code,
several games behind one shell.

## Room size

```ts
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 12;
```

Platform-wide bounds, exported from `packages/core`. A game may narrow them
via its own `minPlayers` / `maxPlayers`, never widen them. `apps/server` and
`apps/web` import the constants; neither hardcodes a number of its own.

At exactly 2 players some games are degenerate. That is accepted deliberately
so a full round can be exercised with two browser windows during development
and in the Playwright E2E test.

## Room state machine

Platform-level, game-agnostic. Lives in `packages/core`.

```
LOBBY -> IN_GAME -> SCORES
  ^                    |
  |____________________|
     (next game / next round)
```

Events: `join`, `leave`, `selectGame`, `startGame`, `gameEvent`, `endGame`.

`gameEvent` is forwarded to the active game's `reduce`. The room layer never
inspects the payload — it does not know what game is running.

## Game 1 — Guess Who Said It

1. A prompt is shown ("worst job you've ever had").
2. Every player types an answer. Answers are anonymous.
3. Every player is shown all answers and guesses who wrote each one.
4. Reveal: each answer with its true author and who guessed it.
5. Scores.

Internal phases: `COLLECTING -> GUESSING -> REVEAL -> DONE`.

Prompts: a hardcoded list of ~20 in the game module. Host-authored prompts
are out of scope for v1.

### Scoring

v1: **+1 point for each answer you correctly attribute.**

Stretch, only if the cycle finishes early: **+1 if nobody correctly guessed
your answer.** One line in a pure function — add it behind a test, or not
at all.

## Acceptance criteria

### Platform — `packages/core`

| # | Case | Expected |
|---|---|---|
| P1 | Player joins a room already at `MAX_PLAYERS` | Refused; room state unchanged |
| P2 | Player rejoins with a nickname already in the room | Resumes as the same player; no duplicate created |
| P3 | `startGame` with fewer than the game's `minPlayers` | Refused |
| P4 | `selectGame` with an unregistered game id | Refused |
| P5 | `gameEvent` arrives while the room is in LOBBY | Refused |
| P6 | Host leaves | Room is closed (v1); promoting a player is out of scope |
| P7 | Last player leaves | Room is discarded |

### Guess Who Said It — `packages/games`

| # | Case | Expected |
|---|---|---|
| G1 | Player joins mid-round | Spectator for this round; not in the answer pool or guess targets |
| G2 | Player disconnects after submitting | Their answer remains; their missing guesses score 0 |
| G3 | Player never submits an answer | `advance` still works; they have no answer in the pool |
| G4 | Two players submit identical text | Both stay separate and separately attributable |
| G5 | Player guesses their own answer | Refused; a player is never offered themselves for their own answer |
| G6 | `advance` called twice in a row | Idempotent; the second call does not skip a phase |
| G7 | `submitAnswer` arrives during GUESSING | Refused |
| G8 | **Redaction** — `view(state, playerId)` during COLLECTING | Contains no other player's answer |
| G9 | **Redaction** — `view(state, playerId)` during GUESSING | Contains all answers but no authorship for any of them |
| G10 | **Redaction** — `view(state, playerId)` during GUESSING | Contains no other player's guesses |

G8–G10 are the most important tests in the project. If they pass, the game is
not cheatable from devtools. Write them first.

## Out of scope for v1

Do not build these. If any seems necessary, stop and ask.

- Database, persistence, accounts, auth
- Timers or countdowns — the host controls phase changes
- Host-authored prompts
- Host playing along
- Host reassignment when the host disconnects
- Deployment (localhost only)
- Reconnect tokens, spectator chat, avatars, sounds, animations

## Cycles

| Cycle | Scope | Deliverable |
|---|---|---|
| 1 | `packages/core` | Room lifecycle, `Game` interface, registry. P1–P7. 100% covered |
| 2 | `packages/games/guess-who-said-it` | Full game module. G1–G10. 100% covered |
| 3 | `packages/protocol` + `apps/server` | Zod schemas, NestJS WS gateway, room registry, per-player view dispatch |
| 4 | `apps/web` + E2E | Join, lobby, game view, scores, host screen; Playwright two-context test |

### Budget

```
0:00–1:30  scaffold, CLAUDE.md, gate wall (see below)
1:30–3:00  cycle 1
3:00–5:00  cycle 2
5:00–6:30  cycle 3
6:30–7:40  cycle 4
7:40–8:00  retro
```

The scaffold slot grew (0:45 → 1:30) because gates are now a full node/bash
pre-commit wall (no Python), orchestrated by `pnpm gate` on husky. Phases:
biome (lint+format) · dead code (knip) · duplication (jscpd) · purity +
bypass-directive bash gates · type-coverage · **dependency-cruiser** (enforces
the one-way dep direction + core/games import purity) · tsc · vitest (100%
core/games) · playwright (verify, end of cycle 4). Secrets: gitleaks. Dropped
as Python: the `pre-commit` framework and semgrep. Building cycle-1 code under
the wall from commit 1 is the point — the gates are the backpressure.

**Cutline at 6:15.** If the WebSocket layer is still fighting you, ship
host-screen mode: one screen, the host clicks through phases, no realtime.
`core` and `games` do not change — that is the point of the boundary. Write
the descope up in the retro.

**A second game is not a v1 goal.** If cycle 3 finishes early, add Year
Guesser (one prompt, one number per player, closest wins — roughly 40 lines)
purely to prove the `Game` interface holds without touching `core`. Its value
is as evidence for the seam, not as a feature.
