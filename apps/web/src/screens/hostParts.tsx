import { Box, Button } from '@mui/material';
import type { ReactNode } from 'react';
import { tokens } from '../tokens.js';

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** The round pill's words (S6, F4, UX-1): `Round N of M` while it plays and
 * `Round N of M · standings` on the standings screen — which End game can also reach
 * mid-round, so it never claims the round finished (`Round N` / `Round N · standings` when
 * unbounded) — and `All N questions played` once the set is spent (the game-over screen). */
function roundLabel(round: number, total: number, over: boolean, exhausted: boolean): string {
  if (exhausted) {
    return `All ${plural(round, 'question', 'questions')} played`;
  }
  const of = total > 0 ? `Round ${round} of ${total}` : `Round ${round}`;
  return over ? `${of} · standings` : of;
}

/** The round-counter pill for the board's top bar. */
export function RoundPill({
  round,
  total,
  over,
  exhausted,
}: { round: number; total: number; over: boolean; exhausted: boolean }): ReactNode {
  return (
    <Box
      component="span"
      sx={{
        fontSize: 'clamp(15px, 1.4vw, 24px)',
        fontWeight: 800,
        color: tokens.color.ink,
        backgroundColor: tokens.color.card,
        boxShadow: '1px 3px 6px rgba(43,38,32,.14)',
        borderRadius: 999,
        px: 'clamp(14px, 1.4vw, 24px)',
        py: 'clamp(4px, 0.6vw, 10px)',
        whiteSpace: 'nowrap',
      }}
    >
      {roundLabel(round, total, over, exhausted)}
    </Box>
  );
}

/** "Leave & close room…" (F6) as a quiet corner control (UX-1) — out of the primary row,
 * so nobody hits it reaching for the next step. Still guarded by its confirm dialog (F7). */
export function LeaveControl({ onLeave }: { onLeave: () => void }): ReactNode {
  return (
    <Button
      variant="outlined"
      color="inherit"
      onClick={onLeave}
      sx={{
        minHeight: 44,
        fontSize: 'clamp(14px, 1.1vw, 18px)',
        fontWeight: 600,
        color: tokens.color.inkSoft,
        borderColor: tokens.color.inkFaint,
        whiteSpace: 'nowrap',
      }}
    >
      Leave &amp; close room…
    </Button>
  );
}

/** Where players go to join — this host's own origin (the VITE_WS_URL rule: never a
 * baked host). */
export function joinHost(): string {
  return typeof window === 'undefined' ? '' : window.location.host;
}
