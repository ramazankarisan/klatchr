# plan-14 — verification pyramid: fold-fix + ws-integration + bot army + e2e flows (one PR)

Cycle 13 hardened the *pure* layers (conformance fuzz + reconnect-matrix scenario DSL). Cycle 14
finishes the pyramid: the one known correctness bug it surfaced, plus the three verification
layers deferred from it (L3/L4/L5). After this, every seam from the pure reducer up to a real
socket — and a real crowd — is exercised.

Decisions settled with the user (below). Ships as **one PR**, ordered commits. **No UI change
this cycle → no design sketch (rule 9 not triggered).** This is a large cycle (four workstreams);
if it runs long, the fold-fix + L3 are the correctness core and L4/L5 can split to a follow-up PR
— but the intent is one PR.

## Settled decisions

| Ref | Question | Decision |
|-----|----------|----------|
| D1 | Cycle scope | **All four:** fold-fix (core bug) + **L3** ws-integration + **L4** bot army + **L5** Playwright flows. |
| D2 | Mid-round reap → the round's points | **Forfeit the round.** At the score fold, drop entries for ids no longer seated. A player reaped mid-round loses that round's points; a same-nickname rejoin reclaims only their pre-reap total. The ghost id never re-enters `sessionScores`. Consistent with "you left, that round doesn't count for you" and keeps the tally keyed to present players. |
| D3 | Bot army `ws` dependency | `ws` is already the server's WebSocket lib (approved stack) — the bot tool reuses it, run under the `apps/server` workspace context (no new library, rule 8 honoured). |
| D4 | Bot army shape | A **manual load/soak CLI**, not a pass/fail gate: `pnpm bots --players N [--chaos] [--url ...]`. Not in `pnpm gate` or `pnpm e2e`; it exists to smoke the real server (localhost or the live VM) under a crowd. |

## The fold-fix (core, pure, TDD, 100%) — D2

The Cycle-13 finding: when a player is reaped mid-round, `gameEvent`'s end-of-round fold (and
`endGame`'s abort fold) call `game.scores(state)`, which still scores the departed player's
surviving submissions — so `foldScores` re-adds their **pruned** id to `sessionScores`. It rides
in every frame (filtered out of standings web-side, Cycle-10 B6) and is never reclaimable by
nickname (the ledger parked only their pre-reap total at leave time).

Fix: fold only the scores of **currently seated** players. Both fold sites (`gameEvent` on entry
to SCORES, `endGame` on host abort) filter `game.scores(...)` to ids present in `room.players`
before handing them to `foldScores`. A departed id therefore never enters `sessionScores` via a
fold; present players are unaffected. One small helper keeps the two sites identical.

Tests (each red → green):
- mid-round reap → round completes → the departed id is **absent** from `sessionScores`;
  seated players' totals are exactly their earned points.
- the same via `endGame` (host abort mid-round after a reap).
- reclaim after such a reap yields the **pre-reap** total only (the round is forfeit).
- Update the two Cycle-13 matrix assertions that pinned the *old* behaviour (guessWho
  "guess: the reaped player's guesses still score at reveal" flips to absent) and the plan-13
  finding note (now fixed, not deferred).

## L3 — ws-integration (apps/server)

The gap the FakeConn unit tests + the browser E2E leave open: the **real socket path** — the
gateway's `wire()` (message/close handlers), JSON on the wire, a real `socket.close()` →
`hub.disconnect` → grace reap, and the static handler — with no browser, fast, in vitest.

- Extract the http+ws wiring into a tiny `startSocketServer(deps, { port, distDir })` returning
  `{ http, ws, port, close() }`; `SocketGateway` becomes a thin Nest wrapper that calls it (prod
  behaviour identical). This makes the server constructible with **injected deps** (a
  controllable `schedule` + deterministic ids) and an ephemeral port (`0`, read back from
  `http.address()`).
- `gateway.integration.test.ts`: bind on port 0, connect real `ws` clients, and assert across a
  real wire: open→frame, join→joined+roster, a full submit/advance round redacts correctly,
  `socket.close()` keeps the slot through the (injected) grace then reaps it, a reconnect with
  the token resumes the same id, malformed JSON → a single error frame, and a GET with no
  `WEB_DIST` is a bare 404 (the static branch).
- Timers driven by the injected `schedule`, so no wall-clock waits and no `vi.useFakeTimers`
  fighting `ws`'s own internals.

## L4 — bot army (tooling, not a gate) — D3/D4

A dev tool that drives many **real** protocol clients at a target server to surface races/leaks a
single-threaded test can't (50 concurrent joins, churn, keepalive under load).

