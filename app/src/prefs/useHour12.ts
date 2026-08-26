import { deviceUses12Hour, resolveHour12 } from '@travel/shared';
import { useAuth } from '@/auth/useAuth';

/**
 * Whether to write times as 12-hour, for this reader on this device.
 *
 * `auto` — the default — is resolved here rather than on the server, because it
 * means "whatever this device says" and only the device knows. A signed-out or
 * not-yet-loaded reader gets the same answer their device would give, so the
 * timeline does not change format underneath them when `/me` lands.
 */
export function useHour12(): boolean {
  const { user } = useAuth();
  return resolveHour12(user?.preferences.timeFormat ?? 'auto', deviceUses12Hour());
}
