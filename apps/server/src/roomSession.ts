import {
  type Registry,
  type Result,
  type Room,
  type RoomError,
  type RoomEvent,
  type Score,
  type Viewer,
  playerIdForToken,
  roomReduce,
} from '@klatchr/core';
import type { ServerMessage } from '@klatchr/protocol';
import type { Connection } from './connection.js';
import type { ServerDeps } from './serverDeps.js';

type HostAction = 'selectGame' | 'configureGame' | 'startGame' | 'endGame';

/** How long a dropped player's slot survives before it is reaped (a reload/flaky
 * network reconnects with the same token inside this window and resumes). */
const RECONNECT_GRACE_MS = 30_000;

/**
 * One live room: the pure `core` room plus the connections attached to it. It
 * owns the three server responsibilities the plan calls out —
 *   - authority: the actor handed to `reduce` comes from the *connection's*
 *     registered identity, never from the message, so a player can't act as the
 *     host or as another player;
 *   - redaction (rule 3): every outbound is `view(state, viewer)` for that
 *     connection's own viewer — never the raw state;
 *   - coalesced fan-out (W3): a burst of applied events collapses to one frame
 *     per connection per microtask.
 */
export class RoomSession {
  private room: Room;
  private readonly members = new Map<Connection, Viewer>();
  // playerId -> cancel handle for its pending grace-window reap (see disconnect).
  private readonly reapers = new Map<string, () => void>();
  // The host's resume secret (7.1), minted server-side so `core` stays pure — the
  // host is not a player, so it has no `tokens` entry; this is its parallel. Sent
  // in `opened`, never in a frame, and matched on `resumeHost`.
  private readonly hostToken: string;
  // Cancel handle for the host's pending grace-window reap (a host has no playerId,
  // so it can't live in `reapers`); undefined while the host is attached.
  private hostReaper: (() => void) | undefined;
  private pendingBroadcast = false;

  constructor(
    room: Room,
    private readonly registry: Registry,
    private readonly deps: ServerDeps,
    // Called once the room has closed: the hub drops it from the registry *and*
    // unbinds every still-attached connection (the bystanders closed out with it).
    private readonly onClosed: (code: string, conns: readonly Connection[]) => void,
  ) {
    this.room = room;
    this.hostToken = deps.roomDeps.secret();
  }

  get code(): string {
    return this.room.code;
  }

  /**
   * Attach the host connection. The host is not a player, so it never gets a
   * `joined` — it learns its own room code from `frame.code`, which is why the
   * open must push it a frame immediately (5.1 review note).
   */
  addHost(conn: Connection): void {
    this.members.set(conn, { role: 'host' });
    // The host's resume secret — sent only here (and on `resumeHost`), never in a
    // frame roster (parallel to a player's `joined` + reconnect token).
    conn.send({ type: 'opened', code: this.room.code, hostToken: this.hostToken });
    this.scheduleBroadcast();
  }

  /**
   * A reloaded host reconnects with the secret from its `opened` (7.1). Verify the
   * token, swap the live socket onto the `{ role: 'host' }` viewer, call off the
   * grace reaper, and re-ack with `opened` (so the client re-persists it). Returns
   * whether the resume was accepted.
   */
  resumeHost(conn: Connection, hostToken: string): boolean {
    if (hostToken !== this.hostToken) {
      conn.send(this.errorMsg('BAD_HOST_TOKEN'));
      return false;
    }
    this.cancelHostReap();
    this.evictHost(); // drop the stale host socket (likely already dead)
    this.members.set(conn, { role: 'host' });
    conn.send({ type: 'opened', code: this.room.code, hostToken: this.hostToken });
    this.scheduleBroadcast();
    return true;
  }

  /** Add (or, on a matching reconnect token, resume) a player. Returns whether it joined. */
  join(conn: Connection, nickname: string, reconnectToken?: string): boolean {
    const before = new Set(this.room.players.map((p) => p.id));
    const event: RoomEvent =
      reconnectToken === undefined
        ? { type: 'join', nickname }
        : { type: 'join', nickname, reconnectToken };
    // `join` ignores the actor in core; the joining connection has no identity yet.
    const result = this.apply(event, { role: 'host' });
    if (!result.ok) {
      this.sendError(conn, result.error);
      return false;
    }
    const added = this.room.players.find((p) => !before.has(p.id));
    // New join -> the id core just minted; resume -> the id the token maps to.
    const playerId =
      added?.id ??
      (reconnectToken === undefined ? undefined : playerIdForToken(this.room, reconnectToken));
    const token = playerId === undefined ? undefined : this.room.tokens[playerId];
    if (playerId === undefined || token === undefined) {
      conn.send(this.errorMsg('JOIN_FAILED'));
      return false;
    }
    if (added === undefined) {
      // A reconnect resumed an existing slot — it came back inside the grace
      // window, so call off the reaper, then swap the live socket onto that id
      // (the stale one is likely already dead) without a spurious core leave.
      this.cancelReap(playerId);
      this.evict(playerId);
    }
    this.members.set(conn, { role: 'player', id: playerId });
    // The token is the resume secret — sent only here, never in a frame roster.
    conn.send({ type: 'joined', code: this.room.code, playerId, reconnectToken: token });
    return true;
  }

