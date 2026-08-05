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

/** Assert the board auto-resumed onto its own room after a reload (same code,
 * not bounced to the landing) — shared by the lobby- and mid-round host-reload tests. */
async function expectHostResumed(page: Page, code: string): Promise<void> {
  await expect(page.locator('[aria-label^="room code"]')).toHaveAttribute(
    'aria-label',
    `room code ${code}`,
  );
  await expect(page.getByRole('button', { name: HOST.button })).toHaveCount(0);
}

/** Open a host board, seat all three phones, and land on Guess Who selected in the lobby. */
async function hostGuessWho(
  browser: Browser,
): Promise<{ host: { page: Page; code: string }; phone: (name: string) => Page }> {
  const host = await openHost(browser);
  const phone = await joinAllPlayers(browser, host.code);
  await host.page.getByRole('button', { name: /guess who said it/i }).click();
  return { host, phone };
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
  // The reveal now also carries the overall standings (B1), so a name can appear both
  // as an author chip and a standings row — first() is enough to prove it's revealed.
  await expect(cyrus.getByText('Adalyn').first()).toBeVisible(); // hidden a moment ago
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
  await expectHostResumed(host.page, host.code);
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
  const { host, phone } = await hostGuessWho(browser);
  await host.page.getByRole('button', { name: STEP.start }).click();
  await expect(host.page.getByText(/round 1/i)).toBeVisible(); // round counter on the board

  // Two answer; Cyrus skips — no card taped, but he'll still guess.
  await submitAnswer(phone('Adalyn'), PLAYERS[0].secret);
  await submitAnswer(phone('Bowen'), PLAYERS[1].secret);
  await phone('Cyrus')
    .getByRole('button', { name: /skip — i.ll just guess/i })
    .click();
  await expect(phone('Cyrus').getByText(/skipped/i)).toBeVisible();
  // B4: skip is a real event now — the host counts the skipper as done (no card taped).
  await expect(host.page.getByText(/3 of 3 answered/)).toBeVisible();

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
  await host.page
    .getByRole('dialog')
    .getByRole('button', { name: /change game/i })
    .click(); // confirm
  await expect(host.page.getByText(/choose tonight.s game/i)).toBeVisible();
});

/**
 * B1/B5: the host ends a round mid-vote. The player must learn it's over (not sit on
 * the vote form), and the host's control must recover to a working "New round" (not a
 * dead step that the server rejects).
 */
test('host ends a round mid-play → the player sees game-over and the host can restart (B1/B5)', async ({
  browser,
}) => {
  const host = await openHost(browser);
  const phone = await joinAllPlayers(browser, host.code);

  await host.page.getByRole('button', { name: /most likely to/i }).click();
  await host.page.getByRole('button', { name: STEP.start }).click();
  await expect(
    phone('Adalyn')
      .getByText(/most likely/i)
      .first(),
  ).toBeVisible(); // mid-vote

  // Host aborts mid-vote (nobody voted yet) — confirming the dialog.
  await host.page.getByRole('button', { name: /end game/i }).click();
  await host.page
    .getByRole('dialog')
    .getByRole('button', { name: /end game/i })
    .click();

  // The player no longer sits on the vote form — it's a wrap, with the overall standings.
  await expect(phone('Adalyn').getByText(/that.s a wrap/i)).toBeVisible();
  await expect(phone('Adalyn').getByText(/overall/i)).toBeVisible();

  // The host control recovered to a working "New round" (not a rejected stale step).
  await expect(host.page.getByRole('button', { name: /new round/i })).toBeVisible();
  await host.page.getByRole('button', { name: /new round/i }).click();
  await expect(host.page.getByText(/everyone.s voting/i)).toBeVisible(); // a fresh round ran
});

/**
 * Cycle 11 over the wire: a host authors a custom question set in the lobby, and it drives
 * the round — on the board and on every phone — instead of the built-in bank. Across two
 * rounds the set is walked in order with no repeat: round 1 uses the first question, round 2
 * the second. Proves the whole config seam (web editor → configureGame → room → game.init).
 */
test('host-authored questions drive the round and rotate without repeats (11)', async ({
  browser,
}) => {
  const { host, phone } = await hostGuessWho(browser);

  // Open "Customize questions" and author two of our own (distinctive so getByText is exact).
  await host.page.getByRole('button', { name: /customize/i }).click();
  const field = host.page.getByLabel(/type a question of your own/i);
  await field.fill('QQPROMPT alpha?');
  await host.page.getByRole('button', { name: 'Add' }).click();
  await field.fill('QQPROMPT beta?');
  await host.page.getByRole('button', { name: 'Add' }).click();
  await expect(host.page.getByText(/2 custom questions/i)).toBeVisible();

  // --- round 1 uses the FIRST authored question, on the board and the phones ---
  await host.page.getByRole('button', { name: STEP.start }).click();
  await expect(host.page.getByText('QQPROMPT alpha?')).toBeVisible();
  await expect(phone('Adalyn').getByText('QQPROMPT alpha?')).toBeVisible();
  await expect(host.page.getByText('QQPROMPT beta?')).toHaveCount(0); // beta is next round, not now

  // --- abort → new round → round 2 uses the SECOND question (walked, no repeat) ---
  await host.page.getByRole('button', { name: /end game/i }).click();
  await host.page
    .getByRole('dialog')
    .getByRole('button', { name: /end game/i })
    .click(); // confirm
  await host.page.getByRole('button', { name: /new round/i }).click();
  await expect(host.page.getByText('QQPROMPT beta?')).toBeVisible();
  await expect(phone('Adalyn').getByText('QQPROMPT beta?')).toBeVisible();
  await expect(host.page.getByText('QQPROMPT alpha?')).toHaveCount(0); // rotated on — no repeat
});

