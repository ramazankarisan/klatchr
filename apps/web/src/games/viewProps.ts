import type { PublicPlayer } from '../transport/types.js';

/**
 * Props a player view needs to act. Lives here (not in the registry) so a game's
 * view can import it without a cycle back through the registry that imports the
 * view. `view` is the already-redacted per-viewer data. `onEvent` sends the
 * game's own event — the shape is the game's business, so the seam is a single
 * opaque callback rather than per-game methods (the transport wraps it in a
 * `play` regardless).
 */
export interface PlayerViewProps {
  view: unknown;
  players: readonly PublicPlayer[];
  youId: string;
  onEvent: (event: unknown) => void;
}

/**
 * The host's one control button for a game, resolved from the current (redacted)
 * host game view: the label plus the advance event to send, or `advance: null`
 * at a terminal phase (the host screen then offers a new round). Lets the host
 * control bar drive any game's phases without hard-coding one game's steps.
 */
export interface HostStep {
  label: string;
  advance: unknown | null;
}
