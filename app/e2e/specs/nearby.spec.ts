import AxeBuilder from '@axe-core/playwright';
import { createTrip, test, expect } from '../fixtures/test';

/**
 * "What's nearby" on an activity's own page — Phase 10 (PLAN-V3 §3).
 *
 * **What this covers, and what it does not.** The model call happens on the
 * server, so a browser cannot intercept it: `page.route` stubs *our own* API,
 * which means this proves the client half — the chips, the request each one
 * sends, the citations rendering with the prose, the refusals — and proves
 * nothing at all about Grounding with Google Maps. The server's own specs cover
 * the request it builds and the reply it parses, and neither is the same as a
 * real grounded call. Saying so is the point: a spec that quietly proves less
 * than its name claims is worse than one that says so.
 *
 * It is here rather than folded into `timeline.spec.ts` because it is the first
 * journey on this screen that is not about saving a row.
 */

test.use({ storageState: ({ storageStatePath }, use) => use(storageStatePath) });

const ADDRESS = '9 Carrefour de l Odeon, Paris';

const ANSWER = {
  answer: {
    intent: 'eat',
    text: 'Bouillon Racine and Le Petit Zinc are both about five minutes on foot.',
    places: [
      { title: 'Bouillon Racine', uri: 'https://maps.google.com/?cid=1' },
      { title: 'Le Petit Zinc', uri: 'https://maps.google.com/?cid=2' },
    ],
    generated: true,
  },
  remaining: 24,
};

/** Creates an activity with an address and opens its page. */
async function openActivity(
  page: import('@playwright/test').Page,
  request: import('@playwright/test').APIRequestContext,
  location: string | null = ADDRESS,
) {
  const trip = await createTrip(request, { homeTimezone: 'Europe/Paris' });
  const created = await request.post(`/api/trips/${trip.id}/activities`, {
    data: {
      kind: 'restaurant',
      name: 'Dinner',
      ...(location === null ? {} : { location }),
      start: { local: '2027-03-02T20:00', timezone: 'Europe/Paris' },
    },
  });
  expect(created.status(), `creating the activity failed: ${await created.text()}`).toBe(201);
  const { id } = (await created.json()) as { id: string };

  await page.goto(`/trips/${trip.id}/activity/${id}`);
  return { tripId: trip.id, id };
}

