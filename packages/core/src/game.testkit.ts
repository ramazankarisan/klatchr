import type { GameDeps, RoomDeps } from './deps.js';
import type { AnyGame } from './game.js';
import { ok } from './result.js';

/** Deterministic room deps: fixed random, sequential ids. */
export function stubRoomDeps(): RoomDeps {
  let n = 0;
  return {
    random: () => 0,
    id: () => {
      n += 1;
      return `p${n}`;
    },
  };
}

export function stubGameDeps(): GameDeps {
  return { random: () => 0, now: () => 0 };
}

/** A minimal Game test-double. Override any field to shape behaviour per test. */
export function stubGame(overrides: Partial<AnyGame> = {}): AnyGame {
  return {
    id: 'stub',
    name: 'Stub',
    description: 'test double',
    minPlayers: 2,
    maxPlayers: 12,
    init: () => ({ moves: 0 }),
    reduce: (state) => ok(state),
    view: () => ({}),
    scores: () => [],
    isComplete: () => false,
    ...overrides,
  };
}
