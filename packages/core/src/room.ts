import { MAX_PLAYERS } from './bounds.js';
import type { RoomDeps } from './deps.js';
import type { AnyGame, RosterEvent } from './game.js';
import type { Player, Viewer } from './ids.js';
import { normaliseNickname } from './nickname.js';
import { type Result, err, ok } from './result.js';
import { generateRoomCode } from './roomCode.js';
import type { Phase, ReduceContext, Room, RoomError, RoomEvent } from './roomTypes.js';

export function createRoom(deps: RoomDeps, taken: ReadonlySet<string> = new Set()): Room {
  return {
    code: generateRoomCode(deps.random, taken),
    hostId: deps.id(),
    phase: 'LOBBY',
    players: [],
    selectedGameId: null,
    gameState: null,
    closed: false,
  };
}

export function roomReduce(
  room: Room,
  event: RoomEvent,
  actor: Viewer,
  ctx: ReduceContext,
): Result<Room, RoomError> {
  switch (event.type) {
    case 'join':
      return join(room, event.nickname, ctx);
    case 'leave':
      return leave(room, actor, ctx);
    case 'selectGame':
      return selectGame(room, event.gameId, actor, ctx);
    case 'startGame':
      return startGame(room, actor, ctx);
    case 'gameEvent':
      return gameEvent(room, event.event, ctx);
    case 'endGame':
      return endGame(room, actor);
  }
}

function join(room: Room, rawNickname: string, ctx: ReduceContext): Result<Room, RoomError> {
  const normalised = normaliseNickname(rawNickname);
  if (!normalised.ok) {
    return err({ code: 'EMPTY_NICKNAME' });
  }
  const { display, key } = normalised.value;
  const existing = room.players.find((p) => p.nickname.toLowerCase() === key);
  if (existing !== undefined) {
    return ok(room); // P2: rejoin resumes the same player, no duplicate
  }
  if (room.players.length >= MAX_PLAYERS) {
    return err({ code: 'ROOM_FULL' }); // P1
  }
  const player: Player = {
    id: ctx.roomDeps.id(),
    nickname: display,
    joinedDuringGame: room.phase === 'IN_GAME',
  };
  const players = [...room.players, player];
  const gameState = forwardRoster(room, { type: 'playerJoined', player }, ctx);
  return ok({ ...room, players, gameState });
}

function leave(room: Room, actor: Viewer, ctx: ReduceContext): Result<Room, RoomError> {
  if (actor.role === 'host') {
    return ok({ ...room, closed: true }); // P6: host leaves -> room closed
  }
  const players = room.players.filter((p) => p.id !== actor.id);
  const gameState = forwardRoster(room, { type: 'playerLeft', id: actor.id }, ctx);
  const closed = players.length === 0; // P7: last player leaves -> discarded
  return ok({ ...room, players, gameState, closed });
}

function selectGame(
  room: Room,
  gameId: string,
  actor: Viewer,
  ctx: ReduceContext,
): Result<Room, RoomError> {
  const hostError = requireHost(actor);
  if (hostError !== null) {
    return err(hostError);
  }
  if (!ctx.registry.has(gameId)) {
    return err({ code: 'GAME_NOT_REGISTERED' }); // P4
  }
  if (room.phase === 'IN_GAME') {
    return err({ code: 'WRONG_PHASE' });
  }
  return ok({ ...room, phase: 'LOBBY', selectedGameId: gameId });
}

function startGame(room: Room, actor: Viewer, ctx: ReduceContext): Result<Room, RoomError> {
  const hostError = requireHost(actor);
  if (hostError !== null) {
    return err(hostError);
  }
  if (room.phase === 'IN_GAME') {
    return err({ code: 'WRONG_PHASE' });
  }
  if (room.selectedGameId === null) {
    return err({ code: 'NO_GAME_SELECTED' });
  }
  const game = ctx.registry.get(room.selectedGameId);
  if (game === undefined) {
    return err({ code: 'GAME_NOT_REGISTERED' });
  }
  if (room.players.length < game.minPlayers) {
    return err({ code: 'BELOW_MIN_PLAYERS' }); // P3
  }
  const gameState = game.init(room.players, ctx.gameDeps);
  return ok({ ...room, phase: 'IN_GAME', gameState });
}

function gameEvent(room: Room, event: unknown, ctx: ReduceContext): Result<Room, RoomError> {
  if (room.phase !== 'IN_GAME') {
    return err({ code: 'GAME_EVENT_OUTSIDE_GAME' }); // P5
  }
  const game = activeGame(room, ctx);
  if (game === undefined) {
    return err({ code: 'GAME_NOT_REGISTERED' });
  }
  const result = game.reduce(room.gameState, event);
  if (!result.ok) {
    return err({ code: 'GAME_REJECTED', message: result.error.code });
  }
  const phase: Phase = game.isComplete(result.value) ? 'SCORES' : 'IN_GAME';
  return ok({ ...room, gameState: result.value, phase });
}

function endGame(room: Room, actor: Viewer): Result<Room, RoomError> {
  const hostError = requireHost(actor);
  if (hostError !== null) {
    return err(hostError);
  }
  if (room.phase !== 'IN_GAME') {
    return err({ code: 'WRONG_PHASE' });
  }
  return ok({ ...room, phase: 'SCORES' }); // host abort
}

function requireHost(actor: Viewer): RoomError | null {
  return actor.role === 'host' ? null : { code: 'NOT_HOST' };
}

function activeGame(room: Room, ctx: ReduceContext): AnyGame | undefined {
  return room.selectedGameId === null ? undefined : ctx.registry.get(room.selectedGameId);
}

function forwardRoster(room: Room, rosterEvent: RosterEvent, ctx: ReduceContext): unknown {
  if (room.phase !== 'IN_GAME') {
    return room.gameState;
  }
  const game = activeGame(room, ctx);
  if (game === undefined) {
    return room.gameState;
  }
  const result = game.reduce(room.gameState, rosterEvent);
  return result.ok ? result.value : room.gameState;
}
