import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  type ConformanceSpec,
  gameConformance,
  redactionNonInterference,
} from './conformance.testkit.js';
import type { Game, GameError, RosterEvent } from './game.js';
import type { Result } from './result.js';
import { err, ok } from './result.js';

/**
 * Self-tests for the conformance kit (plan-13 A1): deliberately broken mutant
 * games must FAIL the kit, and an honest game must pass — proof the invariants
 * have teeth and are not vacuously green.
 */

interface MiniState {
  phase: 'hidden' | 'shown';
  roster: readonly string[];
  notes: Readonly<Record<string, string>>; // hidden until 'shown'
}

type MiniEvent =
  | { type: 'note'; playerId: string; text: string }
  | { type: 'advance'; from: 'hidden' };

function miniReduce(
  state: MiniState,
  event: MiniEvent | RosterEvent,
): Result<MiniState, GameError> {
  switch (event.type) {
    case 'note':
      if (state.phase !== 'hidden') {
        return err({ code: 'WRONG_PHASE' });
      }
      if (!state.roster.includes(event.playerId)) {
        return err({ code: 'NOT_PLAYING' });
      }
      return ok({ ...state, notes: { ...state.notes, [event.playerId]: event.text } });
    case 'advance':
      return event.from === state.phase ? ok({ ...state, phase: 'shown' }) : ok(state);
    case 'playerJoined':
    case 'playerLeft':
      return ok(state);
  }
}

/** An honest little hidden-information game the mutants are carved from. */
function miniGame(overrides: Partial<Game<MiniState, MiniEvent>> = {}): Game<MiniState, MiniEvent> {
  return {
    id: 'mini',
    name: 'Mini',
    description: 'kit self-test double',
    minPlayers: 2,
    maxPlayers: 5,
    init: (players) => ({ phase: 'hidden', roster: players.map((p) => p.id), notes: {} }),
    reduce: miniReduce,
    view: (state, viewer) => {
      const count = Object.keys(state.notes).length;
      if (state.phase === 'shown') {
        return { phase: state.phase, notes: state.notes };
      }
      if (viewer.role === 'host') {
        return { phase: state.phase, count };
      }
      return { phase: state.phase, count, mine: state.notes[viewer.id] ?? null };
    },
    scores: (state) =>
      Object.keys(state.notes)
        .filter((id) => state.roster.includes(id))
        .map((playerId) => ({ playerId, points: 1 })),
    isComplete: (state) => state.phase === 'shown',
    ...overrides,
  };
}

function miniSpec(
  overrides: Partial<Game<MiniState, MiniEvent>> = {},
): ConformanceSpec<MiniState, MiniEvent> {
  return {
    game: miniGame(overrides),
    arbEvent: (ids) =>
      fc.oneof(
        fc.record({
          type: fc.constant('note' as const),
          playerId: fc.constantFrom(...ids),
          text: fc.string({ maxLength: 5 }),
        }),
        fc.constant({ type: 'advance' as const, from: 'hidden' as const }),
      ),
    hiddenVariants: (state) => {
      if (state.phase !== 'hidden') {
        return []; // once shown, nothing is hidden — no worlds to compare
      }
      return Object.entries(state.notes).map(([playerId, text]) => ({
        playerId,
        state: { ...state, notes: { ...state.notes, [playerId]: `${text}~alt` } },
      }));
    },
    seed: 42,
  };
}

describe('conformance kit self-tests (A1)', () => {
  it('an honest game passes the full kit', () => {
    expect(() => gameConformance(miniSpec())).not.toThrow();
  });

  it('a reducer that mutates its input state fails the kit (I3)', () => {
    const mutant = miniSpec({
      reduce: (state, event) => {
        if (event.type === 'note' && state.phase === 'hidden') {
          (state.notes as Record<string, string>)[event.playerId] = event.text;
          return ok(state);
        }
        return miniReduce(state, event);
      },
    });
    expect(() => gameConformance(mutant)).toThrowError(/read only|not extensible|frozen/i);
  });

  it('a reducer that throws fails the kit (I1)', () => {
    const mutant = miniSpec({
      reduce: (state, event) => {
        if (event.type === 'note') {
          throw new Error('boom');
        }
        return miniReduce(state, event);
      },
    });
    expect(() => gameConformance(mutant)).toThrowError(/boom/);
  });

  it('a view that leaks another player’s hidden data fails the kit (I4)', () => {
    const mutant = miniSpec({
      view: (state, viewer) => {
        if (state.phase === 'hidden' && viewer.role === 'player') {
          return { phase: state.phase, all: state.notes }; // the leak
        }
        return miniGame().view(state, viewer);
      },
    });
    expect(() => redactionNonInterference(mutant)).toThrowError(/I4/);
  });

  it('a rejection without a typed error code fails the kit (I2)', () => {
    const mutant = miniSpec({
      reduce: (state, event) => {
        if (event.type === 'note') {
          return err({ code: '' }); // untyped: an empty code says nothing
        }
        return miniReduce(state, event);
      },
    });
    expect(() => gameConformance(mutant)).toThrowError(/I2/);
  });

  it('a game that rejects roster events fails the kit (I6)', () => {
    const mutant = miniSpec({
      reduce: (state, event) => {
        if (event.type === 'playerLeft') {
          return err({ code: 'NO_LEAVING' });
        }
        return miniReduce(state, event);
      },
    });
    expect(() => gameConformance(mutant)).toThrowError(/I6/);
  });

  it('scores for a player who was never seated fail the kit (I5)', () => {
    const mutant = miniSpec({
      scores: () => [{ playerId: 'intruder', points: 3 }],
    });
    expect(() => gameConformance(mutant)).toThrowError(/I5/);
  });

  it('a shallow-frozen state does not blind the freeze — nested mutation still fails (I3)', () => {
    // A game might hand back a state it froze at the TOP level only; the kit
    // must still freeze (and so detect mutation of) the subtrees underneath.
    const mutant = miniSpec({
      init: (players) =>
        Object.freeze({ phase: 'hidden', roster: players.map((p) => p.id), notes: {} }),
      reduce: (state, event) => {
        if (event.type === 'note' && state.phase === 'hidden') {
          (state.notes as Record<string, string>)[event.playerId] = event.text;
          return ok(state);
        }
        return miniReduce(state, event);
      },
    });
    expect(() => gameConformance(mutant)).toThrowError(/read only|not extensible|frozen/i);
  });

  it('a view that leaks only to a mid-round joiner still fails the kit (I4)', () => {
    // The storm seats late-k spectators mid-game; a leak rendered only to one
    // of THOSE viewers must not escape because the viewer set skipped them.
    const mutant = miniSpec({
      view: (state, viewer) => {
        if (state.phase === 'hidden' && viewer.role === 'player' && viewer.id.startsWith('late-')) {
          return { phase: state.phase, all: state.notes }; // the leak, spectators only
        }
        return miniGame().view(state, viewer);
      },
    });
    expect(() => redactionNonInterference(mutant)).toThrowError(/I4/);
  });
});
