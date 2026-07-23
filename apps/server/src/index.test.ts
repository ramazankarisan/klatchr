import { describe, expect, it } from 'vitest';
import { serverName } from './index.js';

describe('server placeholder', () => {
  it('name itself', () => {
    expect(serverName).toBe('klatchr-server');
  });
});
