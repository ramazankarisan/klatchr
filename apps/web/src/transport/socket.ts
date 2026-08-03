import type { Viewer } from '@klatchr/core';
import { type ClientMessage, type ServerMessage, serverMessage } from '@klatchr/protocol';
import type { Action, ConnStatus, Transport, TransportError, ViewFrame } from './types.js';

/** The slice of the browser `WebSocket` we use — injectable so tests fake it. */
export interface SocketLike {
  send(data: string): void;
  close(): void;
  addEventListener(
    type: 'open' | 'message' | 'close' | 'error',
    listener: (event: { data: unknown }) => void,
  ): void;
}

type SocketFactory = (url: string) => SocketLike;

/** How this connection identifies itself to the server. */
export type SocketInit =
  // `resume` (from a persisted host session) makes the very first handshake a
  // `resumeHost` instead of `open` — so a reloaded host re-attaches its own room
  // rather than opening a new one (8.1).
  | { role: 'host'; nickname: string; resume?: { code: string; hostToken: string } }
  | { role: 'player'; code: string; nickname: string; reconnectToken?: string };

/** Deferred callback used for the reconnect backoff — injectable so tests drive it. */
interface ReconnectClock {
  schedule(callback: () => void, ms: number): () => void;
}

const defaultFactory: SocketFactory = (url) => new WebSocket(url);
const defaultClock: ReconnectClock = {
  schedule: (callback, ms) => {
    const handle = setTimeout(callback, ms);
    return () => clearTimeout(handle);
  },
};

// Capped exponential backoff between reconnect attempts: 0.5s, 1s, 2s … up to 8s.
const BASE_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 8_000;
// Keepalive cadence (F3): ping this often while connected so a quiet lobby's socket
// isn't reaped by an idle intermediary. Its own timer, not the reconnect clock.
const KEEPALIVE_MS = 25_000;

/**
 * A single-viewer `Transport` over one native WebSocket. It opens (host) or
 * joins (player) on connect, parses every inbound with `@klatchr/protocol`
 * (rule 2 — never `as`), and rebuilds the web `ViewFrame` from the wire frame
 * plus its own resolved viewer (host is known; a player's id arrives in
 * `joined`). Redaction already happened server-side; this only forwards.
 *
 * It heals itself (7.2): on a `close`/`error` it retries with capped exponential
 * backoff, re-running its handshake — a player re-sends `join { reconnectToken }`,
 * a host re-sends `resumeHost { code, hostToken }` (the secret captured from the
 * `opened` ack). A `connecting | live | reconnecting` status rides alongside the
 * frames so the UI can show a "Reconnecting…" indicator. Actions taken mid-drop
 * queue and flush once the socket is back — nothing is lost.
 */
export class SocketTransport implements Transport {
  private socket: SocketLike;
  private readonly listeners = new Set<(frame: ViewFrame) => void>();
  private readonly statusListeners = new Set<(status: ConnStatus) => void>();
  private readonly errorListeners = new Set<(error: TransportError) => void>();
  private viewer: Viewer;
  private code: string | null = null;
  private last: ViewFrame | null = null;
  private status: ConnStatus = 'connecting';
  private readonly pending: ClientMessage[] = [];
  private open = false;
  private attempt = 0;
  private awaitingReconnect = false;
  // The latest resume credentials, re-sent on every reconnect handshake. A player's
  // token is seeded from init and refreshed by each `joined`; a host's is captured
  // from the `opened` ack (undefined until then → the first handshake is `open`).
  private reconnectToken: string | undefined;
  private hostToken: string | undefined;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;

  /** Called with the fresh reconnect token whenever the server (re)issues one. */
  onReconnectToken: (token: string) => void = () => {};
  /** Called with the host's resume credentials each time the server acks `opened`. */
  onHostSession: (session: { code: string; hostToken: string }) => void = () => {};

