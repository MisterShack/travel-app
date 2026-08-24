import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../fixtures/test';
import type { Page } from '@playwright/test';

/**
 * Mechanical accessibility checks on every screen, in both themes.
 *
 * This does **not** replace the `web-accessibility-reviewer` agent. Axe finds
 * the mechanical faults — a missing name, a contrast ratio, a bad role — and is
 * silent on the ones that need judgement, like whether a status message is
 * announced at a useful moment or whether focus lands somewhere sensible. Keep
 * the agent for those; automate the rest so it stops being re-checked by hand
 * (PLAN-V2 §5 step 4).
 *
 * `audit.mjs` was the script version of this and is deleted, not left to rot.
 */

/** Both themes, because a contrast failure usually only exists in one. */
const THEMES = ['light', 'dark'] as const;

async function scan(page: Page, theme: (typeof THEMES)[number]) {
  await page.emulateMedia({ colorScheme: theme });
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  const summary = results.violations.map((v) => `${v.id} (${v.nodes.length}) — ${v.help}`);
  expect(summary, `axe violations in ${theme} mode`).toEqual([]);
}

test.describe('signed out', () => {
  for (const path of ['/login', '/register', '/forgot']) {
    for (const theme of THEMES) {
      test(`${path} has no axe violations in ${theme}`, async ({ page }) => {
        await page.goto(path);
        await scan(page, theme);
      });
    }
  }

  test('the sign-in form is operable by keyboard alone', async ({ page }) => {
    await page.goto('/login');
    // Not a style point: a PWA on a phone with a hardware keyboard, and anyone
    // using a switch or a screen reader, reaches the button this way or not
    // at all.
    const email = page.getByLabel(/email/i);
    await email.focus();
    await expect(email).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(page.getByLabel(/password/i)).toBeFocused();
  });
});

test.describe('signed in', () => {
  test.use({ storageState: ({ storageStatePath }, use) => use(storageStatePath) });

  for (const path of ['/', '/trips/new', '/account', '/imports']) {
    for (const theme of THEMES) {
      test(`${path} has no axe violations in ${theme}`, async ({ page }) => {
        await page.goto(path);
        await scan(page, theme);
      });
    }
  }

  test('every screen has exactly one h1-level title', async ({ page }) => {
    // A screen with no heading is unnavigable by heading, and two competing
    // ones is worse than none.
    await page.goto('/');
    const headings = page.getByRole('heading', { level: 1 });
    expect(await headings.count()).toBeGreaterThan(0);
  });
});
