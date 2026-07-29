import { useEffect, useState } from 'react';
import type { ConnStatus, Transport } from './transport/types.js';

/**
 * Subscribe a component to its transport's connection status (7.2). Starts at
 * `connecting`; the transport pushes `live` / `reconnecting` as the socket heals.
 * The mock transport is always `live`, so the indicator never shows in dev/tests.
 */
export function useStatus(transport: Transport): ConnStatus {
  const [status, setStatus] = useState<ConnStatus>('connecting');
  useEffect(() => transport.subscribeStatus(setStatus), [transport]);
  return status;
}
