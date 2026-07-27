import { z } from 'zod';

/**
 * Every client<->server message, defined once and parsed with zod at both
 * boundaries (rule 2). The server parses every inbound `clientMessage`; the
 * client parses every inbound `serverMessage`. Nothing is ever cast with `as`.
 *
 * The per-game view is carried opaquely as `gameView` / `event` (`z.unknown()`):
 * redaction already happened in `packages/games`, so the wire only validates the
 * envelope and forwards the already-redacted payload. The view registry narrows
 * it client-side.
 */

// ---- shared leaves ----
const roomCode = z.string(); // 4-letter code; existence/format is the server's call
const nickname = z.string(); // core normalises + rejects empty (EMPTY_NICKNAME)
const playerId = z.string();
const phase = z.enum(['LOBBY', 'IN_GAME', 'SCORES']);

const publicPlayer = z.object({
  id: playerId,
  nickname: z.string(),
  spectator: z.boolean(),
});

const score = z.object({
  playerId,
  points: z.number(),
});

// ---- inbound: client -> server ----
export const clientMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('open'), nickname }),
  z.object({ type: z.literal('join'), code: roomCode, nickname, reconnectId: playerId.optional() }),
  z.object({
    type: z.literal('host'),
    code: roomCode,
    action: z.enum(['selectGame', 'startGame', 'endGame']),
    gameId: z.string().optional(), // required only for selectGame; the server enforces that
  }),
  z.object({
    type: z.literal('play'),
    code: roomCode,
    // opaque per-game event, but a play with no event at all is malformed
    event: z.unknown().refine((v) => v !== undefined, 'a play must carry an event'),
  }),
  z.object({ type: z.literal('leave'), code: roomCode }),
]);
export type ClientMessage = z.infer<typeof clientMessage>;

// ---- outbound: server -> client ----
export const serverMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('joined'), code: roomCode, playerId }), // the reconnect handle
  z.object({
    type: z.literal('frame'),
    code: roomCode,
    phase,
    players: z.array(publicPlayer),
    selectedGameId: z.string().nullable(),
    // already redacted per viewer in packages/games; opaque but present (null when no game)
    gameView: z.unknown().refine((v) => v !== undefined, 'a frame must carry a gameView'),
    scores: z.array(score).nullable(),
  }),
  z.object({ type: z.literal('error'), code: z.string(), message: z.string().optional() }),
]);
export type ServerMessage = z.infer<typeof serverMessage>;
