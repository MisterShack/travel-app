import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
  {
    // Server and tooling run under Node, not in a browser.
    files: ['server/**/*.ts', '*.config.{ts,js}', '**/vite.config.ts', '**/vitest.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    // Plain-JS tooling: the drift check and the browser drivers. Without this
    // block `eslint .` matched only .ts/.tsx and skipped them entirely, so
    // `npm run lint` passed while never opening them.
    extends: [js.configs.recommended],
    files: ['**/*.mjs'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: globals.node },
    rules: {
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
  {
    // The browser drivers pass callbacks to page.evaluate(), whose bodies run
    // in the page rather than in Node. `document` and `CSS` there are real, so
    // these files legitimately span both global sets.
    files: ['app/e2e/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    // The Playwright suite is Node, not React. It matters for one rule in
    // particular: a fixture is declared as `{ storageState: ({ ... }, use) =>
    // use(value) }`, and `react-hooks` sees a bare call to something named
    // `use` and reports a hook called outside a component. It is Playwright's
    // fixture-provider callback and has nothing to do with React.
    files: ['app/e2e/**/*.ts', 'app/playwright.config.ts'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      'react-hooks/rules-of-hooks': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // PLAN.md §4: no `any` in the layers that own correctness. The timezone
    // triple and the membership check are the two things most expensive to get
    // wrong, so their layers are typed strictly.
    files: [
      'shared/src/**/*.ts',
      'server/src/db/**/*.ts',
      'server/src/auth/**/*.ts',
      'server/src/trip/**/*.ts',
      'server/src/validation/**/*.ts',
      'app/src/data/**/*.ts',
    ],
    rules: { '@typescript-eslint/no-explicit-any': 'error' },
  },
  {
    // PLAN.md §2: shared/ is consumed by both the browser client and the Node
    // server, so it may not reach into either one.
    files: ['shared/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-*', 'hono*', 'drizzle*', 'idb*', 'dexie*', '@/*', 'node:*'],
              message:
                'shared/ must stay platform-neutral: it is imported by both the client and the server (PLAN.md §2).',
            },
          ],
        },
      ],
    },
  },
  {
    // PLAN.md §8: views read through the offline cache layer, never a storage
    // API directly — otherwise a screen silently loses its offline fallback.
    files: ['app/src/features/**/*.{ts,tsx}', 'app/src/components/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['idb', 'idb-*', '@/data/db'],
              message: 'UI must go through the repository in app/src/data, not storage directly (PLAN.md §8).',
            },
          ],
        },
      ],
    },
  },
);
