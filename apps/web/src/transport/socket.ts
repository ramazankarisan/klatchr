import type { Viewer } from '@klatchr/core';
import { type ClientMessage, type ServerMessage, serverMessage } from '@klatchr/protocol';
import type { Action, Transport, ViewFrame } from './types.js';

/** The slice of the browser `WebSocket` we use — injectable so tests fake it. */
export interface SocketLike {
  send(data: string): void;
  close(): void;
  addEventListener(type: 'open' | 'message', listener: (event: { data: unknown }) => void): void;
}

type SocketFactory = (url: string) => SocketLike;

/** How this connection identifies itself to the server. */
export type SocketInit =
  | { role: 'host'; nickname: string }
  | { role: 'player'; code: string; nickname: string; reconnectToken?: string };

const defaultFactory: SocketFactory = (url) => new WebSocket(url);

/**
 * A single-viewer `Transport` over one native WebSocket. It opens (host) or
 * joins (player) on connect, parses every inbound with `@klatchr/protocol`
 * (rule 2 — never `as`), and rebuilds the web `ViewFrame` from the wire frame
 * plus its own resolved viewer (host is known; a player's id arrives in
 * `joined`). Redaction already happened server-side; this only forwards.
 */
export class SocketTransport implements Transport {
  private readonly socket: SocketLike;
  private readonly listeners = new Set<(frame: ViewFrame) => void>();
  private viewer: Viewer;
  private code: string | null = null;
  private last: ViewFrame | null = null;
  private readonly pending: ClientMessage[] = [];
  private open = false;

  /** Called with the fresh reconnect token whenever the server (re)issues one. */
  onReconnectToken: (token: string) => void = () => {};

  constructor(
    url: string,
    private readonly init: SocketInit,
    factory: SocketFactory = defaultFactory,
  ) {
    this.viewer = init.role === 'host' ? { role: 'host' } : { role: 'player', id: '' };
    this.socket = factory(url);
    this.socket.addEventListener('open', () => this.handleOpen());
    this.socket.addEventListener('message', (event) => this.handleMessage(event.data));
  }

  subscribe(onFrame: (frame: ViewFrame) => void): () => void {
    this.listeners.add(onFrame);
    if (this.last !== null) {
      onFrame(this.last);
    }
    return () => {
      this.listeners.delete(onFrame);
    };
  }

  send(action: Action): void {
    if (this.code === null) {
      return; // no room yet — host controls only appear after the first frame
    }
    this.dispatch(this.toWire(action, this.code));
  }

  private handleOpen(): void {
    this.open = true;
    this.dispatch(this.handshake());
    for (const queued of this.pending.splice(0)) {
      this.dispatch(queued);
    }
  }

  private handshake(): ClientMessage {
    if (this.init.role === 'host') {
      return { type: 'open', nickname: this.init.nickname };
    }
    const { code, nickname, reconnectToken } = this.init;
    return reconnectToken === undefined
      ? { type: 'join', code, nickname }
      : { type: 'join', code, nickname, reconnectToken };
  }

  private handleMessage(data: unknown): void {
    if (typeof data !== 'string') {
      return;
    }
    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch {
      return;
    }
    const parsed = serverMessage.safeParse(json);
    if (!parsed.success) {
      return; // an unparseable inbound is dropped, never rendered (rule 2)
    }
    this.receive(parsed.data);
  }

  private receive(message: ServerMessage): void {
    if (message.type === 'joined') {
      this.viewer = { role: 'player', id: message.playerId };
      this.code = message.code;
      this.onReconnectToken(message.reconnectToken);
      return;
    }
    if (message.type === 'frame') {
      this.code = message.code;
      this.last = this.toFrame(message);
      for (const listener of this.listeners) {
        listener(this.last);
      }
    }
    // 'error' is intentionally not rendered here — surfaced by the app later.
  }

  private toFrame(frame: Extract<ServerMessage, { type: 'frame' }>): ViewFrame {
    return {
      code: frame.code,
      phase: frame.phase,
      viewer: this.viewer,
      players: frame.players,
      selectedGameId: frame.selectedGameId,
      gameView: frame.gameView,
      scores: frame.scores,
    };
  }

  private toWire(action: Action, code: string): ClientMessage {
    switch (action.type) {
      case 'selectGame':
        return { type: 'host', code, action: 'selectGame', gameId: action.gameId };
      case 'startGame':
        return { type: 'host', code, action: 'startGame' };
      case 'endGame':
        return { type: 'host', code, action: 'endGame' };
      case 'gameEvent':
        // `?? null` pins the type non-undefined, which the wire schema requires
        // (a play must carry an event); real game events are never undefined.
        return { type: 'play', code, event: action.event ?? null };
    }
  }

  private dispatch(message: ClientMessage): void {
    if (!this.open) {
      this.pending.push(message);
      return;
    }
    this.socket.send(JSON.stringify(message));
  }
}
