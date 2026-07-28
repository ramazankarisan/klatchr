import { describe, expect, it } from 'vitest';
import { mockHostTransport, mockPlayerTransport } from './mockRoom.js';
import type { Transport, ViewFrame } from './types.js';

/** Latest frame from a synchronous mock transport (subscribe + send fire inline). */
function capture(transport: Transport): () => ViewFrame {
  let latest: ViewFrame | null = null;
  transport.subscribe((f) => {
    latest = f;
  });
  return () => {
    if (latest === null) throw new Error('no frame emitted');
    return latest;
  };
}

const phaseOf = (frame: ViewFrame): string =>
  JSON.parse(JSON.stringify(frame.gameView))?.phase ?? '';

describe('mock host transport', () => {
  it('seeds a lobby with a four-letter code and enough players to seat a round', () => {
    const frame = capture(mockHostTransport());
    expect(frame().phase).toBe('LOBBY');
    expect(frame().code).toHaveLength(4);
    expect(frame().players.length).toBeGreaterThanOrEqual(12);
  });

  it('plays a full round with reactive bots, withholding authorship and scores until reveal', () => {
    const host = mockHostTransport();
    const frame = capture(host);

    host.send({ type: 'selectGame', gameId: 'guess-who' });
    host.send({ type: 'startGame' });
    expect(phaseOf(frame())).toBe('collect'); // bots have submitted
    expect(frame().scores).toBeNull();
    expect(JSON.stringify(frame().gameView)).not.toContain('authorId');

    host.send({ type: 'gameEvent', event: { type: 'advance', from: 'collect' } });
    expect(phaseOf(frame())).toBe('guess');
    expect(JSON.stringify(frame().gameView)).not.toContain('authorId'); // still hidden

    host.send({ type: 'gameEvent', event: { type: 'advance', from: 'guess' } });
    expect(frame().phase).toBe('SCORES');
    expect(Array.isArray(frame().scores)).toBe(true); // scores only now
  });
});

describe('mock player transport', () => {
  it('seats you as a player in the lobby', () => {
    const current = capture(mockPlayerTransport())();
    expect(current.phase).toBe('LOBBY');
    expect(current.viewer.role).toBe('player');
    const you = current.viewer.role === 'player' ? current.viewer.id : '';
    expect(current.players.some((p) => p.id === you)).toBe(true);
  });
});
