import { useEffect, useState } from 'react';

/**
 * The width at which the app stops being one screen at a time.
 *
 * Kept as a string and used verbatim so this file and `styles.css` cannot
 * disagree: the layout below is CSS, the *navigation model* above is JavaScript
 * — at this width the trips list is a permanent pane, so opening a trip is a
 * selection rather than a push, and the list must not also render into the
 * detail pane. That is a question about what to render, which CSS cannot answer.
 *
 * 72rem rather than the 48rem the tab bar already uses: two panes below this
 * squeeze the itinerary's own measure, which is the one thing the extra width
 * is not for.
 */
export const WIDE = '(min-width: 72rem)';

/**
 * True while the viewport is wide enough for the two-pane layout.
 *
 * Reads `matchMedia` during the first render rather than in an effect, so a
 * desktop never paints the phone layout for a frame and then jumps. Guarded
 * because `matchMedia` does not exist in jsdom by default, and a component
 * under test should get the single-column layout rather than throw.
 */
export function useWide(): boolean {
  const [wide, setWide] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(WIDE).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia(WIDE);
    const onChange = (event: MediaQueryListEvent) => setWide(event.matches);
    // Re-read on subscribe: the width can have changed between the first render
    // and this effect, and a resize that lands in that gap fires no event.
    setWide(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return wide;
}
