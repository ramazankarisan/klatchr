import type { TransportError } from './transport/types.js';

/**
 * Maps a server error identifier (the `message` on a wire `error`) to human copy
 * for the full-screen recover card (8.1, design option A). Returns `null` for
 * anything that is *not* a fatal dead-end — a rejected in-game action
 * (`GAME_REJECTED: …`) or a benign lifecycle nudge (`ALREADY_IN_ROOM`,
 * `NOT_IN_ROOM`) leaves frames flowing and must not blow the screen away.
 */
interface ErrorCopy {
  title: string;
  body: string;
}

/** The props a `Recover` card needs — copy plus its one recover action. */
interface RecoverProps extends ErrorCopy {
  actionLabel: string;
  onAction: () => void;
}

const COPY: Record<string, ErrorCopy> = {
  NO_SUCH_ROOM: {
    title: 'No room with that code',
    body: "Check the four letters on the host's screen and try again.",
  },
  ROOM_FULL: {
    title: 'That room is full',
    body: 'This round is at capacity — ask the host to start a new round.',
  },
  EMPTY_NICKNAME: {
    title: 'Add your name',
    body: 'You need a name to join the room.',
  },
  ROOM_CLOSED: {
    title: 'Room closed',
    body: 'The host ended the room.',
  },
  BAD_HOST_TOKEN: {
    title: "Couldn't rejoin",
    body: 'That room has already ended.',
  },
  JOIN_FAILED: {
    title: "Couldn't join",
    body: 'Something went wrong — please try again.',
  },
};

export function describeError(message: string | undefined): ErrorCopy | null {
  if (message === undefined) {
    return null;
  }
  return COPY[message] ?? null;
}

/**
 * The recover-card props for a fatal error, or null to keep rendering normally.
 * Shared by both screens (they differ only in the wrapper and the action label).
 */
export function recoverFor(
  error: TransportError | null,
  onAction: () => void,
  actionLabel: string,
): RecoverProps | null {
  const copy = error === null ? null : describeError(error.message);
  return copy === null ? null : { ...copy, actionLabel, onAction };
}
