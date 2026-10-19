import type { Viewer } from '@klatchr/core';
import { candidates, tally } from './scoring.js';
import type { MLTState } from './state.js';

/**
 * The redaction boundary. Returns only what `viewer` may see. During `vote` no
 * one sees another player's target or any running tally — the host screen
 * (shared) is the strictest case, since a live tally there would let the room
 * bandwagon. At `results` only the aggregate tally is exposed, never the
 * voter->target map (toggle B).
 */
export function viewFor(state: MLTState, viewer: Viewer): unknown {
  if (state.phase === 'vote') {
    return voteView(state, viewer);
  }
  return resultsView(state);
}

function voteView(state: MLTState, viewer: Viewer) {
  // Progress counts every vote cast, including one for a player who has since left:
  // voiding it here would drop the count and tell the room someone voted for them.
  // Such a vote only stops counting in the tally.
  const voted = Object.keys(state.votes);
  // A leaver who never voted can't anymore — they don't count toward "everyone".
  const gone = state.left.filter((id) => !(id in state.votes)).length;
  const progress = { votedCount: voted.length, total: state.roster.length - gone };
  if (viewer.role === 'host') {
    // who has voted, never for whom
    return { phase: 'vote', prompt: state.prompt, voted, ...progress };
  }
  return {
    phase: 'vote',
    prompt: state.prompt,
    candidates: candidates(state),
    youVoted: voted.includes(viewer.id),
    // A player may see its *own* vote — that reveals nothing hidden.
    yourVote: state.votes[viewer.id],
    ...progress,
  };
}

function resultsView(state: MLTState) {
  return { phase: 'results', prompt: state.prompt, tally: tally(state) };
}
