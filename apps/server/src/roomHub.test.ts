import { beforeEach, describe, expect, it } from 'vitest';
import { RoomHub } from './roomHub.js';
import {
  FakeConn,
  type Frame,
  at,
  flush,
  lastError,
  lastFrame,
  open,
  playerId,
  reconnectToken,
  seat,
} from './roomHub.testkit.js';

// Views are opaque on the wire; in tests we read the already-redacted result freely.
const gv = (f: Frame) => JSON.parse(JSON.stringify(f.gameView));

describe('open', () => {
  it('pushes the host a frame immediately and never a joined (5.1 review)', async () => {
    const [, host] = await open();
    expect(host.received.some((m) => m.type === 'joined')).toBe(false);
    const frame = lastFrame(host);
    expect(frame.phase).toBe('LOBBY');
    expect(frame.players).toEqual([]);
    expect(frame.code).toEqual(expect.any(String));
    expect(frame.gameView).toBeNull();
  });
});

describe('join', () => {
  it('acks with joined then broadcasts the roster to every connection', async () => {
    const [hub, host, code] = await open();
    const conns = await seat(hub, code, 3);
    for (const p of conns) {
      expect(playerId(p)).toEqual(expect.any(String));
      expect(lastFrame(p).players).toHaveLength(3);
    }
    expect(lastFrame(host).players).toHaveLength(3); // the host board sees the roster too
  });

  it('rejects a join to an unknown room', async () => {
    const [hub] = await open();
    const stranger = new FakeConn();
    hub.handle(stranger, { type: 'join', code: 'ZZZZ', nickname: 'Late' });
    expect(lastError(stranger).message).toBe('NO_SUCH_ROOM');
  });

  it('resumes a slot on a matching reconnect token without a duplicate roster entry', async () => {
    const [hub, , code] = await open();
    const a = at(await seat(hub, code, 3), 0);
    const id = playerId(a);
    const back = new FakeConn();
    hub.handle(back, { type: 'join', code, nickname: 'P0', reconnectToken: reconnectToken(a) });
    await flush();
    expect(playerId(back)).toBe(id); // same slot
    expect(lastFrame(back).players).toHaveLength(3); // resumed, not a 4th seat
  });

  it('never puts the reconnect token in a frame (it is a secret, not roster data)', async () => {
    const [hub, host, code] = await open();
    const a = at(await seat(hub, code, 3), 0);
    const secret = reconnectToken(a);
    expect(secret).not.toBe(playerId(a)); // token is distinct from the public id
    expect(JSON.stringify(lastFrame(host))).not.toContain(secret);
    expect(JSON.stringify(lastFrame(a))).not.toContain(secret);
  });

  it('refuses to resume with a public playerId as the token (impersonation blocked)', async () => {
    const [hub, , code] = await open();
    const a = at(await seat(hub, code, 3), 0);
    const attacker = new FakeConn();
    // The attacker knows A's id (it's in every roster) but not A's secret.
    hub.handle(attacker, { type: 'join', code, nickname: 'evil', reconnectToken: playerId(a) });
    await flush();
    expect(playerId(attacker)).not.toBe(playerId(a)); // a new, distinct slot — not A
    expect(lastFrame(attacker).players).toHaveLength(4); // a 4th seat, not a resume
  });
});

