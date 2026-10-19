import type { Viewer } from '@klatchr/core';
import type { ClientMessage, ServerMessage } from '@klatchr/protocol';
import type { Action, ViewFrame } from './types.js';

/* The pure half of the socket transport: wire <-> app mapping, no state. */

/**
 * Server errors after which reconnecting can only do harm, so the transport stops for
 * good: the seat moved to another device (reconnecting would steal it back, and the two
 * would fight forever), the room is gone (a retry could even join a stranger's room that
 * reused the code), or the server is full. The screen shows its recover card instead.
 */
export const TERMINAL = new Set([
  'SUPERSEDED',
  'ROOM_CLOSED',
  'NO_SUCH_ROOM',
  'BAD_HOST_TOKEN',
  'SERVER_FULL',
  'TOO_MANY_ROOMS',
  // A refused join never binds the socket, so retrying would only repeat it — and if a
  // seat later freed up, silently seat a ghost the user had already walked away from.
  'ROOM_FULL',
  'EMPTY_NICKNAME',
  'JOIN_FAILED',
]);

/** The app frame for one wire frame, stamped with this transport's own viewer. */
export function toFrame(
  frame: Extract<ServerMessage, { type: 'frame' }>,
  viewer: Viewer,
): ViewFrame {
  return {
    code: frame.code,
    phase: frame.phase,
    viewer,
    players: frame.players,
    selectedGameId: frame.selectedGameId,
    gameView: frame.gameView,
    scores: frame.scores,
    sessionScores: frame.sessionScores,
    round: frame.round,
    roundsTotal: frame.roundsTotal,
  };
}

/** The wire message for one app action, addressed to the room `code`. */
export function toWire(action: Action, code: string): ClientMessage {
  switch (action.type) {
    case 'selectGame':
      return { type: 'host', code, action: 'selectGame', gameId: action.gameId };
    case 'configureGame':
      return { type: 'host', code, action: 'configureGame', config: action.config };
    case 'startGame':
      return { type: 'host', code, action: 'startGame' };
    case 'endGame':
      return { type: 'host', code, action: 'endGame' };
    case 'leave':
      return { type: 'leave', code };
    case 'gameEvent':
      // `?? null` pins the type non-undefined, which the wire schema requires
      // (a play must carry an event); real game events are never undefined.
      return { type: 'play', code, event: action.event ?? null };
  }
}
