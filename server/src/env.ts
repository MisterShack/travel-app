import { isAbsolute } from 'node:path';
import { z } from 'zod';

/**
 * Configuration is parsed once, at startup, and fails loudly. A server that
 * boots with a missing secret and only misbehaves later is far worse than one
 * that refuses to start.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(8787),

  /** libSQL/SQLite URL. `file:` for a local volume, `libsql:` for Turso. */
  DATABASE_URL: z.string().min(1).default('file:./data/travel.db'),

  /**
   * Where the browser client is served from — the cross-origin allow-list.
   * Comma-separated, because in development the dev server and the production
   * preview run on different ports and both need to work.
   */
  APP_ORIGIN: z
    .string()
    .default('http://localhost:5173,http://localhost:4173')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin !== ''),
    )
    .refine((origins) => origins.length > 0, 'At least one origin is required')
    .refine(
      // `URL.canParse('localhost:5173')` is true — it parses as the scheme
      // "localhost:" with path "5173" — so the protocol has to be checked
      // explicitly. Accepting it would produce an allow-list that silently
      // matches no real Origin header.
      (origins) =>
        origins.every((origin) => {
          try {
            const { protocol } = new URL(origin);
            return protocol === 'http:' || protocol === 'https:';
          } catch {
            return false;
          }
        }),
      'Every APP_ORIGIN entry must be an http(s) URL, e.g. https://trips.example',
    ),

  /** Public base URL of this API, used to build links in emails. */
  PUBLIC_URL: z.string().url().default('http://localhost:8787'),

  /**
   * Directory of the built client. When set, this process serves the app as
   * well as the API, which is how it is deployed: one service, one origin, and
   * therefore no CORS and no cross-site cookie questions at all. Unset in
   * development, where Vite serves the client on its own port.
   *
   * **Must be absolute.** Hono's `serveStatic` takes its root relative to the
   * *process* cwd, so `app/dist` works when launched from the repo root and
   * resolves to `server/app/dist` under `npm run start --workspace
   * @travel/server`. The server boots, `/health` answers, the API works, and
   * every client request 404s with nothing but a line on stderr to explain it.
   * That is precisely the "boots and misbehaves later" failure this module
   * exists to prevent, so a relative value is refused rather than resolved
   * against a cwd that depends on how the process was started. The Dockerfile
   * sets `/app/app/dist`.
   */
  STATIC_DIR: z
    .string()
    .min(1)
    .refine(isAbsolute, 'STATIC_DIR must be an absolute path, e.g. /app/app/dist')
    .optional(),

  /**
   * Set only when a known proxy rewrites `x-forwarded-for`. Left off, the rate
   * limiter (Phase 2) ignores that header so it cannot be spoofed.
   */
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  SESSION_COOKIE_NAME: z.string().min(1).default('travel_session'),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().max(365).default(30),

  /** Absent in dev/test: mail is logged to the console instead of sent. */
  RESEND_API_KEY: z.string().min(1).optional(),
  /**
   * Must be an address on a domain verified with the provider — see the
   * production guard in `loadEnv`.
   */
  MAIL_FROM: z.string().min(1).default('Trips <no-reply@mail.myze.ca>'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  if (parsed.data.NODE_ENV === 'production') {
    if (parsed.data.RESEND_API_KEY === undefined) {
      // Verification and invite links would silently go nowhere. Invite
      // redemption requires a *verified* email (PLAN.md §5), so without mail
      // nobody can join a trip and nobody can finish signing up.
      throw new Error(
        'RESEND_API_KEY is required in production: without it, verification, invite and password-reset email cannot be delivered.',
      );
    }

    // The provider's shared test sender accepts the send and delivers only to
    // the account owner. Everyone else gets nothing, with no error anywhere —
    // so this refuses to start rather than quietly locking out every invitee.
    if (/@resend\.dev\b/i.test(parsed.data.MAIL_FROM)) {
      throw new Error(
        `MAIL_FROM is set to a provider test address (${parsed.data.MAIL_FROM}). It only delivers to the provider account's own address, so invitations would silently reach nobody. Use an address on a domain you have verified.`,
      );
    }
  }

  return parsed.data;
}
