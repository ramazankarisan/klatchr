# plan-6 — Cycle 6: Game 2 — "Most Likely To"

The platform's **second** game, and the real test of the seam: *"Adding a game
means adding a directory under `packages/games` and registering it. It must not
require a change to `packages/core`."* (CLAUDE.md). One game hides the interface
holes; a second one either plugs in clean or exposes them. We picked a **voting
game** over the spec's Year Guesser because a public tally + a different phase
set stress the redaction/view seam in ways a number-guess never would
(interface-freeze note).

**Headline seam result (verified against the code before writing this plan):**
- `packages/core` — **zero change**. Registered by injection into `games`.
- `packages/protocol` — **zero change**. `play.event` and `frame.gameView` are
  already opaque (`z.unknown()`); a new game's events/view ride them as-is.
- `apps/web` — **does** change, and *should*: the web view registry is
  per-game by design. Two current web seams are Guess-Who-shaped and must
  generalize (§6.2). This is the seam stress we wanted to find, not a core leak.

## The game

One shared prompt — "Most likely to survive a zombie apocalypse." Everyone
privately votes for **one player**. Reveal the tally: who got the most votes.
One prompt = one round; a new round re-inits from `SCORES` (existing room edge),
same as Guess Who.

**Phases** (host-driven advance, S3 — `{ type:'advance'; from: PhaseTag }`,
reducer no-ops on phase mismatch so a double-send is idempotent). Two phases,
one fewer than Guess Who — itself a useful seam check that the host control bar
isn't hard-wired to a three-step game:

```
vote  -- host advance(from:'vote') -->  results   (isComplete → room goes SCORES)
```

- **vote** — each active player votes for one candidate in the roster (may
  overwrite until advance). Nobody sees anyone else's vote, nor any running
  tally.
- **results** — the tally (votes **received** per player) is exposed to
  everyone; `isComplete` true. Individual voter→target pairs are **not**
  exposed even here (toggle B) — only aggregate counts.

