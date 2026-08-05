import { ThemeProvider } from '@mui/material/styles';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { FrameTransport } from '../frameTransport.testkit.js';
import { theme } from '../theme.js';
import type { ViewFrame } from '../transport/types.js';
import { HostScreen } from './HostScreen.js';

const frame = (over: Partial<ViewFrame>): ViewFrame => ({
  code: 'WXYZ',
  phase: 'IN_GAME',
  viewer: { role: 'host' },
  players: [
    { id: 'a', nickname: 'Ada', spectator: false },
    { id: 'b', nickname: 'Bo', spectator: false },
    { id: 'c', nickname: 'Cy', spectator: false },
  ],
  selectedGameId: 'guess-who',
  gameView: { phase: 'reveal', prompt: 'Done', cards: [], scores: [] },
  scores: null,
  sessionScores: [{ playerId: 'a', points: 5 }],
  round: 1,
  roundsTotal: 3,
  ...over,
});

const withTheme = (node: ReactNode): ReactNode => (
  <ThemeProvider theme={theme}>{node}</ThemeProvider>
);

describe('host game-over when the question set is spent (F4)', () => {
  it('A10 the last question ends the game — no "New round", the pill + exits instead', () => {
    const t = new FrameTransport(frame({ phase: 'SCORES', round: 3, roundsTotal: 3 }));
    render(withTheme(<HostScreen transport={t} onExit={() => {}} />));
    expect(screen.getByText(/all 3 questions played/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /new round/i })).toBeNull(); // the set is spent
    expect(screen.getByRole('button', { name: /change game/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /leave & close room/i })).toBeTruthy();
  });

  it('still offers "New round" mid-session (round below roundsTotal)', () => {
    const t = new FrameTransport(frame({ phase: 'SCORES', round: 1, roundsTotal: 3 }));
    render(withTheme(<HostScreen transport={t} onExit={() => {}} />));
    expect(screen.getByRole('button', { name: /new round/i })).toBeTruthy();
  });

  it('F4.2 "Change game" at game-over restores a Start affordance (not stuck)', async () => {
    const user = userEvent.setup();
    const t = new FrameTransport(frame({ phase: 'SCORES', round: 3, roundsTotal: 3 }));
    render(withTheme(<HostScreen transport={t} onExit={() => {}} />));
    await user.click(screen.getByRole('button', { name: /change game/i }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /change game/i }),
    );
    // The picker is open with a Start button again — disabled + a re-pick hint, not absent.
    expect(screen.getByText(/choose tonight.s game/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /start the round/i }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(screen.getByText(/pick a game to play again/i)).toBeTruthy();
  });
});

describe('host leave + confirm dialogs (F6/F7)', () => {
  it('A12 Leave & close room confirms, then sends leave and exits to the landing', async () => {
    const user = userEvent.setup();
    let exited = false;
    const t = new FrameTransport(frame({}));
    render(
      withTheme(
        <HostScreen
          transport={t}
          onExit={() => {
            exited = true;
          }}
        />,
      ),
    );
    await user.click(screen.getByRole('button', { name: /leave & close room/i }));
    expect(screen.getByText(/close the room\?/i)).toBeTruthy();
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /close room/i }),
    );
    expect(t.sent).toContainEqual({ type: 'leave' });
    expect(exited).toBe(true);
  });

  it('A11 canceling a confirm does nothing', async () => {
    const user = userEvent.setup();
    const t = new FrameTransport(frame({ phase: 'IN_GAME' }));
    render(withTheme(<HostScreen transport={t} onExit={() => {}} />));
    await user.click(screen.getByRole('button', { name: /end game/i }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /cancel/i }));
    expect(t.sent).not.toContainEqual({ type: 'endGame' });
    expect(screen.queryByRole('dialog')).toBeNull(); // dialog closed
  });
});
