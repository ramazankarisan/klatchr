import type { GameDeps, GameError, Player, Result } from '@klatchr/core';
import { mostLikelyTo } from './mostLikelyTo.js';
import type { MLTState } from './state.js';

const deps: GameDeps = { random: () => 0, now: () => 0, round: 1 };
const player = (id: string): Player => ({
  id,
  nickname: id,
  joinedDuringGame: false,
  spectator: false,
});

function expectOk(result: Result<MLTState, GameError>): MLTState {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(`expected ok, got ${result.error.code}`);
  }
  return result.value;
}

function voteRound(): MLTState {
  return mostLikelyTo.init([player('a'), player('b'), player('c')], deps);
}

function seedResults(): MLTState {
  const state = expectOk(
    mostLikelyTo.reduce(voteRound(), { type: 'vote', playerId: 'a', target: 'b' }),
  );
  return expectOk(mostLikelyTo.reduce(state, { type: 'advance', from: 'vote' }));
}

describe('init (M1)', () => {
  it('M1 seeds vote with a prompt and the active roster', () => {
    const state = voteRound();
    expect(state.phase).toBe('vote');
    expect(state.prompt.length).toBeGreaterThan(0);
    expect(state.roster).toEqual(['a', 'b', 'c']);
    expect(state.votes).toEqual({});
  });

  it('walks the built-in bank in round order — successive rounds, successive questions', () => {
    const at = (round: number) =>
      mostLikelyTo.init([player('a'), player('b')], { random: () => 0, now: () => 0, round });
    expect(at(1).prompt).not.toBe(at(2).prompt); // no repeat within a session
  });

  it('A5 uses a host-authored prompt over the built-in bank', () => {
    const state = mostLikelyTo.init([player('a'), player('b'), player('c')], deps, {
      prompts: ['Who is most likely to reply-all the whole company?'],
    });
    expect(state.prompt).toBe('Who is most likely to reply-all the whole company?');
  });

  it('A2 roundCount is the session length — authored size, else the built-in bank size', () => {
    expect(mostLikelyTo.roundCount?.({ prompts: ['x', 'y', 'z'] })).toBe(3);
    expect(mostLikelyTo.roundCount?.(undefined)).toBeGreaterThan(1);
  });
});

describe('vote', () => {
  it('records and overwrites a vote', () => {
    let state = expectOk(
      mostLikelyTo.reduce(voteRound(), { type: 'vote', playerId: 'a', target: 'b' }),
    );
    expect(state.votes.a).toBe('b');
    state = expectOk(mostLikelyTo.reduce(state, { type: 'vote', playerId: 'a', target: 'c' }));
    expect(state.votes.a).toBe('c');
  });

  it('allows a self-vote (toggle A)', () => {
    const state = expectOk(
      mostLikelyTo.reduce(voteRound(), { type: 'vote', playerId: 'a', target: 'a' }),
    );
    expect(state.votes.a).toBe('a');
  });

  it('rejects a vote from a non-roster (spectator) player', () => {
    const r = mostLikelyTo.reduce(voteRound(), { type: 'vote', playerId: 'z', target: 'a' });
    expect(r.ok === false && r.error.code).toBe('NOT_PLAYING');
  });

  it('rejects a vote for a target who is not a seated candidate', () => {
    const r = mostLikelyTo.reduce(voteRound(), { type: 'vote', playerId: 'a', target: 'z' });
    expect(r.ok === false && r.error.code).toBe('NOT_A_PLAYER');
  });

  it('rejects a vote once past the vote phase', () => {
    const r = mostLikelyTo.reduce(seedResults(), { type: 'vote', playerId: 'a', target: 'c' });
    expect(r.ok === false && r.error.code).toBe('WRONG_PHASE');
  });
});

describe('advance', () => {
  it('moves from vote to results', () => {
    const state = expectOk(mostLikelyTo.reduce(voteRound(), { type: 'advance', from: 'vote' }));
    expect(state.phase).toBe('results');
    expect(mostLikelyTo.isComplete(state)).toBe(true);
  });

  it('is idempotent on a phase mismatch (double-send)', () => {
    const state = seedResults();
    const again = expectOk(mostLikelyTo.reduce(state, { type: 'advance', from: 'vote' }));
    expect(again).toEqual(state);
  });

  it('isComplete is false before results', () => {
    expect(mostLikelyTo.isComplete(voteRound())).toBe(false);
  });
});

describe('roster events', () => {
  it('a mid-round join is a no-op — the joiner spectates', () => {
    const state = voteRound();
    const r = expectOk(mostLikelyTo.reduce(state, { type: 'playerJoined', player: player('zoe') }));
    expect(r).toEqual(state);
  });

  it('a leave is a no-op — the player keeps whatever vote they cast', () => {
    const state = expectOk(
      mostLikelyTo.reduce(voteRound(), { type: 'vote', playerId: 'a', target: 'b' }),
    );
    const r = expectOk(mostLikelyTo.reduce(state, { type: 'playerLeft', id: 'b' }));
    expect(r).toEqual(state);
  });
});
