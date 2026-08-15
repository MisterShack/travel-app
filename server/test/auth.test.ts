import { afterEach, describe, expect, it } from 'vitest';
import { createHarness, jsonRequest, sessionCookie, signUp, tokenFromMail, type Harness } from './helpers';

let h: Harness;
afterEach(() => h?.cleanup());

const PASSWORD = 'correct horse battery';

describe('registration', () => {
  it('creates an unverified account and emails a verification link', async () => {
    h = await createHarness();
    const res = await h.app.request(
      jsonRequest('/auth/register', 'POST', { email: 'a@example.com', password: PASSWORD }),
    );
    expect(res.status).toBe(201);
    expect(h.mailer.lastTo('a@example.com')?.subject).toMatch(/verify/i);
  });

  it('does not reveal that an address is already registered', async () => {
    h = await createHarness();
    const body = { email: 'a@example.com', password: PASSWORD };
    const first = await h.app.request(jsonRequest('/auth/register', 'POST', body));
    const second = await h.app.request(jsonRequest('/auth/register', 'POST', body));

    // Identical status and body — the only difference is which mail is sent,
    // and that goes to the address owner, not the caller.
    expect(second.status).toBe(first.status);
    expect(await second.json()).toEqual(await first.json());
    expect(h.mailer.lastTo('a@example.com')?.subject).toMatch(/someone tried to register/i);
  });

  it('creates no trip alongside the account', async () => {
    // Unlike budget-app's auto-created personal ledger: a new account has an
    // empty trip list until it creates a trip or redeems an invite (PLAN.md §5).
    h = await createHarness();
    const cookie = await signUp(h, 'a@example.com');
    const res = await h.app.request(jsonRequest('/trips', 'GET', undefined, cookie));
    await expect(res.json()).resolves.toEqual({ trips: [] });
  });
});

describe('login', () => {
  it('refuses an unverified account', async () => {
    h = await createHarness();
    await h.app.request(
      jsonRequest('/auth/register', 'POST', { email: 'a@example.com', password: PASSWORD }),
    );
    const res = await h.app.request(
      jsonRequest('/auth/login', 'POST', { email: 'a@example.com', password: PASSWORD }),
    );
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: 'unverified' });
  });

  it('gives the same answer for an unknown address and a wrong password', async () => {
    h = await createHarness();
    await signUp(h, 'a@example.com');

    const wrongPassword = await h.app.request(
      jsonRequest('/auth/login', 'POST', { email: 'a@example.com', password: 'not the password' }),
    );
    const unknownUser = await h.app.request(
      jsonRequest('/auth/login', 'POST', { email: 'nobody@example.com', password: PASSWORD }),
    );

    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    expect(await unknownUser.json()).toEqual(await wrongPassword.json());
  });

  it('signs in a verified account', async () => {
    h = await createHarness();
    await signUp(h, 'a@example.com');
    const res = await h.app.request(
      jsonRequest('/auth/login', 'POST', { email: 'a@example.com', password: PASSWORD }),
    );
    expect(res.status).toBe(200);
    expect(sessionCookie(res)).toMatch(/^travel_session=/);
  });
});

describe('verification tokens', () => {
  it('is single-use', async () => {
    h = await createHarness();
    await h.app.request(
      jsonRequest('/auth/register', 'POST', { email: 'a@example.com', password: PASSWORD }),
    );
    const token = tokenFromMail(h.mailer, 'a@example.com');

    expect((await h.app.request(jsonRequest('/auth/verify', 'POST', { token }))).status).toBe(200);
    expect((await h.app.request(jsonRequest('/auth/verify', 'POST', { token }))).status).toBe(400);
  });

  it('expires', async () => {
    h = await createHarness();
    await h.app.request(
      jsonRequest('/auth/register', 'POST', { email: 'a@example.com', password: PASSWORD }),
    );
    const token = tokenFromMail(h.mailer, 'a@example.com');

    h.setNow(new Date('2026-08-17T12:00:00.000Z')); // +48h, TTL is 24h
    const res = await h.app.request(jsonRequest('/auth/verify', 'POST', { token }));
    expect(res.status).toBe(400);
  });
});

describe('password reset', () => {
  it('does not reveal whether an address has an account', async () => {
    h = await createHarness();
    await signUp(h, 'a@example.com');

    const known = await h.app.request(jsonRequest('/auth/forgot', 'POST', { email: 'a@example.com' }));
    const unknown = await h.app.request(
      jsonRequest('/auth/forgot', 'POST', { email: 'nobody@example.com' }),
    );

    expect(unknown.status).toBe(known.status);
    expect(await unknown.json()).toEqual(await known.json());
    expect(h.mailer.lastTo('nobody@example.com')).toBeUndefined();
  });

  it('turns out every existing session', async () => {
    h = await createHarness();
    const cookie = await signUp(h, 'a@example.com');
    expect((await h.app.request(jsonRequest('/auth/me', 'GET', undefined, cookie))).status).toBe(200);

    await h.app.request(jsonRequest('/auth/forgot', 'POST', { email: 'a@example.com' }));
    const token = tokenFromMail(h.mailer, 'a@example.com');
    const res = await h.app.request(
      jsonRequest('/auth/reset', 'POST', { token, password: 'a different long password' }),
    );
    expect(res.status).toBe(200);

    // The old cookie must be dead: whoever changed the password keeps control.
    expect((await h.app.request(jsonRequest('/auth/me', 'GET', undefined, cookie))).status).toBe(401);
  });
});

describe('origin guard', () => {
  it('rejects a state-changing request from an unrecognised origin', async () => {
    h = await createHarness();
    const res = await h.app.request(
      new Request('http://localhost/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
        body: JSON.stringify({ email: 'a@example.com', password: PASSWORD }),
      }),
    );
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: 'forbidden_origin' });
  });

  it('allows a request with no Origin at all', async () => {
    // Browsers always send Origin cross-origin, so its absence means a
    // non-browser client, which carries no ambient cookies. This is also what
    // lets the Resend inbound webhook reach its route in Phase 4.
    h = await createHarness();
    const res = await h.app.request(
      jsonRequest('/auth/login', 'POST', { email: 'a@example.com', password: PASSWORD }),
    );
    expect(res.status).not.toBe(403);
  });
});
