import { once } from 'node:events';
import { type ClientMessage, type ServerMessage, serverMessage } from '@klatchr/protocol';
import { WebSocket } from 'ws';
import type { ServerDeps } from './serverDeps.js';
import { realDeps } from './serverDeps.js';

/**
 * Harness for the ws-integration test (plan-14 L3): a real `ws` client that
 * parses every inbound with `@klatchr/protocol` (parse at the boundary — the
 * client parses too) and lets a test await a specific frame, plus a controllable schedule so the
 * grace/reap window is driven deterministically over a real socket.
 */

type Frame = Extract<ServerMessage, { type: 'frame' }>;
type Joined = Extract<ServerMessage, { type: 'joined' }>;

/** A real WebSocket client that records parsed inbound messages. */
export class WsClient {
  private readonly socket: WebSocket;
  // Registered in the constructor, before 'open' can fire — awaiting `once` only
  // in open() would race the fast local connection and miss the event.
  private readonly opened: Promise<unknown>;
  readonly messages: ServerMessage[] = [];
  private readonly waiters: Array<{
    pred: (m: ServerMessage) => boolean;
    resolve: (m: ServerMessage) => void;
    reject: (e: Error) => void;
  }> = [];

  constructor(url: string) {
    this.socket = new WebSocket(url);
    this.opened = once(this.socket, 'open');
    this.socket.on('close', () => {
      for (const waiter of this.waiters.splice(0)) {
        waiter.reject(new Error('socket closed while waiting for a message'));
      }
    });
    this.socket.on('message', (data) => {
      let json: unknown;
      try {
        json = JSON.parse(data.toString());
      } catch {
        return; // non-JSON is off-schema too — dropped, never thrown in the listener
      }
      const parsed = serverMessage.safeParse(json);
      if (!parsed.success) {
        return; // a real client drops anything off-schema (the parse-at-the-boundary rule)
      }
      this.messages.push(parsed.data);
      for (const waiter of this.waiters.splice(0)) {
        if (waiter.pred(parsed.data)) {
          waiter.resolve(parsed.data);
        } else {
          this.waiters.push(waiter);
        }
      }
    });
  }

  async open(): Promise<void> {
    await this.opened;
  }

  send(message: ClientMessage): void {
    this.socket.send(JSON.stringify(message));
  }

  /** Send an off-schema / malformed payload, to exercise the parse boundary. */
  sendRaw(raw: string): void {
    this.socket.send(raw);
  }

  close(): void {
    this.socket.close();
  }

  /** Resolve with the first (past or future) message matching `pred`. Rejects after
   * `timeoutMs` or when the socket closes, so a missing frame fails with a cause
   * instead of a bare test timeout. */
  waitFor(pred: (m: ServerMessage) => boolean, timeoutMs = 2000): Promise<ServerMessage> {
    const seen = this.messages.find(pred);
    if (seen !== undefined) {
      return Promise.resolve(seen);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const at = this.waiters.indexOf(waiter);
        if (at !== -1) {
          this.waiters.splice(at, 1);
        }
        reject(new Error(`waitFor: no matching message within ${timeoutMs}ms`));
      }, timeoutMs);
      const waiter = {
        pred,
        resolve: (m: ServerMessage) => {
          clearTimeout(timer);
          resolve(m);
        },
        reject: (e: Error) => {
          clearTimeout(timer);
          reject(e);
        },
      };
      this.waiters.push(waiter);
    });
  }

  async waitForFrame(pred: (f: Frame) => boolean): Promise<Frame> {
    return (await this.waitFor((m) => m.type === 'frame' && pred(m))) as Frame;
  }

  async waitForJoined(): Promise<Joined> {
    return (await this.waitFor((m) => m.type === 'joined')) as Joined;
  }

  lastFrame(): Frame {
    const frame = [...this.messages].reverse().find((m): m is Frame => m.type === 'frame');
    if (frame === undefined) {
      throw new Error('no frame received');
    }
    return frame;
  }
}

/** realDeps with a controllable schedule: captured reapers fire on `fireAll()`. */
export function fakeTimerDeps(): { deps: ServerDeps; fireAll: () => void } {
  const base = realDeps();
  const pending: Array<{ callback: () => void; live: boolean }> = [];
  const deps: ServerDeps = {
    roomDeps: base.roomDeps,
    gameDeps: base.gameDeps,
    schedule: (callback) => {
      const entry = { callback, live: true };
      pending.push(entry);
      return () => {
        entry.live = false;
      };
    },
  };
  const fireAll = (): void => {
    for (const entry of pending.splice(0)) {
      if (entry.live) {
        entry.callback();
      }
    }
  };
  return { deps, fireAll };
}

/** Let real-socket events (a close is processed async server-side) settle. */
export const settle = (ms = 40): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Fire the grace timer until `check` holds — a socket close reaches the server
 * asynchronously, so the reaper it schedules may not exist on the first fire. */
export async function fireUntil(
  fireAll: () => void,
  check: () => boolean,
  tries = 100,
): Promise<void> {
  for (let i = 0; i < tries; i += 1) {
    fireAll();
    await settle(5);
    if (check()) {
      return;
    }
  }
  throw new Error('fireUntil: condition never met');
}
