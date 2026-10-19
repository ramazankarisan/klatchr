import { phaseNarrower } from '../phaseGuard.js';
import type { HostStep } from '../viewProps.js';

/**
 * Web-side types for `guessWho.view(...)` output. The engine returns `unknown`
 * across the transport boundary; these mirror the shapes and the guards narrow
 * them by their `phase` discriminant. Host and player see different fields, so
 * they narrow against separate unions.
 */
export interface GuessCard {
  id: string;
  text: string;
}

interface CollectHostView {
  phase: 'collect';
  prompt: string;
  submitted: readonly string[];
  submittedCount: number;
  total: number;
}
interface CollectPlayerView {
  phase: 'collect';
  prompt: string;
  youSubmitted: boolean;
  youSkipped: boolean; // B4: you chose to skip — locked, but you still guess
  submittedCount: number;
  total: number;
}
export interface GuessHostView {
  phase: 'guess';
  prompt: string;
  cards: readonly GuessCard[];
  candidates: readonly string[];
  guessed: readonly string[];
}
export interface GuessPlayerView {
  phase: 'guess';
  prompt: string;
  cards: readonly GuessCard[];
  candidates: readonly string[];
  myGuesses: Readonly<Record<string, string>>;
  yourCardId?: string; // this player's own card — mark it, never offer it for guessing
}
export interface RevealView {
  phase: 'reveal';
  prompt: string;
  cards: readonly { id: string; text: string; authorId: string }[];
  scores: readonly { playerId: string; points: number }[];
  // F9: the *viewer's own* guesses (cardId -> guessed authorId). Present for a
  // player, absent for the host (shared screen). Lets the phone show your pick vs. truth.
  myGuesses?: Readonly<Record<string, string>>;
}

type HostGameView = CollectHostView | GuessHostView | RevealView;
type PlayerGameView = CollectPlayerView | GuessPlayerView | RevealView;

const PHASES = new Set(['collect', 'guess', 'reveal']);

export const asHostView = phaseNarrower<HostGameView>(PHASES);
export const asPlayerView = phaseNarrower<PlayerGameView>(PHASES);

/** The host control step per phase: collect → guess → reveal → (new round). */
export function guessWhoStep(view: unknown): HostStep {
  const phase = asHostView(view)?.phase ?? null;
  if (phase === 'collect') {
    return { label: 'Show the cards', advance: { type: 'advance', from: 'collect' } };
  }
  if (phase === 'guess') {
    return { label: 'Reveal the authors', advance: { type: 'advance', from: 'guess' } };
  }
  return { label: 'New round', advance: null }; // reveal is terminal
}

/** The three-step how-to-play (UX-2), shown on the TV lobby and the phone waiting room. */
export const guessWhoHowTo = [
  'Everyone answers the question on their phone — nobody sees who wrote what.',
  'The answers go up on the big screen, with no names.',
  'Guess who wrote each one. A point per right guess.',
] as const;

/** Each phase in words, for the screen-reader phase announcement (UX-2). */
export const guessWhoPhaseNames: Readonly<Record<string, string>> = {
  collect: 'Answering',
  guess: 'Guessing who said it',
  reveal: 'The reveal',
};
