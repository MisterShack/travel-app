import { test, expect } from '../fixtures/test';

/**
 * Create a trip, then add a journey to it.
 *
 * The timezone assertion is the reason this spec is worth its runtime. A new
 * event defaulting to the *browser's* zone rather than the trip's was one of
 * the six defects the first browser drive found, and no unit test saw it —
 * jsdom has whatever zone the runner has, so the bug renders as correct.
 */
test.use({ storageState: ({ storageStatePath }, use) => use(storageStatePath) });

const TRIP = {
  name: `Lisbon ${Date.now()}`,
  destination: 'Lisbon, Portugal',
  start: '2027-03-01',
  end: '2027-03-08',
};

test.describe('a trip', () => {
  test('is created, listed, and opens its own timeline', async ({ page }) => {
    await page.goto('/trips/new');

    await page.getByLabel('Name').fill(TRIP.name);
    await page.getByLabel('Destination').fill(TRIP.destination);
    await page.getByLabel('Start').fill(TRIP.start);
    await page.getByLabel('End').fill(TRIP.end);

    await page.getByRole('button', { name: /create trip/i }).click();

    // Landing on the trip is the contract: creating something and being left
    // on the form is the shape of a silent failure.
    await expect(page).toHaveURL(/\/trips\/[^/]+$/);
    await expect(page.getByText(TRIP.name).first()).toBeVisible();

    // And it survives a reload, which is the difference between "the API
    // accepted it" and "it is actually there".
    await page.reload();
    await expect(page.getByText(TRIP.name).first()).toBeVisible();

    await page.goto('/');
    await expect(page.getByText(TRIP.name).first()).toBeVisible();
  });
});
