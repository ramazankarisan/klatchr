import { type Registry, createRegistry, createRoom } from '@klatchr/core';
import { games } from '@klatchr/games';
import { type ClientMessage, clientMessage } from '@klatchr/protocol';
import type { Connection } from './connection.js';
import { RoomSession } from './roomSession.js';
import { type ServerDeps, realDeps } from './serverDeps.js';

/**
 * The room registry and inbound router. One `RoomSession` per live room keyed by
 * code (the no-persistence rule — in memory, discarded when empty); a connection belongs to at
 * most one session. Transport-agnostic: the gateway feeds it a `Connection` plus
 * raw wire strings, and this parses every inbound with `@klatchr/protocol`
 * (the parse-at-the-boundary rule) before routing. All redaction/authority lives in the session.
 */
/** The most live rooms one server holds — a public server must not let a script
 * open rooms until memory runs out. Generous for real use. */
const MAX_ROOMS = 1_000;
/** The most live rooms one client address may hold open as host, so one script can't
 * fill the server-wide cap (rooms with no players now stay open while their host is). */
const MAX_ROOMS_PER_ADDRESS = 10;

export class RoomHub {
  private readonly rooms = new Map<string, RoomSession>();
  private readonly sessionOf = new Map<Connection, RoomSession>();
  private readonly registry: Registry = createRegistry(games);

  constructor(
    private readonly deps: ServerDeps = realDeps(),
    private readonly limits: { maxRooms: number; maxRoomsPerAddress?: number } = {
      maxRooms: MAX_ROOMS,
      maxRoomsPerAddress: MAX_ROOMS_PER_ADDRESS,
    },
  ) {}

  // room code -> the address that opened it, and the live count per address.
  private readonly openedBy = new Map<string, string>();
  private readonly roomsPerAddress = new Map<string, number>();

  /** True once this connection has joined or opened a room (the handshake is done). */
  isBound(conn: Connection): boolean {
    return this.sessionOf.has(conn);
  }

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
        this.route(conn, message.code, (s) =>
          s.hostAction(conn, message.action, message.gameId, message.config),
        );
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
        conn.send({ type: 'pong' }); // keepalive (F3) + proof of life for the client
        return;
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
    if (this.rooms.size >= this.limits.maxRooms) {
      conn.send({ type: 'error', code: '', message: 'SERVER_FULL' });
      return;
    }
    const address = conn.address;
    const perAddress = this.limits.maxRoomsPerAddress ?? MAX_ROOMS_PER_ADDRESS;
    if (address !== undefined && (this.roomsPerAddress.get(address) ?? 0) >= perAddress) {
      conn.send({ type: 'error', code: '', message: 'TOO_MANY_ROOMS' });
      return;
    }
    const room = createRoom(this.deps.roomDeps, new Set(this.rooms.keys()));
    const session = new RoomSession(
      room,
      this.registry,
      this.deps,
      (code, conns) => {
        this.rooms.delete(code);
        this.forgetOpener(code);
        // Unbind every connection closed out with the room, so a bystander whose
        // room vanished under them can open or join a new one (not ALREADY_IN_ROOM).
        for (const conn of conns) {
          this.sessionOf.delete(conn);
        }
      },
      (superseded) => this.sessionOf.delete(superseded),
    );
    this.rooms.set(room.code, session);
    if (address !== undefined) {
      this.openedBy.set(room.code, address);
      this.roomsPerAddress.set(address, (this.roomsPerAddress.get(address) ?? 0) + 1);
    }
    this.sessionOf.set(conn, session);
    session.addHost(conn);
    this.deps.usage?.({ ev: 'room.open' });
  }

  private forgetOpener(code: string): void {
    const address = this.openedBy.get(code);
    if (address === undefined) {
      return;
    }
    this.openedBy.delete(code);
    const left = (this.roomsPerAddress.get(address) ?? 1) - 1;
    if (left <= 0) {
      this.roomsPerAddress.delete(address);
    } else {
      this.roomsPerAddress.set(address, left);
    }
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
