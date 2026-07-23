import { MAX_PLAYERS } from './bounds.js';
import type { AnyGame } from './game.js';
import { stubGame, stubGameDeps, stubRoomDeps } from './game.testkit.js';
import type { Player, Viewer } from './ids.js';
import { createRegistry } from './registry.js';
import { err, ok } from './result.js';
import { createRoom, roomReduce } from './room.js';
import type { ReduceContext, Room } from './roomTypes.js';

const HOST: Viewer = { role: 'host' };
const asPlayer = (id: string): Viewer => ({ role: 'player', id });

function ctxWith(games: AnyGame[] = [stubGame()]): ReduceContext {
  return {
    registry: createRegistry(games),
    roomDeps: stubRoomDeps(),
    gameDeps: stubGameDeps(),
  };
}

function player(id: string): Player {
  return { id, nickname: id, joinedDuringGame: false };
}

function room(overrides: Partial<Room> = {}): Room {
  return {
    code: 'AAAA',
    hostId: 'host',
    phase: 'LOBBY',
    players: [],
    selectedGameId: null,
    gameState: null,
    closed: false,
    ...overrides,
  };
}

function expectErr(result: ReturnType<typeof roomReduce>, code: string): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.code).toBe(code);
  }
}

describe('createRoom', () => {
  it('opens a LOBBY with a code, a host, and no players', () => {
    const r = createRoom(stubRoomDeps());
    expect(r).toMatchObject({ phase: 'LOBBY', code: 'AAAA', hostId: 'p1', closed: false });
    expect(r.players).toEqual([]);
  });
});

describe('join', () => {
  it('P1 refuses a join at MAX_PLAYERS and leaves the room unchanged', () => {
    const full = room({ players: Array.from({ length: MAX_PLAYERS }, (_, i) => player(`x${i}`)) });
    expectErr(
      roomReduce(full, { type: 'join', nickname: 'late' }, asPlayer('late'), ctxWith()),
      'ROOM_FULL',
    );
  });

  it('P2 rejoin with an existing nickname resumes the same player, no duplicate', () => {
    const start = room({ players: [player('Ada')] });
    const r = roomReduce(start, { type: 'join', nickname: 'ada' }, asPlayer('x'), ctxWith());
    expect(r.ok && r.value.players).toHaveLength(1);
  });

  it('refuses an empty nickname', () => {
    expectErr(
      roomReduce(room(), { type: 'join', nickname: '   ' }, asPlayer('x'), ctxWith()),
      'EMPTY_NICKNAME',
    );
  });

  it('adds a new player with a minted id, not flagged mid-game in LOBBY', () => {
    const r = roomReduce(room(), { type: 'join', nickname: 'Grace' }, asPlayer('x'), ctxWith());
    expect(r.ok && r.value.players).toHaveLength(1);
    expect(r.ok && r.value.players[0]?.id).toBe('p1');
    expect(r.ok && r.value.players[0]?.joinedDuringGame).toBe(false);
  });
});

describe('selectGame', () => {
  it('P4 refuses an unregistered game id', () => {
    expectErr(
      roomReduce(room(), { type: 'selectGame', gameId: 'ghost' }, HOST, ctxWith()),
      'GAME_NOT_REGISTERED',
    );
  });

  it('refuses a non-host', () => {
    expectErr(
      roomReduce(room(), { type: 'selectGame', gameId: 'stub' }, asPlayer('x'), ctxWith()),
      'NOT_HOST',
    );
  });

  it('selects a registered game, staying in LOBBY', () => {
    const r = roomReduce(room(), { type: 'selectGame', gameId: 'stub' }, HOST, ctxWith());
    expect(r.ok && r.value).toMatchObject({ selectedGameId: 'stub', phase: 'LOBBY' });
  });

  it('from SCORES returns to LOBBY', () => {
    const r = roomReduce(
      room({ phase: 'SCORES' }),
      { type: 'selectGame', gameId: 'stub' },
      HOST,
      ctxWith(),
    );
    expect(r.ok && r.value.phase).toBe('LOBBY');
  });

  it('refuses during IN_GAME', () => {
    const start = room({ phase: 'IN_GAME', selectedGameId: 'stub' });
    expectErr(
      roomReduce(start, { type: 'selectGame', gameId: 'stub' }, HOST, ctxWith()),
      'WRONG_PHASE',
    );
  });
});

