import type { PlayerId } from '@klatchr/core';

export type Phase = 'collect' | 'guess' | 'reveal';

/** One submitted answer, decoupled from its author by an opaque id. */
export interface AnswerCard {
  id: string; // opaque, never equal to authorId — safe to expose
  text: string;
  authorId: PlayerId;
}

export interface GWState {
  phase: Phase;
  prompt: string;
  roster: readonly PlayerId[]; // the active seats init was handed (E2)
  drafts: Readonly<Record<PlayerId, string>>; // collect-phase submissions
  cards: readonly AnswerCard[]; // built at collect -> guess
  guesses: Readonly<Record<PlayerId, Readonly<Record<string, PlayerId>>>>; // guesser -> (cardId -> author)
}
