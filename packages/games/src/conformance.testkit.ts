import fc from 'fast-check';

/** Shared fuel for the per-game conformance runs (plan-13 L1). Test-side only. */

/**
 * Host-config storms: undefined (no config), a usable authored set, and the
 * garbage shapes an untrusted blob can take — games must fall back, not crash.
 */
export const arbPromptConfig: fc.Arbitrary<unknown> = fc.oneof(
  fc.constant(undefined),
  fc.record({ prompts: fc.array(fc.string({ maxLength: 20 }), { maxLength: 5 }) }),
  fc.constant({ prompts: 'not-an-array' }),
  fc.constant(42),
  fc.constant(null),
);

/** The next roster member after `current` — a deterministic "different target"
 * for hidden-swap variants. Falls back to `current` only off-roster (harmless:
 * the variant is then a no-op world, never a false alarm). */
export function nextIn(roster: readonly string[], current: string): string {
  return roster[(roster.indexOf(current) + 1) % roster.length] ?? current;
}
