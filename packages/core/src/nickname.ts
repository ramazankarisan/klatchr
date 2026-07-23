import { type Result, err, ok } from './result.js';

export interface NormalisedNickname {
  display: string; // trimmed, inner whitespace collapsed, capped
  key: string; // case-folded identity key
}

const MAX_NICKNAME_LENGTH = 20;

/**
 * Normalise a raw nickname. Trim, collapse inner whitespace, cap at 20 chars.
 * The case-folded `key` is the identity a rejoin matches on.
 */
export function normaliseNickname(raw: string): Result<NormalisedNickname, 'EMPTY_NICKNAME'> {
  const collapsed = raw.trim().replace(/\s+/g, ' ');
  if (collapsed.length === 0) {
    return err('EMPTY_NICKNAME');
  }
  const display = collapsed.slice(0, MAX_NICKNAME_LENGTH);
  return ok({ display, key: display.toLowerCase() });
}
