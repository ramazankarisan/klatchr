import { type Browser, type Page, type WebSocketRoute, expect, test } from '@playwright/test';

/**
 * The whole-stack redaction proof that slipped from Cycle 4 (plan-5 §5.3d): a
 * host board plus three player phones, each its own browser context, playing a
 * real round against the real server over sockets. It asserts the two hidden
 * facts never cross the wire early —
 *   - collect: another player's answer *text* is secret until the cards flip;
 *   - guess:   authorship (who wrote which card) is secret until the reveal.
 * and that a dropped player resumes its slot on reconnect (server-minted token).
 *
 * Scope: this proves *render-level* redaction (the secret/name is not on screen).
 * The authoritative per-viewer proof is the game's G8–G10 unit redaction tests on
 * `view()`; this whole-stack test confirms the wire + UI wiring around them.
 *
 * Names are ≥5 letters so they can never be a substring of the random 4-letter
 * room code; secrets are distinctive so getByText can't match them by accident.
 */

const HOST = { button: 'Host a room' };
const PLAYERS = [
  { name: 'Adalyn', secret: 'QQZEBRA' },
  { name: 'Bowen', secret: 'QQMANGO' },
  { name: 'Cyrus', secret: 'QQKOALA' },
] as const;

/** The host's single control button, labelled by the phase it advances from. */
const STEP = {
  start: 'Start the round',
  show: 'Show the cards',
  reveal: 'Reveal the authors',
} as const;

/** Run once after the landing loads, before the socket opens — e.g. to install a WS proxy. */
type Setup = (page: Page) => Promise<void>;

async function openHost(browser: Browser, setup?: Setup): Promise<{ page: Page; code: string }> {
  const page = await (await browser.newContext()).newPage();
  await setup?.(page); // before navigation so a WS proxy is live from the first socket
  await page.goto('/');
  await page.getByRole('button', { name: HOST.button }).click();
  const codeTape = page.locator('[aria-label^="room code"]');
  // The board mints a real 4-letter code (the placeholder is "····").
  await expect(codeTape).toHaveAttribute('aria-label', /room code [A-Z]{4}$/);
  const label = (await codeTape.getAttribute('aria-label')) ?? '';
  return { page, code: label.replace('room code ', '') };
}

/**
 * Proxy this page's WebSocket through Playwright so a test can force a *real*
 * client-side close (`drop`) — `context.setOffline` leaves an idle WS open, so it
 * can't trigger the reconnect. Messages pass straight through to the real server;
 * on reconnect the handler re-fires and re-proxies the new socket. Install before
 * the socket opens (as the helper `setup`).
 */
async function interceptWs(page: Page): Promise<{ drop: () => Promise<void> }> {
  let current: WebSocketRoute | null = null;
  await page.routeWebSocket(
    (url) => url.port === '8080',
    (ws) => {
      const server = ws.connectToServer();
      ws.onMessage((m) => server.send(m));
      server.onMessage((m) => ws.send(m));
      current = ws;
    },
  );
  return {
    drop: async () => {
      if (current === null) throw new Error('WS proxy never intercepted a socket');
      current.close();
    },
  };
}

async function fillJoin(page: Page, code: string, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Join a room' }).click();
  await page.getByLabel('Room code').fill(code);
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Join the room' }).click();
}

async function joinPlayer(
  browser: Browser,
  code: string,
  name: string,
  setup?: Setup,
): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await setup?.(page); // before navigation so a WS proxy is live from the first socket
  await page.goto('/');
  await fillJoin(page, code, name);
  await expect(page.getByRole('heading', { name: /You.re in/ })).toBeVisible();
  return page;
}

/** Seat all PLAYERS as phones and return an accessor by name. */
async function joinAllPlayers(browser: Browser, code: string): Promise<(name: string) => Page> {
  const phones = new Map<string, Page>();
  for (const p of PLAYERS) {
    phones.set(p.name, await joinPlayer(browser, code, p.name));
  }
  return (name: string): Page => {
    const page = phones.get(name);
    if (page === undefined) throw new Error(`no phone for ${name}`);
    return page;
  };
}

async function submitAnswer(page: Page, text: string): Promise<void> {
  await page.getByLabel('Your answer').fill(text);
  await page.getByRole('button', { name: 'Tape it up' }).click();
  await expect(page.getByText(/Answer taped up/)).toBeVisible();
}

