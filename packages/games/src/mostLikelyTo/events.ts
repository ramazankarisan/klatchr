import type { PlayerId } from '@klatchr/core';

/**
 * The game's own events. `playerId` is the server-verified actor (stamped from
 * the authenticated connection before forwarding; the pure reducer trusts it).
 * Self-vote is allowed (toggle A), so `target` may equal `playerId`.
 */
export type MLTEvent =
  | { type: 'vote'; playerId: PlayerId; target: PlayerId }
  | { type: 'advance'; from: 'vote' };
