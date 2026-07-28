import { mockHostTransport, mockPlayerTransport } from './mockRoom.js';
import { type SocketInit, SocketTransport } from './socket.js';
import type { Transport } from './types.js';

/**
 * Picks the transport: a real `SocketTransport` when `VITE_WS_URL` is set (the
 * browser, dev + prod — rule 6, never a hardcoded host), the in-browser
 * `MockEngine` otherwise (RTL tests run with no server). One transport per
 * surface, bound to its viewer.
 */
const wsUrl = (): string | undefined => import.meta.env.VITE_WS_URL;

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
