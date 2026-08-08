// ============================================================
// src/theme-picker.js
//
// Theme controller v2 — replaces the legacy Day/Night toggle in
// src/legacy.js (which is hidden via .lane1-toggle{display:none}
// in theme-cozy.css).
//
// Three themes:
//   • cozy-light  (default)
//   • cozy-dark
//   • classic     (RuneScape direction, beta toggle)
//
// Persists to localStorage('hearthrise:theme'). Migrates legacy
// 'hb_theme' values: 'cozy' → 'cozy-light', 'dark' → 'cozy-dark'.
//
// Public API:
//   window.HearthriseTheme.setTheme('cozy-light' | 'cozy-dark' | 'classic')
//   window.HearthriseTheme.getTheme()
//   window.HearthriseTheme.list() → array of {id, label, desc}
//
// Analytics: every change emits a 'theme:changed' event so we
// can measure beta-tester preference (especially Classic vs
// Cozy adoption).
// ============================================================

(function(){
  'use strict';
  const KEY = 'hearthrise:theme';
  const LEGACY_KEY = 'hb_theme';

  // b174: ONE theme for launch. Tyler's call — maintaining a light + dark look is
  // wasted effort pre-launch, so Hearthlight (deep warm dark + gilt) is now the
  // single visual theme. The retired themes are kept here (commented) so they can
  // be re-enabled later without rebuilding the controller.
  const THEMES = [
    { id: 'hearthlight', label: 'Hearthlight', desc: 'Candle-lit hall — deep warm dark + gilt' },
    // { id: 'cozy-light',  label: 'Cozy Day',    desc: 'Warm parchment, forest green, gold' },
    // { id: 'cozy-dark',   label: 'Cozy Night',  desc: 'Hearth-lit chocolate + parchment text' },
    // { id: 'classic',     label: 'Classic',     desc: 'Stone + brass utility (beta)' },
  ];

  function readSaved() {
    // Single theme for now — always Hearthlight, regardless of any old saved
    // choice (existing testers move to the one look too).
    return 'hearthlight';
  }

  function applyTheme(id) {
    if (id === 'cozy-light') {
      document.body.removeAttribute('data-theme');
    } else {
      document.body.setAttribute('data-theme', id);
    }
  }

  function setTheme(id) {
    if (!THEMES.find(t => t.id === id)) return;
    try { localStorage.setItem(KEY, id); } catch {}
    applyTheme(id);
    // Analytics breadcrumb so we can measure beta tester preference
    try {
      if (typeof window.captureEvent === 'function') {
        window.captureEvent('theme:changed', { theme: id });
      }
    } catch {}
    // Trigger re-render of any open settings panel so the active state updates
    try { if (typeof window.renderSettings === 'function') window.renderSettings(); } catch {}
  }

  function getTheme() { return readSaved(); }
  function list() { return THEMES.slice(); }

  // ── Boot — apply theme as early as possible to avoid flash ──
  applyTheme(readSaved());

  window.HearthriseTheme = { setTheme, getTheme, list };
})();
