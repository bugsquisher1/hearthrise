// ════════════════════════════════════════════════════════════════════════
// src/platform/load-shell.js — THE LOADING SHELL'S BAR (play.html .boot-shell).
//
// A classic script, the first thing in the body, so a slow first visit has a shell it believes in while the page's
// modules arrive: the bar is how many of the modules this page preloads have landed (their resource timings). boot.js
// removes the shell with the first screen; nothing here watches after that.
//
// ONE FILE NEVER DECIDES THE PAGE (live v0.2.83: float-menu.js answered 503 once, of some 240 files, and the page stopped until
// a reload). A new `?v=` means CDN misses on the origin, so this falls hardest on first visitors. A module that failed stays
// failed in the page's module map, so only a new page load helps: the page reloads by itself after a short pause, at most
// RETRY_PAUSES.length times per release in this tab, and only then says so, with a Reload press. The count goes through the
// platform seam's tab store and is spent before the reload; no store to count in, or no network at all, and it does not reload,
// so it can never loop. Files of this site only, never a third party's. No game state.
// ════════════════════════════════════════════════════════════════════════
(function loadShell(win) {
  var doc = win.document;
  var shell = doc.querySelector('.boot-shell');
  if (!shell) return;
  var fill = shell.querySelector('.boot-shell-fill');
  var line = shell.querySelector('.boot-shell-line');
  var total = doc.querySelectorAll('link[rel="modulepreload"]').length;
  var landed = 0;
  var failed = false;
  var RETRY_KEY = 'hr.loadRetry';                // "<release>:<reloads spent>", in the tab store
  var RETRY_PAUSES = [800, 2500];                // ms before each reload: the origin gets a moment to answer
  var script = doc.currentScript;
  var release = (/[?&]v=([^&#]+)/.exec((script && script.src) || '') || [])[1] || '';

  /* The pause before one more reload, counted now, or null when this tab has none left for this release (or cannot count). */
  function spendRetry() {
    try {
      var tab = win.HearthriseStorage && win.HearthriseStorage.session;
      if (!tab || win.navigator.onLine === false) return null;
      var was = String(tab.get(RETRY_KEY) || '').split(':');
      var spent = was[0] === release ? Number(was[1]) || 0 : 0;
      if (spent >= RETRY_PAUSES.length) return null;
      return tab.set(RETRY_KEY, release + ':' + (spent + 1), { durable: true }) === true ? RETRY_PAUSES[spent] : null;
    } catch (e) { return null; }
  }

  function sayFailed() {
    if (line) line.textContent = 'Hearthrise could not finish loading. Check your connection and reload the page.';
    if (shell.querySelector('.boot-shell-again')) return;
    var bar = shell.querySelector('.boot-shell-bar');
    if (bar) bar.hidden = true;   // nothing is on its way now
    var again = doc.createElement('button');
    again.type = 'button';
    again.className = 'boot-shell-again';
    again.textContent = 'Reload';
    again.addEventListener('click', function () { win.location.reload(); });
    shell.appendChild(again);
  }

  /* A file of the page's own failed behind the first screen (the World's, world-pane.js): the same second go. True when the page is about to reload. */
  win.HearthriseRetryLoad = function () {
    var pause = spendRetry();
    if (pause === null) return false;
    win.setTimeout(function () { win.location.reload(); }, pause);
    return true;
  };
  /* Those goes spent with the shell still up (boot.js: the game's files behind a reload that signs back in): the words and the press. */
  win.HearthriseLoadFailed = sayFailed;

  /* With the first screen up nothing is reloaded under the player: the file's own failure (an import) answers for it later. */
  function failedNow() {
    if (!shell.parentNode) return;
    if (!win.HearthriseRetryLoad()) sayFailed();
  }

  function paint() { if (fill && total) fill.style.width = Math.min(100, Math.round(landed / total * 100)) + '%'; }
  try {
    var watching = new win.PerformanceObserver(function (list) {
      if (!shell.parentNode) { watching.disconnect(); return; }   // the first screen has taken over
      var entries = list.getEntries();
      for (var i = 0; i < entries.length; i++) if (/\.js(\?|$)/.test(entries[i].name)) landed++;
      paint();
    });
    watching.observe({ type: 'resource', buffered: true });
  } catch (e) { /* no observer here: the words alone say it is loading */ }
  /* A script of this page's own that did not load (resource errors do not bubble: captured): a modulepreload link, a classic
     script, or the entry module, whose script fails when any file of its graph does. The store it counts in may still be on its
     way when a preload fails this early: the verdict waits for the page to finish parsing. */
  win.addEventListener('error', function (e) {
    var t = e.target;
    if (failed || !t || !shell.parentNode || (t.tagName !== 'SCRIPT' && t.tagName !== 'LINK')) return;
    var url = t.src || t.href || '';
    if (url.indexOf(win.location.origin) !== 0 || !/\.js(\?|$)/.test(url)) return;
    failed = true;
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', failedNow); else failedNow();
  }, true);
})(window);
