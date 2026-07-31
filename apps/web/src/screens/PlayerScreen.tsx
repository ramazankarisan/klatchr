import { Box, Typography } from '@mui/material';
import { type ReactNode, useCallback } from 'react';
import { DymoCode, Phone, Recover } from '../components/paper.js';
import { SessionStandings } from '../components/standings.js';
import { gameCatalog, viewsFor } from '../games/registry.js';
import { GameLabel } from '../games/viewKit.js';
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

/** A thin round-counter + your session rank on the phone (S6). */
function SessionLine({ frame, id }: { frame: ViewFrame; id: string }): ReactNode {
  if (frame.round < 1) {
    return null;
  }
  // Rank only among players still in the room (B6) — no ghost inflates "of N".
  const scores = frame.sessionScores.filter((s) => frame.players.some((p) => p.id === s.playerId));
  const mine = scores.find((s) => s.playerId === id)?.points ?? 0;
  const rank = 1 + scores.filter((s) => s.points > mine).length;
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontFamily: tokens.font.mono,
        fontSize: 12,
        fontWeight: 700,
        color: tokens.color.markerDeep,
      }}
    >
      <Box component="span">Round {frame.round}</Box>
      {scores.length > 0 ? (
        <Box component="span">
          #{rank} of {scores.length} · {mine} pts
        </Box>
      ) : null}
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
  const game = gameCatalog().find((g) => g.id === frame.selectedGameId);
  // Seat count comes from the running game (8.2), never a hardcoded 12.
  const seats = game?.maxPlayers;
  const play = (): ReactNode =>
    views === null ? null : (
      <views.Player view={frame.gameView} players={frame.players} youId={id} onEvent={onEvent} />
    );
  const header = (
    <>
      <Brand code={frame.code} name={me?.nickname ?? 'You'} />
      <GameLabel name={game?.name} />
      <SessionLine frame={frame} id={id} />
    </>
  );

  // B1: at SCORES the round is over. A natural finish left the game on reveal/results
  // (its terminal step) — keep showing it, that's your result. A host abort left it
  // mid-round, so show a "that's a wrap" instead of the stale form. Overall either way.
  if (frame.phase === 'SCORES') {
    const terminal = views !== null && views.hostStep(frame.gameView).advance === null;
    const anyScores = frame.sessionScores.some((s) =>
      frame.players.some((p) => p.id === s.playerId),
    );
    return (
      <Phone reconnecting={reconnecting}>
        {header}
        {terminal ? play() : <Centered title="That’s a wrap!" body="The host ended the round." />}
        {anyScores ? (
          <SessionStandings scores={frame.sessionScores} players={frame.players} title="Overall" />
        ) : null}
      </Phone>
    );
  }
  return (
    <Phone reconnecting={reconnecting}>
      {header}
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
        play()
      )}
    </Phone>
  );
}
