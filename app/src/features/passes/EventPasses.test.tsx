import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MAX_PASS_BYTES, type Pass } from '@travel/shared';
import { ApiError } from '@/api/client';
import { AuthContext, type AuthState } from '@/auth/context';
import { deletePass, fetchPassBytes, loadTripPasses, uploadPass } from '@/data/passes';
import { EventPasses } from './EventPasses';

/*
 * The data layer is mocked rather than `fetch`, because it is the layer that
 * owns the offline cache: a test that stubbed `fetch` would be asserting
 * against a repository this component is not allowed to reach around anyway.
 */
vi.mock('@/data/passes', () => ({
  loadTripPasses: vi.fn(),
  uploadPass: vi.fn(),
  deletePass: vi.fn(),
  fetchPassBytes: vi.fn(),
}));

const listing = vi.mocked(loadTripPasses);
const upload = vi.mocked(uploadPass);
const remove = vi.mocked(deletePass);
const bytes = vi.mocked(fetchPassBytes);

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

/** A stored pass, with only the fields a caller cares about spelled out. */
function pass(over: Partial<Pass> = {}): Pass {
  return {
    id: 'pas_1',
    tripId: 't1',
    relatedType: 'segment',
    relatedId: 'e1',
    filename: 'boarding.pdf',
    contentType: 'application/pdf',
    byteSize: 1024,
    label: 'Lisbon boarding pass',
    source: 'upload',
    createdAt: '2026-08-20T10:00:00.000Z',
    ...over,
  };
}

/** The first bytes of a real PDF, so the client-side sniff accepts it. */
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
/** A zip signature — which is all an Apple Wallet pass looks like from here. */
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);

function draw(offline = false) {
  return render(
    <AuthContext.Provider value={auth(offline)}>
      <EventPasses tripId="t1" relatedType="segment" relatedId="e1" />
    </AuthContext.Provider>,
  );
}

/**
 * The panel's live region.
 *
 * Found by `aria-live` rather than by `role="status"`, which is what it is: the
 * event screen already has one status region — "what's nearby" — and a second
 * would be two atomic containers competing to re-recite themselves.
 */
function announced(): HTMLElement {
  const region = document.querySelector<HTMLElement>('[aria-live="polite"]');
  if (region === null) throw new Error('the passes panel has no live region');
  return region;
}

