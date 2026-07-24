import { guessWho, registeredGameIds } from './index.js';

describe('game registry', () => {
  it('registers Guess Who Said It', () => {
    expect(registeredGameIds).toContain('guess-who');
  });

  it('exposes the game with picker metadata and platform-safe bounds', () => {
    expect(guessWho.id).toBe('guess-who');
    expect(guessWho.contexts).toEqual(['teams']);
    expect(guessWho.minPlayers).toBeGreaterThanOrEqual(2);
    expect(guessWho.maxPlayers).toBeLessThanOrEqual(50);
  });
});
