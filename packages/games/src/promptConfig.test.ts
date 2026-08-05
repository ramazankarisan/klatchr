import type { GameDeps } from '@klatchr/core';
import { describe, expect, it } from 'vitest';
import { PACKS as guessWhoPacks } from './guessWho/packs.js';
import { PACKS as mostLikelyToPacks } from './mostLikelyTo/packs.js';
import { choosePrompt, promptCount, validPrompts } from './promptConfig.js';

const BUILTIN = ['B0', 'B1', 'B2'] as const;
const depsAt = (round: number, random = 0): GameDeps => ({
  random: () => random,
  now: () => 0,
  round,
});

describe('validPrompts (A8)', () => {
  it('returns null for a non-object, null, missing prompts, or non-array prompts', () => {
    expect(validPrompts(undefined)).toBeNull();
    expect(validPrompts(null)).toBeNull();
    expect(validPrompts(42)).toBeNull();
    expect(validPrompts({})).toBeNull();
    expect(validPrompts({ prompts: 'nope' })).toBeNull();
  });

  it('trims, drops blanks and non-strings, and de-dupes case-insensitively', () => {
    expect(validPrompts({ prompts: ['  Hi  ', 'hi', 'HI', '', '   ', 7, 'Bye'] })).toEqual([
      'Hi',
      'Bye',
    ]);
  });

  it('caps a very long question and returns null when nothing usable survives', () => {
    expect(validPrompts({ prompts: ['x'.repeat(500)] })).toEqual(['x'.repeat(200)]);
    expect(validPrompts({ prompts: ['', '   ', 3] })).toBeNull();
  });

  it('caps the count at 50', () => {
    const many = Array.from({ length: 80 }, (_, i) => `q${i}`);
    expect(validPrompts({ prompts: many })).toHaveLength(50);
  });
});

describe('choosePrompt (A1) — in-order walk, a set is the session', () => {
  it('walks an authored set in order, one per round, no repeat within the session', () => {
    const config = { prompts: ['Q1', 'Q2', 'Q3'] };
    expect(choosePrompt(config, depsAt(1), BUILTIN)).toBe('Q1');
    expect(choosePrompt(config, depsAt(2), BUILTIN)).toBe('Q2');
    expect(choosePrompt(config, depsAt(3), BUILTIN)).toBe('Q3');
  });

  it('walks the built-in bank in order when there is no usable config', () => {
    expect(choosePrompt(undefined, depsAt(1), BUILTIN)).toBe('B0');
    expect(choosePrompt(undefined, depsAt(2), BUILTIN)).toBe('B1');
    expect(choosePrompt({ prompts: [] }, depsAt(3), BUILTIN)).toBe('B2');
  });

  it('falls to the first built-in for a degenerate round (0 or past the set) the room never starts', () => {
    expect(choosePrompt({ prompts: ['Q1', 'Q2'] }, depsAt(0), BUILTIN)).toBe('B0');
    expect(choosePrompt({ prompts: ['Q1', 'Q2'] }, depsAt(5), BUILTIN)).toBe('B0');
  });
});

describe('promptCount (A2) — the session length', () => {
  it('is the authored set length, or the built-in bank length with no usable config', () => {
    expect(promptCount({ prompts: ['Q1', 'Q2', 'Q3'] }, BUILTIN)).toBe(3);
    expect(promptCount(undefined, BUILTIN)).toBe(3);
    expect(promptCount({ prompts: [] }, BUILTIN)).toBe(3); // empty ⇒ built-in
  });
});

describe('shipped packs are clean (A9)', () => {
  it('every pack is non-empty and its questions survive validation unchanged', () => {
    for (const packs of [guessWhoPacks, mostLikelyToPacks]) {
      expect(packs.length).toBeGreaterThan(0);
      for (const pack of packs) {
        expect(validPrompts({ prompts: pack.prompts })).toEqual([...pack.prompts]);
      }
    }
  });
});
