/**
 * Typed readers for the game views the bot tool acts on. A frame carries
 * `gameView: unknown`, and the parse-at-the-boundary rule forbids casting an
 * incoming payload, so each field is checked rather than assumed. A renamed field reads as undefined.
 */

export interface HostGameView {
  phase: string;
  votedCount?: number | undefined;
  submittedCount?: number | undefined;
  guessed?: string[] | undefined;
  candidates?: string[] | undefined;
  total?: number | undefined;
}

export interface PlayerGameView {
  phase: string;
  candidates?: string[] | undefined;
  cards?: Array<{ id: string }> | undefined;
  youVoted?: boolean | undefined;
  youSubmitted?: boolean | undefined;
  yourCardId?: string | undefined;
  myGuesses?: Record<string, string> | undefined;
}

/** An object's own entries, every value typed `unknown` (never `any`). */
function entries(value: unknown): ReadonlyArray<readonly [string, unknown]> {
  return typeof value === 'object' && value !== null ? Object.entries(value) : [];
}
const prop = (value: unknown, key: string): unknown => entries(value).find(([k]) => k === key)?.[1];
const isList = (value: unknown): value is readonly unknown[] => Array.isArray(value);
const num = (v: unknown, k: string): number | undefined => {
  const field = prop(v, k);
  return typeof field === 'number' ? field : undefined;
};
const bool = (v: unknown, k: string): boolean | undefined => {
  const field = prop(v, k);
  return typeof field === 'boolean' ? field : undefined;
};
const str = (v: unknown, k: string): string | undefined => {
  const field = prop(v, k);
  return typeof field === 'string' ? field : undefined;
};
function strings(v: unknown, k: string): string[] | undefined {
  const field = prop(v, k);
  if (!isList(field)) {
    return undefined;
  }
  const items = field.filter((x): x is string => typeof x === 'string');
  return items.length === field.length ? items : undefined;
}

export function readHostView(view: unknown): HostGameView | null {
  const phase = str(view, 'phase');
  if (phase === undefined) {
    return null;
  }
  return {
    phase,
    votedCount: num(view, 'votedCount'),
    submittedCount: num(view, 'submittedCount'),
    guessed: strings(view, 'guessed'),
    candidates: strings(view, 'candidates'),
    total: num(view, 'total'),
  };
}

export function readPlayerView(view: unknown): PlayerGameView | null {
  const phase = str(view, 'phase');
  if (phase === undefined) {
    return null;
  }
  const rawCards = prop(view, 'cards');
  const cards = isList(rawCards)
    ? rawCards.flatMap((card: unknown) => {
        const id = str(card, 'id');
        return id === undefined ? [] : [{ id }];
      })
    : undefined;
  const myGuesses: Record<string, string> = {};
  for (const [cardId, author] of entries(prop(view, 'myGuesses'))) {
    if (typeof author === 'string') {
      myGuesses[cardId] = author;
    }
  }
  return {
    phase,
    candidates: strings(view, 'candidates'),
    cards,
    youVoted: bool(view, 'youVoted'),
    youSubmitted: bool(view, 'youSubmitted'),
    yourCardId: str(view, 'yourCardId'),
    myGuesses,
  };
}
