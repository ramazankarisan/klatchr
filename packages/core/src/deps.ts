/**
 * Non-deterministic sources for room creation. Injected at the boundary and
 * never called directly inside pure code (the purity gate forbids it).
 */
export interface RoomDeps {
  random(): number; // [0, 1) — room code
  id(): string; // opaque unique — playerId, hostId
}

/** Non-deterministic sources handed to a game's init/reduce. */
export interface GameDeps {
  random(): number;
  now(): number; // clock; unused in v1 (no timers) but part of the contract
}
