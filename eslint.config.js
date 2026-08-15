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
