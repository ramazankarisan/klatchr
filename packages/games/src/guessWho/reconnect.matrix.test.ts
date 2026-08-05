import { scenario } from '@klatchr/core/scenario';
import { describe, expect, it } from 'vitest';
import { guessWho } from './guessWho.js';
import type { GWState } from './state.js';

/**
 * The reconnect matrix for Guess Who Said It (plan-13 A5–A8): the scenario DSL
 * walks {drop-within-grace, reap, rejoin} across every phase. Drop rows assert
 * the world stands still; reap rows assert the platform's actual disconnect
 * policy — seat pruned, submissions survive in-game, tally parked by nickname.
 */

type S = ReturnType<typeof trio>;

function trio(config?: unknown) {
  return scenario(guessWho, config).join('Ada', 'Bo', 'Cy');
}

const gw = (s: S): GWState => s.room.gameState as GWState; // own state, typed in-package
const nicks = (s: S): string[] => s.room.players.map((p) => p.nickname);

/** Everyone answers "<nick>-says" — card order is then alphabetical by text. */
function submitAll(s: S): S {
  for (const nick of ['Ada', 'Bo', 'Cy']) {
    s.play({ type: 'submit', playerId: s.id(nick), text: `${nick}-says` });
  }
  return s;
}

const toGuess = (s: S): S => submitAll(s).play({ type: 'advance', from: 'collect' });
const toReveal = (s: S): S => toGuess(s).play({ type: 'advance', from: 'guess' });

/** The card holding `text` — findable because reduce is pure and order is total. */
function cardIdOf(s: S, text: string): string {
  const card = gw(s).cards.find((c) => c.text === text);
  if (card === undefined) {
    throw new Error(`no card says ${text}`);
  }
  return card.id;
}

describe('drop within grace — every phase, the world stands still (A5)', () => {
  it('LOBBY', () => {
    trio().dropWithinGrace('Bo');
  });

  it('collect (with a draft already in)', () => {
    const s = trio().start();
    s.play({ type: 'submit', playerId: s.id('Bo'), text: 'Bo-says' });
    s.dropWithinGrace('Bo');
  });

  it('guess', () => {
    toGuess(trio().start()).dropWithinGrace('Bo');
  });

  it('reveal / SCORES', () => {
    toReveal(trio().start()).dropWithinGrace('Bo');
  });

  it('game-over (the set is spent)', () => {
    const s = toReveal(trio({ prompts: ['The only question?'] }).start());
    s.dropWithinGrace('Bo');
    expect(() => s.start()).toThrowError(/SESSION_COMPLETE/); // this IS game-over
  });
});

describe('reap mid-round — seat pruned, submissions survive (A6)', () => {
  it('collect: the reaped player’s answer still becomes a card', () => {
    const s = trio().start();
    s.play({ type: 'submit', playerId: s.id('Bo'), text: 'Bo-says' });
    s.reap('Bo');
    expect(nicks(s)).toEqual(['Ada', 'Cy']); // roster prunes
    submitAllBut(s, 'Bo').play({ type: 'advance', from: 'collect' });
    expect(gw(s).cards.map((c) => c.text)).toContain('Bo-says'); // the answer survives
  });

  it('guess: the reaped player’s guesses still score at reveal', () => {
    const s = toGuess(trio().start());
    const bo = s.id('Bo');
    s.play({ type: 'guess', playerId: bo, cardId: cardIdOf(s, 'Ada-says'), author: s.id('Ada') });
    s.reap('Bo');
    expect(s.room.sessionScores).toEqual({}); // pruned at the reap (B6)
    s.play({ type: 'advance', from: 'guess' });
    // The game still scores the leaver's correct guess (their submissions are
    // theirs), so the fold re-adds the departed id. Standings filter to the
    // roster web-side (Cycle 10 B6); the ledger only ever parks at leave time.
    expect(s.room.sessionScores[bo]).toBe(1);
  });

  it('SCORES: reaping after the reveal parks the folded tally by nickname', () => {
    const s = toReveal(trio().start()); // fold happened on entry to SCORES
    const ada = s.id('Ada');
    expect(s.room.sessionScores[ada]).toBe(0); // no guesses this round
    s.reap('Ada');
    expect(s.room.sessionScores[ada]).toBeUndefined();
    expect(s.room.scoreLedger).toEqual({ ada: 0 });
  });

  it('LOBBY: a reap before the round simply prunes the seat', () => {
    const s = trio().reap('Bo');
    expect(nicks(s)).toEqual(['Ada', 'Cy']);
  });
});

describe('rejoin after reap — spectator now, dealt in next round (A7)', () => {
  it('mid-round the fresh id spectates and cannot act; next round seats it', () => {
    const s = trio().start();
    const oldBo = s.id('Bo');
    s.reap('Bo').rejoin('Bo');
    const newBo = s.id('Bo');
    expect(newBo).not.toBe(oldBo);
    expect(s.room.players.find((p) => p.id === newBo)?.spectator).toBe(true);
    const refused = s.attempt({ type: 'submit', playerId: newBo, text: 'late' });
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.error.message).toBe('NOT_PLAYING'); // not in this round's pool
    }
    s.endGame().start(); // next round
    expect(s.room.players.find((p) => p.id === newBo)?.spectator).toBe(false);
    expect(gw(s).roster).toContain(newBo); // rotation dealt them in
  });

  it('A8 end to end: a spent night is parked at game-over and reclaimed by name', () => {
    const s = toGuess(trio({ prompts: ['The only question?'] }).start());
    s.play({
      type: 'guess',
      playerId: s.id('Bo'),
      cardId: cardIdOf(s, 'Ada-says'),
      author: s.id('Ada'),
    });
    s.play({ type: 'advance', from: 'guess' }); // game over: 1-question set spent
    expect(s.room.sessionScores[s.id('Bo')]).toBe(1);
    s.reap('Bo'); // e.g. the phone died on the final reveal
    expect(s.room.scoreLedger).toEqual({ bo: 1 });
    s.rejoin('Bo');
    expect(s.room.sessionScores[s.id('Bo')]).toBe(1); // the night survived
    expect(s.room.scoreLedger).toEqual({});
  });
});

/** The remaining phones submit. (The game would still ACCEPT the leaver's id —
 * it keeps them in its roster — but their phone is gone, so nobody sends it.) */
function submitAllBut(s: S, gone: string): S {
  for (const nick of ['Ada', 'Bo', 'Cy'].filter((n) => n !== gone)) {
    s.play({ type: 'submit', playerId: s.id(nick), text: `${nick}-says` });
  }
  return s;
}
