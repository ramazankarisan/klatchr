import type { ServerMessage } from '@klatchr/protocol';
import type { Connection } from './connection.js';
import { RoomHub } from './roomHub.js';

/**
 * Shared harness for the RoomHub test suites (roomHub.test.ts +
 * roomHub.reconnect.test.ts): a recording fake connection, a microtask drain,
 * and message accessors. Kept out of the test files so neither trips the
 * per-file line cap; excluded from coverage as a `.testkit.ts`.
 */

export type Frame = Extract<ServerMessage, { type: 'frame' }>;
type Joined = Extract<ServerMessage, { type: 'joined' }>;
type ErrorMessage = Extract<ServerMessage, { type: 'error' }>;

export class FakeConn implements Connection {
  readonly received: ServerMessage[] = [];
  send(message: ServerMessage): void {
    this.received.push(message);
  }
}

/** Coalesced fan-out runs on a microtask; drain it so frames land before asserting. */
export const flush = (): Promise<void> => new Promise((resolve) => queueMicrotask(resolve));

const frames = (c: FakeConn): Frame[] => c.received.filter((m): m is Frame => m.type === 'frame');
export const lastFrame = (c: FakeConn): Frame => {
  const f = frames(c).at(-1);
  if (f === undefined) throw new Error('no frame received');
  return f;
};
const errors = (c: FakeConn): ErrorMessage[] =>
  c.received.filter((m): m is ErrorMessage => m.type === 'error');
export const lastError = (c: FakeConn): ErrorMessage => {
  const e = errors(c).at(-1);
  if (e === undefined) throw new Error('no error received');
  return e;
};
const joinedOf = (c: FakeConn): Joined => {
  const j = c.received.find((m): m is Joined => m.type === 'joined');
  if (j === undefined) throw new Error('never joined');
  return j;
};
export const playerId = (c: FakeConn): string => joinedOf(c).playerId;
export const reconnectToken = (c: FakeConn): string => joinedOf(c).reconnectToken;

/** Open a room and return [hub, hostConn, code] after the opening frame lands. */
export async function open(): Promise<[RoomHub, FakeConn, string]> {
  const hub = new RoomHub();
  const host = new FakeConn();
  hub.handle(host, { type: 'open', nickname: 'Screen' });
  await flush();
  return [hub, host, lastFrame(host).code];
}

/** Seat `n` players into `code`; return their connections in join order. */
export async function seat(hub: RoomHub, code: string, n: number): Promise<FakeConn[]> {
  const conns = Array.from({ length: n }, () => new FakeConn());
  for (const [i, conn] of conns.entries()) {
    hub.handle(conn, { type: 'join', code, nickname: `P${i}` });
  }
  await flush();
  return conns;
}

/** Indexed access under noUncheckedIndexedAccess — a missing seat is a test bug. */
export function at(conns: FakeConn[], i: number): FakeConn {
  const conn = conns[i];
  if (conn === undefined) throw new Error(`no seat ${i}`);
  return conn;
}
