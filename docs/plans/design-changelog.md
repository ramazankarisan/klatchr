# Design changelog

The per-cycle design history of `apps/web`, moved out of [design.md](../../design.md) so
that file holds only the current system. Each entry records an approved sketch and the
options picked; later entries can supersede earlier ones. The current state of every
pattern is in design.md's "Patterns (current)".

## Cycle 5.3c — first screens (approved & built 2026-07-28)

Three screens shipped against the approved cards:
- **Collect (phone):** an index-card answer field + *Tape it up*; locks to a
  teal ✓ once submitted.
- **Guess (phone):** the searchable author picker below the tapped card (see
  below); one card at a time, `N of` the guessable cards, and your own card
  marked and unpickable. The guess view tells a player its **own** card id
  (`yourCardId`) — self-authorship, so no leak — which is how the phone marks
  "your card" without matching on text (identical answers would otherwise
  collide). A placed guess can be re-opened and changed.
- **Host scores (board):** a reveal-time round standings scoreboard, ranked,
  leader in marker — **plus** a cross-round **cumulative** `SessionStandings` (on the board, UX-1 merges both into one ranked table) and a
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
- **Host board — vote progress — one meter (B).** A single marker progress bar (markerDeep since UX-1) +
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
- **No hardcoded host or cap (the VITE_WS_URL rule).** The board's join hint is derived from
  `window.location.host` (or shows only the code), not “klatchr.app”; player-count copy
  (“/ N”, spectator “N seats”) is derived from the selected game's `maxPlayers`, not a
  literal 50/12.
- **Mechanical, no separate sketch:** disabled-“Start” reason text, tap targets ≥44px,
  one `h1` per screen (heading order), room-code input hints
  (`autoCapitalize/inputMode/autoFocus`) — ride along in 8.2 against these tokens.

New token: `color.bad = #c0392b` (error mark/outline — used only for failure states,
never decoratively).

## Cycle 11 — host-authored questions (approved 2026-08-03)

The host can bring their own questions instead of the built-in bank. Sketched on the
Klatchr design project (card `cycle-11-questions`); all on the locked paper palette, **no
new tokens**. Picked options:

- **Default lobby — a closed door.** Under the picked game sits one dashed disclosure row —
  *"Using the built-in question bank · Customize ▾"*. The one-tap path is untouched: do
  nothing and Start plays the built-in bank exactly as before.
- **The editor — one working list.** Opening the disclosure reveals a shared
  `PromptSetEditor` (used by every prompt-driven game, each supplying its own packs):
  themed **pack** chips pour their questions in (deduped, mixable; a full pack shows a teal
  ✓), every row has an **×** to toss it, and a dashed field adds **your own**. A faint
  source tag (`Work-safe` / `yours`) is informational, not a division. List rows stay
  straight — the playful ±1.5° tape-and-rotate is for taped answers *during play*, not an
  editable list.
- **Behaviour.** The list is walked in the host's order with no repeat until exhausted;
  emptying it falls back to the built-in bank; switching games resets it. Players' phones
  are unchanged — a prompt is public, so there is **no redaction impact**.

The seam: the list is sent as an opaque `configureGame` (the dormant `Game.init(…, config)`
argument, now live end-to-end); the game validates it. No `core`/design token churn — a new
game with its own setup UI would add a `Setup` slot to the web registry.

## Cycle 12 — play-test fixes (approved 2026-08-05)

Seven play-test fixes on the paper palette; **no new tokens**. Sketched on the Klatchr design
project (card `cycle-12`); picked options:

- **Editor v2.** Pack chips are **toggles** — an added pack shows a teal ✓; tap it again to
  remove its questions (F1). Rows carry a **drag handle** (⠿) to reorder, and the list order is
  the ask order (F2, adds the `@dnd-kit` dependency). If the host opens Customize and empties the
  list, **Start is disabled with a hint** rather than silently falling back (F3). The do-nothing
  host who never opens Customize still gets the built-in set in one tap.
