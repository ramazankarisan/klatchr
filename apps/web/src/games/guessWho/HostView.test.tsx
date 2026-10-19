import { ThemeProvider } from '@mui/material/styles';
import { render, screen, within } from '@testing-library/react';
import { theme } from '../../theme.js';
import type { PublicPlayer } from '../../transport/types.js';
import { HostView } from './HostView.js';

const players: PublicPlayer[] = [
  { id: 'p1', nickname: 'Priya', spectator: false },
  { id: 'p2', nickname: 'Lena', spectator: false },
  { id: 'p3', nickname: 'Omar', spectator: true }, // joined mid-round — not waited on
];

function renderHost(view: unknown): void {
  render(
    <ThemeProvider theme={theme}>
      <HostView view={view} players={players} />
    </ThemeProvider>,
  );
}

describe('host collect progress (UX-1)', () => {
  const collect = {
    phase: 'collect',
    prompt: 'A hill you’ll die on?',
    submitted: ['p1'],
    submittedCount: 1,
    total: 2,
  };

  it('shows the count and a progress bar', () => {
    renderHost(collect);
    expect(screen.getByText('1 of 2 answered')).toBeTruthy();
    const bar = screen.getByRole('progressbar', { name: '1 of 2 answered' });
    expect(bar.getAttribute('aria-valuenow')).toBe('1');
    expect(bar.getAttribute('aria-valuemax')).toBe('2');
  });

  it('names who has answered and who is still thinking — seated players only', () => {
    renderHost(collect);
    expect(screen.getByText('Priya')).toBeTruthy(); // answered (✓ chip)
    expect(screen.getByText('Lena')).toBeTruthy(); // waiting chip…
    expect(screen.getAllByText('thinking…')).toHaveLength(1); // …only Lena is still going
    expect(screen.queryByText('Omar')).toBeNull(); // a spectator is not waited on
  });
});

describe('host progress is derived and defensive (UX-1)', () => {
  it('derives count and total from the seated ids, so label, bar and chips agree', () => {
    // A stale count and an id that is not seated (the spectator) must not skew the line.
    renderHost({
      phase: 'collect',
      prompt: 'Q?',
      submitted: ['p1', 'p3'],
      submittedCount: 9,
      total: 9,
    });
    expect(screen.getByText('1 of 2 answered')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('1');
  });

  it('reads an off-shape view (lists missing or not lists) as nobody yet — never throws', () => {
    renderHost({ phase: 'collect', prompt: 'Q?' });
    expect(screen.getByText('0 of 2 answered')).toBeTruthy();
    expect(screen.getAllByText('thinking…')).toHaveLength(2);
  });

  it('ignores a non-list guessed field', () => {
    renderHost({ phase: 'guess', prompt: 'Q?', cards: [], candidates: [], guessed: 'p1' });
    expect(screen.getByText('0 of 2 have guessed')).toBeTruthy();
  });
});

describe('host guess progress (UX-1)', () => {
  const guess = {
    phase: 'guess',
    prompt: 'A hill you’ll die on?',
    cards: [
      { id: 'c0', text: 'Tabs, never spaces.' },
      { id: 'c1', text: 'Pineapple on pizza.' },
    ],
    candidates: ['p1', 'p2'],
    guessed: ['p2'],
  };

  it('counts who has guessed, with a chip per seated player', () => {
    renderHost(guess);
    expect(screen.getByText('1 of 2 have guessed')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: '1 of 2 have guessed' })).toBeTruthy();
    expect(screen.getAllByText('thinking…')).toHaveLength(1); // Priya has not guessed yet
  });

  it('keeps names off the answer cards — the chips say who acted, never who wrote what', () => {
    renderHost(guess);
    const cards = screen.getByRole('list', { name: 'Answer cards' });
    expect(within(cards).getAllByRole('listitem')).toHaveLength(2);
    expect(within(cards).queryByText('Priya')).toBeNull();
    expect(within(cards).queryByText('Lena')).toBeNull();
  });
});

describe('host reveal', () => {
  it('stamps each card with its author; the standings table lives on the platform board', () => {
    renderHost({
      phase: 'reveal',
      prompt: 'A hill you’ll die on?',
      cards: [{ id: 'c0', text: 'Tabs, never spaces.', authorId: 'p2' }],
      scores: [
        { playerId: 'p1', points: 2 },
        { playerId: 'p2', points: 5 },
      ],
    });
    const cards = screen.getByRole('list', { name: 'Answer cards' });
    expect(within(cards).getByText('Lena')).toBeTruthy();
    expect(within(cards).getByText('Said it')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull(); // no second, game-level scoreboard
  });
});
