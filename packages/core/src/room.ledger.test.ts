import { describe, expect, it } from 'vitest';
import type { Player } from './ids.js';
import { roomReduce } from './room.js';
import { asPlayer, ctxWith, player, room } from './room.testkit.js';

/**
 * D4 nickname-reclaim (plan-13 A8–A10): a player reaped past the grace window
 * loses their seat but not their night — `leave` parks the session score in a
 * room-level ledger keyed by nickname, and a fresh `join` with the same
 * nickname reclaims it. Same trust level as the resume token (rule 7).
 */

function named(id: string, nickname: string): Player {
  return { ...player(id), nickname };
}

describe('leave parks the session score by nickname (D4)', () => {
  it('A8: moves the leaver’s tally into the ledger under their nickname', () => {
    const r = room({
      players: [named('p1', 'Ada'), player('p2'), player('p3')],
      sessionScores: { p1: 5, p2: 2 },
    });
    const result = roomReduce(r, { type: 'leave' }, asPlayer('p1'), ctxWith());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sessionScores).toEqual({ p2: 2 }); // ghost fix intact (B6)
      expect(result.value.scoreLedger).toEqual({ ada: 5 }); // parked, keyed case-insensitively
    }
  });

  it('parks nothing when the leaver never scored', () => {
    const r = room({ players: [named('p1', 'Ada'), player('p2')], sessionScores: { p2: 2 } });
    const result = roomReduce(r, { type: 'leave' }, asPlayer('p1'), ctxWith());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.scoreLedger).toEqual({});
    }
  });

  it('a later leaver with the same nickname overwrites the parked slot (last leaver wins)', () => {
    const r = room({
      players: [named('p9', 'Ada'), player('p2')],
      sessionScores: { p9: 7 },
      scoreLedger: { ada: 3 },
    });
    const result = roomReduce(r, { type: 'leave' }, asPlayer('p9'), ctxWith());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.scoreLedger).toEqual({ ada: 7 });
    }
  });
});

describe('join reclaims a parked score by nickname (D4)', () => {
  it('A8: a rejoin with the matching nickname starts at the parked score and consumes the slot', () => {
    const r = room({ players: [player('x1')], scoreLedger: { ada: 5 } });
    const result = roomReduce(r, { type: 'join', nickname: 'Ada' }, HOSTLESS, ctxWith());
    expect(result.ok).toBe(true);
    if (result.ok) {
      const rejoined = result.value.players[1];
      expect(rejoined?.nickname).toBe('Ada');
      expect(result.value.sessionScores).toEqual({ [rejoined?.id ?? '']: 5 });
      expect(result.value.scoreLedger).toEqual({}); // consumed
    }
  });

  it('matches case-insensitively — phone keyboards auto-capitalise', () => {
    const r = room({ scoreLedger: { ada: 5 } });
    const result = roomReduce(r, { type: 'join', nickname: 'ADA' }, HOSTLESS, ctxWith());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.values(result.value.sessionScores)).toEqual([5]);
      expect(result.value.scoreLedger).toEqual({});
    }
  });

  it('A10: the second join with the same nickname starts at zero (first claimant wins)', () => {
    const r = room({ scoreLedger: { ada: 5 } });
    const first = roomReduce(r, { type: 'join', nickname: 'Ada' }, HOSTLESS, ctxWith());
    expect(first.ok).toBe(true);
    if (first.ok) {
      const second = roomReduce(
        first.value,
        { type: 'join', nickname: 'Ada' },
        HOSTLESS,
        ctxWith(),
      );
      expect(second.ok).toBe(true);
      if (second.ok) {
        expect(Object.values(second.value.sessionScores)).toEqual([5]); // only the first claim
      }
    }
  });

  it('A9: a different nickname starts at zero and leaves the ledger alone', () => {
    const r = room({ scoreLedger: { ada: 5 } });
    const result = roomReduce(r, { type: 'join', nickname: 'Cy' }, HOSTLESS, ctxWith());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sessionScores).toEqual({});
      expect(result.value.scoreLedger).toEqual({ ada: 5 });
    }
  });

  it('reclaims mid-game too — the rejoiner still spectates until the next round', () => {
    const r = room({
      phase: 'IN_GAME',
      selectedGameId: 'stub',
      gameState: { moves: 0 },
      players: [player('p1'), player('p2'), player('p3')],
      scoreLedger: { ada: 5 },
    });
    const result = roomReduce(r, { type: 'join', nickname: 'Ada' }, HOSTLESS, ctxWith());
    expect(result.ok).toBe(true);
    if (result.ok) {
      const rejoined = result.value.players[3];
      expect(rejoined?.spectator).toBe(true); // E2 unchanged: reclaim ≠ a seat this round
      expect(result.value.sessionScores).toEqual({ [rejoined?.id ?? '']: 5 });
    }
  });
});

describe('selectGame clears the ledger with the session (A9)', () => {
  it('any (re)select parks nothing forward — a new session starts clean', () => {
    const r = room({ selectedGameId: 'stub', scoreLedger: { ada: 5 }, sessionScores: { p1: 2 } });
    const result = roomReduce(
      r,
      { type: 'selectGame', gameId: 'stub' },
      { role: 'host' },
      ctxWith(),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.scoreLedger).toEqual({});
      expect(result.value.sessionScores).toEqual({});
    }
  });
});

/** join is actor-less (the joiner has no id yet); any viewer stands in. */
const HOSTLESS = asPlayer('nobody-yet');
