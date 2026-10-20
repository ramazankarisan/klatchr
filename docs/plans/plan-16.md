# plan-16 — usage logging

**Status:** approved in its trimmed form (owner, 2026-10-20: "just basic info: how many rooms
created, how many users joined, which games are played, how many rounds").

## Goal

The owner can read four numbers off the live server: rooms created, players joined, which
games were played, and how many rounds. Today the server logs only crashes, so none of these
are known.

## Research

- **Where things happen:**
  - A room opens in `RoomHub.open`.
  - A new player joins in `RoomSession.join`, where `added` is set; a token resume is not a
    join.
  - A round starts when `room.round` goes up in `RoomSession.apply`.
- **Injection:** `ServerDeps` (`apps/server/src/serverDeps.ts`) already injects the clock,
  the RNG and `schedule`. An optional `usage` sink fits beside them.
  - Absent, nothing is logged. That keeps every existing test silent.
  - The gateway wires the real stdout sink.
- **Where the logs live:** with Docker's default `json-file` driver, `docker rm -f` deletes
  the logs at every redeploy. `--log-driver journald` keeps them in the VM's journal across
  redeploys, where journald rotates them.
- **Rules:**
  - *No persistence:* nothing is read back; lines go to stdout.
  - *No new deps:* `console.log`.
  - *View-only:* untouched.
  - `roomSession.ts` is at 391 of 400 lines, so the session gets only one-line calls into a
    new `usage.ts`.

## Decisions

- **Only counts, never content or identity.** No nicknames, answers, tokens, room codes or
  addresses. A test plays a round with marker nicknames and checks they never reach a line.
- **Format:** one JSON object per line, prefixed `usage `, with the time added by the sink:
  - `usage {"t":"…","ev":"room.open"}`
  - `usage {"t":"…","ev":"player.join"}`
  - `usage {"t":"…","ev":"round.start","game":"guess-who","round":2,"players":5}`
- **Not built** (owner: not needed): per-visitor tags, room tags, hourly summaries, refusal
  logs, durations.

## Implementation (TDD)

1. `apps/server/src/usage.ts` holds:
   - the `UsageLine` type;
   - `roundStarted(before, after)`, which returns the `round.start` line when `round` went up;
   - `stdoutUsage`, the sink that prints `usage <json>`.
2. `ServerDeps.usage?: (line: UsageLine) => void` is emitted from three places:
   - `RoomHub.open` emits `room.open`.
   - `RoomSession.join` emits `player.join` on a new player.
   - `RoomSession.apply` emits `round.start`.
3. The gateway builds its hub with `{ ...realDeps(), usage: stdoutUsage }`.
4. Tests in `roomHub.usage.test.ts`:
   - U1: open, two joins, select, start, then the next round emits exactly the expected lines,
     in order.
   - U2: a token resume adds no `player.join`.
   - U3: the marker nicknames appear in no line.
   - U4: `stdoutUsage` prints the `usage ` prefix and valid JSON with `t`.
5. Docs:
   - `docs/deploy.md`: `--log-driver journald` on the `docker run` line, plus a "Reading
     usage" section with four ready commands, one per question.
   - `apps/server/CLAUDE.md`: one line on the sink.

## Docs to check at the end

`docs/deploy.md`, `apps/server/CLAUDE.md`, `ARCHITECTURE.md`, `docs/plans/README.md`.

## Log

- Built as planned. Docs checked: docs/deploy.md (journald + "Reading usage"),
  apps/server/CLAUDE.md, docs/plans/README.md; ARCHITECTURE.md needed no change.
