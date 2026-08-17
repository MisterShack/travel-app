import type { Passenger } from '@travel/shared';

/**
 * The stored JSON, back into form rows.
 *
 * Anything unreadable becomes one blank row rather than an error: the column is
 * free-form JSON, and a flight whose passenger list cannot be parsed should
 * still be editable rather than unopenable.
 */
export function storedPassengers(raw: unknown): Passenger[] {
  const fallback = [{ name: '', seat: '' }];
  if (typeof raw !== 'string' || raw === '') return fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return fallback;
    const rows = parsed
      .filter((p): p is Record<string, unknown> => p !== null && typeof p === 'object')
      .map((p) => ({
        name: typeof p['name'] === 'string' ? p['name'] : '',
        seat: typeof p['seat'] === 'string' ? p['seat'] : '',
      }));
    return rows.length > 0 ? rows : fallback;
  } catch {
    return fallback;
  }
}
