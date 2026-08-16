/**
 * Manual smoke drive: registers, verifies, creates a trip, adds one of each
 * timeline entity, and screenshots every screen — including the offline path.
 *
 * Not part of `npm test`. It needs both dev servers up, and it exists to be
 * *looked at*: the unit suites cannot tell you that a zone badge reads "GMT+1"
 * for two different zones, or that a hotel renders as a six-hour stay. Every
 * one of those was found here and not by a passing test.
 *
 *   # terminal 1
 *   DATABASE_URL="file:/tmp/tdev/travel.db" PORT=8787 \
 *     npm run start --workspace @travel/server > /tmp/tdev/server.log 2>&1
 *   # terminal 2
 *   npm run dev --workspace @travel/app
 *   # terminal 3
 *   node app/e2e/drive.mjs && open /tmp/travel-shots
 *
 * Drives the installed Google Chrome via Playwright's `channel: 'chrome'`, so
 * no browser download is needed. The verification token is scraped from the
 * server log, which prints mail to the console when RESEND_API_KEY is unset.
 */
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const SHOTS = process.env.SHOTS ?? '/tmp/travel-shots';
const LOG = process.env.SERVER_LOG ?? '/tmp/tdev/server.log';
const BASE = 'http://localhost:5173';
const EMAIL = `david+${Date.now()}@example.com`;
const PASSWORD = 'correct horse battery';

const tokenFrom = (kind) => {
  const m = [...readFileSync(LOG, 'utf8').matchAll(new RegExp(`${kind}\\?token=([\\w-]+)`, 'g'))];
  return m.at(-1)?.[1];
};
const shot = async (page, name) => {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
  console.log(`  shot: ${name}`);
};

const browser = await chromium.launch({ channel: 'chrome' });
// iPhone-ish: this is a phone-first PWA and that is where it will be used.
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(BASE);
await page.waitForLoadState('networkidle');
await shot(page, '01-signed-out');

// --- register ---
await page.getByRole('link', { name: /create an account/i }).click();
await page.locator('input[type=email]').fill(EMAIL);
await page.locator('input[type=password]').fill(PASSWORD);
await shot(page, '02-register');
await page.getByRole('button', { name: /create account/i }).click();
await page.getByText(/check your email/i).waitFor();
await shot(page, '03-check-email');

// --- verify (signs in) ---
await page.goto(`${BASE}/verify?token=${tokenFrom('verify')}`);
await page.waitForURL(`${BASE}/`);
await page.waitForLoadState('networkidle');
await shot(page, '04-empty-trip-list');

// --- create a trip ---
await page.getByRole('link', { name: /new trip/i }).click();
await page.locator('input').first().fill('Lisbon');
await page.locator('input').nth(1).fill('Portugal');
await page.locator('input[type=date]').first().fill('2026-09-10');
await page.locator('input[type=date]').nth(1).fill('2026-09-18');
await page.locator('select').selectOption('Europe/Lisbon').catch(() => {});
await shot(page, '05-new-trip');
await page.getByRole('button', { name: /create trip/i }).click();
await page.waitForURL(/\/trips\/trp_/);
await page.waitForLoadState('networkidle');
await shot(page, '06-empty-trip');

// --- add a flight, exercising the airport picker ---
await page.getByRole('link', { name: /\+ Flight/i }).click();
await page.getByLabel('Airline').fill('TAP Air Portugal');
await page.getByLabel('Flight number').fill('TP1233');
await page.getByLabel('From').fill('LHR');
await page.waitForTimeout(700);            // lazy airport chunk
await shot(page, '07-airport-resolved');
await page.locator('input[type=datetime-local]').first().fill('2026-09-10T10:00');
await page.getByLabel('To').fill('LIS');
await page.waitForTimeout(500);
await page.locator('input[type=datetime-local]').nth(1).fill('2026-09-10T13:00');
await page.getByLabel('Seat').fill('14C');
await shot(page, '08-flight-form');
await page.getByRole('button', { name: /^Add$/ }).click();
await page.waitForURL(/\/trips\/trp_[^/]+$/);
await page.waitForLoadState('networkidle');
await shot(page, '09-trip-one-flight');

// --- lodging + activity, so the timeline has something to group ---
await page.getByRole('link', { name: /\+ Stay/i }).click();
await page.getByLabel('Name', { exact: true }).fill('Hotel Bairro Alto');
await page.getByLabel('Address').fill('Praça Luís de Camões 2');
await page.locator('input[type=datetime-local]').first().fill('2026-09-10T15:00');
await page.locator('input[type=datetime-local]').nth(1).fill('2026-09-18T11:00');
await page.getByRole('button', { name: /^Add$/ }).click();
await page.waitForURL(/\/trips\/trp_[^/]+$/);

await page.getByRole('link', { name: /\+ Activity/i }).click();
await page.locator('select').first().selectOption('restaurant');
await page.getByLabel('Name', { exact: true }).fill('Cervejaria Ramiro');
await page.getByLabel('Where').fill('Av. Almirante Reis 1');
await page.locator('input[type=datetime-local]').first().fill('2026-09-10T20:30');
await page.getByRole('button', { name: /^Add$/ }).click();
await page.waitForURL(/\/trips\/trp_[^/]+$/);
await page.waitForLoadState('networkidle');
await shot(page, '10-timeline-full');

// --- trip list with content ---
await page.getByRole('link', { name: /Waypoint/ }).click();
await page.waitForLoadState('networkidle');
await shot(page, '11-trip-list');

// --- offline: the whole point of the cache ---
// Client-side navigation rather than a reload. The service worker is disabled
// in dev (devOptions.enabled = false), so a reload has no shell to load and
// fails before any of this code runs. Navigating within the SPA is what
// actually exercises the IndexedDB fallback; the service worker's own offline
// behaviour is checked against the production build separately.
await page.getByRole('link', { name: /Waypoint/ }).click();
await page.waitForLoadState('networkidle');
await page.context().setOffline(true);
await page.getByRole('link', { name: /Lisbon/ }).first().click();
await page.waitForTimeout(1500);
await shot(page, '12-offline-timeline');
await page.context().setOffline(false);

// --- desktop width, since a portfolio reviewer is on a laptop ---
const wide = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await wide.goto(`${BASE}/`);
await wide.waitForLoadState('networkidle');
await wide.screenshot({ path: `${SHOTS}/13-desktop.png`, fullPage: true });
console.log('  shot: 13-desktop');

console.log(errors.length ? `\nCONSOLE ERRORS:\n${errors.join('\n')}` : '\nNo console errors.');
await browser.close();
