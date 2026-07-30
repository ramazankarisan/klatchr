import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { theme } from '../theme.js';
import type { Action, ConnStatus, Transport, ViewFrame } from '../transport/types.js';
import { HostScreen } from './HostScreen.js';
import { PlayerScreen } from './PlayerScreen.js';

/** A transport that delivers one fixed frame — enough to render a screen's copy. */
class FrameTransport implements Transport {
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
  send(_action: Action): void {}
}

const players = (n: number): ViewFrame['players'] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, nickname: `P${i}`, spectator: false }));

const hostLobby = (over: Partial<ViewFrame>): ViewFrame => ({
  code: 'WXYZ',
  phase: 'LOBBY',
  viewer: { role: 'host' },
  players: [],
  selectedGameId: null,
  gameView: null,
  scores: null,
  sessionScores: [],
  round: 0,
  ...over,
});

const withTheme = (node: ReactNode): ReactNode => (
  <ThemeProvider theme={theme}>{node}</ThemeProvider>
);
const renderHost = (frame: ViewFrame): void => {
  render(withTheme(<HostScreen transport={new FrameTransport(frame)} onExit={() => {}} />));
};

describe('capacity copy from the picked game, never a hardcoded number (8.2)', () => {
  it('host roster shows the count over the game maxPlayers once a game is picked', () => {
    renderHost(hostLobby({ selectedGameId: 'guess-who', players: players(4) }));
    expect(screen.getByText(/4 \/ 12 in the room/i)).toBeTruthy();
  });

  it('host roster is just the count before a game is picked (no cap invented)', () => {
    renderHost(hostLobby({ players: players(4) }));
    expect(screen.getByText(/^4 in the room$/i)).toBeTruthy();
  });

  it('player spectator seat count comes from the running game', () => {
    const frame: ViewFrame = {
      code: 'WXYZ',
      phase: 'IN_GAME',
      viewer: { role: 'player', id: 'spec' },
      players: [...players(12), { id: 'spec', nickname: 'Late', spectator: true }],
      selectedGameId: 'guess-who',
      gameView: null,
      scores: null,
      sessionScores: [],
      round: 0,
    };
    render(withTheme(<PlayerScreen transport={new FrameTransport(frame)} onExit={() => {}} />));
    expect(screen.getByText(/this round is full \(12 seats\)/i)).toBeTruthy();
  });
});

describe('the disabled "Start the round" says why (8.2)', () => {
  it('no game picked → prompts to pick one, and Start is disabled', () => {
    renderHost(hostLobby({ players: players(4) }));
    expect(screen.getByText(/pick a game to begin/i)).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: /start the round/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('too few players → names how many more are needed, and Start is disabled', () => {
    renderHost(hostLobby({ selectedGameId: 'guess-who', players: players(1) }));
    expect(screen.getByText(/need 2 more players \(min 3\)/i)).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: /start the round/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('enough players → no hint, Start is enabled', () => {
    renderHost(hostLobby({ selectedGameId: 'guess-who', players: players(3) }));
    expect(screen.queryByText(/pick a game|need \d+ more/i)).toBeNull();
    expect(
      (screen.getByRole('button', { name: /start the round/i }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });
});

describe('one h1 per screen (8.2 a11y)', () => {
  it('the host board has exactly one level-1 heading', () => {
    renderHost(hostLobby({ selectedGameId: 'guess-who', players: players(3) }));
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('the player phone has exactly one level-1 heading', () => {
    const frame = hostLobby({ viewer: { role: 'player', id: 'p0' }, players: players(1) });
    render(withTheme(<PlayerScreen transport={new FrameTransport(frame)} onExit={() => {}} />));
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});
