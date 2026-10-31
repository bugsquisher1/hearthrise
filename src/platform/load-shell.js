// ════════════════════════════════════════════════════════════════════════
// src/platform/load-shell.js — THE LOADING SHELL'S BAR (play.html .boot-shell).
//
// A classic script, the first thing in the body, so a slow first visit has a shell it believes in while the page's
// modules arrive: the bar is how many of the modules this page preloads have landed (their resource timings), and a
// module that could not load says so rather than leaving the wait to run for ever. boot.js removes the shell with the
// first screen; nothing here runs after that. No game state, no storage.
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
  /* a script of this page's own that did not load (resource errors do not bubble: captured) */
  win.addEventListener('error', function (e) {
    var t = e.target;
    if (failed || !t || !shell.parentNode || (t.tagName !== 'SCRIPT' && t.tagName !== 'LINK')) return;
    var url = t.src || t.href || '';
    if (url.indexOf(win.location.origin) !== 0 || !/\.js(\?|$)/.test(url)) return;
    failed = true;
    if (line) line.textContent = 'Hearthrise could not finish loading. Check your connection and reload the page.';
  }, true);
})(window);
