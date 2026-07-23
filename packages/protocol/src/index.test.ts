import { describe, expect, it } from 'vitest';
import { ping } from './index.js';

describe('ping schema', () => {
  it('accept a well-formed ping', () => {
    expect(ping.parse({ type: 'ping' })).toEqual({ type: 'ping' });
  });

  it('reject anything else', () => {
    expect(ping.safeParse({ type: 'pong' }).success).toBe(false);
  });
});
