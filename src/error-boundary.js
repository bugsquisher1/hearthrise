// ============================================================
// src/error-boundary.js
//
// Wraps the engine's main render functions in try/catch so a thrown
// exception in one panel can't blank the whole UI. The broken panel
// shows a friendly fallback ("Something went wrong here — try
// reloading") and the rest of the game keeps working.
//
// Targets the global functions defined in legacy.js:
//   render, renderProfile, renderCharacter, renderCombat,
//   renderSkills, renderInventory, renderHouse, renderFarm,
//   renderSocial, renderShop, renderSkillDetail, etc.
//
// Each thrown error is also fed to window.captureException (Sentry)
// so we get a full stack trace in our crash reporter.
// ============================================================

(function(){
  'use strict';
  if (window.HearthriseErrorBoundary) return;

  const TARGETS = [
    'render',
    'renderProfile', 'renderCharacter', 'renderCombat', 'renderSkills',
    'renderInventory', 'renderFarm', 'renderHouse', 'renderSocial',
    'renderShop', 'renderSkillDetail', 'renderActivities',
    'showTab', 'switchTab',
  ];

  function fallbackInto(panel, name, err) {
    if (!panel || !panel.innerHTML) return;
    panel.innerHTML = ''
      + '<div style="padding:24px;text-align:center;color:#9aa3b0;font-family:system-ui,sans-serif">'
      +   '<div style="font-size:32px;margin-bottom:8px">⚠️</div>'
      +   '<div style="color:#dfe9ee;font-weight:600;margin-bottom:4px">Something broke here</div>'
      +   '<div style="font-size:12px;margin-bottom:12px">The rest of the game still works. We\'ve logged the error.</div>'
      +   '<button onclick="location.reload()" style="padding:6px 14px;background:#f3d181;color:#0f1320;border:none;border-radius:4px;font-weight:600;cursor:pointer">Reload</button>'
      +   '<div style="font-size:10px;color:#5a6470;margin-top:12px;font-family:monospace">' + escapeHtml(name + ': ' + (err?.message || 'unknown')) + '</div>'
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
  let attempts = 0;
  const tick = setInterval(() => {
    const wrapped = wrapAll();
    attempts++;
    if (attempts > 30 || wrapped >= TARGETS.length / 2) {
      clearInterval(tick);
      console.log('[error-boundary] wrapped render functions ×' + wrapped);
    }
  }, 200);

  window.HearthriseErrorBoundary = { wrapAll, wrap };
})();
