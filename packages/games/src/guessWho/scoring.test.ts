import { tally } from './scoring.js';
import type { GWState } from './state.js';

function revealState(guesses: GWState['guesses']): GWState {
  return {
    phase: 'reveal',
    prompt: 'A prompt?',
    roster: ['a', 'b', 'c'],
    drafts: {},
    cards: [
      { id: 'c0', text: 'apples', authorId: 'a' },
      { id: 'c1', text: 'bananas', authorId: 'b' },
      { id: 'c2', text: 'cherries', authorId: 'c' },
    ],
    guesses,
  };
}

describe('scoring', () => {
  it('awards +1 per correct guess and 0 for a wrong or absent guess', () => {
    const scores = tally(
      revealState({
        a: { c1: 'b', c2: 'a' }, // c1 correct (+1), c2 wrong
        b: { c0: 'a' }, // correct (+1)
        // c made no guesses
      }),
    );
    expect(scores).toContainEqual({ playerId: 'a', points: 1 });
    expect(scores).toContainEqual({ playerId: 'b', points: 1 });
    expect(scores).toContainEqual({ playerId: 'c', points: 0 });
  });
});
