import {
  type ConformanceSpec,
  redactionNonInterference,
  stormConformance,
} from '@klatchr/core/conformance';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { arbPromptConfig, nextIn } from '../conformance.testkit.js';
import type { MLTEvent } from './events.js';
import { mostLikelyTo } from './mostLikelyTo.js';
import type { MLTState } from './state.js';

/**
 * plan-13 A3/A4: the generic conformance kit, fuelled by MLT-specific
 * arbitraries. Voters and targets both draw from seated + ghost ids — a vote
 * by or for a ghost must be refused, not crash.
 */

const spec: ConformanceSpec<MLTState, MLTEvent> = {
  game: mostLikelyTo,
  arbEvent: (ids) => {
    const actor = fc.constantFrom(...ids);
    return fc.oneof(
      fc.record({
        type: fc.constant('vote' as const),
        playerId: actor,
        target: actor,
      }),
      fc.constant<MLTEvent>({ type: 'advance', from: 'vote' }),
    );
  },
  // The hidden data: who a voter picked, secret until results. That a voter
  // HAS voted is public (host progress), so a variant re-aims the vote at the
  // next roster member — it never adds or removes a voter.
  hiddenVariants: (state) => {
    if (state.phase !== 'vote') {
      return []; // results: the aggregate tally is public — nothing hidden
    }
    return Object.entries(state.votes).map(([playerId, target]) => ({
      playerId,
      state: { ...state, votes: { ...state.votes, [playerId]: nextIn(state.roster, target) } },
    }));
  },
  arbConfig: arbPromptConfig,
  seed: 2607,
};

describe('mostLikelyTo conformance', () => {
  it('A3: I1/I2/I3/I5/I6 hold over 200 seeded event storms', () => {
    expect(() => stormConformance(spec)).not.toThrow();
  });

  it('A4: swapping a player’s hidden vote never shifts another view', () => {
    expect(() => redactionNonInterference(spec)).not.toThrow();
  });
});
