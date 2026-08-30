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
  ChooseTripPane,
  TripDetailPage,
  TripFormPage,
  TripListPage,
  TripSettingsPage,
} from '@/features/trips/TripPages';
import { ImportsPage } from '@/features/imports/ImportsPage';
import { AccountPage } from '@/features/account/AccountPage';
import { PassesPage } from '@/features/passes/PassesPage';
import { TabBar } from '@/components/TabBar';
import { Wordmark } from '@/components/Wordmark';
import { useWide } from '@/components/useWide';
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

/**
 * A screen that is a task rather than a destination.
 *
 * These get the whole phone: the tab bar goes, because leaving mid-form by
 * tapping another destination is not something to make easy, and the form's own
 * actions take the bottom edge instead. The way out is the bar at the top,
 * which is why that and this arrived together — one without the other would be
 * a screen with no exit.
 */
const TASK_ROUTE = /^\/trips\/(new$|[^/]+\/(segment|lodging|activity)\/[^/]+$)/;

export function App() {
  const { user, offline } = useAuth();
  const { pending } = useInbox();
  const location = useLocation();
  const main = useRef<HTMLElement>(null);
  const wide = useWide();

  /**
   * Above 72rem the trips list is a permanent pane beside the open trip, so
   * opening a trip is a selection rather than a push (BRAND.md §6c). Only the
   * trip routes have a list to show beside them; Inbox, Passes and Account are
   * one column next to the rail.
   */
  const signedIn = user !== null;
  const onTripsRoute = location.pathname === '/' || location.pathname.startsWith('/trips');
  const showListPane = wide && signedIn && onTripsRoute;
  const task = TASK_ROUTE.test(location.pathname) && !wide;

  const shell = [
    'app',
    wide && signedIn ? 'wide' : '',
    showListPane ? 'with-list' : '',
    task ? 'no-tabs has-pinned-actions' : '',
  ]
    .filter((c) => c !== '')
    .join(' ');

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
    <div className={shell}>
      <a className="skip" href="#main">
        Skip to content
      </a>
      {/* Signed out, the wordmark belongs above the sign-in card rather than in
          a title bar over an empty page — so the header only exists once there
          is an app behind it.

          Signed in, this is a title bar on a phone and the rail on a desktop.
          Same element and the same children either way — what changes is where
          it sits, because a strip of chrome across the top of a 1440px window
          is a phone's header borrowed into a place that has room for a
          column. */}
      {user !== null && (
        <header className={wide ? 'rail' : 'bar'}>
          <h1>
            <Link className="wordmark" to="/">
              <Wordmark />
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
          {/* Not rendered on a task screen rather than hidden: a `display: none`
              tab bar is still four stops in the keyboard's tab order, leading
              somewhere the screen is deliberately not offering. */}
          {!task && <TabBar pending={pending} />}
        </header>
      )}

      {/* The list, permanently, beside whatever is open. It is a `nav` because
          that is what it is — a list of links to the app's own content — and it
          carries its own name so a keyboard user can reach it as a landmark
          rather than tabbing the rail every time. */}
      {showListPane && (
        <nav className="list-pane" aria-label="Trips">
          <TripListPage />
        </nav>
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
                {/* With the list already standing in its own pane, rendering it
                    again here would be the same screen twice. */}
                {showListPane ? <ChooseTripPane /> : <TripListPage />}
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
          <Route
            path="/passes"
            element={
              <RequireUser>
                <PassesPage />
              </RequireUser>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
