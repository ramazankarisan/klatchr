import type { PlayerId } from '@klatchr/core';

export type Phase = 'vote' | 'results';

export interface MLTState {
  phase: Phase;
  prompt: string;
  roster: readonly PlayerId[]; // the active seats init was handed (E2) — candidates and voters
  votes: Readonly<Record<PlayerId, PlayerId>>; // voter -> target, secret until results
}
