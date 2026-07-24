# plan-4 — Cycle 4: `apps/web` — the platform shell + Guess Who views (design-first)

The visible product. React + TS + MUI. A host shared screen and a player phone,
one view per game phase. Built **design-first**: every screen is sketched on
**claude.ai/design** and approved before any component code (rule 9). `design.md`
is the token source of truth and is filled from the first approved sketch.

Sequencing (approved 2026-07-24): **web design-first, wire later.** This cycle
builds the whole UI against a **mock transport** and ships a fully playable
single-browser demo. Protocol (zod messages) + server (WS gateway) are a
**separate later cycle** that swaps the transport for a real socket. No change to
`core` or `games`.

## The two surfaces (from design.md)

- **Host screen** — laptop/TV, shared, glanceable. Room code, roster, prompt,
  progress, reveal, scores. Renders `view(state, { role: 'host' })` — already
  redacted; never shows a player's hidden data.
- **Player phone** — compact, portrait, one primary action per phase. Renders
  `view(state, { role: 'player', id })`.

## Architecture

### Transport abstraction (the wire seam)

```ts
interface Transport {
  send(msg: OutboundMsg): void;                 // a room/game action
  subscribe(onView: (v: ViewFrame) => void): () => void; // redacted view stream
}
```

- **MockTransport (this cycle)** — runs the **real pure `core` room + the
  `guessWho` game in the browser**. It holds a `Room`, applies `roomReduce` /
  game `reduce` to actions, and emits `view(state, viewer)` per subscriber.
  Because it uses the actual pure engine, the UI renders **genuinely redacted**
  views — no fake data, no server. `RoomDeps`/`GameDeps` (random, id) are
  supplied in the web layer (Math.random is fine in `apps/web`; the purity gate
  only binds `core`/`games`). One browser can drive the host + several simulated
  players for design + E2E-lite.
- **SocketTransport (later cycle)** — same interface, backed by a WebSocket to
  `VITE_WS_URL`, parsing every inbound frame with `@klatchr/protocol` (zod)
  before rendering. Never hardcode host/port (rule 6).

The app depends only on `Transport`; swapping mock → socket touches one factory.

### App shell + routing

- `/host` — the shared screen. Opens a room (MockTransport mints a code),
  renders by room phase.
- `/` — the player. Join form (code + nickname), then renders by room phase.
- The shell switches on **room phase**: `LOBBY` → lobby; `IN_GAME` → the game
  view via the registry; `SCORES` → scoreboard.

### Game view registry (S4)

`core`/`games` are pure — they emit view **data**, not React. The web holds the
components, keyed by game id:

```ts
// apps/web/src/games/registry.ts
type GameViews = { Host: FC<{ view: unknown }>; Player: FC<{ view: unknown }> };
const registry: Record<string, GameViews> = { 'guess-who': guessWhoViews };
```

Adding a game's UI = adding `apps/web/src/games/<id>/` and registering it —
mirrors how `packages/games` registers game logic. The shell looks up
`registry[room.selectedGameId]`.

### Theme

MUI theme built from `design.md` tokens (color/type/space/radius/elevation).
Tokens are **TBD until the first sketch** — filled there, then the theme maps to
them. No hardcoded colors in components; read the theme.

## Screen inventory (each sketched on claude.ai/design, then approved, then built)

**Host (shared screen):**
1. Open room — room code big, "waiting for players".
2. Lobby — code + **roster at up to 50** (compact/paged grid, not one big tile
   each; the E1 constraint already in design.md).
3. Guess Who · collect — prompt + submission progress (who has answered).
4. Guess Who · guess — the anonymised cards + who-is-guessing progress.
5. Guess Who · reveal — cards with authors.
6. Scores — the tally.

**Player (phone):**
7. Join — code + nickname (dup nicknames allowed, E3; reconnect handle stored
   client-side).
8. Lobby — "you're in", waiting state.
9. Guess Who · collect — the answer text input (one primary action).
10. Guess Who · guess — assign an author to each card (not your own).
11. Guess Who · reveal — your result.
12. Scores — your standing.

Spectator states (over 12 active, or joined mid-round) get a "spectating" screen
on both surfaces — sketched alongside the relevant game screens.

## Dependencies to add (rule 8 — confirm before install)

Runtime stack is fixed to React + MUI; these are the concrete packages that
implies, none outside the sanctioned stack:

- `react`, `react-dom`, `@mui/material`, `@emotion/react`, `@emotion/styled`
- `vite`, `@vitejs/plugin-react` (build; `VITE_WS_URL` already implies Vite)
- dev/test: `@testing-library/react`, `@testing-library/user-event`, `jsdom`

`@playwright/test` is already present. Web imports `@klatchr/core` +
`@klatchr/games` (`workspace:*`) for the mock engine; `@klatchr/protocol` is
added by the wiring cycle, not here.

## Testing

- **React Testing Library**, queried by **role and label**, never test id or
  class (CLAUDE.md). Each screen: render against a mock view frame, assert the
  visible affordances and that **no redacted field leaks into the DOM** (the
  view is already redacted, but the test pins it).
- No 100% threshold on `apps/web` (that binds `core`/`games` only); still test
  every screen's states and the phase routing.
- **E2E slips to the wiring cycle.** CLAUDE.md puts browser E2E at the end of
  Cycle 4 as full-stack verification — but with the server deferred, a real
  two-context Playwright round can't run yet. This cycle ships a mock-driven
  single-browser walk-through instead; the two-player E2E lands when the socket
  transport + server exist. (A deviation from CLAUDE.md's cycle map — flagged
  per the working-style rule, not worked around silently.)

## Design-first workflow (rule 9 — the gate for this cycle)

1. Sketch each screen on **claude.ai/design**; publish for review.
2. You approve (or redirect). Nothing is built unapproved.
3. Fill/adjust `design.md` tokens from the approved look.
4. Build the screen in React + MUI against the tokens + the mock transport.
5. Repeat per screen. Host lobby is drawn **at 50**, not at 6.

## Out of scope

Protocol zod messages, the NestJS WS server, the socket transport, the real
two-player E2E — all the **wiring cycle**. No persistence/auth (rule 7).

## Definition of done

`pnpm gate` green; the web shell + all twelve screens built against the mock
transport and matching approved sketches; the game view registry (S4) in place
with `guess-who` registered; `design.md` tokens filled and the MUI theme mapped
to them; RTL tests for every screen + phase routing; a single-browser
host-plus-players walk-through of a full Guess Who round works end to end on the
mock engine.
