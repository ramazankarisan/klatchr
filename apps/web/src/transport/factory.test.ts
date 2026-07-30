import { describe, expect, it } from 'vitest';
import { resolveWsUrl } from './factory.js';

/**
 * The single-service (7.3) `same-origin` sentinel: the prod build sets
 * `VITE_WS_URL=same-origin`; the factory expands it to this page's own origin at
 * runtime (rule 6 — the URL still comes *from* the env, no host is baked).
 */
describe('resolveWsUrl', () => {
  it('expands "same-origin" to wss on an https page', () => {
    expect(resolveWsUrl('same-origin', { protocol: 'https:', host: 'klatchr.duckdns.org' })).toBe(
      'wss://klatchr.duckdns.org',
    );
  });

  it('expands "same-origin" to ws on a plain http page (dev over http)', () => {
    expect(resolveWsUrl('same-origin', { protocol: 'http:', host: 'localhost:8080' })).toBe(
      'ws://localhost:8080',
    );
  });

  it('passes an explicit url through unchanged', () => {
    const loc = { protocol: 'http:', host: 'localhost:5173' };
    expect(resolveWsUrl('ws://localhost:8080', loc)).toBe('ws://localhost:8080');
  });

  it('leaves undefined as undefined (→ the mock transport)', () => {
    expect(resolveWsUrl(undefined, { protocol: 'http:', host: 'x' })).toBeUndefined();
  });
});
