import { scenario } from '@klatchr/core/scenario';
import { describe, expect, it } from 'vitest';
import { mostLikelyTo } from './mostLikelyTo.js';
import type { MLTState } from './state.js';

/**
 * The reconnect matrix for Most Likely To (plan-13 A5–A8): the scenario DSL
 * walks {drop-within-grace, reap, rejoin} across every phase. A leaver's vote
 * keeps counting and they stay a candidate — leaving must not swing a result.
 */

type S = ReturnType<typeof trio>;

function trio(config?: unknown) {
  return scenario(mostLikelyTo, config).join('Ada', 'Bo', 'Cy');
}

const mlt = (s: S): MLTState => s.room.gameState as MLTState; // own state, typed in-package
const nicks = (s: S): string[] => s.room.players.map((p) => p.nickname);

/** Everyone votes Ada; the round then completes with a known tally. */
function voteAll(s: S): S {
  for (const nick of ['Ada', 'Bo', 'Cy']) {
    s.play({ type: 'vote', playerId: s.id(nick), target: s.id('Ada') });
  }
  return s;
}

const toResults = (s: S): S => voteAll(s).play({ type: 'advance', from: 'vote' });

describe('drop within grace — every phase, the world stands still (A5)', () => {
  it('LOBBY', () => {
    trio().dropWithinGrace('Bo');
  });

  it('vote (with a vote already cast)', () => {
    const s = trio().start();
    s.play({ type: 'vote', playerId: s.id('Bo'), target: s.id('Ada') });
    s.dropWithinGrace('Bo');
  });

  it('results / SCORES', () => {
    toResults(trio().start()).dropWithinGrace('Bo');
  });

  it('game-over (the set is spent)', () => {
    const s = toResults(trio({ prompts: ['The only question?'] }).start());
    s.dropWithinGrace('Bo');
    expect(() => s.start()).toThrowError(/SESSION_COMPLETE/); // this IS game-over
  });
});

describe('reap mid-round — seat pruned, the vote still counts (A6)', () => {
  it('vote: the reaped player’s vote survives and they stay a candidate', () => {
    const s = trio().start();
    const bo = s.id('Bo');
    s.play({ type: 'vote', playerId: bo, target: s.id('Ada') });
    s.reap('Bo');
    expect(nicks(s)).toEqual(['Ada', 'Cy']); // roster prunes
    expect(mlt(s).votes[bo]).toBe(s.id('Ada')); // the vote survives
    expect(mlt(s).roster).toContain(bo); // still votable — leaving must not swing a result
    s.play({ type: 'vote', playerId: s.id('Ada'), target: s.id('Ada') });
    s.play({ type: 'advance', from: 'vote' });
    expect(s.room.sessionScores[s.id('Ada')]).toBe(2); // Bo's vote counted in the tally
  });

  it('SCORES: reaping after results parks the folded tally by nickname', () => {
    const s = toResults(trio().start());
    const ada = s.id('Ada');
    expect(s.room.sessionScores[ada]).toBe(3); // everyone voted Ada
    s.reap('Ada');
    expect(s.room.sessionScores[ada]).toBeUndefined();
    expect(s.room.scoreLedger).toEqual({ ada: 3 });
  });

  it('LOBBY: a reap before the round simply prunes the seat', () => {
    const s = trio().reap('Bo');
    expect(nicks(s)).toEqual(['Ada', 'Cy']);
  });
});

describe('rejoin after reap — spectator now, dealt in next round (A7)', () => {
  it('mid-round the fresh id spectates and cannot vote; next round seats it', () => {
    const s = trio().start();
    const oldBo = s.id('Bo');
    s.reap('Bo').rejoin('Bo');
    const newBo = s.id('Bo');
    expect(newBo).not.toBe(oldBo);
    expect(s.room.players.find((p) => p.id === newBo)?.spectator).toBe(true);
    const refused = s.attempt({ type: 'vote', playerId: newBo, target: s.id('Ada') });
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.error.message).toBe('NOT_PLAYING'); // not in this round's pool
    }
    s.endGame().start(); // next round
    expect(s.room.players.find((p) => p.id === newBo)?.spectator).toBe(false);
    expect(mlt(s).roster).toContain(newBo); // rotation dealt them in
  });

  it('A8 end to end: a spent night is parked at game-over and reclaimed by name', () => {
    const s = toResults(trio({ prompts: ['The only question?'] }).start());
    expect(s.room.sessionScores[s.id('Ada')]).toBe(3);
    s.reap('Ada'); // e.g. the phone died on the results screen
    expect(s.room.scoreLedger).toEqual({ ada: 3 });
    s.rejoin('Ada');
    expect(s.room.sessionScores[s.id('Ada')]).toBe(3); // the night survived
    expect(s.room.scoreLedger).toEqual({});
  });
});