test('a full round keeps answers and authorship secret, and resumes a dropped slot', async ({
  browser,
}) => {
  const host = await openHost(browser);
  const phone = await joinAllPlayers(browser, host.code);

  // --- host picks a game, then starts once all three are seated (min 3) ---
  // Roster copy derives from the picked game's cap now (8.2), not a hardcoded 50:
  // before a game is picked there is no cap, and after it reads the game's maxPlayers.
  await expect(host.page.getByText(/^3 in the room$/)).toBeVisible(); // no game → no cap
  await host.page.getByRole('button', { name: /guess who said it/i }).click();
  await expect(host.page.getByText(/3 \/ 12 in the room/)).toBeVisible();
  await host.page.getByRole('button', { name: STEP.start }).click();

  // --- collect: everyone writes a secret answer ---
  for (const p of PLAYERS) {
    await submitAnswer(phone(p.name), p.secret);
  }
  await expect(host.page.getByText(/3 of 3 answered/)).toBeVisible();

  // REDACTION 1 — no phone shows another player's answer text, nor does the board.
  for (const viewer of PLAYERS) {
    for (const other of PLAYERS) {
      if (other.name === viewer.name) continue;
      await expect(phone(viewer.name).getByText(other.secret)).toHaveCount(0);
    }
  }
  for (const p of PLAYERS) {
    await expect(host.page.getByText(p.secret)).toHaveCount(0);
  }

  // --- reconnect: Adalyn drops (reload) and rejoins with the same code+name ---
  const adalyn = phone('Adalyn');
  await adalyn.goto('/'); // closes the socket; the server holds the slot for the grace window
  await fillJoin(adalyn, host.code, 'Adalyn');
  // Resumed the same slot: her taped-up answer survives and she is NOT a fresh
  // mid-round spectator (a failed resume would seat her anew and bench her).
  await expect(adalyn.getByText(/Answer taped up/)).toBeVisible();
  await expect(adalyn.getByText(/up next round/)).toHaveCount(0);
  await expect(host.page.getByText(/3 of 3 answered/)).toBeVisible(); // still 3, no 4th seat

  // --- guess: flip the cards (texts now public, authorship still hidden) ---
  await host.page.getByRole('button', { name: STEP.show }).click();
  // The board now shows every answer as an anonymised card.
  for (const p of PLAYERS) {
    await expect(host.page.getByText(p.secret)).toBeVisible();
  }

  // REDACTION 2 — before the reveal, no author name is attached anywhere. Cyrus
  // has touched nothing, so the other players' names appear on his phone only if
  // authorship leaked; the board shows no names and no reveal-only markers.
  const cyrus = phone('Cyrus');
  await expect(cyrus.getByText('Adalyn')).toHaveCount(0);
  await expect(cyrus.getByText('Bowen')).toHaveCount(0);
  await expect(cyrus.getByText(/Round done/)).toHaveCount(0);
  // "Standings" is reveal-only (the phrase "said it" is not — it is in the guess
  // kicker "Guess who said it" and the "name who said it" button).
  await expect(host.page.getByText('Standings')).toHaveCount(0);
  await expect(host.page.getByText('Adalyn')).toHaveCount(0);

  // Exercise the real guess input over the socket: Adalyn names one card.
  await adalyn
    .getByRole('button', { name: /Tap to name who said it/ })
    .first()
    .click();
  await adalyn.getByLabel('Search names').fill('Cyrus');
  await adalyn.getByRole('button', { name: 'Cyrus' }).click();
  await expect(adalyn.getByText(/1 of 2/)).toBeVisible();

  // --- reveal: authorship becomes public, proving the redaction was phase-gated ---
  await host.page.getByRole('button', { name: STEP.reveal }).click();
  await expect(cyrus.getByText(/Round done/)).toBeVisible();
  await expect(cyrus.getByText('Adalyn')).toBeVisible(); // the name that was hidden a moment ago
  // Two standings at reveal now (the round tally + the cumulative session tally, 10.4).
  await expect(host.page.getByText('Standings').first()).toBeVisible();
  await expect(host.page.getByText('Adalyn').first()).toBeVisible(); // author chip + standings row
});

/**
 * 7.2 self-heal: a dropped socket reconnects itself — no manual re-join — showing
 * a "Reconnecting…" indicator while it heals. We emulate a real network drop with
 * `context.setOffline` (which closes the live WebSocket), on both a phone and the
 * host board. The phone resumes its slot via its reconnect token; the host resumes
 * the room via `resumeHost` + `hostToken` (7.1). Distinct from the reload+re-join
 * above: here nothing is retyped, the transport re-handshakes on its own.
 */
test('a dropped socket heals itself with a reconnecting indicator (7.2)', async ({ browser }) => {
  test.setTimeout(90_000);
  let hostWs: { drop: () => Promise<void> } | undefined;
  const host = await openHost(browser, async (page) => {
    hostWs = await interceptWs(page);
  });
  const phones = new Map<string, Page>();
  let adalynWs: { drop: () => Promise<void> } | undefined;
  for (const p of PLAYERS) {
    const setup =
      p.name === 'Adalyn'
        ? async (page: Page) => {
            adalynWs = await interceptWs(page);
          }
        : undefined;
    phones.set(p.name, await joinPlayer(browser, host.code, p.name, setup));
  }
  const phone = (name: string): Page => {
    const page = phones.get(name);
    if (page === undefined) throw new Error(`no phone for ${name}`);
    return page;
  };

  await host.page.getByRole('button', { name: /guess who said it/i }).click();
  await host.page.getByRole('button', { name: STEP.start }).click();
  for (const p of PLAYERS) {
    await submitAnswer(phone(p.name), p.secret);
  }
  await expect(host.page.getByText(/3 of 3 answered/)).toBeVisible();

  // --- a phone's socket drops: it shows Reconnecting…, then heals on its own ---
  const adalyn = phone('Adalyn');
  await adalynWs?.drop();
  await expect(adalyn.getByText(/Reconnecting/i)).toBeVisible();
  // No re-join: the transport reconnects itself and resumes the same slot, so her
  // taped answer survives and the indicator clears.
  await expect(adalyn.getByText(/Reconnecting/i)).toHaveCount(0, { timeout: 20_000 });
  await expect(adalyn.getByText(/Answer taped up/)).toBeVisible();

  // --- the host board's socket drops: it reconnects via resumeHost (7.1), room intact ---
  await hostWs?.drop();
  await expect(host.page.getByText(/Reconnecting/i)).toBeVisible();
  await expect(host.page.getByText(/Reconnecting/i)).toHaveCount(0, { timeout: 20_000 });
  await expect(host.page.getByText(/3 of 3 answered/)).toBeVisible(); // same room, same round
});

