import type { SocketLike, SocketTransport } from './socket.js';

/* Fakes for the SocketTransport suites: a scriptable socket and a manual backoff clock. */

/** A transport connects once something listens (as every screen does) — start it. */
export function started(t: SocketTransport): SocketTransport {
  t.subscribeError(() => {});
  return t;
}

export function fakeSocket() {
  const on: Partial<
    Record<'open' | 'message' | 'close' | 'error', (event: { data: unknown }) => void>
  > = {};
  const socket: SocketLike & { sent: string[] } = {
    sent: [],
    send(data: string) {
      this.sent.push(data);
    },
    close() {},
    addEventListener(
      type: 'open' | 'message' | 'close' | 'error',
      listener: (event: { data: unknown }) => void,
    ) {
      on[type] = listener;
    },
  };
  return {
    socket,
    open: () => on.open?.({ data: '' }),
    emit: (obj: unknown) => on.message?.({ data: JSON.stringify(obj) }),
    emitRaw: (raw: unknown) => on.message?.({ data: raw }),
    drop: () => on.close?.({ data: '' }),
    error: () => on.error?.({ data: '' }),
    last: () => JSON.parse(socket.sent.at(-1) ?? 'null'),
    allSent: () => socket.sent.map((s) => JSON.parse(s)),
  };
}

/** A controllable backoff clock — the transport's retry only fires when the test says so. */
function manualClock() {
  const queue: Array<() => void> = [];
  let lastDelay = 0;
  return {
    clock: {
      schedule(callback: () => void, ms: number) {
        lastDelay = ms;
        queue.push(callback);
        return () => {};
      },
    },
    runNext: () => queue.shift()?.(),
    pending: () => queue.length,
    lastDelay: () => lastDelay,
  };
}

/** A fresh fake socket per `connect()` (reconnect makes a new one), plus a manual clock. */
export function net() {
  const sockets: ReturnType<typeof fakeSocket>[] = [];
  const { clock, runNext, pending, lastDelay } = manualClock();
  return {
    factory: () => {
      const f = fakeSocket();
      sockets.push(f);
      return f.socket;
    },
    clock,
    runNext,
    pending,
    lastDelay,
    current: () => {
      const f = sockets.at(-1);
      if (f === undefined) throw new Error('no socket yet');
      return f;
    },
  };
}
