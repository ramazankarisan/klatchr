# plan-10 — post-play-test bundle (one PR)

A live play-test after the Cycle-8 deploy surfaced a set of UX gaps and product
decisions (full analysis: the play-test findings report). The decisions are
settled (below). Per the user's call this ships as **one big PR** — build →
review → merge → deploy — rather than staged cycles. It **absorbs all of plan-9**
(session scoring + end-game screen + round counter + 50-player board) and adds the
remaining play-test fixes on top.

This is large and multi-surface. To keep the single PR reviewable it is built as
**ordered, self-contained commits** (engine → protocol/server → games → web →
e2e), each green on its own.

## Settled decisions (from the findings triage)

| Ref | Gap | Decision |
|-----|-----|----------|
| F1 | Rejoin with a new name silently ignored | Keep the resumed name, **show "resuming as \<name\>"** on the join form (no core change) |
| F3 | Idle room dies when host socket drops (30 s) | **Client keepalive** ws ping/pong so a backgrounded-but-alive host stays connected (client interval + server pong tolerance); grace stays 30 s |
| F5 | Most Likely To tie | **Co-winners** — spotlight everyone tied at the top |
| F6 | Host trapped in a game | **End-game control + change-game / back-to-lobby + final-standings screen** (engine already supports it) |
| F7/X1 | 12 seats, spectators benched forever | **Keep 12 seats, rotate spectators in** each round (core `startGame` rotates the seat window) |
| F8 | Guess Who prompt hidden while guessing | Show the prompt on the guess phone (engine already sends `v.prompt`) |
| F9 | Reveal hides your own guesses | Expose the **viewer's own** guesses at reveal (redaction-safe) + show them on the reveal phone |
| F10 | No host guess-progress | Show "X of Y guessed" on the host guess board (engine already sends `guessed`) |
| F11 | Per-round scoring only | **Session scoring** — room folds each round into a cumulative tally (plan-9 F1) |
| F12 | Answer required | Add a **"Skip"** — submit no card, still guess others (engine already allows a non-submitter to guess) |
| X2 | "15 / 12 in the room" over cap | Roster reads **"N playing · M waiting"** from seats vs. room count |
| F4 | Join/host not responsive on every screen | Responsive pass, **design-gated** (in the sketch) |

Plan-9's own decisions (D1 aborted-round counts, D2 leaver keeps total, D3 no
reset, session totals are non-secret) carry over unchanged.

## Change surface (by package)

- **`core`** — `Room.sessionScores` + fold-on-`SCORES`-entry + round count (plan-9
  §F1); `startGame` **rotates** the seat window instead of always seating the first
  `maxPlayers` (X1). Reducer transitions all TDD'd; `core` stays 100%.
- **`protocol`** — `frame` gains `sessionScores: Score[] | null` and `round: number`
  (plan-9). No new message types (`endGame` already exists).
- **`games`** — `guessWho` view exposes the **viewer's own** guesses at reveal (F9),
  with a redaction test proving one player never sees another's guesses. `games`
  stays 100%. Most Likely To / scoring unchanged (co-winners is a *view* concern).
- **`server`** — include `sessionScores` + `round` in the frame; server-side ws
  **pong/liveness tolerance** for the keepalive (F3). No authority change.
- **`web`** — session standings + round counter + **end-game / change-game / final
  standings** screen (F6, F11); **co-winner** spotlight (F5); guess-phone **prompt**
  (F8) + **Skip** (F12); reveal **your-guesses** (F9); host **guess-progress** (F10);
  **"N playing · M waiting"** copy (X2); **"resuming as \<name\>"** on join (F1);
  **client keepalive** ping (F3); **responsive** join/host + **50-player compact
  roster** (F4 + plan-9 §F2). All visible changes against the approved sketch.

## Design-gated screens (the sketch, Rule 9)

One consolidated design-surface sketch, approved before any web code:

1. **Host — end-of-game / final standings** (new): cumulative leaderboard, round
   counter, "New round" vs "End game" vs "Change game / back to lobby".
2. **Host — round HUD**: round counter + cumulative-standings column on the reveal/
   results board; guess-progress line.
3. **Most Likely To results — co-winners** layout (2–3 tied).
4. **Guess Who — guess phone** with the prompt shown + a **Skip** affordance on
   collect; **reveal phone** showing *your* guess vs the truth per card.
5. **Responsive** join + host, and the **50-player compact roster** (paged/scrolling,
   sketched at 50, plan-9 §F2).
6. **Join form** "resuming as \<name\>" state.

## Build order (commits on one branch)

1. `core`: session scoring fold + round count (TDD).
2. `core`: rotating seat window (TDD, X1).
3. `protocol` + `server`: frame fields + keepalive tolerance.
4. `games`: guessWho reveal exposes own guesses + redaction test.
5. `web`: transport/keepalive + frame plumbing (sessionScores/round).
6. `web`: the approved screens — end-game/standings, co-winners, guess prompt + Skip,
   reveal your-guesses, guess-progress, copy, resuming-as-name, responsive + 50-roster.
7. `e2e`: extend for end-game → standings, rotation, skip-then-guess.
8. Docs sweep (docs-checkpoint): design.md, plan-9 (mark absorbed), README/SPEC.

## Definition of done

- `pnpm gate` green (core/games 100%, redaction test for F9); `pnpm e2e` green incl.
  the new flows; every visible change matches the approved sketch.
- Host can: see a round counter + cumulative standings, end the game to a final
  standings screen, and return to the lobby to pick another game.
- Spectators rotate in across rounds; co-winners show on ties; the guess phone shows
  the prompt and a Skip; reveal shows your guesses; host sees guess-progress; roster
  copy is seats-vs-waiting; rejoin shows "resuming as \<name\>"; host keepalive holds
  an idle-but-alive tab; join + host are responsive and render 50 compactly.
- One PR, ordered commits; reviewed green; merged; deployed to the VM.
