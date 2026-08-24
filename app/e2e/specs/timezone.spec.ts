import { test, expect } from '../fixtures/test';

/**
 * A new event defaults to the trip's zone, not the browser's.
 *
 * This is the highest-value assertion in the suite, and the one a unit test
 * structurally cannot make: jsdom has whatever zone the runner has, so the bug
 * renders as correct on the machine that would catch it. It was found by a
 * person driving a browser, and `EventForm.tsx` names the scenario in a comment
 * — planning a Lisbon trip from a laptop in Chicago records every restaurant in
 * `America/Chicago`, producing a plausible-looking timeline whose stored
 * instants are six hours wrong. It is invisible until you travel.
 *
 * So the browser is pinned to Chicago and the trip to Lisbon. If the two ever
 * matched, this spec would pass while proving nothing.
 */

const BROWSER_ZONE = 'America/Chicago';
const TRIP_ZONE = 'Europe/Lisbon';

test.use({
  storageState: ({ storageStatePath }, use) => use(storageStatePath),
  timezoneId: BROWSER_ZONE,
});

test.describe('a new event', () => {
  test(`defaults to the trip's zone, not the browser's`, async ({ page }) => {
    // Guard the premise rather than assume it: if the browser were already in
    // the trip's zone the assertion below would be vacuous.
    const actual = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(actual, 'the browser must not already be in the trip zone').toBe(BROWSER_ZONE);
    expect(actual).not.toBe(TRIP_ZONE);

    await page.goto('/trips/new');
    await page.getByLabel('Name').fill(`Lisbon zones ${Date.now()}`);
    await page.getByLabel('Start').fill('2027-05-01');
    await page.getByLabel('End').fill('2027-05-09');
    await page.getByLabel(/home timezone/i).selectOption(TRIP_ZONE);
    await page.getByRole('button', { name: /create trip/i }).click();

    /**
     * `\/trips\/[^/]+$` would also match `/trips/new` — the page this test is
     * already on. It passed while navigation was still pending, `pop()` returned
     * the literal string "new", and the form then requested `/api/trips/new`,
     * got a 404, and never learned the trip's zone. The spec failed with
     * "expected Europe/Lisbon, received America/Chicago", which is exactly what
     * the real bug would look like.
     *
     * A URL assertion that also matches the page you started on proves nothing.
     * Trip ids are prefixed, so match the prefix.
     */
    await expect(page).toHaveURL(/\/trips\/trp_[^/]+$/);
    const tripId = new URL(page.url()).pathname.split('/').pop();

    await page.goto(`/trips/${tripId}/activity/new`);

    // The field starts on the browser's guess and is corrected once the trip
    // loads, so this must wait for the corrected value rather than read once.
    await expect(page.getByLabel('Timezone')).toHaveValue(TRIP_ZONE);
  });
});
