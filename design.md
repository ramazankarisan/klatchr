# design.md — Klatchr design system

Source of truth for the look and feel of `apps/web`. Per `apps/web/CLAUDE.md` (design before code),
**every UI change is sketched and approved before it is built.** This file is
updated alongside the sketch, and component code is written against it.

## Workflow

1. Sketch the screen/component on **claude.ai/design** (surface confirmed with
   the user 2026-07-24).
2. Publish it for the user to review and control. Wait for approval.
3. Only then implement in React + MUI, matching the approved sketch and the
   tokens below.
4. Update this file if the design introduced or changed a token/pattern, and log
   the cycle in `docs/plans/design-changelog.md`.

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
| color.inkSoft | `#5B5246` | muted / secondary text (UX-1: was `#6B6154`, darkened for AA on kraft) |
| color.inkFaint | `#8C8274` | dashed outlines, quiet control borders — non-text only (UX-1) |
| color.marker | `#E8623D` | the brand "buzzer" accent — selection rings, leader bars, the K (never under small white text) |
| color.markerDeep | `#C14A2B` | **primary / CTA fill** with white text (UX-1, AA), eyebrows, small marker text |
| color.teal | `#2E8B7B` | **correct / reveal** — earned, never shown before reveal; large marks and bars |
| color.tealDeep | `#23695D` | small teal text, the ✓ stroke, and teal fills under white text (UX-1, AA) |
| color.dymo | `#34302A` | label-maker tape ground (room code sits on it) |
| color.bad | `#C0392B` | failure states only (error mark and outline), never decorative |
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

Code reads these from `apps/web/src/tokens.ts`; the shadows above are used only as
`tokens.elevation.*`, never copied as literals.

**Component style.** Room code = mono on dark dymo tape. Name-tag = colored band
+ **display-bold name** (Cycle 8, option B — was hand-lettered). Index card =
ruled cream, a strip of tape at top, slight hand-placed rotation (±1.5° max).
Reveal = teal outlined "Said it" stamp, rotated. Primary button = markerDeep
pill with white text (UX-1); disabled/waiting reuses it dimmed. MUI is the component library (fixed
stack); these tokens map to an MUI theme (`theme.palette`, `theme.typography`,
`shape`, `shadows`).

**Design system:** the claude.ai/design **Klatchr** project — a *Foundations*
card (the two surfaces, palette, type, component kit) plus one card per
Cycle-5.3c screen, synced from this repo via DesignSync (driven from the code
session, not the design chat). It is the visual source of truth alongside the
tokens above.

## Patterns (current)

What the shipped app does today. Each cycle's approved sketch and the reasoning behind it
are in [docs/plans/design-changelog.md](docs/plans/design-changelog.md); when a new cycle
changes a pattern, update it here and log the cycle there.

### Both surfaces

- **Layout.** The phone fills the viewport: a fluid column, `max-width ~480px`, centered,
  `min-height: 100dvh`, with the primary action in thumb reach. The board is
  `width: min(100%, 1800px)` with `clamp()` type, sized for a TV across a room: prompt
  `clamp(36px, 4.6vw, 76px)`, kickers `clamp(16px, 1.4vw, 24px)`, chips at least 22px. The
  `Phone`/`Board` bezels exist only in design mockups.
- **Contrast (WCAG AA).** Primary buttons are a markerDeep pill with white text; small
  secondary text is `inkSoft`; small teal text and teal fills under white text are
  `tealDeep`. Tap targets are at least 44px, with one `h1` per screen.
- **No hardcoded host or cap** (the VITE_WS_URL rule). The join line comes from
  `window.location.host`; player-count copy comes from the picked game's `maxPlayers`.
- **Reconnecting.** A full-width masking-tape strip (`RECONNECTING…`, mono, a pulsing marker
  dot) clamps the top of the board or phone, and the content dims to about 50% behind it.
  It is non-blocking: taps queue and flush on reconnect. It clears the moment the socket is
  live. The first connect keeps its own "Joining… / Opening the room…" placeholder.
- **Errors and dead ends.** A bad code, a full or closed room, or a failed host resume
  replaces the screen: an outlined `!` in `color.bad`, a human title ("No room 'ZZZZ'"), one
  line of reason, and a recover button ("Try another code" / "Back"). There is never an
  infinite spinner.
- **Confirm dialogs.** One shared `ConfirmDialog` guards End game, Change game, Leave &
  close room and Leave room. Cancel is the safe default; Leave & close room and Leave room confirm in red.
- **Phase announcements.** `Board` and `Phone` each hold one visually hidden, polite live
  region that says "Now: `<phase>`", using each game's `phaseNames`.

