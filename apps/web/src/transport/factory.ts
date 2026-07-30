import { mockHostTransport, mockPlayerTransport } from './mockRoom.js';
import { type SocketInit, SocketTransport } from './socket.js';
import type { Transport } from './types.js';

/**
 * Picks the transport: a real `SocketTransport` when `VITE_WS_URL` is set (the
 * browser, dev + prod — rule 6, never a hardcoded host), the in-browser
 * `MockEngine` otherwise (RTL tests run with no server). One transport per
 * surface, bound to its viewer.
 */

// In a single-service deploy (7.3) the client talks to its *own* origin, so the
// prod build sets `VITE_WS_URL=same-origin` rather than baking a host — the URL
// still comes *from* `VITE_WS_URL` (rule 6 holds), we just expand it at runtime to
// `ws(s)://<this-host>` (wss under https). Any other value is used verbatim.
const SAME_ORIGIN = 'same-origin';
export function resolveWsUrl(
  raw: string | undefined,
  loc: { protocol: string; host: string },
): string | undefined {
  if (raw === undefined || raw !== SAME_ORIGIN) {
    return raw;
  }
  const scheme = loc.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${loc.host}`;
}

const wsUrl = (): string | undefined => resolveWsUrl(import.meta.env.VITE_WS_URL, window.location);

const HOST_KEY = 'klatchr:host';

/** The persisted host session (if any), so a full page reload can resume the room (8.1). */
export function storedHostSession(): { code: string; hostToken: string } | null {
  const raw = localStorage.getItem(HOST_KEY);
  if (raw === null) {
    return null;
  }
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v === 'object' && v !== null && 'code' in v && 'hostToken' in v) {
      const { code, hostToken } = v;
      if (typeof code === 'string' && typeof hostToken === 'string') {
        return { code, hostToken };
      }
    }
  } catch {
    // Corrupt entry — treat as no stored session.
  }
  return null;
}

/** Forget the host session (a resume failed, or the room ended) so it can't loop. */
export function clearHostSession(): void {
  localStorage.removeItem(HOST_KEY);
}

export function createHostTransport(
  nickname: string,
  resume?: { code: string; hostToken: string },
): Transport {
  const url = wsUrl();
  if (url === undefined) {
    return mockHostTransport();
  }
  const init: SocketInit =
    resume === undefined ? { role: 'host', nickname } : { role: 'host', nickname, resume };
  const transport = new SocketTransport(url, init);
  // Persist the host session (code + secret) so a full reload resumes this room.
  transport.onHostSession = (session) => localStorage.setItem(HOST_KEY, JSON.stringify(session));
  return transport;
}

const nickKey = (code: string): string => `klatchr:nick:${code}`;

/** The name a prior session joined this code with (F1), so the join form can say
 * "resuming as <name>" instead of silently ignoring a freshly-typed one. */
export function storedNick(code: string): string | null {
  return localStorage.getItem(nickKey(code));
}

export function createPlayerTransport(code: string, nickname: string): Transport {
  const url = wsUrl();
  if (url === undefined) {
    return mockPlayerTransport();
  }
  const key = `klatchr:reconnect:${code}`;
  const stored = localStorage.getItem(key);
  const init: SocketInit =
    stored === null
      ? { role: 'player', code, nickname }
      : { role: 'player', code, nickname, reconnectToken: stored };
  const transport = new SocketTransport(url, init);
  // E3: persist the resume secret + the name so a refresh resumes the same slot,
  // and the join form can show "resuming as <name>" next time (F1).
  transport.onReconnectToken = (token) => {
    localStorage.setItem(key, token);
    localStorage.setItem(nickKey(code), nickname);
  };
  return transport;
}