describe('startGame', () => {
  const ready = () => room({ selectedGameId: 'stub', players: [player('a'), player('b')] });

  it('refuses a non-host', () => {
    expectErr(roomReduce(ready(), { type: 'startGame' }, asPlayer('x'), ctxWith()), 'NOT_HOST');
  });

  it('refuses when no game is selected', () => {
    const start = room({ players: [player('a'), player('b')] });
    expectErr(roomReduce(start, { type: 'startGame' }, HOST, ctxWith()), 'NO_GAME_SELECTED');
  });

  it('P3 refuses below the game minPlayers', () => {
    const start = room({ selectedGameId: 'stub', players: [player('a')] });
    expectErr(roomReduce(start, { type: 'startGame' }, HOST, ctxWith()), 'BELOW_MIN_PLAYERS');
  });

  it('refuses when the selected game is no longer registered', () => {
    const start = room({ selectedGameId: 'ghost', players: [player('a'), player('b')] });
    expectErr(roomReduce(start, { type: 'startGame' }, HOST, ctxWith()), 'GAME_NOT_REGISTERED');
  });

  it('starts, moving to IN_GAME and initialising game state', () => {
    const r = roomReduce(ready(), { type: 'startGame' }, HOST, ctxWith());
    expect(r.ok && r.value.phase).toBe('IN_GAME');
    expect(r.ok && r.value.gameState).toEqual({ moves: 0 });
  });

  it('re-inits for a new round from SCORES', () => {
    const start = room({
      phase: 'SCORES',
      selectedGameId: 'stub',
      players: [player('a'), player('b')],
    });
    const r = roomReduce(start, { type: 'startGame' }, HOST, ctxWith());
    expect(r.ok && r.value.phase).toBe('IN_GAME');
  });

  it('refuses during IN_GAME', () => {
    const start = room({
      phase: 'IN_GAME',
      selectedGameId: 'stub',
      players: [player('a'), player('b')],
    });
    expectErr(roomReduce(start, { type: 'startGame' }, HOST, ctxWith()), 'WRONG_PHASE');
  });
});

describe('gameEvent', () => {
  it('P5 refuses a game event outside a game', () => {
    expectErr(
      roomReduce(room(), { type: 'gameEvent', event: {} }, asPlayer('x'), ctxWith()),
      'GAME_EVENT_OUTSIDE_GAME',
    );
  });

  it('refuses when the active game is missing from the registry', () => {
    const start = room({ phase: 'IN_GAME', selectedGameId: 'ghost' });
    expectErr(
      roomReduce(start, { type: 'gameEvent', event: {} }, asPlayer('x'), ctxWith()),
      'GAME_NOT_REGISTERED',
    );
  });

  it('refuses when IN_GAME with nothing selected', () => {
    const start = room({ phase: 'IN_GAME', selectedGameId: null });
    expectErr(
      roomReduce(start, { type: 'gameEvent', event: {} }, asPlayer('x'), ctxWith()),
      'GAME_NOT_REGISTERED',
    );
  });

  it('surfaces a game rejection as GAME_REJECTED', () => {
    const g = stubGame({ reduce: () => err({ code: 'BAD_MOVE' }) });
    const start = room({ phase: 'IN_GAME', selectedGameId: 'stub' });
    expectErr(
      roomReduce(start, { type: 'gameEvent', event: {} }, asPlayer('x'), ctxWith([g])),
      'GAME_REJECTED',
    );
  });

  it('applies an accepted event and stays IN_GAME while not complete', () => {
    const g = stubGame({ reduce: () => ok({ moves: 1 }) });
    const start = room({ phase: 'IN_GAME', selectedGameId: 'stub' });
    const r = roomReduce(start, { type: 'gameEvent', event: {} }, asPlayer('x'), ctxWith([g]));
    expect(r.ok && r.value.gameState).toEqual({ moves: 1 });
    expect(r.ok && r.value.phase).toBe('IN_GAME');
  });

  it('moves to SCORES when the game reports complete', () => {
    const g = stubGame({ reduce: () => ok({ moves: 1 }), isComplete: () => true });
    const start = room({ phase: 'IN_GAME', selectedGameId: 'stub' });
    const r = roomReduce(start, { type: 'gameEvent', event: {} }, asPlayer('x'), ctxWith([g]));
    expect(r.ok && r.value.phase).toBe('SCORES');
  });
});

