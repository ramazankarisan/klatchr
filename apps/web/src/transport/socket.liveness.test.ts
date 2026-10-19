import { afterEach, describe, expect, it } from 'vitest';
import { SocketTransport } from './socket.js';
import { net } from './socket.testkit.js';
import type { ConnStatus } from './types.js';

/**
 * plan-15 §5 — a socket that only *looks* open. The server answers every ping, so a
 * live socket hears something on a cadence; silence, a stuck connect, a wake from sleep
 * or a network that just came back each lead to a fresh socket inside the seat's grace.
 */

/** Timers whose cancel really cancels — the watchdog is re-armed on every message. */
function timers() {
  const live = new Map<number, { callback: () => void; ms: number }>();
  let next = 0;
  return {
    clock: {
      schedule(callback: () => void, ms: number) {
        const id = next++;
        live.set(id, { callback, ms });
        return () => live.delete(id);
      },
    },
    /** Fire every pending timer of this duration (each one once). */
    fire(ms: number) {
      for (const [id, t] of [...live]) {
        if (t.ms === ms) {
          live.delete(id);
          t.callback();
        }
      }
    },
    pendingOf: (ms: number) => [...live.values()].filter((t) => t.ms === ms).length,
  };
}

const LIVENESS_MS = 40_000;
const CONNECT_TIMEOUT_MS = 8_000;
const PROBE_MS = 4_000;

function player() {
  const n = net();
  const t = timers();
  const transport = new SocketTransport(
    'ws://x',
    { role: 'player', code: 'ABCD', nickname: 'Ada' },
    n.factory,
    n.clock,
    t.clock,
  );
  const status: ConnStatus[] = [];
  transport.subscribeStatus((s) => status.push(s));
  return { n, t, transport, status };
}

afterEach(() => {
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});

describe('liveness watchdog', () => {
  it('reconnects when a live socket goes silent', () => {
    const { n, t, status } = player();
    n.current().open();
    t.fire(LIVENESS_MS);
    expect(status.at(-1)).toBe('reconnecting');
    expect(n.pending()).toBe(1); // a backed-off retry is scheduled
  });

  it('any inbound message (a pong) re-arms it, so a talking socket is kept', () => {
    const { n, t, status } = player();
    n.current().open();
    n.current().emit({ type: 'pong' });
    expect(t.pendingOf(LIVENESS_MS)).toBe(1); // one watchdog, re-armed — not stacked
    expect(status.at(-1)).toBe('live');
  });

  it('ignores the abandoned socket’s late close (one retry, not two)', () => {
    const { n, t } = player();
    n.current().open();
    const stale = n.current();
    t.fire(LIVENESS_MS);
    stale.drop();
    expect(n.pending()).toBe(1);
  });
});

describe('one socket at a time (review findings)', () => {
  it('a send during the backoff wait queues — it never opens a second socket', () => {
    const { n, t, transport } = player();
    n.current().open();
    n.current().emit({ type: 'joined', code: 'ABCD', playerId: 'p1', reconnectToken: 'r' });
    t.fire(LIVENESS_MS); // abandoned; backoff pending
    const sockets = n.current();
    transport.send({ type: 'gameEvent', event: { type: 'vote', target: 'p2' } });
    expect(n.current()).toBe(sockets); // no extra socket, no backoff bypass
    n.runNext(); // the backoff fires: exactly one new socket
    n.current().open();
    expect(n.current().allSent().at(-1)).toMatchObject({ type: 'play' }); // the queued vote flushed
  });

  it('back online while a retry is still connecting leaves it to its own timeout', () => {
    const { n } = player();
    const connecting = n.current();
    window.dispatchEvent(new Event('online'));
    expect(n.current()).toBe(connecting);
  });

  it('a hidden tab re-arms the watchdog instead of reconnecting (throttled timers prove nothing)', () => {
    const { n, t, status } = player();
    n.current().open();
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    t.fire(LIVENESS_MS);
    expect(status.at(-1)).toBe('live');
    expect(t.pendingOf(LIVENESS_MS)).toBe(1);
  });

  it('a failed connect does not fire its timeout later, mid-backoff', () => {
    const { n, t } = player();
    n.current().drop(); // fails before opening; backoff pending
    expect(t.pendingOf(CONNECT_TIMEOUT_MS)).toBe(0);
  });
});

describe('connect timeout', () => {
  it('abandons a socket stuck connecting and retries', () => {
    const { n, t, status } = player();
    t.fire(CONNECT_TIMEOUT_MS);
    expect(status.at(-1)).toBe('reconnecting');
    expect(n.pending()).toBe(1);
  });

  it('is called off once the socket opens', () => {
    const { n, t } = player();
    n.current().open();
    expect(t.pendingOf(CONNECT_TIMEOUT_MS)).toBe(0);
  });
});

describe('device events', () => {
  it('back online: retries at once instead of waiting out the backoff', () => {
    const { n } = player();
    n.current().open();
    const first = n.current();
    first.drop(); // backoff pending
    window.dispatchEvent(new Event('online'));
    expect(n.current()).not.toBe(first); // a fresh socket, now
    n.current().open();
    expect(n.current().last()).toMatchObject({ type: 'join', code: 'ABCD' });
  });

  it('back in view: probes an open socket, and reconnects if it does not answer', () => {
    const { n, t, status } = player();
    n.current().open();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(n.current().last()).toEqual({ type: 'ping' });
    t.fire(PROBE_MS);
    expect(status.at(-1)).toBe('reconnecting');
  });

  it('back in view and answered: stays live', () => {
    const { n, t, status } = player();
    n.current().open();
    document.dispatchEvent(new Event('visibilitychange'));
    n.current().emit({ type: 'pong' });
    expect(t.pendingOf(PROBE_MS)).toBe(0);
    expect(status.at(-1)).toBe('live');
  });

  it('a hidden tab does nothing', () => {
    const { n } = player();
    n.current().open();
    const sent = n.current().socket.sent.length;
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(n.current().socket.sent.length).toBe(sent);
  });
});

describe('dispose', () => {
  it('ends the link for good: no retry after a drop, no reaction to device events', () => {
    const { n, t, transport } = player();
    n.current().open();
    const socket = n.current();
    transport.dispose();
    socket.drop();
    window.dispatchEvent(new Event('online'));
    expect(n.pending()).toBe(0);
    expect(n.current()).toBe(socket); // no new socket
    expect(t.pendingOf(LIVENESS_MS)).toBe(0);
  });
});