### Host board

- **Lobby.** The room code on hero dymo tape, `clamp(96px, 9.5vw, 168px)`, is the largest
  thing on the board, with "Join at `<host>/<CODE>`" beside it. Then the game picker (one
  card per game: name, blurb, player range; the selected card in marker), a how-to-play card
  ("How to play · `<game>`", three numbered steps), and the roster as `BoardChip`s, laid out
  for 50 players. In game and on standings, the code moves to the top-right corner with a
  small "join at `<host>/<CODE>`" line, since latecomers join as spectators.
- **Questions.** Under the picked game, one dashed disclosure ("Using the built-in question
  bank · Customize ▾") opens the shared `PromptSetEditor`. Pack chips toggle (a teal ✓ when
  added), rows drag to reorder (list order is ask order) and each has an ×, a dashed field
  adds your own. An opened, emptied list disables Start with a hint. Rows stay straight;
  the ±1.5° tape-and-rotate is for answers during play.
- **Who has acted.** One `ActedProgress`: "N of M `<verb>`", the shared markerDeep
  `ProgressBar`, a card chip with a teal ✓ per seated player who has acted, and a dashed
  "thinking…" chip per player still going. It shows who acted, never what, and no player name
  appears anywhere else on the board before the reveal. Most Likely To has no target and no
  running tally, since the host view is the strictest.
- **Results.** Guess Who reveals with the teal "Said it" stamp. Most Likely To shows a winner
  spotlight (a *Most likely* stamp, the name and the count) over a ranked bar tally: the
  winner bar in marker, the rest teal.
- **Standings.** One ranked table (`RoundStandings`): `#`, Player, This round (`+N` or `—`),
  Total. Competition ranking (1, 1, 3); every player on the top total above 0 is highlighted
  `#F6E2D4`. The pill reads `Round N of M` in play and `Round N of M · standings` after
  (`Round N` / `Round N · standings` when the set is unbounded), never "done". Once the question set is spent it reads `All N questions played` and offers
  only Change game and Leave, never New round.
- **Leave & close room…** is a quiet outlined control in the top-right corner. It closes
  the room for everyone and returns to the landing.

### Player phone

- **Join.** `/<CODE>` or `?code=` (any case, only a code `isRoomCode` accepts) opens the
  join form with the code filled in as a "Joining room `<CODE>`" card, a "Not this room?"
  link, and focus on the name. Without a link, the code field carries
  `autoCapitalize`/`inputMode`/`autoFocus` hints. A Back control returns to the landing. Once used, the address
  is replaced with `/` (a `replaceState`, no new history entry).
- **Waiting room.** The header (wordmark, code on tape, game label), your name-tag and a
  quiet "Leave room", "You're in! Waiting for the host to start.", an UP NEXT card with the
  game's how-to-play, "In the room (N)" chips with yours marked "(you)", and a foot note
  that the phone can be locked for 3 minutes. Leave room confirms, sends `leave` and returns to
  the join form; it forgets the room's token and saved name only if the link was live (else
  the seat is reaped after the grace window, or a rejoin reclaims it).
- **Name-tags** are a colored band plus the name in `font.display` bold (`font.hand` is
  retired).
- **Act.** Collect is an index-card field plus *Tape it up*, locking to a teal ✓. Guess Who's
  guess is one answer card at a time with a searchable author picker (name-tag chips plus a
  search field, never a flat row of names) under the kicker "Name the authors · N of M"; your own card is marked and
  unpickable, and a placed guess can be changed. Most Likely To's vote reuses the same picker:
  a tap votes at once ("✓ Voted for X — tap another to change"); self-votes are allowed.
- **After you act.** "N of M answered/voted", the shared `ProgressBar` and a "look up at the
  big screen" line, in a polite status region. Counts only: player views do not say who.
- **Results.** Most Likely To shows your received-vote count large, then the counts-only
  tally with the winner bar in marker. Who voted for whom is never shown.
- **Standings.** The compact `SessionStandings` "Overall" list shares the board's ranking and
  top-total rule; the lead row gets a marker ring.

## Screens

- Host: **lobby** (room code + joining players), **in-game** per phase,
  **scores**.
- Player: **join** (code + nickname), **in-game** per phase, **scores**.

**Scale constraint (E1, plan-2):** rooms hold up to **50** players. Sketch the
host lobby + scores at 50, not at 6 — roster needs a compact/paged layout, not
one large tile per player. Player-phone screens are unaffected by room size.

Each gets a sketch → approval → build. Redaction is verified in the game view,
not left to the UI.
