# plan-9 — Cycle 9: session scoring + the 50-player host

> **ABSORBED into `plan-10` (2026-07-31).** After a live play-test, session
> scoring, the end-game/final-standings screen, the round counter, and the
> compact 50-player roster were built as part of the one-PR Cycle-10
> post-play-test bundle rather than as a standalone cycle. This file is kept for
> its design rationale (Features 1–2, decisions D1–D4, all carried into plan-10).

The post-launch UX cycle (plan-8) is complete — 8.0–8.2 plus the cycle-end E2E
all shipped. Two deferred features remain, both about **the room at scale over
time**:

1. **Session scoring (S6)** — a running leaderboard across rounds, not just this
   round. The engine scores one round; the *night* has no cumulative tally. This is
   also where the **end-game / final-standings screen** and the **round counter**
   land (deferred here from plan-8 — they are the same feature: a session of N rounds
   that ends on a final leaderboard).
2. **The 50-player host board** — rooms hold 50 (E1), but the host renders one
   tile per player. Fine at 6, overflowing at 50.

Neither changes what a *game* is. This cycle is the **platform** growing up: the
room learns to keep score across rounds, and the board learns to show 50 people.

## Research — where these live today

- **Scoring is per-round and stateless across rounds.** `Game.scores(state)`
  returns `Score[] = {playerId, points}` for the *current* `gameState`. The server
  only ships it in the `SCORES` phase (`roomSession.gameFor`); `startGame` builds a
  fresh `gameState`, so the previous round's scores vanish. Nothing in `core`
  remembers them, and — per the plan-8 audit — `frame.scores` is currently rendered
  **nowhere**; each game shows its own reveal. So there is no session tally and no
  game-over screen.
