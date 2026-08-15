import type { MiddlewareHandler } from 'hono';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Rejects state-changing requests carrying an `Origin` this server does not
 * serve.
 *
 * Hono's `csrf()` only inspects the content types an HTML form can produce, on
 * the reasoning that a cross-origin JSON POST needs a CORS preflight and is
 * therefore already blocked. That is true in a browser, but it leaves the
 * protection implicit — readable only by knowing what the middleware chose not
 * to check. Since sessions are cookie-based, the rule is worth stating outright
 * and testing directly.
 *
 * A *missing* `Origin` is allowed: browsers always send it on cross-origin
 * requests, so its absence means a non-browser client, which carries no ambient
 * cookies and so cannot be the confused deputy CSRF relies on. That is also
 * what lets the Resend inbound webhook (PLAN.md §6) reach its route — it is
 * authenticated by signature, not by origin.
 */
export function originGuard(allowedOrigins: readonly string[]): MiddlewareHandler {
  const allowed = new Set(allowedOrigins);

  return async (c, next) => {
    if (!SAFE_METHODS.has(c.req.method)) {
      const origin = c.req.header('origin');
      if (origin !== undefined && !allowed.has(origin)) {
        return c.json(
          { error: 'forbidden_origin', message: 'This request came from an unrecognised origin.' },
          403,
        );
      }
    }

    await next();
    return undefined;
  };
}
