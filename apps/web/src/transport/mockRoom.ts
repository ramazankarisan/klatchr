import {
  type GameDeps,
  type Player,
  type PlayerId,
  type Room,
  type RoomDeps,
  type RoomEvent,
  type Viewer,
  createRegistry,
  createRoom,
  roomReduce,
} from '@klatchr/core';
import { games } from '@klatchr/games';
import type { Action, ConnStatus, PublicPlayer, Transport, ViewFrame } from './types.js';

const HOST: Viewer = { role: 'host' };

const DEMO_NAMES = [
  'Priya',
  'Marcus',
  'Lena',
  'Dev',
  'Sofia',
  'Theo',
  'Amara',
  'Jonah',
  'Wei',
  'Bianca',
  'Omar',
  'Nadia',
  'Kofi',
];
const ANSWERS = [
  'Cereal is a soup.',
  'The book is not always better than the movie.',
  'Socks with sandals are simply practical.',
  'A hot dog is, definitionally, a taco.',
  'Pineapple belongs on pizza.',
  'The middle seat should get both armrests.',
  'Tabs, never spaces.',
  'A phone call is more rude than a text.',
  'Breakfast food is best at night.',
  'The dictionary is a descriptivist project.',
  'Mondays are underrated.',
  'Reply-all has its place.',
];

interface Sub {
  viewer: Viewer;
  cb: (frame: ViewFrame) => void;
}

/**
 * The mock "server": the real pure `core` room plus `guessWho`, run in the
 * browser as the dev/test transport (no server needed for RTL tests). It seats
 * bot players; the host drives real phase advances and the bots respond
 * automatically (`driveBots`), so a host surface plays a whole round. Every
 * frame it emits is `view(state, viewer)` — genuinely redacted, never raw state.
 */
class MockEngine {
  private room: Room;
  private readonly registry = createRegistry(games);
  private readonly roomDeps: RoomDeps = makeRoomDeps();
  private readonly gameDeps: GameDeps = { random: () => Math.random(), now: () => 0 };
  private readonly subs = new Set<Sub>();
  private readonly answered = new Map<PlayerId, string>();

  constructor() {
    this.room = createRoom(this.roomDeps);
    for (const name of DEMO_NAMES) {
      this.apply(HOST, { type: 'join', nickname: name });
    }
  }

  /** The first seated player — the identity a mock player-phone binds to. */
  firstPlayerId(): PlayerId {
    return this.room.players[0]?.id ?? '';
  }

  subscribe(viewer: Viewer, cb: (frame: ViewFrame) => void): () => void {
    const sub: Sub = { viewer, cb };
    this.subs.add(sub);
    cb(this.frameFor(viewer));
    return () => {
      this.subs.delete(sub);
    };
  }

  send(actor: Viewer, action: Action): void {
    switch (action.type) {
      case 'selectGame':
        this.apply(actor, { type: 'selectGame', gameId: action.gameId });
        break;
      case 'startGame':
        this.apply(actor, { type: 'startGame' });
        break;
      case 'endGame':
        this.apply(actor, { type: 'endGame' });
        break;
      case 'gameEvent':
        this.apply(actor, { type: 'gameEvent', event: action.event });
        break;
    }
    this.driveBots();
  }

  private frameFor(viewer: Viewer): ViewFrame {
    const room = this.room;
    const game = room.selectedGameId === null ? undefined : this.registry.get(room.selectedGameId);
    const live = game !== undefined && room.gameState !== null && room.phase !== 'LOBBY';
    return {
      code: room.code,
      phase: room.phase,
      viewer,
      players: room.players.map(toPublic),
      selectedGameId: room.selectedGameId,
      gameView: live ? game.view(room.gameState, viewer) : null,
      // Scores are a reveal-time fact — never shipped during collect/guess, or a
      // player would learn whether their guesses were right before the reveal.
      scores: live && room.phase === 'SCORES' ? game.scores(room.gameState) : null,
    };
  }

  private apply(actor: Viewer, event: RoomEvent): void {
    const result = roomReduce(this.room, event, actor, {
      registry: this.registry,
      roomDeps: this.roomDeps,
      gameDeps: this.gameDeps,
    });
    if (result.ok) {
      this.room = result.value;
      this.emit();
    }
  }

