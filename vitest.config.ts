import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts', 'apps/*/src/**/*.test.tsx'],
    environmentMatchGlobs: [['apps/web/**', 'jsdom']],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts', 'apps/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.test.tsx', '**/*.testkit.ts'],
      thresholds: {
        'packages/core/src/**': {
          lines: 100,
          branches: 100,
          functions: 100,
          statements: 100,
        },
        'packages/games/src/**': {
          lines: 100,
          branches: 100,
          functions: 100,
          statements: 100,
        },
      },
    },
  },
});
