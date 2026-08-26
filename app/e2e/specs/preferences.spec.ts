import { test, expect, createTrip } from '../fixtures/test';

/**
 * Account-level display preferences: the theme and the time format.
 *
 * These need a real browser more than most things do. The theme is painted by
 * an inline script in `index.html` before the first frame, from a value mirrored
 * into `localStorage` — none of which exists under jsdom, and all of which is
 * the part that can actually be wrong. The assertions below read the *computed
 * background*, not the attribute, because an attribute that no rule matches is
 * exactly the failure this restructure could have introduced.
 */

test.use({
  storageState: ({ storageStatePath }, use) => use(storageStatePath),
  timezoneId: 'America/Toronto',
  /*
   * Pinned, because `auto` resolves against it. Left to the runner's default,
   * this suite would assert one format on a US machine and the other in a
   * European CI container, and the failure would read as a bug in the app.
   */
  locale: 'en-US',
});

const PAPER_LIGHT = 'rgb(250, 249, 247)';
const PAPER_DARK = 'rgb(16, 18, 22)';

const painted = (page: import('@playwright/test').Page) =>
  page.evaluate(() => ({
    attribute: document.documentElement.getAttribute('data-theme'),
    background: getComputedStyle(document.body).backgroundColor,
  }));

const setTheme = async (page: import('@playwright/test').Page, label: string) => {
  await page.goto('/account');
  await page.getByLabel('Theme').selectOption({ label });
};

test.describe('the theme preference', () => {
  test('follows the device when it is Automatic', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/account');
    expect(await painted(page)).toEqual({ attribute: 'light', background: PAPER_LIGHT });

    /*
     * The same page, flipped underneath it. This is what the axe suite relies on
     * when it scans "in dark" — without it, both of its passes would scan the
     * light palette and agree, which is a suite that proves nothing.
     */
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect
      .poll(async () => (await painted(page)).background)
      .toBe(PAPER_DARK);
    expect((await painted(page)).attribute).toBe('dark');
  });

  test('overrides a device that disagrees', async ({ page }) => {
    // The case the preference exists for: a dark phone, a reader who wants light.
    await page.emulateMedia({ colorScheme: 'dark' });
    await setTheme(page, 'Light');

    await expect.poll(async () => (await painted(page)).background).toBe(PAPER_LIGHT);
    expect((await painted(page)).attribute).toBe('light');
  });

  test('survives a reload without a flash of the other palette', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await setTheme(page, 'Dark');
    await expect.poll(async () => (await painted(page)).background).toBe(PAPER_DARK);

    /*
     * A full reload, which is the path the inline boot script exists for: the
     * preference lives on the account and does not arrive until /me answers, so
     * the mirror in localStorage is what paints the first frame.
     */
    await page.reload();

    // Read before the app can have finished loading /me. If this is light, the
    // reader saw a flash on every cold start.
    const first = await page.evaluate(() => ({
      attribute: document.documentElement.getAttribute('data-theme'),
      stored: localStorage.getItem('waypoint.theme'),
    }));
    expect(first).toEqual({ attribute: 'dark', stored: 'dark' });
    expect((await painted(page)).background).toBe(PAPER_DARK);
  });

  test('is stored on the account, not the browser', async ({ page, request }) => {
    await setTheme(page, 'Dark');
    // Read straight back from the API, with no client state involved.
    const me = await request.get('/api/auth/me');
    expect(((await me.json()) as { user: { preferences: { theme: string } } }).user.preferences.theme).toBe('dark');
  });
});

test.describe('the time format preference', () => {
  test('rewrites the timeline, and leaves the day it is filed under alone', async ({
    page,
    request,
  }) => {
    const trip = await createTrip(request, { homeTimezone: 'Europe/Lisbon' });
    const created = await request.post(`/api/trips/${trip.id}/activities`, {
      data: {
        kind: 'restaurant',
        name: 'Belcanto',
        location: 'R. Serpa Pinto 10A, Lisboa',
        start: { local: '2027-03-03T19:30', timezone: 'Europe/Lisbon' },
      },
    });
    expect(created.status(), `seeding the activity failed: ${await created.text()}`).toBe(201);

    /*
     * The default is Automatic and this browser is en-US, so the timeline opens
     * 12-hour. That is a real change from what the app showed before the
     * preference existed, when every reader saw 24-hour whatever their locale.
     */
    await page.goto(`/trips/${trip.id}`);
    await expect(page.getByText(/7:30\s*(PM|p\.m\.)/i)).toBeVisible();

    // And an explicit 24-hour overrides a device that said otherwise.
    await page.goto('/account');
    await page.getByLabel('Time format').selectOption({ label: '24-hour — 19:30' });

    await page.goto(`/trips/${trip.id}`);
    await expect(page.getByText('19:30')).toBeVisible();
    await expect(page.getByText(/7:30\s*(PM|p\.m\.)/i)).toBeHidden();

    /*
     * The heading must not move. Grouping reads the first ten characters of the
     * canonical `YYYY-MM-DDTHH:mm` string, so a formatted time reaching it would
     * file the event under the wrong day — or under none.
     */
    await expect(page.locator('.day > h3')).toHaveText(/March 3|3 March/);
  });
});