/**
 * Cycle 12 over the wire: a question set is the session. A one-question set plays exactly one
 * round, then the host lands on the game-over screen — no "New round". From there the host can
 * Leave & close the room and return to the landing, free to host again or join as a player.
 */
test('a spent question set ends the game, and the host can leave to start over (12)', async ({
  browser,
}) => {
  const { host, phone } = await hostGuessWho(browser);

  // Author a one-question set → a one-round session.
  await host.page.getByRole('button', { name: /customize/i }).click();
  await host.page
    .getByLabel(/type a question of your own/i)
    .fill('QQONE what is your hidden talent?');
  await host.page.getByRole('button', { name: 'Add' }).click();
  await host.page.getByRole('button', { name: STEP.start }).click();

  // Play the single round through to the reveal.
  for (const p of PLAYERS) {
    await submitAnswer(phone(p.name), p.secret);
  }
  await host.page.getByRole('button', { name: STEP.show }).click();
  await host.page.getByRole('button', { name: STEP.reveal }).click();

  // The set is spent → game-over: the pill says so and there is no "New round".
  await expect(host.page.getByText(/all 1 question played/i)).toBeVisible();
  await expect(host.page.getByRole('button', { name: /new round/i })).toHaveCount(0);

  // --- Leave & close room (confirmed) → back to the landing, ready to host again / join ---
  await host.page.getByRole('button', { name: /leave & close room/i }).click();
  await host.page.getByRole('button', { name: /close room/i }).click();
  await expect(host.page.getByRole('button', { name: /host a room/i })).toBeVisible();
  await expect(host.page.getByRole('button', { name: /join a room/i })).toBeVisible();
});

/** Pick a candidate by name in the MLT vote picker (search then tap the chip). */
async function voteFor(page: Page, name: string): Promise<void> {
  await page.getByLabel('Search names').fill(name);
  await page.getByRole('button', { name: new RegExp(name, 'i') }).click();
}

/** Every phone votes for Bowen, then the host reveals the tally. */
async function mltVoteRound(host: { page: Page }, phone: (name: string) => Page): Promise<void> {
  for (const p of PLAYERS) {
    await voteFor(phone(p.name), PLAYERS[1].name);
  }
  await host.page.getByRole('button', { name: /show the results/i }).click();
}

/**
 * plan-14 L5 / A9 — a reload deep in a Most Likely To session. After three full
 * rounds (so the session tally is non-empty), a phone reloads mid-vote in round 4
 * and rejoins with the same code+name: it resumes the same seat (voting, not a
 * fresh spectator) and the session is intact — still round 4, no fourth seat.
 */
test('a round-4 MLT reload mid-vote resumes the same seat, session intact (L5)', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const host = await openHost(browser);
  const phone = await joinAllPlayers(browser, host.code);
  await host.page.getByRole('button', { name: /most likely to/i }).click();

  // Play rounds 1–3 to completion, then start round 4 — a real multi-round session.
  await host.page.getByRole('button', { name: STEP.start }).click();
  for (let round = 1; round <= 3; round += 1) {
    await expect(host.page.getByText(new RegExp(`round ${round}`, 'i'))).toBeVisible();
    await mltVoteRound(host, phone);
    await host.page.getByRole('button', { name: /new round/i }).click();
  }
  await expect(host.page.getByText(/round 4/i)).toBeVisible(); // deep in the session now

  // Adalyn casts her round-4 vote, then her page reloads mid-vote (socket closes,
  // the server holds the slot) and she rejoins with the same code+name.
  const adalyn = phone('Adalyn');
  await voteFor(adalyn, PLAYERS[2].name); // votes Cyrus
  await expect(adalyn.getByText(/voted for/i)).toBeVisible();
  await adalyn.goto('/');
  await fillJoin(adalyn, host.code, 'Adalyn');

  // Resumed the same seat: she is voting again (not benched as a mid-round spectator),
  // her round-4 vote survived, and the session rode through — still round 4, three seats.
  await expect(adalyn.getByText(/tap a name/i)).toBeVisible();
  await expect(adalyn.getByText(/up next round/i)).toHaveCount(0);
  await expect(adalyn.getByText(/voted for/i)).toBeVisible(); // her vote is intact
  await expect(host.page.getByText(/round 4/i)).toBeVisible();
  await expect(host.page.getByText(/everyone.s voting/i)).toBeVisible();
});

/**
 * plan-14 L5 / A10 — a host reload mid-guess. Deeper than the 8.1 lobby-phase
 * host-reload: here a Guess Who round is live in the guess phase when the board
 * reloads. The client auto-resumeHosts onto the same room with the round intact
 * (the reveal step is still available), and the phones are unaffected.
 */
test('a host reload mid-guess resumes the live round, phones unaffected (L5)', async ({
  browser,
}) => {
  const { host, phone } = await hostGuessWho(browser);
  await host.page.getByRole('button', { name: STEP.start }).click();
  for (const p of PLAYERS) {
    await submitAnswer(phone(p.name), p.secret);
  }
  // Into the guess phase — the round is now live with anonymised cards on the board.
  await host.page.getByRole('button', { name: STEP.show }).click();
  await expect(host.page.getByRole('button', { name: STEP.reveal })).toBeVisible();

  await host.page.reload(); // closes the socket mid-round; only localStorage survives

  // Auto-resumed onto the same room, and the guess phase is intact: the reveal step
  // is available again (a fresh/lobby board would show "Start the round" instead).
  await expectHostResumed(host.page, host.code);
  await expect(host.page.getByRole('button', { name: STEP.reveal })).toBeVisible();

  // The phones never noticed: a player can still name an author over the live socket.
  await expect(
    phone('Cyrus')
      .getByRole('button', { name: /tap to name/i })
      .first(),
  ).toBeVisible();
});
