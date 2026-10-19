import type { Viewer } from '@klatchr/core';
import { type ClientMessage, type ServerMessage, serverMessage } from '@klatchr/protocol';
import { watchDevice } from './device.js';
import {
  BASE_BACKOFF_MS,
  CONNECT_TIMEOUT_MS,
  KEEPALIVE_MS,
  LIVENESS_MS,
  MAX_BACKOFF_MS,
  PROBE_MS,
  type ReconnectClock,
  type SocketFactory,
  type SocketInit,
  type SocketLike,
  defaultClock,
  defaultFactory,
} from './socket.parts.js';
import type { Action, ConnStatus, Transport, TransportError, ViewFrame } from './types.js';
import { TERMINAL, toFrame, toWire } from './wire.js';

export type { SocketInit, SocketLike } from './socket.parts.js';

/**
 * A single-viewer `Transport` over one native WebSocket. It opens (host) or joins
 * (player), parses every inbound with `@klatchr/protocol` (never `as`), and rebuilds
 * the web `ViewFrame` with its own viewer. Redaction already happened server-side.
 *
 * It heals itself: a drop, a stuck connect or a silent socket (no pong) leads to a
 * backed-off retry that re-runs the handshake (`join { reconnectToken }` or
 * `resumeHost`); a wake or a network coming back retries at once. Actions taken
 * mid-drop queue and flush on reconnect. A terminal error, or `dispose()`, ends it.
 */
export class SocketTransport implements Transport {
  // Created on first use, not in the constructor: a transport built during render (and
  // discarded — React StrictMode builds state twice) must never open a socket, or the
  // orphan would resume the same seat and supersede the transport actually in use.
  private socket: SocketLike | null = null;
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
  private stopped = false;
  // Cancel handles for the pending backoff retry, the liveness watchdog, the connect
  // timeout, and the window listeners (visibility / online).
  private cancelBackoff: (() => void) | null = null;
  private cancelWatchdog: (() => void) | null = null;
  private cancelConnectTimeout: (() => void) | null = null;
  private unwatchWindow: (() => void) | null = null;
  // Started once, on first use. Each socket gets a generation; abandoning one bumps it,
  // so a stale socket's late events are ignored without ever nulling `socket`.
  private started = false;
  private generation = 0;

  /** Called with the fresh reconnect token whenever the server (re)issues one. */
  onReconnectToken: (token: string) => void = () => {};
  /** Called with the host's resume credentials each time the server acks `opened`. */
  onHostSession: (session: { code: string; hostToken: string }) => void = () => {};
  /** Called once with the terminal error that ended this transport (see TERMINAL). */
  onTerminal: (message: string) => void = () => {};

  constructor(
    private readonly url: string,
    private readonly init: SocketInit,
    private readonly factory: SocketFactory = defaultFactory,
    private readonly clock: ReconnectClock = defaultClock,
    // The liveness watchdog, connect timeout and wake probe — separate from the backoff
    // clock so a test can drive one without the other.
    private readonly timers: ReconnectClock = defaultClock,
  ) {
    this.viewer = init.role === 'host' ? { role: 'host' } : { role: 'player', id: '' };
    this.reconnectToken = init.role === 'player' ? init.reconnectToken : undefined;
    if (init.role === 'host' && init.resume !== undefined) {
      // Seed the resume credentials so the first handshake is `resumeHost`, not `open`.
      this.code = init.resume.code;
      this.hostToken = init.resume.hostToken;
    }
  }

  /** Open the first socket the moment anyone listens or sends. */
  private ensureStarted(): void {
    if (!this.started && !this.stopped) {
      this.started = true;
      this.watchWindow();
      this.connect();
    }
  }

  /** End this transport: the screen that owned it is gone. No socket, no timers. */
  dispose(): void {
    this.stop();
    this.listeners.clear();
    this.statusListeners.clear();
    this.errorListeners.clear();
  }

  subscribe(onFrame: (frame: ViewFrame) => void): () => void {
    this.ensureStarted();
    this.listeners.add(onFrame);
    if (this.last !== null) {
      onFrame(this.last);
    }
    return () => {
      this.listeners.delete(onFrame);
    };
  }

  subscribeStatus(onStatus: (status: ConnStatus) => void): () => void {
    this.ensureStarted();
    this.statusListeners.add(onStatus);
    onStatus(this.status);
    return () => {
      this.statusListeners.delete(onStatus);
    };
  }

  subscribeError(onError: (error: TransportError) => void): () => void {
    this.ensureStarted();
    this.errorListeners.add(onError);
    return () => {
      this.errorListeners.delete(onError);
    };
  }

  send(action: Action): void {
    if (this.code === null) {
      return; // no room yet — host controls only appear after the first frame
    }
    this.dispatch(toWire(action, this.code));
  }

