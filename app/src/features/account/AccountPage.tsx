import { useState } from 'react';
import {
  deviceUses12Hour,
  formatTimeOfDay,
  themes,
  timeFormats,
  type Theme,
  type TimeFormat,
} from '@travel/shared';
import { useAuth } from '@/auth/useAuth';
import { ErrorText, Field } from '@/components/Bits';

/**
 * Account. Exists mostly so the tab bar has a third destination that is not a
 * menu — consumer apps put identity and sign-out here, and hiding sign-out
 * behind a header button is the sort of thing people hunt for.
 */
export function AccountPage() {
  const { user, signOut, offline } = useAuth();

  return (
    <>
      <h2 className="screen-title">Account</h2>

      <div className="card">
        <div className="field-label">Signed in as</div>
        <div>{user?.email}</div>
        {user?.emailVerifiedAt !== null && <p className="muted tiny">Email verified.</p>}
      </div>

      {offline && (
        <p className="banner" role="status">
          Offline — showing what this device remembers.
        </p>
      )}

      <Display />

      <div className="card">
        <h3>Reminders</h3>
        <p className="muted tiny" style={{ marginTop: 0 }}>
          Reminders are set per trip, under <strong>Manage</strong> on the trip. Email always
          works; push is an extra you turn on per device.
        </p>
      </div>

      <div className="actions">
        <button className="secondary" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>

      {/* So "am I running the build that was just deployed?" is a question the
          app can answer, rather than one that needs a minified bundle diff. */}
      <p className="muted tiny" style={{ marginTop: 'var(--space-6)' }}>
        Build {__BUILD_ID__} UTC
      </p>
    </>
  );
}

/** The example clock beside the time-format control: 19:30, or 7:30 PM. */
const SAMPLE = '2026-09-10T19:30';

const TIME_FORMAT_LABEL: Record<TimeFormat, string> = {
  auto: 'Automatic',
  '12': '12-hour',
  '24': '24-hour',
};

const THEME_LABEL: Record<Theme, string> = {
  system: 'Automatic',
  light: 'Light',
  dark: 'Dark',
};

/**
 * Display preferences, stored on the **account** rather than the device.
 *
 * That is the point of them: someone who reads 12-hour time reads it on their
 * phone and on their laptop, and someone who needs a particular theme should
 * not have to find this screen again on every machine they sign in from.
 *
 * Both default to *Automatic*, which is what the app did before either existed.
 * ROADMAP.md §5 deferred per-event reminder overrides on the reasoning that
 * sensible defaults matter more than a setting nobody opens, and that applies
 * here: the reader who never finds this screen still gets the right answer.
 */
function Display() {
  const { user, updatePreferences, offline } = useAuth();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const preferences = user?.preferences;

  const save = (patch: { timeFormat?: TimeFormat; theme?: Theme }) => {
    setError('');
    setSaving(true);
    void updatePreferences(patch)
      .catch(() =>
        setError(
          offline
            ? 'No connection, so this could not be saved. It is stored on your account, not this device.'
            : 'That could not be saved. Try again.',
        ),
      )
      .finally(() => setSaving(false));
  };

  return (
    <div className="card">
      <h3>Display</h3>
      <p className="muted tiny" style={{ marginTop: 0 }}>
        Saved to your account, so they follow you to every device you sign in on.
      </p>

      <Field label="Time format" hint={`Automatic follows this device — ${deviceSample()}.`}>
        <select
          value={preferences?.timeFormat ?? 'auto'}
          disabled={preferences === undefined || saving}
          onChange={(event) => save({ timeFormat: event.target.value as TimeFormat })}
        >
          {timeFormats.map((value) => (
            <option key={value} value={value}>
              {TIME_FORMAT_LABEL[value]}
              {value === 'auto' ? '' : ` — ${formatTimeOfDay(SAMPLE, value === '12')}`}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Theme" hint="Automatic follows this device's light or dark setting.">
        <select
          value={preferences?.theme ?? 'system'}
          disabled={preferences === undefined || saving}
          onChange={(event) => save({ theme: event.target.value as Theme })}
        >
          {themes.map((value) => (
            <option key={value} value={value}>
              {THEME_LABEL[value]}
            </option>
          ))}
        </select>
      </Field>

      <ErrorText>{error}</ErrorText>
    </div>
  );
}

/** What *Automatic* currently resolves to, so the label is not a guess. */
function deviceSample(): string {
  return formatTimeOfDay(SAMPLE, deviceUses12Hour());
}
