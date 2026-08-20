// ============================================================
// src/theme-picker.js
//
// Theme controller v2 — replaces the legacy Day/Night toggle in
// src/legacy.js (which is hidden via .lane1-toggle{display:none}
// in theme-cozy.css).
//
// One live theme:
//   • hearthlight (candle-lit dark) — the only selectable look.
//   cozy-light / cozy-dark / classic are retired; readSaved() maps any stale
//   stored id back to hearthlight (see the migration note there).
//
// Persists to localStorage('hearthrise:theme').
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
    // Single theme — always Hearthlight, regardless of any old saved choice.
    // This is ALSO the cozy-light retirement migration (b414): a player whose
    // localStorage still holds 'cozy-light' (or 'cozy-dark'/'classic') is
    // silently and safely moved to Hearthlight here — nothing downstream ever
    // sees the stale value, so no one is left themeless or on a deleted theme.
    return 'hearthlight';
  }

  function applyTheme(id) {
    // cozy-light (the old no-attribute default) is retired; every live theme is
    // attribute-scoped now. Normalise any legacy/unknown id to Hearthlight so
    // the body is never left without a data-theme (which would resurrect the
    // dead cozy-light default cascade).
    if (!id || id === 'cozy-light') id = 'hearthlight';
    document.body.setAttribute('data-theme', id);
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
