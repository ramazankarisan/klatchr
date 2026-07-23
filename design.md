# design.md — Klatchr design system

Source of truth for the look and feel of `apps/web`. Per CLAUDE.md rule 9,
**every UI change is sketched and approved before it is built.** This file is
updated alongside the sketch, and component code is written against it.

## Workflow

1. Sketch the screen/component on a Claude design surface (design tool of the
   day — confirmed with the user before first use).
2. Publish it for the user to review and control. Wait for approval.
3. Only then implement in React + MUI, matching the approved sketch and the
   tokens below.
4. Update this file if the design introduced or changed a token/pattern.

## Two surfaces

Klatchr is Jackbox-shaped: one shared screen plus phones.

- **Host screen** — laptop/TV, shared, viewed from across a room. Large type,
  high contrast, glanceable. Shows the room code, roster, prompts, tallies,
  scores. Never shows any player's hidden data (redaction; see the `Viewer`
  `{ role: 'host' }` boundary).
- **Player phone** — compact, portrait, touch. One primary action per phase
  (type an answer, pick a guess). Thumb-reachable controls.

## Tokens (to be filled at Cycle 4, with the first approved sketch)

| Token | Value | Notes |
|---|---|---|
| color.* | TBD | brand, surface, text, accent, per-player colors |
| type.* | TBD | display (host), body (phone), mono (room code) |
| space.* | TBD | 4/8-based scale |
| radius.* | TBD | |
| elevation.* | TBD | |

MUI is the component library (fixed stack). Tokens map to an MUI theme.

## Screens (Cycle 4)

- Host: **lobby** (room code + joining players), **in-game** per phase,
  **scores**.
- Player: **join** (code + nickname), **in-game** per phase, **scores**.

Each gets a sketch → approval → build. Redaction is verified in the game view,
not left to the UI.
