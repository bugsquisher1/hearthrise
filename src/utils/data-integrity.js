// ============================================================
// src/utils/data-integrity.js
//
// Boot-time sanity check for game data: THERE IS ONE COPY OF EVERY AUTHORED
// TABLE. src/data/*.js is the only author; src/legacy.js keeps empty bindings
// (ITEMS, MONSTERS, SKILLS_DEF, TREES, ROCKS, FISH_SPOTS, CROPS) that main.js
// fills from the ESM modules, so the engine's bare references and the ESM data
// are one identity.
//
// History, because it explains the shape: this module used to diff the
// legacy.js literal against the ESM module by key set. The legacy snapshot was
// published by REFERENCE, so after main.js merged into it the check compared
// the merged object against itself and could never fire (the b214 troll_hide
// divergence sat live and silent). b356 removed the MONSTERS literal and
// replaced the diff with an eager COUNT that must be 0; W0 (2026-10-10) did the
// same for every other table. A non-zero count means a second copy is back.
//
// Logs a console warning and reports to captureException so Sentry sees a
// regression in production. The in-page guards are MON-ONECOPY-1 and
// LEGACY-ONECOPY-1.
//
// Imported for side effects only:
//   import './utils/data-integrity.js?v=564';
// ============================================================

const RUN_DELAY_MS = 1500;        // wait for legacy.js to finish publishing

function report(name, count) {
  const msg = 'legacy.js re-declared ' + count + ' ' + name + ' entries. src/data/* is the only '
    + 'author; a second copy silently drifts (b342 measured 14 of 31 monsters diverging).';
  console.warn('[data-integrity] ' + name + ' double-copy: ' + msg);
  if (typeof window.captureException === 'function') {
    try { window.captureException(new Error(name + ' double-copy'), { source: 'data-integrity', count }); } catch (e) {}
  }
}

function once() {
  if (typeof window === 'undefined') return;
  const counts = Object.assign({}, window.__LEGACY_INLINE_COUNTS || {});
  if (typeof window.__LEGACY_INLINE_MONSTER_COUNT === 'number') counts.MONSTERS = window.__LEGACY_INLINE_MONSTER_COUNT;
  Object.keys(counts).forEach((name) => {
    if (typeof counts[name] === 'number' && counts[name] > 0) report(name, counts[name]);
  });
}

// Boot deferred so legacy.js has a chance to finish publishing.
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(once, RUN_DELAY_MS));
  } else {
    setTimeout(once, RUN_DELAY_MS);
  }
}
