import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Ticket #2 ships no tests yet; the runner must still exit cleanly so that
    // `npm test` is a usable signal from the first commit onward.
    passWithNoTests: true,
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
