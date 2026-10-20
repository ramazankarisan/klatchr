# apps/server

Thin NestJS + `ws` host for the pure room reducer. Rooms live in memory.

- Parse every inbound message with the `packages/protocol` schema before
  touching it; never `as`-cast a payload.
- Never send raw game state. Every outbound frame carries
  `view(state, viewer)` for that recipient — `{ role: 'player', id }` for a
  phone, `{ role: 'host' }` for the shared screen.
- Only the host connection may send `advance` and host actions.
- Timers (grace, reap) live here, behind the injected `schedule` in
  `src/serverDeps.ts`, so tests drive them without the wall clock. A dropped player
  keeps their seat for `PLAYER_GRACE_MS` (3 min), a dropped board for `HOST_GRACE_MS`.
- `src/socketServer.ts` keeps the public server healthy: heartbeat, handshake
  deadline, per-address cap, per-socket rate limit. `RoomHub` caps live rooms.
- Usage logging (`src/usage.ts`, plan-16) is an optional `ServerDeps.usage` sink: counts
  only, never names, answers, codes or addresses. Only the gateway wires stdout.
- A seat resumed on a second device supersedes the first: it gets `SUPERSEDED` and
  is closed. Clients treat that, and a gone room, as terminal — never reconnect.

## Testing

- Unit tests use FakeConn connections against `RoomHub`.
- `src/gateway.integration.test.ts` runs real `ws` clients on an ephemeral port
  (wire JSON, real close → grace → reap, token resume). It runs in `pnpm gate`.
- `pnpm bots --players N [--chaos] [--game id] [--url ws://…]` is a manual
  load/soak against a running server (`bots.ts`); not part of gate or e2e. Past 200
  bots, start the server with `MAX_CONNS_PER_IP` raised (one address, many sockets).
