import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createStaticHandler } from './staticFiles.js';

/** A minimal ServerResponse double that records status, headers and body. */
function fakeRes() {
  const res = {
    status: 0,
    headers: {} as Record<string, string>,
    body: '',
    writeHead(code: number, headers?: Record<string, string>) {
      this.status = code;
      if (headers) this.headers = headers;
      return this;
    },
    end(chunk?: unknown) {
      if (chunk !== undefined) {
        this.body = chunk instanceof Buffer ? chunk.toString() : String(chunk);
      }
    },
  };
  return res;
}

const req = (url: string): IncomingMessage => ({ url }) as IncomingMessage;

/** Drive the handler and await its async file read (it fires and forgets internally). */
async function hit(handler: ReturnType<typeof createStaticHandler>, url: string) {
  const res = fakeRes();
  handler(req(url), res as unknown as ServerResponse);
  await new Promise((r) => setTimeout(r, 10));
  return res;
}

describe('createStaticHandler', () => {
  let dir: string;
  let handler: ReturnType<typeof createStaticHandler>;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'klatchr-dist-'));
    await writeFile(join(dir, 'index.html'), '<!doctype html><title>Klatchr</title>');
    await writeFile(join(dir, 'app.js'), 'console.log(1)');
    await writeFile(join(dir, 'secret.txt'), 'TOPSECRET');
    handler = createStaticHandler(dir);
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('serves a real asset with its content-type', async () => {
    const res = await hit(handler, '/app.js');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/javascript; charset=utf-8');
    expect(res.body).toBe('console.log(1)');
  });

  it('serves index.html at the root', async () => {
    const res = await hit(handler, '/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(res.body).toContain('Klatchr');
  });

  it('falls back to index.html for an SPA route (no extension)', async () => {
    const res = await hit(handler, '/join/WXYZ');
    expect(res.status).toBe(200);
    expect(res.body).toContain('Klatchr'); // the shell, so client routing takes over
  });

  it('404s a missing asset (has an extension)', async () => {
    const res = await hit(handler, '/nope.js');
    expect(res.status).toBe(404);
  });

  it('refuses a path-traversal escape from the dist root', async () => {
    const res = await hit(handler, '/../secret.txt');
    // Normalised away from the root → refused, never reads the file above dist.
    expect(res.status).toBe(403);
    expect(res.body).not.toContain('TOPSECRET');
  });

  it('400s a malformed percent-encoded url', async () => {
    const res = await hit(handler, '/%ZZ');
    expect(res.status).toBe(400);
  });
});
