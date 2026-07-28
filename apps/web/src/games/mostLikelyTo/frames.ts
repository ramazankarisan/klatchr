import { phaseNarrower } from '../phaseGuard.js';
import type { HostStep } from '../viewProps.js';

/**
 * Web-side types for `mostLikelyTo.view(...)` output. The engine returns
 * `unknown` across the transport boundary; these mirror the shapes and the
 * guards narrow them by their `phase` discriminant. Host and player see
 * different fields during vote, so they narrow against separate unions.
 */
export interface VoteHostView {
  phase: 'vote';
  prompt: string;
  voted: readonly string[]; // who has voted, never for whom
  votedCount: number;
  total: number;
}
export interface VotePlayerView {
  phase: 'vote';
  prompt: string;
  candidates: readonly string[];
  youVoted: boolean;
  yourVote?: string; // this player's own vote — safe to reflect back
  votedCount: number;
  total: number;
}
export interface ResultsView {
  phase: 'results';
  prompt: string;
  tally: readonly { playerId: string; points: number }[]; // votes received; counts only
}

type HostGameView = VoteHostView | ResultsView;
type PlayerGameView = VotePlayerView | ResultsView;

const PHASES = new Set(['vote', 'results']);

export const asHostView = phaseNarrower<HostGameView>(PHASES);
export const asPlayerView = phaseNarrower<PlayerGameView>(PHASES);

/** The host control step per phase: vote → results → (new round). */
export function mostLikelyToStep(view: unknown): HostStep {
  const phase = asHostView(view)?.phase ?? null;
  if (phase === 'vote') {
    return { label: 'Show the results', advance: { type: 'advance', from: 'vote' } };
  }
  return { label: 'New round', advance: null }; // results is terminal
}
