import type { Context, MiddlewareHandler } from 'hono';

/**
 * Fixed-window limiter held in memory.
 *
 * Sized for the audience this deployment actually has: family and a few
 * friends, one instance (PLAN.md §4). It is per-process, so it would not hold
 * across replicas — if this ever runs on more than one instance, this becomes a
 * shared store rather than a bigger number here.
 */

export type RateLimitOptions = {
  windowMs: number;
  max: number;
  /** Distinguishes buckets; defaults to client address + request path. */
  keyOf?: (c: Context) => string;
  now?: () => number;
  /** Set when a known proxy rewrites `x-forwarded-for`. */
  trustProxy?: boolean;
};

/**
 * `x-forwarded-for` is client-supplied unless something upstream overwrites it,
 * so trusting it blindly lets anyone bypass the limiter by varying a header.
 * The forwarded chain is consulted only when the deployment says it sits behind
 * a proxy.
 *
 * budget-app checks a `fly-client-ip` header here — a leftover from its
 * abandoned Fly.io deploy. Railway never sends it, so on Railway that check
 * always misses and every request falls through to the same `'direct'` bucket:
 * one shared global limit instead of a per-client one. Deliberately not ported.
 * `TRUST_PROXY=true` in production is what makes this work (DEPLOY.md §3).
 */
function clientAddress(c: Context, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = c.req.header('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0]?.trim() ?? 'unknown';
    const real = c.req.header('x-real-ip');
    if (real) return real;
  }

  return 'direct';
}

export function rateLimit(options: RateLimitOptions): MiddlewareHandler {
  const { windowMs, max } = options;
  const now = options.now ?? (() => Date.now());
  const trustProxy = options.trustProxy ?? false;
  const keyOf =
    options.keyOf ??
    ((c: Context) => `${clientAddress(c, trustProxy)}:${new URL(c.req.url).pathname}`);

  const buckets = new Map<string, { count: number; resetAt: number }>();

  return async (c, next) => {
    const at = now();
    const key = keyOf(c);

    // Opportunistic sweep; the map only holds active windows.
    if (buckets.size > 5_000) {
      for (const [k, bucket] of buckets) if (bucket.resetAt <= at) buckets.delete(k);
    }

    const existing = buckets.get(key);
    const bucket = existing && existing.resetAt > at ? existing : { count: 0, resetAt: at + windowMs };
    bucket.count++;
    buckets.set(key, bucket);

    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - at) / 1000));
      c.header('Retry-After', String(retryAfter));
      return c.json({ error: 'rate_limited', message: 'Too many attempts. Try again shortly.' }, 429);
    }

    await next();
    return undefined;
  };
}
