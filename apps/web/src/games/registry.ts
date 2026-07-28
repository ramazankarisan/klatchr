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
 * React components that render it live here, keyed by game id. Each entry also
 * carries picker metadata (name/blurb/bounds — the host game picker reads it
 * without importing the games package) and a `hostStep` that maps the current
 * game view to the host's one control button, so the control bar drives any
 * game's phases. Adding a game's UI means adding a directory and a line here.
 */
interface GameMeta {
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
}

interface GameViews {
  meta: GameMeta;
  Host: (props: { view: unknown; players: readonly PublicPlayer[] }) => ReactNode;
  Player: (props: PlayerViewProps) => ReactNode;
  hostStep: (gameView: unknown) => HostStep;
}

const registry: Record<string, GameViews> = {
  'guess-who': {
    meta: {
      name: 'Guess Who Said It',
      description: 'Everyone answers a prompt, then guesses who said which.',
      minPlayers: 3,
      maxPlayers: 12,
    },
    Host: GuessWhoHost,
    Player: GuessWhoPlayer,
    hostStep: guessWhoStep,
  },
  'most-likely-to': {
    meta: {
      name: 'Most Likely To',
      description: 'Everyone votes for who fits the prompt, then the tally is revealed.',
      minPlayers: 3,
      maxPlayers: 12,
    },
    Host: MostLikelyToHost,
    Player: MostLikelyToPlayer,
    hostStep: mostLikelyToStep,
  },
};

export function viewsFor(gameId: string | null): GameViews | null {
  return gameId === null ? null : (registry[gameId] ?? null);
}

/** One row per game for the host picker: id + display metadata. */
export interface GameOption extends GameMeta {
  id: string;
}

export function gameCatalog(): GameOption[] {
  return Object.entries(registry).map(([id, game]) => ({ id, ...game.meta }));
}
