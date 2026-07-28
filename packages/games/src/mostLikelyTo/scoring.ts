import type { Score } from '@klatchr/core';
import type { MLTState } from './state.js';

/**
 * The result tally: votes *received* per roster player. Public by nature (the
 * whole room sees it at results). Counts only — who voted for whom is never
 * exposed (toggle B). A self-vote counts like any other.
 */
export function tally(state: MLTState): Score[] {
  const targets = Object.values(state.votes);
  return state.roster.map((playerId) => ({
    playerId,
    points: targets.filter((target) => target === playerId).length,
  }));
}
