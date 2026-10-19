# plan-3 — Cycle 3: `packages/games` — Guess Who Said It

The platform's first game. A pure `Game<TState, TEvent>` module under
`packages/games`, built test-first with redaction tests (G8–G10) written
**before** the logic. 100% lines+branches. It plugs into `core` by injection and
requires **no change to `core`** — if it seems to, the interface is wrong and we
stop and say so (CLAUDE.md).

Builds on the Cycle-2 seam (E1–E4): the room hands `init` only the **active**
seats (seat-and-spectate), forwards roster changes as `RosterEvent`, and drives
phase advance from the host. This game consumes all of that; it never re-derives
capacity or identity.

## The game

One shared prompt. Everyone answers it privately. Then the answers are shown
anonymised and everyone guesses who wrote which. Reveal + score. One prompt =
one round; a new round is the room re-initing from `SCORES` (existing edge), not
game state.

**Phases** (host-driven advance, S3 — `{ type: 'advance'; from: PhaseTag }`,
reducer no-ops on phase mismatch so a double-send is idempotent):

```
collect  -- host advance(from:'collect') -->  guess
guess    -- host advance(from:'guess')   -->  reveal   (isComplete → room goes SCORES)
```

- **collect** — each active player submits a text answer (may overwrite until
  advance). Nobody sees anybody else's draft.
- **guess** — answers are frozen into anonymised **cards** (stable `cardId`,
  text, hidden author). Each player assigns an author to each card that isn't
  their own. Nobody sees card authors or other players' guesses.
- **reveal** — authors and scores exposed to everyone. `isComplete` true.

**Anonymity without randomness in `reduce`.** `reduce` is pure `(state, event)`
with no `GameDeps`, so the guess-order shuffle cannot draw randomness there.
Cards are ordered **deterministically by `(text, authorId)`** at the
collect→guess advance and given opaque ids `c0, c1, …` in that order. `cardId`
is decoupled from `authorId` (never equal to it), so exposing a card leaks
nothing. The only randomness is prompt choice, drawn from `GameDeps.random` in
`init`.

## State & events

```ts
type Phase = 'collect' | 'guess' | 'reveal';

interface AnswerCard { id: string; text: string; authorId: PlayerId }

interface GWState {
  phase: Phase;
  prompt: string;
  roster: readonly PlayerId[];                    // the active seats init was given
  drafts: Record<PlayerId, string>;               // collect submissions
  cards: readonly AnswerCard[];                    // built at collect→guess
  guesses: Record<PlayerId, Record<string, PlayerId>>; // guesser → (cardId → guessed author)
}

type GWEvent =
  | { type: 'submit'; playerId: PlayerId; text: string }
  | { type: 'guess'; playerId: PlayerId; cardId: string; author: PlayerId }
  | { type: 'advance'; from: 'collect' | 'guess' };
```

The `playerId` on `submit`/`guess` is the **server-verified actor** (the server
stamps it from the authenticated connection before forwarding; the pure reducer
trusts it — it cannot see the socket, same rationale as host-only advance).

## Reducer transitions (each needs a test, including every rejection)

| Event | Accept | Reject (typed error, unchanged state) |
|---|---|---|
| `submit` | phase `collect`, `playerId` in roster → set/overwrite `drafts[playerId]` | not `collect` → `WRONG_PHASE`; not in roster (spectator) → `NOT_PLAYING` |
| `advance{from:'collect'}` | phase `collect` → build cards (sorted, ids), phase `guess` | `from` ≠ phase → **no-op ok** (idempotent, S3) |
| `guess` | phase `guess`, guesser in roster, `cardId` exists, `author` in roster, card not the guesser's own → set `guesses[playerId][cardId]` | not `guess` → `WRONG_PHASE`; unknown card → `NO_SUCH_CARD`; guessing own card → `OWN_CARD`; author not in roster → `NOT_A_PLAYER`; spectator guesser → `NOT_PLAYING` |
| `advance{from:'guess'}` | phase `guess` → phase `reveal` | mismatch → no-op ok |
| `RosterEvent playerJoined` | mid-round join is a **spectator** → **no-op** on roster/drafts/cards | — |
| `RosterEvent playerLeft` | **no-op**: a player who left keeps whatever they submitted; their card stays guessable (CLAUDE.md) | — |

Rejections return `err({ code })`, never throw (rule 4).

## Redaction — the heart (write these FIRST)

`view(state, viewer)` returns only what that viewer may see. The server sends
`view(...)`, never raw state (rule 3).

