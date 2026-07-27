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
import type { Action, PublicPlayer, Transport, ViewFrame } from './types.js';

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
 * browser. It drives a demo round with bot players so a single browser shows
 * the whole flow — every frame it emits is `view(state, viewer)`, genuinely
 * redacted, never raw state.
 */
export class MockEngine implements Transport {
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

  subscribe(viewer: Viewer, cb: (frame: ViewFrame) => void): () => void {
    const sub: Sub = { viewer, cb };
    this.subs.add(sub);
    cb(this.frameFor(viewer));
    return () => {
      this.subs.delete(sub);
    };
  }

  send(actor: Viewer, action: Action): void {
    this.apply(actor, action);
  }

  /** Roster for the UI to open phones against (public info only). */
  roster(): readonly PublicPlayer[] {
    return this.room.players.map(toPublic);
  }

  /** The current redacted frame for a viewer, without subscribing. */
  snapshot(viewer: Viewer): ViewFrame {
    return this.frameFor(viewer);
  }

  /** Host-driven demo step: start a round, or advance the current phase, with bots acting. */
  step(): void {
    if (this.room.phase !== 'IN_GAME') {
      this.send(HOST, { type: 'selectGame', gameId: 'guess-who' });
      this.send(HOST, { type: 'startGame' });
      this.botsSubmit();
      return;
    }
    const phase = this.gamePhase();
    if (phase === 'collect') {
      this.send(HOST, { type: 'gameEvent', event: { type: 'advance', from: 'collect' } });
      this.botsGuess();
    } else if (phase === 'guess') {
      this.send(HOST, { type: 'gameEvent', event: { type: 'advance', from: 'guess' } });
    }
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
      scores: live ? game.scores(room.gameState) : null,
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

  private botsSubmit(): void {
    for (const [i, player] of this.active().entries()) {
      const text = ANSWERS[i % ANSWERS.length] ?? 'No comment.';
      this.answered.set(player.id, text);
      this.send(HOST, { type: 'gameEvent', event: { type: 'submit', playerId: player.id, text } });
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
        this.send(HOST, {
          type: 'gameEvent',
          event: { type: 'guess', playerId: player.id, cardId: card.id, author },
        });
      }
    }
  }
}

function toPublic(p: Player): PublicPlayer {
  return { id: p.id, nickname: p.nickname, spectator: p.spectator };
}

function makeRoomDeps(): RoomDeps {
  let n = 0;
  return {
    random: () => Math.random(),
    id: () => {
      n += 1;
      return `id-${n}`;
    },
  };
}

function isPhased(view: unknown): view is { phase: string } {
  return typeof view === 'object' && view !== null && 'phase' in view;
}

function hasCards(view: unknown): view is { cards: readonly { id: string; text: string }[] } {
  return typeof view === 'object' && view !== null && 'cards' in view;
}
