import type { PromptPack } from '@klatchr/games';
import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { theme } from '../theme.js';
import { PromptSetEditor, reorderByText } from './PromptSetEditor.js';

const PACKS: readonly PromptPack[] = [
  { id: 'p1', name: 'Warmups', prompts: ['Q one?', 'Q two?'] },
  { id: 'p2', name: 'Deep', prompts: ['Q two?', 'Q three?'] }, // shares 'Q two?' → deduped on append
];

const withTheme = (node: ReactNode): ReactNode => (
  <ThemeProvider theme={theme}>{node}</ThemeProvider>
);

describe('reorderByText (A8) — drag result', () => {
  const items = [
    { text: 'a', source: 'x' },
    { text: 'b', source: 'x' },
    { text: 'c', source: 'x' },
  ];
  it('moves the dragged row to where it was dropped', () => {
    expect(reorderByText(items, 'a', 'c').map((i) => i.text)).toEqual(['b', 'c', 'a']);
    expect(reorderByText(items, 'c', 'a').map((i) => i.text)).toEqual(['c', 'a', 'b']);
  });
  it('is a no-op copy when an id is not in the list', () => {
    expect(reorderByText(items, 'zzz', 'a').map((i) => i.text)).toEqual(['a', 'b', 'c']);
  });
});

describe('PromptSetEditor (Cycle 11)', () => {
  it('A10 pours a pack into the list, deduping across packs and marking a full pack added', async () => {
    const user = userEvent.setup();
    const changes: string[][] = [];
    render(withTheme(<PromptSetEditor packs={PACKS} onChange={(p) => changes.push(p)} />));

    await user.click(screen.getByRole('button', { name: /warmups/i }));
    expect(screen.getByText('Q one?')).toBeTruthy();
    expect(changes.at(-1)).toEqual(['Q one?', 'Q two?']);
    expect(screen.getByRole('button', { name: /warmups/i }).textContent).toContain('✓'); // marked added

    // Deep shares 'Q two?' with Warmups — only the genuinely new question is appended.
    await user.click(screen.getByRole('button', { name: /deep/i }));
    expect(changes.at(-1)).toEqual(['Q one?', 'Q two?', 'Q three?']);

    // F1/A7: re-tapping a fully-added pack toggles it OFF — its questions leave the list.
    await user.click(screen.getByRole('button', { name: /warmups/i }));
    expect(changes.at(-1)).toEqual(['Q three?']); // Q one? / Q two? (Warmups) removed
    expect(screen.queryByText('Q one?')).toBeNull();
  });

  it('A11 deletes a row and appends a custom question', async () => {
    const user = userEvent.setup();
    const changes: string[][] = [];
    render(withTheme(<PromptSetEditor packs={PACKS} onChange={(p) => changes.push(p)} />));

    await user.click(screen.getByRole('button', { name: /warmups/i })); // Q one?, Q two?
    await user.click(screen.getByRole('button', { name: /remove .*Q one/i }));
    expect(changes.at(-1)).toEqual(['Q two?']);
    expect(screen.queryByText('Q one?')).toBeNull();

    await user.type(screen.getByLabelText(/type a question of your own/i), 'My own?');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(changes.at(-1)).toEqual(['Q two?', 'My own?']);
    expect(screen.getByText('My own?')).toBeTruthy();
  });

  it('F1 rehydrates from an initial list and appends to it (no replace)', async () => {
    const user = userEvent.setup();
    const changes: string[][] = [];
    render(
      withTheme(
        <PromptSetEditor
          packs={PACKS}
          initial={['Kept one?', 'Kept two?']}
          onChange={(p) => changes.push(p)}
        />,
      ),
    );
    expect(screen.getByText('Kept one?')).toBeTruthy();
    expect(screen.getByText('Kept two?')).toBeTruthy();
    await user.type(screen.getByLabelText(/type a question of your own/i), 'New three?');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    // The seeded list is extended, not overwritten.
    expect(changes.at(-1)).toEqual(['Kept one?', 'Kept two?', 'New three?']);
  });
});
