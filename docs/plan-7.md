# plan-7 — Cycle 7: production readiness

Klatchr runs a full two-game round today, but only on `localhost` (`pnpm dev` =
`tsx` server + `vite` web), and only survives a clean network. Cycle 7 turns it
into something you can run in an actual room: a **host that survives a reload**,
**phones that reconnect themselves**, a **single deployable service**, and
**`wss://`** in production.

This cycle has two halves of different character. The **resilience** half
(7.1–7.2) is ordinary code — reducers, transports, tests — and stays inside the
green gate. The **deploy** half (7.3–7.4) is infrastructure: it is verified by an
actual deploy, not by `pnpm gate`, and it touches config, not the pure core.

## Topology (decided 2026-07-28): single service

One node process serves the built web `dist` **and** upgrades WebSocket
connections on the **same port / same origin**; the hosting platform terminates
TLS, so the public URL is `wss://<host>` on the same host as the page. One
deploy, no CORS, no cross-origin token questions. (Node's built-in `http` does
the static + upgrade split — no new runtime dependency, rule 8.)

## The reconnect gap this forces

5.3a/5.3d gave **players** a server-minted reconnect token and a disconnect
grace window: a dropped player keeps its slot for ~30s and resumes by re-sending
`join { reconnectToken }`. **The host has none of this.** A host is not a player,
gets no `joined`/token, and `roomSession.disconnect` closes the room *immediately*
on a host drop. A reloaded host today can only `open` a **new** room (new code)
— useless, the players are in the old one.

So "host reconnect grace" is not just a server timer: it needs a **host resume
path**, mirroring what 5.3a did for players. Grace without resume is pointless
for the host.

## Stages (each its own session + PR, green gate where applicable)

### 7.1 — host resume + grace (`protocol` + `server`; `core` likely untouched)

Give the host the same survivability players have.

