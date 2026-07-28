import { type Browser, type Page, expect, test } from '@playwright/test';

/**
 * The whole-stack redaction proof that slipped from Cycle 4 (plan-5 §5.3d): a
 * host board plus three player phones, each its own browser context, playing a
 * real round against the real server over sockets. It asserts the two hidden
 * facts never cross the wire early —
 *   - collect: another player's answer *text* is secret until the cards flip;
 *   - guess:   authorship (who wrote which card) is secret until the reveal.
 * and that a dropped player resumes its slot on reconnect (server-minted token).
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

async function openHost(browser: Browser): Promise<{ page: Page; code: string }> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/');
  await page.getByRole('button', { name: HOST.button }).click();
  const codeTape = page.locator('[aria-label^="room code"]');
  // The board mints a real 4-letter code (the placeholder is "····").
  await expect(codeTape).toHaveAttribute('aria-label', /room code [A-Z]{4}$/);
  const label = (await codeTape.getAttribute('aria-label')) ?? '';
  return { page, code: label.replace('room code ', '') };
}

async function fillJoin(page: Page, code: string, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Join a room' }).click();
  await page.getByLabel('Room code').fill(code);
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Join the room' }).click();
}

async function joinPlayer(browser: Browser, code: string, name: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/');
  await fillJoin(page, code, name);
  await expect(page.getByRole('heading', { name: /You.re in/ })).toBeVisible();
  return page;
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
  const phones = new Map<string, Page>();
  for (const p of PLAYERS) {
    phones.set(p.name, await joinPlayer(browser, host.code, p.name));
  }
  const phone = (name: string): Page => {
    const page = phones.get(name);
    if (page === undefined) throw new Error(`no phone for ${name}`);
    return page;
  };

  // --- host starts the round once all three are seated (min 3) ---
  await expect(host.page.getByText(/3 \/ 50 in the room/)).toBeVisible();
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
  await expect(host.page.getByText('Standings')).toBeVisible();
  await expect(host.page.getByText('Adalyn').first()).toBeVisible(); // author chip + standings row
});
