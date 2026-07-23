import { MAX_PLAYERS, MIN_PLAYERS } from './index.js';

describe('room-size bounds', () => {
  it('span 2..50 inclusive', () => {
    expect(MIN_PLAYERS).toBe(2);
    expect(MAX_PLAYERS).toBe(50);
  });
});
