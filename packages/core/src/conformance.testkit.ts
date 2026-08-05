import fc from 'fast-check';
import type { GameDeps } from './deps.js';
import type { Game, RosterEvent } from './game.js';
import type { Player, PlayerId, Viewer } from './ids.js';

/**
 * The game conformance kit (plan-13 L1). Every registered game runs seeded
 * event storms through its real reducer and views; the kit checks platform
 * invariants at every step:
 *
 *   I1 totality — `reduce`/`view`/`scores`/`isComplete` never throw.
 *   I2 rejection contract — a refusal carries a non-empty typed error code
 *      (the input state is untouched — I3's freeze proves that half).
 *   I3 purity — input state is deep-frozen; any in-place mutation throws.
 *   I4 non-interference — pre-reveal, swapping one player's hidden submission
 *      must leave every OTHER viewer's view (host included) deep-equal.
 *   I5 scores — score keys ⊆ the players the game was seated with at init.
 *   I6 roster storms — playerJoined/playerLeft at any point are accepted.
 *
 * A failure prints the fast-check seed + shrunken event trace — an exact,
 * deterministic repro. A new game gets all of this for ~30 lines of
 * arbitraries (see ConformanceSpec).
 */

/** A parallel world in which exactly `playerId`'s hidden submission differs. */
export interface HiddenVariant<TState> {
  playerId: PlayerId;
  state: TState;
}

export interface ConformanceSpec<TState, TEvent> {
  game: Game<TState, TEvent>;
  /** One game event. `ids` mixes seated players with unknown ids on purpose —
   * events naming a ghost must be rejected cleanly, not crash. */
  arbEvent: (ids: readonly PlayerId[]) => fc.Arbitrary<TEvent>;
  /** I4 fuel: the single-player hidden swaps possible from `state`. Return []
   * when nothing is hidden (post-reveal, or a game with no hidden data) —
   * required, not optional, so skipping I4 is a visible decision. */
  hiddenVariants: (state: TState) => readonly HiddenVariant<TState>[];
  /** Host-authored configs to storm `init` with. Omitted ⇒ always undefined. */
  arbConfig?: fc.Arbitrary<unknown>;
  runs?: number; // default 200 (plan-13 A3)
  seed?: number; // fix for reproducible self-tests; omit ⇒ fresh seed per run
}

type Step<TEvent> =
  | { kind: 'game'; event: TEvent }
  | { kind: 'join'; player: Player }
  | { kind: 'leave'; id: PlayerId };

interface StormRun<TEvent> {
  seated: readonly PlayerId[];
  config: unknown;
  round: number;
  rand: number;
  steps: readonly Step<TEvent>[];
}

const GHOST_A = 'ghost-a'; // ids no game ever seated — events naming them must be
const GHOST_B = 'ghost-b'; // rejected cleanly, and a ghost viewer must still render
const GHOSTS: readonly PlayerId[] = [GHOST_A, GHOST_B];

function arbStorm<TState, TEvent>(
  spec: ConformanceSpec<TState, TEvent>,
): fc.Arbitrary<StormRun<TEvent>> {
  const { game } = spec;
  return fc.integer({ min: game.minPlayers, max: game.maxPlayers }).chain((n) => {
    const seated = Array.from({ length: n }, (_, i) => `p${i + 1}`);
    const pool = [...seated, ...GHOSTS];
    const arbStep: fc.Arbitrary<Step<TEvent>> = fc.oneof(
      {
        weight: 6,
        arbitrary: spec.arbEvent(pool).map((event) => ({ kind: 'game' as const, event })),
      },
      {
        weight: 1,
        arbitrary: fc.nat({ max: 3 }).map((k) => ({
          kind: 'join' as const,
          player: {
            id: `late-${k}`,
            nickname: `late-${k}`,
            joinedDuringGame: true,
            spectator: true,
          },
        })),
      },
      {
        weight: 1,
        arbitrary: fc.constantFrom(...pool).map((id) => ({ kind: 'leave' as const, id })),
      },
    );
    return fc.record({
      seated: fc.constant(seated as readonly PlayerId[]),
      config: spec.arbConfig ?? fc.constant(undefined),
      round: fc.integer({ min: 1, max: 8 }),
      rand: fc.nat({ max: 999 }),
      steps: fc.array(arbStep, { maxLength: 40 }),
    });
  });
}

function toEvent<TEvent>(step: Step<TEvent>): TEvent | RosterEvent {
  switch (step.kind) {
    case 'game':
      return step.event;
    case 'join':
      return { type: 'playerJoined', player: step.player };
    case 'leave':
      return { type: 'playerLeft', id: step.id };
  }
}

function playersFor(ids: readonly PlayerId[]): Player[] {
  return ids.map((id) => ({ id, nickname: id, joinedDuringGame: false, spectator: false }));
}

function viewersFor(seated: readonly PlayerId[]): Viewer[] {
  return [
    { role: 'host' },
    ...seated.map((id): Viewer => ({ role: 'player', id })),
    { role: 'player', id: GHOST_A }, // a viewer the game never seated
  ];
}

function invariant(cond: boolean, message: string): asserts cond {
  if (!cond) {
    throw new Error(message);
  }
}

