import { Box, Button, TextField, Typography } from '@mui/material';
import { type ReactNode, useState } from 'react';
import { nameOf } from '../../players.js';
import { playerColor, tokens } from '../../tokens.js';
import type { PublicPlayer } from '../../transport/types.js';
import type { PlayerViewProps } from '../viewProps.js';
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
  onSubmit,
}: { prompt: string; youSubmitted: boolean; onSubmit: (text: string) => void }): ReactNode {
  const [text, setText] = useState('');
  const trimmed = text.trim();
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, flex: 1 }}>
      <Kicker>Your answer · secret</Kicker>
      <Typography variant="h3" sx={{ fontSize: 23, lineHeight: 1.08 }}>
        {prompt}
      </Typography>
      <Typography sx={{ color: tokens.color.inkSoft, fontSize: 14 }}>
        Nobody sees who wrote it — until the reveal.
      </Typography>
      {youSubmitted ? (
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
            ✓ Answer taped up
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

function AuthorPicker({
  candidates,
  players,
  onPick,
}: {
  candidates: readonly string[];
  players: readonly PublicPlayer[];
  onPick: (author: string) => void;
}): ReactNode {
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const shown = candidates.filter((id) => nameOf(id, players).toLowerCase().includes(q));
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      <TextField
        label="Search names"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        size="small"
      />
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
        {shown.map((id) => (
          <Button
            key={id}
            onClick={() => onPick(id)}
            sx={{
              textTransform: 'none',
              borderRadius: 999,
              border: '1px solid #e6d9c1',
              color: tokens.color.ink,
              gap: 0.75,
            }}
          >
            <Box
              component="span"
              sx={{
                width: 11,
                height: 11,
                borderRadius: '50%',
                backgroundColor: playerColor(id, players),
              }}
            />
            {nameOf(id, players)}
          </Button>
        ))}
      </Box>
    </Box>
  );
}

function GuessPhone({
  v,
  players,
  youId,
  myAnswer,
  onGuess,
}: {
  v: GuessPlayerView;
  players: readonly PublicPlayer[];
  youId: string;
  myAnswer: string | null;
  onGuess: (cardId: string, author: string) => void;
}): ReactNode {
  const [openCard, setOpenCard] = useState<string | null>(null);
  const named = Object.keys(v.myGuesses).length;
  const candidates = v.candidates.filter((id) => id !== youId);
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, flex: 1 }}>
      <Kicker>
        Name the authors ·{' '}
        <Box component="span" sx={{ fontFamily: tokens.font.mono, color: tokens.color.markerDeep }}>
          {named} of {candidates.length}
        </Box>
      </Kicker>
      {v.cards.map((card) => {
        if (myAnswer !== null && card.text === myAnswer) {
          return (
            <Card key={card.id} text={card.text}>
              <Typography sx={{ fontSize: 12.5, color: tokens.color.teal, fontWeight: 700 }}>
                ✓ Your card
              </Typography>
            </Card>
          );
        }
        const author = v.myGuesses[card.id];
        return (
          <Card key={card.id} text={card.text}>
            {author !== undefined ? (
              <Button
                onClick={() => setOpenCard(openCard === card.id ? null : card.id)}
                sx={{ alignSelf: 'flex-start', textTransform: 'none', p: 0 }}
              >
                <AuthorChip id={author} players={players} />
              </Button>
            ) : openCard === card.id ? (
              <AuthorPicker
                candidates={candidates}
                players={players}
                onPick={(a) => {
                  onGuess(card.id, a);
                  setOpenCard(null);
                }}
              />
            ) : (
              <Button
                onClick={() => setOpenCard(card.id)}
                sx={{
                  alignSelf: 'flex-start',
                  textTransform: 'none',
                  color: tokens.color.inkSoft,
                  p: 0,
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
          <Card key={card.id} text={`“${card.text}”`}>
            <AuthorChip id={card.authorId} players={players} />
          </Card>
        ))}
      </Box>
    </Box>
  );
}

export function PlayerView({
  view,
  players,
  youId,
  myAnswer,
  onSubmit,
  onGuess,
}: PlayerViewProps): ReactNode {
  const v = asPlayerView(view);
  if (v === null) {
    return null;
  }
  if (v.phase === 'collect') {
    return <CollectPhone prompt={v.prompt} youSubmitted={v.youSubmitted} onSubmit={onSubmit} />;
  }
  if (v.phase === 'guess') {
    return (
      <GuessPhone v={v} players={players} youId={youId} myAnswer={myAnswer} onGuess={onGuess} />
    );
  }
  return <RevealPhone v={v} players={players} youId={youId} />;
}
