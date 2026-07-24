import type { Viewer } from '@klatchr/core';
import { tally } from './scoring.js';
import type { GWState } from './state.js';

/**
 * The redaction boundary. Returns only what `viewer` may see. Author identity
 * is withheld until `reveal`; the host screen (shared) is the strictest case.
 */
export function viewFor(state: GWState, viewer: Viewer): unknown {
  switch (state.phase) {
    case 'collect':
      return collectView(state, viewer);
    case 'guess':
      return guessView(state, viewer);
    case 'reveal':
      return revealView(state);
  }
}

function collectView(state: GWState, viewer: Viewer) {
  const submitted = Object.keys(state.drafts);
  const progress = { submittedCount: submitted.length, total: state.roster.length };
  if (viewer.role === 'host') {
    return { phase: 'collect', prompt: state.prompt, submitted, ...progress }; // who, never the text
  }
  return {
    phase: 'collect',
    prompt: state.prompt,
    youSubmitted: submitted.includes(viewer.id),
    ...progress,
  };
}

function guessView(state: GWState, viewer: Viewer) {
  const cards = state.cards.map((card) => ({ id: card.id, text: card.text })); // authorId stripped
  if (viewer.role === 'host') {
    const guessed = Object.keys(state.guesses);
    return { phase: 'guess', prompt: state.prompt, cards, candidates: state.roster, guessed };
  }
  return {
    phase: 'guess',
    prompt: state.prompt,
    cards,
    candidates: state.roster,
    myGuesses: state.guesses[viewer.id] ?? {},
  };
}

function revealView(state: GWState) {
  return { phase: 'reveal', prompt: state.prompt, cards: state.cards, scores: tally(state) };
}
