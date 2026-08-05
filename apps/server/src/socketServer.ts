import { type IncomingMessage, type Server, type ServerResponse, createServer } from 'node:http';
import type { ServerMessage } from '@klatchr/protocol';
import { type RawData, type WebSocket, WebSocketServer } from 'ws';
import type { Connection } from './connection.js';
import type { RoomHub } from './roomHub.js';
import { createStaticHandler } from './staticFiles.js';

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
 * `port: 0` yields an ephemeral port the caller can read back).
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
  const ws = new WebSocketServer({ server: http });
  ws.on('connection', (socket: WebSocket) => wire(hub, socket));
  return new Promise((resolve) => {
    http.listen(opts.port, () => {
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

function wire(hub: RoomHub, socket: WebSocket): void {
  const conn: Connection = {
    send: (message: ServerMessage) => socket.send(JSON.stringify(message)),
  };
  socket.on('message', (data: RawData) => hub.receive(conn, data.toString()));
  socket.on('close', () => hub.disconnect(conn));
}
