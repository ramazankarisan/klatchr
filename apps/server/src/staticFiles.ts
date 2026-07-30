import { realpathSync } from 'node:fs';
import { readFile, realpath } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';

/**
 * A tiny static-file handler for the built web `dist` (7.3, single-service): the
 * server serves the SPA and upgrades WebSockets on the *same* port/origin. Node's
 * built-in `http` does the split (no new runtime dependency, rule 8) — this is the
 * request side; the gateway hands `Upgrade` requests to the `WebSocketServer`.
 *
 * SPA routing: a path with a file extension maps to a real asset (404 if missing);
 * an extensionless path (a client route) falls back to `index.html`. Requests are
 * confined to the dist root — a `..` traversal out of it is refused.
 */
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};

export function createStaticHandler(
  distDir: string,
): (req: IncomingMessage, res: ServerResponse) => void {
  // Canonicalise the root once (resolve any symlinks in its own path, e.g. macOS
  // /tmp → /private/tmp) so the per-request real-path containment check compares
  // like with like. Fall back to a plain normalise if the dir isn't there yet.
  let root: string;
  try {
    root = realpathSync(normalize(distDir));
  } catch {
    root = normalize(distDir);
  }
  const index = join(root, 'index.html');
  return (req, res) => {
    void serve(root, index, req, res);
  };
}

async function serve(
  root: string,
  index: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  let urlPath: string;
  try {
    urlPath = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }
  const target = normalize(join(root, urlPath));
  // First guard (cheap, no fs): a normalised path that escapes the root is a `..`
  // traversal attempt — refuse before touching disk.
  if (target !== root && !target.startsWith(root + sep)) {
    res.writeHead(403);
    res.end();
    return;
  }
  // Extension → concrete asset; no extension → an SPA route served the index shell.
  const file = extname(target) === '' ? index : target;
  // Second guard: resolve symlinks and re-check containment, so a link *inside*
  // dist can't point out of it (a missing file throws here → 404).
  let real: string;
  try {
    real = await realpath(file);
  } catch {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  if (real !== root && !real.startsWith(root + sep)) {
    res.writeHead(403);
    res.end();
    return;
  }
  const body = await readFile(real);
  res.writeHead(200, { 'content-type': MIME[extname(real)] ?? 'application/octet-stream' });
  res.end(body);
}
