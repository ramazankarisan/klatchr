import type { Viewer } from '@klatchr/core';
import { tally } from './scoring.js';
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
  const voted = Object.keys(state.votes);
  const progress = { votedCount: voted.length, total: state.roster.length };
  if (viewer.role === 'host') {
    // who has voted, never for whom
    return { phase: 'vote', prompt: state.prompt, voted, ...progress };
  }
  return {
    phase: 'vote',
    prompt: state.prompt,
    candidates: state.roster,
    youVoted: voted.includes(viewer.id),
    // A player may see its *own* vote — that reveals nothing hidden.
    yourVote: state.votes[viewer.id],
    ...progress,
  };
}

function resultsView(state: MLTState) {
  return { phase: 'results', prompt: state.prompt, tally: tally(state) };
}
