import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthContext, type AuthState } from '@/auth/context';
import type { PassWithTrip } from '@/data/passes';
import { deletePass, fetchPassBytes, loadAllPasses } from '@/data/passes';
import { PassesPage } from './PassesPage';
import { fileKind, formatSize, groupByTrip, passName } from './format';

/**
 * The data layer is mocked whole. This screen's job is grouping, naming and the
 * object-URL hand-off; `data/passes.ts` has its own tests for the read-through
 * cache, and driving IndexedDB from here would test that twice and this once.
 */
vi.mock('@/data/passes', () => ({
  loadAllPasses: vi.fn(),
  fetchPassBytes: vi.fn(),
  deletePass: vi.fn(),
}));

const auth: AuthState = {
  user: {
    id: 'u1',
    email: 'a@example.com',
    emailVerifiedAt: '2026-08-01T00:00:00.000Z',
    preferences: { timeFormat: 'auto' as const, theme: 'system' as const },
  },
  status: 'ready',
  offline: false,
  signIn: async () => {},
  signOut: async () => {},
  updatePreferences: async () => {},
  refresh: async () => {},
};

function pass(over: Partial<PassWithTrip> = {}): PassWithTrip {
  return {
    id: 'p1',
    tripId: 't1',
    tripName: 'Lisbon in spring',
    relatedType: null,
    relatedId: null,
    filename: 'boarding-pass.pdf',
    contentType: 'application/pdf',
    byteSize: 145_408,
    label: 'TAP TP1233',
    source: 'upload',
    createdAt: '2026-09-01T10:00:00.000Z',
    ...over,
  };
}

/** jsdom implements neither, and both are the point of the open path. */
const createObjectURL = vi.fn(() => 'blob:pass-1');
const revokeObjectURL = vi.fn();

