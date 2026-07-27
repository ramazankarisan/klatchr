import { Box, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { IndexCard, Stamp } from '../../components/paper.js';
import { nameOf } from '../../players.js';
import { playerColor, tokens } from '../../tokens.js';
import type { PublicPlayer } from '../../transport/types.js';
import { type GuessHostView, type RevealView, asHostView } from './frames.js';

const cardLabel = (i: number): string => `Card ${String.fromCharCode(65 + i)}`;

const cardGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 2.5,
} as const;

function Kicker({ children }: { children: ReactNode }): ReactNode {
  return (
    <Typography variant="overline" sx={{ color: tokens.color.markerDeep, display: 'block', mb: 1 }}>
      {children}
    </Typography>
  );
}

function Prompt({ text }: { text: string }): ReactNode {
  return (
    <Typography variant="h2" sx={{ fontSize: { xs: 24, sm: 34 }, maxWidth: '20ch' }}>
      {text}
    </Typography>
  );
}

function AnswerText({ text }: { text: string }): ReactNode {
  return <Typography sx={{ fontSize: 18, fontWeight: 600 }}>{text}</Typography>;
}

function GuessCards({ cards }: { cards: GuessHostView['cards'] }): ReactNode {
  return (
    <Box sx={{ ...cardGrid, mt: 3 }}>
      {cards.map((card, i) => (
        <IndexCard key={card.id}>
          <Typography
            sx={{
              fontFamily: tokens.font.mono,
              fontSize: 11,
              color: tokens.color.markerDeep,
              fontWeight: 700,
            }}
          >
            {cardLabel(i)}
          </Typography>
          <AnswerText text={card.text} />
        </IndexCard>
      ))}
    </Box>
  );
}

function RevealCards({
  cards,
  players,
}: { cards: RevealView['cards']; players: readonly PublicPlayer[] }): ReactNode {
  return (
    <Box sx={{ ...cardGrid, mt: 1 }}>
      {cards.map((card) => (
        <IndexCard key={card.id}>
          <Stamp />
          <AnswerText text={card.text} />
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              mt: 'auto',
              color: tokens.color.teal,
              fontWeight: 800,
              fontSize: 13,
            }}
          >
            <Box
              component="span"
              sx={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                backgroundColor: playerColor(card.authorId, players),
              }}
            />
            {nameOf(card.authorId, players)}
          </Box>
        </IndexCard>
      ))}
    </Box>
  );
}

export function HostView({
  view,
  players,
}: { view: unknown; players: readonly PublicPlayer[] }): ReactNode {
  const v = asHostView(view);
  if (v === null) {
    return null;
  }
  if (v.phase === 'collect') {
    return (
      <Box>
        <Kicker>Everyone’s writing an answer</Kicker>
        <Prompt text={v.prompt} />
        <Typography
          sx={{
            mt: 3,
            fontFamily: tokens.font.mono,
            fontWeight: 700,
            color: tokens.color.markerDeep,
          }}
        >
          {v.submittedCount} of {v.total} answered
        </Typography>
      </Box>
    );
  }
  if (v.phase === 'guess') {
    return (
      <Box>
        <Kicker>Guess who said it — on your phones</Kicker>
        <Prompt text={v.prompt} />
        <GuessCards cards={v.cards} />
      </Box>
    );
  }
  return (
    <Box>
      <Kicker>And the authors are…</Kicker>
      <RevealCards cards={v.cards} players={players} />
    </Box>
  );
}
