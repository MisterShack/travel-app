import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/useAuth';
import { api } from '@/api/client';
import { Skeleton } from '@/components/Bits';
import {
  ForgotPage,
  InvitePage,
  LoginPage,
  RegisterPage,
  ResetPage,
  VerifyPage,
} from '@/features/auth/AuthPages';
import {
  TripDetailPage,
  TripFormPage,
  TripListPage,
  TripSettingsPage,
} from '@/features/trips/TripPages';
import { ImportsPage } from '@/features/imports/ImportsPage';
import { AccountPage } from '@/features/account/AccountPage';
import { TabBar } from '@/components/TabBar';
import { EventFormPage } from '@/features/timeline/EventForm';

/**
 * Gate for the signed-in area.
 *
 * Offline counts as signed in when a user is already known: an installed app
 * opened on a plane must show its cached timeline, not bounce to a sign-in
 * screen it cannot possibly complete (PLAN.md §8).
 */
function RequireUser({ children }: { children: React.ReactNode }) {
  const { user, status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <Skeleton rows={2} label="Signing you in" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

export function App() {
  const { user, offline } = useAuth();
  const location = useLocation();
  const main = useRef<HTMLElement>(null);

  /**
   * How many imports await review.
   *
   * Re-read on every navigation rather than polled on a timer: it changes when
   * mail arrives, which is rare, and a timer would wake the app up for nothing
   * on a device where battery and signal are scarce. Push tells you about
   * arrivals while you are away; this keeps the badge honest while you are here.
   */
  const [pending, setPending] = useState(0);
  const refreshCount = useCallback(() => {
    if (!user) return setPending(0);
    void api
      .get<{ count: number }>('/imports/count')
      .then((r) => setPending(r.count))
      .catch(() => {
        /* offline or signed out — leave the last known count alone */
      });
  }, [user]);
  useEffect(refreshCount, [refreshCount, location.pathname]);

  /**
   * Move focus to the main region on every route change.
   *
   * A single-page app swaps the view without a document load, so focus stays
   * wherever it was — on a button that no longer exists. A screen-reader user
   * hears nothing and is still reading the old page; a keyboard user tabs from
   * the top of the document again. The browser does this for free on a real
   * navigation; here it has to be done by hand.
   */
  useEffect(() => {
    main.current?.focus();
  }, [location.pathname]);

  return (
    <div className="app">
      <a className="skip" href="#main">
        Skip to content
      </a>
      {/* Signed out, the wordmark belongs above the sign-in card rather than in
          a title bar over an empty page — so the header only exists once there
          is an app behind it. */}
      {user !== null && (
        <header className="bar">
          <h1>
            <Link className="wordmark" to="/">
              Waypoint
            </Link>
          </h1>
          {/* Navigation lives in the tab bar. The header is a title bar and an
              offline indicator, nothing else — two navigations competing is how
              a web page looks. */}
          {offline && (
            <span className="offline-chip" role="status">
              Offline
            </span>
          )}
        </header>
      )}

      <main id="main" ref={main} tabIndex={-1}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/verify" element={<VerifyPage />} />
          <Route path="/forgot" element={<ForgotPage />} />
          <Route path="/reset" element={<ResetPage />} />
          <Route path="/invite" element={<InvitePage />} />

          <Route
            path="/"
            element={
              <RequireUser>
                <TripListPage />
              </RequireUser>
            }
          />
          <Route
            path="/imports"
            element={
              <RequireUser>
                <ImportsPage />
              </RequireUser>
            }
          />
          <Route
            path="/trips/new"
            element={
              <RequireUser>
                <TripFormPage />
              </RequireUser>
            }
          />
          <Route
            path="/trips/:tripId"
            element={
              <RequireUser>
                <TripDetailPage />
              </RequireUser>
            }
          />
          <Route
            path="/trips/:tripId/settings"
            element={
              <RequireUser>
                <TripSettingsPage />
              </RequireUser>
            }
          />
          <Route
            path="/trips/:tripId/:kind/:id"
            element={
              <RequireUser>
                <EventFormPage />
              </RequireUser>
            }
          />
          <Route
            path="/account"
            element={
              <RequireUser>
                <AccountPage />
              </RequireUser>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {user !== null && <TabBar pending={pending} />}
    </div>
  );
}
