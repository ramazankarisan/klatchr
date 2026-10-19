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
  - *From the 5.1 review:* the host is **not** a player, so it never gets a
    `joined` (there's no `opened` ack in the protocol by design). The host
    learns its own room code from `frame.code`, so the server must send the
    host a `frame` **immediately on `open`**, not only on the first game event.
  - *From the 5.1 review:* `selectGame` carries `gameId?` (the protocol can't
    express "required iff `action==='selectGame'`" inside a discriminated
    union), so **the server rejects a `selectGame` with no `gameId`** and
    narrows `gameId` before use. This enforcement lives here, not on the wire.
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

## Stage 5.3 — real web + E2E (detailed, 2026-07-27)

5.3 turns the merged 5.2 server into the running product: the web talks to a
real socket, players submit and guess for real, and a two-browser E2E proves
whole-stack redaction. It is **larger than one PR** — the same
dependency-ordered discipline as 5.1/5.2 applies. Split into **four sub-PRs,
each its own session + green gate**: `5.3a reconnect-secret → 5.3b transport +
runnable server → 5.3c real input + host scores → 5.3d E2E`.

### Decisions to lock before 5.3 starts

- **D1 — server runtime dep.** The server has no `start`/`dev` script and no TS
  runner; the gate typechecks/tests but never boots it. 5.3b needs it running
  (for `pnpm dev` and the E2E `webServer`). Proposed: add **`tsx`** (dev dep) +
  `start`/`dev` scripts (`tsx src/index.ts` / `tsx watch`), and a root `dev`
  that runs server + web `concurrently`. **New deps `tsx` (+ maybe
  `concurrently`) need rule-8 sign-off.** Alternatives: `tsc` build + `node`
  (heavier, needs a build tsconfig), or `node --experimental-strip-types`
  (Node ≥22, no decorators/metadata handling — risky for Nest). Recommend `tsx`.
- **D2 — `VITE_WS_URL`.** Rule 6: URL from `VITE_WS_URL`, never hardcoded. Add
  `apps/web/.env` (or vite `define` default) `ws://localhost:8080`; the E2E
  points it at the test server's port.
- **D3 — design gate (rule 9).** Before any 5.3c component code, audit what the
  approved paper sketch already covers vs what is new, and get new/changed
  screens sketched + approved. Already **locked in design.md**: the guess
  searchable author-picker (≤11, `N of 11 named`) and "type an answer" collect
  input. **Likely needs a fresh/updated sketch:** the host **scores overview**
  (round tally + cumulative standings) and the host **control bar** that
  replaces the single demo `step()` button (Start / Show cards / Reveal / New
  round). 5.3a/5.3b touch no visual design (transport plumbing only); the design
  gate blocks only 5.3c.
- **D4 — the `Transport` seam is multi-viewer; a socket is single-viewer.** The
  mock serves every viewer from one engine (the Stage). A socket connection *is*
  one viewer (host **or** one player). `SocketTransport` implements the same
  `subscribe(viewer, cb)` / `send(actor, action)` interface but binds to its own
  single connection: it opens/join-s on construct, ignores the per-call `actor`
  (its identity is fixed by the connection), and maps `Action` → wire
  (`selectGame/startGame/endGame` → `host`, `gameEvent` → `play`). Keep the
  interface; do not refactor the mock.

### 5.3a — reconnect-secret (`protocol` + `core`) · the blocking prereq

The one place Cycle 5 must touch `core`/`protocol` beyond 5.1. From the 5.2
review (HIGH): the reconnect handle is currently the public `playerId`, which is
broadcast in every frame's roster (it must be — guess targets are player ids).
So any fresh socket can `join` with a visible id and **resume that slot** —
impersonation + redaction leak (receives that player's view, acts as them,
evicts them).

- **protocol** — `joined` carries a new `reconnectToken` (server-minted secret,
  distinct from `playerId`); `join` carries `reconnectToken?` in place of
  `reconnectId`. The token never appears in `frame`. Round-trip + reject tests.
- **core** — `join` resume matches on the token, not the public id: the room
  stores a per-player secret (via `RoomDeps.id()` / a new dep), returns the
  resumed player, and a wrong/absent token is a fresh join. Unit tests incl.
  rejections (100% core).
- **disconnect-vs-leave (also here or 5.3b).** A dropped socket currently
  applies an immediate core `leave`, so resume only works in the pre-`close`
  window. Mark the slot **offline** and reap on a real `leave` or a `GameDeps`
  clock timeout, so a reconnect within the window truly resumes. Decide whether
  the offline flag lives in `core` (roster fact) — likely yes.
- Server (`apps/server`) then threads the token: mint on join, return in
  `joined`, match on reconnect, keep it out of `frameFor`.

### 5.3b — SocketTransport + runnable server (`apps/web`, `apps/server`)

- **`SocketTransport implements Transport`** over `WebSocket(VITE_WS_URL)`,
  parsing every inbound with `@klatchr/protocol.serverMessage` (rule 2, never
  `as`). Per D4: single-viewer. Host surface → `open`; player surface →
  `join { code, nickname, reconnectToken? }`. Rebuilds the web `ViewFrame` from
  the wire `frame` + its own known viewer.
- **App factory** picks socket in the browser, `MockEngine` in tests (W4 —
  MockEngine stays as the dev/test transport; RTL tests need no server).
  `HostScreen`/`PlayerScreen`/`useFrame` retype from `MockEngine` → `Transport`.
- **Delete the `Stage`.** `App` routes two surfaces: `/host` (or a host button)
  = the board only, one host connection; `/` = join form → the player's **own**
  phone, one player connection. Nobody renders anyone else's phone.
- **Runnable server** (D1): `start`/`dev` scripts; root `dev` = server + web.
- Wire the real host controls (replace `engine.step()`): Start → `selectGame`
  (only game today = `guess-who`) + `startGame`; Show cards → advance `collect`;
  Reveal → advance `guess`; New round → `endGame`/next. **Visual is the existing
  button until 5.3c refines the control bar.**

### 5.3c — real player input + host scores overview (`apps/web`) · behind D3

- **Collect** — text field + submit → `play { submit, text }`. Client keeps its
  own answer locally so the guess screen can mark "your card" (the view does not
  reveal which card is yours — correct redaction).
- **Guess** — the searchable author picker (design.md, locked) → `play { guess,
  cardId, author }`, one card at a time, ≤11 candidates, `N of 11 named`.
- **Host scores overview** — round tally at reveal + optional cumulative
  standings; public by nature (shared screen), no leak. Mid-round per-player
  scores stay withheld (the Cycle-4 fix) so the reveal isn't spoiled.
- RTL tests (query by role/label) on the mock transport for each interaction.

### 5.3d — two-context Playwright E2E · the whole-stack redaction proof

Two browser contexts, a real server (playwright `webServer` launches server +
web, `VITE_WS_URL` at the test server): host opens a room, ≥3 players join, they
play a round. Assert each player's DOM **never** contains another player's hidden
answer or any authorship before reveal, and reconnect resumes a slot. This is
the proof that slipped from Cycle 4.

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