  /** Open a fresh socket and wire its lifecycle. Reused for the first connect and every retry. */
  private connect(): SocketLike {
    this.open = false;
    const socket = this.factory(this.url);
    // Events from a socket this transport has abandoned or replaced are ignored: a late
    // close from the old one must not tear down the new one.
    this.generation += 1;
    const generation = this.generation;
    const current = (): boolean => generation === this.generation;
    socket.addEventListener('open', () => current() && this.handleOpen());
    socket.addEventListener('message', (event) => current() && this.handleMessage(event.data));
    socket.addEventListener('close', () => current() && this.handleDrop());
    socket.addEventListener('error', () => current() && this.handleDrop());
    this.socket = socket;
    this.cancelConnectTimeout?.();
    this.cancelConnectTimeout = this.timers.schedule(() => {
      if (current() && !this.open) {
        this.forceReconnect(); // stuck connecting — try a fresh socket
      }
    }, CONNECT_TIMEOUT_MS);
    return socket;
  }

  /** Abandon the current socket (it is dead or stuck) and go through the normal retry. */
  private forceReconnect(): void {
    this.generation += 1; // from here on, the stale socket's events are ignored
    this.handleDrop(); // schedules the backed-off retry
    this.socket?.close();
  }

  /** Reset the liveness watchdog: any inbound message proves the socket is alive. */
  private armWatchdog(ms = LIVENESS_MS): void {
    this.cancelWatchdog?.();
    this.cancelWatchdog = this.timers.schedule(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        // A hidden tab's timers are throttled (Chrome batches them to once a minute),
        // so silence proves nothing; the probe on becoming visible checks for real.
        this.armWatchdog();
        return;
      }
      if (this.open) {
        this.forceReconnect();
      }
    }, ms);
  }

  /** Retry now instead of waiting out the backoff (the network just came back). Only
   * from the backoff wait: a socket already connecting is left to its own timeout. */
  private reconnectNow(): void {
    if (this.stopped || !this.awaitingReconnect) {
      return;
    }
    this.cancelBackoff?.();
    this.cancelBackoff = null;
    this.awaitingReconnect = false;
    this.connect();
  }

  /** React to the device, not just the socket (see watchDevice). */
  private watchWindow(): void {
    this.unwatchWindow?.();
    this.unwatchWindow = watchDevice({
      visible: () => {
        if (this.open) {
          // Probe a seemingly open socket: it must answer the ping quickly.
          this.socket?.send(JSON.stringify({ type: 'ping' } satisfies ClientMessage));
          this.armWatchdog(PROBE_MS);
        } else {
          this.reconnectNow();
        }
      },
      online: () => this.reconnectNow(),
    });
  }

  private handleOpen(): void {
    this.cancelConnectTimeout?.();
    this.cancelConnectTimeout = null;
    this.armWatchdog();
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
        this.socket?.send(JSON.stringify(ping));
      }
    }, KEEPALIVE_MS);
  }

  /** A dropped socket: flip to reconnecting and schedule a backed-off retry (once per drop). */
  private handleDrop(): void {
    if (this.stopped) {
      return; // a terminal error ended this transport — never come back
    }
    if (this.awaitingReconnect) {
      return; // close + error can both fire for one drop — schedule only once
    }
    this.open = false;
    this.awaitingReconnect = true;
    this.setStatus('reconnecting');
    const delay = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** this.attempt);
    this.attempt += 1;
    this.cancelWatchdog?.();
    this.cancelConnectTimeout?.(); // this socket is done — its timeout must not fire later
    this.cancelBackoff = this.clock.schedule(() => {
      this.cancelBackoff = null;
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
    if (this.stopped) {
      return; // late messages after a terminal error or dispose change nothing
    }
    this.armWatchdog(); // anything at all from the server proves the socket is alive
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
      return; // an unparseable inbound is dropped, never rendered (the parse-at-the-boundary rule)
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
      this.last = toFrame(message, this.viewer);
      for (const listener of this.listeners) {
        listener(this.last);
      }
      return;
    }
    if (message.type === 'error') {
      if (message.message !== undefined && TERMINAL.has(message.message)) {
        this.stop();
        this.onTerminal(message.message);
      }
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

  /** End this transport for good: no keepalive, no reconnect, socket closed. */
  private stop(): void {
    this.stopped = true;
    this.open = false;
    if (this.keepaliveTimer !== null) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
    for (const cancel of [this.cancelBackoff, this.cancelWatchdog, this.cancelConnectTimeout]) {
      cancel?.();
    }
    this.cancelBackoff = null;
    this.cancelWatchdog = null;
    this.cancelConnectTimeout = null;
    this.unwatchWindow?.();
    this.unwatchWindow = null;
    this.socket?.close();
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

  private dispatch(message: ClientMessage): void {
    if (this.stopped) {
      return; // a stopped transport sends nothing — its screen shows the recover card
    }
    if (!this.open) {
      this.ensureStarted();
      this.pending.push(message);
      return;
    }
    this.socket?.send(JSON.stringify(message));
  }
}
