import { Box, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { nameOf } from '../../players.js';
import { tokens } from '../../tokens.js';
import type { PublicPlayer } from '../../transport/types.js';
import { HostKicker, PlayerDot, Prompt, TallyBars, gameHostView } from '../viewKit.js';
import { type ResultsView, type VoteHostView, asHostView } from './frames.js';

function VoteBoard({
  v,
  players,
}: { v: VoteHostView; players: readonly PublicPlayer[] }): ReactNode {
  const active = players.filter((p) => !p.spectator);
  const pct = v.total > 0 ? (v.votedCount / v.total) * 100 : 0;
  return (
    <Box>
      <HostKicker>Everyone’s voting</HostKicker>
      <Prompt text={v.prompt} />
      <Box
        sx={{
          mt: 3,
          height: 16,
          borderRadius: 999,
          backgroundColor: tokens.color.kraft2,
          overflow: 'hidden',
        }}
      >
        <Box sx={{ height: '100%', width: `${pct}%`, backgroundColor: tokens.color.marker }} />
      </Box>
      <Typography
        sx={{
          mt: 1.5,
          fontFamily: tokens.font.mono,
          fontWeight: 700,
          color: tokens.color.markerDeep,
        }}
      >
        {v.votedCount} of {v.total} voted
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 2 }}>
        {active.map((p) => {
          const done = v.voted.includes(p.id);
          return (
            <Box
              key={p.id}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                fontSize: 13,
                fontWeight: done ? 600 : 400,
                color: done ? tokens.color.ink : tokens.color.inkSoft,
                backgroundColor: tokens.color.card,
                border: '1px solid #eaddc6',
                borderRadius: 999,
                px: 1.25,
                py: 0.5,
                opacity: done ? 1 : 0.6,
              }}
            >
              <PlayerDot id={p.id} players={players} size={10} />
              {nameOf(p.id, players)}
              {done ? (
                <Box component="span" sx={{ color: tokens.color.teal, fontWeight: 800 }}>
                  ✓
                </Box>
              ) : null}
            </Box>
          );
        })}
      </Box>
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
        mb: 2.5,
      }}
    >
      <Box
        component="span"
        sx={{
          fontFamily: tokens.font.display,
          fontWeight: 900,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: tokens.color.marker,
          border: `3px solid ${tokens.color.marker}`,
          borderRadius: 1,
          px: 1.25,
          py: 0.5,
          fontSize: 13,
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
          fontSize: 30,
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
  const top = [...v.tally].sort((a, b) => b.points - a.points)[0];
  const winner = top !== undefined && top.points > 0 ? top : undefined;
  return (
    <Box>
      <HostKicker>{v.prompt}</HostKicker>
      {winner !== undefined ? (
        <WinnerSpotlight id={winner.playerId} points={winner.points} players={players} />
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
