# plan-11 — host-authored question sets (one PR)

The host can bring their own questions to a game instead of the built-in bank:
in the lobby, before Start, they pour in a themed **pack**, toss any question they
don't want, and type their own — all into one working list. Do nothing and it plays
the built-in bank exactly like today. One editor, shared by both games.

Design-gated and **approved** (card `cycle-11-questions` on claude.ai/design,
2026-08-03). Research + framing in the host-authored-questions research report; the
framing that drove it: **future-proof the seam**, and **accept this is an ice-breaker**
— a group plays one game, a few rounds, then mostly leaves. So authoring is opt-in and
zero-friction by default, and nothing persists beyond the room's life (rule 7 untouched).

This is the first cycle since launch to touch `core`, but every touch is small and
along the existing grain. Built as **ordered, self-contained commits** (core →
protocol → server → games → web → e2e), each green on its own.

## The spine — activate the dormant `config` seam, opaque end-to-end

`Game.init(players, deps, config?)` already declares a `config` argument that nothing
fills (`core/room.ts:141` calls `init(active, deps)` with no third arg). The whole
feature is making that argument real, following the pattern the codebase already uses
for per-game `event` / `gameView`: **opaque at protocol/core/server, validated inside
the game.**

```
host lobby <Setup> editor
   │  (full working list)
   ▼
configureGame action ──► protocol host msg { action:'configureGame', config: z.unknown() }
   │
   ▼
server forwards verbatim ──► roomReduce { type:'configureGame', config: unknown }
   │
   ▼
Room.gameConfig (stored opaque)  ──► startGame: game.init(active, deps, config)
   │
   ▼
game validates defensively; falls back to its built-in bank on absent/garbage
```

Core/protocol/server **never inspect** the config — they carry an opaque blob. Only the
game reads it. So a future game #N declares any config shape it likes and touches zero
shared code.

## Settled decisions

| Ref | Decision |
|-----|----------|
| D1 | **One working list.** Packs **append** their questions (deduped, mixable); every row is deletable; a write-your-own row adds custom. "Pack vs custom" is just lines in the list, with a faint source tag. |
| D2 | **No-repeat rotation.** Across a session's rounds the authored list is walked so no question repeats until the whole list is used, then it wraps. Needs the round number to reach `init` — the one interface tweak (generic, reusable). |
| D3 | **Both games** at once — they author the identical thing (a prompt list) via a shared `PromptSetEditor`; each ships its own packs. |
| D4 | **Config lives on the `Room`.** Set via a `configureGame` host action, applies to every round, **resets when the selected game changes** (mirrors the B2 per-game reset). Re-picking the same game keeps it. |
| D5 | **Never a broken game.** Empty list ⇒ built-in bank. Blank / duplicate lines dropped; over-long capped. The game validates; the fast default path is never blocked. |
| D6 | **Players unchanged.** The phone never sees the editor; it gets the host's question on its card, one per round. No redaction impact — a prompt is public. |

## Change surface (by package)

