import type { GameDeps, GameError, Player, Result } from '@klatchr/core';
import { MAX_ANSWER_LEN, guessWho } from './guessWho.js';
import type { GWState } from './state.js';

const deps: GameDeps = { random: () => 0, now: () => 0, round: 1 };
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

  it('walks the built-in bank in round order — successive rounds, successive questions', () => {
    const at = (round: number): GWState =>
      guessWho.init([player('a'), player('b')], { random: () => 0, now: () => 0, round });
    expect(at(1).prompt).not.toBe(at(2).prompt); // no repeat within a session
  });

  it('A5 uses a host-authored prompt over the built-in bank', () => {
    const state = guessWho.init([player('a'), player('b'), player('c')], deps, {
      prompts: ['Custom question for the room?'],
    });
    expect(state.prompt).toBe('Custom question for the room?');
  });

  it('A2 roundCount is the session length — authored size, else the built-in bank size', () => {
    expect(guessWho.roundCount?.({ prompts: ['x', 'y', 'z'] })).toBe(3);
    expect(guessWho.roundCount?.(undefined)).toBeGreaterThan(1);
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

describe('skip (B4)', () => {
  const HOST = { role: 'host' } as const;

  it('marks a skipper resolved (no card) so the host counts them done, and is idempotent', () => {
    let state = expectOk(guessWho.reduce(collect(), { type: 'skip', playerId: 'a' }));
    expect(state.skipped).toEqual(['a']);
    state = expectOk(guessWho.reduce(state, { type: 'skip', playerId: 'a' })); // idempotent
    expect(state.skipped).toEqual(['a']);
    // The host progress counts the skipper as done, but they got no card.
    const view = guessWho.view(state, HOST) as { submittedCount: number; submitted: string[] };
    expect(view.submittedCount).toBe(1);
    expect(view.submitted).toContain('a');
    const advanced = expectOk(guessWho.reduce(state, { type: 'advance', from: 'collect' }));
    expect(advanced.cards).toHaveLength(0); // no answer taped
  });

  it('rejects a skip from a non-roster player and once past collect', () => {
    const spectator = guessWho.reduce(collect(), { type: 'skip', playerId: 'z' });
    expect(spectator.ok === false && spectator.error.code).toBe('NOT_PLAYING');
    const late = guessWho.reduce(seedGuess(), { type: 'skip', playerId: 'a' });
    expect(late.ok === false && late.error.code).toBe('WRONG_PHASE');
  });
});

describe('advance (G5, G7)', () => {
  it('G5 freezes anonymised cards sorted by text and moves to guess', () => {
    const state = seedGuess();
    expect(state.phase).toBe('guess');
    expect(state.cards.map((c) => c.id)).toEqual(['c0', 'c1', 'c2']);
    expect(state.cards.map((c) => c.text)).toEqual(['apples', 'bananas', 'cherries']);
  });

  it('G5 orders cards by text, and the same round always orders them the same way', () => {
    const build = (): GWState => {
      let state = collect();
      state = expectOk(guessWho.reduce(state, { type: 'submit', playerId: 'b', text: 'zebra' }));
      state = expectOk(guessWho.reduce(state, { type: 'submit', playerId: 'a', text: 'apple' }));
      return expectOk(guessWho.reduce(state, { type: 'advance', from: 'collect' }));
    };
    expect(build().cards.map((c) => c.text)).toEqual(['apple', 'zebra']);
    expect(build().cards).toEqual(build().cards); // pure: no hidden randomness in reduce
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

  it('a leaver keeps their card but forfeits the round (off the tally)', () => {
    const state = seedGuess();
    const r = expectOk(guessWho.reduce(state, { type: 'playerLeft', id: 'a' }));
    expect(r.cards).toEqual(state.cards); // their answer is still guessable
    expect(r.left).toEqual(['a']);
    const revealed = expectOk(guessWho.reduce(r, { type: 'advance', from: 'guess' }));
    expect(guessWho.scores(revealed).map((s) => s.playerId)).toEqual(['b', 'c']);
  });

  it('a leave by someone not seated, or twice, changes nothing', () => {
    const state = seedGuess();
    expect(guessWho.reduce(state, { type: 'playerLeft', id: 'zz' })).toEqual({
      ok: true,
      value: state,
    });
    const once = expectOk(guessWho.reduce(state, { type: 'playerLeft', id: 'a' }));
    expect(guessWho.reduce(once, { type: 'playerLeft', id: 'a' })).toEqual({
      ok: true,
      value: once,
    });
  });

  it('a leaver who wrote nothing is no longer offered as an author', () => {
    let state = expectOk(guessWho.reduce(collect(), { type: 'submit', playerId: 'a', text: 'x' }));
    state = expectOk(guessWho.reduce(state, { type: 'submit', playerId: 'b', text: 'y' }));
    state = expectOk(guessWho.reduce(state, { type: 'playerLeft', id: 'c' })); // c never answered
    state = expectOk(guessWho.reduce(state, { type: 'advance', from: 'collect' }));
    expect(guessWho.view(state, { role: 'host' })).toMatchObject({ candidates: ['a', 'b'] });
    expect(guessWho.view(state, { role: 'player', id: 'a' })).toMatchObject({
      candidates: ['a', 'b'],
    });
    const card = state.cards.find((c) => c.authorId === 'b')?.id ?? '';
    const r = guessWho.reduce(state, { type: 'guess', playerId: 'a', cardId: card, author: 'c' });
    expect(r).toEqual({ ok: false, error: { code: 'NOT_A_PLAYER' } });
  });

  it('a leaver who did answer stays a valid author — their card is still in play', () => {
    const state = expectOk(guessWho.reduce(seedGuess(), { type: 'playerLeft', id: 'c' }));
    expect(guessWho.view(state, { role: 'host' })).toMatchObject({ candidates: ['a', 'b', 'c'] });
  });

  it('a leaver who never answered stops holding up the collect count', () => {
    let state = expectOk(guessWho.reduce(collect(), { type: 'submit', playerId: 'a', text: 'x' }));
    state = expectOk(guessWho.reduce(state, { type: 'playerLeft', id: 'c' }));
    expect(guessWho.view(state, { role: 'host' })).toMatchObject({ submittedCount: 1, total: 2 });
  });
});

describe('answer text (plan-15 §1)', () => {
  it('trims an answer before it becomes a card', () => {
    const state = expectOk(
      guessWho.reduce(collect(), { type: 'submit', playerId: 'a', text: '  apples  ' }),
    );
    expect(state.drafts.a).toBe('apples');
  });

  it('refuses a blank or whitespace-only answer with EMPTY_ANSWER', () => {
    for (const text of ['', '   ', '\n\t', '\u200B', '\u2060\u200D']) {
      const result = guessWho.reduce(collect(), { type: 'submit', playerId: 'a', text });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('EMPTY_ANSWER');
      }
    }
  });

  it('caps an answer at MAX_ANSWER_LEN visible characters without splitting an emoji', () => {
    const text = '👍🏽'.repeat(MAX_ANSWER_LEN + 5);
    const state = expectOk(guessWho.reduce(collect(), { type: 'submit', playerId: 'a', text }));
    expect(state.drafts.a).toBe('👍🏽'.repeat(MAX_ANSWER_LEN));
  });
});
