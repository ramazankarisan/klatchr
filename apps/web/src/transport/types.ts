import type { PlayerId, Score, Viewer } from '@klatchr/core';

export type RoomPhase = 'LOBBY' | 'IN_GAME' | 'SCORES';

/** Public roster fact — names and spectator status are not secret. */
export interface PublicPlayer {
  id: PlayerId;
  nickname: string;
  spectator: boolean;
}

/**
 * What one connection receives: public room facts plus the already-redacted
 * game view for this viewer. The raw game state never crosses this boundary —
 * `gameView` is `view(gameState, viewer)`, computed in `packages/games`.
 */
export interface ViewFrame {
  code: string;
  phase: RoomPhase;
  viewer: Viewer;
  players: readonly PublicPlayer[];
  selectedGameId: string | null;
  gameView: unknown;
  scores: readonly Score[] | null;
}

/** A host control, a forwarded game event, or a player action — the outbound wire. */
export type Action =
  | { type: 'selectGame'; gameId: string }
  | { type: 'startGame' }
  | { type: 'endGame' }
  | { type: 'gameEvent'; event: unknown };

/** The seam the app is written against; a real WebSocket transport swaps in later. */
export interface Transport {
  subscribe(viewer: Viewer, onFrame: (frame: ViewFrame) => void): () => void;
  send(actor: Viewer, action: Action): void;
}
