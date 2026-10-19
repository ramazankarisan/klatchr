# Klatchr

Party-game platform: a host opens a room on a shared screen, players join on
their phones with a four-letter code. The platform is the product; games are
pure modules that plug into it. Live at https://klatchr.duckdns.org (one Docker
container behind Caddy; runbook `docs/deploy.md`).

Area rules load from the nearest CLAUDE.md: `packages/CLAUDE.md` (core, games,
protocol), `apps/server/CLAUDE.md`, `apps/web/CLAUDE.md`, `e2e/CLAUDE.md`.

## Done means green

Run `pnpm gate` before claiming any task done; it fails fast. Never report
success for code you have not run. CI also runs `pnpm e2e` on every PR. A red
check means fix the code — never loosen the check. The wall's own files (gate,
`.hooks/`, thresholds, CI) are guarded by `.claude/hooks/`.

## Architecture rules

Code comments cite these by name.

- **Dependency direction.** Dependencies point one way: `core <- games`;
  `protocol` stands alone (zod only); `server` and `web` may use all three and
  never import each other. `core` never imports `games` — the registry receives
  games by injection. Enforced by `.dependency-cruiser.cjs`.
- **Parse at the boundary.** Every client<->server message is a zod schema in
  `packages/protocol`, parsed at both ends. Never cast an incoming payload with
  `as`. Missing a shape? Add it to `protocol` first.
- **View-only.** Clients only ever receive `view(state, viewer)` for themselves,
  never raw game state. `view()` is a redaction boundary: a leak through it is as
  severe as a crash, and the host screen's view is the strictest, since everyone
  sees it.
- **No persistence.** No database, no auth, no accounts. Rooms live in server
  memory; a redeploy drops them, which is acceptable. Do not add persistence.
- **No `any`.** A suppression (`@ts-expect-error`, `biome-ignore`, …) needs a
  justification comment on the line above, and is banned in core/games.
- **No new deps.** Do not add a dependency without asking. Current stack: pnpm,
  TypeScript, vitest, zod, NestJS, ws, React, MUI, @dnd-kit, playwright; tooling
  biome, dependency-cruiser, knip, jscpd, type-coverage, husky, lint-staged,
  commitlint, gitleaks, fast-check (core/games tests only). No Python.

## Working style

- Research, then a written plan in `docs/plans/plan-N.md`, then implement. Do not
  implement before the plan is approved. Inside implementation, TDD: failing
  test first — redaction tests before game logic.
- Docs are part of the work. Before the PR that closes a plan — and right after
  any change to deployment, the protocol, the Game interface or the design
  system — fix every markdown file the change made stale, and note
  "docs checked" in the plan.
- If a rule here is wrong or unworkable, say so and propose a change. Do not
  silently work around it.
