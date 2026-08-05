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
 * Pick this round's prompt: walk the set in order, one question per round (Cycle 12 —
 * "a set is the session"). The bank is the host's authored list, or the built-in bank when
 * there is no usable config. The room never starts a round past the set (see `promptCount` /
 * `Game.roundCount`), so there is no wrap and no repeat within a session; `builtin[0]` is the
 * always-safe fallback for a degenerate round (0 or out of range) the room never really passes.
 */
export function choosePrompt(
  config: unknown,
  deps: GameDeps,
  builtin: readonly [string, ...string[]],
): string {
  const bank = validPrompts(config) ?? builtin;
  return bank[deps.round - 1] ?? builtin[0];
}

/**
 * How many distinct questions a session will run: the authored set's length, or the built-in
 * bank's when there is no usable config. Feeds `Game.roundCount`, so the room ends the game
 * once the questions are spent instead of repeating.
 */
export function promptCount(config: unknown, builtin: readonly [string, ...string[]]): number {
  return validPrompts(config)?.length ?? builtin.length;
}
