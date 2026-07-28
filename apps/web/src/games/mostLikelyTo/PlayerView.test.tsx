import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { theme } from '../../theme.js';
import type { PublicPlayer } from '../../transport/types.js';
import { PlayerView } from './PlayerView.js';

const players: PublicPlayer[] = [
  { id: 'p1', nickname: 'You', spectator: false },
  { id: 'p2', nickname: 'Marcus', spectator: false },
  { id: 'p3', nickname: 'Lena', spectator: false },
];

function renderView(view: unknown): { onEvent: ReturnType<typeof vi.fn> } {
  const onEvent = vi.fn();
  render(
    <ThemeProvider theme={theme}>
      <PlayerView view={view} players={players} youId="p1" onEvent={onEvent} />
    </ThemeProvider>,
  );
  return { onEvent };
}

describe('vote', () => {
  const vote = {
    phase: 'vote',
    prompt: 'Most likely to nap at their desk?',
    candidates: ['p1', 'p2', 'p3'],
    youVoted: false,
    votedCount: 0,
    total: 3,
  };

  it('votes for the tapped candidate', async () => {
    const user = userEvent.setup();
    const { onEvent } = renderView(vote);
    await user.click(screen.getByRole('button', { name: /marcus/i }));
    expect(onEvent).toHaveBeenCalledWith({ type: 'vote', target: 'p2' });
  });

  it('offers yourself as a candidate (self-vote allowed)', () => {
    renderView(vote);
    expect(screen.getByRole('button', { name: /^You$/ })).toBeTruthy();
  });

  it('reflects your own vote back', () => {
    renderView({ ...vote, youVoted: true, yourVote: 'p3' });
    expect(screen.getByText(/voted for lena/i)).toBeTruthy();
  });
});

describe('results', () => {
  const results = {
    phase: 'results',
    prompt: 'Most likely to nap at their desk?',
    tally: [
      { playerId: 'p2', points: 2 },
      { playerId: 'p1', points: 1 },
      { playerId: 'p3', points: 0 },
    ],
  };

  it('shows your received-vote count and the ranked tally', () => {
    renderView(results);
    expect(screen.getByText(/votes this round/i)).toBeTruthy();
    expect(screen.getByText('Marcus')).toBeTruthy();
    expect(screen.getByText('Lena')).toBeTruthy();
  });
});
