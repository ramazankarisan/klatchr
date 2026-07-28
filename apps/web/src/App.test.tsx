import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App.js';
import { theme } from './theme.js';

// No VITE_WS_URL in the test env → the factory hands each surface a mock transport.
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

  it('joins from the landing into your own phone', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: /join a room/i }));

    const code = screen.getByLabelText(/room code/i);
    await user.type(code, 'plum');
    await user.type(screen.getByLabelText(/your name/i), 'Priya');
    expect((code as HTMLInputElement).value).toBe('PLUM');

    await user.click(screen.getByRole('button', { name: /join the room/i }));
    expect(await screen.findByText(/you.?re in/i)).toBeTruthy(); // the player phone lobby
  });

  it('hosts a room and plays a full Guess Who round on the mock engine', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: /host a room/i }));

    // The lobby now shows a game picker; choose a game, then start.
    await user.click(await screen.findByRole('button', { name: /guess who said it/i }));
    await user.click(await screen.findByRole('button', { name: /start the round/i }));
    expect(await screen.findByText(/answered/i)).toBeTruthy();

    await user.click(await screen.findByRole('button', { name: /show the cards/i }));
    expect(await screen.findByText(/guess who said it/i)).toBeTruthy();

    await user.click(await screen.findByRole('button', { name: /reveal the authors/i }));
    expect(await screen.findByText(/the authors are/i)).toBeTruthy();
    expect(await screen.findByRole('button', { name: /new round/i })).toBeTruthy();
  });

  it('hosts a Most Likely To round on the mock engine', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: /host a room/i }));

    await user.click(await screen.findByRole('button', { name: /most likely to/i }));
    await user.click(await screen.findByRole('button', { name: /start the round/i }));
    expect(await screen.findByText(/\d+ of \d+ voted/i)).toBeTruthy(); // vote-progress board

    await user.click(await screen.findByRole('button', { name: /show the results/i }));
    expect(await screen.findByRole('button', { name: /new round/i })).toBeTruthy(); // results reached
  });
});
