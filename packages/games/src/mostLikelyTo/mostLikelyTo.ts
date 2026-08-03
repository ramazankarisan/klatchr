import type { Game, GameDeps, GameError, Player, Result, RosterEvent } from '@klatchr/core';
import { err, ok } from '@klatchr/core';
import { choosePrompt } from '../promptConfig.js';
import type { MLTEvent } from './events.js';
import { PROMPTS } from './prompts.js';
import { tally } from './scoring.js';
import type { MLTState } from './state.js';
import { viewFor } from './view.js';

function init(active: readonly Player[], deps: GameDeps, config?: unknown): MLTState {
  const prompt = choosePrompt(config, deps, PROMPTS);
  return { phase: 'vote', prompt, roster: active.map((p) => p.id), votes: {} };
}

function reduce(state: MLTState, event: MLTEvent | RosterEvent): Result<MLTState, GameError> {
  switch (event.type) {
    case 'vote':
      return vote(state, event);
    case 'advance':
      return advance(state, event);
    case 'playerJoined':
      return ok(state); // E2: a mid-round joiner spectates — never enters the pool
    case 'playerLeft':
      return ok(state); // keeps whatever vote they cast; stays a candidate
  }
}

function vote(
  state: MLTState,
  event: Extract<MLTEvent, { type: 'vote' }>,
): Result<MLTState, GameError> {
  if (state.phase !== 'vote') {
    return err({ code: 'WRONG_PHASE' });
  }
  if (!state.roster.includes(event.playerId)) {
    return err({ code: 'NOT_PLAYING' }); // a spectator can't vote
  }
  if (!state.roster.includes(event.target)) {
    return err({ code: 'NOT_A_PLAYER' }); // must vote for a seated candidate (self allowed)
  }
  return ok({ ...state, votes: { ...state.votes, [event.playerId]: event.target } });
}

function advance(
  state: MLTState,
  event: Extract<MLTEvent, { type: 'advance' }>,
): Result<MLTState, GameError> {
  if (event.from !== state.phase) {
    return ok(state); // idempotent no-op on a phase mismatch (S3)
  }
  return ok({ ...state, phase: 'results' });
}

export const mostLikelyTo: Game<MLTState, MLTEvent> = {
  id: 'most-likely-to',
  name: 'Most Likely To',
  description: 'Everyone votes for who fits the prompt, then the tally is revealed.',
  contexts: ['teams', 'strangers'],
  minPlayers: 3,
  maxPlayers: 12,
  init,
  reduce,
  view: viewFor,
  scores: tally,
  isComplete: (state) => state.phase === 'results',
};
