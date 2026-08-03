import { expect } from 'vitest';
import type { AnyGame } from './game.js';
import { stubGame, stubGameDeps, stubRoomDeps } from './game.testkit.js';
import type { Player, Viewer } from './ids.js';
import { createRegistry } from './registry.js';
import { ok } from './result.js';
import type { roomReduce } from './room.js';
import type { ReduceContext, Room } from './roomTypes.js';

/** Shared fixtures for the room reducer tests, split across room.test / room.session.test. */

export const HOST: Viewer = { role: 'host' };
export const asPlayer = (id: string): Viewer => ({ role: 'player', id });

export function ctxWith(games: AnyGame[] = [stubGame()]): ReduceContext {
  return {
    registry: createRegistry(games),
    roomDeps: stubRoomDeps(),
    gameDeps: stubGameDeps(),
  };
}

export function player(id: string): Player {
  return { id, nickname: id, joinedDuringGame: false, spectator: false };
}

export function room(overrides: Partial<Room> = {}): Room {
  return {
    code: 'AAAA',
    hostId: 'host',
    phase: 'LOBBY',
    players: [],
    tokens: {},
    selectedGameId: null,
    gameState: null,
    closed: false,
    sessionScores: {},
    round: 0,
    gameConfig: undefined,
    ...overrides,
  };
}

/** A stub game that scores a fixed tally and completes, for session-fold tests. */
export function scoringGame(scores: { playerId: string; points: number }[]): AnyGame {
  return stubGame({ reduce: (s) => ok(s), isComplete: () => true, scores: () => scores });
}

export function expectErr(result: ReturnType<typeof roomReduce>, code: string): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.code).toBe(code);
  }
}
