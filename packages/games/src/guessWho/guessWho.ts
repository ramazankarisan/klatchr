import type { Game, GameDeps, GameError, Player, Result, RosterEvent } from '@klatchr/core';
import { boundedText, err, isRecord, ok } from '@klatchr/core';
import { MALFORMED_EVENT, isRosterEvent, strings } from '../eventGuard.js';
import { choosePrompt, promptCount } from '../promptConfig.js';
import { departed } from '../roster.js';
import { authors } from './authors.js';
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
    left: [],
    salt: Math.floor(deps.random() * 2 ** 32),
  };
}

/** One answer's cap, in visible characters — it is shown on every screen. */
export const MAX_ANSWER_LEN = 200;

/** The shape check for an inbound event — the wire carries it as `unknown`. */
function isEvent(event: unknown): event is GWEvent | RosterEvent {
  if (!isRecord(event)) {
    return false;
  }
  switch (event.type) {
    case 'submit':
      return strings(event, 'playerId', 'text');
    case 'skip':
      return strings(event, 'playerId');
    case 'guess':
      return strings(event, 'playerId', 'cardId', 'author');
    case 'advance':
      return event.from === 'collect' || event.from === 'guess';
    default:
      return isRosterEvent(event);
  }
}

function reduce(state: GWState, event: GWEvent | RosterEvent): Result<GWState, GameError> {
  if (!isEvent(event)) {
    return err(MALFORMED_EVENT); // unknown type or wrong field types — refused, never thrown
  }
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
      // Keeps whatever they already submitted (their card stays guessable), but they
      // forfeit the round and no longer hold up the room's progress.
      return ok(departed(state, event.id));
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
  // Trim and cap (never splitting an emoji); a blank or invisible-only answer would be
  // an empty card everyone must still guess, so it is refused — the player can skip.
  const text = boundedText(event.text, MAX_ANSWER_LEN);
  if (text.length === 0) {
    return err({ code: 'EMPTY_ANSWER' });
  }
  return ok({ ...state, drafts: { ...state.drafts, [event.playerId]: text } });
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
  if (!authors(state).includes(event.author)) {
    return err({ code: 'NOT_A_PLAYER' });
  }
  const prior = state.guesses[event.playerId] ?? {};
  return ok({
    ...state,
    guesses: { ...state.guesses, [event.playerId]: { ...prior, [event.cardId]: event.author } },
  });
}

/**
 * Freeze drafts into anonymised cards, ordered by text so the order carries no author
 * signal. Identical answers ("pizza" twice) tie on text; breaking the tie by author id
 * would reveal who wrote which (ids are public in every roster), so the tie is broken
 * by a hash of the id salted with the round's random salt. Pure: the salt came from
 * `deps.random` at init.
 */
function buildCards(state: GWState): readonly AnswerCard[] {
  const tie = (id: string): number => fnv1a(`${state.salt}:${id}`);
  const entries = Object.entries(state.drafts).sort(
    ([aId, aText], [bId, bText]) => aText.localeCompare(bText) || tie(aId) - tie(bId),
  );
  return entries.map(([authorId, text], i) => ({ id: `c${i}`, text, authorId }));
}

/** FNV-1a, 32-bit — a small deterministic string hash (not for security). */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
  }
  return hash;
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
