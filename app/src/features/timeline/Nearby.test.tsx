import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthContext, type AuthState } from '@/auth/context';
import { Nearby } from './Nearby';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const auth = (offline = false): AuthState => ({
  user: {
    id: 'u1',
    email: 'a@example.com',
    emailVerifiedAt: '2026-08-01T00:00:00.000Z',
    preferences: { timeFormat: 'auto' as const, theme: 'system' as const },
  },
  status: 'ready',
  offline,
  signIn: async () => {},
  signOut: async () => {},
  updatePreferences: async () => {},
  refresh: async () => {},
});

function draw(props: Partial<Parameters<typeof Nearby>[0]> = {}, offline = false) {
  return render(
    <AuthContext.Provider value={auth(offline)}>
      <Nearby
        kind="activity"
        id="a1"
        stored="9 Carrefour de l'Odeon, Paris"
        edited={false}
        {...props}
      />
    </AuthContext.Provider>,
  );
}

/** A successful reply from the nearby route. */
function answering(
  text: string,
  places: { title: string; uri: string }[],
  remaining = 24,
) {
  // Parameters declared so `mock.calls[n]` is a typed tuple rather than `[]` —
  // without them every read of a recorded argument is a compile error.
  return vi.fn(async (_url: unknown, _init?: RequestInit) =>
    Response.json({
      answer: { intent: 'eat', text, places, generated: true },
      remaining,
    }),
  );
}

