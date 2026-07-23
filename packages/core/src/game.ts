import type { GameDeps } from './deps.js';
import type { Player, PlayerId, Viewer } from './ids.js';
import type { Result } from './result.js';

export interface Score {
  playerId: PlayerId;
  points: number;
}

export interface GameError {
  code: string;
  message?: string;
}

/** Room-authored roster facts, forwarded into a game's reduce while IN_GAME. */
export type RosterEvent =
  | { type: 'playerJoined'; player: Player }
  | { type: 'playerLeft'; id: PlayerId };

/** Which social setting a game is built for — drives the picker (E4). */
export type GameContext = 'teams' | 'strangers';

export interface Game<TState, TEvent> {
  id: string;
  name: string;
  description: string;
  contexts?: readonly GameContext[]; // omitted ⇒ shown in every context
  minPlayers: number;
  maxPlayers: number;
  init(players: readonly Player[], deps: GameDeps, config?: unknown): TState;
  reduce(state: TState, event: TEvent | RosterEvent): Result<TState, GameError>;
  view(state: TState, viewer: Viewer): unknown;
  scores(state: TState): Score[];
  isComplete(state: TState): boolean;
}

/** A game with its type parameters erased — how the registry and room hold it. */
export type AnyGame = Game<unknown, unknown>;
