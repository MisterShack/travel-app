import { createDb, migrateDb } from './client';
import { loadEnv } from '../env';

/**
 * Standalone migration runner, for applying schema changes as a separate step
 * before starting the process. `src/index.ts` also migrates at boot, so this is
 * not required for a single-instance deployment — it exists so a release can
 * fail on a bad migration before any traffic reaches the new build.
 */
const env = loadEnv();
const db = createDb(env.DATABASE_URL);

await migrateDb(db);
console.info(`Migrations applied to ${env.DATABASE_URL}`);
