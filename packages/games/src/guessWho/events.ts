import type { PlayerId } from '@klatchr/core';

/**
 * The game's own events. `playerId` is the server-verified actor (stamped from
 * the authenticated connection before forwarding); the pure reducer trusts it.
 */
export type GWEvent =
  | { type: 'submit'; playerId: PlayerId; text: string }
  | { type: 'guess'; playerId: PlayerId; cardId: string; author: PlayerId }
  | { type: 'advance'; from: 'collect' | 'guess' };
