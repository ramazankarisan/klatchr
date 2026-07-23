import { defineConfig } from '@playwright/test';

// E2E is populated at the end of Cycle 4 (two-context two-player round).
// Wired now so the dependency is real; not run on pre-commit.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  use: { baseURL: 'http://localhost:5173' },
});
