import type { Score } from '@klatchr/core';
import type { MLTState } from './state.js';

/** Who can still be voted for: the seated roster minus anyone who left. */
export function candidates(state: MLTState): readonly string[] {
  return state.roster.filter((id) => !state.left.includes(id));
}

/** The votes that still count in the tally: any whose target has left is void. */
function liveVotes(state: MLTState): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(state.votes).filter(([, target]) => !state.left.includes(target)),
  );
}

/**
 * The result tally: votes *received* per roster player. Public by nature (the
 * whole room sees it at results). Counts only — who voted for whom is never
 * exposed (toggle B). A self-vote counts like any other.
 */
export function tally(state: MLTState): Score[] {
  const targets = Object.values(liveVotes(state));
  return candidates(state).map((playerId) => ({
    playerId,
    points: targets.filter((target) => target === playerId).length,
  }));
}
