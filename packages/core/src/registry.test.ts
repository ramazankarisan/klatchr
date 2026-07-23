import { stubGame } from './game.testkit.js';
import { createRegistry } from './registry.js';

describe('createRegistry', () => {
  it('has and gets a registered game', () => {
    const game = stubGame({ id: 'guess' });
    const registry = createRegistry([game]);
    expect(registry.has('guess')).toBe(true);
    expect(registry.get('guess')).toBe(game);
    expect(registry.list()).toHaveLength(1);
  });

  it('misses an unregistered id', () => {
    const registry = createRegistry([]);
    expect(registry.has('nope')).toBe(false);
    expect(registry.get('nope')).toBeUndefined();
  });

  it('lets the last registration win on a duplicate id', () => {
    const first = stubGame({ id: 'dup', name: 'first' });
    const second = stubGame({ id: 'dup', name: 'second' });
    const registry = createRegistry([first, second]);
    expect(registry.get('dup')).toBe(second);
    expect(registry.list()).toHaveLength(1);
  });

  it('E4 surfaces a game context tag for the picker', () => {
    const registry = createRegistry([stubGame({ id: 'gw', contexts: ['teams'] })]);
    expect(registry.get('gw')?.contexts).toEqual(['teams']);
  });

  it('E4 leaves contexts undefined when a game omits it', () => {
    const registry = createRegistry([stubGame({ id: 'plain' })]);
    expect(registry.get('plain')?.contexts).toBeUndefined();
  });

  it('E2a rejects a game whose maxPlayers exceeds the platform ceiling', () => {
    expect(() => createRegistry([stubGame({ maxPlayers: 51 })])).toThrow(/MAX_PLAYERS/);
  });

  it('E2 rejects a game whose minPlayers is below the platform floor', () => {
    expect(() => createRegistry([stubGame({ minPlayers: 1 })])).toThrow(/MIN_PLAYERS/);
  });

  it('E2b rejects a game whose minPlayers exceeds its maxPlayers', () => {
    expect(() => createRegistry([stubGame({ minPlayers: 5, maxPlayers: 4 })])).toThrow(
      /exceeds its maxPlayers/,
    );
  });
});
