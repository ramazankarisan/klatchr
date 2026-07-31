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
      return revealView(state, viewer);
  }
}

function collectView(state: GWState, viewer: Viewer) {
  // Resolved = answered OR skipped (B4) — the host counts both as "done".
  const resolved = [...new Set([...Object.keys(state.drafts), ...state.skipped])];
  const progress = { submittedCount: resolved.length, total: state.roster.length };
  if (viewer.role === 'host') {
    return { phase: 'collect', prompt: state.prompt, submitted: resolved, ...progress }; // who, never the text
  }
  return {
    phase: 'collect',
    prompt: state.prompt,
    youSubmitted: viewer.id in state.drafts,
    youSkipped: state.skipped.includes(viewer.id),
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
    // A player may know *its own* card id — it authored that answer, so this
    // reveals nothing hidden. Lets the phone mark "your card" without matching
    // on text (identical answers would collide) and never offer it for guessing.
    yourCardId: state.cards.find((card) => card.authorId === viewer.id)?.id,
  };
}

function revealView(state: GWState, viewer: Viewer) {
  const base = { phase: 'reveal', prompt: state.prompt, cards: state.cards, scores: tally(state) };
  if (viewer.role === 'host') {
    return base; // the shared screen shows the truth, never any one player's guesses
  }
  // F9: hand a player back *their own* guesses so the phone can show what they
  // guessed vs the truth per card. Only this viewer's — never anyone else's.
  return { ...base, myGuesses: state.guesses[viewer.id] ?? {} };
}
