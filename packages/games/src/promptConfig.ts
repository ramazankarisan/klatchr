import type { GameDeps } from '@klatchr/core';

/** A themed set of prompts a host can pour into their working list (Cycle 11). Pure data. */
export interface PromptPack {
  id: string;
  name: string;
  prompts: readonly string[];
}

export const MAX_PROMPTS = 50; // a sane ceiling on an authored set
export const MAX_LEN = 200; // one question's character cap

/**
 * Read a host-authored prompt list out of an opaque config blob. Defensive on purpose:
 * the config crossed the wire as `unknown`, so validate structurally (no `as`). Trims,
 * drops blanks, de-dupes case-insensitively, and caps length and count. Returns the
 * cleaned list, or `null` when nothing usable is left — the caller then falls back to its
 * built-in bank, so a game never starts without a prompt.
 */
export function validPrompts(config: unknown): readonly string[] | null {
  if (typeof config !== 'object' || config === null || !('prompts' in config)) {
    return null;
  }
  const raw = config.prompts;
  if (!Array.isArray(raw)) {
    return null;
  }
  const seen = new Set<string>();
  const cleaned: string[] = [];
  // Array.isArray narrows to any[]; take each element as unknown so nothing is `any`.
  for (const item of Array.from<unknown>(raw)) {
    if (typeof item !== 'string') {
      continue;
    }
    const text = item.trim().slice(0, MAX_LEN);
    const key = text.toLowerCase();
    if (text.length === 0 || seen.has(key)) {
      continue;
    }
    seen.add(key);
    cleaned.push(text);
    if (cleaned.length >= MAX_PROMPTS) {
      break;
    }
  }
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Pick this round's prompt. A host-authored set is walked in order with no repeat until
 * it is exhausted (indexed by the 1-based round), then it wraps. With no authored set it
 * draws from the built-in bank at random — exactly the pre-Cycle-11 behaviour. `builtin`
 * is a non-empty tuple, so `builtin[0]` is the always-safe fallback (a degenerate round 0
 * — which the room never passes in a real game — falls to it).
 */
export function choosePrompt(
  config: unknown,
  deps: GameDeps,
  builtin: readonly [string, ...string[]],
): string {
  const authored = validPrompts(config);
  if (authored !== null) {
    return authored[(deps.round - 1) % authored.length] ?? builtin[0];
  }
  return builtin[Math.floor(deps.random() * builtin.length)] ?? builtin[0];
}
