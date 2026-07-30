import { Box, Typography } from '@mui/material';
import { type ReactNode, useCallback } from 'react';
import { DymoCode, Phone, Recover } from '../components/paper.js';
import { gameCatalog, viewsFor } from '../games/registry.js';
import { tokens } from '../tokens.js';
import type { Transport, ViewFrame } from '../transport/types.js';
import { useScreen } from '../useScreen.js';

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

export function PlayerScreen({
  transport,
  onExit,
}: { transport: Transport; onExit: () => void }): ReactNode {
  const { frame, reconnecting, recover } = useScreen(transport, onExit, 'Try another code');

  // One opaque seam: the game view builds its own event; the transport wraps it
  // in a `play`. Adding a game needs no new callback here.
  const onEvent = useCallback(
    (event: unknown) => {
      transport.send({ type: 'gameEvent', event });
    },
    [transport],
  );

  // A fatal error (bad code, full room, closed room) takes over the screen with a
  // way back — never the endless "Joining…" spinner. Non-fatal errors map to null.
  if (recover !== null) {
    return (
      <Phone>
        <Recover {...recover} />
      </Phone>
    );
  }

  if (frame === null) {
    return (
      <Phone reconnecting={reconnecting}>
        <Centered title="Joining…" body="Finding your seat." />
      </Phone>
    );
  }
  const id = youId(frame);
  const me = frame.players.find((p) => p.id === id);
  const views = viewsFor(frame.selectedGameId);
  // Seat count comes from the running game (8.2), never a hardcoded 12.
  const seats = gameCatalog().find((g) => g.id === frame.selectedGameId)?.maxPlayers;
  return (
    <Phone reconnecting={reconnecting}>
      <Brand code={frame.code} name={me?.nickname ?? 'You'} />
      {frame.phase === 'LOBBY' ? (
        <Centered title="You’re in" body="Grab a seat — watch the board for the first prompt." />
      ) : me?.spectator === true ? (
        <Centered
          title="You’re up next round"
          body={`This round is full${seats !== undefined ? ` (${seats} seats)` : ''}. You’ll be dealt in when the host starts again.`}
        />
      ) : views === null ? (
        <Centered title="Waiting" body="The host is setting up." />
      ) : (
        <views.Player view={frame.gameView} players={frame.players} youId={id} onEvent={onEvent} />
      )}
    </Phone>
  );
}
