import { describe, expect, it } from 'vitest';
import { RoomHub } from './roomHub.js';
import {
  FakeConn,
  at,
  flush,
  hostToken,
  lastError,
  lastFrame,
  playerId,
  reconnectToken,
  seat,
} from './roomHub.testkit.js';
import { type ServerDeps, realDeps } from './serverDeps.js';

/**
 * Disconnect grace + reap: a dropped socket keeps its slot for a window (so a
 * reload resumes it via the reconnect token), then is reaped like a real leave.
 * A controllable schedule stands in for the real timer so the window is driven
 * deterministically instead of on the wall clock.
 */
function fakeTimerDeps(): { deps: ServerDeps; fireAll: () => void } {
  const base = realDeps();
  const pending: Array<{ callback: () => void; live: boolean }> = [];
  const deps: ServerDeps = {
    roomDeps: base.roomDeps,
    gameDeps: base.gameDeps,
    schedule: (callback) => {
      const entry = { callback, live: true };
      pending.push(entry);
      return () => {
        entry.live = false;
      };
    },
  };
  const fireAll = (): void => {
    for (const entry of pending.splice(0)) {
      if (entry.live) entry.callback();
    }
  };
  return { deps, fireAll };
}

async function openWith(deps: ServerDeps): Promise<[RoomHub, FakeConn, string]> {
  const hub = new RoomHub(deps);
  const host = new FakeConn();
  hub.handle(host, { type: 'open', nickname: 'Screen' });
  await flush();
  return [hub, host, lastFrame(host).code];
}

describe('disconnect grace + reap', () => {
  it('keeps a dropped player’s slot through the grace window and resumes it on reconnect', async () => {
    const { deps } = fakeTimerDeps();
    const [hub, host, code] = await openWith(deps);
    const a = at(await seat(hub, code, 3), 0);
    const id = playerId(a);
    const token = reconnectToken(a);
    hub.disconnect(a); // socket drops, no explicit leave
    await flush();
    expect(hub.hasRoom(code)).toBe(true);
    expect(lastFrame(host).players).toHaveLength(3); // slot still shown in the window
    const back = new FakeConn();
    hub.handle(back, { type: 'join', code, nickname: 'P0', reconnectToken: token });
    await flush();
    expect(playerId(back)).toBe(id); // same slot, not a fresh seat
    expect(lastFrame(back).players).toHaveLength(3);
  });

  it('reaps an abandoned slot once the grace window elapses', async () => {
    const { deps, fireAll } = fakeTimerDeps();
    const [hub, host, code] = await openWith(deps);
    hub.disconnect(at(await seat(hub, code, 3), 0));
    fireAll(); // window elapses with no reconnect
    await flush();
    expect(lastFrame(host).players).toHaveLength(2);
  });

  it('cancels the reaper on reconnect, so a late timeout does not evict the resumed slot', async () => {
    const { deps, fireAll } = fakeTimerDeps();
    const [hub, host, code] = await openWith(deps);
    const a = at(await seat(hub, code, 3), 0);
    const token = reconnectToken(a);
    hub.disconnect(a);
    const back = new FakeConn();
    hub.handle(back, { type: 'join', code, nickname: 'P0', reconnectToken: token });
    await flush();
    fireAll(); // the original grace timer fires late — must be a no-op now
    await flush();
    expect(lastFrame(host).players).toHaveLength(3);
  });

  it('discards the room only after the last player’s window elapses, not on the drop (P7)', async () => {
    const { deps, fireAll } = fakeTimerDeps();
    const [hub, , code] = await openWith(deps);
    const only = at(await seat(hub, code, 1), 0);
    hub.disconnect(only);
    await flush();
    expect(hub.hasRoom(code)).toBe(true); // alive in the window
    fireAll();
    await flush();
    expect(hub.hasRoom(code)).toBe(false); // reaped
  });

  it('cancels a pending reaper when the room closes under it (no timer into a dead session)', async () => {
    const { deps, fireAll } = fakeTimerDeps();
    const [hub, host, code] = await openWith(deps);
    hub.disconnect(at(await seat(hub, code, 1), 0)); // player drops → reaper pending
    hub.handle(host, { type: 'leave', code }); // host leaves → immediate P6 close, reaper still queued
    await flush();
    expect(hub.hasRoom(code)).toBe(false);
    fireAll(); // the cancelled reaper must not fire a leave into the gone session
    await flush();
    expect(hub.hasRoom(code)).toBe(false);
  });
});

