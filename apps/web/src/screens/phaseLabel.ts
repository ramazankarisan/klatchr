import { phaseOf } from '../games/phaseGuard.js';
import { viewsFor } from '../games/registry.js';
import type { ViewFrame } from '../transport/types.js';

/** The running game's phase in words: its registry `phaseNames`, keyed by the view's
 * `phase` (read once, by the shared guard — host and player views share the discriminant). */
function gamePhaseName(frame: ViewFrame): string {
  const phase = phaseOf(frame.gameView);
  const name = phase === null ? undefined : viewsFor(frame.selectedGameId)?.phaseNames[phase];
  return name ?? 'Playing';
}

/** What a surface's live region says when the phase changes (UX-2): "Now: " plus the lobby,
 * the running game's own phase name, or the standings. */
export function phaseAnnouncement(frame: ViewFrame): string {
  const name =
    frame.phase === 'LOBBY'
      ? 'In the lobby'
      : frame.phase === 'SCORES'
        ? 'Standings'
        : gamePhaseName(frame);
  return `Now: ${name}`;
}
