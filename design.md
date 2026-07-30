# design.md — Klatchr design system

Source of truth for the look and feel of `apps/web`. Per CLAUDE.md rule 9,
**every UI change is sketched and approved before it is built.** This file is
updated alongside the sketch, and component code is written against it.

## Workflow

1. Sketch the screen/component on **claude.ai/design** (surface confirmed with
   the user 2026-07-24).
2. Publish it for the user to review and control. Wait for approval.
3. Only then implement in React + MUI, matching the approved sketch and the
   tokens below.
4. Update this file if the design introduced or changed a token/pattern.

## Two surfaces

Klatchr is Jackbox-shaped: one shared screen plus phones.

- **Host screen** — laptop/TV, shared, viewed from across a room. Large type,
  high contrast, glanceable. Shows the room code, roster, prompts, tallies,
  scores. Never shows any player's hidden data (redaction; see the `Viewer`
  `{ role: 'host' }` boundary).
- **Player phone** — compact, portrait, touch. One primary action per phase
  (type an answer, pick a guess). Thumb-reachable controls.

## Design direction — Paper / bulletin-board (locked 2026-07-25)

Screen = a warm **bulletin board**; phone = your **name-tag + index card**. Warm,
tactile, workshop/offsite energy — a team tool that feels hand-made, not a neon
party toy. The room code lives on **label-maker tape**; answers are **index
cards** taped to the board; the reveal is a teal rubber **stamp**. A committed
warm-light world for the product surfaces in v1 (no dark mode yet — a later
consideration); the design-gallery chrome is theme-aware.

## Tokens (locked from the approved paper sketch)

| Token | Value | Notes |
|---|---|---|
| color.kraft | `#F0E7D8` | board / phone ground (with a subtle SVG grain overlay) |
| color.kraft2 | `#E7DCC8` | deeper kraft — dashed dividers, overflow tiles |
| color.card | `#FBF6EC` | index card / name-tag surface |
| color.ink | `#2B2620` | warm black text |
| color.inkSoft | `#6B6154` | muted / secondary text |
| color.marker | `#E8623D` | **primary / CTA** — the only "buzzer" |
| color.markerDeep | `#C14A2B` | pressed / eyebrow |
| color.teal | `#2E8B7B` | **correct / reveal** — earned, never shown before reveal |
| color.dymo | `#34302A` | label-maker tape ground (room code sits on it) |
| color.players[8] | `#E8623D #E0A32E #2E8B7B #3E7CB1 #8A5A83 #6E7B3E #F2996E #55707A` | one marker per person |
| font.display | `"Helvetica Neue", Arial, system-ui` 900 | headings + prompts |
| font.body | `ui-sans-serif, system-ui` | running text, buttons |
| font.hand | `"Bradley Hand","Segoe Print","Comic Sans MS", cursive` | ~~name-tags~~ **retired from the shipped app (Cycle 8, option B — Comic Sans fell back on most phones)**; token retained, applied nowhere |
| font.mono | `ui-monospace, "SF Mono", Menlo` | room code (on dymo tape), data |
| space | `4 · 8 · 12 · 16 · 24 · 32 · 48` | 4/8-based scale |
| radius.card | `6px` | index cards, tally |
| radius.control | `8px` | fields, name-tags |
| radius.pill | `999px` | primary button |
| elevation.lift | `1px 3px 6px rgba(43,38,32,.14)` | paper lift on cards/tags |
| elevation.board | `0 22px 50px -30px rgba(43,38,32,.5)` | the board panel |

**Component style.** Room code = mono on dark dymo tape. Name-tag = colored band
+ **display-bold name** (Cycle 8, option B — was hand-lettered). Index card =
ruled cream, a strip of tape at top, slight hand-placed rotation (±1.5° max).
Reveal = teal outlined "Said it" stamp, rotated. Primary button = marker-red
pill; disabled/waiting reuses it dimmed. MUI is the component library (fixed
stack); these tokens map to an MUI theme (`theme.palette`, `theme.typography`,
`shape`, `shadows`).

