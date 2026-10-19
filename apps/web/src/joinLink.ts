import { isRoomCode } from '@klatchr/core';

/**
 * The join link (UX-2): a board shows `<host>/<CODE>`, so a phone that opens it lands on
 * the join form with the code filled in. `?code=CODE` works too. The server's static
 * handler (and Vite dev) serve the SPA shell for any extensionless path, so `/<CODE>` loads
 * the app. A code is one `generateRoomCode` could mint (core's alphabet and length), in any
 * case; anything else is no code, and the app opens on the landing.
 */
const asCode = (raw: string): string | null => {
  const code = raw.trim().toUpperCase();
  return isRoomCode(code) ? code : null;
};

export function codeFromLocation(loc: { pathname: string; search: string }): string | null {
  return (
    asCode(loc.pathname.replace(/^\/+|\/+$/g, '')) ??
    asCode(new URLSearchParams(loc.search).get('code') ?? '')
  );
}

/** Put the address back to `/` so a stale link code is never read later — on every path
 * out of the initial screen (a join, Back, "Not this room?", a host resume, hosting). A
 * replace, not a push — no extra history entry, so the browser's back button is never
 * trapped — and no reload. */
export function forgetJoinLink(): void {
  if (typeof window === 'undefined') {
    return;
  }
  const { pathname, search } = window.location;
  if (pathname !== '/' || search !== '') {
    window.history.replaceState(null, '', '/');
  }
}
