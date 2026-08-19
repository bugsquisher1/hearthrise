// src/utils/showtab-registry.js — single-owner showTab tap registry (classic script)
// ============================================================================
// The foundation for the controller-extraction phase and the Tier-2 test
// determinism fix. It replaces the ~24 independent `window.showTab = function`
// monkey-patches (each capturing the previous owner and racing the others'
// install order) with ONE owner — `patchedShowTab` — plus a Map of post-taps
// that run, in deterministic registration order, after the base showTab returns.
//
// WHY A CLASSIC SCRIPT LOADED EARLY (not src/utils/safe.js directly):
//   safe.js already ships this registry, but it is an ESM module pulled in by
//   main.js, which is `type="module"` and therefore DEFERRED — it runs AFTER
//   every classic <script> has already executed. The reassignment sites this
//   replaces are in classic scripts (legacy.js, observability.js, dungeons.js,
//   …) that run at PARSE time, when `window.HearthriseSafe` does not yet exist.
//   So the single owner must be installable from a classic script that loads
//   BEFORE legacy.js. This file is that seam; safe.js's exported `wrapShowTab`
//   delegates here so there is exactly ONE registry, one Map, one owner —
//   whether a caller reaches it from a classic script (`window.HearthriseShowTab`)
//   or an ESM import of `wrapShowTab` from the versioned `../utils/safe.js` module.
//
// The base `function showTab` (legacy.js) is `configurable:false` but WRITABLE,
// so the owner is installed by direct assignment (NOT Object.defineProperty /
// accessors, which would throw on a non-configurable property).
// ============================================================================
(function () {
  'use strict';
  if (window.HearthriseShowTab) return;   // idempotent — never double-install

  var taps = new Map();       // insertion order == registration order == run order
  var installed = false;

  // Install the single owner over the base showTab. Safe to call repeatedly;
  // returns true once the base function exists and the owner is in place.
  function install() {
    if (installed) return true;
    if (typeof window.showTab !== 'function') return false;   // base not declared yet
    var orig = window.showTab;
    var patched = function patchedShowTab(name) {
      var result;
      // The ORIGINAL showTab failing is a real error — surface it (after
      // reporting) exactly as before. Taps are additive and must not swallow it.
      try { result = orig.apply(this, arguments); }
      catch (err) {
        if (typeof window.captureException === 'function') {
          try { window.captureException(err, { source: 'showTab', tab: name }); } catch (_) {}
        }
        throw err;
      }
      // Post-taps: each runs isolated, so one throwing tap cannot freeze the
      // panels every other tap paints. Registration order is deterministic.
      taps.forEach(function (tapFn, tapName) {
        try { tapFn(name); }
        catch (err) {
          console.warn('[showtab-registry] tap "' + tapName + '" threw:', err);
          if (typeof window.captureException === 'function') {
            try { window.captureException(err, { source: 'showTab-tap', tap: tapName, tab: name }); } catch (_) {}
          }
        }
      });
      return result;
    };
    patched.__hearthriseRegistryOwner = true;
    window.showTab = patched;
    installed = true;
    return true;
  }

  // Register a post-tap. `name` is a stable label: re-registering the same label
  // REPLACES it (idempotent — a module that boots twice cannot stack its tap,
  // which the old `__fooTabHooked` guards existed to prevent). Returns an
  // unsubscribe fn. If the base showTab is not defined yet, the tap is stored
  // immediately (preserving order) and a short retry installs the owner once it
  // appears — so a classic script that loads before legacy.js still lands.
  function wrapShowTab(name, fn) {
    taps.set(name, fn);
    if (!install()) schedulePendingInstall();
    return function () { taps.delete(name); };
  }

  var pendingTimer = null;
  function schedulePendingInstall() {
    if (installed || pendingTimer != null) return;
    pendingTimer = setInterval(function () {
      if (install()) { clearInterval(pendingTimer); pendingTimer = null; }
    }, 40);
  }

  window.HearthriseShowTab = {
    install: install,
    wrapShowTab: wrapShowTab,
    _taps: taps,
    tapNames: function () { return Array.from(taps.keys()); },
  };
})();
