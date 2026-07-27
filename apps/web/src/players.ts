import type { PublicPlayer } from './transport/types.js';

/** Display name for a player id, falling back to the id if the roster lacks it. */
export function nameOf(id: string, players: readonly PublicPlayer[]): string {
  return players.find((p) => p.id === id)?.nickname ?? id;
}
