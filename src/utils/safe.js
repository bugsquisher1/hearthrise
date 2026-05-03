// ============================================================
// src/utils/safe.js
//
// Defensive helpers — error boundaries, safe global calls, and a
// central registry for `window.showTab` taps so feature modules
// don't have to monkey-patch each other in undefined order.
//
// Why this exists:
//   • The codebase has 80+ instances of `if(typeof window.foo === 'function') window.foo()`.
//     This module collapses that pattern to `safeCall('foo', args)`.
//   • Eight feature modules independently wrap `window.showTab` to
//     register their own renderers. Errors in one wrapper break the
//     chain for every downstream wrapper. `wrapShowTab(name, fn)`
//     registers a tap with built-in try/catch isolation.
//   • Render functions that throw take down whole panels. `wrapRender`
//     catches, logs to Sentry via captureException, and renders a
//     friendly fallback message.
//
// All helpers are no-ops if the underlying global isn't available,
// so importing this module is safe at any point in boot.
// ============================================================

/**
 * Safely invoke a global function by name. No-op if the function
 * doesn't exist or throws — exceptions are routed to
 * `window.captureException` if available so Sentry still sees them.
 *
 * @example
 *   safeCall('notify', 'Saved.', 'info');
 *   safeCall('renderInvFancy');
 *
 * @param {string} fnName — global function name on `window`
 * @param  {...any} args — arguments to forward
 * @returns {any} the function's return value, or `undefined` on miss/error
 */
export function safeCall(fnName, ...args) {
  const fn = (typeof window !== 'undefined' && window[fnName]);
  if (typeof fn !== 'function') return undefined;
  try {
    return fn.apply(window, args);
  } catch (err) {
    if (typeof window.captureException === 'function') {
      try { window.captureException(err, { source: 'safeCall', fnName }); } catch (_) {}
    }
    return undefined;
  }
}

// ── showTab tap registry ────────────────────────────────────
// Feature modules use this instead of monkey-patching window.showTab
// directly. Each tap is invoked AFTER the original showTab returns,
// in registration order. Errors in one tap don't break others.

const _showTabTaps = new Map();
let _showTabInstalled = false;

function _ensureShowTabHook() {
  if (_showTabInstalled) return;
  if (typeof window === 'undefined' || typeof window.showTab !== 'function') return;
  const orig = window.showTab;
  window.showTab = function patchedShowTab(name) {
    let result;
    try { result = orig.apply(this, arguments); }
    catch (err) {
      if (typeof window.captureException === 'function') {
        try { window.captureException(err, { source: 'showTab', tab: name }); } catch (_) {}
      }
      throw err;          // re-raise — original showTab failure is real
    }
    _showTabTaps.forEach((tapFn, tapName) => {
      try { tapFn(name); }
      catch (err) {
        console.warn('[safe] showTab tap "' + tapName + '" threw:', err);
        if (typeof window.captureException === 'function') {
          try { window.captureException(err, { source: 'showTab-tap', tap: tapName, tab: name }); } catch (_) {}
        }
      }
    });
    return result;
  };
  _showTabInstalled = true;
}

/**
 * Register a callback that runs after every `showTab(name)` call.
 * Safer than monkey-patching `window.showTab` directly because:
 *   • errors in your tap don't break other taps;
 *   • registration order is deterministic;
 *   • taps are easy to remove (return value is an unsubscribe fn).
 *
 * @param {string} name — short label used in logs / unsubscription
 * @param {(tabName: string) => void} fn — runs after showTab completes
 * @returns {() => void} unsubscribe
 */
export function wrapShowTab(name, fn) {
  _ensureShowTabHook();
  if (!_showTabInstalled) {
    // showTab not yet defined — retry once after a tick
    setTimeout(() => wrapShowTab(name, fn), 100);
    return () => {};
  }
  _showTabTaps.set(name, fn);
  return () => _showTabTaps.delete(name);
}

/**
 * Wrap a render function so a thrown exception:
 *   1. doesn't propagate to the caller (caller stays alive),
 *   2. is reported via window.captureException,
 *   3. populates the target element with a friendly fallback so the
 *      player isn't staring at a blank panel.
 *
 * Use this for new render functions; legacy renderers can adopt it
 * gradually (zero behavior change if they never throw).
 *
 * @param {string} name — label for telemetry
 * @param {Function} fn — your render function
 * @param {{fallbackHostId?: string, fallbackText?: string}} [opts]
 * @returns {Function} wrapped function with the same signature
 */
export function wrapRender(name, fn, opts = {}) {
  return function wrappedRender(...args) {
    try {
      return fn.apply(this, args);
    } catch (err) {
      console.error('[safe] render "' + name + '" failed:', err);
      if (typeof window.captureException === 'function') {
        try { window.captureException(err, { source: 'render', renderer: name }); } catch (_) {}
      }
      const host = opts.fallbackHostId
        ? document.getElementById(opts.fallbackHostId)
        : null;
      if (host) {
        host.innerHTML = '<div style="padding:24px;color:#8a92a0;font-style:italic;text-align:center">'
          + (opts.fallbackText || 'This panel had a render issue. Reload to try again.')
          + '<br><small style="color:#6b7280">(see console for details)</small>'
          + '</div>';
      }
    }
  };
}

/**
 * Safely parse JSON from localStorage with a fallback.
 * Tolerates: missing key, malformed JSON, localStorage access denied.
 *
 * @template T
 * @param {string} key
 * @param {T} fallback
 * @returns {T}
 */
export function safeLoadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : parsed;
  } catch (err) {
    console.warn('[safe] safeLoadJson("' + key + '") failed:', err.message);
    return fallback;
  }
}

/**
 * Safely write JSON to localStorage. Returns true on success.
 * Tolerates: quota exceeded, storage disabled, etc.
 *
 * @param {string} key
 * @param {*} value
 * @returns {boolean}
 */
export function safeSaveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn('[safe] safeSaveJson("' + key + '") failed:', err.message);
    return false;
  }
}

// ── Classic-script bridge ────────────────────────────────────
if (typeof window !== 'undefined') {
  window.HearthriseSafe = {
    safeCall, wrapShowTab, wrapRender, safeLoadJson, safeSaveJson,
  };
}
