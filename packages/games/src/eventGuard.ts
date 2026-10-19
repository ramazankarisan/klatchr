import { type RosterEvent, isRecord } from '@klatchr/core';

/*
 * Structural guards for a game's inbound events. A `play.event` crosses the wire as
 * `unknown` (the protocol keeps it opaque), so each game checks the shape itself
 * before its reducer touches a field — a malformed event is a typed rejection,
 * never a throw that would take the server down. Type predicates, never `as`.
 */

/** The room-authored roster facts (trusted, but checked the same way — one path). */
export function isRosterEvent(event: Record<string, unknown>): event is RosterEvent {
  if (event.type === 'playerLeft') {
    return typeof event.id === 'string';
  }
  if (event.type === 'playerJoined') {
    const player = event.player;
    return (
      isRecord(player) &&
      typeof player.id === 'string' &&
      typeof player.nickname === 'string' &&
      typeof player.joinedDuringGame === 'boolean' &&
      typeof player.spectator === 'boolean'
    );
  }
  return false;
}

/** True when every named field is a string. */
export function strings(event: Record<string, unknown>, ...keys: readonly string[]): boolean {
  return keys.every((key) => typeof event[key] === 'string');
}

export const MALFORMED_EVENT = { code: 'MALFORMED_EVENT' } as const;
