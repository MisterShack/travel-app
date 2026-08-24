import { createTrip, freshEmail, registerAndVerify, storageStateFor, test, expect } from '../fixtures/test';
import { membersOf, mintInviteToken } from '../fixtures/db';

/**
 * Invite and redeem, across two accounts (ROADMAP.md §2, PLAN-V2 §5 step 3).
 *
 * This is the journey that cannot be faked with one session. A trip is the
 * shared unit (PLAN.md §4) and an invite is the only way a second person gets
 * into one, so the spec holds two signed-in contexts at the same time rather
 * than signing one out and the other in — signing out and back in would pass
 * even if sessions leaked into each other, which is precisely what it should
 * be able to fail on.
 *
 * The token is minted against the database rather than read from a mailbox, for
 * the same reason verification's is: `auth_tokens` stores only the SHA-256, so
 * there is nothing to read back. `db.ts` sets out why that does not weaken the
 * test — redemption still goes through the real accept route, with every one of
 * its checks intact.
 */

test.use({ storageState: ({ storageStatePath }, use) => use(storageStatePath) });

test.describe('sharing a trip', () => {
  test('an owner invites, and the invited account joins', async ({
    page,
    request,
    playwright,
    browser,
  }, testInfo) => {
    const trip = await createTrip(request, { name: `Shared ${Date.now()}` });
    const guestEmail = freshEmail('guest');

    /**
     * The owner sends the invitation through the real form and the real route.
     * The token that produces is unreadable, which is the point of hashing it —
     * so this half proves sending works, and the redemption below uses a token
     * of our own. Both are live, single-use and independent; using ours leaves
     * the route's untouched rather than racing it.
     */
    await page.goto(`/trips/${trip.id}/settings`);
    await page.getByLabel(/invite someone by email/i).fill(guestEmail);
    await page.getByRole('button', { name: /send invitation/i }).click();
    // A plain string, not a RegExp: `freshEmail` contains a `+`, which inside a
    // pattern is a quantifier rather than a plus sign — so the built regex
    // matched nothing and failed as if the app had not shown the message.
    await expect(page.getByText(`Invitation sent to ${guestEmail}`)).toBeVisible();

    // The guest is a real account that has proved it controls its mailbox —
    // `acceptInvite` refuses an unverified one, so a spec that skipped this
    // would be testing the refusal path by accident.
    const guest = await registerAndVerify(request, guestEmail);
    const token = await mintInviteToken(trip.id, guestEmail);

    const guestState = await storageStateFor(
      playwright,
      testInfo.project.use.baseURL,
      guest,
      `guest-${testInfo.workerIndex}`,
    );
    const guestContext = await browser.newContext({ storageState: guestState });
    const guestPage = await guestContext.newPage();

    try {
      await guestPage.goto(`/invite?token=${token}`);

      // The landing page names the trip before anything is accepted — it has to,
      // or the guest is being asked to join something unnamed. It reveals the
      // trip and the invited address and nothing else; notably not whether that
      // address already has an account.
      await expect(
        guestPage.getByRole('heading', { name: `You have been invited to ${trip.name}` }),
      ).toBeVisible();

      await guestPage.getByRole('button', { name: `Join ${trip.name}` }).click();

      // Landing on the trip is the contract. Being left on the invite page is
      // the shape of a refusal that did not say so.
      await expect(guestPage).toHaveURL(new RegExp(`/trips/${trip.id}$`));
      await expect(guestPage.getByRole('heading', { name: trip.name })).toBeVisible();

      // And it is on their list, which is the thing they actually came for.
      await guestPage.goto('/');
      await expect(guestPage.getByText(trip.name).first()).toBeVisible();

      /**
       * Two members, and the roles are not interchangeable. At least one owner
       * is enforced in the membership module (PLAN.md §4); an invite that
       * granted `owner` would let anyone with a link delete the trip for
       * everyone, which the settings screen offers as a single button.
       */
      const members = await membersOf(trip.id);
      expect(members).toHaveLength(2);
      expect(members[1]).toEqual({ email: guestEmail.toLowerCase(), role: 'member' });
      expect(members[0]?.role).toBe('owner');

      // The owner sees them too, rather than the membership existing only in
      // the joiner's view.
      await page.goto(`/trips/${trip.id}/settings`);
      await expect(page.getByText(guestEmail)).toBeVisible();
    } finally {
      await guestContext.close();
    }
  });

  test('a forwarded invitation joins nothing', async ({ page, request }) => {
    /**
     * The security property, stated as a journey (PLAN.md §5).
     *
     * An invite is bound to the **address it was sent to**, and redemption
     * compares that against the *verified* address of whoever is redeeming. So
     * an intercepted or forwarded link is worth nothing to a different account
     * — which is what makes emailing a bare link acceptable in the first place.
     *
     * Here the signed-in owner opens an invitation addressed to someone else.
     * That is the forwarding case exactly: a live, unexpired, unused token, in
     * the hands of a real verified account that it was not issued to.
     */
    const trip = await createTrip(request, { name: `Bound ${Date.now()}` });
    const strangerEmail = freshEmail('stranger');
    const token = await mintInviteToken(trip.id, strangerEmail);

    const before = await membersOf(trip.id);
    expect(before).toHaveLength(1);

    await page.goto(`/invite?token=${token}`);
    await expect(
      page.getByRole('heading', { name: `You have been invited to ${trip.name}` }),
    ).toBeVisible();

    // The app says so before the click rather than only after it. Letting
    // someone press Join and then explaining is a worse version of the same
    // refusal.
    await expect(page.getByText(`This invitation is for ${strangerEmail}`)).toBeVisible();

    await page.getByRole('button', { name: `Join ${trip.name}` }).click();

    // Refused, and said out loud. A silent no-op would be indistinguishable
    // from a slow network.
    await expect(
      page.getByText('That invitation was sent to a different address. Sign in as that account.'),
    ).toBeVisible();

    // Still on the invite page — not smuggled onto the trip.
    await expect(page).toHaveURL(/\/invite\?token=/);

    // And the database agrees, which is the assertion that would still catch
    // this if the screen were merely rendering an error over a success.
    expect(await membersOf(trip.id)).toEqual(before);
  });
});
