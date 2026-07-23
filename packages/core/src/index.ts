/**
 * Platform-wide room-size bounds. A game may narrow these via its own
 * minPlayers / maxPlayers, never widen them. apps import these constants;
 * neither server nor web hardcodes a number of its own.
 */
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 12;
