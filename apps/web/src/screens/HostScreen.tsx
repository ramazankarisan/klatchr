import { Box, Button, Typography } from '@mui/material';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { Board, tvType } from '../components/board.js';
import { ConfirmDialog, confirmDialogFor } from '../components/confirmDialog.js';
import { Recover } from '../components/paper.js';
import { RoundStandings } from '../components/standings.js';
import { gameCatalog, viewsFor } from '../games/registry.js';
import { GameLabel } from '../games/viewKit.js';
import { tokens } from '../tokens.js';
import type { Action, Transport, ViewFrame } from '../transport/types.js';
import { useScreen } from '../useScreen.js';
import { CustomizeQuestions } from './customizeQuestions.js';
import { Lobby } from './hostLobby.js';
import { LeaveControl, RoundPill, joinHost } from './hostParts.js';

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

// Board-scale buttons (UX-1): the primary is a markerDeep pill (theme), the rest outlined.
const bigButton = {
  fontSize: tvType.button,
  minHeight: 'clamp(52px, 4.4vw, 76px)',
  px: 'clamp(24px, 2.6vw, 48px)',
  borderRadius: 999,
} as const;

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
      // Code-first only in the real lobby; in-game the code sits small in the corner.
      joinHost={joinHost()}
      codeFirst={frame.phase === 'LOBBY'}
      badge={
        frame.round > 0 ? (
          <RoundPill
            round={frame.round}
            total={frame.roundsTotal}
            over={over}
            exhausted={exhausted}
          />
        ) : undefined
      }
      corner={<LeaveControl onLeave={() => setConfirm('leave')} />}
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
      {over && !picking ? (
        <Box sx={{ mt: 'clamp(24px, 3vw, 48px)' }}>
          <RoundStandings
            round={frame.scores}
            session={frame.sessionScores}
            players={frame.players}
            title={exhausted ? 'Final standings' : 'Standings so far'}
          />
        </Box>
      ) : null}
      <Box
        sx={{
          mt: 'clamp(28px, 3.4vw, 56px)',
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          flexWrap: 'wrap',
        }}
      >
        {gameOver ? null : (
          <Button
            variant="contained"
            size="large"
            sx={bigButton}
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
            sx={bigButton}
            onClick={() => setConfirm('change')}
          >
            Change game
          </Button>
        ) : null}
        {frame.phase === 'IN_GAME' ? (
          <Button
            variant="outlined"
            size="large"
            color="inherit"
            sx={bigButton}
            onClick={() => setConfirm('end')}
          >
            End game
          </Button>
        ) : null}
        {hint !== null ? (
          <Typography sx={{ color: tokens.color.inkSoft, fontSize: tvType.body }}>
            {hint}
          </Typography>
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
