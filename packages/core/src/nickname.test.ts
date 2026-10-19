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

  it('treats an invisible-only name as empty', () => {
    expect(normaliseNickname('\u200B\u200D')).toEqual({ ok: false, error: 'EMPTY_NICKNAME' });
  });

  it('caps by visible character, never leaving half an emoji', () => {
    const r = normaliseNickname(`${'x'.repeat(19)}🇬🇧🇬🇧`);
    expect(r.ok && r.value.display).toBe(`${'x'.repeat(19)}🇬🇧`);
  });

  it('does not end on a space when the cap lands after one', () => {
    const r = normaliseNickname(`${'x'.repeat(19)} yz`);
    expect(r.ok && r.value.display).toBe('x'.repeat(19));
  });
});
