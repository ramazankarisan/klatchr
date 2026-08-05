# The chaos playtest — a facilitated protocol (plan-13 A12)

A live, human-run counterpart to the automated hardening suite: the conformance
fuzz and reconnect matrix prove the *pure* layers; this checklist exercises the
same failure modes through real phones, real wifi and the real deployment.
Run it against <https://klatchr.duckdns.org> with one board (laptop/TV) and at
least three phones. Tick every row; anything that deviates from **Expected**
is a finding — file it with the phase it happened in and what the board and
each phone showed.

One person facilitates (reads the rows, keeps the game moving); everyone else
just plays and follows instructions when named.

## Setup

- [ ] Board opens a room, picks a game, players join with nicknames everyone
      can remember (they matter for reclaim below).
- [ ] Play one clean round first — a baseline nobody has broken yet.

## Reload & reconnect

| # | Do this | Expected |
|---|---------|----------|
| R1 | Mid-answer/vote, one phone **reloads the page** | Comes back into the same seat within seconds; nothing changes on the board or other phones |
| R2 | One phone **backgrounds the app** for ~10s, returns | Same seat, same screen — a drop inside the grace window is invisible |
| R3 | One phone turns on **airplane mode ~10s**, then off | "Reconnecting…" strip, then self-heals into the same seat |
| R4 | One phone goes dark **for over a minute** (past the 30s grace), then rejoins with the **same nickname** | New seat, spectates the round in progress, is dealt in next round — and their **session score is back** (nickname reclaim) |
| R5 | Same as R4 but rejoin with a **different nickname** | Fresh player, score starts at 0 — the parked score stays reserved for the old name until the game changes |
| R6 | The **board** reloads mid-round | Host auto-resumes: same room, same round, phones unaffected |

## People being people

| # | Do this | Expected |
|---|---------|----------|
| P1 | A new player joins **mid-round** | Spectates this round ("waiting"), seated next round |
| P2 | One player opens the room in **two tabs** with the same nickname | Two separate players (nickname is display-only); no seat theft |
| P3 | One player **double-taps** submit/vote/advance everywhere | Never crashes, never skips a phase, never counts twice |
| P4 | The host mashes **Next/advance** while phones are mid-submit | Phase moves once; late submissions are refused quietly, not crashed |
| P5 | A player **leaves outright** mid-round (Leave button) | Their submitted answer/vote still counts this round; roster and standings prune them |

## Scale (Most Likely To seats 20)

| # | Do this | Expected |
|---|---------|----------|
| S1 | Pile in **more joiners than the game seats** (21+ on MLT) | Overflow spectates with clear "N playing · M waiting" copy; board roster stays readable |
| S2 | Play **two rounds** at that size | The bench rotates in — nobody spectates twice in a row |
| S3 | End the game, **switch games**, play again | Round counter and scores reset; nobody is stuck on a stale screen |

## Wrap-up

- [ ] Play a set to the end: the game ends by itself when the questions are
      spent; final standings appear on board **and** phones.
- [ ] Host leaves — room closes cleanly on every phone.
- [ ] Collect findings; each one becomes a pinned test (unit, matrix or E2E)
      before the next cycle closes.