  private emit(): void {
    for (const sub of this.subs) {
      sub.cb(this.frameFor(sub.viewer));
    }
  }

  private active(): readonly Player[] {
    return this.room.players.filter((p) => !p.spectator);
  }

  private gamePhase(): string {
    const view = this.frameFor(HOST).gameView;
    return isPhased(view) ? view.phase : '';
  }

  /** After a host advance, the bots fill in the current phase so the round moves. */
  private driveBots(): void {
    if (this.room.phase !== 'IN_GAME') {
      return;
    }
    const phase = this.gamePhase();
    if (phase === 'collect') {
      this.botsSubmit();
    } else if (phase === 'guess') {
      this.botsGuess();
    } else if (phase === 'vote') {
      this.botsVote();
    }
  }

  private botsVote(): void {
    const ids = this.active().map((p) => p.id);
    for (const player of this.active()) {
      const target = ids[Math.floor(Math.random() * ids.length)] ?? player.id;
      this.apply(HOST, {
        type: 'gameEvent',
        event: { type: 'vote', playerId: player.id, target },
      });
    }
  }

  private botsSubmit(): void {
    for (const [i, player] of this.active().entries()) {
      const text = ANSWERS[i % ANSWERS.length] ?? 'No comment.';
      this.answered.set(player.id, text);
      this.apply(HOST, { type: 'gameEvent', event: { type: 'submit', playerId: player.id, text } });
    }
  }

  private botsGuess(): void {
    const ids = this.active().map((p) => p.id);
    for (const player of this.active()) {
      const view = this.frameFor({ role: 'player', id: player.id }).gameView;
      if (!hasCards(view)) {
        continue;
      }
      const mine = this.answered.get(player.id);
      for (const card of view.cards) {
        if (card.text === mine) {
          continue; // never guess your own card
        }
        const author = ids[Math.floor(Math.random() * ids.length)] ?? player.id;
        this.apply(HOST, {
          type: 'gameEvent',
          event: { type: 'guess', playerId: player.id, cardId: card.id, author },
        });
      }
    }
  }
}

/** A single-viewer `Transport` over a `MockEngine` — binds one viewer to the engine. */
class MockTransport implements Transport {
  constructor(
    private readonly engine: MockEngine,
    private readonly viewer: Viewer,
  ) {}

  subscribe(onFrame: (frame: ViewFrame) => void): () => void {
    return this.engine.subscribe(this.viewer, onFrame);
  }

  /** The in-browser mock has no socket to drop — it is always `live`. */
  subscribeStatus(onStatus: (status: ConnStatus) => void): () => void {
    onStatus('live');
    return () => {};
  }

  /** The mock plays the pure engine directly — no server, so no server errors. */
  subscribeError(): () => void {
    return () => {};
  }

  send(action: Action): void {
    this.engine.send(this.viewer, action);
  }
}

/** Dev/test host board: you drive the round, bots respond. */
export function mockHostTransport(): Transport {
  return new MockTransport(new MockEngine(), { role: 'host' });
}

/** Dev/test player phone: you are seated in a bot-populated room. */
export function mockPlayerTransport(): Transport {
  const engine = new MockEngine();
  return new MockTransport(engine, { role: 'player', id: engine.firstPlayerId() });
}

function toPublic(p: Player): PublicPlayer {
  return { id: p.id, nickname: p.nickname, spectator: p.spectator };
}

function makeRoomDeps(): RoomDeps {
  let ids = 0;
  let secrets = 0;
  return {
    random: () => Math.random(),
    id: () => {
      ids += 1;
      return `id-${ids}`;
    },
    secret: () => {
      secrets += 1;
      return `secret-${secrets}`;
    },
  };
}

function isPhased(view: unknown): view is { phase: string } {
  return typeof view === 'object' && view !== null && 'phase' in view;
}

function hasCards(view: unknown): view is { cards: readonly { id: string; text: string }[] } {
  return typeof view === 'object' && view !== null && 'cards' in view;
}
