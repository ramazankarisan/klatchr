import { describe, expect, it } from 'vitest';
import { stubGame } from './game.testkit.js';
import { ok } from './result.js';
import { scenario } from './scenario.testkit.js';

/**
 * The scenario DSL's own semantics (plan-13 L2), proven on a stub game. The
 * server's grace policy maps onto pure core exactly once, here:
 *   drop-within-grace = NO core event (the slot stays);
 *   reap              = leave (what the server does after 30s);
 *   rejoin-after-reap = a fresh join (new id);
 *   resume            = join with the stored reconnect token (same id).
 */

/** A stub whose view echoes the viewer — proves view() routing per viewer. */
const echoGame = () => stubGame({ view: (_state, viewer) => viewer, reduce: (state) => ok(state) });

const scoring = () =>
  stubGame({
    isComplete: () => true, // any game event ends the round
    scores: () => [{ playerId: 'p1', points: 1 }],
  });

describe('scenario DSL semantics', () => {
  it('join seats players and start opens round 1', () => {
    const s = scenario(stubGame()).join('Ada', 'Bo', 'Cy').start();
    expect(s.room.phase).toBe('IN_GAME');
    expect(s.room.round).toBe(1);
    expect(s.room.players.map((p) => p.nickname)).toEqual(['Ada', 'Bo', 'Cy']);
    expect(s.id('Ada')).toBe(s.room.players[0]?.id);
  });

  it('round(n) walks start/end pairs until in-game at round n', () => {
    const s = scenario(scoring()).join('Ada', 'Bo', 'Cy').round(4);
    expect(s.room.phase).toBe('IN_GAME');
    expect(s.room.round).toBe(4);
    expect(s.room.sessionScores).toEqual({ p1: 3 }); // three aborted rounds folded
  });

  it('a rejected step throws with the room error code', () => {
    expect(() => scenario(stubGame()).join('Ada').start()).toThrowError(/BELOW_MIN_PLAYERS/);
  });

  it('drop-within-grace is no core event: room and views stay identical', () => {
    const s = scenario(echoGame()).join('Ada', 'Bo', 'Cy').start();
    const before = s.room;
    s.dropWithinGrace('Bo');
    expect(s.room).toBe(before); // not just equal — the very same state
    expect(s.room.players.map((p) => p.nickname)).toContain('Bo');
  });

  it('reap is leave: seat pruned, submissions policy left to the game', () => {
    const s = scenario(echoGame()).join('Ada', 'Bo', 'Cy').start().reap('Bo');
    expect(s.room.players.map((p) => p.nickname)).toEqual(['Ada', 'Cy']);
  });

  it('rejoin after reap is a fresh join with a new id', () => {
    const s = scenario(echoGame()).join('Ada', 'Bo', 'Cy').start();
    const oldId = s.id('Bo');
    s.reap('Bo').rejoin('Bo');
    expect(s.id('Bo')).not.toBe(oldId);
    expect(s.room.players.map((p) => p.nickname)).toEqual(['Ada', 'Cy', 'Bo']);
  });

  it('resume after a reap throws instead of silently minting a new seat', () => {
    const s = scenario(echoGame()).join('Ada', 'Bo', 'Cy').start().reap('Bo');
    expect(() => s.resume('Bo')).toThrowError(/stale/); // the token died with the seat — use rejoin
  });

  it('resume within grace keeps the same seat — state byte-identical (E3)', () => {
    const s = scenario(echoGame()).join('Ada', 'Bo', 'Cy').start();
    const before = s.room;
    const id = s.id('Bo');
    s.resume('Bo');
    expect(s.room).toBe(before); // token join is a no-op resume, not a new seat
    expect(s.id('Bo')).toBe(id);
  });

  it('view() renders through the game for the named player and the host', () => {
    const s = scenario(echoGame()).join('Ada', 'Bo', 'Cy').start();
    expect(s.view('host')).toEqual({ role: 'host' });
    expect(s.view('Ada')).toEqual({ role: 'player', id: s.id('Ada') });
  });

  it('attempt() surfaces a rejection instead of throwing', () => {
    const s = scenario(stubGame()).join('Ada', 'Bo', 'Cy'); // still LOBBY
    const result = s.attempt({ type: 'anything' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('GAME_EVENT_OUTSIDE_GAME');
    }
  });

  it('host leaving closes the room at any phase (P6 — the host-analog rows)', () => {
    const lobby = scenario(stubGame()).join('Ada', 'Bo', 'Cy').hostLeaves();
    expect(lobby.room.closed).toBe(true);
    const inGame = scenario(stubGame()).join('Ada', 'Bo', 'Cy').start().hostLeaves();
    expect(inGame.room.closed).toBe(true);
  });

  it('attempt() applies the new state when the event is accepted', () => {
    const game = stubGame({ reduce: () => ok({ moves: 1 }), view: (state) => state });
    const s = scenario(game).join('Ada', 'Bo', 'Cy').start();
    const result = s.attempt({ type: 'poke' });
    expect(result.ok).toBe(true);
    expect(s.view('host')).toEqual({ moves: 1 });
  });
});
