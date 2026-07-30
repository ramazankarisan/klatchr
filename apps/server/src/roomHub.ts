import { type Registry, createRegistry, createRoom } from '@klatchr/core';
import { games } from '@klatchr/games';
import { type ClientMessage, clientMessage } from '@klatchr/protocol';
import type { Connection } from './connection.js';
import { RoomSession } from './roomSession.js';
import { type ServerDeps, realDeps } from './serverDeps.js';

/**
 * The room registry and inbound router. One `RoomSession` per live room keyed by
 * code (rule 7 — in memory, discarded when empty); a connection belongs to at
 * most one session. Transport-agnostic: the gateway feeds it a `Connection` plus
 * raw wire strings, and this parses every inbound with `@klatchr/protocol`
 * (rule 2) before routing. All redaction/authority lives in the session.
 */
export class RoomHub {
  private readonly rooms = new Map<string, RoomSession>();
  private readonly sessionOf = new Map<Connection, RoomSession>();
  private readonly registry: Registry = createRegistry(games);

  constructor(private readonly deps: ServerDeps = realDeps()) {}

  /** True while the room is live — for tests and lifecycle assertions. */
  hasRoom(code: string): boolean {
    return this.rooms.has(code);
  }

  /** Parse one raw inbound wire string and route it, erroring on malformed input. */
  receive(conn: Connection, raw: string): void {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      conn.send({ type: 'error', code: '', message: 'MALFORMED_JSON' });
      return;
    }
    const parsed = clientMessage.safeParse(json);
    if (!parsed.success) {
      conn.send({ type: 'error', code: '', message: 'MALFORMED_MESSAGE' });
      return;
    }
    this.handle(conn, parsed.data);
  }

  /** Route one already-parsed message. */
  handle(conn: Connection, message: ClientMessage): void {
    switch (message.type) {
      case 'open':
        this.open(conn);
        return;
      case 'join':
        this.joinRoom(conn, message.code, message.nickname, message.reconnectToken);
        return;
      case 'resumeHost':
        this.resumeHostRoom(conn, message.code, message.hostToken);
        return;
      case 'host':
        this.route(conn, message.code, (s) => s.hostAction(conn, message.action, message.gameId));
        return;
      case 'play':
        this.route(conn, message.code, (s) => s.play(conn, message.event));
        return;
      case 'leave': {
        const session = this.sessionOf.get(conn);
        this.sessionOf.delete(conn);
        if (session === undefined) {
          conn.send({ type: 'error', code: message.code, message: 'NOT_IN_ROOM' });
          return;
        }
        session.leave(conn);
        return;
      }
      case 'ping':
        return; // keepalive (F3): the traffic is the point; nothing to do
    }
  }

  /** A dropped socket leaves whatever room it was in (and may empty it). */
  disconnect(conn: Connection): void {
    const session = this.sessionOf.get(conn);
    this.sessionOf.delete(conn);
    session?.disconnect(conn);
  }

  private open(conn: Connection): void {
    if (this.sessionOf.has(conn)) {
      conn.send({ type: 'error', code: '', message: 'ALREADY_IN_ROOM' });
      return;
    }
    const room = createRoom(this.deps.roomDeps, new Set(this.rooms.keys()));
    const session = new RoomSession(room, this.registry, this.deps, (code, conns) => {
      this.rooms.delete(code);
      // Unbind every connection closed out with the room, so a bystander whose
      // room vanished under them can open or join a new one (not ALREADY_IN_ROOM).
      for (const conn of conns) {
        this.sessionOf.delete(conn);
      }
    });
    this.rooms.set(room.code, session);
    this.sessionOf.set(conn, session);
    session.addHost(conn);
  }

  private joinRoom(
    conn: Connection,
    code: string,
    nickname: string,
    reconnectToken?: string,
  ): void {
    // Bind only on a real join, so a rejected join (full room, empty nickname)
    // does not leave the connection falsely attached to the session.
    this.attachToRoom(conn, code, (session) => session.join(conn, nickname, reconnectToken));
  }

  /** A reloaded host re-attaches to its own room by code + secret (7.1). Mirrors joinRoom. */
  private resumeHostRoom(conn: Connection, code: string, hostToken: string): void {
    // Bind only on a verified token, so a wrong-token attempt stays unbound.
    this.attachToRoom(conn, code, (session) => session.resumeHost(conn, hostToken));
  }

  /**
   * Attach a not-yet-bound connection to an existing room by code, binding it to
   * the session only if `attach` accepts (a real join / a verified host resume).
   * Shared by `join` and `resumeHost` — the fresh-connection entry paths.
   */
  private attachToRoom(
    conn: Connection,
    code: string,
    attach: (session: RoomSession) => boolean,
  ): void {
    if (this.sessionOf.has(conn)) {
      conn.send({ type: 'error', code, message: 'ALREADY_IN_ROOM' });
      return;
    }
    const session = this.rooms.get(code);
    if (session === undefined) {
      conn.send({ type: 'error', code, message: 'NO_SUCH_ROOM' });
      return;
    }
    if (attach(session)) {
      this.sessionOf.set(conn, session);
    }
  }

  private route(conn: Connection, code: string, action: (session: RoomSession) => void): void {
    const session = this.sessionOf.get(conn);
    if (session === undefined) {
      conn.send({ type: 'error', code, message: 'NOT_IN_ROOM' });
      return;
    }
    action(session);
  }
}