No randomness in `reduce` (it's pure `(state, event)`); the only `GameDeps.random`
draw is the prompt pick in `init`. Nothing like Guess Who's card-ordering is
needed — a tally carries no ordering signal.

## State & events

```ts
type Phase = 'vote' | 'results';

interface MLTState {
  phase: Phase;
  prompt: string;
  roster: readonly PlayerId[];             // the active seats init was given (candidates + voters)
  votes: Readonly<Record<PlayerId, PlayerId>>; // voter → target, secret until results
}

type MLTEvent =
  | { type: 'vote'; playerId: PlayerId; target: PlayerId }
  | { type: 'advance'; from: 'vote' };
```

`playerId` on `vote` is the **server-verified actor** (stamped from the
authenticated connection before forwarding; the pure reducer trusts it — same
rationale as Guess Who's `submit`/`guess` and host-only advance).

## Reducer transitions (each needs a test, including every rejection — rule 4)

| Event | Accept | Reject (typed error, unchanged state) |
|---|---|---|
| `vote` | phase `vote`, voter in roster, target in roster → set/overwrite `votes[voter]` | not `vote` → `WRONG_PHASE`; voter not in roster (spectator) → `NOT_PLAYING`; target not in roster → `NOT_A_PLAYER` |
| `advance{from:'vote'}` | phase `vote` → phase `results` | `from` ≠ phase → **no-op ok** (idempotent, S3) |
| `RosterEvent playerJoined` | mid-round join is a **spectator** → **no-op** | — |
| `RosterEvent playerLeft` | **no-op**: a leaver keeps whatever vote they cast; they remain a votable candidate (parity with Guess Who's "keeps submission") | — |

Rejections return `err({ code })`, never throw.

## Redaction — write these FIRST (the safety property)

`view(state, viewer)` returns only what that viewer may see; the server sends
`view(...)`, never raw state (rule 3).

| Phase | `{role:'player', id}` sees | `{role:'host'}` sees (strictest — shared screen) |
|---|---|---|
| vote | prompt; candidate roster; whether **I** voted (+ my own target); count voted / total | prompt; **who** has voted (names, progress) — **never any target, never a tally** |
| results | prompt; per-candidate vote **count** (tally); winner | same tally — public by nature |

**Redaction acceptance (mirrors G8–G10), TDD-first:**
- **M8** — `view(vote, {player,id})` reveals no *other* voter's target and no
  tally (I may see my own vote).
- **M9** — `view(vote, {host})` contains no target and no tally anywhere in the
  payload — the strictest case; a mid-vote host screen that showed a running
  tally would let the room bandwagon.
- **M10** — `view(results, …)`: exposes the aggregate tally but **no
  voter→target map** (toggle B keeps individual votes private even at reveal).

Tests assert on the **shape of the returned view** (no forbidden field present),
not on internals.

## Scores, completeness, bounds, context

- `scores(state)`: `points` = votes **received** per player, `Score[]` keyed by
  `playerId`. Public tally; the winner is the max. (Popularity, not skill —
  fine for the `Score` shape. Cross-round session totals stay out of scope; S6.)
- `isComplete(state)`: `phase === 'results'`.
- `minPlayers: 3` — with 2, "most likely" is a forced binary; 3 is the floor
  where a vote is real. Within platform `[2, 50]` (E1).
- `maxPlayers: 12` — parity with Guess Who; seat-and-spectate (E2) handles a
  bigger room. Voting scales better than guessing, so this is a soft cap
  (toggle C).
- `contexts: ['teams', 'strangers']` — unlike Guess Who this needs little shared
  history (first-impression voting works), so it advertises both (E4). (toggle C)
- `config` ignored.

## Module layout (`packages/games/src`) — mirrors `guessWho/`

```
mostLikelyTo/prompts.ts        the "Most likely to…" prompt bank
mostLikelyTo/state.ts          MLTState, Phase
mostLikelyTo/events.ts         MLTEvent
mostLikelyTo/mostLikelyTo.ts   the Game impl (init/reduce/view/scores/isComplete)
mostLikelyTo/view.ts           per-viewer redaction (separate; ≤200-line gate)
mostLikelyTo/*.test.ts         redaction.test (M8–M10 first), reduce.test, scoring.test
index.ts                       add to `export const games = [guessWho, mostLikelyTo]`
```

`games` imports **only** `core` (dependency-cruiser enforces). Update
`registeredGameIds` / `index.test.ts` for the second registered game.

## Test-first order (red → green)

1. **M8, M9, M10** redaction — before any logic exists.
2. init seeds `vote` with a prompt and the active roster.
3. `vote` records / overwrites; rejections (spectator voter, target not in
   roster, wrong phase).
4. `advance(vote)` → results; idempotent on wrong `from` / double-send.
5. `scores` = votes received; `isComplete` at results.
6. Roster: mid-round `playerJoined` no-op (spectator); `playerLeft` keeps the
   vote, stays a candidate.

## §6.2 — web integration (separate stage/PR, design-gated)

The pure module (§6.1 above) is core/protocol-clean. The web is where the seam
actually gets stressed. Three current `apps/web` seams are Guess-Who-shaped:

1. **No game picker.** `HostScreen` hard-codes `GAME_ID = 'guess-who'` and
   auto-`selectGame`s it on Start. With two games the host must **choose**
   (the `Game.name`/`description`/`minPlayers` picker metadata, S5, exists for
   exactly this). → new host LOBBY picker screen — **rule 9 design gate first.**
2. **`PlayerViewProps` is game-specific** — `onSubmit(text)` + `onGuess(cardId,
   author)`. Generalize to a single **`onEvent(event: unknown)`**; each game's
   player view builds its own event shape. The transport already carries an
   opaque `gameEvent`, so this is a web-only change (PlayerScreen + the Guess
   Who view move to `onEvent`). No core/protocol change.
3. **Host control bar is game-specific** — `stepLabel`/`stepActions` hard-code
   Guess Who's phase labels and `asHostView(...).phase`. Generalize: each game's
   web module exports **per-phase step metadata** (label + advance action),
   keyed in the web view registry beside `{ Host, Player }`.

Then add the `most-likely-to` registry entry with its Host/Player views. A
second E2E (or extend `e2e/round.spec.ts`) can prove a Most Likely To round +
that the picker routes correctly. Each web change lands behind an approved
design sketch (design.md is the source of truth).

## Resolved toggles (approved 2026-07-28)

- **A — self-vote: ALLOWED.** A player may vote for themselves; no `OWN_VOTE`
  rejection. The reducer's only vote guards are voter∈roster and target∈roster.
- **B — results reveal: TALLY COUNTS ONLY.** Per-candidate counts + winner;
  individual voter→target pairs are never exposed (M10 asserts their absence
  even at results). Who-voted-for-whom is a possible later toggle.
- **C — bounds/context: `maxPlayers: 12`, `contexts: ['teams','strangers']`**
  (recommended defaults, accepted).
- **D — scoring: `points = votes received`**, a per-round tally; cross-round
  session score stays deferred (S6) (recommended default, accepted).

## Staging

- **6.1** — pure `mostLikelyTo` module, TDD redaction-first, **zero core /
  protocol change**, registered by injection. Own session + PR.
- **6.2** — web: the three seam generalizations (1–3 above) + the game picker +
  Most Likely To views, each design-gated. Own session(s) + PR.

## Out of scope

Cross-round session leaderboard (S6), teams/subgroups (S8), a third game,
who-voted-for-whom reveal (toggle B may add later), any persistence (rule 7).

## Definition of done

**6.1:** `pnpm gate` green, `packages/games` at 100% lines+branches, M8–M10 +
transition + roster tests passing, the game registered by injection with
**zero** change to `packages/core` and `packages/protocol`, toggles A–D
resolved. **6.2:** the host can pick either game, a Most Likely To round plays
end to end over the real socket, and the web seam generalizations don't regress
Guess Who (its E2E + RTL tests stay green).