/**
 * Host resume + grace (7.1): the host is not a player, so it gets a parallel path
 * — a server-minted `hostToken` in `opened`, a grace reap on drop, and
 * `resumeHost { code, hostToken }` to re-attach the board within the window.
 */
describe('host resume + grace', () => {
  it('opens with a hostToken that never appears in a frame roster', async () => {
    const { deps } = fakeTimerDeps();
    const [, host] = await openWith(deps);
    expect(hostToken(host)).toBeTruthy();
    // The secret is carried in `opened` only; a frame must not leak it anywhere.
    const framed = JSON.stringify(lastFrame(host));
    expect(framed).not.toContain(hostToken(host));
  });

  it('keeps the room through the grace window and re-attaches on resumeHost', async () => {
    const { deps } = fakeTimerDeps();
    const [hub, host, code] = await openWith(deps);
    await seat(hub, code, 3);
    const token = hostToken(host);
    hub.disconnect(host); // board reloads, socket drops
    await flush();
    expect(hub.hasRoom(code)).toBe(true); // alive in the window
    const back = new FakeConn();
    hub.handle(back, { type: 'resumeHost', code, hostToken: token });
    await flush();
    expect(hostToken(back)).toBe(token); // re-acked with the same secret
    expect(lastFrame(back).players).toHaveLength(3); // the board sees the live roster
  });

  it('closes the room once the host window elapses with no resume (P6)', async () => {
    const { deps, fireAll } = fakeTimerDeps();
    const [hub, host, code] = await openWith(deps);
    const a = at(await seat(hub, code, 3), 0);
    hub.disconnect(host);
    fireAll(); // window elapses
    await flush();
    expect(hub.hasRoom(code)).toBe(false);
    expect(lastError(a).message).toBe('ROOM_CLOSED'); // players told, like a host leave
  });

  it('cancels the host reaper on resume, so a late timeout does not close the room', async () => {
    const { deps, fireAll } = fakeTimerDeps();
    const [hub, host, code] = await openWith(deps);
    await seat(hub, code, 3);
    const token = hostToken(host);
    hub.disconnect(host);
    const back = new FakeConn();
    hub.handle(back, { type: 'resumeHost', code, hostToken: token });
    await flush();
    fireAll(); // the original host grace timer fires late — must be a no-op now
    await flush();
    expect(hub.hasRoom(code)).toBe(true);
  });

  it('rejects a wrong host token and leaves that connection unbound', async () => {
    const { deps } = fakeTimerDeps();
    const [hub, host, code] = await openWith(deps);
    await seat(hub, code, 3);
    hub.disconnect(host);
    await flush();
    const impostor = new FakeConn();
    hub.handle(impostor, { type: 'resumeHost', code, hostToken: 'not-the-secret' });
    await flush();
    expect(lastError(impostor).message).toBe('BAD_HOST_TOKEN');
    expect(hub.hasRoom(code)).toBe(true); // the real host can still resume
    // Unbound: a follow-up host action is refused as not-in-room, not accepted.
    hub.handle(impostor, { type: 'host', code, action: 'startGame' });
    expect(lastError(impostor).message).toBe('NOT_IN_ROOM');
  });

  it('refuses resumeHost for an unknown room and while already in a room', async () => {
    const { deps } = fakeTimerDeps();
    const [hub, host, code] = await openWith(deps);
    const ghost = new FakeConn();
    hub.handle(ghost, { type: 'resumeHost', code: 'ZZZZ', hostToken: 'x' });
    expect(lastError(ghost).message).toBe('NO_SUCH_ROOM');
    // The still-attached host may not resume a second time onto the same socket.
    hub.handle(host, { type: 'resumeHost', code, hostToken: hostToken(host) });
    expect(lastError(host).message).toBe('ALREADY_IN_ROOM');
  });
});
