import type { Viewer } from '@klatchr/core';
import type { GWState } from './state.js';
import { viewFor } from './view.js';

const HOST: Viewer = { role: 'host' };
const asPlayer = (id: string): Viewer => ({ role: 'player', id });

function collectState(): GWState {
  return {
    phase: 'collect',
    prompt: 'A prompt?',
    roster: ['a', 'b', 'c'],
    drafts: { a: 'apples', b: 'bananas' },
    cards: [],
    guesses: {},
  };
}

function guessState(): GWState {
  return {
    phase: 'guess',
    prompt: 'A prompt?',
    roster: ['a', 'b', 'c'],
    drafts: { a: 'apples', b: 'bananas', c: 'cherries' },
    cards: [
      { id: 'c0', text: 'apples', authorId: 'a' },
      { id: 'c1', text: 'bananas', authorId: 'b' },
      { id: 'c2', text: 'cherries', authorId: 'c' },
    ],
    guesses: { a: { c1: 'b' }, b: { c0: 'a' } },
  };
}

function keysOf(value: unknown): string[] {
  return Object.keys(value as Record<string, unknown>);
}

function cardsOf(value: unknown): Array<Record<string, unknown>> {
  return (value as { cards: Array<Record<string, unknown>> }).cards;
}

describe('redaction (G8–G10)', () => {
  it('G8 a player never sees another player’s draft in collect', () => {
    const v = viewFor(collectState(), asPlayer('c'));
    const json = JSON.stringify(v);
    expect(json).not.toContain('apples');
    expect(json).not.toContain('bananas');
    expect(v).toMatchObject({ youSubmitted: false, submittedCount: 2, total: 3 });
  });

  it('G8 the host screen shows who submitted, never the draft text', () => {
    const v = viewFor(collectState(), HOST);
    const json = JSON.stringify(v);
    expect(json).not.toContain('apples');
    expect(json).not.toContain('bananas');
    expect(v).toMatchObject({ submitted: ['a', 'b'] });
  });

  it('reflects a player’s own submission back to them', () => {
    const v = viewFor(collectState(), asPlayer('a'));
    expect(v).toMatchObject({ youSubmitted: true });
  });

  it('G9 a player sees anonymised cards and only their own guesses', () => {
    const v = viewFor(guessState(), asPlayer('a'));
    for (const card of cardsOf(v)) {
      expect(keysOf(card).sort()).toEqual(['id', 'text']);
    }
    expect(v).toMatchObject({ myGuesses: { c1: 'b' } });
    expect(keysOf(v)).not.toContain('guesses'); // no one else’s guesses
  });

  it('G9 a player who has not guessed sees an empty guess map', () => {
    const v = viewFor(guessState(), asPlayer('c'));
    expect(v).toMatchObject({ myGuesses: {} });
  });

  it('G10 the host screen leaks no authorship in guess (strictest)', () => {
    const v = viewFor(guessState(), HOST);
    for (const card of cardsOf(v)) {
      expect('authorId' in card).toBe(false);
    }
    expect(keysOf(v)).not.toContain('authors');
    expect(keysOf(v)).not.toContain('myGuesses');
    expect(v).toMatchObject({ guessed: ['a', 'b'] }); // progress only, not contents
  });

  it('reveals authors and scores to everyone at reveal', () => {
    const v = viewFor({ ...guessState(), phase: 'reveal' }, HOST);
    expect(v).toMatchObject({
      phase: 'reveal',
      cards: [
        { id: 'c0', text: 'apples', authorId: 'a' },
        { id: 'c1', text: 'bananas', authorId: 'b' },
        { id: 'c2', text: 'cherries', authorId: 'c' },
      ],
      scores: [
        { playerId: 'a', points: 1 },
        { playerId: 'b', points: 1 },
        { playerId: 'c', points: 0 },
      ],
    });
  });
});