- **A set is the session (F4).** Questions play once, in order; once the set is spent
  (`round === roundsTotal`) the last reveal lands on the **game-over screen** — final standings,
  the round pill reads *"All N questions played"*, and there is **no "New round"**, only Change
  game / Leave. Built-in bank the same (plays its bank in order, then ends). The board reads
  `roundsTotal` from the frame.
- **Leave & close room (F6).** A control (board corner; UX-1 made it a quiet outlined control) closes the room for everyone
  and returns to the landing, where the host can host again **or** join as a player — the escape
  from the auto-resume that otherwise traps a host in one room. An accidental reload still
  auto-resumes; leaving is the deliberate way out.
- **Confirm dialogs (F7).** One reusable MUI `Dialog` guards End game, Change game and Leave &
  close room. Cancel is the safe default; the confirm carries the action's weight (red to close).
- **Packs (F5).** The "Spicy" pack is gone; every pack is now workplace-safe, warm and funny.

## plan-15 UX-1 — readable from the couch (approved 2026-10-19)

The host shared screen, re-scaled for a TV across a room and fixed for contrast. Sketch:
[UX-1 board sketch](https://claude.ai/artifact/JL3kT8AdofagFCWa18tQUx) (TV lobby, TV answering,
TV round done). Host board only; the phone is unchanged apart from the shared tokens.

