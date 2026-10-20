# 0003 — Rooms live in server memory

**Status:** accepted · origin: [SPEC](../plans/SPEC.md), [plan-7](../plans/plan-7.md)

## Context

A party game lasts an evening. Players join with a four-letter code and a nickname; there is
nothing worth keeping afterwards, and accounts would add friction exactly where the product
promises none.

## Decision

No database, no auth, no accounts. Rooms are held in the server process's memory. Identity
inside a room is a server-minted secret token (see [0005](0005-tokens-and-grace-windows.md)).

## Consequences

- A redeploy or a VM reboot ends every game in progress. That is accepted: "always
  available" means the server is reachable, not that a round survives a restart.
- One process holds all state, so the service runs as a single instance. Memory is bounded
  by caps instead: rooms (1,000 total, 10 per address), players per room (50), payload size.
- No personal data is stored, so there is nothing to secure at rest or to delete on request.
- Adding persistence would be a reversal of this record, not a feature.
