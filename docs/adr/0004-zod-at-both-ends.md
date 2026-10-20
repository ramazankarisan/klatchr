# 0004 — Every wire message is parsed at both ends

**Status:** accepted · origin: [plan-5](../plans/plan-5.md), hardened in [plan-15](../plans/plan-15.md)

## Context

The server faces anonymous phones on the open internet, and the web faces whatever the
server (or a proxy, or an old deploy) sends. TypeScript types vanish at runtime, so a type
on an incoming payload is a promise nobody checked.

## Decision

`packages/protocol` holds a zod schema for every client↔server message, with bounds (string
lengths, room-code shape). Both ends parse with it. Casting an incoming payload with `as` is
banned, and the gate's boundary-cast check rejects it. A missing shape is added to protocol
first.

## Consequences

- A malformed or hostile message is a typed error reply, not a crash; the server also caps
  payload size and rate before parsing.
- Protocol depends on zod only, so server and web share it without sharing anything else.
- Game events stay opaque at the protocol layer; each game validates its own events, with
  hostile-event tests.
