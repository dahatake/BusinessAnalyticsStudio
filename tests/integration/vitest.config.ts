import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.mjs'],
    environment: 'node',
    testTimeout: 300_000,
    maxWorkers: 1,
  },
});
