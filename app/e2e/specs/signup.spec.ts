import { test, expect, freshEmail, PASSWORD } from '../fixtures/test';
import { isVerified, mintVerifyToken } from '../fixtures/db';

/**
 * Sign up, verify, and land in the app.
 *
 * The one journey that cannot use the shared signed-in account, because it is
 * about how an account comes to exist. Everything here goes through the UI
 * except the token, which is minted against the database — `fixtures/db.ts`
 * explains why it cannot be read.
 */
test.describe('signing up', () => {
  test('registers, verifies through the real link, and arrives signed in', async ({ page }) => {
    const email = freshEmail('signup');

    await page.goto('/register');

    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole('button', { name: /sign up|create account|register/i }).click();

    // The app must not confirm or deny that an address exists, so the wording
    // is deliberately the same either way: check your email.
    await expect(page.getByText(/check your email/i)).toBeVisible();
    expect(await isVerified(email)).toBe(false);

    // The link from the mail, followed as a real user would follow it.
    const token = await mintVerifyToken(email);
    await page.goto(`/verify?token=${token}`);

    await expect(page).toHaveURL(/\/(?!verify)/);
    expect(await isVerified(email)).toBe(true);
  });

  test('a used token is refused the second time', async ({ page }) => {
    const email = freshEmail('reuse');
    await page.goto('/register');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole('button', { name: /sign up|create account|register/i }).click();
    await expect(page.getByText(/check your email/i)).toBeVisible();

    const token = await mintVerifyToken(email);
    await page.goto(`/verify?token=${token}`);
    expect(await isVerified(email)).toBe(true);

    // Single-use is a security property, not a nicety: a link that keeps
    // working is a live key sitting in a mailbox.
    await page.context().clearCookies();
    await page.goto(`/verify?token=${token}`);
    await expect(page.getByText(/no longer valid|invalid|expired/i)).toBeVisible();
  });
});
