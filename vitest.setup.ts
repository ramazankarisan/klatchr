import { afterEach, vi } from 'vitest';

// Shared test setup, wired via vitest.config `setupFiles` — runs before every
// test file. Keep global, cross-cutting concerns here (not per-test arrange).
// Cycle 4 (apps/web) extends this with React Testing Library cleanup and
// jest-dom matchers.

// Restore any spies/mocks between tests so state never leaks across files.
afterEach(() => {
  vi.restoreAllMocks();
});
