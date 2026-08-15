import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, OfflineError } from '@/api/client';
import { AuthContext, type AuthState, type User } from './context';
import { clearCache } from '@/data/cache';



export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready'>('loading');
  const [offline, setOffline] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { user: me } = await api.get<{ user: User }>('/auth/me');
      setUser(me);
      setOffline(false);
    } catch (error) {
      if (error instanceof OfflineError) {
        // Offline is not signed-out. Keeping whatever user we already had is
        // what lets an installed app open its cached timeline on a plane
        // instead of bouncing to the sign-in screen (PLAN.md §8).
        setOffline(true);
      } else {
        setUser(null);
        setOffline(false);
      }
    } finally {
      setStatus('ready');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    await api.post('/auth/login', { email, password });
    const { user: me } = await api.get<{ user: User }>('/auth/me');
    setUser(me);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch (error) {
      // A failed logout must still clear local state, or the cache outlives the
      // session on a shared device.
      if (!(error instanceof ApiError) && !(error instanceof OfflineError)) throw error;
    }
    await clearCache();
    setUser(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, status, offline, signIn, signOut, refresh }),
    [user, status, offline, signIn, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
