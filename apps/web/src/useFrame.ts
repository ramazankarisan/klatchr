import type { Viewer } from '@klatchr/core';
import { useEffect, useState } from 'react';
import type { MockEngine } from './transport/mockRoom.js';
import type { ViewFrame } from './transport/types.js';

const viewerOf = (role: 'host' | 'player', id: string): Viewer =>
  role === 'host' ? { role: 'host' } : { role: 'player', id };

/** Subscribe a component to one viewer's redacted frame stream. */
export function useFrame(engine: MockEngine, role: 'host' | 'player', id = ''): ViewFrame {
  const [frame, setFrame] = useState<ViewFrame>(() => engine.snapshot(viewerOf(role, id)));
  useEffect(() => engine.subscribe(viewerOf(role, id), setFrame), [engine, role, id]);
  return frame;
}
