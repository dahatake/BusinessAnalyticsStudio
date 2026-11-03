import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url)).replaceAll('\\', '/').replace(/\/$/, '');

export default defineConfig({
  server: {
    fs: {
      strict: true,
      allow: [repoRoot],
      // FR-141: land verifies a checkout below an ancestor .git directory.
      // Keep secret-file denies, but scope Git metadata denial to this repo.
      deny: ['.env', '.env.*', '*.{crt,pem}', `${repoRoot}/**/.git/**`],
    },
  },
  test: {
    include: ['tests/integration/**/*.test.mjs'],
    environment: 'node',
    testTimeout: 300_000,
    maxWorkers: 1,
  },
});
