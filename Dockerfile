# Single-service image (7.3): one container serves the built web `dist` AND the
# WebSocket on one port/origin (the gateway's Node http server). This is the deploy
# unit for 7.4 — a PaaS builds and runs it, terminating TLS in front so the public
# URL is https/wss on the same host.
#
# Runtime: the server runs via `tsx` (the workspace has no per-package JS build step,
# and bundling NestJS + workspace-TS is fragile at this scale). D2 leaned toward a
# compiled `node dist`; tsx is the pragmatic fit here and the startup cost is
# negligible for an in-memory party server. Swappable later without changing the deploy.

# ---- build: install the workspace and build the web bundle ----
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
# apps/web/.env.production sets VITE_WS_URL=same-origin, so the bundle talks to its own origin.
RUN pnpm -C apps/web build

# ---- runtime: serve dist + the socket on $PORT ----
FROM node:22-slim AS runtime
RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production
# The whole built workspace (node_modules incl. tsx, src, and apps/web/dist).
COPY --from=build /app /app
ENV WEB_DIST=/app/apps/web/dist
ENV PORT=8080
EXPOSE 8080
CMD ["pnpm", "-C", "apps/server", "start"]
