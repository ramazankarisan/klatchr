import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import { theme } from '../../theme.js';
import type { PublicPlayer } from '../../transport/types.js';
import { HostView } from './HostView.js';

const players: PublicPlayer[] = [
  { id: 'p1', nickname: 'Priya', spectator: false },
  { id: 'p2', nickname: 'Lena', spectator: false },
];

function renderHost(view: unknown): void {
  render(
    <ThemeProvider theme={theme}>
      <HostView view={view} players={players} />
    </ThemeProvider>,
  );
}

describe('host reveal standings', () => {
  const reveal = {
    phase: 'reveal',
    prompt: 'A hill you’ll die on?',
    cards: [{ id: 'c0', text: 'Tabs, never spaces.', authorId: 'p2' }],
    scores: [
      { playerId: 'p1', points: 2 },
      { playerId: 'p2', points: 5 },
    ],
  };

  it('shows a round-tally scoreboard ranked by points', () => {
    renderHost(reveal);
    expect(screen.getByText(/standings/i)).toBeTruthy();
    expect(screen.getByText('+5')).toBeTruthy();
    expect(screen.getByText('+2')).toBeTruthy();
  });

  it('ranks the higher score first', () => {
    renderHost(reveal);
    // +N text appears only in the standings, so document order is rank order.
    const rows = screen.getAllByText(/^\+\d+$/).map((el) => el.textContent);
    expect(rows).toEqual(['+5', '+2']); // Lena (5) before Priya (2)
  });
});
