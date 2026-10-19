import { type Result, err, ok } from './result.js';
import { boundedText } from './text.js';

export interface NormalisedNickname {
  display: string; // trimmed, inner whitespace collapsed, capped
}

const MAX_NICKNAME_LENGTH = 20;

/**
 * Normalise a raw nickname to its display form: collapse inner whitespace, trim,
 * cap at 20 visible characters (graphemes — an emoji is never split). A name of
 * only whitespace or invisible characters is empty. Nickname is display-only —
 * identity is the player's id (E3), so duplicate nicknames are allowed.
 */
export function normaliseNickname(raw: string): Result<NormalisedNickname, 'EMPTY_NICKNAME'> {
  const display = boundedText(raw.replace(/\s+/g, ' '), MAX_NICKNAME_LENGTH);
  if (display.length === 0) {
    return err('EMPTY_NICKNAME');
  }
  return ok({ display });
}
