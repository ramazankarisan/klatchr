import { ThemeProvider } from '@mui/material/styles';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { vi } from 'vitest';
import { FrameTransport } from '../frameTransport.testkit.js';
import { theme } from '../theme.js';
import type { ConnStatus, ViewFrame } from '../transport/types.js';
import { HostScreen } from './HostScreen.js';
import { PlayerScreen } from './PlayerScreen.js';

const frame = (over: Partial<ViewFrame>): ViewFrame => ({
  code: 'WXYZ',
  phase: 'LOBBY',
  viewer: { role: 'player', id: 'b' },
  players: [
    { id: 'a', nickname: 'Ada', spectator: false },
    { id: 'b', nickname: 'Dana', spectator: false },
    { id: 'c', nickname: 'Cyrus', spectator: false },
  ],
  selectedGameId: 'guess-who',
  gameView: null,
  scores: null,
  sessionScores: [],
  round: 0,
  roundsTotal: 0,
  ...over,
});

const withTheme = (node: ReactNode): ReactNode => (
  <ThemeProvider theme={theme}>{node}</ThemeProvider>
);

function renderPhone(
  f: ViewFrame,
  status: ConnStatus = 'live',
): { t: FrameTransport; onExit: ReturnType<typeof vi.fn> } {
  const t = new FrameTransport(f, status);
  const onExit = vi.fn();
  render(withTheme(<PlayerScreen transport={t} onExit={onExit} />));
  return { t, onExit };
}

/** The surface's polite phase region, by its role and what it says. */
const announced = (text: string): boolean =>
  screen.getAllByRole('status').some((el) => el.textContent === text);