- **protocol** — the host's open-ack becomes a first-class message carrying a
  secret: `opened { code, hostToken }` (parallel to players' `joined`), and a new
  inbound `resumeHost { code, hostToken }`. The `hostToken` never appears in a
  `frame` (same rule as the player token). Round-trip + reject tests.
- **server** — `RoomHub`/`RoomSession`:
  - mint a `hostToken` on `open`, send it in `opened`, hold it server-side
    (a `RoomSession` field — the host token is a connection concern, so keep it
    out of `core` if we can, exactly like the disconnect grace lived server-side
    in 5.3d);
  - on a host drop, **schedule a reap** instead of closing now (reuse
    `ServerDeps.schedule`, the 5.3d timer); the room lingers through the window;
  - `resumeHost { code, hostToken }` → find the room by code, verify the token,
    re-attach the host connection as its `{ role: 'host' }` viewer, cancel the
    reaper, push a fresh frame;
  - reap fire / a wrong-or-absent token after the window → close the room
    (host `leave`), same terminal path as today.
- **core** — expected **no change** (host token + grace live at the server
  boundary; `room.hostId` already exists). If it turns out core must hold the
  token, that's a small, tested addition — decide during implementation and say so.
- **tests** — server unit tests mirroring the player set: drop keeps the room
  through the window; `resumeHost` re-attaches; timeout closes; wrong token
  rejected. (Reuse `roomHub.testkit.ts`.)

### 7.2 — client auto-reconnect (`apps/web`)

Make both surfaces heal themselves; today `SocketTransport` opens once and only
listens for `open`/`message` — a `close` is silent and final.

- **`SocketTransport`** gains a reconnect loop: on `close`/`error`, reopen with
  capped exponential backoff and re-run its handshake — a player re-sends
  `join { …, reconnectToken }` (already stored in `localStorage`), a host re-sends
  the new `resumeHost { code, hostToken }` (persisted on `opened`). It surfaces a
  **connection status** (`connecting | live | reconnecting`) alongside frames.
- **UI (rule 9 — design-gated)** — a lightweight "Reconnecting…" banner/overlay
  on both the board and the phone while `reconnecting`, clearing on `live`. This
  is a real visual addition → a design-surface sketch + approval before code (a
  small state, but rule 9 still applies).
- **tests** — RTL over a fake socket (drive `close`, assert re-handshake + status
  transitions); extend the two-context E2E with a mid-round host reload **and** a
  player drop that self-heals (today's E2E reconnects by manual re-join — 7.2
  makes it automatic).

### 7.3 — single-service topology + Dockerfile (`apps/server`, `apps/web`, root)

- **Server serves the web build.** Add an `http.createServer` in front of the
  `ws` server: static-file responses for `dist` assets (SPA fallback to
  `index.html`), and hand off `Upgrade` requests to the existing
  `WebSocketServer` (`server.handleUpgrade`, or construct it with `{ server }`).
  The gateway stays thin; this is a small boundary addition. One port, one origin.
- **Prod build.** `apps/web` `build` → `dist`; a root `build` that builds web and
  the server, and the server locates `dist` at runtime (env or a resolved path).
- **Dockerfile (one image).** A multi-stage build: install the pnpm workspace,
  build web `dist` + the server, final stage runs the single service on `$PORT`.
  This is the deploy unit (7.4) — a container the PaaS builds and runs. Config,
  not a runtime dep (rule 8).
- **Same-origin URL (rule 6).** In a single-service deploy the client talks to its
  *own* origin, not a baked host. Proposal: `VITE_WS_URL` accepts a sentinel (e.g.
  `"same-origin"`); the factory expands it to `${wsScheme}://${location.host}` at
  runtime (`wss` under https). Dev/test leave it unset → mock; the prod build sets
  `VITE_WS_URL=same-origin`. The URL still *comes from* `VITE_WS_URL` — rule 6
  holds; we just don't hardcode a host.
- Smoke-verify: `docker build` + `docker run`, load the page, play a round over
  the same-origin socket.

### 7.4 — publish: always-on, public, free (infra; verified by a real run)

**Goal (2026-07-28): a public, always-on server for everyone — not on the user's
own machine, and no paid service.** The fit that satisfies all three:

> **A self-hosted PaaS (Coolify or Dokploy) running on a free-tier cloud VM.**

- **The machine — a free-tier cloud VM (recommend Oracle Cloud Always Free, Ampere
  ARM).** Genuinely free *forever* (not a 12-month trial), always-on, and it's a
  cloud box — not the user's laptop. A card is taken at signup for *identity
  verification only* and is never billed within always-free limits. Ampere ARM
  has enough RAM to run the PaaS panel + reverse proxy comfortably (GCP `e2-micro`
  is too small for a PaaS; fine only for the plain Caddy fallback).
- **The deploy layer — Coolify or Dokploy (free, open-source, self-hosted).**
  Installed on that VM, it gives git-push deploys of the 7.3 **Dockerfile**, a
  Traefik reverse proxy with **automatic Let's Encrypt TLS → public `wss://`**
  (WebSocket upgrades proxied natively), env vars (`VITE_WS_URL=same-origin`,
  `PORT`), and auto-restart. No hand-written systemd/Caddy, no CI deploy step —
  the PaaS redeploys on push.
- **Hostname — DECIDED: DuckDNS (free).** `klatchr.duckdns.org`, an A record →
  the VM's IP (free DuckDNS account). Needed so Let's Encrypt can issue the cert
  (certs are for names, not bare IPs). Swappable later for an owned `.com` +
  subdomains with no code change.
- **In-memory rooms** still drop on a redeploy/restart (rule 7) — acceptable:
  "available for everyone" means the *server* is always reachable, not that live
  rooms survive a restart.
- **Fallback if avoiding even a verify-card:** plain VM + **Caddy + systemd** (no
  panel — lighter, fits `e2-micro`), or Render free (sleeps, cold-start). Both
  documented as alternatives; the Docker image works on all.
- **Verify** — deploy via the PaaS, open the public `https://` URL on two real
  phones + a laptop, play a round, kill wifi on a phone and watch it reconnect,
  reload the host and watch the room survive.

## Open decisions (resolve before the stage that needs them)

- **D1 — publish method** (7.4): **DECIDED — self-hosted PaaS (Coolify or
  Dokploy) on a free-tier cloud VM (Oracle Always Free ARM recommended).**
  Public, always-on, free (verify-card only, never billed), not the user's
  machine. Coolify vs Dokploy is a small sub-choice at 7.4 (both fit). Plain
  VM + Caddy and Render-free are documented fallbacks.
- **D2 — prod server runtime** (7.3): inside the Docker image, **compile to
  `node dist`** (leaner, no dev runner in prod) rather than shipping `tsx`.
  Recommend the build; decide the exact bundler (tsc vs esbuild) when writing
  the Dockerfile.
- **D3 — host-token home** (7.1): server-side (recommend, keeps `core` pure) vs.
  a `core` `room.hostToken` (mirrors `room.tokens`). Decide when implementing.
- **D4 — new deps?** Aim for **none**: node `http` (built-in) for static+upgrade,
  native `WebSocket` for reconnect. If a static-file helper or a platform SDK is
  wanted, that's a rule-8 ask first.

## Out of scope

Cross-round session scoring (S6), the 50-player paged host lobby (both are the
proposed **Cycle 8**), any persistence/DB/auth (rule 7 — rooms stay in-memory,
so a full server restart still drops live rooms; that's acceptable for v1),
multi-region, autoscaling, observability/metrics.

## Definition of done (per stage)

- **7.1** — `pnpm gate` green; a host drop keeps the room through a grace window
  and `resumeHost` re-attaches; timeout closes; wrong token rejected; the
  `hostToken` never crosses a `frame`.
- **7.2** — `pnpm gate` + `pnpm e2e` green; a dropped socket (host or player)
  reconnects itself and resumes its slot with a visible "reconnecting" state; the
  banner ships against an approved design sketch.
- **7.3** — `pnpm build` produces one service that serves the web and the socket
  on one origin; a round plays over the same-origin (`ws`/`wss`) connection.
- **7.4** — the app is reachable at a public `https://`/`wss://` URL and survives
  a real phone dropping wifi and a host reload, verified on real devices.
