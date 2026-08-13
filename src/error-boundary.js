// ============================================================
// src/error-boundary.js
//
// Wraps the engine's main render functions in try/catch so a thrown
// exception in one panel can't blank the whole UI. The broken panel
// shows a friendly fallback ("Something went wrong here — try
// reloading") and the rest of the game keeps working.
//
// Targets the global functions defined in legacy.js (and, for
// renderCharacter, src/features/character-page.js).
//
// Each thrown error is also fed to window.captureException (Sentry)
// so we get a full stack trace in our crash reporter.
//
// b334 — TARGETS USED TO LIE. It listed `render`, `renderSkills` and
// `switchTab`; none of the three has ever been a global in this codebase
// (`render` is a local inside a dozen feature IIFEs, the skills panel is
// painted by renderSkillDetail/renderActivities, and tab switching is
// showTab). The count printed below said "×11" — of 14 — and nobody read it
// as "3 of my targets do not exist", because the message did not say what
// the denominator was or which names were missing. Both are now in the line,
// so a target that goes stale reports itself instead of hiding in an
// unexplained shortfall. See also the two dead `window.render()` call sites
// removed in src/net/auth.js and src/settings-page.js: a `typeof === 'function'`
// guard around a name that never exists is invisible forever.
// ============================================================

(function(){
  'use strict';
  if (window.HearthriseErrorBoundary) return;

  const TARGETS = [
    'refreshAll',
    'renderProfile', 'renderCharacter', 'renderCombat',
    'renderInventory', 'renderFarm', 'renderHouse', 'renderSocial',
    'renderShop', 'renderSkillDetail', 'renderActivities',
    'showTab',
  ];

  function fallbackInto(panel, name, err) {
    if (!panel || !panel.innerHTML) return;
    panel.innerHTML = ''
      + '<div style="padding:24px;text-align:center;color:#9aa3b0;font-family:system-ui,sans-serif">'
      +   '<div style="font-size:calc(33px * var(--ui-scale, 1));margin-bottom:8px">⚠️</div>'
      +   '<div style="color:#dfe9ee;font-weight:600;margin-bottom:4px">Something broke here</div>'
      +   '<div style="font-size:calc(14.5px * var(--ui-scale, 1));margin-bottom:12px">The rest of the game still works. We\'ve logged the error.</div>'
      +   '<button onclick="location.reload()" style="padding:6px 14px;background:#f3d181;color:#0f1320;border:none;border-radius:4px;font-weight:600;cursor:pointer">Reload</button>'
      +   '<div style="font-size:calc(14.5px * var(--ui-scale, 1));color:#5a6470;margin-top:12px;font-family:monospace">' + escapeHtml(name + ': ' + (err?.message || 'unknown')) + '</div>'
      + '</div>';
  }
  function escapeHtml(s){
    return String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'})[c]);
  }

  function wrap(fnName) {
    const orig = window[fnName];
    if (typeof orig !== 'function' || orig.__hrWrapped) return false;
    const wrapped = function(...args) {
      try {
        return orig.apply(this, args);
      } catch (e) {
        console.error('[error-boundary]', fnName, 'threw:', e);
        try { window.captureException && window.captureException(e, { tag: fnName }); } catch {}
        // Best-effort: try to recover by showing fallback in the active panel
        const active = document.querySelector('.panel.active');
        fallbackInto(active, fnName, e);
        return null;
      }
    };
    wrapped.__hrWrapped = true;
    window[fnName] = wrapped;
    return true;
  }

  function wrapAll() {
    let n = 0;
    for (const t of TARGETS) if (wrap(t)) n++;
    return n;
  }

  // Engine functions are defined in legacy.js, which loads as classic script.
  // Wrap as soon as we can — try a few times to catch late definitions.
  //
  // b334 — `wrapped` used to be the PER-TICK delta, and wrap() returns false
  // for anything already carrying __hrWrapped. So every tick after the first
  // reported 0 no matter how many functions were protected: the one number
  // that would have exposed the runaway interval below was structurally
  // incapable of being anything but 0. `total` is cumulative, and `stopped`
  // means the line is printed exactly once per page load even if the cancel
  // itself is lost (which is precisely what the core-ready gate was doing to
  // it — see src/core-ready.js release()). `stats.ticksAfterStop` is the
  // witness for that: it is 0 iff the interval genuinely died.
  let attempts = 0, total = 0, stopped = false;
  const stats = { ticks: 0, ticksAfterStop: 0, logs: 0, wrapped: 0, missing: [] };

  const tick = setInterval(() => {
    stats.ticks++;
    if (stopped) { stats.ticksAfterStop++; return; }
    total += wrapAll();
    stats.wrapped = total;
    attempts++;
    if (attempts > 30 || total >= TARGETS.length / 2) {
      stopped = true;
      clearInterval(tick);
      stats.missing = TARGETS.filter((t) => typeof window[t] !== 'function');
      stats.logs++;
      console.log('[error-boundary] wrapped ' + total + '/' + TARGETS.length + ' render functions'
        + (stats.missing.length ? ' — NOT DEFINED: ' + stats.missing.join(', ') : ''));
    }
  }, 200);

  window.HearthriseErrorBoundary = { wrapAll, wrap, stats, TARGETS };
})();
