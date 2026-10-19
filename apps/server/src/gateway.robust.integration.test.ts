import { afterEach, describe, expect, it } from 'vitest';
import { WsClient, fakeTimerDeps, fireUntil, settle } from './gateway.integration.testkit.js';
import { RoomHub } from './roomHub.js';
import { CLOSE, type SocketOptions, type SocketServer, startSocketServer } from './socketServer.js';

/**
 * plan-15 §4 over a real socket: the heartbeat (S3), the handshake deadline (S2),
 * one device per seat (S9) and the abuse limits (S20). Timings are shrunk to
 * milliseconds; the reap after a dead socket still runs on the injected schedule.
 */

let server: SocketServer;
let fireAll: () => void;
let url: string;

async function startWith(opts: Omit<SocketOptions, 'port'> = {}): Promise<void> {
  const timers = fakeTimerDeps();
  fireAll = timers.fireAll;
  server = await startSocketServer(new RoomHub(timers.deps), { port: 0, ...opts });
  url = `ws://127.0.0.1:${server.port}`;
}

afterEach(async () => {
  await server?.close();
});

async function openRoom(): Promise<[WsClient, string]> {
  const host = new WsClient(url);
  await host.open();
  host.send({ type: 'open', nickname: 'Screen' });
  const frame = await host.waitForFrame(() => true);
  return [host, frame.code];
}

describe('heartbeat (S3)', () => {
  it('drops a socket that stops answering pings, and the seat is then reaped', async () => {
    await startWith({ heartbeatMs: 30 });
    const [host, code] = await openRoom();
    // A half-open phone: connected, joined, but it never answers a ping.
    const ghost = new WsClient(url, { autoPong: false });
    await ghost.open();
    ghost.send({ type: 'join', code, nickname: 'Ghost' });
    await ghost.waitForJoined();
    await host.waitForFrame((f) => f.players.length === 1);
    await ghost.closed; // terminated by the server after a missed ping
    await fireUntil(fireAll, () => host.lastFrame().players.length === 0);
  });

  it('keeps a socket that answers', async () => {
    await startWith({ heartbeatMs: 20 });
    const [host] = await openRoom();
    await settle(120); // several heartbeats
    host.send({ type: 'ping' });
    await host.waitFor((m) => m.type === 'pong');
  });
});

describe('handshake deadline (S2)', () => {
  it('closes a socket that never opens or joins a room', async () => {
    await startWith({ handshakeMs: 30 });
    const idle = new WsClient(url);
    await idle.open();
    expect(await idle.closed).toBe(CLOSE.handshakeTimeout);
  });

  it('leaves a socket that did join alone', async () => {
    await startWith({ handshakeMs: 30 });
    const [host] = await openRoom();
    await settle(80);
    host.send({ type: 'ping' });
    await host.waitFor((m) => m.type === 'pong');
  });
});

describe('one device per seat (S9)', () => {
  it('closes the older socket with the superseded code when a seat is resumed elsewhere', async () => {
    await startWith();
    const [, code] = await openRoom();
    const laptop = new WsClient(url);
    await laptop.open();
    laptop.send({ type: 'join', code, nickname: 'Ada' });
    const joined = await laptop.waitForJoined();
    const phone = new WsClient(url);
    await phone.open();
    phone.send({ type: 'join', code, nickname: 'Ada', reconnectToken: joined.reconnectToken });
    expect((await phone.waitForJoined()).playerId).toBe(joined.playerId);
    expect(await laptop.closed).toBe(CLOSE.superseded);
    expect(laptop.messages.some((m) => m.type === 'error' && m.message === 'SUPERSEDED')).toBe(
      true,
    );
  });
});

describe('abuse limits (S20)', () => {
  it('rate-limits a flood: one RATE_LIMITED notice, then a close if it keeps going', async () => {
    await startWith({ rate: { perSecond: 0.001, burst: 5 } }); // no refill within the test
    const flood = new WsClient(url);
    await flood.open();
    for (let i = 0; i < 250; i += 1) {
      flood.send({ type: 'ping' });
    }
    expect(await flood.closed).toBe(CLOSE.rateLimited);
    const notices = flood.messages.filter(
      (m) => m.type === 'error' && m.message === 'RATE_LIMITED',
    );
    expect(notices).toHaveLength(1);
    expect(flood.messages.filter((m) => m.type === 'pong')).toHaveLength(5); // the burst got through
  });

  it('caps sockets per client address behind the proxy, per forwarded address', async () => {
    await startWith({ maxConnsPerIp: 2, trustProxy: true });
    // The last hop is the one our proxy appended; the first is whatever the client claimed.
    const from = (ip: string) =>
      new WsClient(url, { headers: { 'x-forwarded-for': `9.9.9.9, ${ip}` } });
    const [a, b] = [from('1.1.1.1'), from('1.1.1.1')];
    await Promise.all([a.open(), b.open()]);
    const third = from('1.1.1.1');
    expect(await third.closed).toBe(CLOSE.tooManyConnections);
    const other = from('2.2.2.2'); // a different client is unaffected
    await other.open();
    other.send({ type: 'ping' });
    await other.waitFor((m) => m.type === 'pong');
  });

  it('ignores a forged X-Forwarded-For unless the proxy is trusted', async () => {
    await startWith({ maxConnsPerIp: 1 });
    const a = new WsClient(url, { headers: { 'x-forwarded-for': '1.1.1.1' } });
    await a.open();
    // Same real peer (127.0.0.1), a different forged header: still the same client.
    const b = new WsClient(url, { headers: { 'x-forwarded-for': '9.9.9.9' } });
    expect(await b.closed).toBe(CLOSE.tooManyConnections);
  });
});
