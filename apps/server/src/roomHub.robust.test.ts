import { describe, expect, it } from 'vitest';
import { RoomHub } from './roomHub.js';
import {
  FakeConn,
  at,
  flush,
  hostToken,
  lastError,
  lastFrame,
  open,
  playerId,
  reconnectToken,
  seat,
} from './roomHub.testkit.js';

/**
 * plan-15 §4 — connection robustness at the hub: proof of life, one live device per
 * seat, and a cap on rooms. The timers and socket limits are covered over a real
 * socket in gateway.robust.integration.test.ts.
 */

describe('ping', () => {
  it('answers a ping with a pong, bound to a room or not', async () => {
    const [hub, host] = await open();
    hub.handle(host, { type: 'ping' });
    const loose = new FakeConn();
    hub.handle(loose, { type: 'ping' });
    expect(host.received.at(-1)).toEqual({ type: 'pong' });
    expect(loose.received).toEqual([{ type: 'pong' }]);
  });
});

describe('a seat moved to another device (S9)', () => {
  it('tells the old player connection, closes it and unbinds it', async () => {
    const [hub, , code] = await open();
    const first = at(await seat(hub, code, 1), 0);
    const second = new FakeConn();
    hub.handle(second, {
      type: 'join',
      code,
      nickname: 'P0',
      reconnectToken: reconnectToken(first),
    });
    await flush();
    expect(playerId(second)).toBe(playerId(first)); // the same seat, now on the new device
    expect(lastError(first).message).toBe('SUPERSEDED');
    expect(first.closed).toBe(true);
    expect(hub.isBound(first)).toBe(false);
    hub.handle(first, { type: 'play', code, event: { type: 'vote' } });
    expect(lastError(first).message).toBe('NOT_IN_ROOM'); // it no longer acts in the room
  });

  it('tells the old board, closes it, and the new board drives the room', async () => {
    const [hub, host, code] = await open();
    const board = new FakeConn();
    hub.handle(board, { type: 'resumeHost', code, hostToken: hostToken(host) });
    await flush();
    expect(lastError(host).message).toBe('SUPERSEDED');
    expect(host.closed).toBe(true);
    expect(lastFrame(board).code).toBe(code);
    expect(hub.isBound(board)).toBe(true);
  });

  it('does not supersede on a fresh join (a new player is a new seat)', async () => {
    const [hub, , code] = await open();
    const both = await seat(hub, code, 2);
    expect(both.map((conn) => conn.closed)).toEqual([false, false]);
  });
});

describe('room cap', () => {
  it('refuses to open past the cap with SERVER_FULL, and opens again once one closes', async () => {
    const hub = new RoomHub(undefined, { maxRooms: 1 });
    const first = new FakeConn();
    hub.handle(first, { type: 'open', nickname: 'Screen' });
    await flush();
    const second = new FakeConn();
    hub.handle(second, { type: 'open', nickname: 'Screen' });
    expect(lastError(second).message).toBe('SERVER_FULL');
    expect(hub.isBound(second)).toBe(false);
    hub.handle(first, { type: 'leave', code: lastFrame(first).code });
    await flush();
    hub.handle(second, { type: 'open', nickname: 'Screen' });
    await flush();
    expect(hub.isBound(second)).toBe(true);
  });
});

describe('rooms per client address', () => {
  /** A connection from a given address, as the socket server builds it. */
  class From extends FakeConn {
    constructor(readonly address: string) {
      super();
    }
  }

  it('caps how many rooms one address may hold open, and frees a slot when one closes', async () => {
    const hub = new RoomHub(undefined, { maxRooms: 100, maxRoomsPerAddress: 2 });
    const hosts = [new From('1.1.1.1'), new From('1.1.1.1'), new From('1.1.1.1')];
    for (const host of hosts) {
      hub.handle(host, { type: 'open', nickname: 'Screen' });
    }
    await flush();
    expect(lastError(at(hosts, 2)).message).toBe('TOO_MANY_ROOMS');
    const elsewhere = new From('2.2.2.2'); // another network is unaffected
    hub.handle(elsewhere, { type: 'open', nickname: 'Screen' });
    expect(hub.isBound(elsewhere)).toBe(true);
    hub.handle(at(hosts, 0), { type: 'leave', code: lastFrame(at(hosts, 0)).code });
    await flush();
    hub.handle(at(hosts, 2), { type: 'open', nickname: 'Screen' });
    expect(hub.isBound(at(hosts, 2))).toBe(true);
  });
});
