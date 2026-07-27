import type { Viewer } from '@klatchr/core';
import { MockEngine } from './mockRoom.js';

const HOST: Viewer = { role: 'host' };
const phaseOf = (view: unknown): string => (view as { phase?: string }).phase ?? '';

describe('MockEngine', () => {
  it('seeds a lobby with a four-letter code and enough players to seat a round', () => {
    const engine = new MockEngine();
    const frame = engine.snapshot(HOST);
    expect(frame.phase).toBe('LOBBY');
    expect(frame.code).toHaveLength(4);
    expect(frame.players.length).toBeGreaterThanOrEqual(12);
  });

  it('starts a round into the collect phase with answers submitted', () => {
    const engine = new MockEngine();
    engine.step();
    const frame = engine.snapshot(HOST);
    expect(frame.phase).toBe('IN_GAME');
    expect(phaseOf(frame.gameView)).toBe('collect');
  });

  it('redacts author identity from both player and host views during guess', () => {
    const engine = new MockEngine();
    engine.step(); // start + submit -> collect
    engine.step(); // advance -> guess (+ bots guess)

    const active = engine.snapshot(HOST).players.filter((p) => !p.spectator);
    const someone = active[0];
    if (someone === undefined) {
      throw new Error('expected an active player');
    }
    const playerView = engine.snapshot({ role: 'player', id: someone.id }).gameView;
    const playerJson = JSON.stringify(playerView);
    expect(phaseOf(playerView)).toBe('guess');
    expect(playerJson).not.toContain('authorId'); // no card reveals its author
    expect(playerJson).not.toContain('"guesses"'); // never another player's guesses

    const hostJson = JSON.stringify(engine.snapshot(HOST).gameView);
    expect(hostJson).not.toContain('authorId'); // the shared screen is strictest

    // scores are withheld until reveal — no running standings mid-round
    expect(engine.snapshot({ role: 'player', id: someone.id }).scores).toBeNull();
    expect(engine.snapshot(HOST).scores).toBeNull();
  });

  it('reveals authors and scores after the final advance', () => {
    const engine = new MockEngine();
    engine.step();
    engine.step();
    engine.step(); // advance guess -> reveal (game complete -> room SCORES)
    const frame = engine.snapshot(HOST);
    expect(frame.phase).toBe('SCORES');
    expect(phaseOf(frame.gameView)).toBe('reveal');
    expect(frame.scores).not.toBeNull();
  });
});
