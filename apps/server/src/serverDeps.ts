import { randomUUID } from 'node:crypto';
import type { GameDeps, RoomDeps } from '@klatchr/core';

/**
 * The non-deterministic sources injected at the server boundary. `core`/`games`
 * are pure and forbid `Math.random`/`Date.now`; the server is where the real
 * clock and RNG legitimately live (behind these deps, so tests can inject their
 * own if they need reproducibility).
 */
export interface ServerDeps {
  roomDeps: RoomDeps;
  gameDeps: GameDeps;
}

export function realDeps(): ServerDeps {
  return {
    roomDeps: { random: () => Math.random(), id: () => randomUUID() },
    gameDeps: { random: () => Math.random(), now: () => Date.now() },
  };
}
