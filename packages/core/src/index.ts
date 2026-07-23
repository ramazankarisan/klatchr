export { MAX_PLAYERS, MIN_PLAYERS } from './bounds.js';
export type { GameDeps, RoomDeps } from './deps.js';
export type { AnyGame, Game, GameError, RosterEvent, Score } from './game.js';
export type { Player, PlayerId, Viewer } from './ids.js';
export { type NormalisedNickname, normaliseNickname } from './nickname.js';
export { createRegistry, type Registry } from './registry.js';
export { type Result, err, ok } from './result.js';
export { generateRoomCode } from './roomCode.js';
export { createRoom, roomReduce } from './room.js';
export type {
  Phase,
  ReduceContext,
  Room,
  RoomError,
  RoomErrorCode,
  RoomEvent,
} from './roomTypes.js';
