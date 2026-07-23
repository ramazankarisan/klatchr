import { generateRoomCode } from './roomCode.js';

describe('generateRoomCode', () => {
  it('is four uppercase letters', () => {
    expect(generateRoomCode(() => 0, new Set())).toMatch(/^[A-Z]{4}$/);
  });

  it('is deterministic for a given random source', () => {
    expect(generateRoomCode(() => 0, new Set())).toBe('AAAA');
  });

  it('retries on collision until it finds a free code', () => {
    // First draw -> 'AAAA' (taken). Second draw -> 'BAAA' (free).
    const seq = [0, 0, 0, 0, 1.5 / 26, 0, 0, 0];
    let i = 0;
    const random = () => seq[i++] ?? 0;
    expect(generateRoomCode(random, new Set(['AAAA']))).toBe('BAAA');
  });
});
