import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@bbblank/sdk': fileURLToPath(new URL('../sdk/src/index.ts', import.meta.url)),
      '@bbblank/kernel': fileURLToPath(new URL('../kernel/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'happy-dom',
  },
});
