import { createTrip, test, expect } from '../fixtures/test';

/**
 * The add sheet's open and close animations.
 *
 * Worth a browser test because the interesting half is invisible to jsdom and
 * to a screenshot alike: an *exit* animation only exists if the element is
 * still mounted while it plays, and the whole failure mode is that React
 * removes it first. A test that only checked "the sheet is gone" would pass
 * against the sharp, unanimated version this fixes.
 */

test.use({ storageState: ({ storageStatePath }, use) => use(storageStatePath) });

test.describe('the add sheet', () => {
  test('stays mounted long enough to animate out, then goes', async ({ page, request }) => {
    const trip = await createTrip(request);
    await page.goto(`/trips/${trip.id}`);

    const backdrop = page.locator('.sheet-backdrop');
    await page.getByRole('button', { name: /add to trip/i }).click();
    await expect(backdrop).toBeVisible();
    // Not closing on the way in — the class is what drives the exit, and it
    // must not be present while the sheet is simply open.
    await expect(backdrop).not.toHaveClass(/closing/);

    // Click the backdrop itself rather than an option: choosing an option
    // navigates, and navigation should not wait for an animation.
    await backdrop.click({ position: { x: 5, y: 5 } });

    /**
     * The assertion this spec exists for. Before the fix the node was gone by
     * now, so this class could never appear — and the sheet vanished between
     * two frames while the backdrop had faded in over 160ms.
     */
    await expect(backdrop).toHaveClass(/closing/);

    // And it does finish. A sheet that animates out but never unmounts is a
    // worse bug than the one being fixed, because it leaves an invisible
    // modal layer over the page.
    await expect(backdrop).toHaveCount(0);
    await expect(page.getByRole('button', { name: /add to trip/i })).toBeVisible();
  });

  test('closes immediately when the user asked for less motion', async ({ page, request }) => {
    /**
     * The trap this guards against. `prefers-reduced-motion` sets
     * `animation: none`, so `animationend` never fires — and the close is
     * gated on that event. Gating on it alone would make the sheet impossible
     * to dismiss for exactly the people who asked for less movement, turning
     * an accessibility preference into a lock-in.
     *
     * `Sheet` reads the preference in JavaScript and skips the animation path
     * entirely. This proves it, in a real browser, with the media feature
     * actually emulated.
     */
    await page.emulateMedia({ reducedMotion: 'reduce' });

    const trip = await createTrip(request);
    await page.goto(`/trips/${trip.id}`);

    const backdrop = page.locator('.sheet-backdrop');
    await page.getByRole('button', { name: /add to trip/i }).click();
    await expect(backdrop).toBeVisible();

    await backdrop.click({ position: { x: 5, y: 5 } });

    // Gone, without ever entering the closing state — there is no animation to
    // wait for and nothing to wait on.
    await expect(backdrop).toHaveCount(0);
  });

  test('Escape closes it, and focus returns to the button that opened it', async ({
    page,
    request,
  }) => {
    // Escape goes through the same close path as the backdrop, so it has to
    // survive the animation change too. Focus restoration is the part a
    // keyboard user notices immediately if it breaks.
    const trip = await createTrip(request);
    await page.goto(`/trips/${trip.id}`);

    const opener = page.getByRole('button', { name: /add to trip/i });
    await opener.click();
    await expect(page.locator('.sheet-backdrop')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('.sheet-backdrop')).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test('choosing an option navigates without waiting for an animation', async ({
    page,
    request,
  }) => {
    // The one path that should still be instant: the user has decided, and
    // holding the navigation back to play an exit would be latency dressed up
    // as polish.
    const trip = await createTrip(request);
    await page.goto(`/trips/${trip.id}`);

    await page.getByRole('button', { name: /add to trip/i }).click();
    await page.getByRole('link', { name: /^Stay/ }).click();

    await expect(page).toHaveURL(new RegExp(`/trips/${trip.id}/lodging/new$`));
    await expect(page.locator('.sheet-backdrop')).toHaveCount(0);
  });
});
