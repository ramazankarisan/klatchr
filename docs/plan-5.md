# plan-5 — Cycle 5: the wiring cycle (protocol · server · real web)

Make it real multiplayer. Replace the in-browser mock with a network: zod
message schemas, a NestJS WebSocket server holding rooms in memory, and a socket
transport in the web that swaps in for the mock at one factory. Then real player
input and a two-browser E2E.

This is large — three dependency-ordered **stages**, each its own session +
PR: **5.1 protocol → 5.2 server → 5.3 web-wire + E2E**. `core` and `games` do
not change; they are already the real engine.

> **Review correction (2026-07-27).** The host screen is the **board only** — it
> never shows player phones. The Cycle-4 `Stage` (host + every phone side by
> side) was a single-browser demo affordance. Stage 5.3 deletes it and ships the
> real split: `/host` = the board (one host connection); `/` = join → **your own
> phone** (one player connection). Nobody sees anyone else's phone. (A **scores
> overview on the host board** is welcome — see Stage 5.3.)



## What already exists (reuse, don't rebuild)

- The **frame** shape (`ViewFrame`) and **Transport** interface (`apps/web`) are
  the seam. The socket transport implements the same interface; the app is
  already written against it.
- The **MockEngine** is exactly the room-driving logic the server needs
  (createRoom → roomReduce → `view(state, viewer)` fan-out). Its core loop moves
  server-side almost verbatim; it stays in the web as a **dev/test transport**
  (RTL tests run on it — no server needed in unit tests).

## Stage 5.1 — `packages/protocol` (zod messages)

Every client↔server message defined here and parsed at both boundaries; never
`as` (rule 2).

**Inbound (client → server):**

```
open   { nickname }                       // open a room as host (server mints code)
join   { code, nickname, reconnectId? }   // join as a player (E3 reconnect handle)
host   { code, action: 'selectGame'|'startGame'|'endGame', gameId? }
play   { code, event: unknown }           // a game event; server stamps the playerId
leave  { code }
```

**Outbound (server → client):**

```
joined { code, playerId }        // the reconnect handle the client stores
frame  { code, phase, players, selectedGameId, gameView, scores }  // the redacted view
error  { code, message? }
```

- `gameView` is `z.unknown()` — the envelope is validated; the per-game view is
  narrowed client-side by the view registry (as the web already does). The
  redaction already happened in `packages/games`; the wire only carries the
  redacted result. **(W1 — confirm: envelope-only validation, gameView opaque.)**
- Discriminated union on `type`; `parse` at the server on every inbound, at the
  client on every inbound.

Tests: round-trip parse/serialize each message; reject malformed.

## Stage 5.2 — `apps/server` (NestJS + WebSocket gateway)

- **Room registry** — `Map<code, RoomSession>`. A `RoomSession` = a `core` Room
  + the game registry + the set of connections (host + players). Rooms are
  discarded when empty (rule 7 — no persistence, no DB, no auth).
- **Connection lifecycle** — `open` creates a room (host connection). `join`
  adds a player (or, with a matching `reconnectId`, resumes the slot — E3).
- **Authority (C1/S3)** — `host` actions are applied only from the host
  connection; `play` events are stamped with the sender's authenticated
  `playerId` before forwarding to `reduce`. The pure reducer never checks this;
  the server does.
- **The redaction boundary (rule 3)** — on every state change, the server sends
  each connection `view(state, viewer)` for *its* viewer — a player gets
  `{role:'player', id}`, the host gets `{role:'host'}`. Never the raw state.
- **Fan-out at 50 (the plan-2 downstream note comes due)** — coalesce state
  changes per tick and send one frame per connection per tick, so a burst of
  submits doesn't re-broadcast N times. **(W3 — confirm: microtask-coalesced
  broadcast; `view()` is cheap and runs per connection.)**
- Config: WS port via env; the web reads `VITE_WS_URL`.

Tests: a `RoomSession` unit-driven through a full round with two fake
connections; asserts each connection receives only its redacted frame, host
authority is enforced, and an empty room is discarded.

## Stage 5.3 — `apps/web` (socket transport, real input, E2E)

- **SocketTransport** — implements `Transport` over a `WebSocket` to
  `VITE_WS_URL`, parsing every inbound frame with `@klatchr/protocol`. The app
  factory picks socket in the browser, mock in tests. **(W4 — keep MockEngine as
  the dev/test transport: yes.)**
- **Delete the Stage.** `/host` renders the board only; `/` renders join → the
  player's own phone. One connection per surface.
- **Host scores overview.** The host board may show the round tally at reveal
  and, optionally, cumulative standings across rounds — public by nature (the
  shared screen), so no leak. Mid-round per-player scores stay withheld (the
  Cycle-4 fix) so the reveal isn't spoiled.
- **Real player input** (the phones stop being read-only):
  - Collect — a text field + submit → `play { submit, text }`. The client keeps
    its own answer locally so the guess screen can mark "your card" (the view
    doesn't reveal which card is yours — that's correct redaction).
  - Guess — the searchable author picker (design.md) → `play { guess, cardId,
    author }`, one card at a time, ≤11 candidates (seat-and-spectate).
  - Reconnect — store `playerId` from `joined` in `localStorage`; resend on
    reconnect (E3). **(W5 — localStorage handle, dies with the room server-side.)**
- **E2E (the one that slipped from Cycle 4)** — two Playwright browser contexts,
  a real server: host opens a room, a player joins, they play a round; assert
  the player's DOM never contains another player's hidden answer or the authors
  before reveal. This is the whole-stack redaction proof.

## Open questions (answer before 5.1 starts)

- **W1** — protocol validates the envelope, `gameView` opaque (`z.unknown()`)?
  Recommend yes; per-game view schemas can come later if needed.
- **W3** — fan-out = microtask-coalesced broadcast? Recommend yes; revisit only
  if 50-player profiling shows a problem.
- **W4** — keep `MockEngine` as the dev/test transport (vs delete)? Recommend
  keep — it's what makes the web unit-testable without a server.
- **W6** — split into three PRs (5.1/5.2/5.3) as written? Recommend yes.

## Out of scope

Dark mode, additional games, spectator-to-player promotion mid-round, any
persistence/accounts/DB (rule 7). A second game is its own later cycle.

## Definition of done (per stage)

Each stage: `pnpm gate` green. 5.1 — protocol 100% (it's pure); every message
round-trips and rejects malformed input. 5.2 — server drives a full round with
enforced authority and per-viewer redaction; empty rooms discarded. 5.3 — the
web runs against the real server, players submit and guess for real, reconnect
works, the Stage is gone, and the two-context Playwright round passes with the
whole-stack redaction assertion.