**Design system:** the claude.ai/design **Klatchr** project — a *Foundations*
card (the two surfaces, palette, type, component kit) plus one card per
Cycle-5.3c screen, synced from this repo via DesignSync (driven from the code
session, not the design chat). It is the visual source of truth alongside the
tokens above.

**Cycle 5.3c — approved &amp; built (2026-07-28).** Three screens shipped against
the approved cards:
- **Collect (phone):** an index-card answer field + *Tape it up*; locks to a
  teal ✓ once submitted.
- **Guess (phone):** the searchable author picker below the tapped card (see
  below); one card at a time, `N of` the guessable cards, and your own card
  marked and unpickable. The guess view tells a player its **own** card id
  (`yourCardId`) — self-authorship, so no leak — which is how the phone marks
  "your card" without matching on text (identical answers would otherwise
  collide). A placed guess can be re-opened and changed.
- **Host scores (board):** a reveal-time round standings scoreboard, ranked,
  leader in marker — **plus** a cross-round **cumulative** `SessionStandings` and a
  round-counter pill (Cycle 10, S6). The room accumulates each round's scores; the
  board shows both the round result and the running total, and a **game-over screen**
  with **End game** / **Change game** exits (the host is no longer stuck looping
  rounds). See the `cycle-10` design card.

**Guess interaction (phone).** You never pick an author from 50. Guess Who seats
**12 players per round** (`guessWho.maxPlayers = 12`; the rest of a large room
spectate and rotate in — E2 seat-and-spectate), so a guesser chooses among the
**≤11 other** active players. The screen is a list of answer cards; tapping a
card opens a **searchable author picker** (name-tag chips + a search field),
one card at a time, with a `N of 11 named` progress count. The search field is
there so the pattern still holds if a future game seats more — never a flat row
of 50 pills.

## Cycle 6.2 — Most Likely To + the game picker (approved 2026-07-28)

The second game's screens plus the platform's first host **game picker**. Sketched
on the Klatchr design project (cards `game-picker`, `most-likely-to-phone`,
`most-likely-to-board`); the picked options:

- **Host game picker (LOBBY) — game cards (A).** One tappable card per game: name,
  one-line blurb, player range (from `Game.name`/`description`/`min–max`, S5); the
  selected card in marker, then *Start the round*. (A radio-list variant is kept in
  the sketch for when the library outgrows cards.)
- **Player vote (phone) — searchable picker (B).** The same name-tag picker as Guess
  Who's guess: a search field + name-tag chips, tap one to vote, *Lock it in*. Reuses
  the pattern and scales past 12. Self-vote allowed (toggle A).
- **Player results (phone).** Your received-vote count (large), your own vote echoed as
  a chip, then the **counts-only** tally with the winner bar in marker. Who-voted-for-whom
  is never shown (toggle B).
- **Host board — vote progress — one meter (B).** A single marker progress bar +
  `N of M voted` + name chips (done vs pending). **No target, no running tally** — the
  host view is the strictest redaction. Scales to 50.
- **Host board — results.** A winner spotlight (a *Most likely* stamp + name + count) over
  a ranked bar tally — winner bar in marker, the rest teal.

No new tokens — all on the locked paper palette. Two invisible seam refactors ride along
(no visual change): `PlayerViewProps` collapses to a single `onEvent(event)`, and each
game's web module exports **step metadata** (per-phase label + advance action) to the view
registry, so the host control bar is no longer hard-wired to Guess Who's three steps.

## Cycle 7.2 — Reconnecting… indicator (approved 2026-07-29)

Both surfaces now heal a dropped socket themselves (auto-reconnect + backoff, then
re-handshake — a player re-sends `join { reconnectToken }`, a host re-sends
`resumeHost { code, hostToken }` from 7.1). While it heals, a **Reconnecting…**
indicator shows; it clears the instant the socket is **live** again. Sketched on the
Klatchr design project (card `reconnecting`); the picked option:

