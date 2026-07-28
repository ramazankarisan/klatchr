import { Box, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { nameOf } from '../../players.js';
import { tokens } from '../../tokens.js';
import type { PublicPlayer } from '../../transport/types.js';
import { NamePicker, PlayerKicker, PlayerResults, TallyBars, gamePlayerView } from '../viewKit.js';
import { type ResultsView, type VotePlayerView, asPlayerView } from './frames.js';

function VotePhone({
  v,
  players,
  onVote,
}: {
  v: VotePlayerView;
  players: readonly PublicPlayer[];
  onVote: (target: string) => void;
}): ReactNode {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, flex: 1 }}>
      <PlayerKicker>Your vote · secret</PlayerKicker>
      <Typography variant="h3" sx={{ fontSize: 23, lineHeight: 1.1 }}>
        {v.prompt}
      </Typography>
      <Typography sx={{ color: tokens.color.inkSoft, fontSize: 14 }}>
        Tap a name. Nobody sees your pick until the reveal.
      </Typography>
      <NamePicker
        candidates={v.candidates}
        players={players}
        selectedId={v.yourVote}
        onPick={onVote}
      />
      {v.yourVote !== undefined ? (
        <Typography sx={{ mt: 'auto', color: tokens.color.teal, fontWeight: 700, fontSize: 13.5 }}>
          ✓ Voted for {nameOf(v.yourVote, players)} — tap another to change
        </Typography>
      ) : null}
    </Box>
  );
}

function ResultsPhone({
  v,
  players,
  youId,
}: {
  v: ResultsView;
  players: readonly PublicPlayer[];
  youId: string;
}): ReactNode {
  const points = v.tally.find((t) => t.playerId === youId)?.points ?? 0;
  return (
    <PlayerResults value={points} unit="votes this round">
      <TallyBars rows={v.tally} players={players} />
    </PlayerResults>
  );
}

export const PlayerView = gamePlayerView(asPlayerView, (v, { players, youId, onEvent }) =>
  v.phase === 'vote' ? (
    <VotePhone v={v} players={players} onVote={(target) => onEvent({ type: 'vote', target })} />
  ) : (
    <ResultsPhone v={v} players={players} youId={youId} />
  ),
);
