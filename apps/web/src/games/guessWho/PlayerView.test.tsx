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

function renderView(view: unknown): {
  onSubmit: ReturnType<typeof vi.fn>;
  onGuess: ReturnType<typeof vi.fn>;
} {
  const onSubmit = vi.fn();
  const onGuess = vi.fn();
  render(
    <ThemeProvider theme={theme}>
      <PlayerView view={view} players={players} youId="p1" onSubmit={onSubmit} onGuess={onGuess} />
    </ThemeProvider>,
  );
  return { onSubmit, onGuess };
}

describe('collect', () => {
  const collect = {
    phase: 'collect',
    prompt: 'A hill you’ll die on?',
    youSubmitted: false,
    submittedCount: 0,
    total: 3,
  };

  it('submits the typed answer via Tape it up', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderView(collect);
    await user.type(screen.getByLabelText(/your answer/i), 'Tacos');
    await user.click(screen.getByRole('button', { name: /tape it up/i }));
    expect(onSubmit).toHaveBeenCalledWith('Tacos');
  });

  it('disables the button until something is typed', () => {
    renderView(collect);
    expect(screen.getByRole('button', { name: /tape it up/i }).hasAttribute('disabled')).toBe(true);
  });

  it('shows a locked state once submitted', () => {
    renderView({ ...collect, youSubmitted: true });
    expect(screen.getByText(/answer taped up/i)).toBeTruthy();
    expect(screen.queryByLabelText(/your answer/i)).toBeNull();
  });
});

describe('guess', () => {
  const guess = {
    phase: 'guess',
    prompt: 'A hill you’ll die on?',
    cards: [
      { id: 'c0', text: 'Tabs, never spaces.' },
      { id: 'c1', text: 'Cereal is a soup.' },
    ],
    candidates: ['p1', 'p2', 'p3'],
    myGuesses: {},
    yourCardId: 'c1', // c1 is yours
  };

  it('marks your own card (by id) and never offers it for guessing', () => {
    renderView(guess);
    expect(screen.getByText(/your card/i)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /tap to name/i })).toHaveLength(1); // only c0
  });

  it('does not collide when another player answered the same text', () => {
    // c0 and c2 share text; only your own card (c0) is marked, the twin is guessable.
    renderView({
      ...guess,
      cards: [
        { id: 'c0', text: 'Pizza.' },
        { id: 'c2', text: 'Pizza.' },
      ],
      yourCardId: 'c0',
    });
    expect(screen.getAllByText(/your card/i)).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /tap to name/i })).toHaveLength(1);
  });

  it('opens the picker, excludes yourself, and guesses the chosen player', async () => {
    const user = userEvent.setup();
    const { onGuess } = renderView(guess);
    await user.click(screen.getByRole('button', { name: /tap to name/i }));
    expect(screen.queryByRole('button', { name: /^You$/ })).toBeNull(); // p1 excluded
    await user.click(screen.getByRole('button', { name: /marcus/i }));
    expect(onGuess).toHaveBeenCalledWith('c0', 'p2');
  });

  it('lets a placed guess be re-opened and changed', async () => {
    const user = userEvent.setup();
    const { onGuess } = renderView({ ...guess, myGuesses: { c0: 'p2' } });
    await user.click(screen.getByRole('button', { name: /marcus/i })); // the placed guess chip
    await user.click(screen.getByRole('button', { name: /lena/i })); // re-pick
    expect(onGuess).toHaveBeenCalledWith('c0', 'p3');
  });
});
