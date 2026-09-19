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
// The banner is drawn with fully INLINE styles and a max z-index, on purpose:
// it must outrank every stacking context on a page whose layout is mislaid.
//
// What it does NOT need is its own private palette. The old comment here said
// the banner "must not depend on any stylesheet or token", and that reasoning
// was one step too far: desktop mode does not stop tokens.css loading, it makes
// the browser IGNORE THE VIEWPORT META and lay the desktop grid out at ~980px.
// The sheets are present and the ladder resolves. So every colour below is a
// plain token (CLAUDE.md §7) and the banner wears Forge & Stone like the rest
// of the chrome, instead of the oxblood browser-error slab it used to be.
//
// IT MUST NEVER COVER AN ACTIONABLE NUMBER. This used to be a bare
// `position:fixed; top:0` with nothing reserving its space, so 91px of alert
// sat ON TOP of Gold, Gems, Combat Level and the quest count: the one piece of
// chrome whose whole job is to explain a broken layout was itself hiding the
// four numbers a player acts on. It still pins to the top — an alert below the
// fold is not an alert — but it now measures itself into `--hr-dm-banner-h` and
// flags the body with `data-hr-desktop-mode`, and art-direction.css shortens
// the app shell by exactly that much. A ResizeObserver re-measures when the
// disclosure opens or the copy wraps, so the reservation is never a guess.
//
// It also stopped drawing ⚠️ and ✕ as art (the project forbids emoji as
// artwork outright): the alert mark is `uiWarn` from the baked atlas and the
// dismiss is a real labelled button with a 40px thumb target and a focus ring.
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
  // PHONE-SIZED MEANS PHONE-SIZED (b371). This was `physMin < 900`, and 900 is
  // not a phone dimension — it is a LAPTOP one. A 1366x768 touchscreen laptop
  // (the most common laptop resolution sold) reports screen 1366x768, so
  // physMin is 768, under the old threshold; its UA carries no mobile marker
  // (`!uaMobile` is true) and its innerWidth is over 820. Every clause passed,
  // and every touchscreen laptop at 1366x768 or 1280x800 was greeted by a
  // full-width red alert telling the player to turn off a setting they had
  // never turned on. A false alarm on the chrome that exists to explain a
  // broken layout is worse than no alarm: it teaches the player to dismiss it.
  //
  // 500 is chosen against the device the detector was written for. paione's
  // Ulefone Armour 27T is 1080x2400 physical at DPR ~2.75 — 393 CSS px on the
  // short edge, which is typical of the whole class (the widest common phone
  // short edge is ~430). 500 keeps every phone and excludes every laptop, with
  // ~70px of daylight on the phone side and ~270 on the laptop side.
  var PHONE_MAX_SHORT_EDGE = 500;

  // The predicate reads its whole world through this object so a test can hand
  // it a synthetic device. The comment below has claimed since b294 that the
  // detector is driven "deterministically" by the smoke test; it was not —
  // the test could only assert that the LIVE environment returns false, which
  // is exactly the assertion that could not see this bug. Now it can.
  function readEnv() {
    return {
      touch: (navigator.maxTouchPoints || 0) > 0 ||
        (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
        ('ontouchstart' in window),
      innerWidth: window.innerWidth || document.documentElement.clientWidth || 0,
      ua: navigator.userAgent || '',
      dpr: window.devicePixelRatio || 1,
      screenW: (window.screen && screen.width) || 0,
      screenH: (window.screen && screen.height) || 0,
    };
  }

  function looksLikeDesktopMode(env) {
    var e = env || readEnv();
    if (!e.touch) return false;
    if (e.innerWidth < 820) return false; // mobile layout is engaging normally

    var uaMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(e.ua || '');
    var lowDpr = (e.dpr || 1) < 1.6;

    // A genuine tablet/desktop with touch reports a mobile-less UA AND a
    // normal DPR AND a physically large screen. Require the screen to
    // actually be phone-sized so those don't false-positive.
    var physMin = Math.min(e.screenW || 0, e.screenH || 0);
    var phoneSized = physMin > 0 && physMin < PHONE_MAX_SHORT_EDGE;

    return (!uaMobile || lowDpr) && phoneSized;
  }

  // ── The reservation ─────────────────────────────────────────
  // The banner's own height, published to the app shell. `--hr-dm-banner-h` is
  // read by ONE rule block in art-direction.css, gated on the body attribute,
  // so it can neither leak into a theme nor apply on a viewport where the
  // banner never fires.
  var RESERVE_ATTR = 'data-hr-desktop-mode';
  var RESERVE_VAR = '--hr-dm-banner-h';
  var ro = null;

  function reserve(bar) {
    var h = Math.ceil(bar.getBoundingClientRect().height);
    document.documentElement.style.setProperty(RESERVE_VAR, h + 'px');
    document.body.setAttribute(RESERVE_ATTR, '1');
    return h;
  }
  function unreserve() {
    if (ro) { try { ro.disconnect(); } catch (e) {} ro = null; }
    document.documentElement.style.removeProperty(RESERVE_VAR);
    if (document.body) document.body.removeAttribute(RESERVE_ATTR);
  }

  // The alert mark comes from the baked atlas (src/data/glyphs.js), which is a
  // classic script loaded before this one. If it is somehow absent we draw NO
  // mark rather than falling back to a pictograph.
  function warnMark(px) {
    var d = (window.HR_GLYPHS && window.HR_GLYPHS.uiWarn) || '';
    if (!d) return '';
    return '<svg viewBox="0 0 512 512" width="' + px + '" height="' + px + '" aria-hidden="true" focusable="false"'
      + ' style="display:block;flex:0 0 auto;fill:currentColor"><path d="' + d + '"/></svg>';
  }

  var CHIP = [
    'appearance:none', 'cursor:pointer',
    'min-height:40px', 'padding:0 12px',            // the thumb target
    'border:1px solid var(--line-strong)',
    'border-radius:var(--r,3px)',
    'background:var(--surf-raised)',
    'color:var(--ink)',
    'font-family:var(--f-label,\'Alegreya Sans SC\',system-ui,sans-serif)',
    'font-size:var(--t-micro,14.5px)', 'letter-spacing:.06em', 'text-transform:uppercase',
    'white-space:nowrap'
  ].join(';');

  function build() {
    if (document.getElementById('hr-desktopmode-banner')) return null;
    if (sessionStorage.getItem(DISMISS_KEY) === '1') return null;

    var bar = document.createElement('div');
    bar.id = 'hr-desktopmode-banner';
    bar.setAttribute('role', 'alert');
    bar.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'right:0',
      'z-index:2147483647',
      /* Forge & Stone, not the oxblood slab this used to be: the app's own card
         surface with a gilt underline, so the notice reads as the game's chrome
         rather than a browser error page. */
      'background:var(--bg-card)',
      'color:var(--ink)',
      'border-bottom:2px solid var(--gold)',
      'font-family:var(--f-ui,\'Alegreya Sans\',system-ui,sans-serif)',
      'font-size:var(--t-small,16px)', 'line-height:1.35',
      'padding:10px 14px', 'box-sizing:border-box',
      // the one literal left in this file: a drop shadow is a depth cue, not a
      // palette decision, and the theme has no shadow token to spend here.
      'box-shadow:0 6px 18px -10px rgba(0,0,0,.9)', 'text-align:left'
    ].join(';');

    bar.innerHTML =
      '<div style="max-width:720px;margin:0 auto;display:flex;align-items:flex-start;gap:10px">' +
        '<span style="color:var(--gold);margin-top:2px">' + warnMark(20) + '</span>' +
        '<div style="flex:1 1 auto;min-width:0">' +
          '<b style="display:block;font-family:var(--f-label,\'Alegreya Sans SC\',system-ui,sans-serif);' +
            'font-size:var(--t-h3,16.5px);letter-spacing:.07em;text-transform:uppercase;' +
            'color:var(--gold);font-weight:600">Desktop Site is on</b>' +
          '<span style="display:block;color:var(--ink-2)">' +
            'Your browser is drawing the full desktop layout on a phone screen. ' +
            'Turn Desktop Site off for the mobile view.</span>' +
          '<div id="hr-dm-how" hidden style="margin-top:6px;color:var(--ink-2)">' +
            '<div><b style="color:var(--ink)">Chrome / Android:</b> tap the ⋮ menu, untick ' +
              '<b style="color:var(--ink)">Desktop site</b>, then reload.</div>' +
            '<div><b style="color:var(--ink)">Safari / iPhone:</b> tap <b style="color:var(--ink)">aA</b> ' +
              'in the address bar, then <b style="color:var(--ink)">Request Mobile Website</b>.</div>' +
          '</div>' +
        '</div>' +
        '<div style="flex:0 0 auto;display:flex;gap:8px;align-items:flex-start"></div>' +
      '</div>';

    var actions = bar.querySelector('div > div:last-child');

    var how = document.createElement('button');
    how.type = 'button';
    how.id = 'hr-dm-howbtn';
    how.textContent = 'Show me how';
    how.setAttribute('aria-expanded', 'false');
    how.setAttribute('aria-controls', 'hr-dm-how');
    how.style.cssText = CHIP + ';border-color:var(--gold);color:var(--gold)';
    how.addEventListener('click', function () {
      var box = bar.querySelector('#hr-dm-how');
      var open = box.hasAttribute('hidden');
      if (open) box.removeAttribute('hidden'); else box.setAttribute('hidden', '');
      how.setAttribute('aria-expanded', open ? 'true' : 'false');
      how.textContent = open ? 'Hide steps' : 'Show me how';
      reserve(bar);   // the disclosure changes the height; the shell follows it
    });

    var x = document.createElement('button');
    x.type = 'button';
    x.id = 'hr-dm-dismiss';
    x.textContent = 'Dismiss';
    x.style.cssText = CHIP + ';color:var(--ink-2)';
    x.addEventListener('click', function () {
      try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch (e) {}
      if (bar.parentNode) bar.parentNode.removeChild(bar);
      unreserve();
    });

    actions.appendChild(how);
    actions.appendChild(x);

    /* A visible focus ring on both controls. The inline style above cannot carry
       a :focus-visible rule, and this banner must not depend on a stylesheet, so
       the ring is set on the event. No transition anywhere in this component —
       that is how it is reduced-motion safe: there is no motion to reduce. */
    [how, x].forEach(function (btn) {
      btn.addEventListener('focus', function () {
        btn.style.outline = '2px solid var(--gold)';
        btn.style.outlineOffset = '2px';
      });
      btn.addEventListener('blur', function () { btn.style.outline = ''; btn.style.outlineOffset = ''; });
    });

    (document.body || document.documentElement).appendChild(bar);
    reserve(bar);
    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(function () { if (bar.isConnected) reserve(bar); });
      ro.observe(bar);
    }
    return bar;
  }

  function evaluate() {
    if (looksLikeDesktopMode(null)) build();
    else {
      var b = document.getElementById('hr-desktopmode-banner');
      if (b && b.parentNode) b.parentNode.removeChild(b);
      unreserve();
    }
  }

  // Exposed so the smoke test can drive the detector deterministically.
  window.__hrDesktopModeCheck = looksLikeDesktopMode;
  window.__hrDesktopModeEvaluate = evaluate;
  /* The banner's own DOM path, separate from the predicate. The predicate can be
     driven with a synthetic device (b371) but the BANNER could only ever be
     inspected on a real phone in desktop mode — which is why it shipped covering
     the top bar for 250 builds. This builds it here, on this viewport, so the
     suite can measure what it covers. It respects the session dismissal exactly
     as the real path does. */
  window.__hrDesktopModeShowBanner = build;
  window.__hrDesktopModeHideBanner = function () {
    var b = document.getElementById('hr-desktopmode-banner');
    if (b && b.parentNode) b.parentNode.removeChild(b);
    unreserve();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', evaluate);
  } else {
    evaluate();
  }
  window.addEventListener('resize', evaluate);
  window.addEventListener('orientationchange', evaluate);
})();
