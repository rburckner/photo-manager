import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Backend tests only — web/ has its own Karma/Jasmine test setup via Angular CLI.
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**', 'web/**'],
  },
});
