import { type IncomingMessage, type Server, type ServerResponse, createServer } from 'node:http';
import type { ServerMessage } from '@klatchr/protocol';
import { type RawData, WebSocket, WebSocketServer } from 'ws';
import type { Connection } from './connection.js';
import type { RoomHub } from './roomHub.js';
import { createStaticHandler } from './staticFiles.js';

/** The largest inbound frame accepted. A full authored question set (50 × 200 chars,
 * multi-byte text) fits with room to spare; ws's own default is 100 MiB. */
export const MAX_PAYLOAD_BYTES = 64 * 1024;

/** Close codes a client can act on (4000–4999 is the application range). */
export const CLOSE = {
  superseded: 4001, // another device/tab took this seat — do not reconnect
  handshakeTimeout: 4002, // connected but never opened or joined a room
  rateLimited: 1008, // policy violation: sustained flooding
  tooManyConnections: 1013, // try again later: this address holds too many sockets
} as const;

/** Tunables, all with production defaults; tests shrink the timings. */
export interface SocketOptions {
  port: number;
  distDir?: string;
  /** How often to ping every socket; one that missed the previous ping is dropped. */
  heartbeatMs?: number;
  /** How long a fresh socket may stay without opening or joining a room. */
  handshakeMs?: number;
  /** Concurrent sockets allowed per client address. */
  maxConnsPerIp?: number;
  /** Behind a reverse proxy (Caddy) every socket comes from the proxy's address, so the
   * client address must come from X-Forwarded-For — trusted only when this is set. */
  trustProxy?: boolean;
  /** Token bucket per socket: sustained messages per second, and the burst allowed. */
  rate?: { perSecond: number; burst: number };
}

const DEFAULTS = {
  heartbeatMs: 20_000,
  handshakeMs: 10_000,
  // High on purpose: a whole office or venue on one Wi-Fi shares one public address, and
  // a room seats 50. This stops one script, not one crowd.
  maxConnsPerIp: 200,
  rate: { perSecond: 20, burst: 40 },
};
// Messages dropped for rate before the socket is closed as abusive.
const MAX_DROPPED = 200;

export interface SocketServer {
  http: Server;
  ws: WebSocketServer;
  port: number;
  close(): Promise<void>;
}

/**
 * The http + WebSocket wiring, extracted from the Nest gateway (7.3) so it can be
 * started directly in a test with an injected hub (controllable deps + an
 * ephemeral port). One Node `http` server both serves the built web `dist` (when
 * `distDir` is set — production) and, sharing the same server, upgrades sockets to
 * the transport-agnostic `RoomHub`. `distDir` unset ⇒ a plain GET is a bare 404
 * (dev/e2e: Vite serves the page, this answers only the socket).
 *
 * It also keeps a public server healthy: a heartbeat drops sockets that went dead
 * without a close (a laptop lid, a phone losing signal) so they enter the normal
 * grace/reap path; a handshake deadline drops sockets that never join; and per-address
 * and per-socket limits stop one client from exhausting the process.
 *
 * Resolves once the server is listening, with the actually-bound port (so
 * `port: 0` yields an ephemeral port the caller can read back). Rejects when the
 * listen fails (EADDRINUSE — a stale server on the port — or EACCES), so the
 * caller sees the cause instead of an unhandled 'error' crash or a hung await.
 */
