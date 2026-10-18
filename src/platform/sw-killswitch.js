/* src/platform/sw-killswitch.js — THE b124 SERVICE-WORKER + CACHE RESET.
 *
 * A classic script, loaded FIRST in <head> by every page. The old client
 * registered a service worker that cached its shell under `hearthrise-<build>`;
 * a browser that still holds one can serve stale HTML. When a `hearthrise-*` /
 * `hearthbound-*` cache does not equal the build this page was served at, or any
 * service worker is still registered (no page registers one any more), every
 * cache is deleted, every service worker is unregistered, and the page reloads
 * ONCE (a sessionStorage flag stops loops).
 *
 * BUILD is read from the `?v=` on this page's own versioned tags.
 * Manual reset: append `?reset-sw=1` to the URL. */
(function () {
  if (!('serviceWorker' in navigator) || !('caches' in window)) return;
  var purged = sessionStorage.getItem('hr-sw-purged') === '1';
  var BUILD = (function () {
    var tags = document.querySelectorAll('link[href*="?v="], script[src*="?v="]');
    for (var i = 0; i < tags.length; i++) {
      var m = (tags[i].href || tags[i].src || '').match(/\?v=(\d[\d.]*)/);
      if (m) return m[1];
    }
    return '0';
  })();
  var EXPECTED = 'hearthrise-' + BUILD;
  var manual = /[?&]reset-sw=1\b/.test(location.search);

  function nuke(reason) {
    Promise.all([
      caches.keys().then(function (keys) { return Promise.all(keys.map(function (k) { return caches.delete(k); })); }),
      navigator.serviceWorker.getRegistrations().then(function (regs) { return Promise.all(regs.map(function (r) { return r.unregister(); })); }),
    ]).then(function () {
      sessionStorage.setItem('hr-sw-purged', '1');
      console.info('[hr-sw-killswitch] purged caches + SW (' + reason + '); reloading once');
      var clean = location.pathname + location.search.replace(/[?&]reset-sw=1\b/, '').replace(/^&/, '?') + location.hash;
      location.replace(clean || location.pathname);
    }).catch(function (e) { console.warn('[hr-sw-killswitch] purge failed:', e); });
  }

  if (manual && !purged) { nuke('manual ?reset-sw=1'); return; }
  if (purged) return;
  navigator.serviceWorker.getRegistrations().then(function (regs) {
    if (regs.length) { nuke('a service worker is still registered'); return; }
    return caches.keys().then(function (keys) {
      var stale = keys.some(function (k) { return k !== EXPECTED && (/^hearthrise-/.test(k) || /^hearthbound-/.test(k)); });
      if (stale) nuke('stale caches: ' + keys.join(', ') + ' (expected ' + EXPECTED + ')');
    });
  }).catch(function () {});
})();
