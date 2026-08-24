import { fileURLToPath, URL } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// `defineConfig` comes from `vitest/config`, not `vite` — the `test` key below
// is not part of Vite's own config type.
export default defineConfig({
  /*
   * A build stamp, shown on the Account screen. Without one, "is this the build
   * I just deployed?" can only be answered by diffing minified bundles, which
   * is what it took the first time a deployed fix appeared not to have shipped.
   * A timestamp rather than a git SHA: the Docker build has no git history.
   */
  define: { __BUILD_ID__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')) },
  plugins: [
    react(),
    VitePWA({
      // injectManifest, not generateSW: a generated worker cannot carry the
      // push and notificationclick handlers, which is the point of having one.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      manifest: {
        name: 'Waypoint',
        short_name: 'Waypoint',
        description: 'Every flight, stay and booking on one timeline — and it still works with no signal.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#101216',
        theme_color: '#101216',
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
      /**
       * The dev server proxies to the API so the browser only ever talks to one
       * origin — the deployed shape, where a single process serves both.
       *
       * Overridable because the e2e suite runs its own API on its own port: a
       * developer's dev servers are typically already holding 8787 and 5173,
       * and a test run that demands those ports either fails or, worse,
       * silently drives the dev database. `API_PROXY_TARGET` lets the suite
       * point at its own throwaway instance without anyone shutting anything
       * down.
       */
      '/api': process.env['API_PROXY_TARGET'] ?? 'http://localhost:8787',
      '/health': process.env['API_PROXY_TARGET'] ?? 'http://localhost:8787',
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    /**
     * Vitest's default `include` matches every `.test.` and `.spec.` file in the
     * workspace, which swallows the Playwright suite in `e2e/specs/`. Those
     * files import `@playwright/test` and call its `test.describe()`, so vitest
     * collects them, fails to run them, and reports "Test Files 4 failed" while
     * still printing "Tests 53 passed" — every test that actually ran did pass.
     * A check that reads the second line and not the first sees a green suite.
     *
     * The e2e suite has its own runner and its own command; this stops the two
     * fighting over the same glob.
     */
    exclude: [...configDefaults.exclude, 'e2e/**'],
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
