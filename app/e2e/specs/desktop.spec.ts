import { createTrip, test, expect } from '../fixtures/test';

/**
 * The two-pane layout, which only exists at 72rem and above.
 *
 * Its own project in `playwright.config.ts`, at 1440×900, because the width is
 * the whole subject: below the breakpoint none of this is true, and every other
 * spec in this suite runs at 900px against the pushed-screen model they were
 * written for.
 *
 * What is worth asserting here is not that it *looks* different — a screenshot
 * would say that and say nothing about whether it works. It is that opening a
 * trip stops being a navigation away from the list: the list is still there,
 * still says which trip is open, and the URL is still the trip's own, so a deep
 * link and a reload land in the same place they always did.
 */

test.use({ storageState: ({ storageStatePath }, use) => use(storageStatePath) });

test.describe('at desktop width', () => {
  test('the trips list stays beside the trip it opens', async ({ page, request }) => {
    const trip = await createTrip(request, { name: `Desktop ${Date.now()}` });

    await page.goto('/');

    const list = page.getByRole('navigation', { name: 'Trips' });
    await expect(list).toBeVisible();

    const card = list.getByRole('link', { name: trip.name });
    await card.click();

    // The address bar still names the trip: two panes is a layout, not a
    // different application, and a deep link to a trip must still work.
    await expect(page).toHaveURL(new RegExp(`/trips/${trip.id}$`));

    // The point of the whole change: the list did not go anywhere.
    await expect(list).toBeVisible();
    await expect(card).toBeVisible();

    // And it says which of its rows the pane beside it is showing. A master
    // list that does not is a list of links to nowhere in particular.
    await expect(card).toHaveAttribute('aria-current', 'page');

    await expect(page.getByRole('heading', { name: trip.name })).toBeVisible();
  });

  test('with no trip open the detail pane says so, rather than repeating the list', async ({
    page,
    request,
  }) => {
    const trip = await createTrip(request, { name: `Empty pane ${Date.now()}` });

    await page.goto('/');

    // Exactly one list on the screen. Rendering `/` into the detail pane as
    // well would put the same screen on the page twice, with two copies of
    // every trip's link for a keyboard user to tab through.
    await expect(page.getByRole('link', { name: trip.name })).toHaveCount(1);
    await expect(page.getByText('No trip open.')).toBeVisible();
  });

  test('adding is a header button, and nothing floats', async ({ page, request }) => {
    const trip = await createTrip(request, { name: `No fab ${Date.now()}` });

    await page.goto(`/trips/${trip.id}`);

    // One control, in the header. The floating button is the phone's answer to
    // the same problem and the two must never both be on screen — which is
    // exactly what a count of 1 asserts.
    const add = page.getByRole('button', { name: 'Add to trip' });
    await expect(add).toHaveCount(1);
    await expect(add).toBeVisible();

    // It still opens the same sheet, with the same four choices.
    await add.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('link', { name: 'Flight' })).toBeVisible();
  });
});

/**
 * The pane is permanent, which is the point of it and also its hazard: it never
 * unmounts, so anything that changes the set of trips has to reach it without
 * the component being rebuilt. On a phone this class of bug is invisible —
 * every navigation rebuilds the screen — which is exactly why it belongs here.
 *
 * Reported from the running app on 2026-08-29: a deleted trip stayed in the
 * side panel until a reload.
 */
test.describe('the trips pane keeps up', () => {
  test('a deleted trip leaves the pane without a reload', async ({ page, request }) => {
    const doomed = await createTrip(request, { name: `Doomed ${Date.now()}` });
    const keeper = await createTrip(request, { name: `Keeper ${Date.now()}` });

    await page.goto(`/trips/${doomed.id}/settings`);

    const list = page.getByRole('navigation', { name: 'Trips' });
    await expect(list.getByRole('link', { name: doomed.name })).toBeVisible();

    // The delete is behind a native confirm, which blocks everything until it
    // is answered — so it is accepted rather than triggered and abandoned.
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Delete trip' }).click();

    await expect(page).toHaveURL(/\/$/);

    // The assertion this test exists for. No reload anywhere above.
    await expect(list.getByRole('link', { name: doomed.name })).toHaveCount(0);
    await expect(list.getByRole('link', { name: keeper.name })).toBeVisible();
  });

  test('a newly created trip appears in the pane', async ({ page }) => {
    const name = `Created ${Date.now()}`;

    await page.goto('/trips/new');
    await page.getByLabel('Name', { exact: true }).fill(name);
    await page.getByLabel('Start', { exact: true }).fill('2027-05-01');
    await page.getByLabel('End', { exact: true }).fill('2027-05-08');
    await page.getByRole('button', { name: 'Create trip' }).click();

    await expect(page).toHaveURL(/\/trips\/trp_/);

    // The other half of the same defect: the pane is beside the trip that was
    // just made, and said nothing about it.
    await expect(
      page.getByRole('navigation', { name: 'Trips' }).getByRole('link', { name }),
    ).toBeVisible();
  });
});
