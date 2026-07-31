import { MAX_PLAYERS } from './bounds.js';
import type { RoomDeps } from './deps.js';
import type { AnyGame, RosterEvent } from './game.js';
import type { Player, Viewer } from './ids.js';
import { normaliseNickname } from './nickname.js';
import { type Result, err, ok } from './result.js';
import { generateRoomCode } from './roomCode.js';
import type { Phase, ReduceContext, Room, RoomError, RoomEvent } from './roomTypes.js';
import { foldScores, omit, seatWindow } from './rounds.js';

export function createRoom(deps: RoomDeps, taken: ReadonlySet<string> = new Set()): Room {
  return {
    code: generateRoomCode(deps.random, taken),
    hostId: deps.id(),
    phase: 'LOBBY',
    players: [],
    tokens: {},
    selectedGameId: null,
    gameState: null,
    closed: false,
    sessionScores: {},
    round: 0,
  };
}

/** The player a reconnect token belongs to, or undefined — the resume credential check. */
export function playerIdForToken(room: Room, token: string): string | undefined {
  for (const [id, secret] of Object.entries(room.tokens)) {
    if (secret === token) {
      return id;
    }
  }
  return undefined;
}

export function roomReduce(
  room: Room,
  event: RoomEvent,
  actor: Viewer,
  ctx: ReduceContext,
): Result<Room, RoomError> {
  switch (event.type) {
    case 'join':
      return join(room, event.nickname, event.reconnectToken, ctx);
    case 'leave':
      return leave(room, actor, ctx);
    case 'selectGame':
      return selectGame(room, event.gameId, actor, ctx);
    case 'startGame':
      return startGame(room, actor, ctx);
    case 'gameEvent':
      return gameEvent(room, event.event, ctx);
    case 'endGame':
      return endGame(room, actor, ctx);
  }
}

function join(
  room: Room,
  rawNickname: string,
  reconnectToken: string | undefined,
  ctx: ReduceContext,
): Result<Room, RoomError> {
  const normalised = normaliseNickname(rawNickname);
  if (!normalised.ok) {
    return err({ code: 'EMPTY_NICKNAME' });
  }
  if (reconnectToken !== undefined && playerIdForToken(room, reconnectToken) !== undefined) {
    return ok(room); // E3: a valid secret resumes its slot, no duplicate, no roster event
  }
  if (room.players.length >= MAX_PLAYERS) {
    return err({ code: 'ROOM_FULL' }); // P1
  }
  const midGame = room.phase === 'IN_GAME';
  const player: Player = {
    id: ctx.roomDeps.id(),
    nickname: normalised.value.display, // E3: display-only, duplicates allowed
    joinedDuringGame: midGame,
    spectator: midGame, // E2: a mid-round joiner spectates until the next round
  };
  const players = [...room.players, player];
  const tokens = { ...room.tokens, [player.id]: ctx.roomDeps.secret() };
  const gameState = forwardRoster(room, { type: 'playerJoined', player }, ctx);
  return ok({ ...room, players, tokens, gameState });
}

function leave(room: Room, actor: Viewer, ctx: ReduceContext): Result<Room, RoomError> {
  if (actor.role === 'host') {
    return ok({ ...room, closed: true }); // P6: host leaves -> room closed
  }
  const players = room.players.filter((p) => p.id !== actor.id);
  // Drop the leaver's token + prune their tally (B6) — a left id can't resume, so both would linger.
  const tokens = omit(room.tokens, actor.id);
  const sessionScores = omit(room.sessionScores, actor.id);
  const gameState = forwardRoster(room, { type: 'playerLeft', id: actor.id }, ctx);
  const closed = players.length === 0; // P7: last player leaves -> discarded
  return ok({ ...room, players, tokens, gameState, closed, sessionScores });
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
  const fresh = gameId !== room.selectedGameId ? { round: 0, sessionScores: {} } : {}; // B2
  return ok({ ...room, phase: 'LOBBY', selectedGameId: gameId, ...fresh });
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
  const round = room.round + 1;
  const seated = seatWindow(room.players, game.maxPlayers, round); // E2 + X1 rotation
  const active = seated.filter((p) => !p.spectator);
  const gameState = game.init(active, ctx.gameDeps);
  return ok({ ...room, phase: 'IN_GAME', gameState, players: seated, round });
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
  const complete = game.isComplete(result.value); // fold once on entry to SCORES (S6)
  const phase: Phase = complete ? 'SCORES' : 'IN_GAME';
  const sessionScores = complete
    ? foldScores(room.sessionScores, game.scores(result.value))
    : room.sessionScores;
  return ok({ ...room, gameState: result.value, phase, sessionScores });
}

function endGame(room: Room, actor: Viewer, ctx: ReduceContext): Result<Room, RoomError> {
  const hostError = requireHost(actor);
  if (hostError !== null) {
    return err(hostError);
  }
  if (room.phase !== 'IN_GAME') {
    return err({ code: 'WRONG_PHASE' });
  }
  const game = activeGame(room, ctx);
  if (game === undefined) {
    return err({ code: 'GAME_NOT_REGISTERED' });
  }
  // Host abort still counts (D1): fold the partial round's scores, like a natural end.
  const sessionScores = foldScores(room.sessionScores, game.scores(room.gameState));
  return ok({ ...room, phase: 'SCORES', sessionScores });
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
