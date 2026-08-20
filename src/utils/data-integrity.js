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
//   import './utils/data-integrity.js?v=413';
// ============================================================

import { ITEMS as ESM_ITEMS } from '../data/items.js?v=413';

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

  // b214: check MONSTERS too. This module only ever compared ITEMS, which is
  // precisely why `mountain_troll` shipped defined in legacy.js but missing
  // from src/data/monsters.js — every ESM reader saw `undefined` for it and
  // nothing warned. Each data set gets the same legacy-vs-ESM comparison.
  const SETS = [
    { name: 'ITEMS',    legacy: legacyItems,                    esm: ESM_ITEMS,
      hint: 'Items defined in legacy.js but missing from src/data/items.js will be undefined at runtime after main.js runs Object.assign. Reconcile before next push.' },
  ];

  /* b356: the MONSTERS set-comparison was REMOVED, and replaced with the
     check below, because it could never fire. `__LEGACY_INLINE_MONSTERS` is
     a REFERENCE to the object main.js merges the ESM data into — so this
     module was comparing the merged roster against itself and reporting
     "in sync ✓" unconditionally. (Same aliasing defect on the ITEMS side;
     that one is left in place because reconciling the inline ITEMS literal
     is its own change, and set-comparison there is at least not actively
     misleading about a divergence it did once catch.)

     legacy.js no longer declares a roster: `const MONSTERS={}` starts empty
     and main.js fills it. The invariant worth guarding is therefore not
     "the two copies agree" but "there is only one copy", and that is a
     COUNT captured eagerly at publish time — a number, immune to the merge. */
  const inlineMonsters = window.__LEGACY_INLINE_MONSTER_COUNT;
  if (typeof inlineMonsters === 'number' && inlineMonsters > 0) {
    const msg = 'legacy.js re-declared ' + inlineMonsters + ' monsters. '
      + 'src/data/monsters.js is the only roster; a second copy silently drifts '
      + '(b342 measured 14 of 31 entries diverged, deleting two live drops).';
    console.warn('[data-integrity] MONSTERS double-copy: ' + msg);
    if (typeof window.captureException === 'function') {
      try { window.captureException(new Error('MONSTERS double-copy'), { source: 'data-integrity', count: inlineMonsters }); } catch (e) {}
    }
  }

  SETS.forEach(set => {
    if (!set.legacy || typeof set.legacy !== 'object') return;  // snapshot not published yet
    const legacyKeys = new Set(Object.keys(set.legacy));
    const esmKeys    = new Set(Object.keys(set.esm || {}));

    const onlyInLegacy = [];
    const onlyInEsm    = [];
    legacyKeys.forEach(k => { if (!esmKeys.has(k)) onlyInLegacy.push(k); });
    esmKeys.forEach(k => { if (!legacyKeys.has(k)) onlyInEsm.push(k); });

    // After main.js does Object.assign(window, { ... }), the ESM values
    // overwrite legacy keys with the same name. So `onlyInLegacy` is the
    // more dangerous direction — those become undefined for ESM readers.
    if (onlyInLegacy.length || onlyInEsm.length) {
      const summary = { legacyOnly: onlyInLegacy, esmOnly: onlyInEsm, hint: set.hint };
      console.warn('[data-integrity] ' + set.name + ' divergence detected:', summary);
      if (typeof window.captureException === 'function') {
        try {
          window.captureException(
            new Error(set.name + ' divergence: ' + onlyInLegacy.length + ' legacy-only, ' + onlyInEsm.length + ' esm-only'),
            { source: 'data-integrity', summary }
          );
        } catch (e) {}
      }
    } else {
      console.log('[data-integrity] ' + set.name + ' in sync ✓ (' + legacyKeys.size + ')');
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
