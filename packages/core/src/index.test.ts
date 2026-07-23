import { describe, expect, it } from 'vitest';
import { MAX_PLAYERS, MIN_PLAYERS } from './index.js';

describe('room-size bounds', () => {
  it('span 2..12 inclusive', () => {
    expect(MIN_PLAYERS).toBe(2);
    expect(MAX_PLAYERS).toBe(12);
  });

  it('min is below max', () => {
    expect(MIN_PLAYERS).toBeLessThan(MAX_PLAYERS);
  });
});
