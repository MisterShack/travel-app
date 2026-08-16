import { useAuth } from '@/auth/useAuth';

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
    </>
  );
}
