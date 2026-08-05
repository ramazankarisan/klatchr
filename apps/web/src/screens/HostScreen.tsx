import { Box, Button, Typography } from '@mui/material';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { ConfirmDialog, confirmDialogFor } from '../components/confirmDialog.js';
import { Board, Recover } from '../components/paper.js';
import { SessionStandings } from '../components/standings.js';
import { type GameOption, gameCatalog, viewsFor } from '../games/registry.js';
import { GameLabel } from '../games/viewKit.js';
import { playerColor, tokens } from '../tokens.js';
import type { Action, Transport, ViewFrame } from '../transport/types.js';
import { useScreen } from '../useScreen.js';
import { CustomizeQuestions } from './customizeQuestions.js';

/** A small round-counter pill for the board header (S6). */
function RoundPill({
  round,
  over,
  exhausted,
}: { round: number; over: boolean; exhausted: boolean }): ReactNode {
  const label = !over
    ? `Round ${round}`
    : exhausted
      ? `All ${round} ${round === 1 ? 'question' : 'questions'} played`
      : `Game over · ${round} ${round === 1 ? 'round' : 'rounds'}`;
  return (
    <Box
      component="span"
      sx={{
        fontFamily: tokens.font.mono,
        fontSize: { xs: 12, md: 14 },
        fontWeight: 700,
        color: tokens.color.markerDeep,
        backgroundColor: '#f4e7d5',
        border: '1px solid #e6d6bd',
        borderRadius: 999,
        px: 1.5,
        py: 0.5,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </Box>
  );
}

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
  if (frame.phase === 'IN_GAME') {
    // Mid-round: the game's own advance step (never terminal here — the terminal
    // phase flips the room to SCORES). Only IN_GAME, so an aborted SCORES (gameState
    // left mid-round) never surfaces a stale "Show the results" that the server rejects (B5).
    const step = gameId === null ? null : (viewsFor(gameId)?.hostStep(frame.gameView) ?? null);
    if (step !== null && step.advance !== null) {
      return { label: step.label, actions: [{ type: 'gameEvent', event: step.advance }] };
    }
  }
  // SCORES (natural finish or host abort): run it back with the same game.
  return { label: 'New round', actions: gameId === null ? [] : [{ type: 'startGame' }] };
}

/** Why "Start the round" is disabled in the lobby (8.2) — no game picked, or too few
 * players for the picked game — so the host isn't left tapping a dead button. Null when
 * ready, or not in the lobby (the control speaks for itself elsewhere). */
function startHint(frame: ViewFrame): string | null {
  if (frame.phase !== 'LOBBY') {
    return null;
  }
  const game = gameCatalog().find((g) => g.id === frame.selectedGameId);
  if (game === undefined) {
    return 'Pick a game to begin.';
  }
  const need = game.minPlayers - frame.players.length;
  return need > 0
    ? `Need ${need} more ${need === 1 ? 'player' : 'players'} (min ${game.minPlayers}).`
    : null;
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
  // Cap comes from the picked game (8.2) — never a hardcoded 50. Over the seat cap
  // it reads seats-vs-waiting (X2), not a nonsensical "15 / 12".
  const game = gameCatalog().find((g) => g.id === frame.selectedGameId);
  const n = frame.players.length;
  const roster =
    game === undefined
      ? `${n} in the room`
      : n > game.maxPlayers
        ? `${game.maxPlayers} playing · ${n - game.maxPlayers} waiting`
        : `${n} / ${game.maxPlayers} in the room`;
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="h3" sx={{ fontSize: 20 }}>
          Choose tonight’s game
        </Typography>
        <Typography
          sx={{ fontFamily: tokens.font.mono, color: tokens.color.markerDeep, fontWeight: 700 }}
        >
          {roster}
        </Typography>
      </Box>
      <GamePicker games={gameCatalog()} selectedId={frame.selectedGameId} onSelect={onSelect} />
      {frame.players.length > 0 ? (
        // Compact chips, not big tiles — reads at 50 (plan-9 §F2). Waiting players dimmed.
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 2.5 }}>
          {frame.players.map((p) => (
            <Box
              key={p.id}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                fontSize: 13,
                fontWeight: 600,
                backgroundColor: tokens.color.card,
                border: '1px solid #eaddc6',
                borderRadius: 999,
                px: 1.25,
                py: 0.5,
                opacity: p.spectator ? 0.5 : 1,
              }}
            >
              <Box
                component="span"
                sx={{
                  width: 11,
                  height: 11,
                  borderRadius: '50%',
                  backgroundColor: playerColor(p.id, frame.players),
                }}
              />
              {p.nickname}
              {p.spectator ? ' · waiting' : ''}
            </Box>
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
  // "Change game" re-opens the picker at the game-over screen; forget it once we leave.
  const [picking, setPicking] = useState(false);
  // F7: a confirm dialog gates the destructive host actions (end / change / leave).
  const [confirm, setConfirm] = useState<'end' | 'change' | 'leave' | null>(null);
  // F3: the editor reports "open with an empty list" so Start can be blocked.
  const [customizeBlocked, setCustomizeBlocked] = useState(false);
  const onCustomizeBlocked = useCallback((blocked: boolean) => setCustomizeBlocked(blocked), []);
  const phase = frame?.phase;
  useEffect(() => {
    if (phase !== 'SCORES') {
      setPicking(false);
    }
  }, [phase]);

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
  const send = (action: Action): void => transport.send(action);
  const over = frame.phase === 'SCORES'; // the round finished — game-over screen
  // F4: a set is the session — once the questions are spent (round has reached roundsTotal)
  // the game is over: no "New round", just the standings and the exits.
  const exhausted = over && frame.roundsTotal > 0 && frame.round >= frame.roundsTotal;
  const showPicker = frame.phase === 'LOBBY' || picking || views === null;
  // While the picker is open (incl. "Change game" at SCORES) the primary control is
  // a lobby "Start the round" for the (re)picked game — not the old game's step (B5).
  const controlFrame = showPicker ? { ...frame, phase: 'LOBBY' as const } : frame;
  const control = hostControl(controlFrame);
  // The dedicated game-over screen (the set is spent and we're not re-picking) drops the
  // primary control entirely; opening the picker ("Change game") brings a re-pick Start back.
  const gameOver = exhausted && !showPicker;
  // F3: Start is blocked while Customize is open with an empty list; after a spent set the
  // picker prompts a re-pick to start a fresh session. The most specific hint wins.
  const hint = customizeBlocked
    ? 'Add a question, or close Customize to use the built-in set.'
    : exhausted && showPicker
      ? 'Pick a game to play again.'
      : startHint(controlFrame);
  const gameName = gameCatalog().find((g) => g.id === frame.selectedGameId)?.name;
  const confirmProps = confirmDialogFor(confirm, frame.code, {
    end: () => send({ type: 'endGame' }),
    change: () => setPicking(true),
    leave: () => {
      send({ type: 'leave' });
      onExit();
    },
  });
  return (
    <Board
      code={frame.code}
      hint={<>Join at {joinHost()} · punch in the code</>}
      badge={
        frame.round > 0 ? (
          <RoundPill round={frame.round} over={over} exhausted={exhausted} />
        ) : undefined
      }
      reconnecting={reconnecting}
    >
      {showPicker ? (
        <>
          <Lobby frame={frame} onSelect={(id) => send({ type: 'selectGame', gameId: id })} />
          {views?.packs !== undefined && frame.selectedGameId !== null ? (
            <CustomizeQuestions
              key={frame.selectedGameId}
              code={frame.code}
              gameId={frame.selectedGameId}
              packs={views.packs}
              onConfigure={(next) => send({ type: 'configureGame', config: { prompts: next } })}
              onBlockedChange={onCustomizeBlocked}
            />
          ) : null}
        </>
      ) : (
        <Box>
          <Box sx={{ mb: 1 }}>
            <GameLabel name={gameName} />
          </Box>
          <views.Host view={frame.gameView} players={frame.players} />
        </Box>
      )}
      {over && !picking && frame.sessionScores.length > 0 ? (
        <Box sx={{ mt: 3 }}>
          <SessionStandings scores={frame.sessionScores} players={frame.players} />
        </Box>
      ) : null}
      <Box sx={{ mt: 4, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        {gameOver ? null : (
          <Button
            variant="contained"
            size="large"
            disabled={control.actions.length === 0 || customizeBlocked || (exhausted && showPicker)}
            onClick={() => {
              for (const action of control.actions) {
                send(action);
              }
            }}
          >
            {control.label}
          </Button>
        )}
        {over && !picking ? (
          <Button
            variant="outlined"
            size="large"
            color="inherit"
            onClick={() => setConfirm('change')}
          >
            Change game
          </Button>
        ) : null}
        {frame.phase === 'IN_GAME' ? (
          <Button variant="text" size="large" color="inherit" onClick={() => setConfirm('end')}>
            End game
          </Button>
        ) : null}
        <Button
          variant="text"
          size="large"
          color="error"
          onClick={() => setConfirm('leave')}
          sx={{ ml: { sm: 'auto' } }}
        >
          Leave &amp; close room
        </Button>
        {hint !== null ? (
          <Typography sx={{ color: tokens.color.inkSoft, fontSize: 15 }}>{hint}</Typography>
        ) : null}
      </Box>
      {confirmProps !== null ? (
        <ConfirmDialog
          open
          title={confirmProps.title}
          body={confirmProps.body}
          confirmLabel={confirmProps.confirmLabel}
          danger={confirmProps.danger}
          onConfirm={() => {
            setConfirm(null);
            confirmProps.action();
          }}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
    </Board>
  );
}
