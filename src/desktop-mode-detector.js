// ============================================================
// src/desktop-mode-detector.js
//
// b294 — "everything is a jumbled mess on one phone" detector.
//
// When a mobile browser has "Desktop site" toggled on, it ignores our
// `width=device-width` viewport and lays the page out at ~980 CSS px,
// then shrinks it to fit the physical screen. The result is that EVERY
// layout collapses at once — the classic "the whole UI is jumbled"
// report — because our mobile media query (max-width:540px) never fires
// and the desktop grid is crushed into a phone. paione (Ulefone Armour
// 27T) hit exactly this; the hardware is a normal ~393px Android viewport,
// so the cause is the rendering context, not the device.
//
// This is a DETECTOR, not a layout fix: we can't force a browser out of
// desktop mode from script. So we surface a plain, dismissible banner
// telling the player how to turn it off — which is the actual fix.
//
// The banner is drawn with fully INLINE styles and a max z-index, on
// purpose: the whole premise is that the page's own CSS is mislaid, so it
// must not depend on any stylesheet, token, or media query to be legible.
// ============================================================
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var DISMISS_KEY = 'hr_desktopModeBannerDismissed';

  // ── The signal ──────────────────────────────────────────────
  // A touch device whose LAYOUT viewport is desktop-wide is the signature
  // of "Desktop site". We corroborate with two independent tells so a real
  // touch laptop or a large tablet doesn't trip it:
  //   • the UA has been stripped of its mobile marker (Chrome desktop-mode
  //     swaps the Android/Mobile UA for a desktop one), OR
  //   • devicePixelRatio has collapsed to ~1 (a real phone renders at 2.5-3.5;
  //     desktop-mode composites the 980px page at scale 1).
  // Either tell, combined with "touch + wide", is conservative enough to
  // avoid false positives while catching the accidental toggle.
  function looksLikeDesktopMode() {
    var isTouch = (navigator.maxTouchPoints || 0) > 0 ||
      (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
      ('ontouchstart' in window);
    if (!isTouch) return false;

    var w = window.innerWidth || document.documentElement.clientWidth || 0;
    if (w < 820) return false; // mobile layout is engaging normally

    var ua = navigator.userAgent || '';
    var uaMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
    var lowDpr = (window.devicePixelRatio || 1) < 1.6;

    // A genuine tablet/desktop with touch reports a mobile-less UA AND a
    // normal DPR AND a physically large screen. Require the screen to
    // actually be phone-sized so those don't false-positive.
    var physMin = Math.min(screen.width || 0, screen.height || 0);
    var phoneSized = physMin > 0 && physMin < 900;

    return (!uaMobile || lowDpr) && phoneSized;
  }

  function build() {
    if (document.getElementById('hr-desktopmode-banner')) return;
    if (sessionStorage.getItem(DISMISS_KEY) === '1') return;

    var bar = document.createElement('div');
    bar.id = 'hr-desktopmode-banner';
    bar.setAttribute('role', 'alert');
    bar.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'right:0',
      'z-index:2147483647',
      'background:#7a1f1f', 'color:#fff',
      'font:600 15px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
      'padding:12px 44px 12px 14px', 'box-sizing:border-box',
      'box-shadow:0 2px 10px rgba(0,0,0,.45)', 'text-align:left'
    ].join(';');
    bar.innerHTML =
      '<div style="max-width:640px;margin:0 auto">' +
      '⚠️ <b>Desktop Site looks turned on.</b> That squashes the full ' +
      'desktop layout onto your phone — turn it <b>off</b> for the mobile view:' +
      '<div style="font-weight:400;margin-top:4px;opacity:.92">' +
      'Chrome menu (⋮) → uncheck <b>Desktop site</b>, then reload.' +
      '</div></div>';

    var x = document.createElement('button');
    x.type = 'button';
    x.setAttribute('aria-label', 'Dismiss');
    x.textContent = '✕';
    x.style.cssText = [
      'position:absolute', 'top:6px', 'right:8px',
      'width:32px', 'height:32px', 'line-height:32px',
      'background:transparent', 'border:0', 'color:#fff',
      'font-size:18px', 'cursor:pointer'
    ].join(';');
    x.addEventListener('click', function () {
      try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch (e) {}
      if (bar.parentNode) bar.parentNode.removeChild(bar);
    });
    bar.appendChild(x);

    (document.body || document.documentElement).appendChild(bar);
  }

  function evaluate() {
    if (looksLikeDesktopMode()) build();
    else {
      var b = document.getElementById('hr-desktopmode-banner');
      if (b && b.parentNode) b.parentNode.removeChild(b);
    }
  }

  // Exposed so the smoke test can drive the detector deterministically.
  window.__hrDesktopModeCheck = looksLikeDesktopMode;
  window.__hrDesktopModeEvaluate = evaluate;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', evaluate);
  } else {
    evaluate();
  }
  window.addEventListener('resize', evaluate);
  window.addEventListener('orientationchange', evaluate);
})();
