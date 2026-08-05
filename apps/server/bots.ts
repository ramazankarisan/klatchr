/**
 * bots — a load/soak tool (plan-14 L4). Drives many real protocol WebSocket
 * clients at a target Klatchr server to surface races/leaks a single-threaded
 * test can't: dozens of concurrent joins, churn, keepalive under load. NOT a
 * pass/fail gate (not in `pnpm gate` or `pnpm e2e`); a manual smoke.
 *
 *   pnpm bots --players 20 [--chaos] [--url ws://localhost:8080] [--seconds 15]
 *
 * One bot opens a room as host and picks a game; `--players N` bots join and
 * loop sensible moves by role (submit/vote/guess, the host advances); `--chaos`
 * randomly drops and reconnects a fraction to exercise grace/reap/reclaim under
 * load. Every inbound frame is parsed with `@klatchr/protocol` (rule 2). Exits
 * non-zero if any error frame or socket error was seen, so a soak is scriptable.
 *
 * This is a dev script (outside `src`, so it is not shipped, coverage-scanned,
 * or knip-analysed); `Math.random`/`Date.now` are legitimate here.
 */
import { type ClientMessage, type ServerMessage, serverMessage } from '@klatchr/protocol';
import { WebSocket } from 'ws';

interface Options {
  players: number;
  chaos: boolean;
  url: string;
  seconds: number;
  gameId: string;
}

function parseArgs(argv: readonly string[]): Options {
  const opts: Options = {
    players: 12,
    chaos: false,
    url: 'ws://localhost:8080',
    seconds: 15,
    gameId: 'most-likely-to',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--chaos') {
      opts.chaos = true;
    } else if (arg === '--players' && next !== undefined) {
      opts.players = Number(next);
      i += 1;
    } else if (arg === '--url' && next !== undefined) {
      opts.url = next;
      i += 1;
    } else if (arg === '--seconds' && next !== undefined) {
      opts.seconds = Number(next);
      i += 1;
    } else if (arg === '--game' && next !== undefined) {
      opts.gameId = next;
      i += 1;
    }
  }
  return opts;
}

const stats = { frames: 0, rejections: 0, errors: 0, connects: 0, socketErrors: 0 };

// Game/flow rejections that a fast async crowd naturally produces (a vote lands
// just after the host advanced, a spectator tries to act) — expected noise, not
// a defect. Anything else (a room/protocol error) is a real problem.
const BENIGN = new Set([
  'WRONG_PHASE',
  'GAME_REJECTED',
  'NOT_PLAYING',
  'NOT_A_PLAYER',
  'OWN_CARD',
  'NO_SUCH_CARD',
  'GAME_EVENT_OUTSIDE_GAME',
  'SESSION_COMPLETE',
  'BELOW_MIN_PLAYERS',
]);

function classifyError(message: string | undefined): void {
  const code = (message ?? '').split(':')[0]?.trim() ?? '';
  if (BENIGN.has(code)) {
    stats.rejections += 1;
  } else {
    stats.errors += 1;
    log(`  ! error frame: ${message}`);
  }
}

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const jitter = (ms: number): number => Math.floor(ms * (0.5 + Math.random()));

/** A single connected client: parses inbound, tracks the latest frame + its own id. */
class Bot {
  socket: WebSocket;
  frame: Extract<ServerMessage, { type: 'frame' }> | undefined;
  playerId: string | undefined;
  reconnectToken: string | undefined;

  constructor(
    private readonly url: string,
    private readonly onFrame: (bot: Bot) => void,
    onOpen: () => void,
  ) {
    this.socket = this.connect(onOpen);
  }

  private connect(onOpen: () => void): WebSocket {
    const socket = new WebSocket(this.url);
    socket.on('open', () => {
      stats.connects += 1;
      onOpen();
    });
    socket.on('message', (data) => {
      const parsed = serverMessage.safeParse(JSON.parse(data.toString()));
      if (!parsed.success) {
        return; // a real client drops off-schema payloads (rule 2)
      }
      const message = parsed.data;
      if (message.type === 'error') {
        classifyError(message.message);
        return;
      }
      if (message.type === 'joined') {
        this.playerId = message.playerId;
        this.reconnectToken = message.reconnectToken;
        return;
      }
      if (message.type === 'frame') {
        stats.frames += 1;
        this.frame = message;
        this.onFrame(this);
      }
    });
    socket.on('error', () => {
      stats.socketErrors += 1;
    });
    return socket;
  }

