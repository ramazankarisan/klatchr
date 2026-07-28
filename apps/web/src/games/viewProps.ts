import type { PublicPlayer } from '../transport/types.js';

/**
 * Props a player view needs to act. Lives here (not in the registry) so a game's
 * view can import it without a cycle back through the registry that imports the
 * view. `view` is the already-redacted per-viewer data (which, for guess, tells
 * a player its own card id — self-authorship, safe — so no client-kept answer).
 */
export interface PlayerViewProps {
  view: unknown;
  players: readonly PublicPlayer[];
  youId: string;
  onSubmit: (text: string) => void;
  onGuess: (cardId: string, author: string) => void;
}
