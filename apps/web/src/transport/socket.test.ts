import { describe, expect, it } from 'vitest';
import { type SocketLike, SocketTransport } from './socket.js';
import type { ViewFrame } from './types.js';

function fakeSocket() {
  const on: Partial<Record<'open' | 'message', (event: { data: unknown }) => void>> = {};
  const socket: SocketLike & { sent: string[] } = {
    sent: [],
    send(data: string) {
      this.sent.push(data);
    },
    close() {},
    addEventListener(type: 'open' | 'message', listener: (event: { data: unknown }) => void) {
      on[type] = listener;
    },
  };
  return {
    socket,
    open: () => on.open?.({ data: '' }),
    emit: (obj: unknown) => on.message?.({ data: JSON.stringify(obj) }),
    emitRaw: (raw: unknown) => on.message?.({ data: raw }),
    last: () => JSON.parse(socket.sent.at(-1) ?? 'null'),
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
