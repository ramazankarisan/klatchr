import { useEffect, useState } from 'react';
import type { Transport, TransportError } from './transport/types.js';

/**
 * Subscribe a component to its transport's server-error stream (8.1). Null until an
 * error arrives; the screens map it to copy and a recover affordance. The mock
 * transport never errors, so this stays null in dev/tests.
 */
export function useError(transport: Transport): TransportError | null {
  const [error, setError] = useState<TransportError | null>(null);
  useEffect(() => transport.subscribeError(setError), [transport]);
  return error;
}
