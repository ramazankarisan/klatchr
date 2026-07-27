import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App.js';
import { theme } from './theme.js';

function renderApp(): void {
  render(
    <ThemeProvider theme={theme}>
      <App />
    </ThemeProvider>,
  );
}

describe('App', () => {
  it('opens on the landing with host and join actions', () => {
    renderApp();
    expect(screen.getByRole('heading', { name: /klatchr/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /host a room/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /join a room/i })).toBeTruthy();
  });

  it('shows a join form that upper-cases the room code and leads into the room', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: /join a room/i }));

    const code = screen.getByLabelText(/room code/i);
    await user.type(code, 'plum');
    await user.type(screen.getByLabelText(/your name/i), 'Priya');
    expect((code as HTMLInputElement).value).toBe('PLUM');

    await user.click(screen.getByRole('button', { name: /join the room/i }));
    expect(screen.getByRole('button', { name: /start the round/i })).toBeTruthy();
  });

  it('hosts a room and plays a full Guess Who round on the mock engine', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: /host a room/i }));

    await user.click(screen.getByRole('button', { name: /start the round/i }));
    expect(screen.getByText(/answered/i)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /show the cards/i }));
    expect(screen.getByText(/guess who said it/i)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /reveal the authors/i }));
    expect(screen.getByText(/the authors are/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /new round/i })).toBeTruthy();
  });
});
