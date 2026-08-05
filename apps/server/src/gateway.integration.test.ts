import { get } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WsClient, fakeTimerDeps, fireUntil, settle } from './gateway.integration.testkit.js';
import { RoomHub } from './roomHub.js';
import { type SocketServer, startSocketServer } from './socketServer.js';

/**
 * ws-integration (plan-14 L3): the real socket path — the gateway's wiring, JSON
 * on the wire, a real `socket.close()` → grace → reap, and the static branch —
 * exercised with a real `ws` client on an ephemeral port, no browser. Fills the
 * gap between the FakeConn unit tests and the browser E2E. Timers are driven by
 * the injected schedule, so nothing waits on the wall clock.
 */

let server: SocketServer;
let fireAll: () => void;
let url: string;

async function startWith(distDir?: string): Promise<void> {
  const timers = fakeTimerDeps();
  fireAll = timers.fireAll;
  const hub = new RoomHub(timers.deps);
  server = await startSocketServer(hub, distDir === undefined ? { port: 0 } : { port: 0, distDir });
  url = `ws://127.0.0.1:${server.port}`;
}

afterEach(async () => {
  await server?.close();
});

/** Open a room over a real socket; resolve with [host client, room code]. */
async function openRoom(): Promise<[WsClient, string]> {
  const host = new WsClient(url);
  await host.open();
  host.send({ type: 'open', nickname: 'Screen' });
  const frame = await host.waitForFrame(() => true);
  return [host, frame.code];
}

async function seat(code: string, nickname: string): Promise<[WsClient, string]> {
  const client = new WsClient(url);
  await client.open();
  client.send({ type: 'join', code, nickname });
  const joined = await client.waitForJoined();
  return [client, joined.playerId];
}

describe('ws-integration: a room over a real socket', () => {
  beforeEach(async () => {
    await startWith();
  });

  it('A4: opens, seats three, and redacts a round over the wire', async () => {
    const [host, code] = await openRoom();
    expect(host.lastFrame().phase).toBe('LOBBY');

    const [a] = await seat(code, 'Ada');
    const [b] = await seat(code, 'Bo');
    const [c] = await seat(code, 'Cy');
    await host.waitForFrame((f) => f.players.length === 3);

    host.send({ type: 'host', code, action: 'selectGame', gameId: 'guess-who' });
    host.send({ type: 'host', code, action: 'startGame' });
    await a.waitForFrame((f) => f.gameView !== null);

    a.send({ type: 'play', code, event: { type: 'submit', text: 'Ada-secret' } });
    // Bo's frame must never carry Ada's answer text — redaction survives the wire.
    const bFrame = await b.waitForFrame((f) => f.gameView !== null);
    expect(JSON.stringify(bFrame)).not.toContain('Ada-secret');
    expect(c.lastFrame().players).toHaveLength(3);
  });

  it('A5: a real socket close holds the slot through grace, then reaps it', async () => {
    const [host, code] = await openRoom();
    const [a, aId] = await seat(code, 'Ada');
    await seat(code, 'Bo');
    await seat(code, 'Cy');
    await host.waitForFrame((f) => f.players.length === 3);

    a.close(); // the socket drops — the slot must survive the grace window
    await settle(); // let the server process the close (schedules a reaper, emits no frame)
    expect(host.lastFrame().players).toHaveLength(3); // a drop alone is not a reap
    expect(host.lastFrame().players.some((p) => p.id === aId)).toBe(true);

    // The grace window elapses — fire until the reap lands (the drop reached the
    // server asynchronously, so the reaper may not exist on the first fire).
    await fireUntil(fireAll, () => host.lastFrame().players.length === 2);
    expect(host.lastFrame().players.some((p) => p.id === aId)).toBe(false);
  });

  it('A5: a reconnect within grace resumes the same id', async () => {
    const [host, code] = await openRoom();
    const [a, aId] = await seat(code, 'Ada');
    await seat(code, 'Bo');
    await seat(code, 'Cy');
    const joined = await a.waitForJoined();
    await host.waitForFrame((f) => f.players.length === 3);

    a.close();
    await settle(); // the drop registers (a reaper is now pending)
    const back = new WsClient(url);
    await back.open();
    back.send({ type: 'join', code, nickname: 'Ada', reconnectToken: joined.reconnectToken });
    const rejoined = await back.waitForJoined();
    expect(rejoined.playerId).toBe(aId); // same slot, not a fourth seat

    fireAll(); // the cancelled reaper must not evict the resumed slot
    await settle(20);
    expect(host.lastFrame().players.some((p) => p.id === aId)).toBe(true);
  });

  it('A6: malformed JSON over the wire draws exactly one error frame', async () => {
    const host = new WsClient(url);
    await host.open();
    host.sendRaw('{ not valid json');
    await host.waitFor((m) => m.type === 'error');
    expect(host.messages.filter((m) => m.type === 'error')).toHaveLength(1);
  });
});

describe('ws-integration: the static branch', () => {
  it('A6: a GET with no WEB_DIST is a bare 404', async () => {
    await startWith(); // distDir undefined
    const status = await new Promise<number>((resolve) => {
      get(`http://127.0.0.1:${server.port}/`, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
    });
    expect(status).toBe(404);
  });
});
