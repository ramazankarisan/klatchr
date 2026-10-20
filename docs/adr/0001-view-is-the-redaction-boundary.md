# 0001 — `view()` is the redaction boundary

**Status:** accepted · origin: [SPEC](../plans/SPEC.md), [plan-1](../plans/plan-1.md)

## Context

The games are about hidden information: who wrote which answer, who voted for whom. The
host screen is shared, so anything it shows, everyone sees. A client that receives raw game
state can reveal it with a browser's dev tools, whatever the UI hides.

## Decision

Clients only ever receive `view(state, viewer)` for themselves. Every game implements
`view` for two viewers, host and player (a spectator is a player with `spectator: true`),
and the host view is the strictest.
The server fans a room out per viewer; it never sends a state object.

## Consequences

- A leak through `view()` is treated as severe as a crash. Every game must ship host and
  player redaction tests, checked by the gate (`.hooks/check-redaction-tests.sh`), and
  they are written before the game logic.
- Features that show more to a phone (for example, who is still thinking) are a
  deliberate view change with its own tests, never a UI tweak.
- The web can stay dumb: it renders what it is given and cannot leak what it never had.
