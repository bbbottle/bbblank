import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      '@bbblank/sdk': fileURLToPath(new URL('../../packages/sdk/src/index.ts', import.meta.url)),
      '@bbblank/kernel': fileURLToPath(new URL('../../packages/kernel/src/index.ts', import.meta.url)),
      '@bbblank/host-dom': fileURLToPath(
        new URL('../../packages/host-dom/src/index.ts', import.meta.url)
      ),
    },
  },
});
