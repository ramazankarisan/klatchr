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

/**
 * Trim `raw` and cap it at `max` user-visible characters (grapheme clusters, so a
 * flag, a skin-toned or a ZWJ emoji is never split). Returns '' when nothing
 * visible is left — whitespace and invisible format characters alone (a zero-width
 * space) count as blank, though they are kept inside real text (a ZWJ joins 👩‍💻).
 */
export function boundedText(raw: string, max: number): string {
  const trimmed = raw.trim();
  if (trimmed.replace(/[\p{Cf}\s]/gu, '').length === 0) {
    return '';
  }
  const kept = Array.from(graphemes.segment(trimmed), (part) => part.segment).slice(0, max);
  return kept.join('').trimEnd();
}
