import { describe, expect, it } from 'vitest';
import { describeError } from './errors.js';

describe('describeError', () => {
  it('maps each fatal server error to human copy', () => {
    for (const code of [
      'NO_SUCH_ROOM',
      'ROOM_FULL',
      'EMPTY_NICKNAME',
      'ROOM_CLOSED',
      'BAD_HOST_TOKEN',
      'JOIN_FAILED',
    ]) {
      const copy = describeError(code);
      expect(copy).not.toBeNull();
      expect(copy?.title).toBeTruthy();
      expect(copy?.body).toBeTruthy();
    }
  });

  it('returns null for a non-fatal in-game rejection (frames keep flowing)', () => {
    expect(describeError('GAME_REJECTED: WRONG_PHASE')).toBeNull();
    expect(describeError('ALREADY_IN_ROOM')).toBeNull();
    expect(describeError('NOT_IN_ROOM')).toBeNull();
  });

  it('returns null for an unknown code or a missing message', () => {
    expect(describeError('SOMETHING_NEW')).toBeNull();
    expect(describeError(undefined)).toBeNull();
  });
});
