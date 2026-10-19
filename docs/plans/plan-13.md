# plan-13 — hardening: conformance fuzz + reconnect matrix (one PR)

Cycle 12 shipped the session model; before building more games we prove the platform is
trustworthy under the messy realities of a party: reloads mid-round, flaky wifi, 50 joiners,
double-taps. The pure core is the lever — whole sessions simulate in-memory at thousands per
second, so the strategy is **property-based conformance testing** (every registered game,
automatically) plus a **temporal scenario suite** for the reconnect matrix that Cycle 10's six
live bugs proved is where real failures live.

Decisions settled with the user (below). Ships as **one PR**, ordered commits. **No UI change
this cycle → no design sketch (rule 9 not triggered).** Deferred to Cycle 14: ws-integration
tests (L3), the bot army (L4), new Playwright flows (L5).

## Settled decisions

| Ref | Question | Decision |
|-----|----------|----------|
| D1 | Fuzz engine | **`fast-check`** as a dev-only dep in `core` + `games` (rule 8, user-approved). Shrinking turns a 40-event failing trace into the minimal repro. Never ships to runtime. |
| D2 | Cycle scope | **L1 conformance/fuzz kit + L2 scenario DSL** (the pure-core layers). L6 rides along (caps + playtest protocol doc). L3/L4/L5 → Cycle 14. |
| D3 | Player caps | **Most Likely To `maxPlayers` 12 → 20** (voting a 20-name list scales; guessing 20 cards does not — Guess Who stays 12). Copy derives from `game.maxPlayers` already, so no web edit. |
| D4 | Reap-loses-score | **Soften with nickname-reclaim.** Today a player gone past the 30s grace is reaped and their session score deleted (Cycle-10 ghost fix); rejoining mints a fresh id at 0. New rule: the reaped score parks in a room-level ledger keyed by nickname; a rejoin with a matching nickname reclaims it. Same trust level as the existing resume token (rule 7 — no auth). |

## L1 — the game conformance kit (the future-proof centerpiece)

A generic, test-only kit in `core`: `gameConformance({ game, arbEvent, arbHidden, arbConfig })`.
Each game's test file supplies small fast-check arbitraries for its own event type; the kit
runs seeded event storms (roster events injected mid-anything, double advances, stale phases,
unknown ids) through the real reducer and checks **invariants at every step**:

- **I1 totality** — `reduce` never throws; `view` never throws for any viewer at any state.
- **I2 rejection contract** — a refused event returns the input state unchanged + a typed error.
- **I3 purity** — input state is deep-frozen; any mutation explodes the run.
- **I4 non-interference (redaction, proven not sampled)** — pre-reveal, swap player B's hidden
  submission for another: `view(state, A)` and `view(state, host)` must be deep-equal in both
  worlds. If a view depends on data it shouldn't see, the fuzzer finds the leak.
- **I5 scores** — `scores(state)` keys ⊆ seated non-spectators.
- **I6 roster storms** — `playerJoined`/`playerLeft` at any point never crash; a leaver's
  submissions survive (existing policy, now fuzz-proven).

A failure prints the fast-check seed + shrunken event trace = exact deterministic repro.
**Kit self-test:** deliberately-broken mutant games (one that mutates, one that throws, one
that leaks) must each FAIL the kit — proof the invariants have teeth.

**A new game gets all of this for ~30 lines of arbitraries.** Dependency direction holds:
the kit lives in `core` (generic over `Game<TState, TEvent>`, knows no game); the per-game
runs live in `packages/games` tests (games import core, never the reverse).

## L2 — scenario DSL + the reconnect matrix

A Gherkin-*style* chainable testkit over the pure room reducer (no cucumber dep):

```ts
scenario(guessWho).join('Ada', 'Bo', 'Cy').start().round(4)
  .dropWithinGrace('Bo')   // = NO core event; slot alive — assert all views unchanged
  .reap('Bo')              // = leave (what the server does after 30s)
  .rejoin('Bo')            // = fresh join (new id)
  .expectView('Ada', ...)
```

