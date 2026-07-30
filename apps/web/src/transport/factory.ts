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

export function createHostTransport(nickname: string): Transport {
  const url = wsUrl();
  return url === undefined
    ? mockHostTransport()
    : new SocketTransport(url, { role: 'host', nickname });
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
  // E3: persist the resume secret so a refresh/reconnect resumes the same slot.
  transport.onReconnectToken = (token) => localStorage.setItem(key, token);
  return transport;
}