/** Structural equality over the plain-data trees views are made of. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }
  const recA = a as Record<string, unknown>;
  const recB = b as Record<string, unknown>;
  const keysA = Object.keys(recA);
  const keysB = Object.keys(recB);
  return (
    keysA.length === keysB.length && keysA.every((k) => k in recB && deepEqual(recA[k], recB[k]))
  );
}

/** Freeze a state tree in place so any reducer mutation throws (I3). */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.getOwnPropertyNames(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

function depsFor(run: StormRun<unknown>): GameDeps {
  return { random: () => run.rand / 1000, now: () => 0, round: run.round };
}

/** I1 + I5 at one state: every viewer renders, scores stay inside the seats. */
function checkFrame<TState, TEvent>(
  game: Game<TState, TEvent>,
  state: TState,
  seated: readonly PlayerId[],
  viewers: readonly Viewer[],
): void {
  for (const viewer of viewers) {
    game.view(state, viewer); // I1: must not throw for any viewer at any state
  }
  for (const score of game.scores(state)) {
    invariant(
      seated.includes(score.playerId),
      `I5: score for ${score.playerId}, who was never seated`,
    );
  }
  game.isComplete(state); // totality, same contract
}

function checkStorm<TState, TEvent>(
  spec: ConformanceSpec<TState, TEvent>,
  run: StormRun<TEvent>,
): void {
  const { game } = spec;
  const viewers = viewersFor(run.seated);
  let state = game.init(playersFor(run.seated), depsFor(run), run.config);
  checkFrame(game, state, run.seated, viewers);
  for (const step of run.steps) {
    deepFreeze(state); // I3: an in-place mutation now throws (I1 surfaces it)
    const result = game.reduce(state, toEvent(step));
    if (!result.ok) {
      invariant(step.kind === 'game', `I6: roster event rejected (${result.error.code})`);
      invariant(
        typeof result.error.code === 'string' && result.error.code.length > 0,
        'I2: a rejection must carry a non-empty typed error code',
      );
      continue; // rejected ⇒ state stands (frozen, so provably untouched)
    }
    state = result.value;
    checkFrame(game, state, run.seated, viewers);
  }
}

function checkHidden<TState, TEvent>(
  spec: ConformanceSpec<TState, TEvent>,
  state: TState,
  seated: readonly PlayerId[],
): void {
  const { game } = spec;
  for (const variant of spec.hiddenVariants(state)) {
    for (const viewer of viewersFor(seated)) {
      if (viewer.role === 'player' && viewer.id === variant.playerId) {
        continue; // the swapped player may of course see their own change
      }
      const who = viewer.role === 'host' ? 'the host screen' : `player ${viewer.id}`;
      invariant(
        deepEqual(game.view(state, viewer), game.view(variant.state, viewer)),
        `I4: ${who}'s view depends on ${variant.playerId}'s hidden submission`,
      );
    }
  }
}

function assertProperty<TEvent>(
  spec: ConformanceSpec<never, TEvent> | ConformanceSpec<unknown, TEvent>,
  prop: fc.IPropertyWithHooks<[StormRun<TEvent>]>,
): void {
  const params: fc.Parameters<[StormRun<TEvent>]> = { numRuns: spec.runs ?? 200 };
  if (spec.seed !== undefined) {
    params.seed = spec.seed;
  }
  try {
    fc.assert(prop, params);
  } catch (failure) {
    // fast-check v4 buries the violated invariant in the `cause` chain; flatten
    // it into one message so the report (and any matcher) sees seed + trace + why.
    throw new Error(causeChain(failure).join('\n'), { cause: failure });
  }
}

function causeChain(failure: unknown): string[] {
  const messages: string[] = [];
  let current: unknown = failure;
  while (current instanceof Error) {
    messages.push(current.message);
    current = current.cause;
  }
  return messages;
}

/** I1, I2, I3, I5, I6 over seeded event storms. Throws on the first violation. */
export function stormConformance<TState, TEvent>(spec: ConformanceSpec<TState, TEvent>): void {
  assertProperty(
    spec as ConformanceSpec<unknown, TEvent>,
    fc.property(arbStorm(spec), (run) => {
      checkStorm(spec, run);
    }),
  );
}

/** I4 over the same storms: replay, and at every reached state compare worlds. */
export function redactionNonInterference<TState, TEvent>(
  spec: ConformanceSpec<TState, TEvent>,
): void {
  assertProperty(
    spec as ConformanceSpec<unknown, TEvent>,
    fc.property(arbStorm(spec), (run) => {
      const { game } = spec;
      let state = game.init(playersFor(run.seated), depsFor(run), run.config);
      checkHidden(spec, state, run.seated);
      for (const step of run.steps) {
        const result = game.reduce(state, toEvent(step));
        if (result.ok) {
          state = result.value;
          checkHidden(spec, state, run.seated);
        }
      }
    }),
  );
}

/** The whole kit: the storm invariants plus I4 non-interference. */
export function gameConformance<TState, TEvent>(spec: ConformanceSpec<TState, TEvent>): void {
  stormConformance(spec);
  redactionNonInterference(spec);
}
