/**
 * Non-deterministic sources for room creation. Injected at the boundary and
 * never called directly inside pure code (the purity gate forbids it).
 */
export interface RoomDeps {
  random(): number; // [0, 1) — room code
  id(): string; // opaque unique — playerId, hostId (public: appears in rosters)
  secret(): string; // unguessable, distinct from id() — the reconnect token (never public)
}

/**
 * Ambient context handed to a game's `init`. `random`/`now` are the non-deterministic
 * sources; `round` is the 1-based index of the round being started, injected by the
 * room (a game can't count its own inits, so a round-aware game — e.g. one walking a
 * host-authored question set with no repeats — reads it here). `reduce` never sees deps.
 */
export interface GameDeps {
  random(): number;
  now(): number; // clock; unused in v1 (no timers) but part of the contract
  round: number; // 1-based round being started; drives round-aware init (Cycle 11)
}
