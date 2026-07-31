import type { Score } from './game.js';
import type { Player } from './ids.js';

/**
 * Seat a rotating window of `maxPlayers` for this round (E2 + X1): overflow beyond
 * the window spectates, and the window advances by `maxPlayers` each round so
 * benched players are dealt in next time instead of forever. Round 1 (offset 0) is
 * join order, preserving the original first-N seating. `init` only sees the seats.
 */
export function seatWindow(
  players: readonly Player[],
  maxPlayers: number,
  round: number,
): Player[] {
  const n = players.length;
  const offset = n > maxPlayers ? ((round - 1) * maxPlayers) % n : 0;
  return players.map((p, i) => ({
    ...p,
    spectator: (i - offset + n) % n >= maxPlayers,
    joinedDuringGame: false,
  }));
}

/** A copy of `record` without `key` — used to drop a leaver's token + session score. */
export function omit<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));
}

/** Add a round's scores onto the running session tally, keyed by playerId (S6). */
export function foldScores(
  base: Readonly<Record<string, number>>,
  scores: readonly Score[],
): Record<string, number> {
  const next: Record<string, number> = { ...base };
  for (const score of scores) {
    next[score.playerId] = (next[score.playerId] ?? 0) + score.points;
  }
  return next;
}
