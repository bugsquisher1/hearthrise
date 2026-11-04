/* src/platform/sw-killswitch.js — THE EMERGENCY BRAKE ON SERVICE WORKERS AND CACHES, AND THE ONE PLACE A WORKER IS REGISTERED.
 *
 * A classic script, loaded early in <head> by every page, and never served by the worker it brakes (sw.js).
 *
 * The one worker this site runs is /sw.js at a version query (tests/return-load.mjs), on the production origin, for play.html only. It
 * is registered once the page has loaded, and its cache `hearthrise-<version>` is deleted by the next release's worker, with no reload.
 *
 * Anything else is wiped: a worker that is not ours (the old client's served stale HTML), a cache not named by a version, or either of
 * them on any other origin, so the in-page suites and tools/qa/local-world.mjs run with no worker at all. Wiping deletes every cache,
 * unregisters every worker and reloads ONCE (a sessionStorage flag stops loops); that tab then runs with no worker until it closes.
 *
 * Manual reset: append `?reset-sw=1` to the URL.
 * For every player at once: a release with WORKER_ON = false. A page's HTML is never the worker's and a new version's files are not in
 * its cache, so this file reaches everyone on their next page load.
 *
 * BUILD is read from the `?v=` on this page's own versioned tags. */
(function () {
  if (!('serviceWorker' in navigator) || !('caches' in window)) return;
  var WORKER_ON = true;
  var WORKER_ORIGIN = 'https://hearthrise.net';
  var OUR_WORKER = /\/sw\.js\?v=\d+\.\d+\.\d+$/;
  var OUR_CACHE = /^hearthrise-\d+\.\d+\.\d+$/;
  var purged = sessionStorage.getItem('hr-sw-purged') === '1';
  var BUILD = (function () {
    var tags = document.querySelectorAll('link[href*="?v="], script[src*="?v="]');
    for (var i = 0; i < tags.length; i++) {
      var m = (tags[i].href || tags[i].src || '').match(/\?v=(\d[\d.]*)/);
      if (m) return m[1];
    }
    return '0';
  })();
  var manual = /[?&]reset-sw=1\b/.test(location.search);
  var allowed = WORKER_ON && location.origin === WORKER_ORIGIN;

  function wipe() {
    return Promise.all([
      caches.keys().then(function (keys) { return Promise.all(keys.map(function (k) { return caches.delete(k); })); }),
      navigator.serviceWorker.getRegistrations().then(function (regs) { return Promise.all(regs.map(function (r) { return r.unregister(); })); }),
    ]);
  }

  function nuke(reason) {
    wipe().then(function () {
      sessionStorage.setItem('hr-sw-purged', '1');
      console.info('[hr-sw-killswitch] purged caches + SW (' + reason + '); reloading once');
      var clean = location.pathname + location.search.replace(/[?&]reset-sw=1\b/, '').replace(/^&/, '?') + location.hash;
      location.replace(clean || location.pathname);
    }).catch(function (e) { console.warn('[hr-sw-killswitch] purge failed:', e); });
  }

  function ours(reg) {
    var w = reg.active || reg.waiting || reg.installing;
    return allowed && !!w && OUR_WORKER.test(w.scriptURL);
  }

  function register() {
    navigator.serviceWorker.register('sw.js?v=' + BUILD, { scope: 'play.html' }).catch(function (e) { console.warn('[hr-sw-killswitch] no worker this visit:', e); });
  }

  if (manual && !purged) { nuke('manual ?reset-sw=1'); return; }
  /* What the worker wrote while the wipe ran goes too; the worker itself went with the wipe. */
  if (purged) { wipe().catch(function () {}); return; }
  navigator.serviceWorker.getRegistrations().then(function (regs) {
    if (!regs.every(ours)) { nuke('a service worker that is not this site\'s is registered'); return; }
    return caches.keys().then(function (keys) {
      var stale = keys.some(function (k) { return /^(hearthrise|hearthbound)-/.test(k) && !(allowed && OUR_CACHE.test(k)); });
      if (stale) { nuke('caches that are not this site\'s: ' + keys.join(', ')); return; }
      if (!allowed || !/\/play\.html$/.test(location.pathname)) return;
      if (document.readyState === 'complete') register(); else window.addEventListener('load', register);
    });
  }).catch(function () {});
})();
