import { defineConfig } from '@playwright/test';

const WS_PORT = 8080;
const WEB_URL = 'http://localhost:5173';

// The whole-stack E2E (5.3d): a multi-context round against the *real* server.
// The web is served with VITE_WS_URL pointed at the ws server, so the browser
// uses SocketTransport (not the mock) — rule 6, the URL is injected here, never
// hardcoded in apps/web. Not run on pre-commit; it is the Cycle-5 verification.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: { baseURL: WEB_URL },
  webServer: [
    {
      command: 'pnpm -C apps/server start',
      port: WS_PORT, // ws answers a plain GET with 426, so wait on the TCP port, not a url
      env: { WS_PORT: String(WS_PORT) },
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 120_000,
    },
    {
      // `--mode e2e` loads apps/web/.env.e2e, which sets VITE_WS_URL so the
      // browser uses the real SocketTransport. Vite only exposes env from files,
      // not an inline var, and a dedicated mode keeps `pnpm dev`/vitest on the mock.
      command: 'pnpm -C apps/web dev --mode e2e',
      url: WEB_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