beforeEach(() => {
  listing.mockResolvedValue({ data: [], stale: false });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('listing the passes on an event', () => {
  it('shows the ones bound to this event and nothing else', async () => {
    // A trip's whole list is what the offline cache holds, so the filtering is
    // this component's job — and getting it wrong would put another event's
    // boarding pass on this one, which is worse than showing none.
    listing.mockResolvedValue({
      data: [
        pass({ id: 'pas_1', label: 'Lisbon boarding pass' }),
        pass({ id: 'pas_2', label: 'Porto boarding pass', relatedId: 'e2' }),
        pass({ id: 'pas_3', label: 'Loose ticket', relatedType: null, relatedId: null }),
      ],
      stale: false,
    });

    draw();

    expect(await screen.findByText('Lisbon boarding pass')).toBeInTheDocument();
    expect(screen.queryByText('Porto boarding pass')).not.toBeInTheDocument();
    expect(screen.queryByText('Loose ticket')).not.toBeInTheDocument();
    expect(listing).toHaveBeenCalledWith('t1', 'u1');
  });

  it('says so plainly when there are none', async () => {
    draw();
    expect(await screen.findByText('No passes yet.')).toBeInTheDocument();
  });

  it('mounts the live region before it has anything to say', async () => {
    /*
     * The trap Phase 10 shipped: a region that first appears in the same commit
     * as its message is not announced at all, and it works from the second
     * message on — so it looks fine to anyone who tests by doing the thing
     * twice. It is here from first render, empty, and never hidden.
     */
    draw();
    expect(announced()).toHaveTextContent('');
    expect(announced()).not.toHaveAttribute('aria-busy', 'true');
    await screen.findByText('No passes yet.');
    expect(announced()).toHaveTextContent('');
  });

  it('names every control for the row it belongs to', async () => {
    /*
     * Three buttons all called "Remove" is a failure: a screen reader listing
     * the controls on this screen would offer no way to tell which pass each
     * one throws away. The visible word is kept inside the name (WCAG 2.5.3),
     * and it is an `aria-label` rather than a hidden suffix because name
     * computation collapses the leading space — "RemoveLisbon boarding pass".
     */
    listing.mockResolvedValue({
      data: [
        pass({ id: 'pas_1', label: 'Lisbon boarding pass' }),
        pass({ id: 'pas_2', label: 'Return leg' }),
      ],
      stale: false,
    });

    draw();

    expect(await screen.findByRole('button', { name: 'Open Lisbon boarding pass' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Return leg' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Lisbon boarding pass' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Return leg' })).toBeInTheDocument();

    // And no two controls on the panel share a name.
    const names = screen
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label') ?? b.textContent);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('adding a pass', () => {
  it('uploads the chosen file and puts it at the top of the list', async () => {
    const file = new File([PDF], 'boarding.pdf', { type: 'application/pdf' });
    upload.mockResolvedValue(pass({ id: 'pas_new', label: 'Madrid boarding pass' }));

    draw();
    await screen.findByText('No passes yet.');
    await userEvent.upload(screen.getByLabelText('Add a pass'), file);

    await waitFor(() =>
      expect(upload).toHaveBeenCalledWith('t1', file, { relatedType: 'segment', relatedId: 'e1' }),
    );
    expect(await screen.findByText('Madrid boarding pass')).toBeInTheDocument();
    // Announced, not just drawn: nothing navigates, so the live region is the
    // only thing that tells a screen reader the upload finished.
    await waitFor(() => expect(announced()).toHaveTextContent('Added Madrid boarding pass.'));
  });

  it('refuses a file over the ceiling without asking the server', async () => {
    // Courtesy, not security — the server measures what actually arrives. But
    // spending a two-megabyte upload on hotel wifi to be told no is a real wait.
    const huge = new File([new Uint8Array(MAX_PASS_BYTES + 1)], 'huge.pdf', {
      type: 'application/pdf',
    });

    draw();
    await screen.findByText('No passes yet.');
    await userEvent.upload(screen.getByLabelText('Add a pass'), huge);

    expect(await screen.findByText(/too big/i)).toBeInTheDocument();
    expect(upload).not.toHaveBeenCalled();
  });

  it('reads the first bytes rather than believing the file name', async () => {
    // A `.pdf` that is not a PDF. The name and the browser's content type are
    // both the uploader's word for it; the signature is not.
    const liar = new File([new Uint8Array([1, 2, 3, 4, 5, 6])], 'ticket.pdf', {
      type: 'application/pdf',
    });

    draw();
    await screen.findByText('No passes yet.');
    await userEvent.upload(screen.getByLabelText('Add a pass'), liar);

    expect(await screen.findByText(/has to be a PDF, a photo, or an Apple Wallet pass/i)).toBeInTheDocument();
    expect(upload).not.toHaveBeenCalled();
  });

  it("shows the server's refusal in the server's own words", async () => {
    /*
     * A zip is the one case the client genuinely cannot decide: a `.pkpass` and
     * a `.docx` share a signature, and only the server reads far enough into the
     * archive to find `pass.json`. So this file passes every check here and is
     * refused there — which is the path that proves the 415 message reaches the
     * reader rather than a generic apology.
     */
    const zip = new File([ZIP], 'ticket.pkpass', { type: 'application/vnd.apple.pkpass' });
    upload.mockRejectedValue(
      new ApiError(
        415,
        'unsupported_type',
        'That looks like a zip file rather than an Apple Wallet pass.',
      ),
    );

    draw();
    await screen.findByText('No passes yet.');
    await userEvent.upload(screen.getByLabelText('Add a pass'), zip);

    expect(
      await screen.findByText('That looks like a zip file rather than an Apple Wallet pass.'),
    ).toBeInTheDocument();
  });
});

describe('removing a pass', () => {
  it('asks before it deletes anything', async () => {
    // Inline, never `window.confirm`: that dialog blocks the page and reads as
    // the browser breaking through an installed app.
    listing.mockResolvedValue({ data: [pass({ label: 'Lisbon boarding pass' })], stale: false });
    remove.mockResolvedValue(undefined);

    draw();
    await userEvent.click(await screen.findByRole('button', { name: 'Remove Lisbon boarding pass' }));

    expect(remove).not.toHaveBeenCalled();
    const confirm = screen.getByRole('button', { name: 'Remove Lisbon boarding pass' });
    // The question is what focus lands on, so it is read rather than merely
    // shown to whoever can see the row change.
    expect(confirm).toHaveAccessibleDescription('Remove this pass?');
    expect(confirm).toHaveFocus();

    await userEvent.click(confirm);

    await waitFor(() => expect(remove).toHaveBeenCalledWith('pas_1'));
    await waitFor(() => expect(screen.queryByText('Lisbon boarding pass')).not.toBeInTheDocument());
    await waitFor(() => expect(announced()).toHaveTextContent('Removed Lisbon boarding pass.'));
  });

  it('keeps the pass, and the focus, when the question is dismissed', async () => {
    listing.mockResolvedValue({ data: [pass({ label: 'Lisbon boarding pass' })], stale: false });

    draw();
    await userEvent.click(await screen.findByRole('button', { name: 'Remove Lisbon boarding pass' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel removing Lisbon boarding pass' }));

    expect(remove).not.toHaveBeenCalled();
    expect(screen.getByText('Lisbon boarding pass')).toBeInTheDocument();
    // Cancelling replaces the button that held focus, so without putting it
    // back the next Tab would restart from the top of the page.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Remove Lisbon boarding pass' })).toHaveFocus(),
    );
  });
});

describe('opening a pass', () => {
  const created: string[] = [];
  const revoked: string[] = [];
  /** Every anchor the component activated, as `[href, download]`. */
  const clicked: [string, string][] = [];
  const realCreate = URL.createObjectURL;
  const realRevoke = URL.revokeObjectURL;
  const realClick = HTMLAnchorElement.prototype.click;

  beforeEach(() => {
    created.length = 0;
    revoked.length = 0;
    clicked.length = 0;
    /* Recorded rather than performed: jsdom has no navigation, so a real
       activation only prints "Not implemented" and proves nothing. */
    HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
      clicked.push([this.getAttribute('href') ?? '', this.download]);
    };
    URL.createObjectURL = vi.fn((): string => {
      const url = `blob:pass-${created.length}`;
      created.push(url);
      return url;
    });
    URL.revokeObjectURL = vi.fn((url: string) => {
      revoked.push(url);
    });
  });

  afterEach(() => {
    URL.createObjectURL = realCreate;
    URL.revokeObjectURL = realRevoke;
    HTMLAnchorElement.prototype.click = realClick;
  });

  it('hands the bytes to the device and does not leak the URL', async () => {
    // A blob URL holds the whole file in memory until it is revoked, and a pass
    // is megabytes. It outlives the click on purpose — revoking on the next
    // line cancels the download — but it must not outlive the screen.
    listing.mockResolvedValue({ data: [pass({ label: 'Lisbon boarding pass' })], stale: false });
    bytes.mockResolvedValue({ blob: new Blob([PDF], { type: 'application/pdf' }), stale: false });

    const { unmount } = draw();
    await userEvent.click(await screen.findByRole('button', { name: 'Open Lisbon boarding pass' }));

    await waitFor(() => expect(bytes).toHaveBeenCalledWith('pas_1', 'u1'));
    await waitFor(() => expect(created).toHaveLength(1));
    // A download link, not `window.open`: by the time the bytes are here the
    // click is no longer a fresh gesture and a popup blocker would take the
    // window — on the phone, at the gate, which is the whole point of this.
    expect(clicked).toEqual([[created[0], 'boarding.pdf']]);

    unmount();
    expect(revoked).toEqual(created);
  });

  it('says when what it opened came off this device', async () => {
    // The case the whole feature exists for: airside, radio off. Saying so is
    // the difference between a stale pass and a mystery.
    listing.mockResolvedValue({ data: [pass({ label: 'Lisbon boarding pass' })], stale: false });
    bytes.mockResolvedValue({ blob: new Blob([PDF], { type: 'application/pdf' }), stale: true });

    draw();
    await userEvent.click(await screen.findByRole('button', { name: 'Open Lisbon boarding pass' }));

    await waitFor(() => expect(announced()).toHaveTextContent(/saved on this device/i));
  });
});
