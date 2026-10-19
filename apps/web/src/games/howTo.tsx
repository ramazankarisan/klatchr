import { Box, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { tokens } from '../tokens.js';
import type { GameOption } from './registry.js';

const card = {
  backgroundColor: tokens.color.card,
  borderRadius: `${tokens.radius.card}px`,
  boxShadow: tokens.elevation.lift,
  display: 'flex',
  flexDirection: 'column',
} as const;

/** The TV lobby's "How to play · <game>" card (UX-2): the three steps side by side, large
 * enough to read from the couch while people join. */
export function BoardHowTo({ game }: { game: GameOption }): ReactNode {
  return (
    <Box
      component="section"
      aria-label={`How to play ${game.name}`}
      sx={{ ...card, gap: 'clamp(10px, 1vw, 16px)', p: 'clamp(18px, 1.8vw, 32px)' }}
    >
      <Typography variant="h3" component="h2" sx={{ fontSize: 'clamp(22px, 2vw, 34px)' }}>
        How to play · {game.name}
      </Typography>
      <Box
        component="ol"
        sx={{
          m: 0,
          p: 0,
          listStyle: 'none',
          display: 'grid',
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(3, minmax(0, 1fr))' },
          gap: 'clamp(12px, 1.5vw, 24px)',
          fontSize: 'clamp(16px, 1.5vw, 24px)',
          lineHeight: 1.35,
        }}
      >
        {game.howTo.map((step, i) => (
          <li key={step}>
            <Box component="span" sx={{ fontWeight: 800, color: tokens.color.markerDeep }}>
              {i + 1}.
            </Box>{' '}
            {step}
          </li>
        ))}
      </Box>
    </Box>
  );
}

/** The phone waiting room's "Up next" card (UX-2): the picked game and its three steps. */
export function PhoneHowTo({ game }: { game: GameOption }): ReactNode {
  return (
    <Box
      component="section"
      aria-label={`How to play ${game.name}`}
      sx={{ ...card, gap: 1.25, p: 2 }}
    >
      <Typography
        sx={{
          fontFamily: tokens.font.mono,
          fontSize: 13,
          letterSpacing: '0.12em',
          color: tokens.color.inkSoft,
        }}
      >
        UP NEXT
      </Typography>
      <Typography variant="h3" component="h3" sx={{ fontSize: 22 }}>
        {game.name}
      </Typography>
      <Box
        component="ol"
        sx={{
          m: 0,
          pl: 2.5,
          display: 'flex',
          flexDirection: 'column',
          gap: 0.75,
          fontSize: 16,
          lineHeight: 1.4,
        }}
      >
        {game.howTo.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </Box>
    </Box>
  );
}
