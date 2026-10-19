import { codeFromLocation, forgetJoinLink } from './joinLink.js';

const at = (pathname: string, search = ''): { pathname: string; search: string } => ({
  pathname,
  search,
});

describe('codeFromLocation (UX-2 join link)', () => {
  it('reads a four-letter path code, case-insensitive, with or without a trailing slash', () => {
    expect(codeFromLocation(at('/WXYZ'))).toBe('WXYZ');
    expect(codeFromLocation(at('/wxyz'))).toBe('WXYZ');
    expect(codeFromLocation(at('/Plum/'))).toBe('PLUM');
  });

  it('reads ?code= when the path has none', () => {
    expect(codeFromLocation(at('/', '?code=plum'))).toBe('PLUM');
    expect(codeFromLocation(at('/', '?x=1&code=ABCD'))).toBe('ABCD');
  });

  it('prefers the path code over the query', () => {
    expect(codeFromLocation(at('/WXYZ', '?code=PLUM'))).toBe('WXYZ');
  });

  it('is no code for anything but exactly four letters', () => {
    for (const path of ['/', '/ABC', '/ABCDE', '/AB1D', '/assets/x.js', '/AB/CD', '/ÄBCD']) {
      expect(codeFromLocation(at(path))).toBeNull();
    }
    expect(codeFromLocation(at('/', '?code=AB'))).toBeNull();
    expect(codeFromLocation(at('/', '?code='))).toBeNull();
  });
});

describe('forgetJoinLink', () => {
  it('replaces the address with / — no reload, no new history entry', () => {
    window.history.replaceState(null, '', '/WXYZ?code=WXYZ');
    const entries = window.history.length;
    forgetJoinLink();
    expect(window.location.pathname).toBe('/');
    expect(window.location.search).toBe('');
    expect(window.history.length).toBe(entries);
  });
});
