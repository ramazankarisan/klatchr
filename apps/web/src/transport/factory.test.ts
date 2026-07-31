import { afterEach, describe, expect, it } from 'vitest';
import { clearHostSession, resolveWsUrl, storedHostSession, storedNick } from './factory.js';

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

describe('host session persistence (8.1)', () => {
  afterEach(() => localStorage.clear());

  it('round-trips a stored host session and clears it', () => {
    expect(storedHostSession()).toBeNull();
    localStorage.setItem('klatchr:host', JSON.stringify({ code: 'WXYZ', hostToken: 'htok' }));
    expect(storedHostSession()).toEqual({ code: 'WXYZ', hostToken: 'htok' });
    clearHostSession();
    expect(storedHostSession()).toBeNull();
  });

  it('ignores a corrupt or wrong-shaped entry', () => {
    localStorage.setItem('klatchr:host', 'not json');
    expect(storedHostSession()).toBeNull();
    localStorage.setItem('klatchr:host', JSON.stringify({ code: 'WXYZ' })); // missing hostToken
    expect(storedHostSession()).toBeNull();
  });
});

describe('storedNick (B6 — the resume hint)', () => {
  afterEach(() => localStorage.clear());

  it('reads the stored nickname per room code', () => {
    expect(storedNick('WXYZ')).toBeNull();
    localStorage.setItem('klatchr:nick:WXYZ', 'Ada');
    expect(storedNick('WXYZ')).toBe('Ada');
    expect(storedNick('ZZZZ')).toBeNull(); // scoped to the code
  });
});
