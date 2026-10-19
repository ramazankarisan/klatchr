# apps/server

Thin NestJS + `ws` host for the pure room reducer. Rooms live in memory.

- Parse every inbound message with the `packages/protocol` schema before
  touching it; never `as`-cast a payload.
- Never send raw game state. Every outbound frame carries
  `view(state, viewer)` for that recipient — `{ role: 'player', id }` for a
  phone, `{ role: 'host' }` for the shared screen.
- Only the host connection may send `advance` and host actions.
- Timers (grace, reap) live here, behind the injected `schedule` in
  `src/serverDeps.ts`, so tests drive them without the wall clock.

## Testing

- Unit tests use FakeConn connections against `RoomHub`.
- `src/gateway.integration.test.ts` runs real `ws` clients on an ephemeral port
  (wire JSON, real close → grace → reap, token resume). It runs in `pnpm gate`.
- `pnpm bots --players N [--chaos] [--game id] [--url ws://…]` is a manual
  load/soak against a running server (`bots.ts`); not part of gate or e2e.