The server's grace semantics map cleanly onto pure core: *drop-within-grace* is a no-op to
core (the slot stays; others must see nothing), *reap* is `leave`, *rejoin-after-reap* is a
fresh `join`. The DSL encodes that mapping once; the matrix tests read as behavior. Timers
themselves (the literal 30s) stay server territory → Cycle 14's L3.

**The matrix:** {player, host-analog} × {LOBBY, collect, guess/vote, reveal, SCORES,
game-over} × {within grace, after reap, rejoin} × {both games}. DSL kit is generic in `core`
(stub game); the full-game matrix tests live in `packages/games` (dep direction, same as L1).

## D4 in detail — nickname-reclaim (core only, zero protocol change)

- `Room` gains `scoreLedger: Record<string, number>` (nickname → parked score).
- `leave` moves `sessionScores[id]` into the ledger under the leaver's nickname (instead of
  the current pure delete). Ghost fix intact: roster and standings still only show present ids.
- `join` with a nickname matching a ledger key: the new id's `sessionScores` entry starts at
  the parked value; the ledger entry is consumed. First claimant wins; a second join with the
  same nick starts at 0. Duplicate-nick leavers overwrite the ledger slot (last leaver wins) —
  acceptable at icebreaker stakes, documented here.
- `selectGame` (same or different game) clears the ledger alongside `sessionScores` — a new
  session parks nothing.
- The ledger **never leaves core**: `frameFor` picks fields explicitly, protocol unchanged.
  A leak test asserts no frame/view ever contains it.

## Change surface (by package)

- **`core`** — `conformance.testkit.ts` (kit + mutant self-tests), `scenario.testkit.ts`
  (DSL), `scoreLedger` on `Room` + `leave`/`join`/`selectGame` reclaim rules (TDD, 100%).
- **`games`** — per-game event arbitraries + conformance runs; the reconnect-matrix scenario
  tests; MLT `maxPlayers: 20` (one line, 100%).
- **`protocol` / `server` / `web`** — **untouched** (verify fixtures only; capacity copy
  already derives from `game.maxPlayers`).
- **root/docs** — `fast-check` devDependency (core + games); `docs/playtest.md` (the chaos
  playtest protocol: reload, background the phone, airplane mode, two tabs, late join, 20
  joiners); this plan.

## New dependency (rule 8 — approved)

