import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      // The specific alias MUST come first. Vitest matches by prefix in order,
      // so a bare '@travel/shared' entry swallows '@travel/shared/airports' and
      // resolves it to `index.ts/airports`. Same trap as app/vite.config.ts.
      '@travel/shared/airports': fileURLToPath(new URL('../shared/src/airports.ts', import.meta.url)),
      '@travel/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
  },
  test: { globals: true, environment: 'node' },
});
