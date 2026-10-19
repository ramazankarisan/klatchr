/* The socket transport's injectable seams and its timing, kept apart from the class. */

/** The slice of the browser `WebSocket` we use — injectable so tests fake it. */
export interface SocketLike {
  send(data: string): void;
  close(): void;
  addEventListener(
    type: 'open' | 'message' | 'close' | 'error',
    listener: (event: { data: unknown }) => void,
  ): void;
}

export type SocketFactory = (url: string) => SocketLike;

/** How this connection identifies itself to the server. */
export type SocketInit =
  // `resume` (from a persisted host session) makes the very first handshake a
  // `resumeHost` instead of `open` — so a reloaded host re-attaches its own room
  // rather than opening a new one (8.1).
  | { role: 'host'; nickname: string; resume?: { code: string; hostToken: string } }
  | { role: 'player'; code: string; nickname: string; reconnectToken?: string };

/** Deferred callback used for the reconnect backoff — injectable so tests drive it. */
export interface ReconnectClock {
  schedule(callback: () => void, ms: number): () => void;
}

export const defaultFactory: SocketFactory = (url) => new WebSocket(url);
export const defaultClock: ReconnectClock = {
  schedule: (callback, ms) => {
    const handle = setTimeout(callback, ms);
    return () => clearTimeout(handle);
  },
};

// Capped exponential backoff between reconnect attempts: 0.5s, 1s, 2s … up to 8s.
export const BASE_BACKOFF_MS = 500;
export const MAX_BACKOFF_MS = 8_000;
// Keepalive cadence (F3): ping this often while connected so a quiet lobby's socket
// isn't reaped by an idle intermediary. Its own timer, not the reconnect clock.
export const KEEPALIVE_MS = 15_000;
// The server answers every ping, so a live socket hears something every KEEPALIVE_MS.
// Silence this long means it only looks open (a woken phone) — reconnect within grace.
export const LIVENESS_MS = 40_000;
// A new socket that has not opened by now is stuck (common during a network change).
export const CONNECT_TIMEOUT_MS = 8_000;
// After the tab comes back into view, a socket must answer a ping this fast.
export const PROBE_MS = 4_000;
