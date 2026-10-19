import { describe, expect, it } from 'vitest';
import { boundedText, isRecord } from './text.js';

describe('boundedText', () => {
  it('trims and keeps text under the cap as-is', () => {
    expect(boundedText('  pizza  ', 10)).toBe('pizza');
  });

  it('is blank for whitespace or invisible format characters alone', () => {
    for (const raw of ['', '   ', '​', '⁠‍', ' ​\t']) {
      expect(boundedText(raw, 10)).toBe('');
    }
  });

  it('caps by grapheme: a flag, a skin tone or a ZWJ emoji is never split', () => {
    expect(boundedText(`${'x'.repeat(4)}🇬🇧`, 5)).toBe('xxxx🇬🇧');
    expect(boundedText('👍🏽👍🏽👍🏽', 2)).toBe('👍🏽👍🏽');
    expect(boundedText('👩‍💻 Ada', 20)).toBe('👩‍💻 Ada'); // the ZWJ survives inside text
  });

  it('does not end on whitespace when the cap lands after a space', () => {
    expect(boundedText('abc def', 4)).toBe('abc');
  });
});

describe('isRecord', () => {
  it('accepts objects and arrays, refuses null and primitives', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord([])).toBe(true);
    for (const value of [null, undefined, 0, 'x', true]) {
      expect(isRecord(value)).toBe(false);
    }
  });
});
