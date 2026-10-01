import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Exit cleanly while a branch has no test files, so that `npm test` is a
    // usable signal on every commit.
    passWithNoTests: true,
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
