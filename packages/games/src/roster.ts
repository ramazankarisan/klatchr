/**
 * Forfeit bookkeeping shared by every game: a seated player who leaves mid-round is
 * recorded in `left` once. Leaving is final for that id — the room mints a fresh id
 * for anyone who joins again, and a token resume emits no roster event.
 */
export function departed<S extends { roster: readonly string[]; left: readonly string[] }>(
  state: S,
  id: string,
): S {
  return state.roster.includes(id) && !state.left.includes(id)
    ? { ...state, left: [...state.left, id] }
    : state;
}
