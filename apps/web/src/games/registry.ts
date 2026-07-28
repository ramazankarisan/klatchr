import { games } from '@klatchr/games';
import type { ReactNode } from 'react';
import type { PublicPlayer } from '../transport/types.js';
import { HostView as GuessWhoHost } from './guessWho/HostView.js';
import { PlayerView as GuessWhoPlayer } from './guessWho/PlayerView.js';
import { guessWhoStep } from './guessWho/frames.js';
import { HostView as MostLikelyToHost } from './mostLikelyTo/HostView.js';
import { PlayerView as MostLikelyToPlayer } from './mostLikelyTo/PlayerView.js';
import { mostLikelyToStep } from './mostLikelyTo/frames.js';
import type { HostStep, PlayerViewProps } from './viewProps.js';

/**
 * The web-side game view registry (S4). `core`/`games` emit view *data*; the
 * React components that render it live here, keyed by game id, alongside a
 * `hostStep` that maps the current game view to the host's one control button
 * so the control bar drives any game's phases. Adding a game's UI means adding a
 * directory and a line here. Picker metadata (name/blurb/bounds) is *not*
 * duplicated — it comes from the game modules themselves (see `gameCatalog`).
 */
interface GameViews {
  Host: (props: { view: unknown; players: readonly PublicPlayer[] }) => ReactNode;
  Player: (props: PlayerViewProps) => ReactNode;
  hostStep: (gameView: unknown) => HostStep;
}

const registry: Record<string, GameViews> = {
  'guess-who': { Host: GuessWhoHost, Player: GuessWhoPlayer, hostStep: guessWhoStep },
  'most-likely-to': {
    Host: MostLikelyToHost,
    Player: MostLikelyToPlayer,
    hostStep: mostLikelyToStep,
  },
};

export function viewsFor(gameId: string | null): GameViews | null {
  return gameId === null ? null : (registry[gameId] ?? null);
}

/** One row per game for the host picker: id + display metadata, straight from
 * the game module (single source of truth — no drift with the server). Only
 * games the web can actually render are listed. */
export interface GameOption {
  id: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
}

export function gameCatalog(): GameOption[] {
  return games
    .filter((game) => registry[game.id] !== undefined)
    .map((game) => ({
      id: game.id,
      name: game.name,
      description: game.description,
      minPlayers: game.minPlayers,
      maxPlayers: game.maxPlayers,
    }));
}