| Phase | `{role:'player', id}` sees | `{role:'host'}` sees (strictest — shared screen) |
|---|---|---|
| collect | prompt; whether **I** submitted; count submitted / total | prompt; **who** has submitted (names, progress) — **never any draft text** |
| guess | prompt; cards as `{id, text}` **without author**; candidate roster; **my** guesses; my progress | prompt; cards `{id, text}` **without author**; who-has-guessed progress — **no author, no answer→author map, no guess contents** |
| reveal | prompt; cards with `authorId`; every player's score | same, plus full tally |

**Redaction acceptance (G8–G10), TDD-first:**
- **G8** — `view(collect, {player,id})` contains no other player's draft text.
- **G9** — `view(guess, {player,id})`: no card exposes `authorId`; no other
  player's guesses are present.
- **G10** — `view(guess, {host})`: no `authorId` and no answer→author mapping
  anywhere in the payload (the strictest case — everyone sees the host screen).

Tests assert on the **shape of the returned view** (no forbidden field present),
not on internals.

## Scores, completeness, bounds, context

- `scores(state)`: `+1` per correct authorship guess
  (`guesses[g][cardId] === card.authorId`), summed per guesser. Returned as
  `Score[]` keyed by `playerId`. **(Open toggle A below: fooling bonus.)**
- `isComplete(state)`: `phase === 'reveal'`.
- `minPlayers: 3` — with 2, authorship is a forced single choice; 3 is the
  floor where guessing is real. Within platform `[2, 50]` (E1).
- `maxPlayers: 12` — beyond ~12, guessing one author out of the pool is
  needle-in-haystack. The room's **seat-and-spectate (E2)** handles a bigger
  room: `init` receives the first 12; the rest spectate.
- `contexts: ['teams']` (E4) — needs shared history; weak with strangers.
- `config` ignored (CLAUDE.md).

## Prompt bank & `init`

- A `prompts` const (module-local array of prompt strings).
- `init(active, deps)`: pick `prompts[floor(deps.random() * prompts.length)]`,
  seed `phase:'collect'`, `roster = active.map(p => p.id)`, empty drafts/cards/
  guesses. `deps.now` unused.

## Module layout (`packages/games/src`)

```
guessWho/prompts.ts      the prompt bank
guessWho/state.ts        GWState, AnswerCard, Phase
guessWho/events.ts       GWEvent
guessWho/guessWho.ts     the Game impl (init/reduce/view/scores/isComplete)
guessWho/view.ts         the per-viewer redaction (kept separate; ≤200-line gate)
guessWho/*.test.ts       redaction.test (G8–G10 first), reduce.test, scores.test
index.ts                 export the game + `export const games = [guessWho]`
```

Add `"@klatchr/core": "workspace:*"` to `packages/games/package.json`
(workspace-internal, not a new external dependency — rule 8 is about external
runtime deps). `games` imports **only** `core` (dependency-cruiser enforces).
Update the seed `registeredGameIds` / `index.test.ts` to reflect the registered
game (the seed comment still says "Cycle 2" — fix to Cycle 3).

## Test-first order (red → green)

Redaction first, then transitions:

1. **G8, G9, G10** redaction — the safety property, before any logic exists.
2. G1 `init` seeds collect with a prompt and the active roster.
3. G2 `submit` records / overwrites a draft; G3 spectator submit rejected;
   G4 submit outside collect rejected.
4. G5 `advance(collect)` builds sorted anonymised cards → guess; idempotent on
   wrong `from` / double-send.
5. G6 `guess` records; rejections (own card, unknown card, non-player author,
   spectator, wrong phase).
6. G7 `advance(guess)` → reveal; `scores` = +1 per correct; `isComplete`.
7. Roster: mid-round `playerJoined` is a no-op (spectator); `playerLeft` keeps
   the submission.

## Resolved toggles (approved 2026-07-24)

- **A — scoring.** **Simple +1 per correct guess**, no fooling bonus in v1.
- **B — minPlayers.** **3**.
- **C — unsubmitted players at advance.** A non-submitter has **no card** but
  may still guess; advance is host-forced (S3), never gated on everyone acting.

## Out of scope

No `apps/web` (Cycle 4 — the game's screens get a claude.ai/design sketch +
approval first, rule 9), no protocol/zod wiring of this game's events (Cycle 3.5
/ server cycle), no server. Redaction is verified here in `view`, not deferred
to the UI.

## Definition of done

`pnpm gate` green, `packages/games` at 100% lines+branches, G1–G10 + roster
tests passing, the game registered by injection with **zero** change to
`packages/core`, and toggles A–C resolved as approved.
