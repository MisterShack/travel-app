import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// `defineConfig` comes from `vitest/config`, not `vite` — the `test` key below
// is not part of Vite's own config type.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Trips',
        short_name: 'Trips',
        description: 'Every flight, hotel and booking for a trip, on one timeline.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#12131a',
        theme_color: '#12131a',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // A navigation resolves to the shell, which then reads the timeline out
        // of IndexedDB — so an installed app opens with no network (PLAN.md §8).
        navigateFallback: 'index.html',
        // The API is never served from the service worker cache. Responses are
        // session-scoped, and a stale or wrong-account trip read off disk would
        // be worse than an honest failure. Reading offline is the repository's
        // job, which knows what it is showing and says so.
        // Only the API and the healthcheck are excluded now; every other path
        // belongs to the client and must resolve to the shell so an installed
        // app opens offline on a deep link.
        navigateFallbackDenylist: [/^\/(?:api|health)\b/],
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // The airport table is a large lazily-loaded chunk; without raising this
        // it is silently dropped from the precache and the flight form stops
        // working offline — which is exactly where it is needed.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        cleanupOutdatedCaches: true,
      },
      // Off in dev: a service worker caching a dev server produces baffling
      // stale-module bugs.
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Resolved to TypeScript source rather than a built artifact, so the
      // client and the server can never drift onto different versions of the
      // schemas they both validate against (PLAN.md §2).
      // The more specific alias MUST come first: Vite matches aliases by
      // prefix in order, so a bare '@travel/shared' entry would swallow
      // '@travel/shared/airports' and resolve it to `index.ts/airports`.
      '@travel/shared/airports': fileURLToPath(new URL('../shared/src/airports.ts', import.meta.url)),
      '@travel/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
      '/health': 'http://localhost:8787',
    },
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
      exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx', '../shared/src/airports.ts'],
    },
  },
});
