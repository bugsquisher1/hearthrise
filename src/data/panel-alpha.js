// ════════════════════════════════════════════════════════════════════════
// src/data/panel-alpha.js — THE WINDOW OPACITY SETTING'S RANGE (Tyler 2026-10-24:
// "I also like the idea of it being 'opaque' ... maybe we can do a slider bar in
// the settings for that").
//
// A whole percent: 100 is solid, 60 the floor. Below 60 the theme text over the
// town's grass and roofs starts to break up (measured on the 2026-10-24 skin
// mock, art/review/ui-skins-2026-10-24/). Read by the Settings row
// (src/data/settings.js), the residue sanitizer (src/session/residue.js) and the
// writer (src/shell/panel-alpha.js).
// ════════════════════════════════════════════════════════════════════════
export const PANEL_ALPHA = Object.freeze({ min: 60, max: 100, step: 5, initial: 100 });