  constructor(
    private readonly url: string,
    private readonly init: SocketInit,
    private readonly factory: SocketFactory = defaultFactory,
    private readonly clock: ReconnectClock = defaultClock,
  ) {
    this.viewer = init.role === 'host' ? { role: 'host' } : { role: 'player', id: '' };
    this.reconnectToken = init.role === 'player' ? init.reconnectToken : undefined;
    if (init.role === 'host' && init.resume !== undefined) {
      // Seed the resume credentials so the first handshake is `resumeHost`, not `open`.
      this.code = init.resume.code;
      this.hostToken = init.resume.hostToken;
    }
    this.socket = this.connect();
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

  subscribeStatus(onStatus: (status: ConnStatus) => void): () => void {
    this.statusListeners.add(onStatus);
    onStatus(this.status);
    return () => {
      this.statusListeners.delete(onStatus);
    };
  }

  subscribeError(onError: (error: TransportError) => void): () => void {
    this.errorListeners.add(onError);
    return () => {
      this.errorListeners.delete(onError);
    };
  }

  send(action: Action): void {
    if (this.code === null) {
      return; // no room yet — host controls only appear after the first frame
    }
    this.dispatch(this.toWire(action, this.code));
  }

  /** Open a fresh socket and wire its lifecycle. Reused for the first connect and every retry. */
  private connect(): SocketLike {
    this.open = false;
    const socket = this.factory(this.url);
    socket.addEventListener('open', () => this.handleOpen());
    socket.addEventListener('message', (event) => this.handleMessage(event.data));
    socket.addEventListener('close', () => this.handleDrop());
    socket.addEventListener('error', () => this.handleDrop());
    this.socket = socket;
    return socket;
  }

  private handleOpen(): void {
    this.open = true;
    this.attempt = 0;
    this.awaitingReconnect = false;
    this.setStatus('live');
    this.dispatch(this.handshake());
    for (const queued of this.pending.splice(0)) {
      this.dispatch(queued);
    }
    this.startKeepalive();
  }

  /** Ping on a fixed cadence while connected (F3). Started once; the interval
   * outlives reconnects and only sends while the socket is open. */
  private startKeepalive(): void {
    if (this.keepaliveTimer !== null) {
      return;
    }
    const ping: ClientMessage = { type: 'ping' };
    this.keepaliveTimer = setInterval(() => {
      if (this.open) {
        this.socket.send(JSON.stringify(ping));
      }
    }, KEEPALIVE_MS);
  }

  /** A dropped socket: flip to reconnecting and schedule a backed-off retry (once per drop). */
  private handleDrop(): void {
    if (this.awaitingReconnect) {
      return; // close + error can both fire for one drop — schedule only once
    }
    this.open = false;
    this.awaitingReconnect = true;
    this.setStatus('reconnecting');
    const delay = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** this.attempt);
    this.attempt += 1;
    this.clock.schedule(() => {
      this.awaitingReconnect = false;
      this.connect();
    }, delay);
  }

  private handshake(): ClientMessage {
    if (this.init.role === 'host') {
      // Once the room is known, a reconnecting host resumes it with the secret
      // (7.1); before the first `opened` it is a fresh open.
      return this.code !== null && this.hostToken !== undefined
        ? { type: 'resumeHost', code: this.code, hostToken: this.hostToken }
        : { type: 'open', nickname: this.init.nickname };
    }
    const { code, nickname } = this.init;
    return this.reconnectToken === undefined
      ? { type: 'join', code, nickname }
      : { type: 'join', code, nickname, reconnectToken: this.reconnectToken };
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
      this.reconnectToken = message.reconnectToken; // refresh the resume secret for the next retry
      this.onReconnectToken(message.reconnectToken);
      return;
    }
    if (message.type === 'opened') {
      // The host's open-ack (7.1): keep the code + secret so a later reconnect
      // re-attaches this board via `resumeHost` instead of opening a new room, and
      // hand it to the app to persist for a full-reload resume (8.1).
      this.code = message.code;
      this.hostToken = message.hostToken;
      this.onHostSession({ code: message.code, hostToken: message.hostToken });
      return;
    }
    if (message.type === 'frame') {
      this.code = message.code;
      this.last = this.toFrame(message);
      for (const listener of this.listeners) {
        listener(this.last);
      }
      return;
    }
    if (message.type === 'error') {
      // Surface it (8.1): a bad code / full room / closed room used to vanish here,
      // leaving the UI on an endless spinner. The screens map it to copy + a way back.
      const error: TransportError =
        message.message === undefined
          ? { code: message.code }
          : { code: message.code, message: message.message };
      for (const listener of this.errorListeners) {
        listener(error);
      }
    }
  }

  private setStatus(status: ConnStatus): void {
    if (this.status === status) {
      return;
    }
    this.status = status;
    for (const listener of this.statusListeners) {
      listener(status);
    }
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
      sessionScores: frame.sessionScores,
      round: frame.round,
    };
  }

  private toWire(action: Action, code: string): ClientMessage {
    switch (action.type) {
      case 'selectGame':
        return { type: 'host', code, action: 'selectGame', gameId: action.gameId };
      case 'configureGame':
        return { type: 'host', code, action: 'configureGame', config: action.config };
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
