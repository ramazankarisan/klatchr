import type { AnyGame, GameDeps, Player } from '@klatchr/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { games } from './index.js';

/**
 * A `play.event` crosses the wire as `unknown`, so any client can send anything.
 * Every registered game must refuse a malformed event with a typed rejection and
 * an unchanged state — a throw here would take the whole server (every room) down.
 */

const deps: GameDeps = { random: () => 0, now: () => 0, round: 1 };
const seat = (id: string): Player => ({
  id,
  nickname: id,
  joinedDuringGame: false,
  spectator: false,
});
const roster = [seat('a'), seat('b'), seat('c')];

// Shapes a hand-written or stale client could send. Each must be refused.
const HOSTILE: readonly unknown[] = [
  null,
  undefined,
  42,
  'submit',
  [],
  {},
  { type: 'nope' },
  { type: 'submit', playerId: 'a' },
  { type: 'submit', playerId: 'a', text: { evil: 1 } },
  { type: 'submit', playerId: 7, text: 'x' },
  { type: 'skip' },
  { type: 'guess', playerId: 'a', cardId: 'c0' },
  { type: 'guess', playerId: 'a', cardId: 1, author: 'b' },
  { type: 'vote', playerId: 'a' },
  { type: 'vote', playerId: 'a', target: null },
  { type: 'advance' },
  { type: 'advance', from: 'reveal' },
  { type: 'playerLeft' },
  { type: 'playerLeft', id: 3 },
  { type: 'playerJoined' },
  { type: 'playerJoined', player: 'a' },
  { type: 'playerJoined', player: { id: 'z', nickname: 'z' } },
];

/** Freeze the whole state, so a reducer that mutates it before rejecting throws. */
function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const inner of Object.values(value)) {
      deepFreeze(inner);
    }
    Object.freeze(value);
  }
  return value;
}

describe.each(games.map((game): [string, AnyGame] => [game.id, game]))('%s', (_id, game) => {
  const state = deepFreeze(game.init(roster, deps));
  const snapshot = structuredClone(state);

  it.each(HOSTILE.map((event) => [JSON.stringify(event) ?? 'undefined', event]))(
    'refuses %s with MALFORMED_EVENT and an unchanged state',
    (_label, event) => {
      expect(game.reduce(state, event)).toEqual({ ok: false, error: { code: 'MALFORMED_EVENT' } });
      expect(state).toEqual(snapshot);
    },
  );

  it('never throws on arbitrary input (fuzzed)', () => {
    fc.assert(
      fc.property(fc.anything(), (event) => {
        expect(() => game.reduce(state, event)).not.toThrow();
      }),
      { seed: 1501, numRuns: 500 },
    );
  });

  it('still accepts a well-formed roster event', () => {
    expect(game.reduce(state, { type: 'playerLeft', id: 'c' }).ok).toBe(true);
    expect(game.reduce(state, { type: 'playerJoined', player: seat('d') }).ok).toBe(true);
  });
});
