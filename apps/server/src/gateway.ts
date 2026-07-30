import { type IncomingMessage, type Server, type ServerResponse, createServer } from 'node:http';
import type { ServerMessage } from '@klatchr/protocol';
import {
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { type RawData, type WebSocket, WebSocketServer } from 'ws';
import type { Connection } from './connection.js';
import { RoomHub } from './roomHub.js';
import { createStaticHandler } from './staticFiles.js';

const DEFAULT_PORT = 8080;

/**
 * The single-service boundary (7.3). One Node `http` server on one port both
 * serves the built web `dist` (when `WEB_DIST` is set — production) and, sharing
 * the same server, upgrades WebSocket connections to the transport-agnostic
 * `RoomHub`. Same port, same origin: one deploy, no CORS, `wss` where the page is
 * `https`. In dev/e2e `WEB_DIST` is unset — Vite serves the page and this answers
 * only the socket, so a plain GET is a bare 404.
 *
 * Everything that matters — protocol parsing, host authority, per-viewer redaction
 * — lives in the hub and the pure core, so this stays a thin adapter. We speak
 * native WebSocket (`new WebSocket(url)` on the web), so the transport is `ws`.
 */
@Injectable()
export class SocketGateway implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly hub = new RoomHub();
  private http: Server | undefined;
  private ws: WebSocketServer | undefined;

  onApplicationBootstrap(): void {
    // PaaS injects PORT; e2e sets WS_PORT; otherwise the default.
    const port = Number(process.env.PORT ?? process.env.WS_PORT ?? DEFAULT_PORT);
    const distDir = process.env.WEB_DIST;
    const onRequest: (req: IncomingMessage, res: ServerResponse) => void =
      distDir === undefined
        ? (_req, res) => {
            res.writeHead(404);
            res.end();
          }
        : createStaticHandler(distDir);
    const http = createServer(onRequest);
    const ws = new WebSocketServer({ server: http });
    ws.on('connection', (socket: WebSocket) => this.wire(socket));
    http.listen(port);
    this.http = http;
    this.ws = ws;
  }

  onApplicationShutdown(): void {
    this.ws?.close();
    this.http?.close();
  }

  private wire(socket: WebSocket): void {
    const conn: Connection = {
      send: (message: ServerMessage) => socket.send(JSON.stringify(message)),
    };
    socket.on('message', (data: RawData) => this.hub.receive(conn, data.toString()));
    socket.on('close', () => this.hub.disconnect(conn));
  }
}
