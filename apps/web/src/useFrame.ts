import { useEffect, useState } from 'react';
import type { Transport, ViewFrame } from './transport/types.js';

/**
 * Subscribe a component to its transport's redacted frame stream. Null until the
 * first frame arrives (a socket is connecting; the mock delivers synchronously).
 */
export function useFrame(transport: Transport): ViewFrame | null {
  const [frame, setFrame] = useState<ViewFrame | null>(null);
  useEffect(() => transport.subscribe(setFrame), [transport]);
  return frame;
}
