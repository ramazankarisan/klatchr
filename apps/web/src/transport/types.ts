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

/**
 * The seam the app is written against. Single-viewer: a transport is bound to
 * one connection (the host board, or one player's phone) at creation. A real
 * socket only ever *is* one viewer, and a player's id isn't known until the
 * server assigns it, so the viewer isn't a per-call argument — the transport
 * owns it and stamps it onto each `frame.viewer`. `MockEngine` (dev/test) and
 * `SocketTransport` (browser) both implement this.
 */
export interface Transport {
  /** Register for frames; the current frame arrives on subscribe. Returns an unsubscribe. */
  subscribe(onFrame: (frame: ViewFrame) => void): () => void;
  send(action: Action): void;
}
