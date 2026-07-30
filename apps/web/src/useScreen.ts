import { recoverFor } from './errors.js';
import type { Transport, ViewFrame } from './transport/types.js';
import { useError } from './useError.js';
import { useFrame } from './useFrame.js';
import { useStatus } from './useStatus.js';

/**
 * The three cross-cutting subscriptions every game surface needs (8.1): the current
 * frame, whether the socket is reconnecting, and the recover-card props for a fatal
 * error (or null to render normally). Shared by the host and player screens, which
 * differ only in their frame wrapper and the recover action label.
 */
interface ScreenState {
  frame: ViewFrame | null;
  reconnecting: boolean;
  recover: ReturnType<typeof recoverFor>;
}

export function useScreen(
  transport: Transport,
  onExit: () => void,
  recoverLabel: string,
): ScreenState {
  const frame = useFrame(transport);
  const reconnecting = useStatus(transport) === 'reconnecting';
  const error = useError(transport);
  return { frame, reconnecting, recover: recoverFor(error, onExit, recoverLabel) };
}
