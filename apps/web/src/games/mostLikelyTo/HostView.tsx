import { Box, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { nameOf } from '../../players.js';
import { tokens } from '../../tokens.js';
import type { PublicPlayer } from '../../transport/types.js';
import { ActedProgress } from '../progressChips.js';
import {
  HostKicker,
  PlayerDot,
  Prompt,
  TallyBars,
  actedIds,
  gameHostView,
  seatedIds,
} from '../viewKit.js';
import { type ResultsView, type VoteHostView, asHostView } from './frames.js';

function VoteBoard({
  v,
  players,
}: { v: VoteHostView; players: readonly PublicPlayer[] }): ReactNode {
  return (
    <Box>
      <HostKicker>Everyone’s voting</HostKicker>
      <Prompt text={v.prompt} />
      <ActedProgress
        ids={seatedIds(players)}
        done={actedIds(v.voted)}
        verb="voted"
        players={players}
      />
    </Box>
  );
}

function WinnerSpotlight({
  id,
  points,
  players,
}: { id: string; points: number; players: readonly PublicPlayer[] }): ReactNode {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.75,
        backgroundColor: tokens.color.card,
        border: '1px solid #e8dcc6',
        borderRadius: `${tokens.radius.card}px`,
        p: '14px 16px',
        flex: '1 1 240px',
      }}
    >
      <Box
        component="span"
        sx={{
          fontFamily: tokens.font.display,
          fontWeight: 900,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: tokens.color.markerDeep,
          border: `3px solid ${tokens.color.markerDeep}`,
          borderRadius: 1,
          px: 1.25,
          py: 0.5,
          fontSize: 'clamp(14px, 1.2vw, 20px)',
          transform: 'rotate(-6deg)',
        }}
      >
        Most likely
      </Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.25,
          fontFamily: tokens.font.display,
          fontWeight: 900,
          fontSize: 'clamp(30px, 3vw, 52px)',
        }}
      >
        <PlayerDot id={id} players={players} size={18} />
        {nameOf(id, players)}
      </Box>
      <Typography
        sx={{
          ml: 'auto',
          fontFamily: tokens.font.mono,
          fontWeight: 700,
          color: tokens.color.markerDeep,
          fontSize: 'clamp(16px, 1.4vw, 24px)',
        }}
      >
        {points} {points === 1 ? 'vote' : 'votes'}
      </Typography>
    </Box>
  );
}

function ResultsBoard({
  v,
  players,
}: { v: ResultsView; players: readonly PublicPlayer[] }): ReactNode {
  // F5: a tie has co-winners — spotlight everyone at the top count, not just the
  // first in roster order.
  const max = Math.max(0, ...v.tally.map((t) => t.points));
  const winners = max > 0 ? v.tally.filter((t) => t.points === max) : [];
  return (
    <Box>
      <HostKicker>{v.prompt}</HostKicker>
      {winners.length > 0 ? (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 2.5 }}>
          {winners.map((w) => (
            <WinnerSpotlight key={w.playerId} id={w.playerId} points={w.points} players={players} />
          ))}
        </Box>
      ) : null}
      <Box sx={{ maxWidth: 620 }}>
        <TallyBars rows={v.tally} players={players} height={26} />
      </Box>
    </Box>
  );
}

export const HostView = gameHostView(asHostView, (v, players) =>
  v.phase === 'vote' ? (
    <VoteBoard v={v} players={players} />
  ) : (
    <ResultsBoard v={v} players={players} />
  ),
);
