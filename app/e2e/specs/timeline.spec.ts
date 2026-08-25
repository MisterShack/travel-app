import { createTrip, test, expect } from '../fixtures/test';
import { onlyRow } from '../fixtures/db';

/**
 * Adding each timeline entity type to a trip — the last of PLAN-V2 §5 step 3's
 * entity journeys (ROADMAP.md §2).
 *
 * Every one of these asserts the **stored UTC instant**, not just that the
 * event appeared. That is the assertion worth the runtime: local wall-clock
 * plus a zone is the source of truth and the instant is derived from it
 * (PLAN.md §4), and the derived value is never rendered anywhere. A timeline
 * that reads perfectly and a database holding an instant an hour out are
 * indistinguishable on screen — until you travel, which is the one moment this
 * app exists for.
 *
 * **Four zones, all different, on purpose.** The browser is Chicago, the trip
 * is Toronto, and the flight runs Lisbon to Paris. Every plausible fallback bug
 * — using the browser's zone, using the trip's, or using the departure zone for
 * both endpoints — produces a different instant from the right one. Pick a pair
 * of endpoints in the same offset and the spec passes while proving nothing;
 * Lisbon and London would have done exactly that, since they never differ.
 */

const BROWSER_ZONE = 'America/Chicago';
const TRIP_ZONE = 'America/Toronto';

test.use({
  storageState: ({ storageStatePath }, use) => use(storageStatePath),
  timezoneId: BROWSER_ZONE,
});

