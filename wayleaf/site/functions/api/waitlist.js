/**
 * Waitlist capture — a Cloudflare Pages Function.
 *
 * Deliberately small, and deliberately loud when unconfigured. The failure this
 * guards against is the one nobody notices: a form that accepts an address,
 * returns a cheerful thank-you, and drops it on the floor. A launch list that
 * silently lost its first two hundred signups is not recoverable.
 *
 * Requires a KV namespace bound as WAITLIST. See site/README.md.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function back(request, status, message) {
  const url = new URL(request.url);
  const to = new URL(status === 'ok' ? '/thanks/' : '/', url.origin);
  if (status !== 'ok') to.searchParams.set('error', message);
  return Response.redirect(to.href, 303);
}

export async function onRequestPost({ request, env }) {
  // Same-origin only. The form is the only intended caller.
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) {
    return new Response('forbidden', { status: 403 });
  }

  if (!env.WAITLIST) {
    // 503, never a redirect to /thanks/. An unbound namespace is an outage,
    // and it must look like one rather than like success.
    console.error('WAITLIST KV namespace is not bound — signup dropped');
    return new Response('waitlist unavailable', { status: 503 });
  }

  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim().toLowerCase();

  if (email.length > 254 || !EMAIL.test(email)) {
    return back(request, 'bad', 'email');
  }

  // Keyed by address, so a double submit is one row rather than two.
  await env.WAITLIST.put(
    `email:${email}`,
    JSON.stringify({ email, at: new Date().toISOString() }),
  );

  return back(request, 'ok');
}

export function onRequestGet() {
  return new Response('method not allowed', { status: 405 });
}