export function startSocketServer(hub: RoomHub, opts: SocketOptions): Promise<SocketServer> {
  const settings = { ...DEFAULTS, ...opts, rate: opts.rate ?? DEFAULTS.rate };
  const onRequest: (req: IncomingMessage, res: ServerResponse) => void =
    opts.distDir === undefined
      ? (_req, res) => {
          res.writeHead(404);
          res.end();
        }
      : createStaticHandler(opts.distDir);
  const http = createServer(onRequest);
  const ws = new WebSocketServer({ server: http, maxPayload: MAX_PAYLOAD_BYTES });
  const perIp = new Map<string, number>();
  const alive = new WeakMap<WebSocket, boolean>();

  ws.on('connection', (socket: WebSocket, req: IncomingMessage) => {
    const ip = clientAddress(req, settings.trustProxy === true);
    const count = (perIp.get(ip) ?? 0) + 1;
    if (count > settings.maxConnsPerIp) {
      // Listen for errors even on a refused socket: one with no 'error' listener that
      // receives a bad frame before the close completes would crash the process.
      socket.on('error', () => socket.terminate());
      socket.close(CLOSE.tooManyConnections, 'too many connections');
      return;
    }
    perIp.set(ip, count);
    socket.once('close', () => {
      const left = (perIp.get(ip) ?? 1) - 1;
      if (left <= 0) {
        perIp.delete(ip);
      } else {
        perIp.set(ip, left);
      }
    });
    alive.set(socket, true);
    socket.on('pong', () => alive.set(socket, true));
    wire(hub, socket, settings, ip);
  });

  // One sweep for every socket: a socket that has not answered the previous ping is
  // dead in all but name — terminate it, which fires 'close' and so hub.disconnect.
  const heartbeat = setInterval(() => {
    for (const socket of ws.clients) {
      if (alive.get(socket) === false) {
        socket.terminate();
        continue;
      }
      alive.set(socket, false);
      socket.ping();
    }
  }, settings.heartbeatMs);

  return new Promise((resolve, reject) => {
    // ws re-emits the http server's errors on itself; only a listen-time one is ours.
    const onListenError = (error: Error): void => {
      clearInterval(heartbeat);
      http.close();
      reject(error);
    };
    ws.once('error', onListenError);
    http.listen(opts.port, () => {
      ws.off('error', onListenError);
      const address = http.address();
      const port = typeof address === 'object' && address !== null ? address.port : opts.port;
      resolve({
        http,
        ws,
        port,
        close: () =>
          new Promise<void>((done) => {
            clearInterval(heartbeat);
            // Terminate any still-open sockets first — `http.close` waits for live
            // connections to end, which would hang a test that left clients open.
            for (const socket of ws.clients) {
              socket.terminate();
            }
            ws.close(() => http.close(() => done()));
          }),
      });
    });
  });
}

/** The client's address: behind a trusted proxy, the *last* X-Forwarded-For hop — the
 * one our proxy appended; earlier hops are whatever the client claimed. Otherwise the
 * socket's own peer. Never trust the header without a proxy — anyone can send it. */
function clientAddress(req: IncomingMessage, trustProxy: boolean): string {
  const forwarded = req.headers['x-forwarded-for'];
  const header = Array.isArray(forwarded) ? forwarded.at(-1) : forwarded;
  const last = header?.split(',').at(-1)?.trim();
  if (trustProxy && last !== undefined && last !== '') {
    return last;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

/**
 * One socket's wiring. Rooms live in this one process, so nothing a single client
 * does may throw out of a listener: an unhandled throw (or a socket 'error' with no
 * listener — ws emits one for an invalid UTF-8 frame, a bad opcode or an oversized
 * payload) would kill Node and every live room with it. A protocol error closes
 * only the offending socket; a handler bug is logged and that one message dropped.
 */
function wire(
  hub: RoomHub,
  socket: WebSocket,
  settings: { handshakeMs: number; rate: { perSecond: number; burst: number } },
  address: string,
): void {
  const conn: Connection = {
    address,
    send: (message: ServerMessage) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
      }
    },
    close: () => socket.close(CLOSE.superseded, 'superseded'),
  };
  const deadline = setTimeout(() => {
    if (!hub.isBound(conn)) {
      socket.close(CLOSE.handshakeTimeout, 'no room joined');
    }
  }, settings.handshakeMs);
  const bucket = tokenBucket(settings.rate.perSecond, settings.rate.burst);
  let dropped = 0;

  socket.on('error', () => socket.terminate()); // close then follows → hub.disconnect
  socket.on('message', (data: RawData) => {
    if (!bucket.take()) {
      // One notice per flood; a flood that never lets up is closed. Any accepted
      // message ends the flood, so a normal session's occasional bursts never add up.
      dropped += 1;
      if (dropped === 1) {
        conn.send({ type: 'error', code: '', message: 'RATE_LIMITED' });
      }
      if (dropped >= MAX_DROPPED) {
        socket.close(CLOSE.rateLimited, 'rate limited');
      }
      return;
    }
    dropped = 0;
    guarded('receive', () => hub.receive(conn, data.toString()));
  });
  socket.on('close', () => {
    clearTimeout(deadline);
    guarded('disconnect', () => hub.disconnect(conn));
  });
}

/** A token bucket on the wall clock: `burst` messages at once, refilled at `perSecond`. */
function tokenBucket(perSecond: number, burst: number): { take(): boolean } {
  let tokens = burst;
  let last = Date.now();
  return {
    take() {
      const now = Date.now();
      tokens = Math.min(burst, tokens + ((now - last) / 1000) * perSecond);
      last = now;
      if (tokens < 1) {
        return false;
      }
      tokens -= 1;
      return true;
    },
  };
}

function guarded(what: string, run: () => void): void {
  try {
    run();
  } catch (error) {
    console.error(`[klatchr] ${what} failed — message dropped, server kept up`, error);
  }
}
