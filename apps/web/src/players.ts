import type { PublicPlayer } from './transport/types.js';

/** Display name for a player id. A left/unknown id falls back to a neutral label,
 * never the raw opaque id (B6 — that leaked a long id as a "name" on the scoreboard). */
export function nameOf(id: string, players: readonly PublicPlayer[]): string {
  return players.find((p) => p.id === id)?.nickname ?? '(left)';
}
