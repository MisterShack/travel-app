/**
 * Handing a place off to the device's own map app (PLAN-V3 §2, Phase 8).
 *
 * The plan's reasoning, kept here because it is the whole design: a map on the
 * trip screen is a network dependency on the screen that must work offline, and
 * at a gate with no signal a map tile is a grey box — which reads as *broken*
 * rather than as offline. The underlying need is "how do I get there", and the
 * phone already has an app that answers it better than we could: it knows the
 * user's location, their transport preferences, their downloaded offline maps
 * and live traffic.
 *
 * So this embeds nothing, costs nothing, needs no API key and no provider
 * account, and adds no bytes to a bundle that must work with no network.
 *
 * Out of the component so it can be tested — the same reason `draft.ts` exists.
 * A URL scheme that is silently wrong on one platform is invisible until
 * someone is standing outside a hotel with it.
 */

/** Which map app the device is likely to have. */
export type MapsPlatform = 'apple' | 'android' | 'web';

/**
 * Reads the platform off the user-agent string.
 *
 * Deliberately coarse. This picks a URL scheme, and every branch degrades to a
 * web page rather than an error, so a wrong guess costs a redirect and not a
 * broken link.
 *
 * macOS is grouped with iOS because Apple Maps exists there too — and because
 * iPadOS reports itself as `Macintosh`, so the two cannot be separated by
 * user-agent alone anyway. That collapse is a feature here: both want the same
 * scheme.
 */
export function mapsPlatform(userAgent: string): MapsPlatform {
  if (/Android/i.test(userAgent)) return 'android';
  if (/iPhone|iPad|iPod|Macintosh|Mac OS X/i.test(userAgent)) return 'apple';
  return 'web';
}

/**
 * A link that asks for directions to `place`.
 *
 * Routing rather than search, because the control is labelled "Directions" and
 * a control says exactly what happens. Apple and Google both take a destination
 * directly and start from the user's current location.
 *
 * Android is the exception: the `geo:` scheme has no destination form, so it
 * gets a search that drops a pin, one tap from directions. `geo:` is used
 * rather than a Google-specific URL because it opens *whichever* map app the
 * user has chosen as default, which is the Android-idiomatic behaviour and the
 * point of handing off at all.
 *
 * Returns null for a place that is missing or blank, so callers render nothing
 * rather than a link to an empty map. `undefined` is accepted alongside `null`
 * on purpose: the offline cache stores raw JSON and never re-validates it, so
 * an entry saved before `address` existed comes back missing the field
 * entirely, and a `!== null` check would have let it through.
 */
export function directionsUrl(
  place: string | null | undefined,
  platform: MapsPlatform,
): string | null {
  const query = place?.trim();
  if (query === undefined || query === '') return null;

  const encoded = encodeURIComponent(query);
  switch (platform) {
    case 'apple':
      return `https://maps.apple.com/?daddr=${encoded}`;
    case 'android':
      return `geo:0,0?q=${encoded}`;
    case 'web':
      return `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;
  }
}
