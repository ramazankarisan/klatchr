import { describe, expect, it } from 'vitest';
import { RoomHub } from './roomHub.js';
import {
  FakeConn,
  at,
  flush,
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
});