describe('a full round: authority, redaction, scores', () => {
  let hub: RoomHub;
  let host: FakeConn;
  let code: string;
  let a: FakeConn;
  let b: FakeConn;
  let c: FakeConn;

  beforeEach(async () => {
    [hub, host, code] = await open();
    const conns = await seat(hub, code, 3);
    a = at(conns, 0);
    b = at(conns, 1);
    c = at(conns, 2);
  });

  const start = async (): Promise<void> => {
    hub.handle(host, { type: 'host', code, action: 'selectGame', gameId: 'guess-who' });
    hub.handle(host, { type: 'host', code, action: 'startGame' });
    await flush();
  };

  it('only the host may select or start a game', async () => {
    hub.handle(a, { type: 'host', code, action: 'selectGame', gameId: 'guess-who' });
    expect(lastError(a).message).toBe('NOT_HOST');
    await flush();
    expect(lastFrame(host).phase).toBe('LOBBY'); // unchanged
  });

  it('rejects selectGame with no gameId (5.1 review)', async () => {
    hub.handle(host, { type: 'host', code, action: 'selectGame' });
    expect(lastError(host).message).toBe('NO_GAME_ID');
  });

  it('withholds every other player’s answer and all authorship through the round', async () => {
    await start();
    expect(gv(lastFrame(host)).phase).toBe('collect');

    hub.handle(a, { type: 'play', code, event: { type: 'submit', text: 'Ans-A' } });
    hub.handle(b, { type: 'play', code, event: { type: 'submit', text: 'Ans-B' } });
    await flush();

    // A player never sees another's text; the host (shared screen) never sees any text.
    expect(JSON.stringify(lastFrame(b).gameView)).not.toContain('Ans-A');
    expect(JSON.stringify(lastFrame(host).gameView)).not.toContain('Ans-A');
    expect(gv(lastFrame(a)).youSubmitted).toBe(true);
    expect(gv(lastFrame(host)).submittedCount).toBe(2);
    expect(lastFrame(a).scores).toBeNull(); // scores withheld until reveal

    hub.handle(host, { type: 'play', code, event: { type: 'advance', from: 'collect' } });
    await flush();
    // Guess phase: cards are anonymised — no authorId crosses the boundary.
    expect(gv(lastFrame(a)).phase).toBe('guess');
    expect(JSON.stringify(lastFrame(a).gameView)).not.toContain('authorId');
    expect(JSON.stringify(lastFrame(host).gameView)).not.toContain('authorId');

    hub.handle(host, { type: 'play', code, event: { type: 'advance', from: 'guess' } });
    await flush();
    const reveal = lastFrame(host);
    expect(reveal.phase).toBe('SCORES');
    expect(reveal.scores).toEqual(expect.arrayContaining([]));
    expect(Array.isArray(reveal.scores)).toBe(true);
  });

  it('stamps a play with the sender’s id, ignoring a forged playerId', async () => {
    await start();
    hub.handle(a, {
      type: 'play',
      code,
      event: { type: 'submit', playerId: 'FORGED', text: 'Ans-A' },
    });
    await flush();
    expect(gv(lastFrame(host)).submitted).toEqual([playerId(a)]); // stamped to A, not FORGED
  });

  it('lets only the host advance; a player advance is refused', async () => {
    await start();
    hub.handle(a, { type: 'play', code, event: { type: 'advance', from: 'collect' } });
    expect(lastError(a).message).toBe('ADVANCE_IS_HOST_ONLY');
    await flush();
    expect(gv(lastFrame(host)).phase).toBe('collect'); // still collect
  });

  it('refuses a non-advance play from the host (the host is not a player)', async () => {
    await start();
    hub.handle(host, { type: 'play', code, event: { type: 'submit', text: 'sneaky' } });
    expect(lastError(host).message).toBe('HOST_CANNOT_PLAY');
  });

  it('records a valid guess under the sender’s id', async () => {
    await start();
    hub.handle(a, { type: 'play', code, event: { type: 'submit', text: 'Ans-A' } });
    hub.handle(b, { type: 'play', code, event: { type: 'submit', text: 'Ans-B' } });
    hub.handle(c, { type: 'play', code, event: { type: 'submit', text: 'Ans-C' } });
    hub.handle(host, { type: 'play', code, event: { type: 'advance', from: 'collect' } });
    await flush();
    const card = gv(lastFrame(a)).cards.find((k: { text: string }) => k.text !== 'Ans-A');
    hub.handle(a, {
      type: 'play',
      code,
      event: { type: 'guess', cardId: card.id, author: playerId(b) },
    });
    await flush();
    expect(gv(lastFrame(host)).guessed).toEqual([playerId(a)]);
  });
});

describe('parsing the boundary (rule 2)', () => {
  it('rejects malformed JSON', () => {
    const hub = new RoomHub();
    const conn = new FakeConn();
    hub.receive(conn, '{ not json');
    expect(lastError(conn).message).toBe('MALFORMED_JSON');
  });

  it('rejects a well-formed message of the wrong shape', () => {
    const hub = new RoomHub();
    const conn = new FakeConn();
    hub.receive(conn, JSON.stringify({ type: 'open' })); // missing nickname
    expect(lastError(conn).message).toBe('MALFORMED_MESSAGE');
    hub.receive(conn, JSON.stringify({ type: 'nope' }));
    expect(lastError(conn).message).toBe('MALFORMED_MESSAGE');
  });

  it('routes a parsed open through receive, opening a room', async () => {
    const hub = new RoomHub();
    const host = new FakeConn();
    hub.receive(host, JSON.stringify({ type: 'open', nickname: 'Screen' }));
    await flush();
    expect(hub.hasRoom(lastFrame(host).code)).toBe(true);
  });
});

