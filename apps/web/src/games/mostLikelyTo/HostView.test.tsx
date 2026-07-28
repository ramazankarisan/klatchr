import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import { theme } from '../../theme.js';
import type { PublicPlayer } from '../../transport/types.js';
import { HostView } from './HostView.js';

const players: PublicPlayer[] = [
  { id: 'p1', nickname: 'Ada', spectator: false },
  { id: 'p2', nickname: 'Bo', spectator: false },
  { id: 'p3', nickname: 'Cy', spectator: false },
];

function renderHost(view: unknown): void {
  render(
    <ThemeProvider theme={theme}>
      <HostView view={view} players={players} />
    </ThemeProvider>,
  );
}

describe('vote board', () => {
  it('shows the count and who has voted — never a tally', () => {
    renderHost({
      phase: 'vote',
      prompt: 'Most likely to nap at their desk?',
      voted: ['p1', 'p2'],
      votedCount: 2,
      total: 3,
    });
    expect(screen.getByText(/2 of 3 voted/i)).toBeTruthy();
    expect(screen.getByText('Ada')).toBeTruthy(); // a voter's name-chip, no target
  });
});

describe('results board', () => {
  it('spotlights the winner and ranks the tally', () => {
    renderHost({
      phase: 'results',
      prompt: 'Most likely to nap at their desk?',
      tally: [
        { playerId: 'p2', points: 3 },
        { playerId: 'p1', points: 1 },
        { playerId: 'p3', points: 0 },
      ],
    });
    expect(screen.getByText('Most likely')).toBeTruthy(); // the winner stamp (exact — not the prompt)
    expect(screen.getByText(/3 votes/i)).toBeTruthy(); // winner's count
  });
});
