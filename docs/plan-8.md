# plan-8 — Cycle 8: post-launch UX & correctness

Klatchr is live at `https://klatchr.duckdns.org`. Play-testing on real phones —
plus a full read-only audit of `apps/web` — surfaced a set of issues that are
**launch-quality bugs, not polish**: a mistyped room code strands a player on an
infinite spinner, a host reload abandons the live room, the board points players
at the wrong domain, and the "phone" UI renders a fake phone inside the real
phone. This cycle makes the deployed app actually good on the devices it targets.

It is **all `apps/web`** (plus one tiny transport-seam addition) — **no `core`,
`games`, `protocol`, or `server` change.** Redaction, authority, and the wire are
already right; this is the client surface catching up to the live reality.

Per rule 9, every visible change is **sketched on the design surface and approved
before it is built.** This cycle changes a lot of surface, so it opens with one
consolidated design pass.

## Research — the audit (grouped, by impact)

**Critical — dead-ends / wrong info the live app shows today**

- **Errors are silently dropped → infinite spinner.** The `Transport` seam has no
  error channel; `socket.ts` discards every server `error` frame. A player who
  mistypes the code (`NO_SUCH_ROOM`), hits a full room (`ROOM_FULL`), or leaves the
  name blank (`EMPTY_NICKNAME`) never gets a `joined`/`frame`, so they sit on
  "Joining…" forever with no message and no way back. Host resume errors
  (`BAD_HOST_TOKEN`), `ROOM_CLOSED`, and `GAME_REJECTED` are equally invisible.
  Invisible in dev because the mock never errors — it only bites on the real server.
- **Host reload abandons the room.** No `hostToken`/code is persisted (only the
  player token is); `App` boots to the landing. A refresh = the room is orphaned and
  reaped after the grace window. (This is the reload-restore explicitly deferred in
  7.2.)
- **Wrong domain on the board.** `HostScreen` hardcodes "Join at klatchr.app" —
  wrong host *and* a rule-6 violation. There is no separate join site; players are
  already on the page.

**High — responsive / the real devices**

- **Phone-in-phone.** The `Phone`/`Board` mockup chrome (fixed `width: 300`, bezel)
  is used as the real layout, so a player sees a 300px card pinned in a wide
  container. **Decided: full-viewport responsive** — retire the bezel from
  production; keep it only for design mockups.
- **Host board doesn't scale up.** Capped at `maxWidth="lg"` with phone-sized type —
  unreadable across a room on the TV/projector it's meant for.

**Medium — stale/missing feedback**

- Roster says **"/ 50 in the room"** while games are 3–12 (the picker one line below
  says "3–12 players") — the screen contradicts itself. "12 seats" is likewise
  hardcoded into a game-agnostic spectator message. Drive both from the selected
  game's `maxPlayers`.
- **Disabled "Start the round" with no reason** — no "pick a game" / "need N more
  players (min 3)" hint.
- Tap targets under ~44px on the guess buttons; broken heading hierarchy (a11y);
  room-code field missing `inputMode`/`autoCapitalize`/`autoFocus`.

**Low — polish**

- Name-tag **font** falls back to Comic Sans on most phones (`font.hand`).
- Dead `NameTag` code (`answered` ✓ and the greeting band never render); mixed copy
  ("name-tag" vs "seat", "tonight's game").

**Deferred to Cycle 9 (not this cycle).** "No game over" (the host loops "New round"
forever; `endGame` is wired but no button sends it; `frame.scores`/`SCORES` render
nowhere) and "no round counter" are the **same feature as session scoring** — a
session of N rounds that ends on a final leaderboard. They belong with **plan-9
(session scoring)**, Cycle 9, not here.

## Decisions

- **D1 — real-app layout: full-viewport responsive.** (Settled.) Player fills the
  phone (fluid, `max-width ~480`, `min-height:100dvh`); host board gets its own wide
  container + a projector-scale type ramp. The `Phone`/`Board` bezel survives only in
  the design-surface mockups.
- **D2 — errors get a first-class seam.** Add an `error` channel to the web
  `Transport` (a small seam addition, mirroring `subscribeStatus`), map known server
  codes to human copy, and render a message + a recover affordance. This is the one
  non-`web`-cosmetic change; still no `core`/`protocol`/`server` change (the wire
  already carries `error`).
- **D3 — host survival across reload = client-only.** Persist `hostToken`+code to
  `localStorage` (mirror the player token) and, on load, auto-`resumeHost` when a
  stored host session exists — no protocol/server change (7.1's `resumeHost` already
  exists). If the resume is refused (room gone), fall back to the landing with a
  message (uses D2).
- **D4 — no hardcoded hosts/caps.** Join hint derived from `window.location.host` (or
  just show the code); player-count copy derived from the game's `maxPlayers`.

## Stages (each its own session + PR, green gate; visible changes design-gated)

- **8.0 — design pass (rule 9).** One consolidated set of sketches on the Klatchr
  design project: the **responsive player** (full-viewport) and **host board**
  (projector-scale) layouts; the **error / dead-end / empty states** (bad code, full
  room, room-closed, host-resume-failed) with their recover affordance; the
  **disabled-Start reason**; corrected capacity/domain copy; the **font** choice.
  Publish, get approval. Nothing below is built first.
- **8.1 — recovery & survival (logic + the approved states).** The `Transport`
  `error` seam + rendering the approved error/dead-end states with back/retry;
  host-session persistence + auto-resume on load (D3); RTL tests over a fake transport
  driving each error and the reload-resume. No `core`/server change.
- **8.2 — responsive & correctness pass (the approved visuals).** Retire the bezel →
  full-viewport player; host board wide container + type ramp; font token; capacity/
  domain copy from real values; disabled-Start reason; tap-target, heading-order, and
  input-hint fixes; remove or wire the dead `NameTag` bits. RTL by role/label,
  including a phone-width and a wide-screen fixture.
- **E2E** at cycle end: extend the two-context spec with a **bad-code → visible error
  → recover** flow and a **host reload → room survives** flow (verification, not TDD).

## Out of scope

Session scoring, the end-game/final-standings screen, the round counter (all →
Cycle 9 / plan-9); server fan-out batching (coalesced, fine at these sizes); a third
game; any `core`/`games`/`protocol`/`server` change; persistence across a server
restart (rule 7).

## Definition of done (per stage)

- **8.0** — the responsive layouts, error/dead-end states, and copy/font changes are
  sketched on the design surface and approved; `design.md` updated.
- **8.1** — a bad code / full room / blank name / failed host-resume shows a human
  message and a way back (never an infinite spinner); a host reload auto-resumes the
  live room; `pnpm gate` green; RTL covers each path.
- **8.2** — player fills the viewport (no phone-in-phone) and the host board scales
  for a projector, against the approved sketch; no hardcoded host or player cap; tap
  targets ≥44px; one `h1` per screen; `pnpm gate` green. **Docs checked (2026-07-30):**
  design.md `font.hand` + name-tag component style updated to the shipped display-bold /
  retired-bezel reality; no other tracked markdown made stale by this stage.
- **cycle** — `pnpm e2e` green including the new error-recover and host-reload flows.
