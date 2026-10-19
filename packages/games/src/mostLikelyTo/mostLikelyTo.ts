import type { Game, GameDeps, GameError, Player, Result, RosterEvent } from '@klatchr/core';
import { err, isRecord, ok } from '@klatchr/core';
import { MALFORMED_EVENT, isRosterEvent, strings } from '../eventGuard.js';
import { choosePrompt, promptCount } from '../promptConfig.js';
import type { MLTEvent } from './events.js';
import { PROMPTS } from './prompts.js';
import { tally } from './scoring.js';
import type { MLTState } from './state.js';
import { viewFor } from './view.js';

function init(active: readonly Player[], deps: GameDeps, config?: unknown): MLTState {
  const prompt = choosePrompt(config, deps, PROMPTS);
  return { phase: 'vote', prompt, roster: active.map((p) => p.id), votes: {} };
}

/** The shape check for an inbound event — the wire carries it as `unknown`. */
function isEvent(event: unknown): event is MLTEvent | RosterEvent {
  if (!isRecord(event)) {
    return false;
  }
  switch (event.type) {
    case 'vote':
      return strings(event, 'playerId', 'target');
    case 'advance':
      return event.from === 'vote';
    default:
      return isRosterEvent(event);
  }
}

function reduce(state: MLTState, event: MLTEvent | RosterEvent): Result<MLTState, GameError> {
  if (!isEvent(event)) {
    return err(MALFORMED_EVENT); // unknown type or wrong field types — refused, never thrown
  }
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
  maxPlayers: 20, // D3 (Cycle 13): voting a 20-name list scales; guessing 20 cards does not, so guessWho stays 12
  init,
  reduce,
  view: viewFor,
  scores: tally,
  isComplete: (state) => state.phase === 'results',
  roundCount: (config) => promptCount(config, PROMPTS),
};
