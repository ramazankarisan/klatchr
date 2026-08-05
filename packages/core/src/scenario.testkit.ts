import { expect } from 'vitest';
import type { AnyGame } from './game.js';
import { stubGameDeps, stubRoomDeps } from './game.testkit.js';
import type { PlayerId, Viewer } from './ids.js';
import { createRegistry } from './registry.js';
import type { Result } from './result.js';
import { createRoom, roomReduce } from './room.js';
import type { ReduceContext, Room, RoomError, RoomEvent } from './roomTypes.js';

/**
 * The reconnect-scenario DSL (plan-13 L2): a chainable testkit over the pure
 * room reducer that encodes the server's grace semantics exactly once —
 *
 *   dropWithinGrace = NO core event (the slot stays; nothing may change);
 *   reap            = leave (what the server does after the 30s grace);
 *   rejoin          = a fresh join under the same nickname (new id);
 *   resume          = join with the stored reconnect token (same id, E3).
 *
 * The literal timers stay server territory (Cycle 14's ws-integration layer);
 * here the matrix reads as behaviour: `scenario(game).join('Ada','Bo','Cy')
 * .start().round(4).reap('Bo').rejoin('Bo')`.
 */

const HOST: Viewer = { role: 'host' };

export function scenario(game: AnyGame, config?: unknown): Scenario {
  return new Scenario(game, config);
}

class Scenario {
  private current: Room;
  private readonly ctx: ReduceContext;
  private readonly game: AnyGame;
  private readonly idsByNick = new Map<string, PlayerId>();
  private readonly tokensByNick = new Map<string, string>();

  constructor(game: AnyGame, config?: unknown) {
    this.game = game;
    this.ctx = {
      registry: createRegistry([game]),
      roomDeps: stubRoomDeps(),
      gameDeps: stubGameDeps(),
    };
    this.current = createRoom(this.ctx.roomDeps);
    this.apply({ type: 'selectGame', gameId: game.id }, HOST);
    if (config !== undefined) {
      this.apply({ type: 'configureGame', config }, HOST);
    }
  }

  /** The room as core sees it right now — the assertion surface. */
  get room(): Room {
    return this.current;
  }

  join(...nicks: string[]): this {
    for (const nick of nicks) {
      this.apply({ type: 'join', nickname: nick }, HOST);
      const seated = this.current.players[this.current.players.length - 1];
      fail_unless(seated !== undefined, `join(${nick}) seated nobody`);
      const token = this.current.tokens[seated.id];
      fail_unless(token !== undefined, `join(${nick}) minted no token`);
      this.idsByNick.set(nick, seated.id);
      this.tokensByNick.set(nick, token);
    }
    return this;
  }

  start(): this {
    return this.apply({ type: 'startGame' }, HOST);
  }

  /** Walk start/end pairs (host aborts) until the room is IN_GAME at round n. */
  round(n: number): this {
    while (this.current.round < n) {
      if (this.current.phase === 'IN_GAME') {
        this.apply({ type: 'endGame' }, HOST);
      }
      this.apply({ type: 'startGame' }, HOST);
    }
    fail_unless(
      this.current.phase === 'IN_GAME' && this.current.round === n,
      `round(${n}) landed on ${this.current.phase} round ${this.current.round}`,
    );
    return this;
  }

  /** Dispatch a game event that must be accepted. */
  play(event: unknown): this {
    return this.apply({ type: 'gameEvent', event }, HOST);
  }

  /** Dispatch a game event, tolerating rejection: applies on ok, returns either way. */
  attempt(event: unknown): Result<Room, RoomError> {
    const result = roomReduce(this.current, { type: 'gameEvent', event }, HOST, this.ctx);
    if (result.ok) {
      this.current = result.value;
    }
    return result;
  }

  endGame(): this {
    return this.apply({ type: 'endGame' }, HOST);
  }

  /** Within the 30s grace a drop is invisible to core — no event exists. The
   * call documents the drop and proves the world stands still (A5). */
  dropWithinGrace(nick: string): this {
    const id = this.id(nick);
    fail_unless(
      this.current.players.some((p) => p.id === id),
      `dropWithinGrace(${nick}): not seated`,
    );
    const before = { room: this.current, views: this.snapshotViews() };
    // deliberately: no core event
    expect(this.current).toBe(before.room);
    expect(this.snapshotViews()).toEqual(before.views);
    return this;
  }

  /** What the server does when the grace expires: a leave for the player. */
  reap(nick: string): this {
    return this.apply({ type: 'leave' }, { role: 'player', id: this.id(nick) });
  }

  /** Rejoin after a reap: a fresh join under the same nickname — new id. */
  rejoin(nick: string): this {
    return this.join(nick);
  }

  /** Reconnect within grace: join with the stored token resumes the slot (E3). */
  resume(nick: string): this {
    const token = this.tokensByNick.get(nick);
    fail_unless(token !== undefined, `resume(${nick}): no stored token`);
    return this.apply({ type: 'join', nickname: nick, reconnectToken: token }, HOST);
  }

  /** The player's CURRENT id — capture it before a reap if you need the old one. */
  id(nick: string): PlayerId {
    const id = this.idsByNick.get(nick);
    fail_unless(id !== undefined, `unknown player ${nick}`);
    return id;
  }

  /** The active game's redacted view for a player nickname, or 'host'. */
  view(who: 'host' | (string & {})): unknown {
    const viewer: Viewer = who === 'host' ? HOST : { role: 'player', id: this.id(who) };
    return this.game.view(this.current.gameState, viewer);
  }

  private snapshotViews(): Record<string, unknown> {
    if (this.current.gameState === null) {
      return {}; // no live game — the room object itself is the whole surface
    }
    const views: Record<string, unknown> = { host: this.view('host') };
    for (const player of this.current.players) {
      views[player.id] = this.game.view(this.current.gameState, {
        role: 'player',
        id: player.id,
      });
    }
    return views;
  }

  private apply(event: RoomEvent, actor: Viewer): this {
    const result = roomReduce(this.current, event, actor, this.ctx);
    if (!result.ok) {
      throw new Error(`scenario: ${event.type} rejected (${result.error.code})`);
    }
    this.current = result.value;
    return this;
  }
}

function fail_unless(cond: boolean, message: string): asserts cond {
  if (!cond) {
    throw new Error(`scenario: ${message}`);
  }
}
