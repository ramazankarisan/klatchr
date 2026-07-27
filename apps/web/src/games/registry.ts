import type { ReactNode } from 'react';
import type { PublicPlayer } from '../transport/types.js';
import { HostView } from './guessWho/HostView.js';
import { PlayerView } from './guessWho/PlayerView.js';

/**
 * The web-side game view registry (S4). `core`/`games` emit view *data*; the
 * React components that render it live here, keyed by game id. Adding a game's
 * UI means adding a directory and a line here — mirrors how `packages/games`
 * registers game logic.
 */
interface GameViews {
  Host: (props: { view: unknown; players: readonly PublicPlayer[] }) => ReactNode;
  Player: (props: { view: unknown; players: readonly PublicPlayer[]; youId: string }) => ReactNode;
}

const registry: Record<string, GameViews> = {
  'guess-who': { Host: HostView, Player: PlayerView },
};

export function viewsFor(gameId: string | null): GameViews | null {
  return gameId === null ? null : (registry[gameId] ?? null);
}
