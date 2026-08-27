import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import {
  MAX_PASSES_PER_TRIP,
  MAX_PASS_BYTES,
  passBindingSchema,
  safeFilename,
  sniffContentType,
  type Pass,
  type PassContentType,
} from '@travel/shared';
import type { Db } from '../db/client';
import { passes, tripMembers, trips } from '../db/schema';
import type { Env } from '../env';
import { requireUser, type AuthedVars } from '../middleware/requireUser';
import { roleIn } from '../trip/membership';
import { tripIdOf } from '../trip/timeline';
import { readPkpass } from './pkpass';

/**
 * Stored passes (PLAN.md §4, reversed 2026-08-27).
 *
 * This is the first route in the app that accepts a binary body and hands one
 * back, and both directions carry risk the JSON routes never did.
 *
 * **Coming in:** the uploader's `Content-Type` is ignored entirely. The bytes
 * are sniffed, and a zip has to prove it is a PKPASS by containing a readable
 * `pass.json` — its magic bytes cannot distinguish it from any other archive.
 *
 * **Going out** is the half that would actually hurt. A file served from our own
 * origin is script running against the reader's session cookie if the browser
 * can be persuaded to render it, so the download route pins
 * `Content-Disposition: attachment`, sends `X-Content-Type-Options: nosniff`,
 * and adds a `sandbox` CSP. The content type is read from our column — a value
 * that came from sniffing — and never from anything the uploader supplied.
 */
