import type { Action, ConnStatus, Transport, ViewFrame } from './transport/types.js';

/** A transport that delivers one fixed frame and records what a screen sends — the shared
 * host/player screen test double. Real subscriptions (status `live` unless given, no
 * errors), no socket. */
export class FrameTransport implements Transport {
  readonly sent: Action[] = [];
  constructor(
    private readonly frame: ViewFrame,
    private readonly status: ConnStatus = 'live',
  ) {}
  subscribe(onFrame: (f: ViewFrame) => void): () => void {
    onFrame(this.frame);
    return () => {};
  }
  subscribeStatus(onStatus: (s: ConnStatus) => void): () => void {
    onStatus(this.status);
    return () => {};
  }
  subscribeError(): () => void {
    return () => {};
  }
  send(action: Action): void {
    this.sent.push(action);
  }
  disposed = false;
  dispose(): void {
    this.disposed = true;
  }
}
