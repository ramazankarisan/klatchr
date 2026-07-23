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
});
