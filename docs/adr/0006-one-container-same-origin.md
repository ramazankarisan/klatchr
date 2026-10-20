# 0006 — One container, one origin

**Status:** accepted · origin: [plan-7](../plans/plan-7.md), runbook [docs/deploy.md](../deploy.md)

## Context

The service has to be always on, free to run, and simple enough to redeploy by hand. A
separate web host and WebSocket host would mean CORS, two certificates and a URL baked into
the bundle.

## Decision

- One Docker image serves the built web bundle and the WebSocket on one port.
- It runs on a free 1 GB VM behind Caddy, which terminates TLS (`https` / `wss`) and is the
  only thing on the public internet; the container's port is published only on the VM's loopback (`-p 127.0.0.1:8080:8080`).
- The web bundle is built with `VITE_WS_URL=same-origin`, so the browser connects to its own
  host. No host is hardcoded in `apps/web` (the gate checks it).

## Consequences

- Deploying is `git pull`, `docker build`, `docker run` on the VM. There is no push-to-deploy
  yet (see [docs/backlog.md](../backlog.md)).
- Per-address limits read the client from the last `X-Forwarded-For` hop (`TRUST_PROXY=1`),
  which is only safe because Caddy is the sole way in.
- One instance only, which matches [0003](0003-in-memory-rooms.md).
