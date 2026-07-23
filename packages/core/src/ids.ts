export type PlayerId = string;

export interface Player {
  id: PlayerId;
  nickname: string; // display form
  joinedDuringGame: boolean; // true if they joined while a round was IN_GAME
}

/** Who a redaction (or an inbound action) is for. The host is the shared screen. */
export type Viewer = { role: 'player'; id: PlayerId } | { role: 'host' };
