import type { Score } from '@klatchr/core';
import type { GWState } from './state.js';

/** +1 for each card whose author a player named correctly (no fooling bonus). A player
 * who left mid-round forfeits it, so they are not on the tally. */
export function tally(state: GWState): Score[] {
  return state.roster
    .filter((id) => !state.left.includes(id))
    .map((playerId) => {
      const mine = state.guesses[playerId] ?? {};
      let points = 0;
      for (const card of state.cards) {
        if (mine[card.id] === card.authorId) {
          points += 1;
        }
      }
      return { playerId, points };
    });
}
