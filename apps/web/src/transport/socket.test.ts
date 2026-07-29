import { describe, expect, it } from 'vitest';
import { type SocketLike, SocketTransport } from './socket.js';
import type { ConnStatus, ViewFrame } from './types.js';

function fakeSocket() {
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
function net() {
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

const lobbyFrame = (code: string) => ({
  type: 'frame',
  code,
  phase: 'LOBBY',
  players: [],
  selectedGameId: null,
  gameView: null,
  scores: null,
});

describe('SocketTransport (host)', () => {
  it('sends open on connect and rebuilds a host frame', () => {
    const f = fakeSocket();
    const t = new SocketTransport('ws://x', { role: 'host', nickname: 'Screen' }, () => f.socket);
    let frame: ViewFrame | null = null;
    t.subscribe((x) => {
      frame = x;
    });
    f.open();
    expect(f.last()).toEqual({ type: 'open', nickname: 'Screen' });

    f.emit(lobbyFrame('ABCD'));
    expect(frame).toMatchObject({ code: 'ABCD', phase: 'LOBBY', viewer: { role: 'host' } });
  });

  it('maps host actions to wire host/play messages', () => {
    const f = fakeSocket();
    const t = new SocketTransport('ws://x', { role: 'host', nickname: 'Screen' }, () => f.socket);
    f.open();
    f.emit(lobbyFrame('ABCD')); // learns the code

    t.send({ type: 'selectGame', gameId: 'guess-who' });
    expect(f.last()).toEqual({
      type: 'host',
      code: 'ABCD',
      action: 'selectGame',
      gameId: 'guess-who',
    });
    t.send({ type: 'gameEvent', event: { type: 'advance', from: 'collect' } });
    expect(f.last()).toEqual({
      type: 'play',
      code: 'ABCD',
      event: { type: 'advance', from: 'collect' },
    });
  });
});

describe('SocketTransport (player)', () => {
  it('sends join, captures the reconnect token, and stamps its id onto frames', () => {
    const f = fakeSocket();
    const t = new SocketTransport(
      'ws://x',
      { role: 'player', code: 'ABCD', nickname: 'Ada' },
      () => f.socket,
    );
    let token = '';
    t.onReconnectToken = (x) => {
      token = x;
    };
    let frame: ViewFrame | null = null;
    t.subscribe((x) => {
      frame = x;
    });
    f.open();
    expect(f.last()).toEqual({ type: 'join', code: 'ABCD', nickname: 'Ada' });

    f.emit({ type: 'joined', code: 'ABCD', playerId: 'p1', reconnectToken: 'sekret' });
    expect(token).toBe('sekret');

    f.emit({ ...lobbyFrame('ABCD'), players: [{ id: 'p1', nickname: 'Ada', spectator: false }] });
    expect(frame).toMatchObject({ viewer: { role: 'player', id: 'p1' } });
  });

  it('resends a stored reconnect token in the join', () => {
    const f = fakeSocket();
    new SocketTransport(
      'ws://x',
      { role: 'player', code: 'ABCD', nickname: 'Ada', reconnectToken: 'old' },
      () => f.socket,
    );
    f.open();
    expect(f.last()).toEqual({
      type: 'join',
      code: 'ABCD',
      nickname: 'Ada',
      reconnectToken: 'old',
    });
  });

  it('drops an inbound that is not valid JSON or not a server message', () => {
    const f = fakeSocket();
    const t = new SocketTransport('ws://x', { role: 'host', nickname: 'S' }, () => f.socket);
    let frame: ViewFrame | null = null;
    t.subscribe((x) => {
      frame = x;
    });
    f.open();
    f.emitRaw('{ not json');
    f.emit({ type: 'frame', code: 'ABCD' }); // missing required fields
    expect(frame).toBeNull();
  });
});

describe('SocketTransport (connection status + reconnect, 7.2)', () => {
  it('reports connecting, then live once the socket opens', () => {
    const f = fakeSocket();
    const t = new SocketTransport('ws://x', { role: 'host', nickname: 'S' }, () => f.socket);
    const seen: ConnStatus[] = [];
    t.subscribeStatus((s) => seen.push(s));
    expect(seen).toEqual(['connecting']);
    f.open();
    expect(seen).toEqual(['connecting', 'live']);
  });

  it('reconnects a dropped player and re-sends the join with the latest token', () => {
    const n = net();
    const t = new SocketTransport(
      'ws://x',
      { role: 'player', code: 'ABCD', nickname: 'Ada' },
      n.factory,
      n.clock,
    );
    const seen: ConnStatus[] = [];
    t.subscribeStatus((s) => seen.push(s));
    n.current().open();
    // A fresh token arrives on join; the retry must resend *this*, not the init value.
    n.current().emit({ type: 'joined', code: 'ABCD', playerId: 'p1', reconnectToken: 'tok1' });
    expect(seen).toEqual(['connecting', 'live']);

    n.current().drop();
    expect(seen.at(-1)).toBe('reconnecting');
    expect(n.pending()).toBe(1);

    n.runNext(); // backoff elapses → a new socket is opened
    n.current().open();
    expect(n.current().last()).toEqual({
      type: 'join',
      code: 'ABCD',
      nickname: 'Ada',
      reconnectToken: 'tok1',
    });
    expect(seen.at(-1)).toBe('live');
  });

  it('reconnects a dropped host with resumeHost using the captured token (7.1)', () => {
    const n = net();
    new SocketTransport('ws://x', { role: 'host', nickname: 'Screen' }, n.factory, n.clock);
    n.current().open();
    expect(n.current().last()).toEqual({ type: 'open', nickname: 'Screen' });
    n.current().emit({ type: 'opened', code: 'WXYZ', hostToken: 'htok' });

    n.current().drop();
    n.runNext();
    n.current().open();
    expect(n.current().last()).toEqual({ type: 'resumeHost', code: 'WXYZ', hostToken: 'htok' });
  });

  it('queues actions taken while reconnecting and flushes them after the re-handshake', () => {
    const n = net();
    const t = new SocketTransport('ws://x', { role: 'host', nickname: 'S' }, n.factory, n.clock);
    n.current().open();
    n.current().emit({ type: 'opened', code: 'WXYZ', hostToken: 'h' });
    n.current().drop();
    t.send({ type: 'startGame' }); // taken during the blip → queued, not lost
    n.runNext();
    n.current().open();
    const sent = n.current().allSent();
    expect(sent[0]).toEqual({ type: 'resumeHost', code: 'WXYZ', hostToken: 'h' }); // handshake first
    expect(sent).toContainEqual({ type: 'host', code: 'WXYZ', action: 'startGame' });
  });

  it('schedules a single retry even when close and error both fire for one drop', () => {
    const n = net();
    new SocketTransport('ws://x', { role: 'host', nickname: 'S' }, n.factory, n.clock);
    n.current().open();
    n.current().drop();
    n.current().error(); // same drop, second event — must not double-schedule
    expect(n.pending()).toBe(1);
  });

  it('backs off exponentially across repeated failures', () => {
    const n = net();
    new SocketTransport('ws://x', { role: 'host', nickname: 'S' }, n.factory, n.clock);
    n.current().open();
    n.current().drop();
    expect(n.lastDelay()).toBe(500);
    n.runNext(); // retry socket created (not yet open)
    n.current().drop(); // it fails again before opening
    expect(n.lastDelay()).toBe(1000);
  });
});
