import { stubGame } from './game.testkit.js';
import { roomReduce } from './room.js';
import { HOST, asPlayer, ctxWith, expectErr, player, room, scoringGame } from './room.testkit.js';

// Session scoring (S6) + rotating seats (X1) — split from room.test.ts to stay
// under the line cap; shares the fixtures in room.testkit.

describe('startGame — rounds & rotation', () => {
  const ready = () => room({ selectedGameId: 'stub', players: [player('a'), player('b')] });

  it('counts each start as a round', () => {
    const r = roomReduce(room({ ...ready(), round: 2 }), { type: 'startGame' }, HOST, ctxWith());
    expect(r.ok && r.value.round).toBe(3);
  });

  it('X1 rotates the seat window so a benched spectator is dealt in next round', () => {
    const g = stubGame({ maxPlayers: 2 });
    const players = ['a', 'b', 'c'].map(player); // 3 players, 2 seats → 1 benched each round
    // Round 1 (offset 0): a,b seated, c benched.
    const r1 = roomReduce(
      room({ selectedGameId: 'stub', players }),
      { type: 'startGame' },
      HOST,
      ctxWith([g]),
    );
    expect(r1.ok && r1.value.players.map((p) => p.spectator)).toEqual([false, false, true]);
    // Round 2 (offset 2): the window advances, so c is now seated and b sits out.
    const r2 = roomReduce(
      room({ selectedGameId: 'stub', players, phase: 'SCORES', round: 1 }),
      { type: 'startGame' },
      HOST,
      ctxWith([g]),
    );
    expect(r2.ok && r2.value.players.map((p) => p.spectator)).toEqual([false, true, false]);
  });
});

describe('endGame — session fold', () => {
  it('refuses when the active game is missing from the registry', () => {
    const start = room({ phase: 'IN_GAME', selectedGameId: 'ghost' });
    expectErr(roomReduce(start, { type: 'endGame' }, HOST, ctxWith()), 'GAME_NOT_REGISTERED');
  });

  it('D1 folds the aborted round’s partial scores into the session tally', () => {
    const g = scoringGame([{ playerId: 'a', points: 2 }]);
    const start = room({ phase: 'IN_GAME', selectedGameId: 'stub', gameState: {} });
    const r = roomReduce(start, { type: 'endGame' }, HOST, ctxWith([g]));
    expect(r.ok && r.value.sessionScores).toEqual({ a: 2 });
  });
});

describe('session scoring (S6)', () => {
  it('folds the round scores into the session tally on entry to SCORES', () => {
    const g = scoringGame([
      { playerId: 'a', points: 3 },
      { playerId: 'b', points: 1 },
    ]);
    const start = room({ phase: 'IN_GAME', selectedGameId: 'stub' });
    const r = roomReduce(start, { type: 'gameEvent', event: {} }, asPlayer('x'), ctxWith([g]));
    expect(r.ok && r.value.phase).toBe('SCORES');
    expect(r.ok && r.value.sessionScores).toEqual({ a: 3, b: 1 });
  });

  it('accumulates across rounds — startGame keeps the tally, resets game state', () => {
    const g = scoringGame([{ playerId: 'a', points: 2 }]);
    // A prior round already banked 5 for a; this round adds 2 more.
    const inGame = room({
      phase: 'IN_GAME',
      selectedGameId: 'stub',
      players: [player('a'), player('b')],
      sessionScores: { a: 5 },
      round: 1,
    });
    const scored = roomReduce(
      inGame,
      { type: 'gameEvent', event: {} },
      asPlayer('x'),
      ctxWith([g]),
    );
    expect(scored.ok && scored.value.sessionScores).toEqual({ a: 7 });
    // Next round starts fresh game state but keeps the running tally.
    const next = roomReduce(
      scored.ok ? scored.value : inGame,
      { type: 'startGame' },
      HOST,
      ctxWith([g]),
    );
    expect(next.ok && next.value.sessionScores).toEqual({ a: 7 });
    expect(next.ok && next.value.round).toBe(2);
    expect(next.ok && next.value.gameState).toEqual({ moves: 0 });
  });
});
