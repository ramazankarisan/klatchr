import type { Score } from '@klatchr/core';
import { Box, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { nameOf } from '../players.js';
import { playerColor, tokens } from '../tokens.js';
import type { PublicPlayer } from '../transport/types.js';

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
  const ranked = scores
    .filter((s) => players.some((p) => p.id === s.playerId))
    .sort((a, b) => b.points - a.points);
  return (
    <Box>
      <Typography
        variant="overline"
        sx={{ color: tokens.color.markerDeep, display: 'block', mb: 1 }}
      >
        {title}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {ranked.map((s, i) => {
          const lead = i === 0 && s.points > 0;
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
                {i + 1}
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
