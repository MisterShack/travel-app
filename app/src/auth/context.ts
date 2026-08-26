import { createContext } from 'react';
import type { Preferences, PreferencesPatch } from '@travel/shared';

export type User = {
  id: string;
  email: string;
  emailVerifiedAt: string | null;
  /** Display preferences, stored on the account so they follow the person. */
  preferences: Preferences;
};

export type AuthState = {
  user: User | null;
  /** Distinguishes "not signed in" from "we have not asked yet". */
  status: 'loading' | 'ready';
  /** True when the session could not be checked because there is no network. */
  offline: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Saves a display preference and adopts the account's answer as returned. */
  updatePreferences: (patch: PreferencesPatch) => Promise<void>;
};

/**
 * Kept apart from `AuthContext.tsx` and `useAuth.ts` so each of those exports
 * exactly one kind of thing. React Fast Refresh only preserves state across
 * edits when a module exports components alone; mixing a context or a hook in
 * makes every save drop the signed-in session.
 */
export const AuthContext = createContext<AuthState | null>(null);