describe('lifecycle guards and empty-room discard (rule 7)', () => {
  it('refuses play/host/leave from a connection in no room', () => {
    const hub = new RoomHub();
    const conn = new FakeConn();
    hub.handle(conn, { type: 'play', code: 'ABCD', event: { type: 'submit' } });
    expect(lastError(conn).message).toBe('NOT_IN_ROOM');
    hub.handle(conn, { type: 'leave', code: 'ABCD' });
    expect(lastError(conn).message).toBe('NOT_IN_ROOM');
  });

  it('discards the room when the host leaves and tells the players (P6)', async () => {
    const [hub, host, code] = await open();
    const a = at(await seat(hub, code, 3), 0);
    hub.handle(host, { type: 'leave', code });
    await flush();
    expect(hub.hasRoom(code)).toBe(false);
    expect(lastError(a).message).toBe('ROOM_CLOSED');
  });

  it('discards the room when the last player leaves (P7)', async () => {
    const [hub, , code] = await open();
    const only = at(await seat(hub, code, 1), 0);
    hub.handle(only, { type: 'leave', code });
    await flush();
    expect(hub.hasRoom(code)).toBe(false);
  });

  it('keeps the room alive when the host socket drops, pending its grace window (7.1)', async () => {
    // A host drop is no longer an immediate close: it schedules a reap so a
    // reloaded host can `resumeHost` within the window. The reap-fires-and-closes
    // path is driven with a fake timer in roomHub.reconnect.test.ts.
    const [hub, host, code] = await open();
    await seat(hub, code, 3);
    hub.disconnect(host);
    await flush();
    expect(hub.hasRoom(code)).toBe(true);
  });

  it('unbinds bystanders on close, so a player can open a fresh room afterwards', async () => {
    const [hub, host, code] = await open();
    const a = at(await seat(hub, code, 3), 0);
    hub.handle(host, { type: 'leave', code }); // closes the room out from under A
    await flush();
    hub.handle(a, { type: 'open', nickname: 'NewScreen' });
    await flush();
    const fresh = lastFrame(a);
    expect(fresh.code).not.toBe(code);
    expect(hub.hasRoom(fresh.code)).toBe(true);
    expect(a.received.some((m) => m.type === 'error' && m.message === 'ALREADY_IN_ROOM')).toBe(
      false,
    );
  });
});

describe('rejected connections and forwarded game errors', () => {
  it('refuses a second open on a connection already in a room', async () => {
    const [hub, host] = await open();
    hub.handle(host, { type: 'open', nickname: 'Again' });
    expect(lastError(host).message).toBe('ALREADY_IN_ROOM');
  });

  it('refuses a join from a connection already in a room', async () => {
    const [hub, host, code] = await open();
    hub.handle(host, { type: 'join', code, nickname: 'HostAsPlayer' });
    expect(lastError(host).message).toBe('ALREADY_IN_ROOM');
  });

  it('surfaces a core join rejection and leaves the connection unbound', async () => {
    const [hub, , code] = await open();
    const conn = new FakeConn();
    hub.handle(conn, { type: 'join', code, nickname: '   ' }); // core normalises to empty
    expect(lastError(conn).message).toBe('EMPTY_NICKNAME');
    // Not bound to the room, so a follow-up action is refused as not-in-room.
    hub.handle(conn, { type: 'play', code, event: { type: 'submit', text: 'x' } });
    expect(lastError(conn).message).toBe('NOT_IN_ROOM');
  });

  it('forwards a game rejection (a play before the game starts)', async () => {
    const [hub, , code] = await open();
    const a = at(await seat(hub, code, 3), 0);
    hub.handle(a, { type: 'play', code, event: { type: 'submit', text: 'early' } });
    expect(lastError(a).message).toBe('GAME_EVENT_OUTSIDE_GAME');
  });

  it('keeps the inner reason when the game itself rejects a play', async () => {
    const [hub, host, code] = await open();
    const a = at(await seat(hub, code, 3), 0);
    hub.handle(host, { type: 'host', code, action: 'selectGame', gameId: 'guess-who' });
    hub.handle(host, { type: 'host', code, action: 'startGame' });
    await flush();
    // Guessing during the collect phase is a game-level WRONG_PHASE (wrapped GAME_REJECTED).
    hub.handle(a, {
      type: 'play',
      code,
      event: { type: 'guess', cardId: 'c0', author: playerId(a) },
    });
    expect(lastError(a).message).toBe('GAME_REJECTED: WRONG_PHASE');
  });
});
