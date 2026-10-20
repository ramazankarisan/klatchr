import { createRoom } from '@klatchr/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RoomHub } from './roomHub.js';
import { FakeConn, at, flush, lastFrame, reconnectToken, seat } from './roomHub.testkit.js';
import { realDeps } from './serverDeps.js';
import { type UsageLine, roundStarted, stdoutUsage } from './usage.js';

/* Usage logging (plan-16): counts only — rooms, joins, rounds and the game. */

async function hubWithLog(): Promise<[RoomHub, FakeConn, string, UsageLine[]]> {
  const lines: UsageLine[] = [];
  const hub = new RoomHub({ ...realDeps(), usage: (line) => lines.push(line) });
  const host = new FakeConn();
  hub.handle(host, { type: 'open', nickname: 'Screen' });
  await flush();
  return [hub, host, lastFrame(host).code, lines];
}

describe('usage lines', () => {
  afterEach(() => vi.restoreAllMocks());

  it('U1 logs a room opening, each new player and each round with its game', async () => {
    const [hub, host, code, lines] = await hubWithLog();
    await seat(hub, code, 3);
    hub.handle(host, { type: 'host', code, action: 'selectGame', gameId: 'guess-who' });
    hub.handle(host, { type: 'host', code, action: 'startGame' });
    await flush();
    expect(lines).toEqual([
      { ev: 'room.open' },
      { ev: 'player.join' },
      { ev: 'player.join' },
      { ev: 'player.join' },
      { ev: 'round.start', game: 'guess-who', round: 1, players: 3 },
    ]);
  });

  it('U2 a token resume is not a new join', async () => {
    const [hub, , code, lines] = await hubWithLog();
    const a = at(await seat(hub, code, 1), 0);
    hub.disconnect(a);
    hub.handle(new FakeConn(), {
      type: 'join',
      code,
      nickname: 'P0',
      reconnectToken: reconnectToken(a),
    });
    await flush();
    expect(lines.filter((l) => l.ev === 'player.join')).toHaveLength(1);
  });

  it('U3 never carries a nickname or the room code', async () => {
    const [hub, host, code, lines] = await hubWithLog();
    for (const nickname of ['MARKER-ada', 'MARKER-bo', 'MARKER-cy']) {
      hub.handle(new FakeConn(), { type: 'join', code, nickname });
    }
    hub.handle(host, { type: 'host', code, action: 'selectGame', gameId: 'most-likely-to' });
    hub.handle(host, { type: 'host', code, action: 'startGame' });
    await flush();
    const text = JSON.stringify(lines);
    expect(lines).toHaveLength(5);
    expect(text).not.toContain('MARKER');
    expect(text).not.toContain(code);
  });

  it('roundStarted reports only a transition that raised the round', () => {
    const deps = realDeps().roomDeps;
    const room = { ...createRoom(deps, new Set()), selectedGameId: 'guess-who', round: 1 };
    expect(roundStarted(room, { ...room, round: 2 })).toEqual({
      ev: 'round.start',
      game: 'guess-who',
      round: 2,
      players: 0,
    });
    expect(roundStarted(room, room)).toBeNull();
    expect(roundStarted(room, { ...room, round: 2, selectedGameId: null })).toBeNull();
  });

  it('U4 the stdout sink prints a prefixed, time-stamped JSON line', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    stdoutUsage({ ev: 'room.open' });
    const printed = String(log.mock.calls[0]?.[0]);
    expect(printed.startsWith('usage ')).toBe(true);
    const parsed: unknown = JSON.parse(printed.slice('usage '.length));
    expect(parsed).toMatchObject({ ev: 'room.open', t: expect.any(String) });
  });
});