  hostAction(conn: Connection, action: HostAction, gameId?: string, config?: unknown): void {
    const viewer = this.members.get(conn);
    if (viewer === undefined || viewer.role !== 'host') {
      conn.send(this.errorMsg('NOT_HOST'));
      return;
    }
    const event = hostEvent(action, gameId, config);
    if (event === null) {
      conn.send(this.errorMsg('NO_GAME_ID')); // 5.1 review: selectGame requires a gameId
      return;
    }
    const result = this.apply(event, viewer);
    if (!result.ok) {
      this.sendError(conn, result.error);
    }
  }

  play(conn: Connection, rawEvent: unknown): void {
    const viewer = this.members.get(conn);
    if (viewer === undefined) {
      conn.send(this.errorMsg('NOT_IN_ROOM'));
      return;
    }
    const advance = isAdvance(rawEvent);
    if (viewer.role === 'host') {
      // The host's only game event is the phase advance it forces (host authority);
      // it is not a player, so it may not submit or guess.
      if (!advance) {
        conn.send(this.errorMsg('HOST_CANNOT_PLAY'));
        return;
      }
      this.forwardGameEvent(conn, rawEvent, viewer);
      return;
    }
    // A player acts as itself, never advances — only the host forces the phase.
    if (advance) {
      conn.send(this.errorMsg('ADVANCE_IS_HOST_ONLY'));
      return;
    }
    this.forwardGameEvent(conn, stampPlayerId(rawEvent, viewer.id), viewer);
  }

  leave(conn: Connection): void {
    const viewer = this.members.get(conn);
    if (viewer === undefined) {
      return;
    }
    this.members.delete(conn);
    // An explicit leave reaps now — call off any grace reaper for this slot first.
    if (viewer.role === 'player') {
      this.cancelReap(viewer.id);
    }
    this.apply({ type: 'leave' }, viewer);
  }

  /**
   * A dropped socket detaches but keeps the player's slot alive for a grace
   * window: a reload or flaky network reconnects with the same token and
   * resumes it. After the window the slot is reaped like a real leave. The host
   * gets the same grace (7.1): a host drop schedules a reap and `resumeHost`
   * re-attaches within the window; only the timeout closes the room (P6).
   */
  disconnect(conn: Connection): void {
    const viewer = this.members.get(conn);
    if (viewer === undefined) {
      return;
    }
    this.members.delete(conn);
    if (viewer.role === 'host') {
      this.scheduleHostReap();
      return;
    }
    this.scheduleReap(viewer.id);
  }

  private scheduleHostReap(): void {
    this.cancelHostReap(); // a fresh drop restarts the window
    this.hostReaper = this.deps.schedule(() => {
      this.hostReaper = undefined;
      // The board was abandoned: close the room as a host leave (P6).
      this.apply({ type: 'leave' }, { role: 'host' });
    }, RECONNECT_GRACE_MS);
  }

  private cancelHostReap(): void {
    if (this.hostReaper !== undefined) {
      this.hostReaper();
      this.hostReaper = undefined;
    }
  }

  private evictHost(): void {
    for (const [conn, viewer] of this.members) {
      if (viewer.role === 'host') {
        this.members.delete(conn);
      }
    }
  }

  private scheduleReap(playerId: string): void {
    this.cancelReap(playerId); // a fresh drop restarts the window
    const cancel = this.deps.schedule(() => {
      this.reapers.delete(playerId);
      // The slot was abandoned: leave as that player (drops it and its token,
      // and closes the room if it was the last one).
      this.apply({ type: 'leave' }, { role: 'player', id: playerId });
    }, RECONNECT_GRACE_MS);
    this.reapers.set(playerId, cancel);
  }

  private cancelReap(playerId: string): void {
    const cancel = this.reapers.get(playerId);
    if (cancel !== undefined) {
      cancel();
      this.reapers.delete(playerId);
    }
  }

  private forwardGameEvent(conn: Connection, event: unknown, actor: Viewer): void {
    const result = this.apply({ type: 'gameEvent', event }, actor);
    if (!result.ok) {
      this.sendError(conn, result.error);
    }
  }

