/**
 * Reloading the page when a new build takes over.
 *
 * `vite-plugin-pwa`'s `registerType: 'autoUpdate'` only auto-updates the
 * *worker*. The generated `registerSW.js` is one line — it registers `/sw.js`
 * and nothing else. Our worker does call `skipWaiting()` and `clients.claim()`,
 * so a new build activates immediately, but the page already running keeps the
 * JavaScript it downloaded when it opened. Nothing reloads it.
 *
 * On an installed PWA — which is the point of this app, and which iOS keeps
 * warm for days — that means a user can sit on a build from last week while the
 * server has moved on. It is how a fix that was verifiably deployed still was
 * not what David was looking at.
 *
 * The trade-off is a reload that can interrupt a half-typed form. That is a
 * small, rare loss; running old client code against a moved-on server is a
 * larger one, and it is silent.
 */
export function reloadOnNewVersion(reload: () => void = () => window.location.reload()) {
  if (!('serviceWorker' in navigator)) return;

  /*
   * Only an *update* should reload. On a first visit the page starts
   * uncontrolled and `clients.claim()` fires the same event, which would
   * reload every new visitor once for nothing.
   */
  if (navigator.serviceWorker.controller === null) return;

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    reload();
  });
}
