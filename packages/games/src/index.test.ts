import { describe, expect, it } from 'vitest';
import { registeredGameIds } from './index.js';

describe('game registry', () => {
  it('start empty until Cycle 2 registers a game', () => {
    expect(registeredGameIds).toHaveLength(0);
  });
});
