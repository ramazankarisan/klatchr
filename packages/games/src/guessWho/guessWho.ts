import type { Game, GameDeps, GameError, Player, Result, RosterEvent } from '@klatchr/core';
import { err, ok } from '@klatchr/core';
import { choosePrompt, promptCount } from '../promptConfig.js';
import type { GWEvent } from './events.js';
import { PROMPTS } from './prompts.js';
import { tally } from './scoring.js';
import type { AnswerCard, GWState } from './state.js';
import { viewFor } from './view.js';

function init(active: readonly Player[], deps: GameDeps, config?: unknown): GWState {
  const prompt = choosePrompt(config, deps, PROMPTS);
  return {
    phase: 'collect',
    prompt,
    roster: active.map((p) => p.id),
    drafts: {},
    skipped: [],
    cards: [],
    guesses: {},
  };
}

function reduce(state: GWState, event: GWEvent | RosterEvent): Result<GWState, GameError> {
  switch (event.type) {
    case 'submit':
      return submit(state, event);
    case 'skip':
      return skip(state, event);
    case 'guess':
      return guess(state, event);
    case 'advance':
      return advance(state, event);
    case 'playerJoined':
      return ok(state); // E2: a mid-round joiner spectates — never enters the pool
    case 'playerLeft':
      return ok(state); // keeps whatever they already submitted
  }
}

/** Both collect actions (submit, skip) require the collect phase and a roster
 * member — the one guard, so neither repeats it. Null when the actor may act. */
function collectGuard(state: GWState, playerId: string): GameError | null {
  if (state.phase !== 'collect') {
    return { code: 'WRONG_PHASE' };
  }
  if (!state.roster.includes(playerId)) {
    return { code: 'NOT_PLAYING' };
  }
  return null;
}

function submit(
  state: GWState,
  event: Extract<GWEvent, { type: 'submit' }>,
): Result<GWState, GameError> {
  const blocked = collectGuard(state, event.playerId);
  if (blocked !== null) {
    return err(blocked);
  }
  return ok({ ...state, drafts: { ...state.drafts, [event.playerId]: event.text } });
}

function skip(
  state: GWState,
  event: Extract<GWEvent, { type: 'skip' }>,
): Result<GWState, GameError> {
  const blocked = collectGuard(state, event.playerId);
  if (blocked !== null) {
    return err(blocked);
  }
  // B4: mark them resolved (no card) so the host counts them done. Idempotent; the
  // view unions drafts+skipped so no one is counted twice.
  if (state.skipped.includes(event.playerId)) {
    return ok(state);
  }
  return ok({ ...state, skipped: [...state.skipped, event.playerId] });
}

function advance(
  state: GWState,
  event: Extract<GWEvent, { type: 'advance' }>,
): Result<GWState, GameError> {
  if (event.from !== state.phase) {
    return ok(state); // idempotent no-op on a phase mismatch (S3)
  }
  if (state.phase === 'collect') {
    return ok({ ...state, phase: 'guess', cards: buildCards(state) });
  }
  return ok({ ...state, phase: 'reveal' });
}

function guess(
  state: GWState,
  event: Extract<GWEvent, { type: 'guess' }>,
): Result<GWState, GameError> {
  if (state.phase !== 'guess') {
    return err({ code: 'WRONG_PHASE' });
  }
  if (!state.roster.includes(event.playerId)) {
    return err({ code: 'NOT_PLAYING' });
  }
  const card = state.cards.find((c) => c.id === event.cardId);
  if (card === undefined) {
    return err({ code: 'NO_SUCH_CARD' });
  }
  if (card.authorId === event.playerId) {
    return err({ code: 'OWN_CARD' });
  }
  if (!state.roster.includes(event.author)) {
    return err({ code: 'NOT_A_PLAYER' });
  }
  const prior = state.guesses[event.playerId] ?? {};
  return ok({
    ...state,
    guesses: { ...state.guesses, [event.playerId]: { ...prior, [event.cardId]: event.author } },
  });
}

/**
 * Freeze drafts into anonymised cards, ordered by a (text, authorId) key so the
 * display order is decoupled from author and stable — no RNG (reduce is pure).
 * The exact collation is irrelevant to anonymity; it only needs to be a total
 * order that carries no author signal.
 */
function buildCards(state: GWState): readonly AnswerCard[] {
  const key = (id: string, text: string): string => `${text}|${id}`; // text, then id: a total order
  const entries = Object.entries(state.drafts).sort(([aId, aText], [bId, bText]) =>
    key(aId, aText).localeCompare(key(bId, bText)),
  );
  return entries.map(([authorId, text], i) => ({ id: `c${i}`, text, authorId }));
}

export const guessWho: Game<GWState, GWEvent> = {
  id: 'guess-who',
  name: 'Guess Who Said It',
  description: 'Everyone answers a prompt, then guesses who said which.',
  contexts: ['teams'],
  minPlayers: 3,
  maxPlayers: 12,
  init,
  reduce,
  view: viewFor,
  scores: tally,
  isComplete: (state) => state.phase === 'reveal',
  roundCount: (config) => promptCount(config, PROMPTS),
};
