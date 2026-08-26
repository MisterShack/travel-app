import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { PreferencesPatch } from '@travel/shared';
import { api, ApiError, OfflineError } from '@/api/client';
import { AuthContext, type AuthState, type User } from './context';
import { clearCache } from '@/data/cache';
import { followSystemTheme, paintTheme, rememberTheme } from '@/theme';



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

  const updatePreferences = useCallback(async (patch: PreferencesPatch) => {
    const { user: me } = await api.patch<{ user: User }>('/auth/me/preferences', patch);
    setUser(me);
  }, []);

  /**
   * The account's theme, painted whenever it arrives or changes.
   *
   * The boot script has already painted whatever the last cold start knew, so
   * this is the correction rather than the first paint — it matters on the
   * first sign-in on a device, and when the setting is changed on another one.
   *
   * While the preference is `system` the OS is followed live, so flipping the
   * phone to dark at sunset repaints a page that is already open. An explicit
   * choice drops the listener rather than letting it repaint over the choice.
   */
  const theme = user?.preferences.theme ?? 'system';
  useEffect(() => {
    paintTheme(theme);
    rememberTheme(theme);
    if (theme !== 'system') return;
    return followSystemTheme(() => paintTheme('system'));
  }, [theme]);

  const value = useMemo<AuthState>(
    () => ({ user, status, offline, signIn, signOut, refresh, updatePreferences }),
    [user, status, offline, signIn, signOut, refresh, updatePreferences],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
