import { type RoomEvent, isRecord } from '@klatchr/core';

/* Turning an authenticated inbound action into the core event the room reduces. */

export type HostAction = 'selectGame' | 'configureGame' | 'startGame' | 'endGame';

/** Map a host action to a core event; null iff selectGame arrived without a gameId. */
export function hostEvent(action: HostAction, gameId?: string, config?: unknown): RoomEvent | null {
  switch (action) {
    case 'selectGame':
      return gameId === undefined ? null : { type: 'selectGame', gameId };
    case 'configureGame':
      // Forwarded opaque — the room stores it, the game validates it. An absent config
      // is valid (clears the room back to the game's built-in default).
      return { type: 'configureGame', config };
    case 'startGame':
      return { type: 'startGame' };
    case 'endGame':
      return { type: 'endGame' };
  }
}

/** Overwrite any client-supplied playerId with the authenticated one (authority). */
export function stampPlayerId(event: unknown, playerId: string): unknown {
  return isRecord(event) ? { ...event, playerId } : event;
}
