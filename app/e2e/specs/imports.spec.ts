import { createTrip, test, expect } from '../fixtures/test';
import { countRows, importState, onlyRow, seedImport } from '../fixtures/db';

/**
 * Import review and apply (ROADMAP.md §2, PLAN-V2 §5 step 3).
 *
 * The rule these specs exist to hold: **a booking import is never silently
 * applied.** It lands as a proposal, a human reviews it, and the row that
 * finally reaches the timeline is written by the same validated create route a
 * typed-in event goes through (PLAN.md §4). Nothing on the review screen writes
 * anything.
 *
 * The multi-leg test is the one that earns its place. "A booking is a list, not
 * a row" is a defect this repo already shipped and fixed — the flight import
 * extracted one leg and one seat, so a return trip lost the flight home and a
 * family booking lost everyone but one seat. The regression would be invisible
 * to a single-leg test and invisible on screen until someone flew.
 */

test.use({ storageState: ({ storageStatePath }, use) => use(storageStatePath) });

test.describe('reviewing a forwarded booking', () => {
  test('a restaurant booking prefills the form, and applies only once saved', async ({
    page,
    request,
    account,
  }) => {
    const trip = await createTrip(request, { name: `Dining ${Date.now()}` });
    const importId = await seedImport(account.email, {
      subject: 'Your reservation at Clamato',
      fromAddress: 'reservations@opentable.test',
      extractedType: 'activity',
      parsedBy: 'llm',
      extractedFields: {
        kind: 'restaurant',
        name: 'Clamato',
        location: '80 Rue de Charonne, Paris',
        startLocal: '2027-03-03T20:30',
        confirmationCode: 'OT-99213',
      },
    });

    await page.goto('/imports');
    await expect(page.getByText('Your reservation at Clamato')).toBeVisible();

    // The extraction is shown under human labels, not the parser's internal
    // key names — reviewing means comparing this against the email, which is
    // hard if the reader has to decode `startLocal` first.
    await expect(page.getByText('Clamato', { exact: true })).toBeVisible();
    await expect(page.getByRole('term').filter({ hasText: 'Kind' })).toBeVisible();

    // Nothing can be filed without saying where it goes.
    await expect(page.getByText('Choose a trip to continue.')).toBeVisible();
    await page.getByLabel('Add to which trip').selectOption({ label: trip.name });
    await page.getByRole('button', { name: 'Review and add' }).click();

    // Handed to the ordinary create form, not written behind the reviewer's back.
    await expect(page).toHaveURL(new RegExp(`/trips/${trip.id}/activity/new$`));

    /**
     * The prefill, field by field.
     *
     * `kind` is here deliberately: the model reports whether an activity is a
     * restaurant, an attraction or transport, and the form once extracted it and
     * threw it away — a forwarded OpenTable booking arrived as "Other" on the
     * one screen the import flow exists to save work on.
     */
    await expect(page.getByLabel('What')).toHaveValue('restaurant');
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Clamato');
    await expect(page.getByLabel('Where')).toHaveValue('80 Rue de Charonne, Paris');
    await expect(page.getByLabel('Starts', { exact: true })).toHaveValue('2027-03-03T20:30');
    await expect(page.getByLabel('Confirmation code')).toHaveValue('OT-99213');

    /**
     * A draft carries no timezone — the extraction reports a wall-clock time and
     * nothing that reliably names a zone — so the form keeps the trip's. That is
     * the correct default and it is worth pinning: falling back to the browser's
     * here would reintroduce the six-hours-wrong bug through the import door
     * after it was closed on the manual one.
     */
    await expect(page.getByLabel('Timezone')).toHaveValue(trip.homeTimezone);

    // Still a proposal at this point. Nothing has been written and the import
    // has not been filed.
    expect(await countRows('activities', trip.id)).toBe(0);
    expect((await importState(importId)).status).toBe('needs_review');

    await page.getByRole('button', { name: /^Add$/ }).click();
    await expect(page).toHaveURL(new RegExp(`/trips/${trip.id}$`));
    await expect(page.getByRole('link', { name: 'Activity: Clamato' })).toBeVisible();

    // *Now* it is applied — after a human saved a real row from it.
    const row = await onlyRow('activities', trip.id);
    expect(row['kind']).toBe('restaurant');
    expect(row['confirmation_code']).toBe('OT-99213');
    /**
     * `source` is deliberately *not* asserted here. The column and the
     * `TimelineItem` field both offer `'manual' | 'import'`, but the create
     * helpers hardcode `'manual'` and nothing anywhere reads the value — so an
     * applied import is indistinguishable from a typed-in row, and asserting
     * either value would pin a distinction the app does not actually make.
     * Recorded rather than papered over.
     */
    expect((await importState(importId)).status).toBe('applied');

    // And it has left the queue, which is the same predicate the tab badge uses.
    await page.goto('/imports');
    await expect(page.getByText('Your reservation at Clamato')).toBeHidden();
    await expect(page.getByText('Nothing waiting to be reviewed.')).toBeVisible();
  });

  test('a return trip stays in the queue until both legs are added', async ({
    page,
    request,
    account,
  }) => {
    const trip = await createTrip(request, {
      name: `Return ${Date.now()}`,
      homeTimezone: 'America/Winnipeg',
      startDate: '2027-03-01',
      endDate: '2027-03-08',
    });

    /**
     * One email, two flights, two passengers — the shape that used to lose the
     * flight home and everyone but one seat.
     */
    const importId = await seedImport(account.email, {
      subject: 'Air Canada booking ABC123 — Winnipeg to Ottawa',
      fromAddress: 'noreply@aircanada.test',
      extractedType: 'segment',
      extractedFields: {
        confirmationCode: 'ABC123',
        passengers: [
          { name: 'David Shack', seat: '14C' },
          { name: 'Sam Shack', seat: '14D' },
        ],
        segments: [
          {
            mode: 'air',
            carrier: 'Air Canada',
            service: 'AC265',
            origin: 'YWG',
            departureLocal: '2027-03-02T07:15',
            destination: 'YOW',
            arrivalLocal: '2027-03-02T10:35',
          },
          {
            mode: 'air',
            carrier: 'Air Canada',
            service: 'AC266',
            origin: 'YOW',
            departureLocal: '2027-03-06T18:00',
            destination: 'YWG',
            arrivalLocal: '2027-03-06T20:20',
          },
        ],
      },
    });

    await page.goto('/imports');
    await page.getByLabel('Add to which trip').selectOption({ label: trip.name });

    // Both legs are offered separately, each labelled well enough to tell an
    // outbound from a return without opening it.
    const legs = page.getByRole('listitem').filter({ hasText: 'AC26' });
    await expect(legs).toHaveCount(2);
    await expect(legs.first()).toContainText('AC265 YWG → YOW');
    await expect(legs.last()).toContainText('AC266 YOW → YWG');

    /* ---------------------------------------------- the outbound ---------- */
    await legs.first().getByRole('button', { name: 'Review and add' }).click();
    await expect(page).toHaveURL(new RegExp(`/trips/${trip.id}/segment/new$`));

    await expect(page.getByLabel('Airline', { exact: true })).toHaveValue('Air Canada');
    await expect(page.getByLabel('Flight number', { exact: true })).toHaveValue('AC265');
    await expect(page.getByLabel('From', { exact: true })).toHaveValue('YWG');
    await expect(page.getByLabel('To', { exact: true })).toHaveValue('YOW');

    /**
     * Both passengers, both seats. The booking-level people are flattened onto
     * each leg — everyone on the booking is on every flight of it, and the
     * alternative was a family arriving with one seat between them.
     */
    const names = page.getByLabel('Name', { exact: true });
    await expect(names).toHaveCount(2);
    await expect(names.nth(0)).toHaveValue('David Shack');
    await expect(names.nth(1)).toHaveValue('Sam Shack');

    const seats = page.getByLabel('Seat', { exact: true });
    await expect(seats.nth(0)).toHaveValue('14C');
    await expect(seats.nth(1)).toHaveValue('14D');

    await page.getByRole('button', { name: /^Add$/ }).click();
    await expect(page).toHaveURL(new RegExp(`/trips/${trip.id}$`));

    /**
     * One leg down, and the import is **still in the queue**. Filing the email
     * after the outbound is exactly what would take the return with it.
     */
    const afterFirst = await importState(importId);
    expect(afterFirst.status).toBe('needs_review');
    expect(afterFirst.applied).toEqual([0]);
    expect(await countRows('segments', trip.id)).toBe(1);

    /* ---------------------------------------------- the return ------------ */
    await page.goto('/imports');
    await page.getByLabel('Add to which trip').selectOption({ label: trip.name });

    const remaining = page.getByRole('listitem').filter({ hasText: 'AC26' });
    // The one already added says so rather than offering itself again, which is
    // how a reviewer knows what is left without remembering.
    await expect(remaining.first()).toContainText('Added');
    await remaining.last().getByRole('button', { name: 'Review and add' }).click();

    await expect(page.getByLabel('Flight number', { exact: true })).toHaveValue('AC266');
    await page.getByRole('button', { name: /^Add$/ }).click();
    await expect(page).toHaveURL(new RegExp(`/trips/${trip.id}$`));

    // Both legs on the trip, and only now is the email filed.
    expect(await countRows('segments', trip.id)).toBe(2);
    const afterBoth = await importState(importId);
    expect(afterBoth.status).toBe('applied');
    expect(afterBoth.applied.sort()).toEqual([0, 1]);

    await expect(page.getByRole('link', { name: 'Journey: Air Canada AC265' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Journey: Air Canada AC266' })).toBeVisible();

    /**
     * A timezone is not a place. `YOW` is `America/Toronto`, and labelling the
     * arrival "Toronto" is a real defect this repo shipped — reported from a
     * WestJet import where the extraction was right and only the label was
     * wrong. The timeline names the airport's own city.
     */
    await expect(page.getByText('Ottawa').first()).toBeVisible();
    await expect(page.getByText('Toronto')).toHaveCount(0);
  });

  test('a discarded import writes nothing and leaves the queue', async ({
    page,
    request,
    account,
  }) => {
    const trip = await createTrip(request, { name: `Discard ${Date.now()}` });
    const importId = await seedImport(account.email, {
      subject: 'Hotel booking you did not make',
      extractedType: 'lodging',
      extractedFields: {
        name: 'Somewhere Else Entirely',
        checkInLocal: '2027-03-02T15:00',
        checkOutLocal: '2027-03-05T11:00',
      },
    });

    await page.goto('/imports');
    await expect(page.getByText('Hotel booking you did not make')).toBeVisible();

    await page.getByRole('button', { name: 'Discard' }).click();

    await expect(page.getByText('Hotel booking you did not make')).toBeHidden();
    expect((await importState(importId)).status).toBe('rejected');
    // Discarding is not deleting, and it is certainly not applying.
    expect(await countRows('lodging', trip.id)).toBe(0);
  });
});
