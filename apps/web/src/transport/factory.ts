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

const questionsKey = (code: string, gameId: string): string =>
  `klatchr:questions:${code}:${gameId}`;

/** The host's authored question list for a game in this room (Cycle 11), cached client-side
 * so the lobby editor rehydrates after a reload or a picker toggle — otherwise it would read
 * "built-in" while a set is stored, and a re-edit would replace the set instead of extending
 * it. Mirrors what was last sent as `configureGame`; the server stays the source of truth. */
export function storedQuestions(code: string, gameId: string): readonly string[] {
  const raw = localStorage.getItem(questionsKey(code, gameId));
  if (raw === null) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return Array.from<unknown>(parsed).filter((p): p is string => typeof p === 'string');
  } catch {
    return []; // corrupt cache — fall back to no authored set
  }
}

export function rememberQuestions(code: string, gameId: string, prompts: readonly string[]): void {
  localStorage.setItem(questionsKey(code, gameId), JSON.stringify(prompts));
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
  // Record the name only on a FRESH join — the server keeps that name and ignores
  // any name typed on a later resume, so overwriting it here would make the stored
  // nick drift to the last-typed one (B6). On a resume we keep the original.
  if (stored === null) {
    localStorage.setItem(nickKey(code), nickname);
  }
  const transport = new SocketTransport(url, init);
  // E3: persist the resume secret so a refresh resumes the same slot.
  transport.onReconnectToken = (token) => localStorage.setItem(key, token);
  return transport;
}
