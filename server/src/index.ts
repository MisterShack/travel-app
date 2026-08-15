import { serve } from '@hono/node-server';
import { buildApp } from './app';
import { purgeExpired } from './auth/sessions';
import { createDb, migrateDb } from './db/client';
import { loadEnv } from './env';
import { createMailer } from './mail/mailer';
import { ResendInboundClient } from './import/resendInbound';
import { createPusher } from './notify/push';
import { startSweep } from './notify/sweep';

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

const mailer = createMailer({ resendApiKey: env.RESEND_API_KEY, from: env.MAIL_FROM });
const inbound = env.RESEND_API_KEY ? new ResendInboundClient(env.RESEND_API_KEY) : null;
const app = buildApp({ db, env, mailer, inbound });

/**
 * The reminder sweep. One instance and a file database means there is nowhere
 * else for it to live (PLAN.md §4) — but unlike `purgeExpired` above, missing a
 * run here costs a missed flight, so it claims rows before sending and drops
 * work that is too late to be useful rather than delivering it anyway.
 */
const pusher =
  env.VAPID_PUBLIC_KEY !== undefined && env.VAPID_PRIVATE_KEY !== undefined
    ? createPusher(
        {
          publicKey: env.VAPID_PUBLIC_KEY,
          privateKey: env.VAPID_PRIVATE_KEY,
          subject: env.VAPID_SUBJECT,
        },
        db,
      )
    : null;

startSweep({ db, mailer, pusher }, env.SWEEP_INTERVAL_MS);

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.info(`Travel API listening on http://localhost:${info.port} (${env.NODE_ENV})`);
  if (env.RESEND_API_KEY === undefined) {
    console.info('No RESEND_API_KEY set — verification, invite and reset emails print here.');
  }
  if (pusher === null) {
    console.info('No VAPID keys set — reminders will be delivered by email only.');
  }
  if (env.RESEND_WEBHOOK_SECRET === undefined) {
    console.info('No RESEND_WEBHOOK_SECRET set — the inbound import webhook will reject everything.');
  } else if (env.GEMINI_API_KEY === undefined) {
    console.info('No GEMINI_API_KEY set — booking import will use heuristics only.');
  }
});
