/**
 * Shared guards and text cleaning for anything that crosses the wire as `unknown`
 * or as a free-form string. Used by core (nicknames), by games (event shapes,
 * answers) and by the server, so all three agree on what an object or a blank
 * string is. Pure; `Intl.Segmenter` is deterministic.
 */

/** A non-null object — the first step of every structural check (a predicate, never `as`). */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const graphemes = new Intl.Segmenter('en', { granularity: 'grapheme' });

// Code units allowed per visible character. One grapheme can stack any number of
// combining marks, so a grapheme cap alone bounds nothing in bytes; real text (even a
// family emoji, 11 units) stays well under this.
const UNITS_PER_CHAR = 12;

/**
 * Trim `raw` and cap it at `max` user-visible characters (grapheme clusters, so a
 * flag, a skin-toned or a ZWJ emoji is never split) and at `max × 12` code units.
 * Returns '' when nothing visible is left — whitespace and invisible format
 * characters alone (a zero-width space) count as blank, though they are kept inside
 * real text (a ZWJ joins 👩‍💻). Blankness is judged on the *capped* text, so visible
 * characters past the cap can't smuggle an invisible result through.
 */
export function boundedText(raw: string, max: number): string {
  let kept = '';
  let count = 0;
  for (const { segment } of graphemes.segment(raw.trim())) {
    if (count === max || kept.length + segment.length > max * UNITS_PER_CHAR) {
      break;
    }
    kept += segment;
    count += 1;
  }
  kept = kept.trimEnd();
  return kept.replace(/[\p{Cf}\s]/gu, '').length === 0 ? '' : kept;
}
