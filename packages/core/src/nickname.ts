import { type Result, err, ok } from './result.js';

export interface NormalisedNickname {
  display: string; // trimmed, inner whitespace collapsed, capped
}

const MAX_NICKNAME_LENGTH = 20;

/**
 * Normalise a raw nickname to its display form: trim, collapse inner
 * whitespace, cap at 20 chars. Nickname is display-only — identity is the
 * player's id (E3), so duplicate nicknames are allowed.
 */
export function normaliseNickname(raw: string): Result<NormalisedNickname, 'EMPTY_NICKNAME'> {
  const collapsed = raw.trim().replace(/\s+/g, ' ');
  if (collapsed.length === 0) {
    return err('EMPTY_NICKNAME');
  }
  return ok({ display: collapsed.slice(0, MAX_NICKNAME_LENGTH) });
}