  private evict(playerId: string): void {
    for (const [conn, viewer] of this.members) {
      if (viewer.role === 'player' && viewer.id === playerId) {
        this.members.delete(conn);
      }
    }
  }

  private apply(event: RoomEvent, actor: Viewer): Result<Room, RoomError> {
    const result = roomReduce(this.room, event, actor, {
      registry: this.registry,
      roomDeps: this.deps.roomDeps,
      gameDeps: this.deps.gameDeps,
    });
    if (result.ok) {
      this.room = result.value;
      this.scheduleBroadcast();
    }
    return result;
  }

  private scheduleBroadcast(): void {
    if (this.pendingBroadcast) {
      return;
    }
    this.pendingBroadcast = true;
    queueMicrotask(() => {
      this.pendingBroadcast = false;
      this.broadcast();
    });
  }

  private broadcast(): void {
    if (this.room.closed) {
      const conns = [...this.members.keys()];
      for (const conn of conns) {
        conn.send(this.errorMsg('ROOM_CLOSED'));
      }
      this.members.clear();
      // The room is gone; cancel any pending reaps (player and host) so no timer
      // fires into a dead session after the hub has dropped it.
      for (const cancel of this.reapers.values()) {
        cancel();
      }
      this.reapers.clear();
      this.cancelHostReap();
      this.onClosed(this.room.code, conns); // hand the bystanders back so the hub unbinds them
      return;
    }
    for (const [conn, viewer] of this.members) {
      conn.send(this.frameFor(viewer));
    }
  }

  private frameFor(viewer: Viewer): ServerMessage {
    const { code, phase, players, selectedGameId, sessionScores, round, gameConfig } = this.room;
    const game = this.gameFor(viewer);
    // Session length (Cycle 12): the active game's roundCount for the host config, so the host
    // ends the game once the questions are spent. 0 when no game is selected (unbounded).
    const activeGame = selectedGameId === null ? undefined : this.registry.get(selectedGameId);
    const roundsTotal = activeGame?.roundCount?.(gameConfig) ?? 0;
    return {
      type: 'frame',
      code,
      phase,
      players: players.map((p) => ({ id: p.id, nickname: p.nickname, spectator: p.spectator })),
      selectedGameId,
      // `?? null` pins the type to non-undefined: the wire schema requires a frame
      // to always carry a gameView (null when no game is live).
      gameView: game.view ?? null,
      scores: game.scores,
      // Cross-round tally (S6) — non-secret (past revealed rounds only), sent to every
      // viewer as a Score[] so the board can show cumulative standings + a round counter.
      sessionScores: Object.entries(sessionScores).map(([playerId, points]) => ({
        playerId,
        points,
      })),
      round,
      roundsTotal,
    };
  }

  /**
   * The redacted per-viewer game payload. The view is whatever `packages/games`
   * exposes to *this* viewer; scores are a reveal-time fact, withheld until the
   * SCORES phase so a player can't learn whether a guess was right early.
   */
  private gameFor(viewer: Viewer): { view: unknown; scores: Score[] | null } {
    const { selectedGameId, gameState, phase } = this.room;
    const game = selectedGameId === null ? undefined : this.registry.get(selectedGameId);
    if (game === undefined || gameState === null || phase === 'LOBBY') {
      return { view: null, scores: null };
    }
    return {
      view: game.view(gameState, viewer),
      scores: phase === 'SCORES' ? game.scores(gameState) : null,
    };
  }

  private errorMsg(message: string): ServerMessage {
    return { type: 'error', code: this.room.code, message };
  }

  /** Relay a core rejection, keeping its inner reason (GAME_REJECTED carries the game's code). */
  private sendError(conn: Connection, error: RoomError): void {
    const message = error.message === undefined ? error.code : `${error.code}: ${error.message}`;
    conn.send(this.errorMsg(message));
  }
}

/** Map a host action to a core event; null iff selectGame arrived without a gameId. */
function hostEvent(action: HostAction, gameId?: string, config?: unknown): RoomEvent | null {
  switch (action) {
    case 'selectGame':
      return gameId === undefined ? null : { type: 'selectGame', gameId };
    case 'configureGame':
      // Forwarded opaque — the room stores it, the game validates it. An absent config
      // is valid (clears the room back to the game's built-in default).
      return { type: 'configureGame', config };
    case 'startGame':
      return { type: 'startGame' };
    case 'endGame':
      return { type: 'endGame' };
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** `{ type: 'advance' }` is the platform-wide phase-advance convention (CLAUDE.md). */
function isAdvance(event: unknown): boolean {
  return isObject(event) && event.type === 'advance';
}

/** Overwrite any client-supplied playerId with the authenticated one (authority). */
function stampPlayerId(event: unknown, playerId: string): unknown {
  return isObject(event) ? { ...event, playerId } : event;
}
