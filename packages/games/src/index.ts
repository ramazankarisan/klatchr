import { guessWho } from './guessWho/guessWho.js';

/**
 * The games the platform can offer. The server injects this list into the core
 * registry; core never imports this package (the dependency points the other
 * way). Adding a game means adding a directory here and listing it — no change
 * to core.
 */
export const games = [guessWho];

export const registeredGameIds: readonly string[] = games.map((game) => game.id);

export { guessWho } from './guessWho/guessWho.js';
export type { GWEvent } from './guessWho/events.js';
export type { AnswerCard, GWState, Phase } from './guessWho/state.js';