describe('what is nearby', () => {
  it('asks nothing until a chip is tapped', async () => {
    // Pulled, never pushed: nothing here may run on mount (PLAN-V3 §3).
    const fetchMock = answering('...', [{ title: 'x', uri: 'https://maps.google.com/?cid=1' }]);
    vi.stubGlobal('fetch', fetchMock);

    draw();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Eat nearby' })).toBeInTheDocument();
  });

  it('shows the answer and the places it cited', async () => {
    vi.stubGlobal(
      'fetch',
      answering('Two good options are a short walk away.', [
        { title: 'Chez Julien', uri: 'https://maps.google.com/?cid=1' },
        { title: 'Le Petit Zinc', uri: 'https://maps.google.com/?cid=2' },
      ]),
    );

    draw();
    await userEvent.click(screen.getByRole('button', { name: 'Eat nearby' }));

    await screen.findByText('Two good options are a short walk away.');
    const first = screen.getByRole('link', { name: 'Chez Julien' });
    expect(first).toHaveAttribute('href', 'https://maps.google.com/?cid=1');
    expect(screen.getByRole('link', { name: 'Le Petit Zinc' })).toBeInTheDocument();
  });

  it('puts the citations immediately after the prose they support', async () => {
    // Not a nicety: Grounding with Google Maps requires the sources follow the
    // content they support and be reachable in one interaction. A disclosure,
    // a tooltip or a footer would each break that.
    vi.stubGlobal(
      'fetch',
      answering('Chez Julien is close.', [
        { title: 'Chez Julien', uri: 'https://maps.google.com/?cid=1' },
      ]),
    );

    draw();
    await userEvent.click(screen.getByRole('button', { name: 'Eat nearby' }));

    const prose = await screen.findByText('Chez Julien is close.');
    const link = screen.getByRole('link', { name: 'Chez Julien' });

    /*
     * The prose is the last thing in the live region and the citation list is
     * that region's next sibling, so the two are still adjacent on screen and
     * in reading order. The list sits outside the region only so that
     * `role="status"` does not re-recite every place name, the attribution and
     * the quota line on every answer — nothing is hidden or moved away.
     */
    const live = screen.getByRole('status');
    expect(live.contains(prose)).toBe(true);
    expect(prose).toBe(live.lastElementChild);
    expect(live.nextElementSibling?.contains(link)).toBe(true);
  });

  it('attributes Google Maps without letting the name break across lines', async () => {
    vi.stubGlobal(
      'fetch',
      answering('Somewhere close.', [{ title: 'x', uri: 'https://maps.google.com/?cid=1' }]),
    );

    draw();
    await userEvent.click(screen.getByRole('button', { name: 'Coffee' }));

    // Exact wording, unlocalised and uncapitalised differently — a term of use.
    const name = await screen.findByText('Google Maps');
    expect(name).toHaveClass('nowrap');
  });

  it('says a model wrote it', async () => {
    // The import queue's precedent: if a model produced it, the screen says so.
    vi.stubGlobal(
      'fetch',
      answering('Somewhere close.', [{ title: 'x', uri: 'https://maps.google.com/?cid=1' }]),
    );

    draw();
    await userEvent.click(screen.getByRole('button', { name: 'Eat nearby' }));

    expect(await screen.findByText(/written by AI/i)).toBeInTheDocument();
  });

  it('sends the intent belonging to the chip that was pressed', async () => {
    const fetchMock = answering('The nearest metro is Odeon.', [
      { title: 'Odeon', uri: 'https://maps.google.com/?cid=3' },
    ]);
    vi.stubGlobal('fetch', fetchMock);

    draw();
    await userEvent.click(screen.getByRole('button', { name: 'Getting around' }));

    await screen.findByText('The nearest metro is Odeon.');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/api/activities/a1/nearby');
    expect(JSON.parse(String(init?.body))).toEqual({ intent: 'transit' });
  });

  it('uses the lodging path for a stay', async () => {
    const fetchMock = answering('A pharmacy is two streets away.', [
      { title: 'Pharmacie', uri: 'https://maps.google.com/?cid=4' },
    ]);
    vi.stubGlobal('fetch', fetchMock);

    draw({ kind: 'lodging', id: 'l1' });
    await userEvent.click(screen.getByRole('button', { name: 'Essentials' }));

    await screen.findByText('A pharmacy is two streets away.');
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/api/lodging/l1/nearby');
  });

  it('names the question the answer belongs to, in text', async () => {
    /*
     * Not `aria-pressed`. It promises a toggle these are not — nothing un-asks
     * a question, so activating a "pressed" chip spends another of the day's
     * allowance instead of switching it off. A heading states which question
     * was answered, which also serves the low-vision case that the amber tint
     * alone was failing.
     */
    vi.stubGlobal(
      'fetch',
      answering('Somewhere close.', [{ title: 'x', uri: 'https://maps.google.com/?cid=1' }]),
    );

    draw();
    const chip = screen.getByRole('button', { name: 'Eat nearby' });
    expect(chip).not.toHaveAttribute('aria-pressed');

    await userEvent.click(chip);

    expect(await screen.findByRole('heading', { name: 'Eat nearby' })).toBeInTheDocument();
    // And the chip is marked for sighted users by something other than hue.
    await waitFor(() => expect(chip).toHaveClass('is-current'));
  });

  it('keeps the pressed chip focusable while the answer is in flight', async () => {
    /*
     * A browser run found this: disabling the focused chip while loading drops
     * focus to the document body, so a keyboard user is thrown to the top of
     * the page. The jsdom assertion on focus below passed even when it was
     * broken, which is why this asserts the *cause* rather than the symptom.
     */
    let release: (() => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return Response.json({
          answer: { intent: 'eat', text: 'Somewhere close.', places: [{ title: 'x', uri: 'https://maps.google.com/?cid=1' }], generated: true },
          remaining: 24,
        });
      }),
    );

    draw();
    const chip = screen.getByRole('button', { name: 'Eat nearby' });
    await userEvent.click(chip);

    await screen.findByText(/looking/i);
    expect(chip).not.toBeDisabled();

    release?.();
    await screen.findByText('Somewhere close.');
  });

  it('ignores an answer that a newer question has already superseded', async () => {
    // Two chips can be pressed in quick succession now that neither disables.
    // A slow first reply must not overwrite the second one's answer.
    const replies: ((value: Response) => void)[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            replies.push(resolve);
          }),
      ),
    );

    draw();
    await userEvent.click(screen.getByRole('button', { name: 'Eat nearby' }));
    await userEvent.click(screen.getByRole('button', { name: 'Coffee' }));

    const body = (text: string) =>
      Response.json({
        answer: { intent: 'eat', text, places: [{ title: 'x', uri: 'https://maps.google.com/?cid=1' }], generated: true },
        remaining: 24,
      });

    // The second question answers first, then the first one straggles in.
    replies[1]?.(body('Coffee is next door.'));
    await screen.findByText('Coffee is next door.');
    replies[0]?.(body('Dinner is five minutes away.'));

    await waitFor(() =>
      expect(screen.queryByText('Dinner is five minutes away.')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('Coffee is next door.')).toBeInTheDocument();
  });

  it('announces the answer without stealing focus', async () => {
    vi.stubGlobal(
      'fetch',
      answering('Somewhere close.', [{ title: 'x', uri: 'https://maps.google.com/?cid=1' }]),
    );

    draw();
    const chip = screen.getByRole('button', { name: 'Eat nearby' });
    await userEvent.click(chip);

    // The result arrives with no navigation, so nothing else would tell a
    // screen reader it had — and focus must stay where the user put it.
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Somewhere close.');
    expect(document.activeElement).toBe(chip);
  });
});