export function createPassRoutes({
  db,
  env,
  now = () => new Date(),
}: {
  db: Db;
  env: Env;
  now?: () => Date;
}) {
  const app = new Hono<{ Variables: AuthedVars }>();
  const auth = requireUser(db, env, now);

  /** A pass row as the client sees it. Never the bytes; those have a route. */
  const summarise = (row: {
    id: string;
    tripId: string;
    relatedType: 'segment' | 'lodging' | 'activity' | null;
    relatedId: string | null;
    filename: string;
    contentType: PassContentType;
    byteSize: number;
    label: string | null;
    source: 'upload' | 'email';
    createdAt: string;
  }): Pass => ({
    id: row.id,
    tripId: row.tripId,
    relatedType: row.relatedType,
    relatedId: row.relatedId,
    filename: row.filename,
    contentType: row.contentType,
    byteSize: row.byteSize,
    label: row.label,
    source: row.source,
    createdAt: row.createdAt,
  });

  /** Everything except the blob, so listing a trip does not read its megabytes. */
  const SUMMARY = {
    id: passes.id,
    tripId: passes.tripId,
    relatedType: passes.relatedType,
    relatedId: passes.relatedId,
    filename: passes.filename,
    contentType: passes.contentType,
    byteSize: passes.byteSize,
    label: passes.label,
    source: passes.source,
    createdAt: passes.createdAt,
  } as const;

  /* ------------------------------------------------------------ listing -- */

  app.get('/trips/:tripId/passes', auth, async (c) => {
    const user = c.get('user');
    const tripId = c.req.param('tripId');
    if ((await roleIn(db, tripId, user.id)) === null) {
      return c.json({ error: 'not_found', message: 'No such trip.' }, 404);
    }

    const rows = await db
      .select(SUMMARY)
      .from(passes)
      .where(eq(passes.tripId, tripId))
      .orderBy(desc(passes.createdAt));

    return c.json({ passes: rows.map(summarise) });
  });

  /* ------------------------------------------------------------- upload -- */

  app.post('/trips/:tripId/passes', auth, async (c) => {
    const user = c.get('user');
    const tripId = c.req.param('tripId');
    if ((await roleIn(db, tripId, user.id)) === null) {
      return c.json({ error: 'not_found', message: 'No such trip.' }, 404);
    }

    const form = await c.req.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) {
      return c.json({ error: 'bad_request', message: 'A file is required.' }, 400);
    }

    /*
     * Read once, then measure. `file.size` is what the client said; the length
     * of what actually arrived is what is stored, and they are not obliged to
     * agree.
     */
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length === 0) {
      return c.json({ error: 'bad_request', message: 'That file is empty.' }, 400);
    }
    if (bytes.length > MAX_PASS_BYTES) {
      return c.json(
        {
          error: 'too_large',
          message: `A pass may be up to ${Math.floor(MAX_PASS_BYTES / 1024 / 1024)} MB.`,
        },
        413,
      );
    }

    const stored = await storePass({
      db,
      tripId,
      userId: user.id,
      bytes,
      filename: typeof file.name === 'string' ? file.name : 'pass',
      source: 'upload',
      binding: await bindingFromForm(form),
      at: now().toISOString(),
    });

    if ('error' in stored) return c.json(stored.body, stored.status);
    return c.json({ pass: summarise(stored.row) }, 201);
  });

  /* ----------------------------------------------------------- download -- */

  app.get('/passes/:id/file', auth, async (c) => {
    const user = c.get('user');
    const rows = await db.select().from(passes).where(eq(passes.id, c.req.param('id'))).limit(1);
    const row = rows[0];
    // Membership is checked against the pass's own trip, so an id in a URL is a
    // claim rather than an authorisation — and an outsider gets the same 404 a
    // missing row gets, which tells them nothing about what exists.
    if (!row || (await roleIn(db, row.tripId, user.id)) === null) {
      return c.json({ error: 'not_found', message: 'No such pass.' }, 404);
    }

    return new Response(new Uint8Array(row.data), {
      headers: {
        // From our column, which was written by sniffing the bytes. Never from
        // anything the uploader said.
        'content-type': row.contentType,
        'content-length': String(row.byteSize),
        // The load-bearing header. `attachment` means a browser saves the file
        // rather than rendering it, so nothing served from this origin can
        // execute against the session cookie that authorised the request.
        'content-disposition': `attachment; filename="${safeFilename(row.filename)}"`,
        // Belt to that brace: no sniffing past the declared type, and a CSP that
        // denies the response an origin, scripts and plugins even if something
        // does render it.
        'x-content-type-options': 'nosniff',
        'content-security-policy': "sandbox; default-src 'none'",
        // A pass is per-account. A shared cache holding one would hand it to the
        // next reader through the same proxy.
        'cache-control': 'private, no-store',
      },
    });
  });

  /* ------------------------------------------------------------ rebind --- */

  app.patch('/passes/:id', auth, async (c) => {
    const user = c.get('user');
    const rows = await db.select(SUMMARY).from(passes).where(eq(passes.id, c.req.param('id'))).limit(1);
    const row = rows[0];
    if (!row || (await roleIn(db, row.tripId, user.id)) === null) {
      return c.json({ error: 'not_found', message: 'No such pass.' }, 404);
    }

    const body = passBindingSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: 'bad_request', message: 'A pass attaches to an event, or to nothing.' }, 400);
    }

    // The event has to be on this pass's own trip. Without this, a member of two
    // trips could staple a pass from one onto an event in the other.
    if (body.data.relatedType !== null && body.data.relatedId !== null) {
      const owner = await tripIdOf(db, body.data.relatedType, body.data.relatedId);
      if (owner !== row.tripId) {
        return c.json({ error: 'bad_request', message: 'That event is not on this trip.' }, 400);
      }
    }

    const [updated] = await db
      .update(passes)
      .set({ ...body.data, updatedAt: now().toISOString() })
      .where(eq(passes.id, row.id))
      .returning(SUMMARY);

    return c.json({ pass: summarise(updated ?? row) });
  });

  allPasses(app, db, auth);

  /* ------------------------------------------------------------ delete --- */

  app.delete('/passes/:id', auth, async (c) => {
    const user = c.get('user');
    const rows = await db.select(SUMMARY).from(passes).where(eq(passes.id, c.req.param('id'))).limit(1);
    const row = rows[0];
    if (!row || (await roleIn(db, row.tripId, user.id)) === null) {
      return c.json({ error: 'not_found', message: 'No such pass.' }, 404);
    }

    await db.delete(passes).where(eq(passes.id, row.id));
    return c.json({ ok: true });
  });

  return app;
}

/** The binding fields, if the upload form carried them. */
async function bindingFromForm(form: FormData | null) {
  const type = form?.get('relatedType');
  const id = form?.get('relatedId');
  if (typeof type !== 'string' || typeof id !== 'string' || type === '' || id === '') return null;
  const parsed = passBindingSchema.safeParse({ relatedType: type, relatedId: id });
  return parsed.success ? parsed.data : null;
}

