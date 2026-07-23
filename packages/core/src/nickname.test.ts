import { describe, expect, it } from 'vitest';
import { normaliseNickname } from './nickname.js';

describe('normaliseNickname', () => {
  it('trims and collapses inner whitespace', () => {
    expect(normaliseNickname('  Ada   Lovelace  ')).toEqual({
      ok: true,
      value: { display: 'Ada Lovelace', key: 'ada lovelace' },
    });
  });

  it('rejects an empty / whitespace-only nickname', () => {
    expect(normaliseNickname('   ')).toEqual({ ok: false, error: 'EMPTY_NICKNAME' });
  });

  it('folds case for the identity key', () => {
    const a = normaliseNickname('ADA');
    const b = normaliseNickname('ada');
    expect(a.ok && b.ok && a.value.key === b.value.key).toBe(true);
  });

  it('caps the display at 20 characters', () => {
    const r = normaliseNickname('x'.repeat(30));
    expect(r.ok && r.value.display.length).toBe(20);
  });
});
