import {
  type ConformanceSpec,
  redactionNonInterference,
  stormConformance,
} from '@klatchr/core/conformance';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { arbPromptConfig, nextIn } from '../conformance.testkit.js';
import type { GWEvent } from './events.js';
import { guessWho } from './guessWho.js';
import type { GWState } from './state.js';

/**
 * plan-13 A3/A4: the generic conformance kit, fuelled by ~30 lines of
 * guessWho-specific arbitraries. Card ids include stale/unknown ones on
 * purpose — a guess at a card that never existed must be refused, not crash.
 */

const spec: ConformanceSpec<GWState, GWEvent> = {
  game: guessWho,
  arbEvent: (ids) => {
    const actor = fc.constantFrom(...ids);
    return fc.oneof(
      fc.record({
        type: fc.constant('submit' as const),
        playerId: actor,
        text: fc.string({ maxLength: 12 }),
      }),
      fc.record({ type: fc.constant('skip' as const), playerId: actor }),
      fc.record({
        type: fc.constant('guess' as const),
        playerId: actor,
        cardId: fc.constantFrom('c0', 'c1', 'c2', 'c3', 'c11', 'nope'),
        author: actor,
      }),
      fc.constantFrom<GWEvent>(
        { type: 'advance', from: 'collect' },
        { type: 'advance', from: 'guess' },
      ),
    );
  },
  // The hidden data pre-reveal: answer texts while collecting, guess targets
  // while guessing. Who has acted is public by design (host progress), so a
  // variant alters content only — it never adds or removes an actor.
  hiddenVariants: (state) => {
    if (state.phase === 'collect') {
      return Object.entries(state.drafts).map(([playerId, text]) => ({
        playerId,
        state: { ...state, drafts: { ...state.drafts, [playerId]: `${text}~other` } },
      }));
    }
    if (state.phase === 'guess') {
      return Object.entries(state.guesses).map(([playerId, mine]) => ({
        playerId,
        state: {
          ...state,
          guesses: {
            ...state.guesses,
            [playerId]: Object.fromEntries(
              Object.entries(mine).map(([cardId, author]) => [
                cardId,
                nextIn(state.roster, author),
              ]),
            ),
          },
        },
      }));
    }
    return []; // reveal: cards, authors and scores are public — nothing hidden
  },
  arbConfig: arbPromptConfig,
  seed: 1302,
};

describe('guessWho conformance', () => {
  it('A3: I1/I2/I3/I5/I6 hold over 200 seeded event storms', () => {
    expect(() => stormConformance(spec)).not.toThrow();
  });

  it('A4: swapping a player’s hidden answer or guess never shifts another view', () => {
    expect(() => redactionNonInterference(spec)).not.toThrow();
  });
});
