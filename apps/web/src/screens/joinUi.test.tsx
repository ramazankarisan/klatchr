import { ThemeProvider } from '@mui/material/styles';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App.js';
import { theme } from '../theme.js';

// No VITE_WS_URL in tests → the mock transport, so a join lands in a mock phone lobby.
function openAt(url: string): void {
  window.history.replaceState(null, '', url);
  render(
    <ThemeProvider theme={theme}>
      <App />
    </ThemeProvider>,
  );
}

describe('join link + join form (UX-2)', () => {
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('a /CODE link opens the join form with the code filled in and focus on the name', () => {
    openAt('/wxyz');
    expect(screen.getByRole('heading', { name: /grab a name-tag/i })).toBeTruthy();
    const card = screen.getByRole('region', { name: 'Joining room WXYZ' });
    expect(within(card).getByRole('button', { name: /not this room/i })).toBeTruthy();
    expect(screen.queryByLabelText(/room code/i)).toBeNull(); // the card replaces the field
    expect(document.activeElement).toBe(screen.getByLabelText(/your name/i));
  });

  it('a ?code= link works the same way', () => {
    openAt('/?code=plum');
    expect(screen.getByRole('region', { name: 'Joining room PLUM' })).toBeTruthy();
  });

  it('joining from a link sends you in and forgets the link', async () => {
    const user = userEvent.setup();
    openAt('/WXYZ');
    const join = screen.getByRole('button', { name: /join the room/i });
    expect(join.hasAttribute('disabled')).toBe(true); // still needs a name
    await user.type(screen.getByLabelText(/your name/i), 'Priya');
    await user.click(join);
    expect(await screen.findByRole('heading', { name: /you.re in/i })).toBeTruthy();
    expect(window.location.pathname).toBe('/'); // a later leave or reload never re-reads it
  });

  it('"Not this room?" clears the code back to an empty, focused code field', async () => {
    const user = userEvent.setup();
    openAt('/WXYZ');
    await user.click(screen.getByRole('button', { name: /not this room/i }));
    expect(screen.queryByRole('region', { name: /joining room/i })).toBeNull();
    const code = screen.getByLabelText(/room code/i);
    expect((code as HTMLInputElement).value).toBe('');
    expect(document.activeElement).toBe(code);
    expect(window.location.pathname).toBe('/');
  });

  it('Back returns to the landing (from a link, too) and forgets the link', async () => {
    const user = userEvent.setup();
    openAt('/WXYZ');
    await user.click(screen.getByRole('button', { name: /^back$/i }));
    expect(screen.getByRole('button', { name: /host a room/i })).toBeTruthy();
    expect(window.location.pathname).toBe('/');
    // …and a typed join has Back too.
    await user.click(screen.getByRole('button', { name: /join a room/i }));
    expect(screen.getByLabelText(/room code/i)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /^back$/i }));
    expect(screen.getByRole('button', { name: /join a room/i })).toBeTruthy();
  });

  it('anything but a real room code falls through to the landing', () => {
    openAt('/ABCDE');
    expect(screen.getByRole('button', { name: /host a room/i })).toBeTruthy();
  });

  it('hosting clears a stale path, so it is never read later', async () => {
    const user = userEvent.setup();
    openAt('/AB1D');
    await user.click(screen.getByRole('button', { name: /host a room/i }));
    expect(window.location.pathname).toBe('/');
  });

  it('a resuming host session wins over a /CODE link and clears it', () => {
    sessionStorage.setItem('klatchr:host', JSON.stringify({ code: 'WXYZ', hostToken: 'htok' }));
    openAt('/PLUM');
    expect(screen.getByText(/choose tonight.s game/i)).toBeTruthy();
    expect(window.location.pathname).toBe('/');
    sessionStorage.clear();
  });

  it('pushes no history entries, so the browser back button is never trapped', async () => {
    const user = userEvent.setup();
    openAt('/');
    const entries = window.history.length;
    await user.click(screen.getByRole('button', { name: /join a room/i }));
    await user.click(screen.getByRole('button', { name: /^back$/i }));
    expect(window.history.length).toBe(entries);
  });
});
