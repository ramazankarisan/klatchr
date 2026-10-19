import { describe, expect, it } from 'vitest';
import { stubGame } from './game.testkit.js';
import { roomReduce } from './room.js';
import { asPlayer, ctxWith, expectErr, player, room } from './room.testkit.js';

describe('gameEvent guards (plan-15 §3)', () => {
  const inGame = () =>
    room({
      phase: 'IN_GAME',
      selectedGameId: 'stub',
      gameState: { moves: 0 },
      players: [player('a'), player('b')],
    });

  it('refuses a client-sent roster event — only the room authors those', () => {
    for (const event of [
      { type: 'playerLeft', id: 'b' },
      { type: 'playerJoined', player: player('z') },
    ]) {
      expectErr(
        roomReduce(inGame(), { type: 'gameEvent', event }, asPlayer('a'), ctxWith()),
        'FORBIDDEN_EVENT',
      );
    }
  });

  it('a game event that changes nothing hands back the same room (nothing to re-send)', () => {
    const start = inGame();
    const r = roomReduce(
      start,
      { type: 'gameEvent', event: { type: 'noop' } },
      asPlayer('a'),
      ctxWith(),
    );
    expect(r.ok && r.value).toBe(start);
  });

  it('still ends the round when an unchanged state is complete', () => {
    const done = stubGame({ isComplete: () => true });
    const r = roomReduce(
      inGame(),
      { type: 'gameEvent', event: { type: 'x' } },
      asPlayer('a'),
      ctxWith([done]),
    );
    expect(r.ok && r.value.phase).toBe('SCORES');
  });
});
