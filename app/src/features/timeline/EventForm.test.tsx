import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('@/api/client', async () => {
  const actual = await vi.importActual<typeof import('@/api/client')>('@/api/client');
  return {
    ...actual,
    api: {
      get: vi.fn(async () => ({ trip: { homeTimezone: 'Europe/Lisbon' } })),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
  };
});

const { EventFormPage } = await import('./EventForm');

/** Renders the form the way the review queue does: a draft in route state. */
function reviewing(draft: Record<string, unknown>) {
  return render(
    <MemoryRouter
      initialEntries={[{ pathname: '/trips/t1/activity/new', state: { draft, importId: 'i1' } }]}
    >
      <Routes>
        <Route path="/trips/:tripId/:kind/:id" element={<EventFormPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('reviewing an imported draft', () => {
  it('preselects the kind the extraction reported', async () => {
    /*
     * The whole point of the review screen is that the form arrives filled in.
     * A forwarded OpenTable booking extracted as kind "restaurant" was landing
     * on "Other", so the one field the import could have saved was the one the
     * reviewer had to set by hand.
     */
    reviewing({
      kind: 'restaurant',
      name: 'Cervejaria Ramiro',
      location: 'Av. Almirante Reis 1',
      startLocal: '2026-09-10T20:30',
      confirmationCode: 'ABC12345',
    });

    const what = await screen.findByLabelText('What');
    await waitFor(() => expect(what).toHaveValue('restaurant'));
    expect(screen.getByLabelText('Name')).toHaveValue('Cervejaria Ramiro');
    expect(screen.getByLabelText('Where')).toHaveValue('Av. Almirante Reis 1');
  });

  it('falls back to Other when the extraction did not say', async () => {
    reviewing({ name: 'Something' });
    const what = await screen.findByLabelText('What');
    await waitFor(() => expect(what).toHaveValue('other'));
  });
});
