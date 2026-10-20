# Architecture decision records

Short records of the decisions that shape Klatchr: the context, what was decided, and
what it costs. They were written after the fact (2026-10-20) from the plans in
[docs/plans/](../plans/), which hold the full reasoning. A new decision of the same weight
gets a new numbered file; a reversed one is marked superseded, not deleted.

| ADR | Decision |
| --- | --- |
| [0001](0001-view-is-the-redaction-boundary.md) | `view(state, viewer)` is the only thing a client ever receives |
| [0002](0002-pure-reducers-games-by-injection.md) | Rooms and games are pure reducers; games reach core by injection |
| [0003](0003-in-memory-rooms.md) | Rooms live in server memory: no database, no accounts |
| [0004](0004-zod-at-both-ends.md) | Every wire message is a zod schema parsed at both ends |
| [0005](0005-tokens-and-grace-windows.md) | Reconnect by secret token within a grace window |
| [0006](0006-one-container-same-origin.md) | One container serves the web and the WebSocket on one origin |
| [0007](0007-enforced-wall-for-agents.md) | AI-agent work is held to an enforced gate, not to guidelines |