test.describe('adding to a trip', () => {
  test('a flight derives each endpoint zone from its airport code', async ({ page, request }) => {
    const trip = await createTrip(request, { homeTimezone: TRIP_ZONE });

    // Guard the premise. If any of these coincided the instants below could be
    // right for the wrong reason.
    const browserZone = await page.evaluate(
      () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
    expect(browserZone, 'the browser must not sit in any zone under test').toBe(BROWSER_ZONE);
    expect([TRIP_ZONE, 'Europe/Lisbon', 'Europe/Paris']).not.toContain(browserZone);

    await page.goto(`/trips/${trip.id}`);

    // Through the add sheet rather than a deep link: the sheet is how a user
    // gets here, and "Add to trip" then "Flight" is the path that would break
    // if the sheet's routes drifted from the form's.
    await page.getByRole('button', { name: /add to trip/i }).click();
    await page.getByRole('link', { name: /^Flight/ }).click();
    await expect(page).toHaveURL(new RegExp(`/trips/${trip.id}/segment/new$`));

    await page.getByLabel('Airline', { exact: true }).fill('TAP');
    await page.getByLabel('Flight number', { exact: true }).fill('TP442');

    /**
     * Typing the code is what resolves the zone, asynchronously — the airport
     * table is a dynamic import, so the field is briefly unresolved. Asserting
     * the hint is both the wait and the point: it proves the zone came from the
     * code rather than from a fallback.
     */
    await page.getByLabel('From', { exact: true }).fill('LIS');
    await expect(page.getByText(/Europe\/Lisbon/)).toBeVisible();
    await page.getByLabel(/^Departs/).fill('2027-03-02T09:00');

    await page.getByLabel('To', { exact: true }).fill('CDG');
    await expect(page.getByText(/Europe\/Paris/)).toBeVisible();
    await page.getByLabel(/^Arrives/).fill('2027-03-02T12:30');

    await page.getByRole('button', { name: /^Add$/ }).click();

    // Back on the trip, with the journey on it. Being left on the form is the
    // shape of a silent failure, and a warning would stop here too.
    await expect(page).toHaveURL(new RegExp(`/trips/${trip.id}$`));
    await expect(page.getByRole('link', { name: 'Journey: TAP TP442' })).toBeVisible();

    /**
     * The assertion this spec exists for.
     *
     * On 2027-03-02 Lisbon is UTC+0 and Paris is UTC+1 — EU summer time does
     * not start until the 28th. So 09:00 in Lisbon is 09:00Z and 12:30 in Paris
     * is 11:30Z, and the flight is two and a half hours rather than the three
     * and a half a single-zone bug would record.
     */
    const row = await onlyRow('segments', trip.id);
    expect(row['departure_timezone']).toBe('Europe/Lisbon');
    expect(row['arrival_timezone']).toBe('Europe/Paris');
    expect(row['departure_local']).toBe('2027-03-02T09:00');
    expect(row['arrival_local']).toBe('2027-03-02T12:30');
    expect(row['departure_at']).toBe('2027-03-02T09:00:00.000Z');
    expect(row['arrival_at']).toBe('2027-03-02T11:30:00.000Z');

    // Stated separately because it is the reading a human would do, and it
    // fails loudly if either instant above drifts.
    const minutes =
      (Date.parse(String(row['arrival_at'])) - Date.parse(String(row['departure_at']))) / 60000;
    expect(minutes, 'a single-zone bug records this as 210 minutes').toBe(150);
  });

  test('a train asks for its zone, and calls its operator an operator', async ({
    page,
    request,
  }) => {
    const trip = await createTrip(request, { homeTimezone: TRIP_ZONE });

    await page.goto(`/trips/${trip.id}`);
    await page.getByRole('button', { name: /add to trip/i }).click();
    await page.getByRole('link', { name: /^Train/ }).click();

    /**
     * The mode rides in on a query parameter so that "add a train" is a real,
     * bookmarkable link (PLAN-V3 §3a). If that were dropped the form would open
     * on Flight and every label below would be the flight-first wording this
     * phase exists to remove — which is why the labels are the assertion rather
     * than the select's value alone.
     */
    await expect(page).toHaveURL(new RegExp(`/trips/${trip.id}/segment/new\\?mode=rail$`));
    await expect(page.getByLabel('How')).toHaveValue('rail');
    await expect(page.getByRole('heading', { name: /add train/i })).toBeVisible();

    await page.getByLabel('Operator', { exact: true }).fill('Via Rail');
    await page.getByLabel('Train number', { exact: true }).fill('55');
    await page.getByLabel('From station', { exact: true }).fill('Ottawa');

    /**
     * There is no IATA code for a station, so the zone is asked for rather than
     * derived — and setting the departure zone sets the arrival zone with it.
     * Most rail journeys do not cross a zone, and leaving arrival on the trip's
     * home zone while departure moved records an instant hours out with both
     * fields looking filled in. Asserting the follow-along is asserting that.
     */
    await page.getByLabel('Departure timezone').selectOption('America/Toronto');
    await expect(page.getByLabel('Arrival timezone')).toHaveValue('America/Toronto');

    await page.getByLabel(/^Departs/).fill('2027-03-03T08:15');
    await page.getByLabel('To station', { exact: true }).fill('Toronto Union');
    await page.getByLabel(/^Arrives/).fill('2027-03-03T12:45');

    await page.getByRole('button', { name: /^Add$/ }).click();
    await expect(page).toHaveURL(new RegExp(`/trips/${trip.id}$`));
    await expect(page.getByRole('link', { name: 'Journey: Via Rail 55' })).toBeVisible();

    const row = await onlyRow('segments', trip.id);
    expect(row['mode'], 'a rail journey stored as air throws its station away').toBe('rail');
    // The station name is kept as typed. An IATA code is not an address and a
    // station's city is not the station (PLAN-V3 §3a).
    expect(row['origin']).toBe('Ottawa');
    expect(row['destination']).toBe('Toronto Union');
    // 2027-03-03 is before North American DST begins on the 14th, so Toronto is
    // UTC-5 and 08:15 local is 13:15Z.
    expect(row['departure_at']).toBe('2027-03-03T13:15:00.000Z');
    expect(row['arrival_at']).toBe('2027-03-03T17:45:00.000Z');
  });

  test('a stay keeps its address, and offers directions to it', async ({ page, request }) => {
    const trip = await createTrip(request, { homeTimezone: TRIP_ZONE });

    await page.goto(`/trips/${trip.id}`);
    await page.getByRole('button', { name: /add to trip/i }).click();
    await page.getByRole('link', { name: /^Stay/ }).click();

    await page.getByLabel('Name', { exact: true }).fill('Hotel Lutetia');
    await page.getByLabel('Address', { exact: true }).fill('45 Boulevard Raspail, 75006 Paris');
    await page.getByLabel('Timezone').selectOption('Europe/Paris');
    await page.getByLabel('Check in', { exact: true }).fill('2027-03-02T15:00');
    await page.getByLabel('Check out', { exact: true }).fill('2027-03-05T11:00');

    await page.getByRole('button', { name: /^Add$/ }).click();
    await expect(page).toHaveURL(new RegExp(`/trips/${trip.id}$`));
    await expect(page.getByRole('link', { name: 'Stay: Hotel Lutetia' })).toBeVisible();

    /**
     * Phase 8's hand-off (PLAN-V3 §2). A stay with an address gets a Directions
     * action; the accessible name is the whole phrase, because a
     * visually-hidden suffix computes as "Directionsto Hotel Lutetia" — name
     * computation collapses the leading space.
     */
    const directions = page.getByRole('link', { name: 'Directions to Hotel Lutetia' });
    await expect(directions).toBeVisible();
    await expect(directions).toHaveAttribute(
      'href',
      /maps.*destination=45%20Boulevard%20Raspail%2C%2075006%20Paris/,
    );

    /**
     * Two sibling links in one card, never nested. The card used to be a single
     * `<Link>` wrapping everything, which would have made this action an anchor
     * inside an anchor — invalid HTML, with tab order and activation differing
     * by browser. Asserted here as well as in the unit test because this is the
     * real browser, which is where the difference would actually show.
     */
    expect(await page.locator('a a').count()).toBe(0);

    const row = await onlyRow('lodging', trip.id);
    expect(row['address']).toBe('45 Boulevard Raspail, 75006 Paris');
    expect(row['check_in_timezone']).toBe('Europe/Paris');
    expect(row['check_out_timezone']).toBe('Europe/Paris');
    // Paris is UTC+1 on these dates, so 15:00 local is 14:00Z.
    expect(row['check_in_at']).toBe('2027-03-02T14:00:00.000Z');
    expect(row['check_out_at']).toBe('2027-03-05T10:00:00.000Z');
  });

  test('an activity is labelled with its city, not its timezone\'s namesake', async ({
    page,
    request,
  }) => {
    /**
     * Reported 2026-08-25: a Montreal dinner read as "Toronto".
     *
     * `America/Toronto` is the *correct* zone for Montreal, so the zone was
     * never wrong — the badge was labelling the zone's namesake and calling it
     * the place. The card showed "Montreal" as its subtitle and "Toronto" as
     * its badge, naming two cities in one row.
     *
     * Worth a browser test rather than only a unit one: the city is resolved on
     * the server and rendered on the client, and neither half alone would have
     * caught it.
     */
    /**
     * A Winnipeg-based trip, which is the reporter's real situation and also
     * what makes the badge appear at all: it is shown only when an event's zone
     * differs from the trip's home zone, so a Toronto-zoned event on a
     * Toronto-zoned trip would render no badge and prove nothing.
     */
    const trip = await createTrip(request, { homeTimezone: 'America/Winnipeg' });

    await page.goto(`/trips/${trip.id}/activity/new`);
    await page.getByLabel('What').selectOption('restaurant');
    await page.getByLabel('Name', { exact: true }).fill('Schwartz\u2019s');
    await page.getByLabel('Where').fill('3895 Saint-Laurent Blvd, Montr\u00e9al');
    await page.getByLabel('Timezone').selectOption('America/Toronto');
    await page.getByLabel('Starts', { exact: true }).fill('2027-03-04T18:30');
    await page.getByRole('button', { name: /^Add$/ }).click();

    await expect(page).toHaveURL(new RegExp(`/trips/${trip.id}$`));

    const card = page.locator('.event-card').filter({ hasText: 'Schwartz' });
    await expect(card).toBeVisible();

    /**
     * "Montreal time", not "Montreal": the badge carries a visually-hidden
     * qualifier so the accessibility tree says what the place *means*. Without
     * it a stay in Paris announced as "…Paris. Stay: Hotel Lutetia. 45
     * Boulevard Raspail, Paris" — the same word twice, once the clock and once
     * the address, with no way to tell them apart.
     *
     * `toHaveText` reads text content, which includes the hidden span, so this
     * asserts what is announced. The visible half is checked separately below.
     */
    await expect(card.locator('.zone')).toHaveText('Montreal time');
    await expect(card.locator('.zone')).not.toContainText('Toronto');
    // What a sighted reader sees is still just the city — the qualifier is
    // clipped, not laid out.
    expect(await card.locator('.zone').evaluate((el) => el.firstChild?.textContent)).toBe(
      'Montreal',
    );

    const row = await onlyRow('activities', trip.id);
    expect(row['start_timezone'], 'the stored zone must not have moved').toBe('America/Toronto');
    // 18:30 in Toronto on 2027-03-04 is UTC-5, before DST begins on the 14th.
    expect(row['start_at']).toBe('2027-03-04T23:30:00.000Z');
  });

  test('an activity keeps the kind it was given, and needs no end', async ({ page, request }) => {
    const trip = await createTrip(request, { homeTimezone: TRIP_ZONE });

    await page.goto(`/trips/${trip.id}`);
    await page.getByRole('button', { name: /add to trip/i }).click();
    await page.getByRole('link', { name: /^Activity/ }).click();

    /**
     * The kind is a real field, not decoration: an import that extracted
     * "restaurant" and then dropped it arrived as "Other" on the one screen the
     * import flow exists to save work on. This is the manual path to the same
     * field, so a regression in the select shows up here first.
     */
    await page.getByLabel('What').selectOption('restaurant');
    await page.getByLabel('Name', { exact: true }).fill('Clamato');
    await page.getByLabel('Where').fill('80 Rue de Charonne');
    await page.getByLabel('Timezone').selectOption('Europe/Paris');
    await page.getByLabel('Starts', { exact: true }).fill('2027-03-03T20:30');
    // Ends is deliberately left blank — plenty of activities have a start and
    // no meaningful end, and the schema allows it. If the form ever started
    // requiring it, this submit would simply never go through.

    await page.getByRole('button', { name: /^Add$/ }).click();
    await expect(page).toHaveURL(new RegExp(`/trips/${trip.id}$`));
    await expect(page.getByRole('link', { name: 'Activity: Clamato' })).toBeVisible();

    const row = await onlyRow('activities', trip.id);
    expect(row['kind']).toBe('restaurant');
    expect(row['location']).toBe('80 Rue de Charonne');
    expect(row['start_timezone']).toBe('Europe/Paris');
    expect(row['start_at']).toBe('2027-03-03T19:30:00.000Z');
    // Absent rather than defaulted to the start: an end that was never given
    // must not be invented, or every activity acquires a duration of zero and
    // the conflict rule starts comparing against it.
    expect(row['end_local']).toBeNull();
    expect(row['end_at']).toBeNull();
  });
});
