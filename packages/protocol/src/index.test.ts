import { describe, expect, it } from 'vitest';
import { type ClientMessage, type ServerMessage, clientMessage, serverMessage } from './index.js';

/** Parse a value that has crossed the wire (JSON round-trip), as a boundary does. */
const overWire = (v: unknown) => JSON.parse(JSON.stringify(v));

describe('clientMessage', () => {
  const cases: ClientMessage[] = [
    { type: 'open', nickname: 'Ada' },
    { type: 'join', code: 'WXYZ', nickname: 'Bo' },
    { type: 'join', code: 'WXYZ', nickname: 'Bo', reconnectToken: 'tok_secret_1' },
    { type: 'host', code: 'WXYZ', action: 'selectGame', gameId: 'guessWho' },
    { type: 'host', code: 'WXYZ', action: 'configureGame', config: { prompts: ['q1', 'q2'] } },
    { type: 'host', code: 'WXYZ', action: 'startGame' },
    { type: 'host', code: 'WXYZ', action: 'endGame' },
    { type: 'play', code: 'WXYZ', event: { kind: 'submit', text: 'hi' } },
    { type: 'leave', code: 'WXYZ' },
    { type: 'resumeHost', code: 'WXYZ', hostToken: 'htok_secret_1' },
    { type: 'ping' },
  ];

  it.each(cases)('round-trips $type', (msg) => {
    expect(clientMessage.parse(overWire(msg))).toEqual(msg);
  });

  it('rejects an unknown type', () => {
    expect(clientMessage.safeParse({ type: 'nope' }).success).toBe(false);
  });

  it('rejects a missing required field', () => {
    expect(clientMessage.safeParse({ type: 'open' }).success).toBe(false);
    expect(clientMessage.safeParse({ type: 'play', code: 'WXYZ' }).success).toBe(false);
    expect(clientMessage.safeParse({ type: 'resumeHost', code: 'WXYZ' }).success).toBe(false);
  });

  it('rejects an unknown host action', () => {
    expect(
      clientMessage.safeParse({ type: 'host', code: 'WXYZ', action: 'burnItDown' }).success,
    ).toBe(false);
  });
});

describe('serverMessage', () => {
  const cases: ServerMessage[] = [
    { type: 'joined', code: 'WXYZ', playerId: 'p_1', reconnectToken: 'tok_secret_1' },
    { type: 'opened', code: 'WXYZ', hostToken: 'htok_secret_1' },
    {
      type: 'frame',
      code: 'WXYZ',
      phase: 'LOBBY',
      players: [{ id: 'p_1', nickname: 'Ada', spectator: false }],
      selectedGameId: null,
      gameView: null,
      scores: null,
      sessionScores: [],
      round: 0,
      roundsTotal: 0,
    },
    {
      type: 'frame',
      code: 'WXYZ',
      phase: 'SCORES',
      players: [
        { id: 'p_1', nickname: 'Ada', spectator: false },
        { id: 'p_2', nickname: 'Bo', spectator: true },
      ],
      selectedGameId: 'guessWho',
      gameView: { phase: 'reveal', cards: [] },
      scores: [{ playerId: 'p_1', points: 2 }],
      sessionScores: [
        { playerId: 'p_1', points: 5 },
        { playerId: 'p_2', points: 3 },
      ],
      round: 2,
      roundsTotal: 3,
    },
    { type: 'error', code: 'ROOM_FULL' },
    { type: 'error', code: 'GAME_REJECTED', message: 'not your turn' },
  ];

  it.each(cases)('round-trips $type', (msg) => {
    expect(serverMessage.parse(overWire(msg))).toEqual(msg);
  });

  it('rejects an unknown type', () => {
    expect(serverMessage.safeParse({ type: 'nope' }).success).toBe(false);
  });

  it('rejects an unknown phase', () => {
    expect(
      serverMessage.safeParse({
        type: 'frame',
        code: 'WXYZ',
        phase: 'PARTY',
        players: [],
        selectedGameId: null,
        gameView: null,
        scores: null,
        sessionScores: [],
        round: 0,
        roundsTotal: 0,
      }).success,
    ).toBe(false);
  });

  it('rejects a malformed score', () => {
    expect(
      serverMessage.safeParse({
        type: 'frame',
        code: 'WXYZ',
        phase: 'SCORES',
        players: [],
        selectedGameId: 'guessWho',
        gameView: null,
        scores: [{ playerId: 'p_1', points: 'lots' }],
        sessionScores: [],
        round: 1,
        roundsTotal: 3,
      }).success,
    ).toBe(false);
  });

  it('rejects a joined without a reconnectToken', () => {
    expect(serverMessage.safeParse({ type: 'joined', code: 'WXYZ', playerId: 'p_1' }).success).toBe(
      false,
    );
  });

  it('rejects a frame with the gameView key dropped', () => {
    expect(
      serverMessage.safeParse({
        type: 'frame',
        code: 'WXYZ',
        phase: 'LOBBY',
        players: [],
        selectedGameId: null,
        scores: null,
      }).success,
    ).toBe(false);
  });
});
