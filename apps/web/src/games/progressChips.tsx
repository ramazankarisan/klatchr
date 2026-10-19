import { Box, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { tvType } from '../components/board.js';
import { nameOf } from '../players.js';
import { tokens } from '../tokens.js';
import type { PublicPlayer } from '../transport/types.js';

/**
 * "Who has acted" on the shared board (MLT vote progress, Guess Who answer/guess progress):
 * `N of M <verb>`, one progress bar, and a name chip per seated player — done with a teal
 * ✓, still going as a dashed "thinking…" chip. It shows only *who* has acted, never *what*
 * (the host view is the strictest redaction — no answer, guess or vote target is here).
 */

function Check(): ReactNode {
  return (
    <svg
      aria-hidden="true"
      width="0.9em"
      height="0.9em"
      viewBox="0 0 24 24"
      style={{ flex: '0 0 auto' }}
      fill="none"
      stroke={tokens.color.tealDeep}
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/** A board-scale name chip (UX-1): a lifted card chip, or a dashed outline for someone the
 * room is still waiting on. Shared by the progress chips and the lobby roster. */
export function BoardChip({
  dashed = false,
  dim = false,
  children,
}: { dashed?: boolean; dim?: boolean; children: ReactNode }): ReactNode {
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1,
        fontFamily: tokens.font.display,
        fontWeight: 800,
        fontSize: tvType.chip,
        borderRadius: `${tokens.radius.control}px`,
        px: 'clamp(12px, 1.2vw, 20px)',
        py: 'clamp(6px, 0.7vw, 12px)',
        opacity: dim ? 0.6 : 1,
        ...(dashed
          ? { border: `2px dashed ${tokens.color.inkFaint}`, color: tokens.color.inkSoft }
          : {
              backgroundColor: tokens.color.card,
              boxShadow: '1px 3px 6px rgba(43,38,32,.14)',
              border: '2px solid transparent',
            }),
      }}
    >
      {children}
    </Box>
  );
}

function ActedChip({ name, done }: { name: string; done: boolean }): ReactNode {
  return (
    <BoardChip dashed={!done}>
      {done ? <Check /> : null}
      <span>{name}</span>
      {done ? null : (
        <Box
          component="span"
          sx={{ fontFamily: tokens.font.body, fontWeight: 400, fontSize: '0.72em' }}
        >
          thinking…
        </Box>
      )}
    </BoardChip>
  );
}

/** Count, bar and chips all derive from the same two lists, so they can never disagree. */
export function ActedProgress({
  ids,
  done,
  verb,
  players,
}: {
  /** Everyone expected to act — the seated players, in roster order. */
  ids: readonly string[];
  /** Who already has (from the host view). */
  done: readonly string[];
  verb: string;
  players: readonly PublicPlayer[];
}): ReactNode {
  const count = ids.filter((id) => done.includes(id)).length;
  const total = ids.length;
  const label = `${count} of ${total} ${verb}`;
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <Box
      component="section"
      aria-label="Who has acted"
      sx={{ display: 'flex', flexDirection: 'column', gap: 'clamp(12px, 1.2vw, 20px)', mt: 3 }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 'clamp(12px, 1.6vw, 24px)' }}>
        <Typography
          sx={{ fontWeight: 800, fontSize: 'clamp(20px, 2vw, 34px)', whiteSpace: 'nowrap' }}
        >
          {label}
        </Typography>
        <Box
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={count}
          sx={{
            flex: 1,
            height: 'clamp(12px, 1vw, 18px)',
            borderRadius: 999,
            backgroundColor: tokens.color.kraft2,
            overflow: 'hidden',
          }}
        >
          <Box
            sx={{ height: '100%', width: `${pct}%`, backgroundColor: tokens.color.markerDeep }}
          />
        </Box>
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 'clamp(8px, 0.9vw, 14px)' }}>
        {ids.map((id) => (
          <ActedChip key={id} name={nameOf(id, players)} done={done.includes(id)} />
        ))}
      </Box>
    </Box>
  );
}
