import { MAX_PLAYERS, MIN_PLAYERS } from './bounds.js';
import type { AnyGame } from './game.js';

export interface Registry {
  has(id: string): boolean;
  get(id: string): AnyGame | undefined;
  list(): readonly AnyGame[];
}

/**
 * Build a game registry by injection. Later ids win on a duplicate. A game may
 * narrow the platform player bounds, never widen them; a game that violates
 * `MIN_PLAYERS <= minPlayers <= maxPlayers <= MAX_PLAYERS` is a wiring error and
 * fails loudly here (E2), not at runtime.
 */
export function createRegistry(games: readonly AnyGame[]): Registry {
  const byId = new Map<string, AnyGame>();
  for (const game of games) {
    assertBounds(game);
    byId.set(game.id, game);
  }
  return {
    has: (id) => byId.has(id),
    get: (id) => byId.get(id),
    list: () => [...byId.values()],
  };
}

function assertBounds(game: AnyGame): void {
  const { id, minPlayers, maxPlayers } = game;
  if (minPlayers < MIN_PLAYERS) {
    throw new Error(
      `game "${id}": minPlayers ${minPlayers} is below the platform MIN_PLAYERS (${MIN_PLAYERS})`,
    );
  }
  if (maxPlayers > MAX_PLAYERS) {
    throw new Error(
      `game "${id}": maxPlayers ${maxPlayers} exceeds the platform MAX_PLAYERS (${MAX_PLAYERS})`,
    );
  }
  if (minPlayers > maxPlayers) {
    throw new Error(`game "${id}": minPlayers ${minPlayers} exceeds its maxPlayers ${maxPlayers}`);
  }
}
