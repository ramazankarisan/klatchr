import type { GameDeps, RoomDeps } from './deps.js';
import type { Player } from './ids.js';
import type { Registry } from './registry.js';

export type Phase = 'LOBBY' | 'IN_GAME' | 'SCORES';

export interface Room {
  code: string;
  hostId: string;
  phase: Phase;
  players: readonly Player[];
  selectedGameId: string | null;
  gameState: unknown;
  closed: boolean;
}

export type RoomErrorCode =
  | 'ROOM_FULL'
  | 'NOT_HOST'
  | 'GAME_NOT_REGISTERED'
  | 'BELOW_MIN_PLAYERS'
  | 'NO_GAME_SELECTED'
  | 'GAME_EVENT_OUTSIDE_GAME'
  | 'GAME_REJECTED'
  | 'EMPTY_NICKNAME'
  | 'WRONG_PHASE';

export interface RoomError {
  code: RoomErrorCode;
  message?: string;
}

export type RoomEvent =
  | { type: 'join'; nickname: string }
  | { type: 'leave' }
  | { type: 'selectGame'; gameId: string }
  | { type: 'startGame' }
  | { type: 'gameEvent'; event: unknown }
  | { type: 'endGame' };

export interface ReduceContext {
  registry: Registry;
  roomDeps: RoomDeps; // id() for new players
  gameDeps: GameDeps; // handed to game.init
}
