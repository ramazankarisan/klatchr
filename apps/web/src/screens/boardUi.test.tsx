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
  phase: 'SCORES',
  viewer: { role: 'host' },
  players: [
    { id: 'a', nickname: 'Ada', spectator: false },
    { id: 'b', nickname: 'Bo', spectator: false },
    { id: 'c', nickname: 'Cy', spectator: false },
  ],
  selectedGameId: 'guess-who',
  gameView: { phase: 'reveal', prompt: 'Done', cards: [], scores: [] },
  scores: [
    { playerId: 'a', points: 0 },
    { playerId: 'b', points: 2 },
    { playerId: 'c', points: 1 },
  ],
  sessionScores: [
    { playerId: 'a', points: 4 },
    { playerId: 'b', points: 5 },
    { playerId: 'c', points: 1 },
  ],
  round: 2,
  roundsTotal: 5,
  ...over,
});

const renderHost = (f: ViewFrame): FrameTransport => {
  const t = new FrameTransport(f);
  const node: ReactNode = (
    <ThemeProvider theme={theme}>
      <HostScreen transport={t} onExit={() => {}} />
    </ThemeProvider>
  );
  render(node);
  return t;
};

describe('round pill (UX-1)', () => {
  it('reads "Round N of M" while the round plays', () => {
    renderHost(frame({ phase: 'IN_GAME', gameView: null }));
    expect(screen.getByText('Round 2 of 5')).toBeTruthy();
  });

  it('reads "Round N of M · standings" on SCORES — never claims the round finished', () => {
    renderHost(frame({}));
    expect(screen.getByText('Round 2 of 5 · standings')).toBeTruthy();
  });

  it('reads "Round N · standings" when the session is unbounded', () => {
    renderHost(frame({ roundsTotal: 0 }));
    expect(screen.getByText('Round 2 · standings')).toBeTruthy();
  });

  it('reads "All N questions played" once the set is spent', () => {
    renderHost(frame({ round: 5 }));
    expect(screen.getByText('All 5 questions played')).toBeTruthy();
  });
});

describe('one ranked standings table (UX-1)', () => {
  it('ranks by total with this round alongside, — for nothing scored', () => {
    renderHost(frame({}));
    const table = screen.getByRole('table', { name: 'Standings so far' });
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
    expect(headers).toEqual(['#', 'Player', 'This round', 'Total']);
    const rows = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((r) =>
        within(r)
          .getAllByRole('cell')
          .map((c) => c.textContent),
      );
    expect(rows).toEqual([
      ['1', 'Bo', '+2', '5'],
      ['2', 'Ada', '—', '4'],
      ['3', 'Cy', '+1', '1'],
    ]);
  });

  it('highlights the leader row', () => {
    renderHost(frame({}));
    const [, leader] = within(screen.getByRole('table')).getAllByRole('row');
    expect(leader?.getAttribute('aria-current')).toBe('true');
  });

  it('ties share a rank (1, 1, 3) and every top-total leader is highlighted', () => {
    renderHost(
      frame({
        sessionScores: [
          { playerId: 'a', points: 5 },
          { playerId: 'b', points: 5 },
          { playerId: 'c', points: 1 },
        ],
      }),
    );
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    const ranks = rows.map((r) => within(r).getAllByRole('cell')[0]?.textContent);
    expect(ranks).toEqual(['1', '1', '3']);
    const leads = rows.map((r) => r.getAttribute('aria-current'));
    expect(leads).toEqual(['true', 'true', null]);
  });

  it('nobody leads on zero', () => {
    renderHost(frame({ scores: null, sessionScores: [{ playerId: 'a', points: 0 }] }));
    const [, row] = within(screen.getByRole('table')).getAllByRole('row');
    expect(row?.getAttribute('aria-current')).toBeNull();
  });

  it('is the only standings table — no second stacked list', () => {
    renderHost(frame({}));
    expect(screen.getAllByRole('table')).toHaveLength(1);
  });

  it('titles the spent set "Final standings"', () => {
    renderHost(frame({ round: 5 }));
    expect(screen.getByRole('table', { name: 'Final standings' })).toBeTruthy();
  });
});

describe('board chrome (UX-1)', () => {
  const paragraph =
    (text: string) =>
    (_: string, el: Element | null): boolean =>
      el?.tagName === 'P' && el.textContent === text;

  it('the lobby is code-first: the code on hero tape and a "Join at <host>/<CODE>" link', () => {
    renderHost(frame({ phase: 'LOBBY', round: 0, scores: null, sessionScores: [] }));
    expect(screen.getAllByLabelText('room code WXYZ')).toHaveLength(1);
    // UX-2: the /CODE link now opens the join form pre-filled, so the board shows it.
    expect(screen.getByText(paragraph(`Join at ${window.location.host}/WXYZ`))).toBeTruthy();
  });

  it('in play and on SCORES the corner keeps the code and a join line for latecomers', () => {
    renderHost(frame({ phase: 'IN_GAME', gameView: null }));
    expect(screen.getAllByLabelText('room code WXYZ')).toHaveLength(1);
    expect(screen.getByText(`join at ${window.location.host}/WXYZ`)).toBeTruthy();
  });

  it('Leave & close room is a corner control, outside the primary row, still confirmed', async () => {
    const user = userEvent.setup();
    const t = renderHost(frame({ phase: 'IN_GAME', gameView: null }));
    const leave = screen.getByRole('button', { name: 'Leave & close room…' });
    const endGame = screen.getByRole('button', { name: /end game/i });
    expect(leave.parentElement).not.toBe(endGame.parentElement); // not in the action row
    await user.click(leave);
    expect(t.sent).not.toContainEqual({ type: 'leave' }); // nothing until confirmed
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /close room/i }),
    );
    expect(t.sent).toContainEqual({ type: 'leave' });
  });
});
