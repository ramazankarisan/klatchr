# 0005 — Reconnect by secret token within a grace window

**Status:** accepted · origin: [plan-7](../plans/plan-7.md), tuned in [plan-15](../plans/plan-15.md)

## Context

Phones lock, switch between Wi-Fi and mobile data, and get closed mid-round. Without
accounts (see [0003](0003-in-memory-rooms.md)), the server still has to know that a new
socket is the same player.

## Decision

- A join mints a player id and a secret reconnect token; opening a room mints a host
  token. Resuming with the token reclaims the seat. Nicknames are display only.
- A dropped seat is held for a grace window: 3 minutes for players, 60 seconds for the host.
  The room closes when the host's window expires.
- Resuming on a second device supersedes the first: the old socket is told `SUPERSEDED`
  and closed, and does not reconnect.
- Dead sockets are found actively: a 20 s server heartbeat, and a 40 s client watchdog that
  also probes when a tab wakes or the network returns.

## Consequences

- A player can lock their phone between rounds and come back into the same seat.
- The token is the only credential and is never shown: a player's is kept per room in
  localStorage, the host's per tab in sessionStorage.
- A player who leaves mid-round forfeits that round; their earlier total is parked by
  nickname so a same-name rejoin gets it back.
- Timers live in the server session, outside the pure reducers.