describe('endGame', () => {
  it('refuses a non-host', () => {
    const start = room({ phase: 'IN_GAME', selectedGameId: 'stub' });
    expectErr(roomReduce(start, { type: 'endGame' }, asPlayer('x'), ctxWith()), 'NOT_HOST');
  });

  it('refuses outside a game', () => {
    expectErr(roomReduce(room(), { type: 'endGame' }, HOST, ctxWith()), 'WRONG_PHASE');
  });

  it('lets the host abort to SCORES', () => {
    const start = room({ phase: 'IN_GAME', selectedGameId: 'stub' });
    const r = roomReduce(start, { type: 'endGame' }, HOST, ctxWith());
    expect(r.ok && r.value.phase).toBe('SCORES');
  });
});

describe('leave', () => {
  it('P6 the host leaving closes the room', () => {
    const r = roomReduce(room({ players: [player('a')] }), { type: 'leave' }, HOST, ctxWith());
    expect(r.ok && r.value.closed).toBe(true);
  });

  it('P7 the last player leaving discards the room', () => {
    const r = roomReduce(
      room({ players: [player('a')] }),
      { type: 'leave' },
      asPlayer('a'),
      ctxWith(),
    );
    expect(r.ok && r.value.players).toHaveLength(0);
    expect(r.ok && r.value.closed).toBe(true);
  });

  it('a player leaving among others is removed and the room stays open', () => {
    const start = room({ players: [player('a'), player('b')] });
    const r = roomReduce(start, { type: 'leave' }, asPlayer('a'), ctxWith());
    expect(r.ok && r.value.players).toHaveLength(1);
    expect(r.ok && r.value.closed).toBe(false);
  });
});

describe('mid-game roster forwarding (S2)', () => {
  it('a join mid-game forwards playerJoined and flags the joiner', () => {
    const seen: unknown[] = [];
    const g = stubGame({
      reduce: (state, event) => {
        seen.push(event);
        return ok(state);
      },
    });
    const start = room({
      phase: 'IN_GAME',
      selectedGameId: 'stub',
      players: [player('a'), player('b')],
    });
    const r = roomReduce(start, { type: 'join', nickname: 'Zoe' }, asPlayer('x'), ctxWith([g]));
    expect(r.ok && r.value.players[2]?.joinedDuringGame).toBe(true);
    expect(seen).toEqual([
      { type: 'playerJoined', player: expect.objectContaining({ nickname: 'Zoe' }) },
    ]);
  });

  it('a leave mid-game forwards playerLeft', () => {
    const seen: unknown[] = [];
    const g = stubGame({
      reduce: (state, event) => {
        seen.push(event);
        return ok(state);
      },
    });
    const start = room({
      phase: 'IN_GAME',
      selectedGameId: 'stub',
      players: [player('a'), player('b')],
    });
    roomReduce(start, { type: 'leave' }, asPlayer('a'), ctxWith([g]));
    expect(seen).toEqual([{ type: 'playerLeft', id: 'a' }]);
  });

  it('keeps game state when the game rejects the roster event', () => {
    const g = stubGame({ reduce: () => err({ code: 'NOPE' }) });
    const start = room({
      phase: 'IN_GAME',
      selectedGameId: 'stub',
      players: [player('a')],
      gameState: { moves: 5 },
    });
    const r = roomReduce(start, { type: 'join', nickname: 'Zoe' }, asPlayer('x'), ctxWith([g]));
    expect(r.ok && r.value.gameState).toEqual({ moves: 5 });
  });

  it('skips forwarding when IN_GAME but no game is selected', () => {
    const start = room({
      phase: 'IN_GAME',
      selectedGameId: null,
      players: [player('a')],
      gameState: { moves: 5 },
    });
    const r = roomReduce(start, { type: 'join', nickname: 'Zoe' }, asPlayer('x'), ctxWith());
    expect(r.ok && r.value.gameState).toEqual({ moves: 5 });
  });
});
