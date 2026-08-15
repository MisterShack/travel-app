import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// `defineConfig` comes from `vitest/config`, not `vite` — the `test` key below
// is not part of Vite's own config type.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Resolved to TypeScript source rather than a built artifact, so the
      // client and the server can never drift onto different versions of the
      // schemas they both validate against (PLAN.md §2).
      '@travel/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
  },
  server: {
    // In development the client and the API are on different ports; in
    // production one process serves both from one origin (PLAN.md §9).
    proxy: { '/api': 'http://localhost:8787' },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // Pinned so a developer's .env.local cannot change what the suite asserts.
    env: { VITE_API_URL: '' },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts', 'src/**/*.tsx', '../shared/src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    },
  },
});
