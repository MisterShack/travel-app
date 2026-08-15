import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { fileURLToPath, URL } from 'node:url';
import * as schema from './schema';

export function createDb(url: string) {
  const client = createClient({ url });
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

/**
 * Applies the generated migrations. Tests run this against a fresh database so
 * they exercise the same SQL production does, rather than a hand-written schema
 * that could drift from it.
 */
export async function migrateDb(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}

/**
 * Note for anyone reaching for `:memory:` — don't.
 *
 * A libsql `:memory:` database is destroyed by the first `db.transaction()`:
 * every table silently disappears and subsequent queries fail with "no such
 * table". Invite redemption and trip creation both write in transactions, so
 * that becomes a cascade of unrelated-looking failures. Tests use a real file
 * in a temp directory (see `test/helpers.ts`), which also exercises the same
 * driver path production does. Carried over from budget-app, where this cost
 * an afternoon.
 */