- `scripts/bots.ts` (run via `tsx` under the `apps/server` workspace so `ws` + `@klatchr/protocol`
  resolve): opens one room as host, joins `--players N` bots, each loops sensible protocol moves
  (submit/vote/guess/advance by role) with small randomised delays; `--chaos` randomly drops and
  reconnects a fraction of bots to exercise the grace/reap/reclaim path under load. Parses every
  inbound frame with `@klatchr/protocol` (rule 2) and logs a periodic summary (connected, frames,
  errors); a non-zero error count exits non-zero so a soak run is scriptable.
- `--url` defaults to `ws://localhost:8080`; can point at `wss://klatchr.duckdns.org` for a live
  smoke. Randomness/clock are fine here (a script, outside `core`/`games` — purity hook doesn't
  apply). A `pnpm bots` script wires the CLI. Knip: register the script as an entry so it isn't
  flagged as dead code.

## L5 — new Playwright flows (e2e)

Two whole-stack flows the current suite doesn't cover, both from the live play-tests:

- **round-4 MLT reload:** play Most Likely To into a later round (≥4), one phone reloads
  mid-vote → it resumes the same seat within the grace window, tally intact, no ghost.
- **host reload mid-guess:** in a Guess Who guess phase, the board reloads → auto-`resumeHost`,
  same room, same round, phones unaffected. (Deeper than the existing lobby-phase host-reload
  spec — this one is mid-round with a live game.)

## Change surface (by package)

- **`core`** — the fold filter in `gameEvent` + `endGame` (+ helper) and its tests; the two
  matrix assertions + plan-13 note updated. Pure, 100%.
- **`apps/server`** — `startSocketServer` extraction; `gateway.ts` thinned to call it;
  `gateway.integration.test.ts`. No protocol/core change.
- **`scripts/`** — `scripts/bots.ts`; `package.json` `bots` script; knip entry.
- **`e2e`** — two specs added to `round.spec.ts`.
- **`protocol` / `web`** — **untouched**.
- **root/docs** — this plan; `docs/playtest.md` gains a "bot army" note; docs sweep.

## Build order (commits on one branch)

1. `core`: fold-fix — forfeit a mid-round-departed player's round (TDD, matrix + note updated).
2. `apps/server`: `startSocketServer` extraction + `gateway.integration.test.ts` (real ws).
3. `scripts`: `scripts/bots.ts` + `pnpm bots` + knip entry; smoke it against localhost.
4. `e2e`: round-4-MLT-reload + host-reload-mid-guess specs.
5. docs: sweep (CLAUDE.md testing layers, `docs/playtest.md`, this plan's log); PR.

## Acceptance rows (drive the unit loop)

**fold-fix (core)**
- A1 mid-round reap → round completes → departed id absent from `sessionScores`; seated totals exact.
- A2 same via `endGame` host abort after a reap.
- A3 reclaim after a mid-round reap yields the pre-reap total only (round forfeit).

**ws-integration (server)**
- A4 real ws client: open→frame, join→joined+roster, a redacted round over the wire.
- A5 real `socket.close()` holds the slot through the injected grace, then reaps; token reconnect resumes the id.
- A6 malformed JSON over the wire → exactly one error frame; GET with no `WEB_DIST` → 404.

**bot army (tooling)**
- A7 `pnpm bots --players 12` against a local server runs a clean round; summary shows 0 errors, non-zero exit on any error.
- A8 `--chaos` drops/reconnects a fraction and the server stays up (manual/live smoke, logged).

**e2e**
- A9 round-4 MLT, phone reload mid-vote → same seat, tally intact.
- A10 host reload mid-guess → auto-resume, same room + round, phones unaffected.

**docs**
- A11 CLAUDE.md testing section lists the four layers (unit → conformance → ws-integration → e2e) + the bot tool; `docs/playtest.md` references `pnpm bots`.

## Definition of done

- `pnpm gate` green (core 100%, the new server integration test included); `pnpm e2e` green
  (the two new flows + the unchanged suite).
- The forfeit rule holds end to end; the real socket path has fast node coverage; the bot tool
  drives a clean 12-bot round locally and survives `--chaos`.
- One PR, ordered commits; reviewed green; merged + deployed to the VM only on explicit user
  authorization (GET 200 / WSS 101).

**Docs checkpoint (at cycle end):** CLAUDE.md (testing layers + bot tool; the reap-forfeit rule
in the Game-interface roster-policy note), SPEC (plan range → plan-14), `docs/playtest.md` (bot
army), README if user-facing. Log the sweep here.
