import { tally } from './scoring.js';
import type { MLTState } from './state.js';

function resultsState(votes: MLTState['votes']): MLTState {
  return { phase: 'results', prompt: 'A prompt?', roster: ['a', 'b', 'c'], votes };
}

describe('scoring', () => {
  it('counts votes received per player, self-vote included, zero for none', () => {
    const scores = tally(
      resultsState({
        a: 'a', // self-vote counts (toggle A)
        b: 'a', // a receives from b too
        c: 'b', // b receives from c
      }),
    );
    expect(scores).toContainEqual({ playerId: 'a', points: 2 });
    expect(scores).toContainEqual({ playerId: 'b', points: 1 });
    expect(scores).toContainEqual({ playerId: 'c', points: 0 });
  });
});
