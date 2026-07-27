import { Box, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { nameOf } from '../../players.js';
import { playerColor, tokens } from '../../tokens.js';
import type { PublicPlayer } from '../../transport/types.js';
import { type GuessPlayerView, type RevealView, asPlayerView } from './frames.js';

function Kicker({ children }: { children: ReactNode }): ReactNode {
  return (
    <Typography variant="overline" sx={{ color: tokens.color.markerDeep, fontSize: 11 }}>
      {children}
    </Typography>
  );
}

function AuthorChip({ id, players }: { id: string; players: readonly PublicPlayer[] }): ReactNode {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        fontWeight: 700,
        fontSize: 13,
      }}
    >
      <Box
        component="span"
        sx={{
          width: 12,
          height: 12,
          borderRadius: '50%',
          backgroundColor: playerColor(id, players),
        }}
      />
      {nameOf(id, players)}
    </Box>
  );
}

function CollectPhone({
  prompt,
  youSubmitted,
}: { prompt: string; youSubmitted: boolean }): ReactNode {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, flex: 1 }}>
      <Kicker>Your answer · secret</Kicker>
      <Typography variant="h3" sx={{ fontSize: 23, lineHeight: 1.08 }}>
        {prompt}
      </Typography>
      <Typography sx={{ color: tokens.color.inkSoft, fontSize: 14 }}>
        Nobody sees who wrote it — until the reveal.
      </Typography>
      <Box
        sx={{
          mt: 1,
          minHeight: 88,
          borderRadius: `${tokens.radius.card}px`,
          border: `1.5px solid ${youSubmitted ? tokens.color.teal : '#e4d8c2'}`,
          backgroundColor: '#fff',
          p: 1.5,
          color: youSubmitted ? tokens.color.teal : tokens.color.inkSoft,
          fontWeight: 600,
        }}
      >
        {youSubmitted ? '✓ Answer taped up' : 'Write your answer…'}
      </Box>
    </Box>
  );
}

function GuessPhone({
  v,
  players,
}: { v: GuessPlayerView; players: readonly PublicPlayer[] }): ReactNode {
  const named = Object.keys(v.myGuesses).length;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, flex: 1 }}>
      <Kicker>
        Name the authors ·{' '}
        <Box component="span" sx={{ fontFamily: tokens.font.mono, color: tokens.color.markerDeep }}>
          {named} of {Math.max(0, v.cards.length - 1)}
        </Box>
      </Kicker>
      {v.cards.map((card) => {
        const author = v.myGuesses[card.id];
        return (
          <Box
            key={card.id}
            sx={{
              backgroundColor: tokens.color.card,
              border: '1px solid #e8dcc6',
              borderRadius: `${tokens.radius.card}px`,
              p: 1.25,
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
            }}
          >
            <Typography sx={{ fontWeight: 700, fontSize: 14.5 }}>{card.text}</Typography>
            {author === undefined ? (
              <Typography sx={{ fontSize: 13, color: tokens.color.inkSoft }}>
                ＋ Tap to name who said it
              </Typography>
            ) : (
              <AuthorChip id={author} players={players} />
            )}
          </Box>
        );
      })}
    </Box>
  );
}

function RevealPhone({
  v,
  players,
  youId,
}: { v: RevealView; players: readonly PublicPlayer[]; youId: string }): ReactNode {
  const points = v.scores.find((s) => s.playerId === youId)?.points ?? 0;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, flex: 1 }}>
      <Box
        component="span"
        sx={{
          alignSelf: 'flex-start',
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          px: 1.25,
          py: 0.5,
          borderRadius: 1,
          backgroundColor: tokens.color.teal,
          color: '#fff',
        }}
      >
        Round done
      </Box>
      <Box sx={{ textAlign: 'center', mt: 1 }}>
        <Typography sx={{ color: tokens.color.inkSoft, fontSize: 14 }}>You got</Typography>
        <Typography variant="h2" sx={{ fontSize: 46 }}>
          {points}
        </Typography>
        <Typography sx={{ color: tokens.color.inkSoft, fontSize: 14 }}>
          correct this round
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mt: 1 }}>
        {v.cards.map((card) => (
          <Box
            key={card.id}
            sx={{
              backgroundColor: tokens.color.card,
              border: '1px solid #e8dcc6',
              borderRadius: `${tokens.radius.card}px`,
              p: 1,
            }}
          >
            <Typography sx={{ fontSize: 13 }}>
              “{card.text}” — <AuthorChip id={card.authorId} players={players} />
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export function PlayerView({
  view,
  players,
  youId,
}: { view: unknown; players: readonly PublicPlayer[]; youId: string }): ReactNode {
  const v = asPlayerView(view);
  if (v === null) {
    return null;
  }
  if (v.phase === 'collect') {
    return <CollectPhone prompt={v.prompt} youSubmitted={v.youSubmitted} />;
  }
  if (v.phase === 'guess') {
    return <GuessPhone v={v} players={players} />;
  }
  return <RevealPhone v={v} players={players} youId={youId} />;
}
