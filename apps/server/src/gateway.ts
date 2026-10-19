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
    // Behind Caddy every socket arrives from the proxy, so per-client limits read the
    // client address from X-Forwarded-For — only when the deployment says it is proxied.
    const trustProxy = process.env.TRUST_PROXY === '1';
    // A bot soak (pnpm bots) opens many sockets from one address; it raises the cap.
    const maxConnsPerIp = Number(process.env.MAX_CONNS_PER_IP) || undefined;
    const limits = maxConnsPerIp === undefined ? { trustProxy } : { trustProxy, maxConnsPerIp };
    this.server = await startSocketServer(
      this.hub,
      distDir === undefined ? { port, ...limits } : { port, distDir, ...limits },
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.server?.close();
  }
}
