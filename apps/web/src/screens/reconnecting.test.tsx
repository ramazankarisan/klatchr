import { ThemeProvider } from '@mui/material/styles';
import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { theme } from '../theme.js';
import type { Action, ConnStatus, Transport, ViewFrame } from '../transport/types.js';
import { HostScreen } from './HostScreen.js';
import { PlayerScreen } from './PlayerScreen.js';

/** A transport whose connection status the test drives directly. */
class FakeTransport implements Transport {
  private readonly statusCbs = new Set<(s: ConnStatus) => void>();
  private status: ConnStatus = 'live';
  constructor(private readonly frame: ViewFrame) {}
  subscribe(onFrame: (f: ViewFrame) => void): () => void {
    onFrame(this.frame);
    return () => {};
  }
  subscribeStatus(onStatus: (s: ConnStatus) => void): () => void {
    this.statusCbs.add(onStatus);
    onStatus(this.status);
    return () => {
      this.statusCbs.delete(onStatus);
    };
  }
  subscribeError(): () => void {
    return () => {};
  }
  send(_action: Action): void {}
  drive(status: ConnStatus): void {
    this.status = status;
    act(() => {
      for (const cb of this.statusCbs) cb(status);
    });
  }
}

const lobby = (viewer: ViewFrame['viewer']): ViewFrame => ({
  code: 'WXYZ',
  phase: 'LOBBY',
  viewer,
  players: [{ id: 'p1', nickname: 'Ada', spectator: false }],
  selectedGameId: null,
  gameView: null,
  scores: null,
  sessionScores: [],
  round: 0,
});

const withTheme = (node: ReactNode): ReactNode => (
  <ThemeProvider theme={theme}>{node}</ThemeProvider>
);
const tape = () => screen.queryByText(/reconnecting/i);

describe('Reconnecting… indicator (7.2)', () => {
  it('shows the tape on the host board only while reconnecting, and clears on live', () => {
    const t = new FakeTransport(lobby({ role: 'host' }));
    render(withTheme(<HostScreen transport={t} onExit={() => {}} />));
    expect(tape()).toBeNull(); // live → no indicator

    t.drive('reconnecting');
    expect(tape()).toBeTruthy();
    expect(screen.getByRole('status')).toBeTruthy();

    t.drive('live');
    expect(tape()).toBeNull(); // heals → indicator gone
  });

  it('shows the tape on the player phone only while reconnecting', () => {
    const t = new FakeTransport(lobby({ role: 'player', id: 'p1' }));
    render(withTheme(<PlayerScreen transport={t} onExit={() => {}} />));
    expect(tape()).toBeNull();

    t.drive('reconnecting');
    expect(tape()).toBeTruthy();

    t.drive('live');
    expect(tape()).toBeNull();
  });
});
