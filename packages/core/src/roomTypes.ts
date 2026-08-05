import type { GameDeps, RoomDeps } from './deps.js';
import type { Player } from './ids.js';
import type { Registry } from './registry.js';

export type Phase = 'LOBBY' | 'IN_GAME' | 'SCORES';

export interface Room {
  code: string;
  hostId: string;
  phase: Phase;
  players: readonly Player[];
  // playerId -> reconnect secret. Kept off the Player (and so out of every view/frame)
  // so it can never leak to a game or another viewer; the server reads it to mint a
  // `joined`, and matches it via `playerIdForToken` on resume. Never broadcast.
  tokens: Readonly<Record<string, string>>;
  selectedGameId: string | null;
  gameState: unknown;
  closed: boolean;
  // Cross-round session tally (S6): playerId -> cumulative points. The room folds
  // each round's `game.scores` into this on entry to SCORES; games never see it —
  // scoring the *night* is a platform concern, not a per-game one. Keyed by id so a
  // leaver/rejoiner keeps their total (D2).
  sessionScores: Readonly<Record<string, number>>;
  // How many rounds have been started this session (each `startGame` is a round).
  round: number;
  // Host-authored game setup (Cycle 11), opaque to the room: the host sends it via
  // `configureGame`, the room stores it and hands it to `game.init` each round, and
  // only the game reads inside it (same opaque discipline as `gameState`). `undefined`
  // ⇒ the game uses its built-in default. Reset when the selected game changes.
  gameConfig: unknown;
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
  | 'SESSION_COMPLETE'
  | 'WRONG_PHASE';

export interface RoomError {
  code: RoomErrorCode;
  message?: string;
}

export type RoomEvent =
  | { type: 'join'; nickname: string; reconnectToken?: string }
  | { type: 'leave' }
  | { type: 'selectGame'; gameId: string }
  | { type: 'configureGame'; config: unknown }
  | { type: 'startGame' }
  | { type: 'gameEvent'; event: unknown }
  | { type: 'endGame' };

export interface ReduceContext {
  registry: Registry;
  roomDeps: RoomDeps; // id() for new players
  gameDeps: GameDeps; // handed to game.init
}
