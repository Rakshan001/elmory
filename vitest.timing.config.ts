import { defineConfig } from 'vitest/config';

// Timing bounds: `npm run test:timing`, on a quiet machine. `npm test` (and so `prepublishOnly`)
// skips them: a loaded machine fails them with nothing wrong in the code.
export default defineConfig({
  test: {
    include: ['test/scale.test.ts', 'test/quote.test.ts'],
    exclude: ['node_modules/**', 'dist/**', 'docs/**'],
    testTimeout: 20000,
    fileParallelism: false,
    env: { ELMORY_TIMING: '1' },
  },
});
