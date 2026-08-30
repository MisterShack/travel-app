import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Wordmark } from '@/components/Wordmark';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '@/api/client';
import { useAuth } from '@/auth/useAuth';
import { ErrorText, Field, Skeleton } from '@/components/Bits';

/**
 * The frame every signed-out screen sits in: the wordmark, then one narrow
 * card.
 *
 * A sign-in form running the full width of a desktop window is a form on a web
 * page (BRAND.md §6b). The wordmark appears here rather than in the app header,
 * which does not exist until there is an app behind it.
 */
function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="auth">
      <p className="brandline">
        <span className="wordmark">
          <Wordmark />
        </span>
      </p>
      <div className="panel">
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

function useSubmit<T>(action: (...args: never[]) => Promise<T>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run, setError, action };
}

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, run } = useSubmit(signIn);
  const errorId = useId();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await signIn(email, password);
      navigate('/');
    });
  };

  return (
    <AuthShell title="Sign in">
      <form onSubmit={onSubmit}>
      {/* Both fields point at the error: the server deliberately does not say
          which of the two was wrong, so neither should the markup. */}
      <Field label="Email">
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error !== '' || undefined}
          aria-describedby={error !== '' ? errorId : undefined}
          required
        />
      </Field>
      <Field label="Password">
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={error !== '' || undefined}
          aria-describedby={error !== '' ? errorId : undefined}
          required
        />
      </Field>
      <ErrorText id={errorId}>{error}</ErrorText>
      {/* Buttons, not bare links. A filled control beside two underlined words
          is the clearest single tell that a screen is a web page with a form on
          it (BRAND.md §6). */}
      <div className="actions">
        <button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <Link className="btn secondary" to="/register">
          Create an account
        </Link>
        <Link className="btn secondary" to="/forgot">
          Forgot password
        </Link>
      </div>
      </form>
    </AuthShell>
  );
}

export function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const { busy, error, run } = useSubmit(async () => undefined);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await api.post('/auth/register', { email, password });
      setDone(true);
    });
  };

  // The same message whether or not the address was already registered — the
  // server deliberately does not say, and neither does this.
  if (done) {
    return (
      <AuthShell title="Check your email">
        <p className="muted">
          If that address can be registered, a verification link is on its way. The link signs you in.
        </p>
        <div className="actions">
          <Link className="btn secondary" to="/login">
            Back to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Create an account">
      <form onSubmit={onSubmit}>
      <Field label="Email">
        <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      <Field label="Password" hint="At least 10 characters. Length matters more than symbols.">
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={10}
        />
      </Field>
      <ErrorText>{error}</ErrorText>
      <div className="actions">
        <button disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
        <Link className="btn secondary" to="/login">
          I already have an account
        </Link>
      </div>
      </form>
    </AuthShell>
  );
}

export function VerifyPage() {
  const [params] = useSearchParams();
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<'working' | 'failed'>('working');
  const token = params.get('token') ?? '';
  /**
   * A verification token is single-use, so the request must fire **once** per
   * mount — not once per effect invocation.
   *
   * React StrictMode double-invokes effects in development, which redeemed the
   * token on the first run and then showed "no longer valid" from the second.
   * A `cancelled` flag does not help: it suppresses the state update, not the
   * request that already went out. The same hazard exists outside StrictMode
   * wherever this component remounts.
   */
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void (async () => {
      try {
        await api.post('/auth/verify', { token });
        // Verifying signs you in, so pick the session up before navigating.
        await refresh();
        navigate('/', { replace: true });
      } catch {
        /**
         * A failed redemption is not necessarily a dead link. Mail scanners
         * prefetch URLs and people click twice, both of which spend the token
         * on a request whose response nobody saw. If the session it created is
         * live, this succeeded — say so rather than sending a verified user to
         * an error page.
         */
        try {
          const { user } = await api.get<{ user: { emailVerifiedAt: string | null } }>('/auth/me');
          if (user.emailVerifiedAt !== null) {
            await refresh();
            navigate('/', { replace: true });
            return;
          }
        } catch {
          /* not signed in either — genuinely invalid */
        }
        setState('failed');
      }
    })();
  }, [token, refresh, navigate]);

  if (state === 'working')
    return (
      <AuthShell title="Verifying">
        <Skeleton rows={1} label="Verifying your email address" />
      </AuthShell>
    );
  return (
    <AuthShell title="That link is no longer valid">
      <p className="muted">Verification links last 24 hours and can only be used once.</p>
      <div className="actions">
        <Link className="btn secondary" to="/login">
          Back to sign in
        </Link>
      </div>
    </AuthShell>
  );
}

