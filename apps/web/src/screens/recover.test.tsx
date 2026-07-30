import { ThemeProvider } from '@mui/material/styles';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { theme } from '../theme.js';
import type {
  Action,
  ConnStatus,
  Transport,
  TransportError,
  ViewFrame,
} from '../transport/types.js';
import { HostScreen } from './HostScreen.js';
import { PlayerScreen } from './PlayerScreen.js';

/** A transport that delivers a frame, then lets the test fire server errors. */
class FakeTransport implements Transport {
  private readonly errorCbs = new Set<(e: TransportError) => void>();
  constructor(private readonly frame: ViewFrame) {}
  subscribe(onFrame: (f: ViewFrame) => void): () => void {
    onFrame(this.frame);
    return () => {};
  }
  subscribeStatus(onStatus: (s: ConnStatus) => void): () => void {
    onStatus('live');
    return () => {};
  }
  subscribeError(onError: (e: TransportError) => void): () => void {
    this.errorCbs.add(onError);
    return () => {
      this.errorCbs.delete(onError);
    };
  }
  send(_action: Action): void {}
  fail(message: string): void {
    act(() => {
      for (const cb of this.errorCbs) cb({ code: 'WXYZ', message });
    });
  }
}

const lobby = (viewer: ViewFrame['viewer']): ViewFrame => ({
  code: 'WXYZ',
  phase: 'LOBBY',
  viewer,
  players: [],
  selectedGameId: null,
  gameView: null,
  scores: null,
});
const withTheme = (node: ReactNode): ReactNode => (
  <ThemeProvider theme={theme}>{node}</ThemeProvider>
);

describe('recover on a fatal error (8.1)', () => {
  it('player: a bad code shows a recover card and a way back (no endless spinner)', async () => {
    const user = userEvent.setup();
    const t = new FakeTransport(lobby({ role: 'player', id: 'p1' }));
    let exited = false;
    render(
      withTheme(
        <PlayerScreen
          transport={t}
          onExit={() => {
            exited = true;
          }}
        />,
      ),
    );
    t.fail('NO_SUCH_ROOM');
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText(/no room with that code/i)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /try another code/i }));
    expect(exited).toBe(true);
  });

  it('host: a closed room shows a recover card and a way back', async () => {
    const user = userEvent.setup();
    const t = new FakeTransport(lobby({ role: 'host' }));
    let exited = false;
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
    t.fail('ROOM_CLOSED');
    expect(screen.getByText(/room closed/i)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /back to start/i }));
    expect(exited).toBe(true);
  });

  it('a non-fatal in-game rejection does not take over the screen', () => {
    const t = new FakeTransport(lobby({ role: 'player', id: 'p1' }));
    render(withTheme(<PlayerScreen transport={t} onExit={() => {}} />));
    t.fail('GAME_REJECTED: WRONG_PHASE');
    expect(screen.queryByRole('alert')).toBeNull(); // still the normal screen
  });
});
