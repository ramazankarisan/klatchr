import { Box, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { tokens } from '../tokens.js';
import { ProgressBar } from './progressBar.js';

const count = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

/**
 * "N of M answered" on the phone after you act (UX-2), with a bar, in a polite live region
 * so a screen reader hears the room catch up. Counts only: the player views carry how many
 * have acted, never who, so this names nobody. Read defensively — the phase guard checks
 * only the discriminant, so an off-shape count renders nothing rather than "NaN of M".
 */
export function PhoneProgress({
  done,
  total,
  verb,
  next,
}: {
  done: unknown;
  total: unknown;
  verb: string;
  /** What to watch for next, e.g. "Look up at the big screen when the cards appear." */
  next: string;
}): ReactNode {
  const n = count(done);
  const m = count(total);
  if (n === null || m === null) {
    return null;
  }
  const label = `${n} of ${m} ${verb}`;
  return (
    <Box
      component="output"
      aria-live="polite"
      sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}
    >
      <Typography component="span" sx={{ fontSize: 20, fontWeight: 800 }}>
        {label}
      </Typography>
      <ProgressBar done={n} total={m} label={label} height={12} />
      <Typography component="span" sx={{ fontSize: 16, color: tokens.color.inkSoft }}>
        {next}
      </Typography>
    </Box>
  );
}
