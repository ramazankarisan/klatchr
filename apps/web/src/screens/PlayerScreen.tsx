import { Box, Typography } from '@mui/material';
import { type ReactNode, useCallback } from 'react';
import { DymoCode, Phone } from '../components/paper.js';
import { viewsFor } from '../games/registry.js';
import { tokens } from '../tokens.js';
import type { Transport, ViewFrame } from '../transport/types.js';
import { useFrame } from '../useFrame.js';

function Brand({ code, name }: { code: string; name: string }): ReactNode {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <Typography variant="h3" sx={{ fontSize: 19 }}>
        <Box component="span" sx={{ color: tokens.color.marker }}>
          K
        </Box>
        latchr
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography sx={{ fontSize: 12, color: tokens.color.inkSoft }}>{name}</Typography>
        <DymoCode code={code} small />
      </Box>
    </Box>
  );
}

function Centered({ title, body }: { title: string; body: string }): ReactNode {
  return (
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        textAlign: 'center',
        gap: 1,
      }}
    >
      <Typography variant="h3" sx={{ fontSize: 22 }}>
        {title}
      </Typography>
      <Typography sx={{ color: tokens.color.inkSoft, fontSize: 14 }}>{body}</Typography>
    </Box>
  );
}

/** This phone's own player id — the transport resolves it (host has none). */
function youId(frame: ViewFrame): string {
  return frame.viewer.role === 'player' ? frame.viewer.id : '';
}

export function PlayerScreen({ transport }: { transport: Transport }): ReactNode {
  const frame = useFrame(transport);

  const onSubmit = useCallback(
    (text: string) => {
      transport.send({ type: 'gameEvent', event: { type: 'submit', text } });
    },
    [transport],
  );
  const onGuess = useCallback(
    (cardId: string, author: string) => {
      transport.send({ type: 'gameEvent', event: { type: 'guess', cardId, author } });
    },
    [transport],
  );

  if (frame === null) {
    return (
      <Phone>
        <Centered title="Joining…" body="Finding your seat." />
      </Phone>
    );
  }
  const id = youId(frame);
  const me = frame.players.find((p) => p.id === id);
  const views = viewsFor(frame.selectedGameId);
  return (
    <Phone>
      <Brand code={frame.code} name={me?.nickname ?? 'You'} />
      {frame.phase === 'LOBBY' ? (
        <Centered title="You’re in" body="Grab a seat — watch the board for the first prompt." />
      ) : me?.spectator === true ? (
        <Centered
          title="You’re up next round"
          body="This round is full (12 seats). You’ll be dealt in when the host starts again."
        />
      ) : views === null ? (
        <Centered title="Waiting" body="The host is setting up." />
      ) : (
        <views.Player
          view={frame.gameView}
          players={frame.players}
          youId={id}
          onSubmit={onSubmit}
          onGuess={onGuess}
        />
      )}
    </Phone>
  );
}
