# plan-15 — lead-dev audit: harden, fix, guard, polish, present

A full audit of the repo (four parallel reviews: docs and guardrails, core/games/protocol,
server/web multiplayer, UX and reviewer-readiness) produced the backlog below. It ships as a
**sequence of small PRs, one per workstream**, each reviewed at medium effort, fixed, green in
CI and merged before the next starts. Each PR is a single commit on `main`, so any one of them
can be reverted on its own.

The owner chose an unattended run: plans and design sketches are published for review after
the fact rather than waiting for approval. UI PRs still get a published sketch first.

## Order and why

| # | PR | Depends on | Why this position |
|---|----|-----------|-------------------|
| 0 | Lean CLAUDE.md split (#33) | — | Every later PR is written against these rules. |
| 1 | **Crash-proof server + input validation** | — | One malformed frame or event kills the process and every live room. Urgent. |
| 2 | **Guardrails** | 1 | Enforces rules mechanically before the bigger changes land. It goes after 1 so its new checks run on already-clean code. |
| 3 | **Game correctness and redaction** | 1 | Pure core/games fixes. It builds on PR 1's event validation. |
| 4 | **Connection robustness (server + protocol)** | 1 | Heartbeat, supersede, grace policy. It changes the protocol, so it goes before the web half. |
| 5 | **Connection robustness (web)** | 4 | Client heartbeat, transport lifecycle, superseded/restart states. |
| 6 | **UX: readable from the couch** (sketch first) | 5 | Visual pass on the TV board and contrast. It goes after 5 so the new states are designed once. |
| 7 | **UX: join and orientation** (sketch first) | 6 | Join link, how-to-play cards, back/leave. |
| 8 | **UX: progress and feedback** (sketch first) | 6 | Name chips, phone progress, aria-live, merged standings. |
| 9 | **Reviewer readiness** | 6–8 | README with screenshots of the *final* UI, ARCHITECTURE.md, docs tidy. Last, because it describes everything above. |

## 1 · Crash-proof server + input validation

Findings, all verified by repro:
- A raw frame with invalid UTF-8 or a bad opcode throws on a socket with no `'error'`
  listener, which kills Node.
- `play.event` is `z.unknown()`, and the game reducers' `switch` has no default. So
  `{type:'x'}` or `null` makes `roomReduce` throw inside the ws listener, which kills Node.
- There is no `maxPayload`: the ws default is 100 MiB.
- A Guess Who `submit.text` can be a non-string, missing, blank, or unbounded in length.
- Nickname, room code and token strings have no `.max()`. A room code is upper-cased only
  by the web input.
- `roundCount(rawConfig)` re-scans the raw host config on every broadcast, so a huge array
  stalls the event loop.
- A late `advance` arriving in SCORES errors instead of being a no-op.
- `serve()` in staticFiles has no `.catch`.

Fix:
- **Server:**
  - Add `socket.on('error', terminate)`.
  - Wrap `hub.receive`/`disconnect` in try/catch: log, send an error frame, keep running.
  - Add a last-resort `uncaughtException` handler that logs.
  - Set `maxPayload: 16 KiB`.
  - Add a `.catch` to `serve` that returns 500.
- **Games** (typed rejections, never a throw):
  - Add a `default:` branch in each reducer that returns `UNKNOWN_EVENT`.
  - Guard non-object events at the room boundary with a typed `MALFORMED_EVENT`.
  - In `submit`, require a string, trim it, reject an empty result as `EMPTY_ANSWER`, and
    cap it at 200 characters.
  - Have `validPrompts` bound its input before scanning it.
- **Protocol:**
  - Add `.max()` on nickname (40 raw), room code (normalised: trim plus upper-case, length 4),
    and tokens (64).
  - Use a code-point-safe nickname slice and strip `\p{Cf}` (zero-width) characters.
- **Core:** in SCORES, `advance` is `ok(room)`, so a double-tapped final advance is silent.
- **Tests:**
  - A conformance totality check over `fc.anything()` events for both games.
  - ws-integration S1: an invalid frame closes only that socket, and other rooms keep getting
    frames.
  - Unit tests for every new rejection.

## 2 · Guardrails (backpressure on agents)

- **`.claude/settings.json` PreToolUse hooks:**
  - Deny `--no-verify`, `HUSKY=0`, and `git push` to `main`.
  - Ask before editing the guard files: `vitest.config.ts` thresholds, `scripts/gate.sh`,
    `.hooks/**`, `.dependency-cruiser.cjs`, `biome.json`.
- **New gate checks** (bash, cheap):
  - No `as` casts in the boundary files (`apps/*/src/transport`, `roomHub`, `roomSession`,
    `protocol`).
  - No hard-coded host or port in `apps/web/src`.
  - A redaction test must cover both a `player` and a `host` viewer.
  - Every game ships `conformance.test.ts` calling both kits.
  - Dependency names are checked against an allowlist file, so adding a dependency is a
    reviewed edit.
  - Tighten the bypass-justification regex: it currently accepts any trailing comment.
  - Extend the purity patterns: `crypto.`, `Date(`, `queueMicrotask`, `requestAnimationFrame`,
    `fetch`.
- **CI:**
  - Add `commitlint` over the PR range.
  - Run the license check in the gate too.
  - Drop the duplicate audit.
  - Make gitleaks loud when it is missing locally.
- **Owner action, not code:** the `main` ruleset lets admins bypass it "always". Consider
  setting it to "pull request only".

## 3 · Game correctness and redaction

- **Redaction leak:** identical answers sort by `text|authorId`, and the order reveals the
  author. Fix: a salt drawn in `init` from `deps.random` breaks ties. Add a redaction test.
- **Most Likely To:** a reaped player stays a vote candidate ("(left)") and stays on the
  results tally while the scoreboard drops them. Fix: on `playerLeft`, drop the leaver from
  candidates; keep votes already cast for them out of the tally and scores consistently, the
  same way in both games.
- **Changing the question set in SCORES** keeps the round index, so questions get skipped or
  the next start fails with `SESSION_COMPLETE`. Fix: a changed config resets the session
  round counter. The session scores stay.
- **Follow-ups from the PR 1 and 2 reviews:**
  - `boundedText` checks for blank text *after* capping, and also caps code units, so
    stacked combining marks can't make a 60 KB "1-character" answer.
  - The web join field gets a `maxLength` that matches the protocol bound.
  - Host prompts go through `boundedText` too.
  - Client-sent roster events (`playerJoined` / `playerLeft`) are refused at the
    server, since only the room may author them.
  - A game that returns an unchanged state is no longer re-broadcast.
  - One `isAdvance`, shared from core.
- **Known and accepted (D1, earlier cycle):** a host abort folds partial scores. This is
  documented, not changed.

## 4 · Connection robustness — server + protocol

- **Heartbeat:** every 20 s the server pings at ws level and terminates a socket that missed
  the previous pong. A dead host laptop or a half-open phone then enters the existing
  grace/reap path. The app-level `ping` gets a `pong` reply, so the client can detect a dead
  socket.
- **Handshake deadline:** a socket that sends no `open` or `join` within 10 s is closed.
- **Supersede:** when a second device or tab resumes a seat or the host, the old connection
  gets `error SUPERSEDED` and is closed and unbound in the hub. Today it freezes silently.
- **Grace:**
  - The player grace goes from 30 s to 3 min, since a phone lock routinely exceeds 30 s. The
    host keeps a shorter grace (60 s).
  - The room no longer closes when its last player is reaped while the host is still
    connected. Only host gone + grace closes it.
  - This is a core policy change and ships with scenario-DSL tests.
- **Abuse caps:** a global room cap, a per-IP connection cap (from `X-Forwarded-For` behind
  Caddy), and a per-connection token-bucket message rate limit.
- **Tests:**
  - ws-integration S2 (handshake deadline), S3 (missed pong, then reap), S9 (supersede).
  - Server unit S11 (the room survives with the host present).
  - S20 (caps).

## 5 · Connection robustness — web

- **Client heartbeat:** expect any inbound message, `pong` included, every 2× the interval,
  else reconnect. On `visibilitychange`→visible and on `online`, probe or reconnect at once.
- **Connect timeout:** 8 s, then retry.
- **`Transport.dispose()`:** stops timers and retries and closes the socket. It runs on every
  screen exit and after a fatal error, so there is no more ghost reconnecting into a reused
  room code.
- **Superseded / server-restarted:** terminal cards for both, plus clearing the stale
  per-room localStorage keys.
- **Host resume:** move it to sessionStorage, so a second tab no longer steals the board.
- **Tests:** web unit S13, S14, S23, plus the App flow for S10.

## 6–8 · UX (each starts with a published design sketch against design.md)

- **6, readable from the couch:**
  - TV type scale for the code, join line, prompt, kickers and chips; a code-first lobby;
    board width relative to the viewport.
  - Contrast fixes: button fill to markerDeep; darker kickers and teal small text.
  - The pill reads "Round N done" until the set is spent.
- **7, join and orientation:**
  - A `?code=ABCD` join link, prefilled and shown on the board.
  - Back on the join form; a player "Leave room".
  - A "How to play" card per game, on the TV and the phone lobby.
  - The phone lobby shows the game and who's in.
  - **No QR code:** it needs a dependency, which goes to the owner.
- **8, progress and feedback:**
  - Guess Who name chips with ✓ (reusing the Most Likely To chips).
  - "N of M done" on the phone after acting.
  - `aria-live` for phase changes.
  - One merged standings table (round delta + total).
  - "Leave & close room" moves away from Start.

## 9 · Reviewer readiness

- **README:**
  - The pitch and a live demo link up top.
  - Screenshots of the TV plus phones.
  - An architecture diagram.
  - "Why it's interesting" (redaction boundary, conformance fuzz, scenario DSL, gate wall,
    reconnect).
  - Run-locally notes, including that `pnpm dev` runs on the mock transport.
  - The agentic-workflow section kept.
  - CI badge.
- **`ARCHITECTURE.md`** (human-facing: dependency direction, Game contract, room lifecycle,
  reconnect policy) plus a few short ADRs.
- **History:** move `docs/plan-*.md` and `SPEC.md` to `docs/history/`, with an index. Split
  design.md's cycle changelog into `docs/history/design-changelog.md`.
- **Hygiene:**
  - Stale comments (`vitest.setup.ts`, `vite.config.ts`, `playwright.config.ts`).
  - deploy.md: the Ubuntu version.
  - Node 20 vs 22: align CI with the Dockerfile.
  - package.json metadata.
- **Owner decisions, deferred:** LICENSE choice, and the GitHub repo description and topics.

## Test-scenario matrix (multiplayer / network)

Layers: **DSL** = core scenario DSL unit · **Hub** = server unit with FakeConn ·
**WS** = ws-integration on a real socket · **Web** = web unit · **E2E** = Playwright ·
**Bots** = `pnpm bots` soak · **Manual** = real phones on the live deploy (`docs/playtest.md`).

| # | Scenario | Expected | Layer | Status |
|---|----------|----------|-------|--------|
| S1 | Malformed frame (invalid UTF-8, bad opcode, oversize) | Only that socket closes; other rooms keep getting frames | WS | PR 1 |
| S2 | Socket upgrades, never sends `open`/`join` | Closed after 10 s | WS | PR 4 |
| S3 | Client stops answering pings (half-open) | Terminated → grace → reaped | WS | PR 4 |
| S4 | Non-object, unknown or wrong-typed `play.event` | Typed rejection, process alive | Hub + conformance | PR 1 |
| S5 | Drop → reconnect inside grace | Same id; the late reaper is a no-op | Hub + WS | ✅ exists |
| S6 | Drop past grace | Reaped, round forfeit, rejoin as spectator, score reclaimed by name | DSL | ✅ exists |
| S7 | Host reload mid-round | Board resumes | Hub + E2E | ✅ exists |
| S8 | Host gone past grace | Room closes, phones see ROOM_CLOSED | Hub | ✅ exists |
| S9 | Same seat resumed on a second device | The old one gets SUPERSEDED, closes and does not fight back | Hub + WS + Web | PR 4/5 |
| S10 | A second tab opens while the host board is live | The second tab does not steal the board | Web | PR 5 |
| S11 | Last player reaped while the host is present | The room stays open | DSL + Hub | PR 4 |
| S12 | Actions queued offline flush after reconnect with a stale phase | Typed rejection, no double advance | Web + core | partly |
| S13 | Fatal error → leave screen | Transport disposed: no retries, no timers | Web | PR 5 |
| S14 | New socket stuck CONNECTING | Retry after 8 s | Web | PR 5 |
| S15 | Mistyped code | Recover card | E2E | ✅ exists |
| S16 | Network drop | "Reconnecting…" then heals | E2E | ✅ exists |
| S17 | Player reload mid-vote | Same seat, vote kept | E2E | ✅ exists |
| S18 | Real phones: lock 10 s / 60 s / 5 min, app switch, Wi-Fi ↔ cellular | Resumes the same seat within grace | Manual | checklist in playtest.md |
| S19 | Server restart (redeploy) | Clients see "server restarted", stale keys cleared | WS + Web | PR 5 |
| S20 | Flood: many rooms or connections from one IP, message spam | Caps and rate limit hold, other rooms responsive | WS + Bots | PR 4 |
| S21 | Huge config or answer text | Refused or capped before broadcast | Games + Hub | PR 1 |
| S22 | Many players reconnecting while the host advances | Consistent frames, no duplicate seats | Bots `--chaos` | ✅ tool exists |
| S23 | Socket looks open but is dead after a phone wakes | Heartbeat timeout → reconnect inside grace | Web + Manual | PR 5 |

## Implementation log

(one line per PR as it lands, with "docs checked")

- **PR 0** (ramazankarisan/klatchr#33): lean CLAUDE.md split. Docs checked: README,
  deploy.md, .env.production, PR template.
- **PR 1:**
  - The socket gets an `error` listener, `maxPayload` is 64 KiB, and receive/disconnect
    are guarded.
  - Last-resort process handlers are added, and the static `serve` has a `.catch`.
  - Each game checks event shapes (`MALFORMED_EVENT`).
  - Answers are trimmed and capped; a blank answer is `EMPTY_ANSWER`.
  - The prompt scan is bounded.
  - Nicknames are code-point safe with `\\p{Cf}` stripped.
  - Protocol string bounds are added, and room codes are upper-cased inbound.
  - A late `advance` in SCORES is a no-op.
  - Tests: S1/S4/S21.
  - Docs checked: packages/CLAUDE.md (event guard in the checklist), protocol comments.
- **PR 2:**
  - Claude hooks: `.claude/hooks/guard-bash.mjs` denies skipping husky
    (`--no-verify`, `HUSKY=0`) and pushes to main. It matches real usage only and
    replays a case table in the gate. `guard-edit.mjs` asks before an agent edits a
    wall file.
  - New gate checks: no `as` in boundary code, no hardcoded host in web, a
    dependency allowlist, redaction tests must cover the host and a player, and
    conformance tests must run both kits.
  - The bypass-justification rule is tightened, and the purity patterns are
    extended.
  - The license check moves into the gate. gitleaks is loud when missing, and
    required in CI.
  - CI: commitlint over the PR range, Node 22 (matching the Dockerfile), and the
    duplicate audit is dropped.
  - Known limit: `guard-edit` covers the Edit and Write tools, not shell writes. The
    CI wall is the backstop.
  - Docs checked: CLAUDE.md, README.md.
- **PR 3:**
  - Identical answers are ordered by a salted hash, not by author id: a redaction
    leak, now covered by a redaction test.
  - A player who leaves forfeits the round in both games. They drop off the tally,
    the Most Likely To candidates and the progress totals. Their own vote or answer
    still counts, and a vote for them is void in the tally only, so progress counts
    leak nothing.
  - A client-sent roster event is refused with `FORBIDDEN_EVENT`.
  - An unchanged game state is not re-broadcast.
  - A *changed* question set starts a new session, the same as re-picking the game: first question, fresh tally. Re-saving the same set is a no-op, so a spent set stays spent.
  - `boundedText` checks for blank text after capping, plus a code-unit cap, and
    prompts use it too. The name field gets a `maxLength`.
  - One `isAdvance`, shared from core.
  - Docs checked: packages/CLAUDE.md (roster semantics and the progress-count rule).
