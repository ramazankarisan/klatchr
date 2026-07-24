import type { GameDeps, GameError, Player, Result } from '@klatchr/core';
import { guessWho } from './guessWho.js';
import type { GWState } from './state.js';

const deps: GameDeps = { random: () => 0, now: () => 0 };
const player = (id: string): Player => ({
  id,
  nickname: id,
  joinedDuringGame: false,
  spectator: false,
});

function expectOk(result: Result<GWState, GameError>): GWState {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(`expected ok, got ${result.error.code}`);
  }
  return result.value;
}

function collect(): GWState {
  return guessWho.init([player('a'), player('b'), player('c')], deps);
}

function seedGuess(): GWState {
  let state = collect();
  for (const [id, text] of [
    ['a', 'apples'],
    ['b', 'bananas'],
    ['c', 'cherries'],
  ] as const) {
    state = expectOk(guessWho.reduce(state, { type: 'submit', playerId: id, text }));
  }
  return expectOk(guessWho.reduce(state, { type: 'advance', from: 'collect' }));
}

describe('init (G1)', () => {
  it('G1 seeds collect with a prompt and the active roster', () => {
    const state = collect();
    expect(state.phase).toBe('collect');
    expect(state.prompt.length).toBeGreaterThan(0);
    expect(state.roster).toEqual(['a', 'b', 'c']);
  });

  it('tolerates a random draw of 1.0 (inclusive-upper RNG) with a valid prompt', () => {
    const state = guessWho.init([player('a'), player('b')], { random: () => 1, now: () => 0 });
    expect(state.prompt.length).toBeGreaterThan(0);
  });
});

describe('submit (G2–G4)', () => {
  it('G2 records and overwrites a draft', () => {
    let state = expectOk(
      guessWho.reduce(collect(), { type: 'submit', playerId: 'a', text: 'one' }),
    );
    expect(state.drafts.a).toBe('one');
    state = expectOk(guessWho.reduce(state, { type: 'submit', playerId: 'a', text: 'two' }));
    expect(state.drafts.a).toBe('two');
  });

  it('G3 rejects a submit from a non-roster (spectator) player', () => {
    const r = guessWho.reduce(collect(), { type: 'submit', playerId: 'z', text: 'x' });
    expect(r.ok === false && r.error.code).toBe('NOT_PLAYING');
  });

  it('G4 rejects a submit once past collect', () => {
    const r = guessWho.reduce(seedGuess(), { type: 'submit', playerId: 'a', text: 'x' });
    expect(r.ok === false && r.error.code).toBe('WRONG_PHASE');
  });
});

describe('advance (G5, G7)', () => {
  it('G5 freezes anonymised cards sorted by text and moves to guess', () => {
    const state = seedGuess();
    expect(state.phase).toBe('guess');
    expect(state.cards.map((c) => c.id)).toEqual(['c0', 'c1', 'c2']);
    expect(state.cards.map((c) => c.text)).toEqual(['apples', 'bananas', 'cherries']);
  });

  it('G5 orders equal answers by author id, no RNG', () => {
    let state = collect();
    state = expectOk(guessWho.reduce(state, { type: 'submit', playerId: 'b', text: 'same' }));
    state = expectOk(guessWho.reduce(state, { type: 'submit', playerId: 'a', text: 'same' }));
    state = expectOk(guessWho.reduce(state, { type: 'advance', from: 'collect' }));
    expect(state.cards.map((c) => c.authorId)).toEqual(['a', 'b']);
  });

  it('G5 is idempotent on a phase mismatch (double-send)', () => {
    const state = seedGuess();
    const again = expectOk(guessWho.reduce(state, { type: 'advance', from: 'collect' }));
    expect(again).toEqual(state);
  });

  it('G7 advance from guess reveals and completes', () => {
    const state = expectOk(guessWho.reduce(seedGuess(), { type: 'advance', from: 'guess' }));
    expect(state.phase).toBe('reveal');
    expect(guessWho.isComplete(state)).toBe(true);
  });

  it('isComplete is false before reveal', () => {
    expect(guessWho.isComplete(seedGuess())).toBe(false);
  });
});

describe('guess (G6)', () => {
  it('G6 records a guess', () => {
    const state = expectOk(
      guessWho.reduce(seedGuess(), { type: 'guess', playerId: 'a', cardId: 'c1', author: 'b' }),
    );
    expect(state.guesses.a).toEqual({ c1: 'b' });
  });

  it('G6 rejects guessing your own card', () => {
    const r = guessWho.reduce(seedGuess(), {
      type: 'guess',
      playerId: 'a',
      cardId: 'c0',
      author: 'b',
    });
    expect(r.ok === false && r.error.code).toBe('OWN_CARD');
  });

  it('G6 rejects an unknown card', () => {
    const r = guessWho.reduce(seedGuess(), {
      type: 'guess',
      playerId: 'a',
      cardId: 'zzz',
      author: 'b',
    });
    expect(r.ok === false && r.error.code).toBe('NO_SUCH_CARD');
  });

  it('G6 rejects an author who is not a player', () => {
    const r = guessWho.reduce(seedGuess(), {
      type: 'guess',
      playerId: 'a',
      cardId: 'c1',
      author: 'zzz',
    });
    expect(r.ok === false && r.error.code).toBe('NOT_A_PLAYER');
  });

  it('G6 rejects a spectator guesser', () => {
    const r = guessWho.reduce(seedGuess(), {
      type: 'guess',
      playerId: 'zzz',
      cardId: 'c1',
      author: 'b',
    });
    expect(r.ok === false && r.error.code).toBe('NOT_PLAYING');
  });

  it('G6 rejects a guess before the guess phase', () => {
    const r = guessWho.reduce(collect(), {
      type: 'guess',
      playerId: 'a',
      cardId: 'c0',
      author: 'b',
    });
    expect(r.ok === false && r.error.code).toBe('WRONG_PHASE');
  });
});

describe('roster events', () => {
  it('a mid-round join is a no-op — the joiner spectates', () => {
    const state = seedGuess();
    const r = expectOk(guessWho.reduce(state, { type: 'playerJoined', player: player('zoe') }));
    expect(r).toEqual(state);
  });

  it('a leave is a no-op — the player keeps whatever they submitted', () => {
    const state = seedGuess();
    const r = expectOk(guessWho.reduce(state, { type: 'playerLeft', id: 'a' }));
    expect(r).toEqual(state);
  });
});
