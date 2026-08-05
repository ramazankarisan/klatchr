import { describe, expect, it } from 'vitest';
import type { AnyGame } from './game.js';
import { stubGame } from './game.testkit.js';
import { roomReduce } from './room.js';
import { HOST, asPlayer, ctxWith, expectErr, player, room } from './room.testkit.js';

/** A game whose init records the config + round it was handed — for the seam tests. */
function spyInit(): { game: AnyGame; seen: { config?: unknown; round?: number } } {
  const seen: { config?: unknown; round?: number } = {};
  const game = stubGame({
    init: (_players, deps, config) => {
      seen.config = config;
      seen.round = deps.round;
      return { moves: 0 };
    },
  });
  return { game, seen };
}

describe('configureGame (A1)', () => {
  it('the host stores an opaque config on the room', () => {
    const r = roomReduce(
      room({ selectedGameId: 'stub' }),
      { type: 'configureGame', config: { prompts: ['x'] } },
      HOST,
      ctxWith(),
    );
    expect(r.ok && r.value.gameConfig).toEqual({ prompts: ['x'] });
  });

  it('a non-host is rejected', () => {
    const r = roomReduce(room(), { type: 'configureGame', config: {} }, asPlayer('p1'), ctxWith());
    expectErr(r, 'NOT_HOST');
  });

  it('is rejected once a game is running', () => {
    const r = roomReduce(
      room({ phase: 'IN_GAME' }),
      { type: 'configureGame', config: {} },
      HOST,
      ctxWith(),
    );
    expectErr(r, 'WRONG_PHASE');
  });
});

describe('startGame threads the config + round into init (A2, A4)', () => {
  it('hands the stored gameConfig to init', () => {
    const { game, seen } = spyInit();
    const r = roomReduce(
      room({
        selectedGameId: 'stub',
        players: [player('a'), player('b')],
        gameConfig: { prompts: ['q1'] },
      }),
      { type: 'startGame' },
      HOST,
      ctxWith([game]),
    );
    expect(r.ok).toBe(true);
    expect(seen.config).toEqual({ prompts: ['q1'] });
  });

  it('injects the started round number into deps.round, incrementing each round', () => {
    const { game, seen } = spyInit();
    const ctx = ctxWith([game]);
    const first = roomReduce(
      room({ selectedGameId: 'stub', players: [player('a'), player('b')] }),
      { type: 'startGame' },
      HOST,
      ctx,
    );
    expect(first.ok).toBe(true);
    expect(seen.round).toBe(1);
    if (!first.ok) throw new Error('start failed');
    const second = roomReduce({ ...first.value, phase: 'LOBBY' }, { type: 'startGame' }, HOST, ctx);
    expect(second.ok).toBe(true);
    expect(seen.round).toBe(2);
  });
});

describe('selectGame resets the config on a game change (A3)', () => {
  it('switching to a different game clears gameConfig, round and the tally', () => {
    const ctx = ctxWith([stubGame({ id: 'g1' }), stubGame({ id: 'g2' })]);
    const start = room({
      selectedGameId: 'g1',
      gameConfig: { prompts: ['x'] },
      round: 3,
      sessionScores: { a: 5 },
    });
    const r = roomReduce(start, { type: 'selectGame', gameId: 'g2' }, HOST, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.gameConfig).toBeUndefined();
    expect(r.value.round).toBe(0);
    expect(r.value.sessionScores).toEqual({});
  });

  it('A4 re-selecting the same game replays it — resets round + tally, keeps the config', () => {
    const ctx = ctxWith([stubGame({ id: 'g1' })]);
    const start = room({
      selectedGameId: 'g1',
      gameConfig: { prompts: ['x'] },
      round: 3,
      sessionScores: { a: 5 },
    });
    const r = roomReduce(start, { type: 'selectGame', gameId: 'g1' }, HOST, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.gameConfig).toEqual({ prompts: ['x'] }); // the authored set survives a replay
    expect(r.value.round).toBe(0); // but the session restarts from question 1
    expect(r.value.sessionScores).toEqual({});
  });
});