- **Reconnecting — masking-tape strip (A).** A full-width masking-tape strip clamps
  the top of the board / phone (`RECONNECTING…`, mono, a pulsing marker dot), and the
  content **dims to ~50%** behind it so nobody reads a stale state as live. Loud and
  glanceable across a room; reuses the tape motif. (A quieter pinned-corner-chip
  variant B is kept in the sketch.) **Non-blocking:** anything tapped during the blip
  **queues and flushes** on reconnect — nothing is lost. The strip is a shared
  `Board`/`Phone` `reconnecting` prop (one `ReconnectingTape`, both frames).
- **State model.** Three connection states: `live` (no indicator — the game just
  plays), `reconnecting` (strip shown, clears on re-handshake), `connecting` (the very
  first open/join — keeps today's "Joining… / Opening the room…" placeholder,
  untouched this cycle). Surfaced by the transport as a status stream alongside frames.
- No new tokens — all on the locked paper palette (tape = marker stripes on card).
- **Deferred:** restoring a host session across a *full page reload* (memory wiped) —
  this cycle heals in-memory socket drops on a live page. Full-reload restore is a
  later concern.

## Cycle 8 — post-launch UX (approved 2026-07-30)

Fixes found play-testing the live app. Sketched on the Klatchr design project (card
`cycle-8-ux`); all `apps/web`, no core/games/protocol/server change. Picked options:

- **Player = full-viewport (retire the bezel from production).** The `Phone` phone-bezel
  chrome is **no longer the real layout** — the player surface fills the viewport: a
  fluid column, `max-width ~480px` centered, `min-height:100dvh`, same kraft/paper look,
  thumb-reachable primary action. The `Phone`/`Board` bezel components survive **only in
  the design-surface mockups**, never in the shipped app.
- **Host board scales to the shared screen.** Its own wide container (not the `lg` cap)
  and a projector-scale type ramp — prompt `clamp(28px, 4.4vw, 52px)`, a large room code
  on dymo tape, readable across a room.
- **Error / dead-end pattern — full-screen recover (option A).** A bad code, full room,
  closed room, or failed host-rejoin **replaces the screen** with a message (an outlined
  `!` mark in `color.bad`, a human title like “No room ‘ZZZZ’”, a one-line reason) and a
  recover button (“Try another code” / “Back”). One pattern for every failure — never an
  infinite spinner. Backed by a new `error` channel on the web `Transport` seam.
- **Name-tag font — clean display (option B).** `font.hand` is **retired for name-tags**;
  names use `font.display` **bold** (crisp, legible, zero download). This removes the
  Comic Sans fallback. (`font.hand` may still exist as a token but is no longer applied
  to participant names / tallies / the winner spotlight.)
- **No hardcoded host or cap (rule 6).** The board's join hint is derived from
  `window.location.host` (or shows only the code), not “klatchr.app”; player-count copy
  (“/ N”, spectator “N seats”) is derived from the selected game's `maxPlayers`, not a
  literal 50/12.
- **Mechanical, no separate sketch:** disabled-“Start” reason text, tap targets ≥44px,
  one `h1` per screen (heading order), room-code input hints
  (`autoCapitalize/inputMode/autoFocus`) — ride along in 8.2 against these tokens.

New token: `color.bad = #c0392b` (error mark/outline — used only for failure states,
never decoratively).

## Screens (Cycle 4)

- Host: **lobby** (room code + joining players), **in-game** per phase,
  **scores**.
- Player: **join** (code + nickname), **in-game** per phase, **scores**.

**Scale constraint (E1, plan-2):** rooms hold up to **50** players. Sketch the
host lobby + scores at 50, not at 6 — roster needs a compact/paged layout, not
one large tile per player. Player-phone screens are unaffected by room size.

Each gets a sketch → approval → build. Redaction is verified in the game view,
not left to the UI.
