# e2e (Playwright)

- E2E is verification, not a red-green driver: unit tests drive the work,
  the browser suite confirms the whole stack at the end. It is not in
  `pnpm gate`; CI runs it on every PR. Run `pnpm e2e` locally whenever you touch
  the socket handshake, a game flow or the host/player wiring.
- One test plays a real multi-player round with several browser contexts.
- **Kill stale servers on :8080 and :5173 first.** Outside CI Playwright reuses
  a running server, so a stale one tests old code — and a stale `pnpm dev` on
  :5173 serves the mock transport, failing every real-socket test. It looks
  like a regression but is not.
