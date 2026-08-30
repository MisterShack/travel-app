import { createTrip, test, expect } from '../fixtures/test';
import { countRows } from '../fixtures/db';

/**
 * The trip timeline is readable without connectivity (ROADMAP.md §2).
 *
 * This is the app's central claim and the one PLAN.md §4 puts in writing, so it
 * is the journey most worth having in a browser: the read-through IndexedDB
 * cache cannot be exercised in jsdom, and a person clicking around online will
 * never notice it is broken. The failure it guards against is a traveller
 * opening their itinerary on a plane and finding a spinner.
 *
 * **What this covers, and what it does not.** The suite runs Vite in dev, where
 * the service worker is deliberately disabled — so a *reload* while offline has
 * no cached shell to load and fails before any application code runs. What is
 * exercised here is the IndexedDB read-through cache, reached by client-side
 * navigation, which is where the itinerary itself actually lives. The service
 * worker's own offline behaviour needs the production build and is a separate
 * question; `drive.mjs` makes the same split for the same reason. Saying so is
 * better than a spec that quietly proves less than its name suggests.
 */

test.use({ storageState: ({ storageStatePath }, use) => use(storageStatePath) });

/** Seeded through the API — the forms that create these are timeline.spec's job. */
async function seedTimeline(request: Parameters<typeof createTrip>[0], tripId: string) {
  const segment = await request.post(`/api/trips/${tripId}/segments`, {
    data: {
      mode: 'air',
      carrier: 'TAP',
      service: 'TP442',
      origin: 'LIS',
      departure: { local: '2027-03-02T09:00', timezone: 'Europe/Lisbon' },
      destination: 'CDG',
      arrival: { local: '2027-03-02T12:30', timezone: 'Europe/Paris' },
      passengers: [{ name: 'David', seat: '14C' }],
    },
  });
  expect(segment.status(), `seeding a segment failed: ${await segment.text()}`).toBe(201);

  const stay = await request.post(`/api/trips/${tripId}/lodging`, {
    data: {
      name: 'Hotel Lutetia',
      address: '45 Boulevard Raspail, 75006 Paris',
      checkIn: { local: '2027-03-02T15:00', timezone: 'Europe/Paris' },
      checkOut: { local: '2027-03-05T11:00', timezone: 'Europe/Paris' },
    },
  });
  expect(stay.status(), `seeding lodging failed: ${await stay.text()}`).toBe(201);
}

test.describe('with no network', () => {
  test('a trip seen online is still readable offline', async ({ page, request, context }) => {
    const trip = await createTrip(request, { name: `Offline ${Date.now()}` });
    await seedTimeline(request, trip.id);

    // Online first. The cache is read-through — it is written on a *successful*
    // read, so a trip never opened with a network was never cached, and that is
    // the design rather than a gap.
    await page.goto(`/trips/${trip.id}`);
    await expect(page.getByRole('link', { name: 'Journey: TAP TP442' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Stay: Check in — Hotel Lutetia' })).toBeVisible();

    /**
     * Back to the list, still online — and the list has to be *proved* on screen
     * before the network is cut, because the cache is only written by a read
     * that succeeded.
     *
     * `getByText(trip.name)` did not prove it. The trip detail page this
     * navigates away from carries the same text in its own
     * `<h2 class="screen-title">`, so the first poll after the click could match
     * the page being *left* — a window of a frame or two, which never opened on
     * a developer's machine and opened on every run in CI. The network was then
     * cut while the list's own fetch was still in flight; that fetch failed, so
     * nothing was cached, and the offline half of this test sat waiting for a
     * list that had only ever rendered "Could not load your trips".
     *
     * The heading pins which screen this is, and the card is a *link*, which the
     * heading it was colliding with is not.
     */
    await page.getByRole('link', { name: 'Waypoint' }).click();
    await expect(page.getByRole('heading', { name: 'Trips' })).toBeVisible();
    const card = page.getByRole('link', { name: trip.name });
    await expect(card).toBeVisible();

    await context.setOffline(true);

    /**
     * A client-side navigation, not a reload — see the note at the top. With the
     * network cut, anything that renders below can only have come from
     * IndexedDB.
     */
    await card.click();
    await expect(page).toHaveURL(new RegExp(`/trips/${trip.id}$`));

    /**
     * The banner is the proof, not decoration. `stale` is set in exactly one
     * place — the branch `readThrough` takes when the fetch threw `OfflineError`
     * and a cached copy was found. If the timeline had somehow been fetched, the
     * events would render and this would not.
     */
    await expect(page.getByText(/Offline — showing the copy saved/)).toBeVisible();

    // The itinerary itself, which is the whole point.
    await expect(page.getByRole('link', { name: 'Journey: TAP TP442' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Stay: Check in — Hotel Lutetia' })).toBeVisible();

    /**
     * Phase 8's directions survive too, and this is the case that makes the
     * hand-off worth having: a URL needs no network to exist, so it still works
     * exactly where an embedded map would have shown a grey box.
     */
    await expect(page.getByRole('link', { name: 'Directions to Hotel Lutetia' })).toBeVisible();

    // The banner says *when*, not just *that*. A traveller needs to know whether
    // they are seeing what the server has or what their phone remembered,
    // because the two differ exactly when someone else has changed the plan.
    await expect(page.getByText(/showing the copy saved \w/)).toBeVisible();

    await context.setOffline(false);
  });

  test('an offline write is refused rather than silently lost', async ({
    page,
    request,
    context,
  }) => {
    /**
     * Offline *writes* are explicitly out of scope (PLAN.md §4), which makes the
     * honesty of the refusal the feature. The failure this guards against is a
     * form that appears to save, leaves the user believing the reservation is on
     * the trip, and drops it — worse than refusing, because the user stops
     * thinking about it.
     */
    const trip = await createTrip(request, { name: `No writes ${Date.now()}` });

    await page.goto(`/trips/${trip.id}/activity/new`);
    await expect(page.getByLabel('Timezone')).toHaveValue(trip.homeTimezone);

    await context.setOffline(true);

    await page.getByLabel('Name', { exact: true }).fill('Dinner that never saved');
    await page.getByLabel('Starts', { exact: true }).fill('2027-03-03T20:30');
    await page.getByRole('button', { name: /^Add$/ }).click();

    // Said out loud, and still on the form with the typed values intact — so
    // the user can hit save again once there is a signal.
    await expect(page.getByText('Could not reach the server.')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/trips/${trip.id}/activity/new$`));
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Dinner that never saved');

    await context.setOffline(false);

    // Nothing was written — asserted against the database rather than the
    // screen, because "the form still shows an error" and "the row is not
    // there" are different claims and only the second one matters.
    expect(await countRows('activities', trip.id)).toBe(0);
  });
});
