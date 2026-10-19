import { describe, expect, it } from 'vitest';
import { SocketTransport } from './socket.js';
import { net, started } from './socket.testkit.js';
import type { ViewFrame } from './types.js';

describe('terminal errors stop the transport (plan-15 §4)', () => {
  it.each([
    'SUPERSEDED',
    'ROOM_CLOSED',
    'NO_SUCH_ROOM',
    'BAD_HOST_TOKEN',
    'SERVER_FULL',
    'TOO_MANY_ROOMS',
    'ROOM_FULL',
    'EMPTY_NICKNAME',
    'JOIN_FAILED',
  ])('after %s a dropped socket is never reconnected', (message) => {
    const n = net();
    const t = started(
      new SocketTransport(
        'ws://x',
        { role: 'player', code: 'ABCD', nickname: 'A' },
        n.factory,
        n.clock,
      ),
    );
    const errors: string[] = [];
    t.subscribeError((e) => errors.push(e.message ?? ''));
    n.current().open();
    n.current().emit({ type: 'error', code: 'ABCD', message });
    n.current().drop();
    expect(errors).toEqual([message]); // still surfaced to the screen
    expect(n.pending()).toBe(0); // no retry scheduled
  });

  it('a non-terminal error leaves reconnecting on', () => {
    const n = net();
    const t = started(
      new SocketTransport(
        'ws://x',
        { role: 'player', code: 'ABCD', nickname: 'A' },
        n.factory,
        n.clock,
      ),
    );
    t.subscribeError(() => {});
    n.current().open();
    n.current().emit({ type: 'error', code: 'ABCD', message: 'GAME_REJECTED: WRONG_PHASE' });
    n.current().drop();
    expect(n.pending()).toBe(1);
  });

  it('ignores a pong (it is only proof of life)', () => {
    const n = net();
    const t = started(
      new SocketTransport('ws://x', { role: 'host', nickname: 'S' }, n.factory, n.clock),
    );
    const frames: ViewFrame[] = [];
    t.subscribe((f) => frames.push(f));
    n.current().open();
    n.current().emit({ type: 'pong' });
    expect(frames).toEqual([]);
  });

  it('a stopped transport sends nothing more', () => {
    const n = net();
    const t = started(
      new SocketTransport(
        'ws://x',
        { role: 'player', code: 'ABCD', nickname: 'A' },
        n.factory,
        n.clock,
      ),
    );
    n.current().open();
    n.current().emit({ type: 'error', code: 'ABCD', message: 'SUPERSEDED' });
    const before = n.current().socket.sent.length;
    t.send({ type: 'gameEvent', event: { type: 'vote', target: 'b' } });
    expect(n.current().socket.sent.length).toBe(before);
  });
});

describe('lazy start (plan-15 §4)', () => {
  it('opens no socket until something listens — a discarded transport stays silent', () => {
    const n = net();
    // Built and thrown away, as React StrictMode does with a state initializer.
    new SocketTransport('ws://x', { role: 'host', nickname: 'S' }, n.factory, n.clock);
    expect(() => n.current()).toThrow('no socket yet');
  });

  it('opens on the first subscription', () => {
    const n = net();
    const t = new SocketTransport('ws://x', { role: 'host', nickname: 'S' }, n.factory, n.clock);
    t.subscribe(() => {});
    n.current().open();
    expect(n.current().last()).toEqual({ type: 'open', nickname: 'S' });
  });
});

describe('onTerminal', () => {
  it('reports the terminal error once, so the app can forget a gone room’s stored keys', () => {
    const n = net();
    const t = started(
      new SocketTransport(
        'ws://x',
        { role: 'player', code: 'ABCD', nickname: 'A' },
        n.factory,
        n.clock,
      ),
    );
    const ended: string[] = [];
    t.onTerminal = (message) => ended.push(message);
    n.current().open();
    n.current().emit({ type: 'error', code: 'ABCD', message: 'GAME_REJECTED: WRONG_PHASE' });
    n.current().emit({ type: 'error', code: 'ABCD', message: 'ROOM_CLOSED' });
    expect(ended).toEqual(['ROOM_CLOSED']);
  });
});
