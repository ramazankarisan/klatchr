import { type IncomingMessage, type Server, type ServerResponse, createServer } from 'node:http';
import type { ServerMessage } from '@klatchr/protocol';
import { type RawData, type WebSocket, WebSocketServer } from 'ws';
import type { Connection } from './connection.js';
import type { RoomHub } from './roomHub.js';
import { createStaticHandler } from './staticFiles.js';

/** The largest inbound frame accepted. A full authored question set (50 × 200 chars,
 * multi-byte text) fits with room to spare; ws's own default is 100 MiB. */
export const MAX_PAYLOAD_BYTES = 64 * 1024;

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
 * Resolves once the server is listening, with the actually-bound port (so
 * `port: 0` yields an ephemeral port the caller can read back). Rejects when the
 * listen fails (EADDRINUSE — a stale server on the port — or EACCES), so the
 * caller sees the cause instead of an unhandled 'error' crash or a hung await.
 */
export function startSocketServer(
  hub: RoomHub,
  opts: { port: number; distDir?: string },
): Promise<SocketServer> {
  const onRequest: (req: IncomingMessage, res: ServerResponse) => void =
    opts.distDir === undefined
      ? (_req, res) => {
          res.writeHead(404);
          res.end();
        }
      : createStaticHandler(opts.distDir);
  const http = createServer(onRequest);
  const ws = new WebSocketServer({ server: http, maxPayload: MAX_PAYLOAD_BYTES });
  ws.on('connection', (socket: WebSocket) => wire(hub, socket));
  return new Promise((resolve, reject) => {
    // ws re-emits the http server's errors on itself; only a listen-time one is ours.
    const onListenError = (error: Error): void => {
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

/**
 * One socket's wiring. Rooms live in this one process, so nothing a single client
 * does may throw out of a listener: an unhandled throw (or a socket 'error' with no
 * listener — ws emits one for an invalid UTF-8 frame, a bad opcode or an oversized
 * payload) would kill Node and every live room with it. A protocol error closes
 * only the offending socket; a handler bug is logged and that one message dropped.
 */
function wire(hub: RoomHub, socket: WebSocket): void {
  const conn: Connection = {
    send: (message: ServerMessage) => socket.send(JSON.stringify(message)),
  };
  socket.on('error', () => socket.terminate()); // close then follows → hub.disconnect
  socket.on('message', (data: RawData) =>
    guarded('receive', () => hub.receive(conn, data.toString())),
  );
  socket.on('close', () => guarded('disconnect', () => hub.disconnect(conn)));
}

function guarded(what: string, run: () => void): void {
  try {
    run();
  } catch (error) {
    console.error(`[klatchr] ${what} failed — message dropped, server kept up`, error);
  }
}
