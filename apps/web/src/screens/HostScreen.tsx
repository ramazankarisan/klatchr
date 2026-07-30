import { Box, Button, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { Board, NameTag, Recover } from '../components/paper.js';
import { type GameOption, gameCatalog, viewsFor } from '../games/registry.js';
import { playerColor, tokens } from '../tokens.js';
import type { Action, Transport, ViewFrame } from '../transport/types.js';
import { useScreen } from '../useScreen.js';

/** Where players go to join — this host's own origin (rule 6: never a baked host). */
function joinHost(): string {
  return typeof window === 'undefined' ? '' : window.location.host;
}

/** The host's one control button, resolved for any game from the current frame. */
function hostControl(frame: ViewFrame): { label: string; actions: readonly Action[] } {
  const gameId = frame.selectedGameId;
  if (frame.phase === 'LOBBY') {
    // A game must be picked first (selectGame, from the picker), and the room
    // must meet its minimum — otherwise core rejects startGame with no feedback.
    const game = gameCatalog().find((g) => g.id === gameId);
    const ready = game !== undefined && frame.players.length >= game.minPlayers;
    return { label: 'Start the round', actions: ready ? [{ type: 'startGame' }] : [] };
  }
  const step = gameId === null ? null : (viewsFor(gameId)?.hostStep(frame.gameView) ?? null);
  if (step !== null && step.advance !== null) {
    return { label: step.label, actions: [{ type: 'gameEvent', event: step.advance }] };
  }
  // Terminal phase (reveal/results): run it back with the same selected game.
  return { label: 'New round', actions: gameId === null ? [] : [{ type: 'startGame' }] };
}

function GamePicker({
  games,
  selectedId,
  onSelect,
}: {
  games: readonly GameOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}): ReactNode {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {games.map((game) => {
        const sel = game.id === selectedId;
        return (
          <Button
            key={game.id}
            onClick={() => onSelect(game.id)}
            sx={{
              textTransform: 'none',
              textAlign: 'left',
              alignItems: 'flex-start',
              flexDirection: 'column',
              gap: 0.5,
              p: '15px 16px',
              color: tokens.color.ink,
              backgroundColor: tokens.color.card,
              border: `1px solid ${sel ? tokens.color.marker : '#e8dcc6'}`,
              borderRadius: `${tokens.radius.card}px`,
              boxShadow: sel
                ? `0 0 0 1px ${tokens.color.marker}, 1px 3px 6px rgba(43,38,32,.14)`
                : '1px 3px 6px rgba(43,38,32,.14)',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                gap: 1,
              }}
            >
              <Typography variant="h3" sx={{ fontSize: 20 }}>
                {game.name}
              </Typography>
              {sel ? (
                <Typography sx={{ color: tokens.color.marker, fontWeight: 800, fontSize: 14 }}>
                  ✓ selected
                </Typography>
              ) : null}
            </Box>
            <Typography sx={{ color: tokens.color.inkSoft, fontSize: 13.5 }}>
              {game.description}
            </Typography>
            <Typography
              sx={{
                fontFamily: tokens.font.mono,
                fontSize: 11.5,
                color: tokens.color.markerDeep,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {game.minPlayers}–{game.maxPlayers} players
            </Typography>
          </Button>
        );
      })}
    </Box>
  );
}

function Lobby({
  frame,
  onSelect,
}: { frame: ViewFrame; onSelect: (id: string) => void }): ReactNode {
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="h3" sx={{ fontSize: 20 }}>
          Choose tonight’s game
        </Typography>
        <Typography
          sx={{ fontFamily: tokens.font.mono, color: tokens.color.markerDeep, fontWeight: 700 }}
        >
          {frame.players.length} / 50 in the room
        </Typography>
      </Box>
      <GamePicker games={gameCatalog()} selectedId={frame.selectedGameId} onSelect={onSelect} />
      {frame.players.length > 0 ? (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
            gap: 1.25,
            mt: 2.5,
          }}
        >
          {frame.players.map((p) => (
            <NameTag key={p.id} name={p.nickname} color={playerColor(p.id, frame.players)} />
          ))}
        </Box>
      ) : null}
    </Box>
  );
}

export function HostScreen({
  transport,
  onExit,
}: { transport: Transport; onExit: () => void }): ReactNode {
  const { frame, reconnecting, recover } = useScreen(transport, onExit, 'Back to start');

  // A dead room (failed resume, closed room) recovers to the landing instead of a
  // stuck "Opening the room…" board.
  if (recover !== null) {
    return (
      <Board code="····">
        <Recover {...recover} />
      </Board>
    );
  }

  if (frame === null) {
    return (
      <Board code="····" hint={<>Opening the room…</>} reconnecting={reconnecting}>
        {null}
      </Board>
    );
  }
  const views = viewsFor(frame.selectedGameId);
  const control = hostControl(frame);
  const showLobby = frame.phase === 'LOBBY' || views === null;
  return (
    <Board
      code={frame.code}
      hint={<>Join at {joinHost()} · punch in the code</>}
      reconnecting={reconnecting}
    >
      {showLobby ? (
        <Lobby
          frame={frame}
          onSelect={(id) => transport.send({ type: 'selectGame', gameId: id })}
        />
      ) : (
        <views.Host view={frame.gameView} players={frame.players} />
      )}
      <Box sx={{ mt: 4 }}>
        <Button
          variant="contained"
          size="large"
          disabled={control.actions.length === 0}
          onClick={() => {
            for (const action of control.actions) {
              transport.send(action);
            }
          }}
        >
          {control.label}
        </Button>
      </Box>
    </Board>
  );
}
