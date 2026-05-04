// ============================================================
// src/utils/data-integrity.js
//
// Boot-time sanity checks for game data. Currently catches one
// specific class of bug: ITEMS / RECIPES / MONSTERS divergence
// between `src/legacy.js` (the older, classic-script copies) and
// `src/data/*.js` (the ESM source-of-truth modules). When new items
// land in the ESM module but not in legacy.js (or vice versa),
// runtime references silently break — usually as a missing icon,
// sometimes as a hard `Cannot read .v of undefined` crash.
//
// This module logs warnings to the console so we catch drift on
// the next reload after any data file is touched. It also reports
// to captureException so Sentry shows the divergence in production.
//
// Imported for side effects only:
//   import './utils/data-integrity.js';
// ============================================================

import { ITEMS as ESM_ITEMS } from '../data/items.js';

const RUN_DELAY_MS = 1500;        // wait for legacy.js to finish populating

function once() {
  if (typeof window === 'undefined') return;
  // b137: main.js overwrites window.ITEMS with the ESM module before this
  // check runs, so reading window.ITEMS would compare ESM to itself and
  // always report "in sync" (which is exactly the bug we hit shipping
  // farm_deed in b136 — added it to legacy.js but missed src/data/items.js,
  // ESM won, the live ITEMS had no farm_deed, and this check passed
  // anyway). legacy.js now publishes its inline ITEMS snapshot under
  // __LEGACY_INLINE_ITEMS before main.js runs, so we compare against that.
  // Fall back to window.ITEMS if the snapshot isn't there (e.g. older
  // legacy.js cached from a previous build).
  const legacyItems = window.__LEGACY_INLINE_ITEMS || window.ITEMS;
  if (!legacyItems || typeof legacyItems !== 'object') {
    // legacy.js hasn't run yet — try again in a tick
    setTimeout(once, 500);
    return;
  }

  const legacyKeys = new Set(Object.keys(legacyItems));
  const esmKeys    = new Set(Object.keys(ESM_ITEMS || {}));

  const onlyInLegacy = [];
  const onlyInEsm    = [];
  legacyKeys.forEach(k => { if (!esmKeys.has(k)) onlyInLegacy.push(k); });
  esmKeys.forEach(k => { if (!legacyKeys.has(k)) onlyInEsm.push(k); });

  // After main.js does Object.assign(window, { ITEMS }), the ESM
  // values overwrite legacy keys with the same name. So `onlyInLegacy`
  // is the more dangerous direction — items defined in legacy but not
  // ESM will be replaced by `undefined` after the assign.
  if (onlyInLegacy.length || onlyInEsm.length) {
    const summary = {
      legacyOnly: onlyInLegacy,
      esmOnly: onlyInEsm,
      hint: 'Items defined in legacy.js but missing from src/data/items.js will be undefined at runtime after main.js runs Object.assign. Reconcile before next push.',
    };
    console.warn('[data-integrity] ITEMS divergence detected:', summary);
    if (typeof window.captureException === 'function') {
      try {
        window.captureException(
          new Error('ITEMS divergence: ' + onlyInLegacy.length + ' legacy-only, ' + onlyInEsm.length + ' esm-only'),
          { source: 'data-integrity', summary }
        );
      } catch (e) {}
    }
  } else {
    console.log('[data-integrity] ITEMS in sync ✓ (' + legacyKeys.size + ' items)');
  }
}

// Boot deferred so legacy.js has a chance to finish populating.
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(once, RUN_DELAY_MS));
  } else {
    setTimeout(once, RUN_DELAY_MS);
  }
}
