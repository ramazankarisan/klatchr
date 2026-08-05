import { guessWho, mostLikelyTo, registeredGameIds } from './index.js';

describe('game registry', () => {
  it('registers both games', () => {
    expect(registeredGameIds).toContain('guess-who');
    expect(registeredGameIds).toContain('most-likely-to');
  });

  it('exposes Guess Who with picker metadata and its exact caps (A11)', () => {
    expect(guessWho.id).toBe('guess-who');
    expect(guessWho.contexts).toEqual(['teams']);
    expect(guessWho.minPlayers).toBeGreaterThanOrEqual(2);
    expect(guessWho.maxPlayers).toBe(12); // guessing 20 cards does not scale — stays 12 (D3)
  });

  it('exposes Most Likely To with picker metadata and its exact caps (A11)', () => {
    expect(mostLikelyTo.id).toBe('most-likely-to');
    expect(mostLikelyTo.contexts).toEqual(['teams', 'strangers']);
    expect(mostLikelyTo.minPlayers).toBeGreaterThanOrEqual(2);
    expect(mostLikelyTo.maxPlayers).toBe(20); // voting a 20-name list scales (D3)
  });
});
