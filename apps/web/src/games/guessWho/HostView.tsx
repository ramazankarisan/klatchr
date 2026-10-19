import { Box, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { IndexCard, Stamp } from '../../components/paper.js';
import { nameOf } from '../../players.js';
import { playerColor, tokens } from '../../tokens.js';
import type { PublicPlayer } from '../../transport/types.js';
import { ActedProgress } from '../progressChips.js';
import { HostKicker, Prompt, actedIds, gameHostView, seatedIds } from '../viewKit.js';
import { type GuessHostView, type RevealView, asHostView } from './frames.js';

const cardLabel = (i: number): string => `Card ${String.fromCharCode(65 + i)}`;

/** The answer cards as a labelled list, so "what is on a card" is queryable on its own —
 * apart from the progress chips' names, which say who has acted, never who wrote what. */
function CardGrid({ mt, children }: { mt: number; children: ReactNode }): ReactNode {
  return (
    <Box
      component="ul"
      aria-label="Answer cards"
      sx={{
        listStyle: 'none',
        p: 0,
        mb: 0,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(clamp(220px, 18vw, 340px), 1fr))',
        gap: 'clamp(20px, 2vw, 36px)',
        mt,
      }}
    >
      {children}
    </Box>
  );
}

function AnswerText({ text }: { text: string }): ReactNode {
  return (
    <Typography sx={{ fontSize: 'clamp(18px, 1.7vw, 30px)', fontWeight: 600 }}>{text}</Typography>
  );
}

function GuessCards({ cards }: { cards: GuessHostView['cards'] }): ReactNode {
  return (
    <CardGrid mt={4}>
      {cards.map((card, i) => (
        <Box component="li" key={card.id}>
          <IndexCard>
            <Typography
              sx={{
                fontFamily: tokens.font.mono,
                fontSize: 'clamp(13px, 1.1vw, 18px)',
                color: tokens.color.markerDeep,
                fontWeight: 700,
              }}
            >
              {cardLabel(i)}
            </Typography>
            <AnswerText text={card.text} />
          </IndexCard>
        </Box>
      ))}
    </CardGrid>
  );
}

function RevealCards({
  cards,
  players,
}: { cards: RevealView['cards']; players: readonly PublicPlayer[] }): ReactNode {
  return (
    <CardGrid mt={1}>
      {cards.map((card) => (
        <Box component="li" key={card.id}>
          <IndexCard>
            <Stamp />
            <AnswerText text={card.text} />
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                mt: 'auto',
                color: tokens.color.tealDeep,
                fontWeight: 800,
                fontSize: 'clamp(15px, 1.4vw, 24px)',
              }}
            >
              <Box
                component="span"
                sx={{
                  width: '0.8em',
                  height: '0.8em',
                  borderRadius: '50%',
                  backgroundColor: playerColor(card.authorId, players),
                }}
              />
              {nameOf(card.authorId, players)}
            </Box>
          </IndexCard>
        </Box>
      ))}
    </CardGrid>
  );
}

// The round's scores are no longer drawn here: the platform's one ranked standings table
// (this round + total, UX-1) sits under the reveal on the SCORES screen.
export const HostView = gameHostView(asHostView, (v, players) => {
  if (v.phase === 'collect') {
    return (
      <Box>
        <HostKicker>Everyone’s writing an answer</HostKicker>
        <Prompt text={v.prompt} />
        <ActedProgress
          ids={seatedIds(players)}
          done={actedIds(v.submitted)}
          verb="answered"
          players={players}
        />
      </Box>
    );
  }
  if (v.phase === 'guess') {
    return (
      <Box>
        <HostKicker>Guess who said it — on your phones</HostKicker>
        <Prompt text={v.prompt} />
        <ActedProgress
          ids={seatedIds(players)}
          done={actedIds(v.guessed)}
          verb="have guessed"
          players={players}
        />
        <GuessCards cards={v.cards} />
      </Box>
    );
  }
  return (
    <Box>
      <HostKicker>And the authors are…</HostKicker>
      <RevealCards cards={v.cards} players={players} />
    </Box>
  );
});
