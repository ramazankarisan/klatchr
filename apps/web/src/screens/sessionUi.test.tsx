import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { FrameTransport } from '../frameTransport.testkit.js';
import { theme } from '../theme.js';
import type { ViewFrame } from '../transport/types.js';
import { HostScreen } from './HostScreen.js';
import { PlayerScreen } from './PlayerScreen.js';

const frame = (over: Partial<ViewFrame>): ViewFrame => ({
  code: 'WXYZ',
  phase: 'IN_GAME',
  viewer: { role: 'host' },
  players: [
    { id: 'a', nickname: 'Ada', spectator: false },
    { id: 'b', nickname: 'Bo', spectator: false },
  ],
  selectedGameId: 'guess-who',
  gameView: null,
  scores: null,
  sessionScores: [],
  round: 1,
  ...over,
});

const withTheme = (node: ReactNode): ReactNode => (
  <ThemeProvider theme={theme}>{node}</ThemeProvider>
);

describe('session UI — round, standings, and the host exits (10)', () => {
  it('shows a round counter on the board', () => {
    render(
      withTheme(
        <HostScreen transport={new FrameTransport(frame({ round: 3 }))} onExit={() => {}} />,
      ),
    );
    expect(screen.getByText(/round 3/i)).toBeTruthy();
  });

  it('offers "End game" mid-round and sends endGame', async () => {
    const user = userEvent.setup();
    const t = new FrameTransport(frame({ phase: 'IN_GAME' }));
    render(withTheme(<HostScreen transport={t} onExit={() => {}} />));
    await user.click(screen.getByRole('button', { name: /end game/i }));
    expect(t.sent).toContainEqual({ type: 'endGame' });
  });

  it('at the game-over screen shows cumulative standings + a way to change game', async () => {
    const user = userEvent.setup();
    const t = new FrameTransport(
      frame({
        phase: 'SCORES',
        round: 2,
        sessionScores: [
          { playerId: 'a', points: 7 },
          { playerId: 'b', points: 4 },
        ],
      }),
    );
    render(withTheme(<HostScreen transport={t} onExit={() => {}} />));
    expect(screen.getByText(/standings so far/i)).toBeTruthy();
    expect(screen.getByText(/game over · 2 rounds/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /new round/i })).toBeTruthy();
    // "Change game" re-opens the picker so the host can pick a different game.
    await user.click(screen.getByRole('button', { name: /change game/i }));
    expect(await screen.findByText(/choose tonight.s game/i)).toBeTruthy();
  });

  it('the player phone shows the round and its session rank', () => {
    const t = new FrameTransport(
      frame({
        phase: 'LOBBY',
        viewer: { role: 'player', id: 'b' },
        round: 2,
        sessionScores: [
          { playerId: 'a', points: 7 },
          { playerId: 'b', points: 4 },
        ],
      }),
    );
    render(withTheme(<PlayerScreen transport={t} onExit={() => {}} />));
    expect(screen.getByText(/round 2/i)).toBeTruthy();
    expect(screen.getByText(/#2 of 2/i)).toBeTruthy(); // b is second with 4 pts
  });

  it('B1 the player gets a game-over screen + overall standings at SCORES', () => {
    // Host aborted mid-round → SCORES with a stale gameView the game can't advance.
    const t = new FrameTransport(
      frame({
        phase: 'SCORES',
        viewer: { role: 'player', id: 'a' },
        selectedGameId: null, // no view registered → not terminal → the "wrap" branch
        round: 2,
        sessionScores: [
          { playerId: 'a', points: 7 },
          { playerId: 'b', points: 4 },
        ],
      }),
    );
    render(withTheme(<PlayerScreen transport={t} onExit={() => {}} />));
    expect(screen.getByText(/that.s a wrap/i)).toBeTruthy();
    expect(screen.getByText(/overall/i)).toBeTruthy(); // the cumulative standings
  });

  it('B6 a ghost score id (not on the roster) never shows on the board or rank', () => {
    // 2 players, but 3 score entries — the 3rd id 'ghost' left. No "(left)" row, count = 2.
    const t = new FrameTransport(
      frame({
        phase: 'SCORES',
        viewer: { role: 'player', id: 'b' },
        selectedGameId: null,
        round: 2,
        sessionScores: [
          { playerId: 'a', points: 7 },
          { playerId: 'b', points: 4 },
          { playerId: 'ghost-0123456789', points: 9 },
        ],
      }),
    );
    render(withTheme(<PlayerScreen transport={t} onExit={() => {}} />));
    expect(screen.queryByText(/ghost-0123456789/)).toBeNull(); // no raw id
    expect(screen.queryByText(/\(left\)/)).toBeNull(); // filtered, not labelled
    expect(screen.getByText(/#2 of 2/i)).toBeTruthy(); // ghost excluded from the count
  });

  it('B3 the host board shows the running game name in-game', () => {
    const t = new FrameTransport(frame({ phase: 'IN_GAME', gameView: { phase: 'collect' } }));
    render(withTheme(<HostScreen transport={t} onExit={() => {}} />));
    expect(screen.getByText('Guess Who Said It')).toBeTruthy(); // the game-name label
  });
});
