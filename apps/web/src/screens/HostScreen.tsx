import { Box, Button, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { Board, NameTag } from '../components/paper.js';
import { asHostView } from '../games/guessWho/frames.js';
import { viewsFor } from '../games/registry.js';
import { playerColor, tokens } from '../tokens.js';
import type { MockEngine } from '../transport/mockRoom.js';
import type { ViewFrame } from '../transport/types.js';
import { useFrame } from '../useFrame.js';

function stepLabel(frame: ViewFrame): string {
  if (frame.phase === 'LOBBY') {
    return 'Start the round';
  }
  const phase = asHostView(frame.gameView)?.phase ?? null;
  if (phase === 'collect') {
    return 'Show the cards';
  }
  if (phase === 'guess') {
    return 'Reveal the authors';
  }
  return 'New round';
}

function Lobby({ frame }: { frame: ViewFrame }): ReactNode {
  return (
    <Box>
      <Box
        sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 0.5 }}
      >
        <Typography variant="h3" sx={{ fontSize: 20 }}>
          On the board
        </Typography>
        <Typography
          sx={{ fontFamily: tokens.font.mono, color: tokens.color.markerDeep, fontWeight: 700 }}
        >
          {frame.players.length} / 50 in the room
        </Typography>
      </Box>
      <Typography sx={{ color: tokens.color.inkSoft, fontSize: 13, mb: 2 }}>
        Guess Who seats <b>12 per round</b> — the rest cheer from the bench and rotate in next
        round.
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))',
          gap: 1.5,
        }}
      >
        {frame.players.map((p) => (
          <NameTag key={p.id} name={p.nickname} color={playerColor(p.id, frame.players)} />
        ))}
      </Box>
    </Box>
  );
}

export function HostScreen({ engine }: { engine: MockEngine }): ReactNode {
  const frame = useFrame(engine, 'host');
  const views = viewsFor(frame.selectedGameId);
  return (
    <Board code={frame.code} hint={<>Join at klatchr.app · punch in the code</>}>
      {frame.phase === 'LOBBY' || views === null ? (
        <Lobby frame={frame} />
      ) : (
        <views.Host view={frame.gameView} players={frame.players} />
      )}
      <Box sx={{ mt: 4 }}>
        <Button variant="contained" size="large" onClick={() => engine.step()}>
          {stepLabel(frame)}
        </Button>
      </Box>
    </Board>
  );
}