export function ForgotPage() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const { busy, error, run } = useSubmit(async () => undefined);

  if (done) {
    return (
      <AuthShell title="Check your email">
        <p className="muted">If that address has an account, a reset link is on its way.</p>
        <div className="actions">
          <Link className="btn secondary" to="/login">
            Back to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Reset your password">
      <form
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          await api.post('/auth/forgot', { email });
          setDone(true);
        });
      }}
    >
      <Field label="Email">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      <ErrorText>{error}</ErrorText>
      <div className="actions">
        <button disabled={busy}>Send reset link</button>
        <Link className="btn secondary" to="/login">
          Back to sign in
        </Link>
      </div>
      </form>
    </AuthShell>
  );
}

export function ResetPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const { busy, error, run } = useSubmit(async () => undefined);
  const token = params.get('token') ?? '';

  return (
    <AuthShell title="Choose a new password">
      <form
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          await api.post('/auth/reset', { token, password });
          navigate('/login', { replace: true });
        });
      }}
    >
      <Field label="New password" hint="At least 10 characters.">
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={10}
        />
      </Field>
      <ErrorText>{error}</ErrorText>
      <div className="actions">
        <button disabled={busy}>Change password</button>
      </div>
      <p className="muted tiny">Every device signed in with the old password will be signed out.</p>
      </form>
    </AuthShell>
  );
}

/**
 * The invite landing page.
 *
 * Fetches the invite unauthenticated so it can name the trip before asking
 * anyone to sign in — being told "you have been invited" with no idea to what
 * is a bad way to be asked for a password.
 */
export function InvitePage() {
  const [params] = useSearchParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const [invite, setInvite] = useState<{ trip: string; email: string } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const { busy, error, run } = useSubmit(async () => undefined);

  useEffect(() => {
    void (async () => {
      try {
        const { invite: found } = await api.get<{ invite: { trip: string; email: string } }>(
          `/invites/${token}`,
        );
        setInvite(found);
      } catch {
        setNotFound(true);
      }
    })();
  }, [token]);

  if (notFound) {
    return (
      <AuthShell title="That invitation is no longer valid">
        <p className="muted">Invitations last 7 days, can only be used once, and can be revoked.</p>
      </AuthShell>
    );
  }
  if (!invite)
    return (
      <AuthShell title="Invitation">
        <Skeleton rows={1} label="Loading this invitation" />
      </AuthShell>
    );

  return (
    <AuthShell title={`You have been invited to ${invite.trip}`}>
      <p className="muted">
        This invitation was sent to <strong>{invite.email}</strong> and can only be accepted by that
        account.
      </p>
      {user === null ? (
        <div className="actions">
          <Link className="btn" to={`/login?next=/invite?token=${encodeURIComponent(token)}`}>
            Sign in to accept
          </Link>
        </div>
      ) : (
        <>
          <ErrorText>{error}</ErrorText>
          <div className="actions">
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const { tripId } = await api.post<{ tripId: string }>(`/invites/${token}/accept`);
                  navigate(`/trips/${tripId}`, { replace: true });
                })
              }
            >
              Join {invite.trip}
            </button>
          </div>
          {user.email !== invite.email && (
            <p className="muted tiny">
              You are signed in as {user.email}. This invitation is for {invite.email}, so it will be
              refused — sign in as that account instead.
            </p>
          )}
        </>
      )}
    </AuthShell>
  );
}
