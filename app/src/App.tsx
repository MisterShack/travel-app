import { useEffect, useRef } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/useAuth';
import { Skeleton } from '@/components/Bits';
import { useInbox } from '@/data/useInbox';
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
  const { pending } = useInbox();
  const location = useLocation();
  const main = useRef<HTMLElement>(null);

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
          {offline && (
            <span className="offline-chip" role="status">
              Offline
            </span>
          )}
          {/*
            One navigation, in the header, in the DOM — and `position: fixed`
            takes it out of the header's flow on a phone, where it becomes the
            bottom bar. That is why it can move without being written twice:
            two `<nav>`s toggled by a media query would be two things for
            assistive tech to read and two places to keep a link in step.

            It sits after the offline chip so a keyboard user reaches the
            wordmark, then the status, then the destinations — and the skip link
            is there for anyone who wants none of it.
          */}
          <TabBar pending={pending} />
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
    </div>
  );
}
