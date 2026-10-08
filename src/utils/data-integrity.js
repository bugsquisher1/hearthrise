// ============================================================
// src/utils/data-integrity.js
//
// Boot-time check that legacy.js declares NO second copy of the game data.
// src/data/*.js is the only authored copy; main.js merges it into legacy.js's
// (empty) ITEMS / MONSTERS bindings in place. legacy.js publishes an
// eagerly-evaluated COUNT of what it declared itself — a number, so the merge
// cannot rewrite it — and a non-zero count is a second copy drifting.
// (The old set-comparison read a REFERENCE to the merged object and so could
// only ever compare the data against itself.) The static half of this rule is
// tests/legacy-data-onecopy.mjs.
//
// Imported for side effects only:
//   import './utils/data-integrity.js?v=564';
// ============================================================

const RUN_DELAY_MS = 1500;        // wait for legacy.js to finish populating

const COPIES = [
  { name: 'ITEMS', count: '__LEGACY_INLINE_ITEM_COUNT', truth: 'src/data/items.js' },
  { name: 'MONSTERS', count: '__LEGACY_INLINE_MONSTER_COUNT', truth: 'src/data/monsters.js' },
];

function once() {
  if (typeof window === 'undefined') return;
  COPIES.forEach((c) => {
    const n = window[c.count];
    if (typeof n !== 'number' || n === 0) return;
    const msg = 'legacy.js re-declared ' + n + ' ' + c.name + ' entries. ' + c.truth
      + ' is the only copy; a second one silently drifts (b342 measured 14 of 31 monsters '
      + 'diverged; the item copy disagreed in 19 values when it was cut).';
    console.warn('[data-integrity] ' + c.name + ' double-copy: ' + msg);
    if (typeof window.captureException === 'function') {
      try { window.captureException(new Error(c.name + ' double-copy'), { source: 'data-integrity', count: n }); } catch (e) {}
    }
  });
}

// Boot deferred so legacy.js has a chance to finish populating.
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(once, RUN_DELAY_MS));
  } else {
    setTimeout(once, RUN_DELAY_MS);
  }
}
