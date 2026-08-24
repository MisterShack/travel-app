import { join } from 'node:path';

/**
 * Where this run's throwaway database and artefacts live.
 *
 * Read from the environment rather than imported from `playwright.config.ts`,
 * because Playwright's workers are separate processes that would re-execute
 * that module — and its `mkdtempSync` would hand each worker a different, empty
 * directory. The config publishes `E2E_DATA_DIR` precisely so every process
 * agrees, and this module is the single place that reads it.
 */
export function dataDir(): string {
  const dir = process.env['E2E_DATA_DIR'];
  if (!dir) {
    throw new Error(
      'E2E_DATA_DIR is not set. These fixtures only run under `playwright test`, ' +
        'which sets it from playwright.config.ts.',
    );
  }
  return dir;
}

export function databaseFile(): string {
  return join(dataDir(), 'travel.db');
}
