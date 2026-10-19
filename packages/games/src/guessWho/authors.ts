import type { PlayerId } from '@klatchr/core';
import type { GWState } from './state.js';

/** Who can be named as an author: the seated roster, minus anyone who left without
 * leaving a card (they wrote nothing, so naming them is always wrong). */
export function authors(state: GWState): readonly PlayerId[] {
  const wrote = new Set(state.cards.map((card) => card.authorId));
  return state.roster.filter((id) => !state.left.includes(id) || wrote.has(id));
}
