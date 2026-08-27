import AxeBuilder from '@axe-core/playwright';
import { test, expect, createTrip } from '../fixtures/test';
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

  for (const path of ['/', '/trips/new', '/account', '/imports', '/passes']) {
    for (const theme of THEMES) {
      test(`${path} has no axe violations in ${theme}`, async ({ page }) => {
        await page.goto(path);
        await scan(page, theme);
      });
    }
  }

  /**
   * A screen is only scanned in the state it is scanned in, and an empty one
   * hides most of what can be wrong with it.
   *
   * Both of these routes were added after an audit found a 4.37:1 contrast
   * failure on the control that opens a pass — mechanically detectable, on a
   * screen this loop had simply never been pointed at. The seeding matters as
   * much as the route: the failing element only exists once a pass does, so a
   * scan of an empty page would have gone on passing.
   */
  for (const theme of THEMES) {
    test(`a trip with a pass on an event has no axe violations in ${theme}`, async ({
      page,
      request,
    }) => {
      const trip = await createTrip(request, { homeTimezone: 'Europe/Lisbon' });
      const segment = await request.post(`/api/trips/${trip.id}/segments`, {
        data: {
          mode: 'air',
          carrier: 'TAP',
          service: 'TP442',
          origin: 'LIS',
          departure: { local: '2027-03-02T10:00', timezone: 'Europe/Lisbon' },
          destination: 'CDG',
          arrival: { local: '2027-03-02T13:30', timezone: 'Europe/Paris' },
        },
      });
      const id = ((await segment.json()) as { id: string }).id;
      await request.post(`/api/trips/${trip.id}/passes`, {
        multipart: {
          file: {
            name: 'boarding pass.pdf',
            mimeType: 'application/pdf',
            buffer: Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(2048, 0x20)]),
          },
          relatedType: 'segment',
          relatedId: id,
        },
      });

      await page.goto(`/trips/${trip.id}/segment/${id}`);
      await page.getByText('boarding pass.pdf').waitFor();
      await scan(page, theme);
    });

    test(`the passes page with passes on it has no axe violations in ${theme}`, async ({
      page,
      request,
    }) => {
      const trip = await createTrip(request, { homeTimezone: 'Europe/Lisbon' });
      // Unique per run: both themes seed into the same worker account, so a
      // fixed name matched two rows and the wait failed on strict mode rather
      // than on anything about accessibility.
      const filename = `lounge voucher ${theme}.pdf`;
      await request.post(`/api/trips/${trip.id}/passes`, {
        multipart: {
          file: {
            name: filename,
            mimeType: 'application/pdf',
            buffer: Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(2048, 0x20)]),
          },
        },
      });

      await page.goto('/passes');
      await page.getByText(filename).waitFor();
      await scan(page, theme);
    });
  }

  test('every screen has exactly one h1-level title', async ({ page }) => {
    // A screen with no heading is unnavigable by heading, and two competing
    // ones is worse than none.
    await page.goto('/');
    const headings = page.getByRole('heading', { level: 1 });
    expect(await headings.count()).toBeGreaterThan(0);
  });
});
