# apps/web

React + TypeScript + MUI. The platform shell plus one host view and one player
view per game. Design system: @../../design.md

- **Design before code.** For any UI addition or change, publish a design
  sketch for the user first, and write component code only once it is approved.
  Keep `design.md` current; design against its tokens and two surfaces
  (shared host screen, phone).
- Parse every inbound server message with `packages/protocol` before rendering
  it; never `as`-cast a payload.
- **VITE_WS_URL.** The server URL comes from `VITE_WS_URL`. Never hardcode a
  host or port.
- Tests use React Testing Library and query by role and label — never by test
  id or class name.
- `pnpm dev` without `VITE_WS_URL` runs on the in-browser mock transport.