test.describe('asking what is nearby', () => {
  test('nothing is asked until a chip is tapped, and the answer cites its places', async ({
    page,
    request,
  }) => {
    let asked = 0;
    let sent: unknown = null;
    await page.route('**/api/activities/*/nearby', async (route) => {
      asked++;
      sent = route.request().postDataJSON();
      await route.fulfill({ json: ANSWER });
    });

    await openActivity(page, request);

    // Pulled, never pushed. The panel renders; it must not have asked anything.
    await expect(page.getByRole('heading', { name: /what.s nearby/i })).toBeVisible();
    expect(asked, 'the page asked a question nobody tapped').toBe(0);

    await page.getByRole('button', { name: 'Eat nearby' }).click();

    await expect(page.getByText(ANSWER.answer.text)).toBeVisible();
    expect(sent).toEqual({ intent: 'eat' });

    /**
     * The citations, visible without a further interaction. Grounding with
     * Google Maps requires the sources be shown with the content they support
     * and be reachable within one interaction — so this assertion is a term of
     * use, not a preference about layout.
     */
    const first = page.getByRole('link', { name: 'Bouillon Racine' });
    await expect(first).toBeVisible();
    await expect(first).toHaveAttribute('href', 'https://maps.google.com/?cid=1');
    await expect(page.getByRole('link', { name: 'Le Petit Zinc' })).toBeVisible();
    await expect(page.getByText(/Google Maps/)).toBeVisible();
  });

  test('a different chip asks a different question', async ({ page, request }) => {
    const intents: unknown[] = [];
    await page.route('**/api/activities/*/nearby', async (route) => {
      intents.push(route.request().postDataJSON());
      await route.fulfill({ json: ANSWER });
    });

    await openActivity(page, request);
    await page.getByRole('button', { name: 'Getting around' }).click();
    await expect(page.getByText(ANSWER.answer.text)).toBeVisible();

    expect(intents).toEqual([{ intent: 'transit' }]);
  });

  test('the panel is absent on an event with no address', async ({ page, request }) => {
    // There is nothing to ground a question against, so there is no offer —
    // rather than a chip that fails once tapped.
    await openActivity(page, request, null);

    await expect(page.getByRole('heading', { name: /edit activity/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /what.s nearby/i })).toHaveCount(0);
  });

  test('the panel is absent on a journey, where an endpoint is not an address', async ({
    page,
    request,
  }) => {
    // The same line Phase 8 drew for Directions: an IATA code is not an address
    // and a station's city is not the station.
    const trip = await createTrip(request, { homeTimezone: 'Europe/Paris' });
    const created = await request.post(`/api/trips/${trip.id}/segments`, {
      data: {
        mode: 'air',
        carrier: 'TAP',
        service: 'TP442',
        origin: 'LIS',
        departure: { local: '2027-03-01T10:00', timezone: 'Europe/Lisbon' },
        destination: 'CDG',
        arrival: { local: '2027-03-01T14:00', timezone: 'Europe/Paris' },
      },
    });
    const { id } = (await created.json()) as { id: string };

    await page.goto(`/trips/${trip.id}/segment/${id}`);
    await expect(page.getByLabel('Airline', { exact: true })).toHaveValue('TAP');
    await expect(page.getByRole('heading', { name: /what.s nearby/i })).toHaveCount(0);
  });

  test("the server's refusal is shown as written, not replaced", async ({ page, request }) => {
    await page.route('**/api/activities/*/nearby', (route) =>
      route.fulfill({
        status: 429,
        json: { error: 'daily_cap', message: 'That is 25 questions today. Try again tomorrow.' },
      }),
    );

    await openActivity(page, request);
    await page.getByRole('button', { name: 'Eat nearby' }).click();

    await expect(page.getByText('That is 25 questions today. Try again tomorrow.')).toBeVisible();
  });

  test('is operable by keyboard, and does not move focus when the answer lands', async ({
    page,
    request,
  }) => {
    await page.route('**/api/activities/*/nearby', (route) => route.fulfill({ json: ANSWER }));
    await openActivity(page, request);

    const chip = page.getByRole('button', { name: 'Eat nearby' });
    await chip.focus();
    await page.keyboard.press('Enter');

    await expect(page.getByText(ANSWER.answer.text)).toBeVisible();
    // Focus stays where the user put it; the live region does the announcing.
    await expect(chip).toBeFocused();
    await expect(page.getByRole('heading', { name: 'Eat nearby' })).toBeVisible();
  });

  test('the live region exists before the first question is asked', async ({ page, request }) => {
    /*
     * The defect this pins: the region used to be `display: none` until it had
     * content, so it entered the accessibility tree in the same commit as its
     * first answer — and a live region created with its content already in it
     * is not announced. The first question of every session was silent, and it
     * looked fine to anyone who tested by pressing a chip twice.
     */
    await page.route('**/api/activities/*/nearby', (route) => route.fulfill({ json: ANSWER }));
    await openActivity(page, request);

    /*
     * Scoped to the panel, not the document.
     *
     * A bare `[role="status"]` was matching whatever else the screen happened
     * to carry — and an event form now also announces "Saving…" from a region
     * of its own, for the same reason this one exists. What these two tests are
     * about is *this* panel's region, so they say so; asserting that the whole
     * page holds exactly one live region was never the point and was never
     * true of anything in particular.
     */
    const live = page.locator('.nearby [role="status"]');
    await expect(live).toHaveCount(1);
    await expect(live).toHaveText('');
    // Present in the tree, not merely in the DOM.
    expect(await live.evaluate((el) => getComputedStyle(el).display)).not.toBe('none');

    // `aria-busy` would tell assistive tech to withhold exactly the message
    // whose job is to be heard while the request is in flight.
    await expect(live).not.toHaveAttribute('aria-busy', 'true');

    await page.getByRole('button', { name: 'Eat nearby' }).click();
    await expect(live).toContainText(ANSWER.answer.text);
    await expect(live).not.toHaveAttribute('aria-busy', 'true');
  });

  test('the live region announces the answer, not the apparatus', async ({ page, request }) => {
    // `role="status"` is implicitly atomic, so anything inside is re-spoken in
    // full on every answer. With the citations in there, every place name was
    // read twice — once in the prose, once as a flattened link title — then the
    // attribution and the quota line, every time.
    await page.route('**/api/activities/*/nearby', (route) => route.fulfill({ json: ANSWER }));
    await openActivity(page, request);
    await page.getByRole('button', { name: 'Eat nearby' }).click();

    const live = page.locator('.nearby [role="status"]');
    await expect(live).toContainText(ANSWER.answer.text);
    await expect(live.getByRole('link')).toHaveCount(0);
    await expect(live).not.toContainText('Google Maps');

    // Still contractual, and still satisfied: the citations follow the prose
    // immediately, on screen and in DOM order, as reachable links.
    const list = page.locator('.nearby-places');
    await expect(list.getByRole('link')).toHaveCount(2);
    expect(
      await page.evaluate(
        () => document.querySelector('.nearby [role="status"]')?.nextElementSibling?.className,
      ),
    ).toContain('nearby-places');
  });

  test('a refusing chip stays reachable and says why', async ({ page, request }) => {
    // `aria-disabled`, not `disabled`: an unfocusable chip cannot be tabbed to
    // and cannot have its reason read, so a keyboard user heading for it lands
    // somewhere else with nothing explaining the disappearance.
    let asked = 0;
    await page.route('**/api/activities/*/nearby', async (route) => {
      asked++;
      await route.fulfill({ json: ANSWER });
    });
    await openActivity(page, request);

    await page.getByLabel('Where', { exact: true }).fill('Somewhere else entirely');

    const chip = page.getByRole('button', { name: 'Eat nearby' });
    await expect(chip).toHaveAttribute('aria-disabled', 'true');
    await chip.focus();
    await expect(chip).toBeFocused();

    /*
     * `force`, because Playwright's own actionability check already treats
     * `aria-disabled="true"` as not enabled and would otherwise wait for it to
     * become clickable — which is itself a decent sign the semantics read the
     * way they are meant to. The point here is the other half: `aria-disabled`
     * is a promise, not an enforcement, so a click that does arrive must be
     * refused by the handler rather than by the browser.
     */
    await chip.click({ force: true });
    expect(asked, 'a refusing chip still asked the model').toBe(0);
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`has no axe violations with an answer on screen in ${theme}`, async ({
      page,
      request,
    }) => {
      await page.route('**/api/activities/*/nearby', (route) => route.fulfill({ json: ANSWER }));
      await openActivity(page, request);
      await page.getByRole('button', { name: 'Eat nearby' }).click();
      await expect(page.getByText(ANSWER.answer.text)).toBeVisible();

      await page.emulateMedia({ colorScheme: theme });
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const summary = results.violations.map((v) => `${v.id} (${v.nodes.length}) — ${v.help}`);
      expect(summary, `axe violations in ${theme} mode`).toEqual([]);
    });
  }
});