/**
 * 8.1/8.2 dead-end recovery: a mistyped room code used to strand a player on an
 * endless "Joining…" spinner (the error frame was silently dropped). Now the real
 * server's `NO_SUCH_ROOM` surfaces as a recover card with a way back to the join
 * form — proven end-to-end over the socket, since the mock never errors.
 */
test('a mistyped room code shows a recover card, never an endless spinner (8.1)', async ({
  browser,
}) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/');
  await fillJoin(page, 'ZZZZ', 'Adalyn'); // no room ever had this code

  // A recover alert with human copy — not a stuck spinner.
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByText(/no room/i)).toBeVisible();
  await expect(page.getByText(/Joining/)).toHaveCount(0);

  // The way back returns to the join form, ready for another code.
  await page.getByRole('button', { name: /try another code/i }).click();
  await expect(page.getByRole('heading', { name: /grab a name-tag/i })).toBeVisible();
});

/**
 * 8.1 host survival: a host reload used to abandon the live room (only the player
 * token was persisted), so the board dropped back to the landing and the room was
 * reaped. Now the host session (code + `hostToken`) is persisted and the client
 * auto-`resumeHost`s on load — a full page reload lands back on the same room, its
 * picked game intact, without retyping anything.
 */
test('a host page reload resumes the same room, game intact (8.1)', async ({ browser }) => {
  const host = await openHost(browser);
  await host.page.getByRole('button', { name: /guess who said it/i }).click();
  await expect(host.page.getByText(/selected/i)).toBeVisible(); // game picked

  await host.page.reload(); // closes the socket + wipes in-memory state; only localStorage survives

  // Auto-resumed: same room code, not bounced to the landing, and the picked game
  // survived (the server held the room; the client re-attached via resumeHost).
  await expect(host.page.locator('[aria-label^="room code"]')).toHaveAttribute(
    'aria-label',
    `room code ${host.code}`,
  );
  await expect(host.page.getByRole('button', { name: HOST.button })).toHaveCount(0);
  await expect(host.page.getByText(/selected/i)).toBeVisible();
});

/**
 * Cycle-10 over the wire: a player skips answering yet still guesses; the board
 * shows a round counter and, at reveal, a cumulative session standings; and the
 * host can change game back to the picker (the exits that didn't exist before).
 */
test('a skipper still guesses, the board keeps a running tally, and the host can change game (10)', async ({
  browser,
}) => {
  const host = await openHost(browser);
  const phone = await joinAllPlayers(browser, host.code);

  await host.page.getByRole('button', { name: /guess who said it/i }).click();
  await host.page.getByRole('button', { name: STEP.start }).click();
  await expect(host.page.getByText(/round 1/i)).toBeVisible(); // round counter on the board

  // Two answer; Cyrus skips — no card taped, but he'll still guess.
  await submitAnswer(phone('Adalyn'), PLAYERS[0].secret);
  await submitAnswer(phone('Bowen'), PLAYERS[1].secret);
  await phone('Cyrus')
    .getByRole('button', { name: /skip — i.ll just guess/i })
    .click();
  await expect(phone('Cyrus').getByText(/skipped/i)).toBeVisible();
  await expect(host.page.getByText(/2 of 3 answered/)).toBeVisible(); // the skip taped no card

  // Show the cards → the skipper can still name authors on the two taped answers.
  await host.page.getByRole('button', { name: STEP.show }).click();
  await expect(
    phone('Cyrus')
      .getByRole('button', { name: /tap to name/i })
      .first(),
  ).toBeVisible();

  // Reveal → game-over screen: cumulative standings + a way back to pick another game.
  await host.page.getByRole('button', { name: STEP.reveal }).click();
  await expect(host.page.getByText(/standings so far/i)).toBeVisible();
  await expect(host.page.getByText(/game over/i)).toBeVisible();
  await host.page.getByRole('button', { name: /change game/i }).click();
  await expect(host.page.getByText(/choose tonight.s game/i)).toBeVisible();
});
