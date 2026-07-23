import type { AnyGame } from './game.js';

export interface Registry {
  has(id: string): boolean;
  get(id: string): AnyGame | undefined;
  list(): readonly AnyGame[];
}

/** Build a game registry by injection. Later ids win on a duplicate. */
export function createRegistry(games: readonly AnyGame[]): Registry {
  const byId = new Map<string, AnyGame>();
  for (const game of games) {
    byId.set(game.id, game);
  }
  return {
    has: (id) => byId.has(id),
    get: (id) => byId.get(id),
    list: () => [...byId.values()],
  };
}
