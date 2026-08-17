import { describe, expect, it } from 'vitest';
import { directionsUrl, mapsPlatform } from './directions';

describe('mapsPlatform', () => {
  it('recognises an iPhone', () => {
    expect(
      mapsPlatform(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('apple');
  });

  it('recognises an iPad reporting itself as a Mac', () => {
    // iPadOS 13+ sends a desktop Safari user-agent. Both want the same scheme,
    // so the ambiguity costs nothing — which is why this is not worth
    // disambiguating with maxTouchPoints.
    expect(
      mapsPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15'),
    ).toBe('apple');
  });

  it('recognises Android', () => {
    expect(mapsPlatform('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36')).toBe(
      'android',
    );
  });

  it('puts Windows and Linux desktops on the web fallback', () => {
    expect(mapsPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('web');
    expect(mapsPlatform('Mozilla/5.0 (X11; Linux x86_64)')).toBe('web');
  });

  it('falls back to the web for an unrecognised or empty agent', () => {
    expect(mapsPlatform('')).toBe('web');
    expect(mapsPlatform('something-nobody-has-heard-of')).toBe('web');
  });

  it('does not mistake an Android tablet for an Apple device', () => {
    // Some Android WebViews mention "Mac OS X" in the Safari compatibility
    // token. Android is tested first for exactly this reason.
    expect(
      mapsPlatform('Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Mac OS X)'),
    ).toBe('android');
  });
});

describe('directionsUrl', () => {
  it('asks Apple Maps for directions, not a search', () => {
    // The control is labelled "Directions", so it routes.
    expect(directionsUrl('10 Rue de Rivoli, Paris', 'apple')).toBe(
      'https://maps.apple.com/?daddr=10%20Rue%20de%20Rivoli%2C%20Paris',
    );
  });

  it('uses the geo: scheme on Android so the default map app answers', () => {
    expect(directionsUrl('10 Rue de Rivoli, Paris', 'android')).toBe(
      'geo:0,0?q=10%20Rue%20de%20Rivoli%2C%20Paris',
    );
  });

  it('falls back to Google Maps on the web', () => {
    expect(directionsUrl('10 Rue de Rivoli, Paris', 'web')).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=10%20Rue%20de%20Rivoli%2C%20Paris',
    );
  });

  it('encodes characters that would otherwise break the URL', () => {
    const url = directionsUrl('Café & Bar #3, 50% off', 'web');
    expect(url).toContain('Caf%C3%A9%20%26%20Bar%20%233%2C%2050%25%20off');
    // An ampersand in an address must not become a second query parameter:
    // there are two here, and a name like "Bed & Breakfast" is ordinary.
    expect(url!.split('?')[1]!.split('&')).toHaveLength(2);
  });

  it('returns null for a place that is missing, blank or whitespace', () => {
    expect(directionsUrl(null, 'apple')).toBeNull();
    expect(directionsUrl('', 'apple')).toBeNull();
    expect(directionsUrl('   ', 'apple')).toBeNull();
  });

  it('returns null for undefined, which is what a stale cache entry yields', () => {
    // The offline cache stores raw JSON and never re-validates it, so a
    // timeline saved before `address` existed comes back without the field. A
    // `!== null` guard would have rendered a link to an empty map.
    expect(directionsUrl(undefined, 'apple')).toBeNull();
  });

  it('trims a place before using it', () => {
    expect(directionsUrl('  Hotel Lutetia  ', 'web')).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=Hotel%20Lutetia',
    );
  });
});
