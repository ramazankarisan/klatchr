import { describe, expect, it } from 'vitest';
import { webName } from './index.js';

describe('web placeholder', () => {
  it('name itself', () => {
    expect(webName).toBe('klatchr-web');
  });
});
