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
}

type HostGameView = CollectHostView | GuessHostView | RevealView;
type PlayerGameView = CollectPlayerView | GuessPlayerView | RevealView;

function phaseOf(view: unknown): string | null {
  if (typeof view === 'object' && view !== null && 'phase' in view) {
    const { phase } = view as { phase: unknown };
    return typeof phase === 'string' ? phase : null;
  }
  return null;
}

const PHASES = new Set(['collect', 'guess', 'reveal']);

export function asHostView(view: unknown): HostGameView | null {
  const phase = phaseOf(view);
  return phase !== null && PHASES.has(phase) ? (view as HostGameView) : null;
}

export function asPlayerView(view: unknown): PlayerGameView | null {
  const phase = phaseOf(view);
  return phase !== null && PHASES.has(phase) ? (view as PlayerGameView) : null;
}
