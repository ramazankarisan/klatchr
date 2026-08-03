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
  /**
   * Fire `callback` after `ms`, returning a cancel handle. The disconnect grace
   * timer (a dropped socket keeps its slot for a window, then is reaped) lives
   * here so tests can drive it deterministically instead of waiting on the wall.
   */
  schedule(callback: () => void, ms: number): () => void;
}

export function realDeps(): ServerDeps {
  return {
    roomDeps: { random: () => Math.random(), id: () => randomUUID(), secret: () => randomUUID() },
    // `round` is a baseline — the engine's startGame injects the real round per game.
    gameDeps: { random: () => Math.random(), now: () => Date.now(), round: 0 },
    schedule: (callback, ms) => {
      const handle = setTimeout(callback, ms);
      return () => clearTimeout(handle);
    },
  };
}
