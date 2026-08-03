import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { FrameTransport } from '../frameTransport.testkit.js';
import { theme } from '../theme.js';
import type { ViewFrame } from '../transport/types.js';
import { HostScreen } from './HostScreen.js';

const lobbyFrame = (over: Partial<ViewFrame> = {}): ViewFrame => ({
  code: 'WXYZ',
  phase: 'LOBBY',
  viewer: { role: 'host' },
  players: [
    { id: 'a', nickname: 'Ada', spectator: false },
    { id: 'b', nickname: 'Bo', spectator: false },
    { id: 'c', nickname: 'Cy', spectator: false },
  ],
  selectedGameId: 'guess-who',
  gameView: null,
  scores: null,
  sessionScores: [],
  round: 0,
  ...over,
});

const withTheme = (node: ReactNode): ReactNode => (
  <ThemeProvider theme={theme}>{node}</ThemeProvider>
);

describe('host customize questions (Cycle 11)', () => {
  it('A13 the default lobby uses the built-in bank behind a closed disclosure, Start still works', async () => {
    const user = userEvent.setup();
    const t = new FrameTransport(lobbyFrame());
    render(withTheme(<HostScreen transport={t} onExit={() => {}} />));
    expect(screen.getByText(/using the built-in question bank/i)).toBeTruthy();
    // The one-tap path is untouched: no config sent, Start fires straight away.
    await user.click(screen.getByRole('button', { name: /start the round/i }));
    expect(t.sent).toContainEqual({ type: 'startGame' });
    expect(t.sent.some((a) => a.type === 'configureGame')).toBe(false);
  });

  it('A12 opening customize and pouring in a pack sends configureGame with the list', async () => {
    const user = userEvent.setup();
    const t = new FrameTransport(lobbyFrame());
    render(withTheme(<HostScreen transport={t} onExit={() => {}} />));
    await user.click(screen.getByRole('button', { name: /customize/i }));
    await user.click(screen.getByRole('button', { name: /work-safe/i }));
    const cfg = t.sent.find((a) => a.type === 'configureGame');
    expect(cfg).toBeTruthy();
    if (cfg?.type !== 'configureGame') {
      throw new Error('expected a configureGame action');
    }
    // The pack's questions crossed as the opaque config, non-empty.
    expect(cfg.config).toEqual({ prompts: expect.arrayContaining([expect.any(String)]) });
  });
});
