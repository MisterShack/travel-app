import { useContext } from 'react';
import { AuthContext, type AuthState } from './context';

/** The signed-in state. Throws outside an `AuthProvider`, which is a bug. */
export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider');
  return context;
}
