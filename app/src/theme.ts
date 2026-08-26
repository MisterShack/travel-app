import type { Theme } from '@travel/shared';

/**
 * Painting the account's theme, and painting it before the first frame.
 *
 * The preference lives on the **account**, so it does not arrive until `/me`
 * answers — by which time the page has already painted. Waiting for it would
 * show a dark-mode reader the light palette for as long as a request takes, on
 * every cold start, which is worse than the setting is worth.
 *
 * So the last known answer is mirrored into `localStorage` and applied by the
 * inline script in `index.html`, which runs before any stylesheet is fetched.
 * This module owns the two things that script cannot: keeping the mirror
 * current when the account's answer arrives or changes, and following the OS
 * while the app is open for as long as the preference is `system`.
 */

/** Shared with the boot script in `index.html`, which cannot import it. */
export const THEME_KEY = 'waypoint.theme';

const darkMedia = () => window.matchMedia('(prefers-color-scheme: dark)');

/** What `system` resolves to right now. */
export function systemTheme(): 'light' | 'dark' {
  return darkMedia().matches ? 'dark' : 'light';
}

/**
 * Paints a theme.
 *
 * `data-theme` is always a concrete `light` or `dark` — never `system`, and
 * never absent. `styles.css` leans on that to define each token exactly once
 * per palette instead of keeping a `prefers-color-scheme` block in sync with a
 * selector that says the same thing. It is safe to rely on because this app is
 * a React SPA: it cannot render at all without the script that sets the
 * attribute, so there is no scriptless case for a media query to serve.
 */
export function paintTheme(theme: Theme): void {
  const resolved = theme === 'system' ? systemTheme() : theme;
  document.documentElement.setAttribute('data-theme', resolved);

  /*
   * The iOS status bar reads this, and an installed PWA is the case the app is
   * built for (PLAN.md §7). Without it, a reader who forces the light theme on
   * a dark phone keeps a dark bar sitting above a light page.
   */
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', resolved === 'dark' ? '#101216' : '#faf9f7');
}

/**
 * What this device was last told to paint, as the boot script reads it.
 *
 * Signed out there is no account answer, and `system` is the wrong stand-in for
 * one: it repaints the sign-in screen to the browser default the moment someone
 * signs out of an account set to light. This is the **device's** memory, and it
 * outlives the session deliberately — a theme is a look, not something the next
 * person at a shared browser learns anything from.
 */
export function storedTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
  } catch {
    return 'system';
  }
}

/** Mirrors the account's answer for the next cold start. */
export function rememberTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /*
     * Private browsing, or storage disabled. The theme still applies for this
     * session — only the head start on the next cold start is lost, and the
     * boot script falls back to the OS, which is what `system` would have done.
     */
  }
}

/**
 * Repaints when the OS flips, for as long as the preference is `system`.
 *
 * Returns the unsubscribe, so switching away from `system` drops the listener
 * rather than leaving it repainting over an explicit choice.
 */
export function followSystemTheme(onChange: () => void): () => void {
  const media = darkMedia();
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}
