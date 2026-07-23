import { normaliseNickname } from './nickname.js';

describe('normaliseNickname', () => {
  it('trims and collapses inner whitespace', () => {
    expect(normaliseNickname('  Ada   Lovelace  ')).toEqual({
      ok: true,
      value: { display: 'Ada Lovelace' },
    });
  });

  it('rejects an empty / whitespace-only nickname', () => {
    expect(normaliseNickname('   ')).toEqual({ ok: false, error: 'EMPTY_NICKNAME' });
  });

  it('caps the display at 20 characters', () => {
    const r = normaliseNickname('x'.repeat(30));
    expect(r.ok && r.value.display.length).toBe(20);
  });
});
