import type { ServerMessage } from '@klatchr/protocol';

/**
 * One live client link, as the room logic sees it. The gateway owns the raw
 * socket and serialises; the room only ever hands it an already-typed outbound
 * `ServerMessage`. This is the seam that keeps `RoomHub`/`RoomSession` free of
 * any transport (and so unit-testable with a fake connection).
 */
export interface Connection {
  send(message: ServerMessage): void;
}
