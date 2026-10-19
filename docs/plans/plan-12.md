# plan-12 — post-Cycle-11 play-test (one PR)

Playing the live host-authored-questions build surfaced seven findings (triage: the
cycle-12 findings report). Decisions settled with the user (below). Ships as **one PR**,
built as ordered self-contained commits (games/core → protocol/server → web → e2e/docs).

The headline is **F4 — "a question set is the session."** A game now plays each of its
questions **once, in order**, then ends to the final standings — no more infinite wrap-around
repeats. This applies to a host-authored set *and* the built-in bank.

## Settled decisions

| Ref | Finding | Decision |
|-----|---------|----------|
| F4 | Questions repeat forever (`(round-1) % len` wraps) | **Set = the session.** Walk the set in order, one per round; when it's spent the game is over (final standings, no "New round"). Built-in bank the same. |
| F1 | A pack can't be unselected | Pack chip is a **toggle** — tapping an added pack removes the questions it contributed. |
| F2 | No reordering | **Drag-and-drop** with `@dnd-kit` (new dep, user-approved). Order is the ask sequence. |
| F3 | Starting with no questions | **Block "Start"** (with a hint) when Customize is open and the list is empty; the do-nothing host still gets the built-in bank. |
| F5 | "Spicy" pack / tone | Remove `Spicy`; rewrite every pack to be **workplace-safe, warm and funny**. |
| F6 | Host trapped in one room | A **"Leave & close room"** control: closes the room (P6), clears the stored host session, returns to the landing — where the host can start fresh or join as a player. Auto-resume on an accidental reload stays. |
| F7 | Destructive actions fire instantly | **Confirm dialog** before End game, Change game, and Leave & close room. |

## F4 in detail — the session model

- A game exposes **`roundCount?(config): number`** (new *optional* method on the `Game`
  interface) = the number of distinct questions for this session — the authored set's length,
  or the built-in bank's length when there is no config. Games without it are unbounded (old
  behaviour), so this stays backward-compatible.
- The frame carries **`roundsTotal: number`** (server computes it from the active game +
  `gameConfig`); the host UI reads it. At `SCORES` the host sees **"New round"** only while
  `round < roundsTotal`; once `round === roundsTotal` the screen is the **game-over** screen
  (final standings + Change game + Leave) — the natural end, no repeat.
- `choosePrompt` simplifies to an **in-order walk**: `bank[round - 1]` where `bank` is the
  authored set or the built-in bank (no modulo, no random draw — the room never starts a
  round past the budget, so it never wraps). *Trade-off:* the built-in bank now plays in its
  declared order every session rather than a per-session random draw — acceptable for a
  play-once icebreaker; a seeded shuffle is a possible later refinement.
- **Replaying the same game** (Change game → re-pick the same one) starts a fresh session:
  `selectGame` now **always resets `round` + `sessionScores`**, and resets `gameConfig` only
  on a *different* game (so a same-game replay keeps the authored set). This revises the
  Cycle-11 B2 rule (which only reset on a different game) to make "play it again" work.

## Change surface (by package)

- **`core`** — `Game.roundCount?(config)` (interface, optional); `selectGame` reset rule
  (round + scores always; config on different-game only). Reducers TDD'd; core stays **100%**.
- **`games`** — both games add `roundCount` via a shared `promptCount(config, builtin)`;
  `choosePrompt` → in-order walk. `packs.ts` rewritten (drop `Spicy`, warm+funny content).
  Games stay **100%**.
- **`protocol`** — `frame` gains `roundsTotal: number`.
- **`server`** — `frameFor` includes `roundsTotal` (`activeGame.roundCount?.(gameConfig) ?? 0`).
- **`web`** — `@dnd-kit` reorder + pack-toggle in `PromptSetEditor`; Start-gating on
  Customize-open-and-empty (F3); the game-over-vs-New-round split on `roundsTotal` (F4); a
  `leave` transport action + a **Leave & close room** control (F6); a reusable **ConfirmDialog**
  for End / Change / Leave (F7); player sees a clear session-over at exhaustion. Against the
  approved sketch.