`fast-check` — devDependencies of `packages/core` + `packages/games` only. Test-side only;
the purity hook already exempts `*.test.ts`, and the kit itself makes no banned calls (all
randomness is fast-check's, seeded, test-scope).

## Build order (commits on one branch)

1. `core`: conformance kit + mutant self-tests (red → green on the mutants).
2. `games`: arbitraries for both games; conformance runs green; fix anything I1–I6 flushes out
   (each real finding becomes its own pinned regression test).
3. `core`: scenario DSL + `scoreLedger` reclaim rules (TDD).
4. `games`: the reconnect-matrix scenario tests; MLT cap → 20.
5. docs: `docs/playtest.md`; docs sweep; PR.

## Acceptance rows (drive the unit loop)

**kit (core)**
- A1 mutant self-test: a mutating game, a throwing game, and a leaking game each fail the kit.
- A2 `fast-check` present only as a devDependency of core/games; `pnpm gate` green.

**conformance (games)**
- A3 both shipped games pass ≥200 seeded storm runs of I1–I3 + I5 + I6.
- A4 I4 non-interference: swapping one player's hidden answer (guessWho) / vote (MLT) pre-reveal
  leaves every other player's view and the host view deep-equal.

**scenario matrix (core + games)**
- A5 drop-within-grace at every phase: zero state change, all views byte-identical.
- A6 reap mid-round at every phase: leaver's submissions survive in-game, roster + standings prune.
- A7 rejoin-after-reap mid-round: seated as spectator; next round's rotation deals them in.

**nickname-reclaim (core)**
- A8 reap → rejoin same nickname → the new id starts at the parked score; ledger entry consumed.
- A9 rejoin with a different nickname starts at 0; `selectGame` clears the ledger.
- A10 double-claim: second same-nick join gets 0. Ledger appears in **no** frame or view (leak test).

**caps (games)**
- A11 MLT `maxPlayers === 20`; guessWho stays 12; web capacity-copy fixtures still pass unedited.

**docs**
- A12 `docs/playtest.md` committed: the facilitated chaos protocol, one runnable checklist.

## Definition of done

- `pnpm gate` green (core/games **100%** — the new testkits included); `pnpm e2e` green
  (unchanged suite, run as verification).
- Both games conformance-clean; the reconnect matrix reads as documentation of the platform's
  actual disconnect policy; a flaky-wifi player who misses the grace window gets their score
  back by rejoining with the same name.
- One PR, ordered commits; reviewed green; merged + deployed to the VM only on explicit
  user authorization (GET 200 / WSS 101).

**Docs checkpoint (at cycle end):** CLAUDE.md (testing section: conformance kit + how a new
game plugs in; `fast-check` under rule 8's approved tooling), SPEC (plan range → plan-13),
README if user-facing. Log the sweep here.

## Implementation log (2026-08-05)

All five commits landed in order on `cycle-13-hardening`; gate green throughout. Deltas and
findings against the plan as written:

- **Kit API naming:** the plan's `arbHidden` shipped as `hiddenVariants(state)` — a
  deterministic function returning the single-player hidden-swap worlds, which needs no
  arbitrary at all. It is **required** (a no-hidden game passes `() => []`) so skipping I4
  is a visible decision, never a silent default. Kit lives in `conformance.testkit.ts`
  (coverage-exempt like all testkits) and reaches games via new package subpaths
  `@klatchr/core/conformance` + `@klatchr/core/scenario`, keeping fast-check out of the
  runtime export graph.
- **I4 variants swap content only** (answer text, guess targets, vote targets), never
  add/remove an actor — *who has acted* is public host progress by design. Card→author
  linkage is a two-player permutation and stays covered by the explicit redaction tests.
- **Ledger key is the lower-cased display nickname** — phone keyboards auto-capitalise and
  reclaim-after-reap is exactly the flaky-phone path. Same trust level as planned.
- **Conformance verdict:** both games passed 200 seeded storms of I1–I6 with zero findings
  (the six mutant self-tests prove the kit bites), so no pinned regressions were needed.
- **Finding (FIXED in Cycle 14, plan-14 D2):** if a player is reaped mid-round, the
  end-of-round fold re-added their departed id to `sessionScores` (the game still scores their
  surviving submissions). Invisible to users — standings filter to the roster web-side
  (Cycle 10 B6) — but the ledger only parks at leave time, so a mid-round reap lost that
  round's points even on reclaim. Cycle 14 resolved it by *forfeiting the round*: the fold now
  counts only seated players, so a departed id never enters `sessionScores`. The guessWho
  matrix assertion here was flipped accordingly.
- **A10's leak test** lives in `apps/server/src/roomHub.test.ts` (test-only; `frameFor`
  itself needed no change — it already picks fields explicitly).

**Docs checked (cycle end):** CLAUDE.md (new-game checklist step 5 = conformance run;
Testing section: kit + scenario DSL; rule 8 + fast-check), SPEC (cycles note → 13,
plan range → plan-13), `docs/playtest.md` added (A12), README/design.md/deploy.md
unaffected (no user-facing or UI/deploy change).

**Review round (PR #31):** the background review found one real bug — the reclaim lookup
read the ledger with a bare index, so a nickname like "Constructor" fell through to
`Object.prototype`, poured a function into `sessionScores`, and every later frame failed
the wire schema (one join could brick a room's broadcasts). Fixed with an `Object.hasOwn`
guard + pinned tests ("Constructor" never reclaims; "__proto__" round-trips as an own
key). Also taken: scenario `resume()` now throws on a stale token instead of silently
minting a seat and desyncing the nick map; the kit's viewer set now includes the storm's
`late-*` spectator ids (a leak aimed only at a known mid-round joiner is caught); and
`deepFreeze` walks through pre-frozen top levels (cycle-guarded by a seen-set) so a
shallow-frozen state can't blind I3. Each fix landed red → green with its own mutant or
unit test.
