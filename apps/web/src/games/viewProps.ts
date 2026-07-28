import type { PublicPlayer } from '../transport/types.js';

/**
 * Props a player view needs to act. Lives here (not in the registry) so a game's
 * view can import it without a cycle back through the registry that imports the
 * view. `view` is the already-redacted per-viewer data; `myAnswer` is the
 * client's own answer, kept locally to mark "your card" (the view never reveals
 * which card is yours).
 */
export interface PlayerViewProps {
  view: unknown;
  players: readonly PublicPlayer[];
  youId: string;
  myAnswer: string | null;
  onSubmit: (text: string) => void;
  onGuess: (cardId: string, author: string) => void;
}
