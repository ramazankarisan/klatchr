import { Box } from '@mui/material';
import type { ReactNode } from 'react';
import { tokens } from '../tokens.js';

/** The one "N of M" progress bar (UX-1 board, UX-2 phone): a markerDeep fill on kraft,
 * exposed as a `progressbar` with its count. `label` names it; `height` sizes it. */
export function ProgressBar({
  done,
  total,
  label,
  height,
}: {
  done: number;
  total: number;
  label: string;
  height: string | number;
}): ReactNode {
  const pct = total > 0 ? Math.min(100, (done / total) * 100) : 0;
  return (
    <Box
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      sx={{
        // Grows along a row (the board), keeps its own height in a column (the phone).
        flex: '1 1 auto',
        height,
        borderRadius: 999,
        backgroundColor: tokens.color.kraft2,
        overflow: 'hidden',
      }}
    >
      <Box sx={{ height: '100%', width: `${pct}%`, backgroundColor: tokens.color.markerDeep }} />
    </Box>
  );
}
