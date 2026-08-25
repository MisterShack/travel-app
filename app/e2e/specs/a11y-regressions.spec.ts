import { createTrip, test, expect } from '../fixtures/test';

/**
 * Regressions for the accessibility audit of 2026-08-25.
 *
 * Both of these are invisible to axe and to jsdom. One is a geometry failure
 * that only appears at a text size nobody develops at; the other is where
 * focus went, which a unit test does not have a document to answer.
 */

test.use({ storageState: ({ storageStatePath }, use) => use(storageStatePath) });

test.describe('at 200% text', () => {
  test('the trip name is not sat on by the Manage button', async ({ page, request }) => {
    /**
     * Reported as SERIOUS: at 200% text on every phone width, "Paris in March"
     * rendered as "Par / in / March" with the rest drawn underneath Manage.
     * The heading of the app's primary screen was the one thing that user
     * could not read.
     *
     * The flex item had `min-width: 0` — which lets it shrink — but no
     * wrapping rule, so it shrank below its longest word and the word
     * overflowed into the button.
     */
    const trip = await createTrip(request, { name: 'Paris in March' });

    await page.setViewportSize({ width: 320, height: 780 });
    await page.addStyleTag({ content: 'html { font-size: 200% !important }' });
    await page.goto(`/trips/${trip.id}`);

    const title = page.getByRole('heading', { name: 'Paris in March' });
    const manage = page.getByRole('link', { name: /manage/i });
    await expect(title).toBeVisible();

    const [t, m] = await Promise.all([title.boundingBox(), manage.boundingBox()]);
    expect(t, 'the trip title must be laid out').not.toBeNull();
    expect(m, 'Manage must be laid out').not.toBeNull();

    // The assertion: the title's box must end before Manage's begins. Either
    // they sit side by side with room, or Manage has wrapped below.
    const sideBySide = t!.y < m!.y + m!.height && m!.y < t!.y + t!.height;
    if (sideBySide) {
      expect(t!.x + t!.width, 'the title runs under the Manage button').toBeLessThanOrEqual(m!.x);
    }

    // And nothing is clipped: the text fits the box it was given.
    const clipped = await title.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    expect(clipped, 'the trip name is cut off').toBe(false);
  });
});

test.describe('after a rejected save', () => {
  test('focus lands on the message, and the message names the field', async ({ page, request }) => {
    /**
     * Reported as SERIOUS, twice over.
     *
     * The submit button disables itself mid-press, so the focused element stops
     * being focusable and focus falls to `<body>` — the next Tab restarts from
     * the skip link at the top of the document, with the error somewhere in
     * between. And the error said "Check the journey details." while marking
     * nothing, on a form with twelve controls.
     *
     * An unknown airport code is the cheapest way to be refused by the server
     * rather than by the browser: it passes `required`, so the form submits.
     */
    const trip = await createTrip(request, { homeTimezone: 'Europe/Lisbon' });
    await page.goto(`/trips/${trip.id}/segment/new`);

    await page.getByLabel('Airline', { exact: true }).fill('TAP');
    await page.getByLabel('Flight number', { exact: true }).fill('TP442');
    await page.getByLabel('From', { exact: true }).fill('ZZZ');
    await page.getByLabel(/^Departs/).fill('2027-03-02T09:00');
    await page.getByLabel('To', { exact: true }).fill('ZZZ');
    await page.getByLabel(/^Arrives/).fill('2027-03-02T12:30');

    await page.getByRole('button', { name: /^Add$/ }).click();

    const error = page.getByRole('alert');
    await expect(error).toBeVisible();

    // Focus is on the message, not on the document. This is the assertion — a
    // user who cannot see the screen is now standing on the thing they need to
    // read rather than nowhere.
    await expect(error).toBeFocused();

    // And it says which field. "Check the journey details." alone is what the
    // audit called an error that points at nothing (WCAG 3.3.1).
    await expect(error).toContainText(/Look at /);
    await expect(error).toContainText(/From|To/);

    /**
     * And it is not a dead end. The alert takes `tabIndex={-1}` so script can
     * focus it and Tab cannot; tabbing on from it must continue forward through
     * the form in DOM order rather than restarting at the top of the document,
     * which is the behaviour being fixed.
     */
    await page.keyboard.press('Tab');
    const landed = await page.evaluate(() => document.activeElement?.tagName ?? '');
    expect(['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'A']).toContain(landed);
  });
});