- **The room already persists across rounds** — same `Room` (same code, roster,
  tokens) survives many `startGame → … → SCORES → startGame` cycles. So the room is
  the natural home for a session tally; **no `Game` interface change** (rule: adding
  a game must not touch `core`; session scoring is a *platform* feature, not a game
  one, so it's a room addition, not a per-game special-case).
- **The board renders every player as a tile.** `HostScreen` lobby is a
  `NameTag` grid (`players.length / 50 in the room`); the MLT vote-progress and
  Guess Who collect boards are per-player roster grids; the scores board is a
  standings list. All were sketched at ~6, and `plan-2` explicitly flagged "the host
  lobby must render 50 names compactly … web cycle, design-surface first."
- **Fan-out at 50 is already coalesced** (W3: one `view()`+send per connection per
  microtask). 50 redactions + 50 sends per state change is fine for a party game's
  event rate — **not** a bottleneck, so the `plan-2` "batching story" is *not* in
  this cycle. (Re-open only if a real measurement says so.)

## Feature 1 — session scoring (S6) + the end state

**Where it lives.** The `Room` gains a `sessionScores` tally (playerId → cumulative
points). When a round reaches `SCORES`, the room folds that round's
`game.scores(gameState)` into it. Games are untouched — they still only score their
own round; the room sums.

**Accumulation point.** A round enters `SCORES` exactly once (the `gameEvent` that
flips `isComplete`, or a host `endGame`), and `SCORES` is terminal until the next
`startGame` — so folding *on entry to `SCORES`* adds each round exactly once, no
idempotency trap. `startGame` then resets `gameState` but keeps `sessionScores`.

**Wire + view.** `protocol` frame gains `sessionScores: Score[] | null` alongside
the existing per-round `scores`, plus a **round number** (the count of completed
rounds). Session totals are made only of *already-revealed* past rounds, so they
carry no hidden info — safe to show between rounds and at reveal (unlike round
`scores`, which stay `SCORES`-only). The web board shows **round result + cumulative
standings** (completing the cumulative column deferred from the 5.3c sketch), a
**round counter**, and an **end-game control + final-standings screen** (the host
loops "New round" today with no exit — `endGame` is already wired; this surfaces it).

**Touches:** `core` (room field + fold + round count), `protocol` (frame fields),
`server` (include them in the frame), `web` (render standings + round counter +
end-game screen — design-gated). **`packages/games`: zero change** — the seam holds,
and that's the point.

### Decisions (settled 2026-07-30)

- **D1 — host-aborted round counts. DECIDED: yes.** Every round that reaches `SCORES`
  folds, `endGame` included — one accumulation path, no "was it aborted?" flag. The
  partial points at the moment of abort are what count.
- **D2 — a leaver keeps their session total. DECIDED: keep.** The points were earned;
  the tally is keyed by `playerId`, independent of the `players`/`tokens` lists, so a
  `leave` (explicit or grace-timeout reap) doesn't touch it and a rejoin with the same
  reconnect token sees it again. A brand-new nickname is a new id at 0.
- **D3 — resetting. DECIDED: room-lifetime, no reset action** in v1 (a fresh room =
  fresh scores). A host "clear scores" action can come later if wanted.
- **D4 — display timing.** Show cumulative standings at `SCORES` and/or in the lobby
  between rounds — safe non-secret data either way; **settle during the 9.2 design
  sketch**, not now.

## Feature 2 — the 50-player host board

**Web + design only** — the data already flows (the roster is in every frame); this
is rendering. `plan-2` (rule 9) requires a **design-surface sketch first**. The
scaling problem shows up in every host view that lists all players:

- **Lobby roster** — 50 name-tags need a compact / paged / scrolling layout, not 50
  large tiles.
- **Progress boards** (Guess Who collect, MLT vote) — "who's answered/voted" across
  50, still glanceable (a count + a compact grid, or a meter — the MLT board already
  chose a meter variant that scales; Guess Who's per-name ticks need the compact
  treatment).
- **Scores standings** — 50-deep ranked list needs paging or a "top N + your rank"
  compaction, and this is where the session cumulative column also lands.

**Touches:** `web` only (a shared compact-roster component, reused across the host
views), design-gated. **No `core` / `protocol` / `server` change.**

## Stages (each its own session + PR, green gate)

- **9.1 — session scoring engine** (`core` + `protocol` + `server`). TDD, room
  reducer folds round scores into `sessionScores` and tracks a round count; `frame`
  carries both; server ships them. `core`/`games` stay at 100%. Every transition
  tested (fold once per round, survive `startGame`, leave/rejoin per D2, aborted-round
  per D1, round count). **Proves the seam: `packages/games` diff is empty.** No UI yet.
- **9.2 — session scoring UI + end state** (`web`, design-gated). Cumulative standings
  on the board, round counter, session rank on the phone, and the **end-game control +
  final-standings screen**. Design sketch → approval → build. RTL tests.
- **9.3 — the 50-player host board** (`web`, design-gated). A shared compact/paged
  roster component, applied to lobby + progress + standings, sketched at **50** not 6.
  Design sketch → approval → build. RTL at 50.

(9.2 and 9.3 both scale the host board and could share one design pass; kept separate
so scoring can ship without waiting on the roster redesign.)

## Out of scope

Server fan-out batching (already coalesced, fine at 50 — revisit only on
measurement), teams / subgroups (S8), a third game, persistence of scores across a
server restart (rooms stay in-memory, rule 7 — a redeploy still resets the night),
per-game score *weighting* across rounds (each round contributes its raw points).

## Definition of done (per stage)

- **9.1** — `pnpm gate` green; the room accumulates a correct cross-round tally
  (folded once per round, surviving `startGame`, honoring D1–D3) and a round count;
  `frame.sessionScores` carries it; **`packages/games` is untouched**.
- **9.2** — cumulative standings + round counter render on the board, the phone shows
  session rank, and the host can end the game to a final-standings screen, against an
  approved sketch; `pnpm gate` green.
- **9.3** — the host lobby, progress and standings render 50 players compactly against
  an approved sketch, verified with a 50-player RTL fixture; `pnpm gate` green.