  send(message: ClientMessage): void {
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  reconnect(code: string, nickname: string): void {
    // Reconnect resumes the slot with the stored token — a single join on the new
    // socket, never the constructor's fresh join (that would double-join).
    this.socket = this.connect(() =>
      this.send({ type: 'join', code, nickname, reconnectToken: this.reconnectToken }),
    );
  }

  close(): void {
    this.socket.close();
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  log(`bots: ${opts.players} players → ${opts.url} (${opts.gameId}${opts.chaos ? ', chaos' : ''})`);

  // The host opens a room and picks the game; capture its code from the frame.
  let code: string | undefined;
  const host = new Bot(
    opts.url,
    (bot) => {
      code ??= bot.frame?.code;
    },
    () => host.send({ type: 'open', nickname: 'HostBot' }),
  );
  await waitFor(() => code !== undefined, 5000);
  if (code === undefined) {
    log('bots: host never opened a room — is the server up?');
    process.exitCode = 1;
    return;
  }
  host.send({ type: 'host', code, action: 'selectGame', gameId: opts.gameId });

  const roomCode = code;
  const players = Array.from({ length: opts.players }, (_, i) => {
    const bot: Bot = new Bot(
      opts.url,
      () => {},
      () => bot.send({ type: 'join', code: roomCode, nickname: `Bot${i}` }),
    );
    return bot;
  });
  await sleep(500);
  host.send({ type: 'host', code: roomCode, action: 'startGame' });

  const deadline = Date.now() + opts.seconds * 1000;
  while (Date.now() < deadline) {
    driveHost(host, roomCode);
    for (const bot of players) {
      act(bot, roomCode);
    }
    if (opts.chaos) {
      churn(players, roomCode);
    }
    host.send({ type: 'ping' }); // keepalive under load (F3)
    await sleep(jitter(400));
  }

  log(
    `bots: done — ${stats.connects} connects, ${stats.frames} frames, ` +
      `${stats.rejections} benign rejections, ${stats.errors} errors, ` +
      `${stats.socketErrors} socket errors`,
  );
  for (const bot of players) {
    bot.close();
  }
  host.close();
  // A benign phase-race rejection is expected under a fast crowd; only a real
  // room/protocol error or a socket error fails the run (plan-14 A7).
  if (stats.errors > 0 || stats.socketErrors > 0) {
    process.exitCode = 1;
  }
}

/** The host drives phases from its own frame, so it never fires an event into
 * the wrong phase. It advances only once everyone seated has acted (so no late
 * action races the phase change), and restarts a spent session to keep the
 * soak producing rounds. */
function driveHost(host: Bot, code: string): void {
  const frame = host.frame;
  if (frame === undefined) {
    return;
  }
  if (frame.phase === 'IN_GAME') {
    const view = frame.gameView as HostGameView | null;
    if (view !== null && everyoneActed(view)) {
      host.send({ type: 'play', code, event: { type: 'advance', from: view.phase } });
    }
    return;
  }
  if (frame.phase === 'SCORES' && frame.roundsTotal > 0 && frame.round >= frame.roundsTotal) {
    // The set is spent — restart the session so the soak keeps running.
    host.send({ type: 'host', code, action: 'selectGame', gameId: frame.selectedGameId ?? '' });
    return;
  }
  host.send({ type: 'host', code, action: 'startGame' }); // LOBBY, or next round from SCORES
}

interface HostGameView {
  phase: 'collect' | 'guess' | 'vote' | 'results' | 'reveal';
  votedCount?: number;
  submittedCount?: number;
  guessed?: string[];
  total?: number;
}

/** Has everyone seated acted this phase, so the host can advance without racing
 * a late action? Progress counts come straight from the host's own view. */
function everyoneActed(view: HostGameView): boolean {
  const total = view.total ?? 0;
  if (view.phase === 'vote') {
    return (view.votedCount ?? 0) >= total;
  }
  if (view.phase === 'collect') {
    return (view.submittedCount ?? 0) >= total;
  }
  if (view.phase === 'guess') {
    return (view.guessed?.length ?? 0) >= total;
  }
  return false;
}

interface PlayerGameView {
  phase: 'collect' | 'guess' | 'vote' | 'results' | 'reveal';
  candidates?: string[];
  cards?: Array<{ id: string }>;
  youVoted?: boolean;
  youSubmitted?: boolean;
  yourCardId?: string;
  myGuesses?: Record<string, string>;
}

/** Send this bot's move for the current phase, once — driven by the view's own
 * "you already acted" flags, so a bot never double-acts or fires into the wrong
 * phase. A spectator (mid-round joiner) sits the round out. */
function act(bot: Bot, code: string): void {
  const frame = bot.frame;
  if (frame?.phase !== 'IN_GAME' || bot.playerId === undefined) {
    return;
  }
  if (frame.players.find((p) => p.id === bot.playerId)?.spectator === true) {
    return; // a spectator can't act this round
  }
  const view = frame.gameView as PlayerGameView | null;
  if (view === null) {
    return;
  }
  if (view.phase === 'vote' && view.youVoted !== true && view.candidates?.length) {
    bot.send({ type: 'play', code, event: { type: 'vote', target: pick(view.candidates) } });
  } else if (view.phase === 'collect' && view.youSubmitted !== true) {
    const text = `bot-${Math.random().toString(36).slice(2, 7)}`;
    bot.send({ type: 'play', code, event: { type: 'submit', text } });
  } else if (view.phase === 'guess') {
    guessOne(bot, code, view);
  }
}

/** Guess one not-yet-guessed card (never your own), so the room's `guessed`
 * count climbs to everyone and the host advances cleanly. */
function guessOne(bot: Bot, code: string, view: PlayerGameView): void {
  const guessed = view.myGuesses ?? {};
  const candidates = view.candidates ?? [];
  if (candidates.length === 0) {
    return;
  }
  for (const card of view.cards ?? []) {
    if (card.id !== view.yourCardId && guessed[card.id] === undefined) {
      bot.send({
        type: 'play',
        code,
        event: { type: 'guess', cardId: card.id, author: pick(candidates) },
      });
      return;
    }
  }
}

/** Randomly drop ~1 in 8 bots and reconnect them — the grace/reap/reclaim path. */
function churn(players: readonly Bot[], code: string): void {
  for (const [i, bot] of players.entries()) {
    if (Math.random() < 0.12) {
      bot.close();
      bot.reconnect(code, `Bot${i}`);
    }
  }
}

function pick<T>(items: readonly T[]): T {
  const item = items[Math.floor(Math.random() * items.length)];
  if (item === undefined) {
    throw new Error('pick from empty list');
  }
  return item;
}

async function waitFor(check: () => boolean, ms: number): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (check()) {
      return;
    }
    await sleep(20);
  }
}

main().catch((error: unknown) => {
  log(`bots: crashed — ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
