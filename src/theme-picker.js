// ============================================================
// src/theme-picker.js
//
// Applies the one live theme. Hearthlight (candle-lit dark) is the only look
// (b174, Tyler's call); every themed rule keys on `body[data-theme]`, so this
// runs first in <body> to stamp the attribute before paint (no FOUC).
//
// There is no picker and no stored choice any more (2026-10-08): the Settings
// "Theme" row offered exactly one card, and the old setTheme/list API had no
// caller but that row. A second theme is a design decision, not a toggle to
// keep warm.
// ============================================================

(function(){
  'use strict';
  document.body.setAttribute('data-theme', 'hearthlight');
})();
