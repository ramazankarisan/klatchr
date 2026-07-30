import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { theme } from '../theme.js';
import type { Action, ConnStatus, Transport, ViewFrame } from '../transport/types.js';
import { HostScreen } from './HostScreen.js';
import { PlayerScreen } from './PlayerScreen.js';

/** A transport that delivers one frame and records what the screen sends. */
class FrameTransport implements Transport {
  readonly sent: Action[] = [];
  constructor(private readonly frame: ViewFrame) {}
  subscribe(onFrame: (f: ViewFrame) => void): () => void {
    onFrame(this.frame);
    return () => {};
  }
  subscribeStatus(onStatus: (s: ConnStatus) => void): () => void {
    onStatus('live');
    return () => {};
  }
  subscribeError(): () => void {
    return () => {};
  }
  send(action: Action): void {
    this.sent.push(action);
  }
}

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
});
