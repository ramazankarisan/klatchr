/**
 * Shared phase-discriminant narrowing for the per-game view frames. The engine
 * returns `unknown` across the transport; each game keeps its own view unions
 * but narrows them the same way — by the `phase` string.
 */
function phaseOf(view: unknown): string | null {
  if (typeof view === 'object' && view !== null && 'phase' in view) {
    const { phase } = view as { phase: unknown };
    return typeof phase === 'string' ? phase : null;
  }
  return null;
}

function inPhase(view: unknown, phases: ReadonlySet<string>): boolean {
  const phase = phaseOf(view);
  return phase !== null && phases.has(phase);
}

/** A narrowing guard for one of a game's view unions, keyed by its phase set. */
export function phaseNarrower<T>(phases: ReadonlySet<string>): (view: unknown) => T | null {
  return (view) => (inPhase(view, phases) ? (view as T) : null);
}
