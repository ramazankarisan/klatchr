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
| font.hand | `"Bradley Hand","Segoe Print","Comic Sans MS", cursive` | **name-tags + tape only** — seasoning, never body |
| font.mono | `ui-monospace, "SF Mono", Menlo` | room code (on dymo tape), data |
| space | `4 · 8 · 12 · 16 · 24 · 32 · 48` | 4/8-based scale |
| radius.card | `6px` | index cards, tally |
| radius.control | `8px` | fields, name-tags |
| radius.pill | `999px` | primary button |
| elevation.lift | `1px 3px 6px rgba(43,38,32,.14)` | paper lift on cards/tags |
| elevation.board | `0 22px 50px -30px rgba(43,38,32,.5)` | the board panel |

**Component style.** Room code = mono on dark dymo tape. Name-tag = colored band
+ hand-lettered name. Index card = ruled cream, a strip of tape at top, slight
hand-placed rotation (±1.5° max). Reveal = teal outlined "Said it" stamp,
rotated. Primary button = marker-red pill; disabled/waiting reuses it dimmed. A
✓ tick marks who has answered. MUI is the component library (fixed stack); these
tokens map to an MUI theme (`theme.palette`, `theme.typography`, `shape`,
`shadows`).

**Design system:** the claude.ai/design **Klatchr** project — a *Foundations*
card (the two surfaces, palette, type, component kit) plus one card per
Cycle-5.3c screen, synced from this repo via DesignSync (driven from the code
session, not the design chat). It is the visual source of truth alongside the
tokens above.

**Cycle 5.3c — approved &amp; built (2026-07-28).** Three screens shipped against
the approved cards:
- **Collect (phone):** an index-card answer field + *Tape it up*; locks to a
  teal ✓ once submitted. The client keeps its own answer to mark "your card".
- **Guess (phone):** the searchable author picker below the tapped card (see
  below); one card at a time, `N of 11`, your own card marked and unpickable.
- **Host scores (board):** a reveal-time standings scoreboard, ranked, leader in
  marker. **Round tally only** — a cross-round *running total* was in the sketch
  but is deferred: the engine scores a single round, so cumulative standings need
  platform-level accumulation that does not exist yet.

**Guess interaction (phone).** You never pick an author from 50. Guess Who seats
**12 players per round** (`guessWho.maxPlayers = 12`; the rest of a large room
spectate and rotate in — E2 seat-and-spectate), so a guesser chooses among the
**≤11 other** active players. The screen is a list of answer cards; tapping a
card opens a **searchable author picker** (name-tag chips + a search field),
one card at a time, with a `N of 11 named` progress count. The search field is
there so the pattern still holds if a future game seats more — never a flat row
of 50 pills.

## Screens (Cycle 4)

- Host: **lobby** (room code + joining players), **in-game** per phase,
  **scores**.
- Player: **join** (code + nickname), **in-game** per phase, **scores**.

**Scale constraint (E1, plan-2):** rooms hold up to **50** players. Sketch the
host lobby + scores at 50, not at 6 — roster needs a compact/paged layout, not
one large tile per player. Player-phone screens are unaffected by room size.

Each gets a sketch → approval → build. Redaction is verified in the game view,
not left to the UI.
