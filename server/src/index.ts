import { serve } from '@hono/node-server';
import { buildApp } from './app';
import { purgeExpired } from './auth/sessions';
import { createDb, migrateDb } from './db/client';
import { loadEnv } from './env';
import { createMailer } from './mail/mailer';

const env = loadEnv();
const db = createDb(env.DATABASE_URL);

// Migrations run at boot: one process, one database file, so there is no window
// where the schema and the code disagree.
await migrateDb(db);

// Sweep rows that can no longer be used. With one instance and a file database
// there is nowhere for a scheduler to live, and boot is often enough — expired
// rows are already rejected on use, so this is housekeeping, not security. The
// reminder sweep (Phase 5) needs a stronger guarantee; see PLAN.md §7.
const swept = await purgeExpired(db);
if (swept.sessions + swept.tokens > 0) {
  console.info(`Purged ${swept.sessions} expired session(s) and ${swept.tokens} token(s).`);
}

const app = buildApp({
  db,
  env,
  mailer: createMailer({ resendApiKey: env.RESEND_API_KEY, from: env.MAIL_FROM }),
});

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.info(`Travel API listening on http://localhost:${info.port} (${env.NODE_ENV})`);
  if (env.RESEND_API_KEY === undefined) {
    console.info('No RESEND_API_KEY set — verification, invite and reset emails print here.');
  }
});
