import { Box, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { IndexCard, Stamp } from '../../components/paper.js';
import { nameOf } from '../../players.js';
import { playerColor, tokens } from '../../tokens.js';
import type { PublicPlayer } from '../../transport/types.js';
import { HostKicker, Prompt, gameHostView } from '../viewKit.js';
import { type GuessHostView, type RevealView, asHostView } from './frames.js';

const cardLabel = (i: number): string => `Card ${String.fromCharCode(65 + i)}`;

const cardGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 2.5,
} as const;

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

/**
 * The reveal scoreboard on the shared screen. Public by nature (everyone sees
 * the board), so no leak — and shown only at reveal, so mid-round scores never
 * spoil it. This is the *round* tally; the cross-round cumulative total rides
 * alongside it as the platform-level `SessionStandings` (S6, Cycle 10).
 */
function Standings({
  scores,
  players,
}: { scores: RevealView['scores']; players: readonly PublicPlayer[] }): ReactNode {
  const ranked = [...scores].sort((a, b) => b.points - a.points);
  return (
    <Box sx={{ mt: 4 }}>
      <HostKicker>Standings · this round</HostKicker>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxWidth: 520 }}>
        {ranked.map((s, i) => (
          <Box
            key={s.playerId}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              backgroundColor: tokens.color.card,
              border: '1px solid #e9ddc7',
              borderRadius: `${tokens.radius.control}px`,
              p: 1.25,
              boxShadow: i === 0 ? `inset 3px 0 0 ${tokens.color.marker}` : 'none',
            }}
          >
            <Typography
              sx={{
                fontFamily: tokens.font.mono,
                fontSize: 13,
                color: tokens.color.inkSoft,
                width: 22,
              }}
            >
              {i + 1}
            </Typography>
            <Box
              component="span"
              sx={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                backgroundColor: playerColor(s.playerId, players),
              }}
            />
            <Typography sx={{ flex: 1, fontWeight: 700 }}>{nameOf(s.playerId, players)}</Typography>
            <Typography
              sx={{
                fontFamily: tokens.font.mono,
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              +{s.points}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export const HostView = gameHostView(asHostView, (v, players) => {
  if (v.phase === 'collect') {
    return (
      <Box>
        <HostKicker>Everyone’s writing an answer</HostKicker>
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
        <HostKicker>Guess who said it — on your phones</HostKicker>
        <Prompt text={v.prompt} />
        <Typography
          sx={{
            mt: 2,
            fontFamily: tokens.font.mono,
            fontWeight: 700,
            color: tokens.color.markerDeep,
          }}
        >
          {v.guessed.length} of {v.candidates.length} have guessed
        </Typography>
        <GuessCards cards={v.cards} />
      </Box>
    );
  }
  return (
    <Box>
      <HostKicker>And the authors are…</HostKicker>
      <RevealCards cards={v.cards} players={players} />
      <Standings scores={v.scores} players={players} />
    </Box>
  );
});
