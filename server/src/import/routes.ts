import { randomUUID } from 'node:crypto';
import { and, desc, eq, gte, notInArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import type { Db } from '../db/client';
import { bookingImports, pushSubscriptions, tripMembers, trips, users } from '../db/schema';
import { storePass } from '../passes/routes';
import type { Env } from '../env';
import { rateLimit } from '../middleware/rateLimit';
import { requireUser, type AuthedVars } from '../middleware/requireUser';
import { roleIn } from '../trip/membership';
import { addressOf, type InboundClient } from './resendInbound';
import { parseBooking } from './parse';
import { verifyWebhook } from './signature';
import { GoneError, type Pusher } from '../notify/push';

export type ImportDeps = {
  db: Db;
  env: Env;
  inbound: InboundClient | null;
  /** Used to tell the owner an import arrived while they were away. */
  pusher?: Pusher | null;
  now?: () => Date;
};

export function createImportRoutes(deps: ImportDeps) {
  const { db, env, inbound, pusher = null } = deps;
  const now = deps.now ?? (() => new Date());
  const app = new Hono<{ Variables: AuthedVars }>();
  const auth = requireUser(db, env, now);

  /* -- inbound webhook --------------------------------------------------- */

  /**
   * Resend's inbound webhook (PLAN.md §6).
   *
   * Four gates, in order of how cheap they are to fail:
   *   1. signature — the route is otherwise an unauthenticated endpoint that
   *      fetches attacker-chosen messages and writes rows
   *   2. recipient — an MX on the sending domain delivers *every* address here,
   *      including replies to our own no-reply, which are not bookings
   *   3. known sender — the address is public, so anyone can mail it
   *   4. daily cap — bounds both row growth and LLM spend
   */
  app.post(
    '/webhooks/resend-inbound',
    rateLimit({ windowMs: 60 * 1000, max: 60, trustProxy: env.TRUST_PROXY }),
    async (c) => {
      // The raw body, byte for byte: re-serialising parsed JSON changes key
      // order and whitespace, and the signature would never match.
      const raw = await c.req.text();
      const verified = verifyWebhook(
        env.RESEND_WEBHOOK_SECRET,
        {
          id: c.req.header('svix-id'),
          timestamp: c.req.header('svix-timestamp'),
          signature: c.req.header('svix-signature'),
        },
        raw,
        now(),
      );
      if (!verified.ok) {
        /**
         * Terse to the caller, specific in the log. A probing client learns
         * only that it failed; the operator needs to tell a wrong secret from
         * a clock skew from a missing header, and without this the only signal
         * is an unexplained 401 on both sides.
         */
        console.warn(
          `Inbound webhook rejected: ${verified.reason}` +
            (verified.reason === 'missing_headers'
              ? ` (svix-id=${c.req.header('svix-id') ? 'yes' : 'no'},` +
                ` svix-timestamp=${c.req.header('svix-timestamp') ? 'yes' : 'no'},` +
                ` svix-signature=${c.req.header('svix-signature') ? 'yes' : 'no'})`
              : ''),
        );
        return c.json({ error: 'unauthorised' }, 401);
      }

      let event: { type?: string; data?: { email_id?: string; id?: string } };
      try {
        event = JSON.parse(raw) as typeof event;
      } catch {
        return c.json({ error: 'invalid_request' }, 400);
      }

      /**
       * Every outcome is logged, not only the rejections.
       *
       * Before this, a successful import and every deliberate ignore wrote
       * nothing, so "no webhook in the logs" was indistinguishable between
       * working perfectly, silently discarding the mail, and never being
       * called at all. An endpoint whose success is invisible cannot be
       * operated.
       */
      const ignore = (reason: string) => {
        console.info(`Inbound webhook ignored (${reason})`);
        return c.json({ ok: true, ignored: reason });
      };

      const messageId = event.data?.email_id ?? event.data?.id;
      if (!messageId) return ignore('no message id in the event payload');
      if (!inbound) return ignore('RESEND_API_KEY is not set, so the message cannot be fetched');

      // Idempotency: the provider retries, and a retry must not import twice.
      const seen = await db
        .select({ id: bookingImports.id })
        .from(bookingImports)
        .where(eq(bookingImports.resendMessageId, messageId))
        .limit(1);
      if (seen[0]) {
        console.info(`Inbound webhook: message ${messageId} already imported; ignoring retry`);
        return c.json({ ok: true, duplicate: true });
      }

      let message;
      try {
        message = await inbound.fetchMessage(messageId);
      } catch (error) {
        console.error(`Inbound webhook: could not fetch ${messageId} from Resend:`, error);
        return c.json({ ok: false, error: (error as Error).message }, 502);
      }

      const recipients = message.to.map(addressOf);
      if (!recipients.some((to) => env.INBOUND_ADDRESS.includes(to))) {
        // A reply to a reminder is not a booking confirmation.
        return ignore(
          `addressed to ${message.to.join(', ')}, not ${env.INBOUND_ADDRESS.join(' or ')}`,
        );
      }

      const from = addressOf(message.from);
      const senderRows = await db.select().from(users).where(eq(users.email, from)).limit(1);
      const sender = senderRows[0];
      // `From` is trivially forged, so this is cost and noise control, not
      // authentication — the human-review step is what contains the damage.
      if (!sender || sender.emailVerifiedAt === null) {
        return ignore(`sender ${from} is not a verified account on this app`);
      }

      const since = new Date(now().getTime() - 24 * 60 * 60 * 1000).toISOString();
      const today = await db
        .select({ id: bookingImports.id })
        .from(bookingImports)
        .where(and(eq(bookingImports.userId, sender.id), gte(bookingImports.createdAt, since)));
      if (today.length >= env.IMPORT_DAILY_CAP) {
        return ignore(`daily cap of ${env.IMPORT_DAILY_CAP} reached for ${from}`);
      }

      // Fetched after the sender gate, so an unknown sender never causes a
      // download. Failure here is not fatal: the body may still be readable.
      let attachments: Awaited<ReturnType<typeof inbound.fetchAttachments>> = [];
      try {
        attachments = await inbound.fetchAttachments(messageId);
      } catch (error) {
        console.warn(`Inbound webhook: could not fetch attachments for ${messageId}:`, error);
      }

      const parsed = await parseBooking(
        message,
        { apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL },
        attachments,
      );

      /**
       * Trip matching: pre-select only when there is exactly one candidate.
       * Guessing between two upcoming trips would put a flight on the wrong
       * one, and the review screen exists precisely to ask.
       */
      const today10 = now().toISOString().slice(0, 10);
      const candidates = await db
        .select({ tripId: trips.id })
        .from(trips)
        .innerJoin(tripMembers, eq(tripMembers.tripId, trips.id))
        .where(and(eq(tripMembers.userId, sender.id), gte(trips.endDate, today10)));
      const tripId = candidates.length === 1 ? candidates[0]!.tripId : null;

      const at = now().toISOString();
      await db.insert(bookingImports).values({
        id: `imp_${randomUUID()}`,
        userId: sender.id,
        tripId,
        resendMessageId: messageId,
        fromAddress: from,
        subject: message.subject,
        receivedAt: message.createdAt,
        // Never `applied`: a human confirms before anything reaches the
        // timeline (PLAN.md §4).
        status: parsed.ok ? 'needs_review' : 'failed',
        extractedType: parsed.ok ? parsed.draft.type : null,
        extractedFields: parsed.ok ? JSON.stringify(parsed.draft.fields) : null,
        parsedBy: parsed.by,
        errorMessage: parsed.ok ? null : parsed.reason,
        processedAt: at,
        createdAt: at,
      });

      /**
       * A pass that arrived as an attachment is kept — but only once we know
       * which trip it belongs to.
       *
       * `passes.tripId` is not nullable, and the trip is only known here when
       * the sender had exactly one candidate (above). That is a real limit
       * rather than an oversight: an attachment on an email that matched no
       * trip, or two, is *not* stored, and the review screen still fetches the
       * original from Resend on demand as it always did. Storing it would mean
       * a pass belonging to nothing, and a second unowned state to reason about
       * in the one part of the app that handles files a stranger can send.
       *
       * Everything here goes through the same `storePass` the upload route
       * uses, so an emailed attachment meets the same allowlist, the same
       * ceiling and the same proof-of-PKPASS. This is the *less* trusted of the
       * two paths — the inbound address is reachable by anyone (PLAN.md §4) —
       * so it must not be the one with the weaker check. A refusal is logged
       * and skipped: one unreadable attachment must not lose the import.
       */
      if (tripId !== null) {
        for (const attachment of attachments) {
          const stored = await storePass({
            db,
            tripId,
            userId: sender.id,
            bytes: Buffer.from(attachment.data, 'base64'),
            filename: attachment.filename,
            source: 'email',
            binding: null,
            at,
          });
          if ('error' in stored) {
            console.info(
              `Inbound webhook: not keeping ${attachment.filename} — ${stored.body.error}`,
            );
          }
        }
      }

      /**
       * Tell them now, not next time they open the app.
       *
       * This is the moment the information is true, and a badge they have not
       * looked at yet cannot convey it. Failure here never fails the import —
       * the row exists either way, and a missed notification is a smaller
       * problem than a rejected webhook that Resend will retry.
       */
      if (pusher) {
        try {
          const subs = await db
            .select()
            .from(pushSubscriptions)
            .where(eq(pushSubscriptions.userId, sender.id));
          for (const sub of subs) {
            await pusher
              .send(sub, {
                title: 'Waypoint',
                body: parsed.ok
                  ? `A ${parsed.draft.type} booking arrived and needs review.`
                  : 'A booking arrived but could not be read. Tap to review it.',
                url: '/imports',
              })
              .catch((error: unknown) => {
                if (!(error instanceof GoneError)) throw error;
              });
          }
        } catch (error) {
          console.warn(`Inbound webhook: could not notify ${from}:`, error);
        }
      }

      console.info(
        `Inbound webhook: imported ${messageId} for ${from} — ` +
          `${parsed.ok ? `${parsed.draft.type} via ${parsed.by}` : `unreadable (${parsed.reason})`}` +
          `${attachments.length > 0 ? `, ${attachments.length} attachment(s) read` : ''}` +
          `${tripId ? ', matched to a trip' : ', no trip matched'}`,
      );
      return c.json({ ok: true });
    },
  );

  /* -- review queue ------------------------------------------------------ */

  /** The caller's imports. Scoped by `userId`, never by trip alone — an
   *  unmatched import has no trip to be scoped by. */
  /**
   * "Awaiting review": everything a human has not yet resolved.
   *
   * Defined once because it was defined three times, differently. The list
   * filtered `applied` and `rejected` out in application code; the count route
   * counted **every** row the user had ever received, so the tab badge showed a
   * lifetime total that never went down; and the per-trip route keyed off
   * `processedAt`, which is stamped at ingest and is therefore never null.
   * Status is the marker, and now only one expression says so.
   */
  const AWAITING = notInArray(bookingImports.status, ['applied', 'rejected']);

  app.get('/imports', auth, async (c) => {
    const rows = await db
      .select()
      .from(bookingImports)
      .where(and(eq(bookingImports.userId, c.get('user').id), AWAITING))
      .orderBy(desc(bookingImports.createdAt));
    return c.json({ imports: rows });
  });

  /**
   * How many imports await review. Its own route rather than a field on a
   * bigger payload, because the tab bar reads it on every navigation and should
   * not be shipping rows to render a numeral.
   */
  app.get('/imports/count', auth, async (c) => {
    const rows = await db
      .select({ id: bookingImports.id })
      .from(bookingImports)
      .where(and(eq(bookingImports.userId, c.get('user').id), AWAITING));
    return c.json({ count: rows.length });
  });

  app.get('/trips/:id/imports', auth, async (c) => {
    const tripId = c.req.param('id');
    if (!(await roleIn(db, tripId, c.get('user').id))) return c.json({ error: 'not_found' }, 404);
    const rows = await db
      .select()
      .from(bookingImports)
      .where(and(eq(bookingImports.tripId, tripId), AWAITING))
      .orderBy(desc(bookingImports.createdAt));
    return c.json({ imports: rows });
  });

  const ownImport = async (id: string, userId: string) => {
    const rows = await db
      .select()
      .from(bookingImports)
      .where(and(eq(bookingImports.id, id), eq(bookingImports.userId, userId)))
      .limit(1);
    return rows[0] ?? null;
  };

  /**
   * The source, fetched from Resend on demand.
   *
   * This is what makes "no document storage" workable: the reviewer can check
   * the extraction against the original without the app ever holding it
   * (PLAN.md §4, §6.8). Resend keeps received mail for 30 days, so this can
   * legitimately fail on an old import — which is reported, not hidden.
   */
  app.get('/imports/:id/source', auth, async (c) => {
    const row = await ownImport(c.req.param('id'), c.get('user').id);
    if (!row) return c.json({ error: 'not_found' }, 404);
    if (!inbound) return c.json({ error: 'unavailable' }, 503);

    try {
      const message = await inbound.fetchMessage(row.resendMessageId);
      return c.json({ subject: message.subject, from: message.from, text: message.text.slice(0, 20_000) });
    } catch {
      return c.json(
        {
          error: 'source_unavailable',
          message: 'The original email is no longer available — the provider keeps it for 30 days.',
        },
        410,
      );
    }
  });

  app.post('/imports/:id/assign', auth, async (c) => {
    const row = await ownImport(c.req.param('id'), c.get('user').id);
    if (!row) return c.json({ error: 'not_found' }, 404);

    const body = z.object({ tripId: z.string().min(1) }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'invalid_request' }, 400);
    if (!(await roleIn(db, body.data.tripId, c.get('user').id))) {
      return c.json({ error: 'not_found' }, 404);
    }

    await db
      .update(bookingImports)
      .set({ tripId: body.data.tripId })
      .where(eq(bookingImports.id, row.id));
    return c.json({ ok: true });
  });

  /**
   * How many separate timeline rows this import proposes.
   *
   * One, for everything except a journey; for a journey, one per leg — a return
   * trip is a single email and two segments.
   */
  const segmentCount = (extractedFields: string | null): number => {
    if (extractedFields === null) return 1;
    try {
      const parsed = JSON.parse(extractedFields) as { segments?: unknown };
      return Array.isArray(parsed.segments) && parsed.segments.length > 0
        ? parsed.segments.length
        : 1;
    } catch {
      return 1;
    }
  };

  /**
   * Marking an import applied. The entity itself is created through the normal
   * validated create route, so an import can never write a row that a human
   * could not have typed.
   *
   * A body of `{ "segment": n }` records one leg of a multi-leg booking. The
   * import only leaves the queue once every leg has been recorded — otherwise
   * adding the outbound leg would file the email and take the return with
   * it.
   */
  app.post('/imports/:id/apply', auth, async (c) => {
    const row = await ownImport(c.req.param('id'), c.get('user').id);
    if (!row) return c.json({ error: 'not_found' }, 404);

    const body = (await c.req.json().catch(() => ({}))) as { segment?: unknown };
    const total = segmentCount(row.extractedFields);
    const stamp = now().toISOString();

    if (typeof body.segment !== 'number' || total <= 1) {
      await db
        .update(bookingImports)
        .set({ status: 'applied', processedAt: stamp })
        .where(eq(bookingImports.id, row.id));
      return c.json({ ok: true, remaining: 0 });
    }

    const already = (() => {
      try {
        const parsed = JSON.parse(row.appliedSegments ?? '[]') as unknown;
        return Array.isArray(parsed) ? parsed.filter((n): n is number => typeof n === 'number') : [];
      } catch {
        return [];
      }
    })();
    const done = [...new Set([...already, body.segment])].filter((n) => n >= 0 && n < total);
    const complete = done.length >= total;

    await db
      .update(bookingImports)
      .set({
        appliedSegments: JSON.stringify(done),
        ...(complete ? { status: 'applied' as const, processedAt: stamp } : {}),
      })
      .where(eq(bookingImports.id, row.id));

    return c.json({ ok: true, remaining: total - done.length });
  });

  app.post('/imports/:id/reject', auth, async (c) => {
    const row = await ownImport(c.req.param('id'), c.get('user').id);
    if (!row) return c.json({ error: 'not_found' }, 404);
    await db
      .update(bookingImports)
      .set({ status: 'rejected', processedAt: now().toISOString() })
      .where(eq(bookingImports.id, row.id));
    return c.json({ ok: true });
  });

  return app;
}
