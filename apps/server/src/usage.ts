import type { Room } from '@klatchr/core';

/*
 * Usage logging (plan-16): counts only — rooms opened, players joined, rounds started and
 * which game. Never a nickname, answer, token, room code or address, so a line can be
 * kept in the VM's journal without holding anything personal.
 */

export type UsageLine =
  | { ev: 'room.open' }
  | { ev: 'player.join' }
  | { ev: 'round.start'; game: string; round: number; players: number };

export type UsageSink = (line: UsageLine) => void;

/** The `round.start` line when this transition started a round, else null. */
export function roundStarted(before: Room, after: Room): UsageLine | null {
  if (after.round <= before.round || after.selectedGameId === null) {
    return null;
  }
  return {
    ev: 'round.start',
    game: after.selectedGameId,
    round: after.round,
    players: after.players.length,
  };
}

/** The production sink: one `usage {json}` line on stdout, stamped with the time. */
export const stdoutUsage: UsageSink = (line) => {
  console.log(`usage ${JSON.stringify({ t: new Date().toISOString(), ...line })}`);
};