## New dependency (rule 8 — approved)

`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` (drag-and-drop reorder, F2). Added
to `apps/web` only. This is the one runtime addition; everything else uses the existing stack.

## Design-gated screens (Rule 9 — sketch → approve before code)

One consolidated `cycle-12` sketch on claude.ai/design:
1. **Editor v2** — pack chips as **toggles** (✓ = added, tap to remove); rows with a **drag
   handle** to reorder; the empty-and-open state with **Start disabled + hint** (F1/F2/F3).
2. **Host game-over at exhaustion** — "All questions played" final standings, Change game +
   Leave, **no New round** (F4).
3. **Confirm dialogs** — End game / Change game / Leave & close room (F7).
4. **Leave & close room** control placement on the host board (F6).

## Build order (commits on one branch)

1. `games`: `choosePrompt` in-order walk + `roundCount` (shared `promptCount`); `packs.ts`
   content rewrite (TDD).
2. `core`: `Game.roundCount?` interface + `selectGame` reset-rule revision (TDD).
3. `protocol` + `server`: `frame.roundsTotal` + `frameFor` wiring.
4. `web`: `@dnd-kit` install; editor toggle + reorder; F3 Start-gate; F4 game-over split;
   F6 leave action + control; F7 ConfirmDialog. RTL for each.
5. `e2e`: a set plays to exhaustion → game-over (no New round); a host leaves → lands and can
   host again / join as a player. Docs sweep.

## Acceptance rows (drive the unit loop)

**games**
- A1 `choosePrompt` walks `bank[round-1]` in order for authored and built-in; no repeat across a session.
- A2 `roundCount(config)` = authored length, or built-in length with no/empty config.
- A3 packs: no `Spicy`; every shipped pack survives validation and reads clean.

**core**
- A4 `selectGame` to the **same** game resets `round`+`sessionScores` but keeps `gameConfig` (replay).
- A5 `selectGame` to a **different** game resets all three (unchanged from B2).

**protocol/server**
- A6 `frame.roundsTotal` reflects the active game's `roundCount(gameConfig)`; `0` with no game.

**web (RTL)**
- A7 tapping an added pack removes exactly its questions (toggle).
- A8 reordering rows changes the sent order (drag-drop, tested via the sortable's keyboard/API).
- A9 Customize open + empty ⇒ Start disabled with a hint; closed or non-empty ⇒ enabled.
- A10 at `SCORES` with `round === roundsTotal` the host sees game-over (no "New round"); `< total` shows "New round".
- A11 End game / Change game / Leave each open a confirm dialog; confirming performs the action, cancel is a no-op.
- A12 Leave & close room sends `leave`, clears the host session, and returns to the landing.

**e2e**
- A13 a short authored set plays to its last question → host game-over, no New round; host Leaves → landing → can host a new room or join as a player.

## Definition of done

- `pnpm gate` green (core/games **100%**); `pnpm e2e` green incl. A13; every visible change
  matches the approved `cycle-12` sketch.
- No infinite repeats; a set ends to standings; packs are warm/funny/safe; a host can leave
  and start over or become a player; destructive actions are confirmed.
- One PR, ordered commits; reviewed green; merged; deployed to the VM (GET 200 / WSS 101).

**Docs checkpoint (at cycle end):** CLAUDE.md (`roundCount` on the Game interface + the
session-length model; the new `@dnd-kit` dep under rule 8's allowed list), design.md (Cycle 12
section), SPEC (plan range → plan-12), README if user-facing. Log the sweep here.

**Docs checked (2026-08-05):** CLAUDE.md (`roundCount?` added to the Game interface block;
`@dnd-kit` added to rule 8's fixed runtime stack), design.md (new "Cycle 12 — play-test fixes"
section, no new tokens), SPEC.md (cycle list + plan range → plan-12), README.md (the intro now
names the session model + reorder). All brought to the shipped reality.
