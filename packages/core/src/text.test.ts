import { describe, expect, it } from 'vitest';
import { isAdvance, isRosterType } from './eventShapes.js';
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

describe('boundedText caps before judging blankness', () => {
  it('is blank when only invisible characters survive the cap', () => {
    expect(boundedText(`${'\u200B'.repeat(20)}a`, 20)).toBe('');
  });

  it('bounds code units too — stacked combining marks cannot make a huge "1 character"', () => {
    const text = boundedText(`ab${'\u0301'.repeat(30_000)}`, 200);
    expect(text).toBe('a'); // the second grapheme alone is over the unit budget
  });
});

describe('event shape helpers', () => {
  it('isAdvance and isRosterType match only their own shapes', () => {
    expect(isAdvance({ type: 'advance', from: 'vote' })).toBe(true);
    expect(isAdvance({ type: 'vote' })).toBe(false);
    expect(isAdvance('advance')).toBe(false);
    expect(isRosterType({ type: 'playerLeft' })).toBe(true);
    expect(isRosterType({ type: 'playerJoined' })).toBe(true);
    expect(isRosterType({ type: 'vote' })).toBe(false);
    expect(isRosterType(null)).toBe(false);
  });
});
