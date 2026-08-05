import { describe, expect, it } from 'vitest';
import { stubGame } from './game.testkit.js';
import { ok } from './result.js';
import { roomReduce } from './room.js';
import { asPlayer, ctxWith, player, room } from './room.testkit.js';

/**
 * plan-14 D2 — forfeit the round: a player reaped mid-round loses that round's
 * points. The end-of-round fold (and the host-abort fold) must count only
 * currently-seated players, so a departed id never re-enters `sessionScores`
 * via a game that still scores its surviving submissions.
 */

/** A game that completes on any event and scores a fixed tally — some of it for
 * an id that may no longer be seated (the leaver the game still credits). */
function completingGame(scores: { playerId: string; points: number }[]) {
  return stubGame({ reduce: (s) => ok(s), isComplete: () => true, scores: () => scores });
}

function inGame(scores: { playerId: string; points: number }[], players = ['p1', 'p2', 'p3']) {
  return room({
    phase: 'IN_GAME',
    selectedGameId: 'stub',
    gameState: { moves: 0 },
    players: players.map(player),
    round: 4,
  });
}

describe('the score fold forfeits a mid-round-departed player (D2)', () => {
  it('A1: a reaped id is absent from sessionScores; seated totals are exact', () => {
    // p2 left this round but the game still credits their surviving guess.
    const game = completingGame([
      { playerId: 'p1', points: 2 },
      { playerId: 'p2', points: 1 }, // departed — must be dropped from the fold
    ]);
    const r = room({
      phase: 'IN_GAME',
      selectedGameId: 'stub',
      gameState: { moves: 0 },
      players: [player('p1'), player('p3')], // p2 already reaped out of the roster
      round: 4,
    });
    const result = roomReduce(
      r,
      { type: 'gameEvent', event: { type: 'x' } },
      asPlayer('p1'),
      ctxWith([game]),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.phase).toBe('SCORES');
      expect(result.value.sessionScores).toEqual({ p1: 2 }); // p2 forfeit, not { p1: 2, p2: 1 }
    }
  });

  it('A1: seated players still accumulate onto their prior totals', () => {
    const game = completingGame([{ playerId: 'p1', points: 3 }]);
    const r = room({
      phase: 'IN_GAME',
      selectedGameId: 'stub',
      gameState: { moves: 0 },
      players: [player('p1'), player('p2')],
      sessionScores: { p1: 5 }, // earned in earlier rounds
      round: 4,
    });
    const result = roomReduce(
      r,
      { type: 'gameEvent', event: { type: 'x' } },
      asPlayer('p1'),
      ctxWith([game]),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sessionScores).toEqual({ p1: 8 }); // 5 + 3
    }
  });

  it('A2: the host-abort fold forfeits a departed id too', () => {
    const game = completingGame([
      { playerId: 'p1', points: 2 },
      { playerId: 'gone', points: 4 }, // an id no longer seated
    ]);
    const r = room({
      phase: 'IN_GAME',
      selectedGameId: 'stub',
      gameState: { moves: 0 },
      players: [player('p1'), player('p2')],
      round: 4,
    });
    const result = roomReduce(r, { type: 'endGame' }, { role: 'host' }, ctxWith([game]));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.phase).toBe('SCORES');
      expect(result.value.sessionScores).toEqual({ p1: 2 });
    }
  });
});
