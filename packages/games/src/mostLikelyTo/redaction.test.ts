import type { Viewer } from '@klatchr/core';
import type { MLTState } from './state.js';
import { viewFor } from './view.js';

const HOST: Viewer = { role: 'host' };
const asPlayer = (id: string): Viewer => ({ role: 'player', id });

function voteState(): MLTState {
  return { phase: 'vote', prompt: 'A prompt?', roster: ['a', 'b', 'c'], votes: { a: 'b', b: 'a' } };
}

function resultsState(): MLTState {
  return {
    phase: 'results',
    prompt: 'A prompt?',
    roster: ['a', 'b', 'c'],
    votes: { a: 'b', b: 'a', c: 'b' },
  };
}

function keysOf(value: unknown): string[] {
  return Object.keys(value as Record<string, unknown>);
}

describe('redaction (M8–M10)', () => {
  it('M8 a player never sees another voter’s target or any tally in vote', () => {
    const v = viewFor(voteState(), asPlayer('c'));
    expect(keysOf(v)).not.toContain('votes'); // no voter→target map
    expect(keysOf(v)).not.toContain('tally'); // no running tally to bandwagon on
    expect(v).toMatchObject({
      youVoted: false,
      votedCount: 2,
      total: 3,
      candidates: ['a', 'b', 'c'],
    });
    expect((v as { yourVote?: string }).yourVote).toBeUndefined();
  });

  it('reflects a player’s own vote back to them', () => {
    const v = viewFor(voteState(), asPlayer('a'));
    expect(v).toMatchObject({ youVoted: true, yourVote: 'b' });
  });

  it('M9 the host screen shows who voted, never a target or a tally (strictest)', () => {
    const v = viewFor(voteState(), HOST);
    expect(keysOf(v)).not.toContain('votes');
    expect(keysOf(v)).not.toContain('tally');
    expect(keysOf(v)).not.toContain('yourVote'); // the host casts nothing
    expect(v).toMatchObject({ voted: ['a', 'b'], votedCount: 2, total: 3 });
  });

  it('M10 results exposes the aggregate tally but never the voter→target map', () => {
    for (const viewer of [HOST, asPlayer('a')]) {
      const v = viewFor(resultsState(), viewer);
      expect(keysOf(v)).not.toContain('votes'); // individual votes stay private (toggle B)
      expect(v).toMatchObject({
        phase: 'results',
        tally: [
          { playerId: 'a', points: 1 },
          { playerId: 'b', points: 2 },
          { playerId: 'c', points: 0 },
        ],
      });
    }
  });
});
