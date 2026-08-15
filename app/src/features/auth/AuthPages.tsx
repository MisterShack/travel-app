import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '@/api/client';
import { useAuth } from '@/auth/useAuth';
import { ErrorText, Field } from '@/components/Bits';

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

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await signIn(email, password);
      navigate('/');
    });
  };

  return (
    <form onSubmit={onSubmit}>
      <h2>Sign in</h2>
      <Field label="Email">
        <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      <Field label="Password">
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </Field>
      <ErrorText>{error}</ErrorText>
      <div className="actions">
        <button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <Link to="/register">Create an account</Link>
        <Link to="/forgot">Forgot password</Link>
      </div>
    </form>
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
      <>
        <h2>Check your email</h2>
        <p className="muted">
          If that address can be registered, a verification link is on its way. The link signs you in.
        </p>
        <p>
          <Link to="/login">Back to sign in</Link>
        </p>
      </>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <h2>Create an account</h2>
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
        <Link to="/login">I already have an account</Link>
      </div>
    </form>
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

  if (state === 'working') return <p className="muted">Verifying…</p>;
  return (
    <>
      <h2>That link is no longer valid</h2>
      <p className="muted">Verification links last 24 hours and can only be used once.</p>
      <p>
        <Link to="/login">Back to sign in</Link>
      </p>
    </>
  );
}

export function ForgotPage() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const { busy, error, run } = useSubmit(async () => undefined);

  if (done) {
    return (
      <>
        <h2>Check your email</h2>
        <p className="muted">If that address has an account, a reset link is on its way.</p>
        <p>
          <Link to="/login">Back to sign in</Link>
        </p>
      </>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          await api.post('/auth/forgot', { email });
          setDone(true);
        });
      }}
    >
      <h2>Reset your password</h2>
      <Field label="Email">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      <ErrorText>{error}</ErrorText>
      <div className="actions">
        <button disabled={busy}>Send reset link</button>
        <Link to="/login">Back</Link>
      </div>
    </form>
  );
}

export function ResetPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const { busy, error, run } = useSubmit(async () => undefined);
  const token = params.get('token') ?? '';

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          await api.post('/auth/reset', { token, password });
          navigate('/login', { replace: true });
        });
      }}
    >
      <h2>Choose a new password</h2>
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
      <>
        <h2>That invitation is no longer valid</h2>
        <p className="muted">Invitations last 7 days, can only be used once, and can be revoked.</p>
      </>
    );
  }
  if (!invite) return <p className="muted">Loading…</p>;

  return (
    <>
      <h2>You have been invited to {invite.trip}</h2>
      <p className="muted">
        This invitation was sent to <strong>{invite.email}</strong> and can only be accepted by that
        account.
      </p>
      {user === null ? (
        <p>
          <Link to={`/login?next=/invite?token=${encodeURIComponent(token)}`}>Sign in to accept</Link>
        </p>
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
    </>
  );
}