beforeEach(() => {
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
  vi.mocked(loadAllPasses).mockResolvedValue({ data: [pass()], stale: false });
  vi.mocked(fetchPassBytes).mockResolvedValue({ blob: new Blob(['x']), stale: false });
  vi.mocked(deletePass).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

const draw = () =>
  render(
    <AuthContext.Provider value={auth}>
      <PassesPage />
    </AuthContext.Provider>,
  );

describe('the Passes page', () => {
  it('groups passes under the trip they belong to', async () => {
    vi.mocked(loadAllPasses).mockResolvedValue({
      data: [
        pass({ id: 'p1', label: 'TAP TP1233' }),
        pass({ id: 'p2', tripId: 't2', tripName: 'Winnipeg', label: 'Via Rail 693' }),
        pass({ id: 'p3', label: 'Hotel Lutetia' }),
      ],
      stale: false,
    });
    draw();

    const lisbon = await screen.findByRole('heading', { name: 'Lisbon in spring' });
    const winnipeg = screen.getByRole('heading', { name: 'Winnipeg' });

    // Each trip's list is its own, so assistive tech counts two passes on one
    // trip and one on the other rather than three on nothing in particular.
    const lisbonList = within(lisbon.parentElement as HTMLElement).getByRole('list');
    expect(within(lisbonList).getAllByRole('listitem')).toHaveLength(2);
    expect(within(lisbonList).getByText('TAP TP1233')).toBeInTheDocument();
    expect(within(lisbonList).getByText('Hotel Lutetia')).toBeInTheDocument();

    const winnipegList = within(winnipeg.parentElement as HTMLElement).getByRole('list');
    expect(within(winnipegList).getAllByRole('listitem')).toHaveLength(1);
  });

  it('says how a pass arrives when there are none', async () => {
    vi.mocked(loadAllPasses).mockResolvedValue({ data: [], stale: false });
    draw();

    expect(await screen.findByText('No passes yet.')).toBeInTheDocument();
    // Both routes in, because a reader with an empty screen cannot tell which
    // one exists. Named specifically enough to act on.
    expect(screen.getByText(/Forward a booking confirmation/)).toBeInTheDocument();
    expect(screen.getByText(/add a file to the flight, stay or activity/)).toBeInTheDocument();
  });

  it('says when the list itself came off the device', async () => {
    vi.mocked(loadAllPasses).mockResolvedValue({
      data: [pass()],
      stale: true,
      savedAt: '2026-08-15T16:07:00.000Z',
    });
    draw();

    // Naming the time is the point: "Offline" alone leaves the reader unsure
    // whether a pass added this morning would be here.
    expect(await screen.findByText(/Offline — showing the copy saved/)).toBeInTheDocument();
  });

  it('names the file kind in words and never prints a MIME type', async () => {
    vi.mocked(loadAllPasses).mockResolvedValue({
      data: [
        pass({ id: 'p1', contentType: 'application/vnd.apple.pkpass', byteSize: 24_576 }),
        pass({ id: 'p2', contentType: 'application/pdf', byteSize: 145_408 }),
      ],
      stale: false,
    });
    const { container } = draw();

    expect(await screen.findByText('Apple Wallet pass · 24 KB')).toBeInTheDocument();
    expect(screen.getByText('PDF · 142 KB')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/application\/|image\//);
    // Nor the id, nor the raw byte count.
    expect(container.textContent).not.toMatch(/145408|\bp1\b/);
  });

  it('gives every control a name that tells it from its neighbours', async () => {
    vi.mocked(loadAllPasses).mockResolvedValue({
      data: [
        pass({ id: 'p1', label: 'TAP TP1233' }),
        pass({ id: 'p2', label: 'Hotel Lutetia' }),
        // The same pass label on a different trip: the trip is in the name for
        // exactly this case, where the heading is not read out with the button.
        pass({ id: 'p3', tripId: 't2', tripName: 'Winnipeg', label: 'TAP TP1233' }),
      ],
      stale: false,
    });
    draw();

    await screen.findByRole('button', { name: 'Open TAP TP1233, Lisbon in spring' });
    const names = screen
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label') ?? button.textContent);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain('Open TAP TP1233, Winnipeg');
  });

  it('falls back to the filename when a pass carries no label', async () => {
    vi.mocked(loadAllPasses).mockResolvedValue({
      data: [pass({ label: null, filename: 'eticket.pdf' })],
      stale: false,
    });
    draw();

    expect(await screen.findByText('eticket.pdf')).toBeInTheDocument();
  });
});

describe('opening a pass', () => {
  it('hands the bytes to the device and revokes the object URL it made', async () => {
    // Fake timers, because the revoke is deliberately not in the same task as
    // the click — the download would be aborted by it.
    vi.useFakeTimers();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      draw();
      await act(async () => {});

      const button = screen.getByRole('button', { name: 'Open TAP TP1233, Lisbon in spring' });
      await act(async () => {
        button.click();
      });

      expect(fetchPassBytes).toHaveBeenCalledWith('p1', 'u1');
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(click).toHaveBeenCalledTimes(1);
      // Not yet: revoking here is what kills the download.
      expect(revokeObjectURL).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      // Leaking it is a real bug — an installed PWA stays open for days, and
      // every pass opened would be held in memory until it was closed.
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:pass-1');
    } finally {
      vi.useRealTimers();
    }
  });

  it('says so when the copy it opened is the one saved on this device', async () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.mocked(fetchPassBytes).mockResolvedValue({ blob: new Blob(['x']), stale: true });
    const user = userEvent.setup();
    draw();

    await user.click(await screen.findByRole('button', { name: 'Open TAP TP1233, Lisbon in spring' }));

    expect(
      await screen.findByText('Offline — opening the copy of TAP TP1233 saved on this device.'),
    ).toBeInTheDocument();
  });

  it('says what happened when there is nothing to open', async () => {
    vi.mocked(fetchPassBytes).mockRejectedValue(new Error('offline'));
    const user = userEvent.setup();
    draw();

    await user.click(await screen.findByRole('button', { name: 'Open TAP TP1233, Lisbon in spring' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not open TAP TP1233/);
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});

describe('removing a pass', () => {
  it('asks on the row rather than in a blocking dialog, and drops it once confirmed', async () => {
    const user = userEvent.setup();
    draw();

    await user.click(await screen.findByRole('button', { name: 'Remove TAP TP1233, Lisbon in spring' }));
    // Inline, and focus moves onto the confirmation — the button that was
    // pressed no longer exists, so leaving focus alone would leave it on
    // `<body>`.
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove TAP TP1233, Lisbon in spring' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Remove TAP TP1233, Lisbon in spring' }));

    expect(deletePass).toHaveBeenCalledWith('p1');
    await waitFor(() => expect(screen.queryByText('TAP TP1233')).toBeNull());
    expect(screen.getByRole('status')).toHaveTextContent('Removed TAP TP1233.');
  });

  it('leaves the pass alone when the reader backs out', async () => {
    const user = userEvent.setup();
    draw();

    await user.click(await screen.findByRole('button', { name: 'Remove TAP TP1233, Lisbon in spring' }));
    await user.click(screen.getByRole('button', { name: 'Keep TAP TP1233, Lisbon in spring' }));

    expect(deletePass).not.toHaveBeenCalled();
    expect(screen.queryByText('Are you sure?')).toBeNull();
    // Back where they started, not on `<body>`.
    expect(screen.getByRole('button', { name: 'Remove TAP TP1233, Lisbon in spring' })).toHaveFocus();
  });

  it('keeps the row when the removal failed', async () => {
    vi.mocked(deletePass).mockRejectedValue(new Error('offline'));
    const user = userEvent.setup();
    draw();

    await user.click(await screen.findByRole('button', { name: 'Remove TAP TP1233, Lisbon in spring' }));
    await user.click(screen.getByRole('button', { name: 'Remove TAP TP1233, Lisbon in spring' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not remove TAP TP1233/);
    expect(screen.getByText('TAP TP1233')).toBeInTheDocument();
  });
});

describe('the page while it is still loading, or cannot', () => {
  it('holds the shape of the list rather than saying "Loading…"', () => {
    draw();
    expect(screen.getByText('Loading your passes')).toBeInTheDocument();
  });

  it('says nothing is saved locally when the list cannot be read at all', async () => {
    vi.mocked(loadAllPasses).mockRejectedValue(new Error('boom'));
    draw();

    expect(
      await screen.findByText('Could not load your passes, and none are saved on this device yet.'),
    ).toBeInTheDocument();
  });
});

describe('the pieces the screen is built from', () => {
  it('humanises a size and never states a byte count', () => {
    expect(formatSize(145_408)).toBe('142 KB');
    expect(formatSize(24_576)).toBe('24 KB');
    expect(formatSize(2 * 1024 * 1024)).toBe('2.0 MB');
    expect(formatSize(400)).toBe('Under 1 KB');
    // A row written by an older build arrives missing the field entirely —
    // `undefined`, not `null` — and a `!== null` guard would let it through.
    expect(formatSize(undefined)).toBe('');
    expect(formatSize(null)).toBe('');
  });

  it('names a file kind in words, including one it does not recognise', () => {
    expect(fileKind('application/vnd.apple.pkpass')).toBe('Apple Wallet pass');
    expect(fileKind('application/pdf')).toBe('PDF');
    expect(fileKind('image/png')).toBe('Image');
    expect(fileKind('image/jpeg')).toBe('Image');
    expect(fileKind('application/zip')).toBe('File');
    expect(fileKind(undefined)).toBe('File');
  });

  it('prefers a label and falls back to the filename', () => {
    expect(passName({ label: 'TAP TP1233', filename: 'x.pkpass' })).toBe('TAP TP1233');
    expect(passName({ label: null, filename: 'x.pdf' })).toBe('x.pdf');
    expect(passName({ label: '   ', filename: 'x.pdf' })).toBe('x.pdf');
    expect(passName({})).toBe('Pass');
  });

  it('keys groups by trip id, so two trips of the same name stay apart', () => {
    const groups = groupByTrip([
      pass({ id: 'p1', tripId: 't1', tripName: 'Lisbon' }),
      pass({ id: 'p2', tripId: 't2', tripName: 'Lisbon' }),
      pass({ id: 'p3', tripId: 't1', tripName: 'Lisbon' }),
    ]);
    expect(groups.map((g) => g.tripId)).toEqual(['t1', 't2']);
    expect(groups[0]?.passes.map((p) => p.id)).toEqual(['p1', 'p3']);
  });

  it('orders trips by the one with the newest pass, which is the API order', () => {
    const groups = groupByTrip([
      pass({ id: 'p2', tripId: 't2', tripName: 'Winnipeg' }),
      pass({ id: 'p1', tripId: 't1', tripName: 'Lisbon' }),
    ]);
    expect(groups.map((g) => g.tripName)).toEqual(['Winnipeg', 'Lisbon']);
  });
});