describe('phone waiting room (UX-2)', () => {
  it('says you are in, with the game up next and how it plays', () => {
    renderPhone(frame({}));
    expect(
      screen.getByRole('heading', { name: 'You’re in! Waiting for the host to start.' }),
    ).toBeTruthy();
    const howTo = screen.getByRole('region', { name: 'How to play Guess Who Said It' });
    expect(within(howTo).getByText(/up next/i)).toBeTruthy();
    expect(within(howTo).getAllByRole('listitem')).toHaveLength(3);
  });

  it('says the host is picking when no game is chosen yet', () => {
    renderPhone(frame({ selectedGameId: null }));
    expect(screen.getByText('The host is picking a game.')).toBeTruthy();
    expect(screen.queryByRole('region', { name: /how to play/i })).toBeNull();
  });

  it('lists who is in the room, you marked, plus your name-tag and the lock-safe note', () => {
    renderPhone(frame({}));
    const room = screen.getByRole('region', { name: 'In the room' });
    expect(within(room).getByText('In the room (3)')).toBeTruthy();
    const names = within(room)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(names).toEqual(['Ada', 'Dana (you)', 'Cyrus']);
    expect(screen.getByText('Dana')).toBeTruthy(); // the name-tag
    expect(screen.getByText(/lock your phone; your seat waits 3 minutes/i)).toBeTruthy();
  });

  it('Leave room confirms, then sends leave and exits', async () => {
    const user = userEvent.setup();
    localStorage.setItem('klatchr:reconnect:WXYZ', 'tok');
    localStorage.setItem('klatchr:nick:WXYZ', 'Dana');
    const { t, onExit } = renderPhone(frame({}));
    await user.click(screen.getByRole('button', { name: 'Leave room' }));
    const dialog = screen.getByRole('dialog', { name: /leave the room/i });
    expect(t.sent).toEqual([]); // nothing until confirmed
    await user.click(within(dialog).getByRole('button', { name: 'Leave room' }));
    expect(t.sent).toEqual([{ type: 'leave' }]);
    expect(onExit).toHaveBeenCalledTimes(1);
    // The seat is given up: a later join with this code is fresh, not "resuming as Dana".
    expect(localStorage.getItem('klatchr:reconnect:WXYZ')).toBeNull();
    expect(localStorage.getItem('klatchr:nick:WXYZ')).toBeNull();
  });

  it('a leave on a link that is not live keeps the resume token, so the seat can be reclaimed', async () => {
    // The link dropped (say, after the confirm opened): the dimmed phone ignores pointer
    // checks here so the test can still drive the same buttons.
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    localStorage.setItem('klatchr:reconnect:WXYZ', 'tok');
    localStorage.setItem('klatchr:nick:WXYZ', 'Dana');
    const { t, onExit } = renderPhone(frame({}), 'reconnecting');
    await user.click(screen.getByRole('button', { name: 'Leave room' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Leave room' }),
    );
    expect(t.sent).toEqual([{ type: 'leave' }]); // queued — dispose will drop it
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('klatchr:reconnect:WXYZ')).toBe('tok');
    expect(localStorage.getItem('klatchr:nick:WXYZ')).toBe('Dana');
    localStorage.clear();
  });

  it('keeps the header: the room code on tape and the game label', () => {
    renderPhone(frame({}));
    expect(screen.getByLabelText('room code WXYZ')).toBeTruthy();
    expect(screen.getAllByText('Guess Who Said It').length).toBeGreaterThanOrEqual(2); // label + up next
  });

  it('cancelling the leave keeps your seat', async () => {
    const user = userEvent.setup();
    const { t, onExit } = renderPhone(frame({}));
    await user.click(screen.getByRole('button', { name: 'Leave room' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(t.sent).toEqual([]);
    expect(onExit).not.toHaveBeenCalled();
  });
});

describe('how to play on the TV lobby (UX-2)', () => {
  it('shows the picked game’s three steps beside the join hero', () => {
    render(
      withTheme(
        <HostScreen
          transport={new FrameTransport(frame({ viewer: { role: 'host' } }))}
          onExit={() => {}}
        />,
      ),
    );
    const card = screen.getByRole('region', { name: 'How to play Guess Who Said It' });
    expect(
      within(card).getByRole('heading', { name: /how to play · guess who said it/i }),
    ).toBeTruthy();
    expect(within(card).getAllByRole('listitem')).toHaveLength(3);
  });

  it('shows none before a game is picked', () => {
    render(
      withTheme(
        <HostScreen
          transport={new FrameTransport(frame({ viewer: { role: 'host' }, selectedGameId: null }))}
          onExit={() => {}}
        />,
      ),
    );
    expect(screen.queryByRole('region', { name: /how to play/i })).toBeNull();
  });
});

describe('phase announcements (UX-2)', () => {
  const collect = {
    phase: 'collect',
    prompt: 'A hill you’ll die on?',
    youSubmitted: false,
    youSkipped: false,
    submittedCount: 0,
    total: 3,
  };

  it('the phone announces the phase name, and the new one when it changes', () => {
    const { rerender } = render(
      withTheme(<PlayerScreen transport={new FrameTransport(frame({}))} onExit={() => {}} />),
    );
    expect(announced('Now: In the lobby')).toBe(true);
    const next = frame({ phase: 'IN_GAME', round: 1, gameView: collect });
    rerender(withTheme(<PlayerScreen transport={new FrameTransport(next)} onExit={() => {}} />));
    expect(announced('Now: Answering')).toBe(true);
    expect(announced('Now: In the lobby')).toBe(false);
  });

  it('the board announces the phase too', () => {
    const host = { viewer: { role: 'host' } as const, phase: 'IN_GAME' as const, round: 1 };
    const { rerender } = render(
      withTheme(
        <HostScreen
          transport={
            new FrameTransport(
              frame({
                ...host,
                selectedGameId: 'most-likely-to',
                gameView: { phase: 'vote', prompt: 'Q', voted: [], votedCount: 0, total: 3 },
              }),
            )
          }
          onExit={() => {}}
        />,
      ),
    );
    expect(announced('Now: Voting')).toBe(true);
    rerender(
      withTheme(
        <HostScreen
          transport={new FrameTransport(frame({ ...host, phase: 'SCORES' }))}
          onExit={() => {}}
        />,
      ),
    );
    expect(announced('Now: Standings')).toBe(true);
  });
});