- **`core`** — `GameDeps` gains `round: number` (the started round, injected by
  `startGame`; documented as ambient round context, not "non-determinism"). `Room`
  gains `gameConfig: unknown`. New `configureGame` room event + reducer (host-only,
  not IN_GAME, stores the opaque blob). `startGame` passes `room.gameConfig` into
  `init`. `selectGame` resets `gameConfig` alongside `round`/`sessionScores` on a game
  change (extends the B2 reset). Core never reads inside the blob. All TDD'd; core stays
  **100%**. *(The old 200-line cap on core/games was raised to a uniform 400 this cycle —
  the user's call — so `room.ts` absorbs the new reducer without an extraction.)*
- **`protocol`** — the `host` message's `action` enum gains `'configureGame'`, plus a
  `config: z.unknown().optional()` field. No new message type; opaque envelope, same as
  `event`/`gameView`.
- **`server`** — on a `configureGame` host action, parse the envelope and forward the
  opaque `config` into `roomReduce`. No authority or inspection.
- **`games`** — each game's `init` reads config through a pure `validPrompts(config)`
  guard (object → `prompts` array → trim / drop blanks / dedupe / cap length & count →
  cleaned tuple, or `null` ⇒ fall back to the built-in bank). Authored set is walked by
  round: `authored[(deps.round - 1) % authored.length]`; **no config ⇒ today's random
  draw, unchanged.** Each game exports a `packs` table (pure data — `guessWho/packs.ts`,
  `mostLikelyTo/packs.ts`). Redaction tests unaffected. Games stay **100%**.
- **`web`** — `GameViews` gains an optional `Setup` slot; both games point it at a shared
  `PromptSetEditor` (packs row → append; deletable rows; add-your-own; source tags; count;
  built-in-fallback note). The host lobby gets the **Customize ⌄** disclosure (collapsed by
  default — the one-tap path is untouched). Transport `Action` gains
  `{ type:'configureGame'; config: unknown }`; `socket.toWire` maps it; the lobby sends one
  full-list snapshot on panel close (and before `startGame` if changed). All against the
  approved sketch.

## Design-gated screen (Rule 9)

Approved sketch `cycle-11-questions` — three sections: (1) default lobby with the
collapsed disclosure (fast path unchanged); (2) the expanded working-list editor
(packs append, × any row, type your own); (3) behaviour notes (rotation, guards, both
games, phones untouched). No new tokens — all on the locked paper palette.

**Reconciliation (decided):** the sketch depicts a *shuffled* walk (`Q4 → Q1 → Q6…`).
The pure/stable implementation walks the list **in the host's arranged order**, indexed by
round — same no-repeat guarantee, no cross-round seed problem. **Decided: in-order walk**
(user, 2026-08-03); the optional web-side shuffle is deferred. UX identical bar the sequence.

## Build order (commits on one branch)

1. `core`: `GameDeps.round` + `Room.gameConfig` + `configureGame` event/reducer +
   `startGame` threads config + `selectGame` resets config (TDD).
2. `protocol`: `host` action `configureGame` + `config: z.unknown().optional()`.
3. `server`: forward `configureGame` with the opaque config.
4. `games`: `validPrompts` + by-round rotation in both `init`s; `packs.ts` per game; tests.
5. `web`: `Setup` slot + shared `PromptSetEditor`; lobby disclosure + send `configureGame`;
   transport action + `toWire`; RTL tests.
6. `e2e`: customize → play flow; docs sweep (docs-checkpoint).

## Acceptance rows (drive the unit loop, red → green)

**core**
- A1 `configureGame` by the host stores `gameConfig`; a non-host is rejected `NOT_HOST`; during `IN_GAME` rejected `WRONG_PHASE`.
- A2 `startGame` passes `gameConfig` into `init` (proved via a stub game that echoes config into its state).
- A3 `selectGame` to a **different** game resets `gameConfig` (with `round`/`sessionScores`); re-selecting the **same** game keeps it.
- A4 `init` receives `deps.round` = the started round number (1 on first start, N on the Nth).

**games** (guessWho **and** mostLikelyTo)
- A5 valid config ⇒ round 1 uses the first authored prompt.
- A6 by-round rotation: round R uses `authored[(R-1) % n]`; no repeat before wrap; wraps at round n+1.
- A7 absent / non-object / empty / all-blank config ⇒ falls back to the built-in bank (random draw preserved).
- A8 validation cleans: blanks dropped, duplicates removed, over-long capped.
- A9 existing redaction tests still pass (config carries no hidden data).

**web (RTL)**
- A10 editor renders the game's packs; tapping a pack appends its prompts (deduped) and marks the pack added.
- A11 a row's × removes it; the add-your-own row appends a typed question.
- A12 the list bubbles via `onChange`; the lobby sends `configureGame` with the full list on panel close.
- A13 default lobby shows the collapsed disclosure + built-in note; Start works with no customization.

**e2e (verification)**
- A14 host adds a pack + a custom question → Start → the authored prompt shows on the player's collect card and the host board; across two rounds two different authored prompts appear (no-repeat).

## Definition of done

- `pnpm gate` green (core/games **100%**, redaction presence intact); `pnpm e2e` green incl. A14.
- Every visible change matches the approved `cycle-11-questions` sketch.
- Host can pour in a pack, delete any question, add their own; the built-in default is a
  one-tap path unchanged; the authored set walks with no repeats until exhausted; config
  resets on a game change; both games customizable.
- One PR, ordered commits; reviewed green; merged; deployed to the VM (GET 200 / WSS 101).

**Docs checkpoint:** at cycle end sweep design.md (add a Cycle 11 section — the editor,
the disclosure, no new tokens), SPEC.md (plan range → plan-11), CLAUDE.md (the Game
`config` seam is now live — note it under §The Game interface if the "reserved" wording
goes stale), README if the feature list is user-facing. Log the sweep here.