describe('what it refuses to ask', () => {
  it('will not ask while offline, and says why', async () => {
    const fetchMock = answering('...', [{ title: 'x', uri: 'https://maps.google.com/?cid=1' }]);
    vi.stubGlobal('fetch', fetchMock);

    draw({}, true);

    const chip = screen.getByRole('button', { name: 'Eat nearby' });
    // `aria-disabled`, not `disabled`: the chip stays in the tab order so a
    // keyboard user can reach it and hear why, which an unfocusable element
    // cannot do. Pressing it anyway must still ask nothing.
    expect(chip).toHaveAttribute('aria-disabled', 'true');
    expect(chip).not.toBeDisabled();
    expect(chip).toHaveAccessibleDescription(/needs a connection/i);
    await userEvent.click(chip);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('will not answer about an address that has been edited but not saved', async () => {
    // The server asks about the stored row, so answering here would describe
    // somewhere the screen is no longer showing — convincingly, and wrongly.
    const fetchMock = answering('...', [{ title: 'x', uri: 'https://maps.google.com/?cid=1' }]);
    vi.stubGlobal('fetch', fetchMock);

    draw({ edited: true });

    const chip = screen.getByRole('button', { name: 'Eat nearby' });
    expect(chip).toHaveAttribute('aria-disabled', 'true');
    expect(chip).toHaveAccessibleDescription(/save the address first/i);
    await userEvent.click(chip);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes the server's own refusal through rather than inventing one", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { error: 'daily_cap', message: 'That is 25 questions today. Try again tomorrow.' },
          { status: 429 },
        ),
      ),
    );

    draw();
    await userEvent.click(screen.getByRole('button', { name: 'Eat nearby' }));

    expect(
      await screen.findByText('That is 25 questions today. Try again tomorrow.'),
    ).toBeInTheDocument();
  });

  it('survives losing the network mid-question', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    draw();
    await userEvent.click(screen.getByRole('button', { name: 'Eat nearby' }));

    expect(await screen.findByText(/no connection/i)).toBeInTheDocument();
  });
});

describe('the remaining count', () => {
  it('stays quiet while there is plenty left', async () => {
    vi.stubGlobal(
      'fetch',
      answering('Somewhere close.', [{ title: 'x', uri: 'https://maps.google.com/?cid=1' }], 24),
    );

    draw();
    await userEvent.click(screen.getByRole('button', { name: 'Eat nearby' }));

    await screen.findByText('Somewhere close.');
    expect(screen.queryByText(/question.? today/i)).not.toBeInTheDocument();
  });

  it('speaks up once it is nearly gone', async () => {
    // Helpful when asked, quiet otherwise — the value question settled
    // 2026-08-25. A count is noise at 24 and worth having at 2.
    vi.stubGlobal(
      'fetch',
      answering('Somewhere close.', [{ title: 'x', uri: 'https://maps.google.com/?cid=1' }], 2),
    );

    draw();
    await userEvent.click(screen.getByRole('button', { name: 'Eat nearby' }));

    expect(await screen.findByText('2 more questions today.')).toBeInTheDocument();
  });

  it('says it plainly when the last one is gone', async () => {
    vi.stubGlobal(
      'fetch',
      answering('Somewhere close.', [{ title: 'x', uri: 'https://maps.google.com/?cid=1' }], 0),
    );

    draw();
    await userEvent.click(screen.getByRole('button', { name: 'Eat nearby' }));

    expect(await screen.findByText('That is the last question for today.')).toBeInTheDocument();
  });
});