- **Board fills the TV.** `Board` (now `components/board.tsx`) is `width: min(100%, 1800px)`
  with `clamp()` type throughout, replacing the 1280px cap. Prompt
  `clamp(36px, 4.6vw, 76px)` (supersedes Cycle 8's `clamp(28px, 4.4vw, 52px)`); kickers
  `clamp(16px, 1.4vw, 24px)`; player chips `clamp(22px, 1.9vw, 30px)` (≥22px on a TV).
- **Code-first lobby.** In LOBBY the room code sits on hero dymo tape — the largest thing on
  the board, `clamp(96px, 9.5vw, 168px)` — with a join line "Join at `<host>` · code `<CODE>`"
  at `clamp(28px, 2.8vw, 44px)` beside the game picker and roster. The host is
  `window.location.host` (the VITE_WS_URL rule — never baked). (UX-2 below replaces the join
  line with the `<host>/<CODE>` link.) In-game and on SCORES the code shrinks
  to the top-right corner with a small "join at `<host>`" line under it (latecomers join as
  spectators).
- **Contrast (WCAG AA).** Primary buttons are a markerDeep fill with white text (MUI
  `primary.main`); small secondary text uses the darker `inkSoft #5B5246`; small teal text and
  teal fills under white text use `tealDeep #23695D`. New tokens `inkFaint`, `tealDeep` (table
  above).
- **Who-has-acted chips, shared.** One `ActedProgress` (`games/progressChips.tsx`) serves Most
  Likely To's vote progress and Guess Who's answer and guess progress: `N of M <verb>`, a
  markerDeep progress bar, a card chip with a teal ✓ (inline stroke SVG, `aria-hidden`) per
  seated player who has acted, a dashed `thinking…` chip per player still going. Count, bar
  and chips all derive from the seated ids plus the view's "acted" list, so they always agree;
  an off-shape list reads as nobody yet. Only *who* acted, never *what*, inside a region
  labelled "Who has acted"; no player name appears anywhere else on the board before the
  reveal. The lobby roster uses the same `BoardChip`.
- **Round done.** The pill reads `Round N of M` in play and `Round N of M · standings` on the
  standings screen (`Round N` / `Round N · standings` when unbounded) — it never says "done",
  since End game can reach that screen mid-round — and `All N questions played` once the set
  is spent (the game-over screen, unchanged). The two stacked standings (Guess Who's round
  tally plus the cumulative `SessionStandings`) become **one ranked table** (`RoundStandings`):
  `#`, Player, This round (`+N`, or `—`), Total. Ranking is competition ranking (ties share a
  rank: 1, 1, 3) and every player on the top total (> 0) is highlighted (`#F6E2D4`) — one rule
  shared with the phone's compact `SessionStandings` "Overall" list.
- **Leave & close room…** moves out of the primary row to a quiet outlined control in the
  board's top-right corner (still behind its confirm dialog).

## plan-15 UX-2 — join and orientation (approved 2026-10-19)

Zero-friction join and knowing what's going on, on the phone and the TV lobby. Sketch:
[UX sketch](https://claude.ai/artifact/JL3kT8AdofagFCWa18tQUx) (phone join, phone waiting
room, phone after answering, and the TV lobby's how-to-play card). No new tokens.

- **Join link.** The board's join line is now the link itself: "Join at `<host>/<CODE>`" in the
  lobby and "join at `<host>/<CODE>`" in the corner (the host is still `window.location.host`).
  Opening `/<CODE>` or `?code=CODE` lands on the join form with the code filled in and focus on
  the name. A code must be one core's `generateRoomCode` could mint (its alphabet and length,
  via `isRoomCode`), in any case; anything else opens the landing. The SPA fallback (server static handler, Vite dev) serves the
  shell for the path. Once used (a join, Back, "Not this room?", a resuming host session, or
  hosting) the address is replaced with `/`. That is a `replaceState`, with no reload and no new history entry, so a leave or a
  reload never re-reads a stale code and the browser's back button is never trapped.
- **Join form.** A Back control (a chevron plus "Back", 44px) returns to the landing. A linked
  code shows as a card instead of the code field: "Joining room" over the code in mono, and a
  "Not this room?" link that clears it back to an empty, focused code field. A quiet hint under
  the name reads "The host's screen shows the code. Opened a link? It's filled in for you."
- **How to play.** Each game's web registry entry carries a three-step `howTo`. The TV lobby
  shows it as a card under the join hero: "How to play · `<game>`", with the steps in three
  columns and numbers in markerDeep. The phone waiting room shows it as an "UP NEXT" card with
  the game name and a numbered list.
- **Phone waiting room.** The phone header stays (wordmark, room code on tape, game label).
  Under it are your name-tag (the ringed `PlayerDot` plus name, display bold) and a quiet
  outlined "Leave room". Leave room confirms in the shared `ConfirmDialog`, then sends
  `leave` and returns to the join form. It forgets the room's resume secret and saved name only
  if the link was live, so the leave really went out. Otherwise the leave is only queued and
  is dropped on dispose, so the token is kept: the seat is reaped after the grace, or a rejoin
  reclaims it. Below
  come the h2 "You're in! Waiting for the host to start.", the UP NEXT card (or "The host is
  picking a game."), "In the room (N)" name chips with yours marked "(you)", and a quiet foot
  note: "Keep this page open — you can lock your phone; your seat waits 3 minutes."
- **After you act.** On the phone, Guess Who (after answering or skipping) and Most Likely To
  (after voting) show "N of M answered/voted", the shared `ProgressBar` (a markerDeep
  `progressbar` with its count, also used by the board's `ActedProgress`), and a "look up at
  the big screen" line, inside an `<output>` (`role="status"`, `aria-live="polite"`). These are counts
  only: the player views carry how many have acted but not who, so the sketch's
  "Waiting on X and Y" is left out rather than widening the views. An off-shape count renders
  nothing.
- **Phase announcements.** `Board` and `Phone` each hold one always-mounted, visually hidden
  polite live region. It says "Now: `<phase>`": the lobby, the game's own phase name (each
  registry entry has a `phaseNames` record keyed by the view's `phase`, e.g. Answering,
  Guessing who said it, Voting), or Standings.
- **Tokens in code.** `tokens.elevation.lift` and `tokens.elevation.board` (the table's
  values) replace every copy of those shadow literals in `apps/web`.

