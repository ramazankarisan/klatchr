import { isRecord } from './text.js';

/* Platform-wide event conventions, checked structurally (events cross the wire as unknown). */

/** `{ type: 'advance' }` — the platform-wide phase-advance convention. */
export function isAdvance(event: unknown): boolean {
  return isRecord(event) && event.type === 'advance';
}

/** A roster fact type (see `RosterEvent` in game.ts). Only the room may send these into a game. */
export function isRosterType(event: unknown): boolean {
  return isRecord(event) && (event.type === 'playerJoined' || event.type === 'playerLeft');
}
