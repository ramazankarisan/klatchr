import type { Score } from '@klatchr/core';
import { Box, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { nameOf } from '../players.js';
import { playerColor, tokens } from '../tokens.js';
import type { PublicPlayer } from '../transport/types.js';

/**
 * The one ranking rule for every standings view, board and phone alike: competition ranking
 * over rows already sorted best-first (equal points share a rank — 1, 1, 3), and every row at
 * the top total leads, so a tie highlights all its leaders (and nobody leads on 0).
 */
function ranked<T>(
  rows: readonly T[],
  points: (row: T) => number,
): { row: T; rank: number; lead: boolean }[] {
  const top = Math.max(0, ...rows.map(points));
  return rows.map((row) => ({
    row,
    rank: 1 + rows.filter((other) => points(other) > points(row)).length,
    lead: top > 0 && points(row) === top,
  }));
}

/**
 * Cumulative session standings (S6): a ranked list of `sessionScores`, the leader
 * in marker. Non-secret (past revealed rounds only), so it shows on the board's
 * round result and its final game-over screen. Names use font.display bold (8.2).
 */
export function SessionStandings({
  scores,
  players,
  title = 'Standings so far',
}: {
  scores: readonly Score[];
  players: readonly PublicPlayer[];
  title?: string;
}): ReactNode {
  // Only rank players still in the room (B6): a left player's tally is pruned
  // server-side, but guard the render too so a ghost id never shows as a "(left)" row.
  const rows = ranked(
    scores
      .filter((s) => players.some((p) => p.id === s.playerId))
      .sort((a, b) => b.points - a.points),
    (s) => s.points,
  );
  return (
    <Box>
      <Typography
        variant="overline"
        sx={{ color: tokens.color.markerDeep, display: 'block', mb: 1 }}
      >
        {title}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {rows.map(({ row: s, rank, lead }) => {
          return (
            <Box
              key={s.playerId}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                p: '8px 12px',
                borderRadius: `${tokens.radius.card}px`,
                backgroundColor: tokens.color.card,
                border: `1px solid ${lead ? tokens.color.marker : '#eaddc6'}`,
                boxShadow: lead
                  ? `0 0 0 1px ${tokens.color.marker}, 1px 3px 6px rgba(43,38,32,.14)`
                  : '1px 3px 6px rgba(43,38,32,.14)',
              }}
            >
              <Typography
                sx={{
                  fontFamily: tokens.font.mono,
                  fontWeight: 700,
                  color: tokens.color.inkSoft,
                  width: 22,
                  textAlign: 'right',
                }}
              >
                {rank}
              </Typography>
              <Box
                component="span"
                sx={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  flex: '0 0 auto',
                  backgroundColor: playerColor(s.playerId, players),
                }}
              />
              <Typography sx={{ fontFamily: tokens.font.display, fontWeight: 800 }}>
                {nameOf(s.playerId, players)}
              </Typography>
              <Typography
                sx={{
                  ml: 'auto',
                  fontFamily: tokens.font.mono,
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {s.points}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

interface StandingRow {
  playerId: string;
  round: number;
  total: number;
}

/** One row per player still in the room: this round's points and the running total, ranked
 * by total (then this round). A left player's tally never shows (B6). */
function standingRows(
  round: readonly Score[] | null,
  session: readonly Score[],
  players: readonly PublicPlayer[],
): StandingRow[] {
  const pointsOf = (scores: readonly Score[] | null, id: string): number =>
    scores?.find((s) => s.playerId === id)?.points ?? 0;
  const ids = new Set([...session, ...(round ?? [])].map((s) => s.playerId));
  return players
    .filter((p) => ids.has(p.id))
    .map((p) => ({ playerId: p.id, round: pointsOf(round, p.id), total: pointsOf(session, p.id) }))
    .sort((a, b) => b.total - a.total || b.round - a.round);
}

const cellPad = { py: 'clamp(8px, 0.9vw, 16px)', px: 'clamp(12px, 1.6vw, 32px)' } as const;
const head = {
  ...cellPad,
  fontFamily: tokens.font.mono,
  fontWeight: 400,
  fontSize: 'clamp(13px, 1.1vw, 20px)',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: tokens.color.inkSoft,
  borderBottom: `2px dashed ${tokens.color.kraft2}`,
} as const;
const num = { ...cellPad, textAlign: 'right', fontVariantNumeric: 'tabular-nums' } as const;

/**
 * The board's one ranked standings table at the end of a round (UX-1): rank, player,
 * "This round" (+N, or — for nothing) and "Total", the leader row highlighted. Replaces
 * the round tally + cumulative list that used to stack. Public by nature — it shows only
 * on the SCORES screen, after the round's reveal, so mid-round scores never spoil it.
 */
export function RoundStandings({
  round,
  session,
  players,
  title,
}: {
  round: readonly Score[] | null;
  session: readonly Score[];
  players: readonly PublicPlayer[];
  title: string;
}): ReactNode {
  const rows = ranked(standingRows(round, session, players), (r) => r.total);
  if (rows.length === 0) {
    return null;
  }
  return (
    <Box>
      <Typography
        variant="h2"
        component="h2"
        sx={{ fontSize: 'clamp(32px, 3.4vw, 56px)', mb: 'clamp(12px, 1.4vw, 24px)' }}
      >
        {title}
      </Typography>
      <Box
        component="table"
        aria-label={title}
        sx={{
          width: '100%',
          borderCollapse: 'collapse',
          backgroundColor: tokens.color.card,
          borderRadius: `${tokens.radius.card}px`,
          overflow: 'hidden',
          boxShadow: '1px 3px 6px rgba(43,38,32,.14)',
          fontSize: 'clamp(18px, 2vw, 34px)',
        }}
      >
        <thead>
          <tr>
            <Box component="th" scope="col" sx={{ ...head, textAlign: 'left', width: '1%' }}>
              #
            </Box>
            <Box component="th" scope="col" sx={{ ...head, textAlign: 'left' }}>
              Player
            </Box>
            <Box component="th" scope="col" sx={{ ...head, textAlign: 'right' }}>
              This round
            </Box>
            <Box component="th" scope="col" sx={{ ...head, textAlign: 'right' }}>
              Total
            </Box>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ row: r, rank, lead }) => (
            <Box
              component="tr"
              key={r.playerId}
              aria-current={lead ? 'true' : undefined}
              sx={{
                borderBottom: `1px solid ${tokens.color.kraft2}`,
                backgroundColor: lead ? '#F6E2D4' : 'transparent',
              }}
            >
              <Box component="td" sx={{ ...cellPad, fontWeight: 800, color: tokens.color.inkSoft }}>
                {rank}
              </Box>
              <Box
                component="td"
                sx={{ ...cellPad, fontFamily: tokens.font.display, fontWeight: 800 }}
              >
                <Box
                  component="span"
                  sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.25 }}
                >
                  <Box
                    component="span"
                    aria-hidden
                    sx={{
                      width: '0.55em',
                      height: '0.55em',
                      borderRadius: '50%',
                      flex: '0 0 auto',
                      backgroundColor: playerColor(r.playerId, players),
                    }}
                  />
                  {nameOf(r.playerId, players)}
                </Box>
              </Box>
              <Box component="td" sx={{ ...num, fontWeight: 800, color: tokens.color.tealDeep }}>
                {r.round > 0 ? `+${r.round}` : '—'}
              </Box>
              <Box component="td" sx={{ ...num, fontWeight: 900, fontSize: '1.15em' }}>
                {r.total}
              </Box>
            </Box>
          ))}
        </tbody>
      </Box>
    </Box>
  );
}
