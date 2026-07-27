import type { ServerMessage } from '@klatchr/protocol';
import {
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { type RawData, type WebSocket, WebSocketServer } from 'ws';
import type { Connection } from './connection.js';
import { RoomHub } from './roomHub.js';

const DEFAULT_PORT = 8080;

/**
 * The WebSocket boundary. Owns the raw `ws` server, wraps each socket as a
 * `Connection`, and hands every inbound frame to the transport-agnostic
 * `RoomHub`. Everything that matters — protocol parsing, host authority, and
 * per-viewer redaction — lives in the hub and the pure core, so this stays a
 * thin adapter with nothing to unit-test beyond wiring.
 *
 * We speak native WebSocket (the web connects with `new WebSocket(VITE_WS_URL)`),
 * so the transport is `ws`, not socket.io.
 */
@Injectable()
export class SocketGateway implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly hub = new RoomHub();
  private server: WebSocketServer | undefined;

  onApplicationBootstrap(): void {
    const port = Number(process.env.WS_PORT ?? DEFAULT_PORT);
    const server = new WebSocketServer({ port });
    server.on('connection', (socket: WebSocket) => this.wire(socket));
    this.server = server;
  }

  onApplicationShutdown(): void {
    this.server?.close();
  }

  private wire(socket: WebSocket): void {
    const conn: Connection = {
      send: (message: ServerMessage) => socket.send(JSON.stringify(message)),
    };
    socket.on('message', (data: RawData) => this.hub.receive(conn, data.toString()));
    socket.on('close', () => this.hub.disconnect(conn));
  }
}
