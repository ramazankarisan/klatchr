import { Box, Button, TextField, Typography } from '@mui/material';
import { type ReactNode, useState } from 'react';
import { nameOf } from '../../players.js';
import { tokens } from '../../tokens.js';
import type { PublicPlayer } from '../../transport/types.js';
import { NameLabel, NamePicker, PlayerKicker, PlayerResults, gamePlayerView } from '../viewKit.js';
import { type GuessPlayerView, type RevealView, asPlayerView } from './frames.js';

function CollectPhone({
  prompt,
  youSubmitted,
  onSubmit,
}: { prompt: string; youSubmitted: boolean; onSubmit: (text: string) => void }): ReactNode {
  const [text, setText] = useState('');
  // F12: a player can skip taping a card and still guess others this round. Skipping
  // is local (no blank card is submitted); the frame just never sees a draft for them.
  const [skipped, setSkipped] = useState(false);
  const trimmed = text.trim();
  const done = youSubmitted || skipped;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, flex: 1 }}>
      <PlayerKicker>Your answer · secret</PlayerKicker>
      <Typography variant="h3" component="h2" sx={{ fontSize: 23, lineHeight: 1.08 }}>
        {prompt}
      </Typography>
      <Typography sx={{ color: tokens.color.inkSoft, fontSize: 14 }}>
        Nobody sees who wrote it — until the reveal.
      </Typography>
      {done ? (
        <Box sx={{ mt: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box
            sx={{
              p: 1.5,
              borderRadius: `${tokens.radius.card}px`,
              border: `1.5px solid ${tokens.color.teal}`,
              color: tokens.color.teal,
              fontWeight: 600,
            }}
          >
            {youSubmitted ? '✓ Answer taped up' : '✓ Skipped — you’ll still guess'}
          </Box>
          <Button variant="contained" disabled fullWidth>
            Waiting for the room…
          </Button>
        </Box>
      ) : (
        <Box
          component="form"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(trimmed);
          }}
          sx={{ mt: 'auto', display: 'flex', flexDirection: 'column', gap: 1.5 }}
        >
          <TextField
            label="Your answer"
            value={text}
            onChange={(e) => setText(e.target.value)}
            multiline
            minRows={2}
          />
          <Button
            type="submit"
            variant="contained"
            size="large"
            fullWidth
            disabled={trimmed === ''}
          >
            Tape it up
          </Button>
          <Button
            variant="text"
            color="inherit"
            onClick={() => setSkipped(true)}
            sx={{ color: tokens.color.inkSoft, minHeight: 44 }}
          >
            Skip — I’ll just guess this round
          </Button>
        </Box>
      )}
    </Box>
  );
}

function Card({ text, children }: { text: string; children: ReactNode }): ReactNode {
  return (
    <Box
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
      <Typography sx={{ fontWeight: 700, fontSize: 14.5 }}>{text}</Typography>
      {children}
    </Box>
  );
}

function GuessPhone({
  v,
  players,
  youId,
  onGuess,
}: {
  v: GuessPlayerView;
  players: readonly PublicPlayer[];
  youId: string;
  onGuess: (cardId: string, author: string) => void;
}): ReactNode {
  const [openCard, setOpenCard] = useState<string | null>(null);
  const candidates = v.candidates.filter((id) => id !== youId);
  const guessable = v.cards.filter((card) => card.id !== v.yourCardId);
  const named = guessable.filter((card) => v.myGuesses[card.id] !== undefined).length;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, flex: 1 }}>
      <PlayerKicker>
        Name the authors ·{' '}
        <Box component="span" sx={{ fontFamily: tokens.font.mono, color: tokens.color.markerDeep }}>
          {named} of {guessable.length}
        </Box>
      </PlayerKicker>
      {/* F8: keep the question in front of the guesser — it's otherwise only on the board. */}
      <Box
        sx={{
          backgroundColor: '#f4e7d5',
          border: '1px solid #e6d6bd',
          borderRadius: `${tokens.radius.card}px`,
          p: '8px 10px',
          fontSize: 13,
          color: tokens.color.inkSoft,
        }}
      >
        <Box component="span" sx={{ fontWeight: 700, color: tokens.color.ink }}>
          Q:
        </Box>{' '}
        {v.prompt}
      </Box>
      {v.cards.map((card) => {
        if (card.id === v.yourCardId) {
          return (
            <Card key={card.id} text={card.text}>
              <Typography sx={{ fontSize: 12.5, color: tokens.color.teal, fontWeight: 700 }}>
                ✓ Your card
              </Typography>
            </Card>
          );
        }
        const author = v.myGuesses[card.id];
        // The picker wins when open, so a placed guess can be re-opened and changed.
        return (
          <Card key={card.id} text={card.text}>
            {openCard === card.id ? (
              <NamePicker
                candidates={candidates}
                players={players}
                onPick={(a) => {
                  onGuess(card.id, a);
                  setOpenCard(null);
                }}
              />
            ) : author !== undefined ? (
              <Button
                onClick={() => setOpenCard(card.id)}
                sx={{ alignSelf: 'flex-start', textTransform: 'none', px: 0.5, minHeight: 44 }}
              >
                <NameLabel id={author} players={players} />
              </Button>
            ) : (
              <Button
                onClick={() => setOpenCard(card.id)}
                sx={{
                  alignSelf: 'flex-start',
                  textTransform: 'none',
                  color: tokens.color.inkSoft,
                  px: 0.5,
                  minHeight: 44,
                }}
              >
                ＋ Tap to name who said it
              </Button>
            )}
          </Card>
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
    <PlayerResults value={points} unit="correct this round">
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        {v.cards.map((card) => {
          const own = card.authorId === youId;
          const mine = v.myGuesses?.[card.id];
          return (
            <Card key={card.id} text={`“${card.text}”`}>
              <NameLabel id={card.authorId} players={players} />
              {/* F9: your own pick vs. the truth for each card */}
              {own ? (
                <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: tokens.color.teal }}>
                  ✎ your card
                </Typography>
              ) : mine !== undefined ? (
                <Typography
                  sx={{
                    fontSize: 12.5,
                    fontWeight: 700,
                    color: mine === card.authorId ? tokens.color.teal : tokens.color.bad,
                  }}
                >
                  {mine === card.authorId ? '✓' : '✕'} you guessed {nameOf(mine, players)}
                </Typography>
              ) : (
                <Typography sx={{ fontSize: 12.5, color: tokens.color.inkSoft }}>
                  — you didn’t name this one
                </Typography>
              )}
            </Card>
          );
        })}
      </Box>
    </PlayerResults>
  );
}

export const PlayerView = gamePlayerView(asPlayerView, (v, { players, youId, onEvent }) => {
  if (v.phase === 'collect') {
    return (
      <CollectPhone
        prompt={v.prompt}
        youSubmitted={v.youSubmitted}
        onSubmit={(text) => onEvent({ type: 'submit', text })}
      />
    );
  }
  if (v.phase === 'guess') {
    return (
      <GuessPhone
        v={v}
        players={players}
        youId={youId}
        onGuess={(cardId, author) => onEvent({ type: 'guess', cardId, author })}
      />
    );
  }
  return <RevealPhone v={v} players={players} youId={youId} />;
});