type StoreInput = {
  db: Db;
  tripId: string;
  userId: string;
  bytes: Buffer;
  filename: string;
  source: 'upload' | 'email';
  binding: { relatedType: 'segment' | 'lodging' | 'activity' | null; relatedId: string | null } | null;
  at: string;
};

/**
 * Validates and stores one pass.
 *
 * Shared by the upload route and the inbound-email path, so an attachment that
 * arrives by mail is held to exactly the same allowlist, the same ceiling and
 * the same PKPASS proof as one someone picked from a file dialog. A forwarded
 * email is the *less* trusted of the two — the inbound address is reachable by
 * anyone (PLAN.md §4) — so it must not be the one with the looser check.
 */
export async function storePass(
  input: StoreInput,
): Promise<
  | { row: Awaited<ReturnType<typeof insertPass>> }
  | { error: true; status: 400 | 409 | 413 | 415; body: { error: string; message: string } }
> {
  const { db, tripId, bytes } = input;

  const contentType = sniffContentType(bytes);
  if (contentType === null) {
    return {
      error: true,
      status: 415,
      body: {
        error: 'unsupported_type',
        message: 'A pass has to be a PDF, a PNG, a JPEG, or an Apple Wallet pass.',
      },
    };
  }

  /*
   * A zip's signature says "zip", not "pass". Requiring a readable `pass.json`
   * is the only thing that separates a boarding pass from any other archive,
   * and without it this route would accept arbitrary zip files.
   */
  let summary: ReturnType<typeof readPkpass> = null;
  if (contentType === 'application/vnd.apple.pkpass') {
    summary = readPkpass(bytes);
    if (summary === null) {
      return {
        error: true,
        status: 415,
        body: {
          error: 'unsupported_type',
          message: 'That looks like a zip file rather than an Apple Wallet pass.',
        },
      };
    }
  }

  const existing = await db
    .select({ id: passes.id })
    .from(passes)
    .where(eq(passes.tripId, tripId));
  if (existing.length >= MAX_PASSES_PER_TRIP) {
    return {
      error: true,
      status: 409,
      body: {
        error: 'too_many',
        message: `A trip holds up to ${MAX_PASSES_PER_TRIP} passes. Remove one first.`,
      },
    };
  }

  const row = await insertPass(input, contentType, summary);
  return { row };
}

async function insertPass(
  input: StoreInput,
  contentType: PassContentType,
  summary: ReturnType<typeof readPkpass>,
) {
  const filename = safeFilename(input.filename);
  const [row] = await input.db
    .insert(passes)
    .values({
      id: `pas_${randomUUID()}`,
      tripId: input.tripId,
      userId: input.userId,
      relatedType: input.binding?.relatedType ?? null,
      relatedId: input.binding?.relatedId ?? null,
      filename,
      contentType,
      byteSize: input.bytes.length,
      data: input.bytes,
      label: summary?.label ?? null,
      barcodeMessage: summary?.barcodeMessage ?? null,
      barcodeFormat: summary?.barcodeFormat ?? null,
      source: input.source,
      createdAt: input.at,
      updatedAt: input.at,
    })
    .returning();

  return row!;
}

/** Everything the Passes page shows: one row per pass, named by its trip. */
export type PassWithTrip = Pass & { tripName: string };

function allPasses(app: Hono<{ Variables: AuthedVars }>, db: Db, auth: ReturnType<typeof requireUser>) {
  app.get('/passes', auth, async (c) => {
    const user = c.get('user');

    /*
     * Joined through `trip_members`, so the reader's own membership is what
     * selects the rows rather than a filter applied after fetching them. There
     * is no id in this URL to authorise against — the session is the whole
     * query.
     */
    const rows = await db
      .select({
        id: passes.id,
        tripId: passes.tripId,
        tripName: trips.name,
        relatedType: passes.relatedType,
        relatedId: passes.relatedId,
        filename: passes.filename,
        contentType: passes.contentType,
        byteSize: passes.byteSize,
        label: passes.label,
        source: passes.source,
        createdAt: passes.createdAt,
      })
      .from(passes)
      .innerJoin(tripMembers, eq(tripMembers.tripId, passes.tripId))
      .innerJoin(trips, eq(trips.id, passes.tripId))
      .where(eq(tripMembers.userId, user.id))
      .orderBy(desc(passes.createdAt));

    return c.json({ passes: rows });
  });
}
