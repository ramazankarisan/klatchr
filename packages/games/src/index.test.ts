import { guessWho, mostLikelyTo, registeredGameIds } from './index.js';

describe('game registry', () => {
  it('registers both games', () => {
    expect(registeredGameIds).toContain('guess-who');
    expect(registeredGameIds).toContain('most-likely-to');
  });

  it('exposes Guess Who with picker metadata and platform-safe bounds', () => {
    expect(guessWho.id).toBe('guess-who');
    expect(guessWho.contexts).toEqual(['teams']);
    expect(guessWho.minPlayers).toBeGreaterThanOrEqual(2);
    expect(guessWho.maxPlayers).toBeLessThanOrEqual(50);
  });

  it('exposes Most Likely To with picker metadata and platform-safe bounds', () => {
    expect(mostLikelyTo.id).toBe('most-likely-to');
    expect(mostLikelyTo.contexts).toEqual(['teams', 'strangers']);
    expect(mostLikelyTo.minPlayers).toBeGreaterThanOrEqual(2);
    expect(mostLikelyTo.maxPlayers).toBeLessThanOrEqual(50);
  });
});
