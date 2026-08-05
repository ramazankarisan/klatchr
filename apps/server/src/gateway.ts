import {
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { RoomHub } from './roomHub.js';
import { type SocketServer, startSocketServer } from './socketServer.js';

const DEFAULT_PORT = 8080;

/**
 * The single-service boundary (7.3). A thin Nest wrapper over `startSocketServer`
 * (apps/server/src/socketServer.ts) — same port, same origin: one Node server both
 * serves the built web `dist` (when `WEB_DIST` is set — production) and upgrades
 * WebSocket connections to the transport-agnostic `RoomHub`. `wss` where the page
 * is `https`; in dev/e2e `WEB_DIST` is unset so a plain GET is a bare 404.
 *
 * All protocol parsing, host authority and per-viewer redaction live in the hub and
 * the pure core; this only owns the process lifecycle, so it stays a thin adapter.
 */
@Injectable()
export class SocketGateway implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly hub = new RoomHub();
  private server: SocketServer | undefined;

  async onApplicationBootstrap(): Promise<void> {
    // PaaS injects PORT; e2e sets WS_PORT; otherwise the default.
    const port = Number(process.env.PORT ?? process.env.WS_PORT ?? DEFAULT_PORT);
    const distDir = process.env.WEB_DIST;
    this.server = await startSocketServer(
      this.hub,
      distDir === undefined ? { port } : { port, distDir },
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.server?.close();
  }
}
