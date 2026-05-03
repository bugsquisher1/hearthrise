// ============================================================
// src/features/ui-overlap.js
//
// Visual layout regression detector.
//
// Why this exists:
//   We've shipped multiple regressions where an absolutely-positioned
//   element (e.g. the Lifetime Stats button on the Profile tab) drifted
//   over the top of another card's existing text or controls. The
//   functional smoke test passes — every render call still works — but
//   the player sees overlapping pixels.
//
//   This module checks for that class of bug programmatically:
//     • Explicit must-not-overlap pairs — selectors that should never
//       have intersecting bounding rects.
//     • Generic positioned-element guard — any element that's
//       position:absolute or position:fixed and visible should not
//       sit on top of any sibling element's visible text content.
//
// Public API:
//   findUiOverlaps()        → array of { kind, a, b, ra, rb, note } violations
//   watchUiOverlaps(opts)   → starts a debounced watcher that re-runs
//                              after each showTab + after window resize
//   stopWatchUiOverlaps()   → cancel the watcher
//
// The smoke test imports findUiOverlaps and adds it as a test step, so
// every smoke run is also a layout regression run.
// ============================================================

// ── Pairs that must never visually overlap. Add new ones here when
// shipping new floating / absolutely-positioned UI. Each entry is
// [containerSelector or null, selectorA, selectorB, optional note].
// `containerSelector` lets us scope checks to a specific tab/panel
// (e.g. "#panel-profile") so we only fire when that tab is active.
export const NO_OVERLAP_PAIRS = [
  // Lifetime Stats button is absolutely positioned at top-right of
  // #panel-profile, which puts it physically on top of the Active
  // Effects card. Even when text isn't *currently* visible behind it,
  // any future card-sub or card-title text that flows into the top-right
  // will be obscured. Treat this as an architectural overlap bug.
  ['#panel-profile.active', '.stats-btn-trigger', '#active-effects-card',
   'Lifetime Stats button is positioned on top of the Active Effects card'],
  ['#panel-profile.active', '.stats-btn-trigger', '#dash-active',
   'Lifetime Stats button is positioned on top of the Current Activity card'],

  // Bottom-left dev affordances should each have their own column.
  [null, '#admin-toggle', '#smoke-test-btn',
   'Admin toggle covers smoke-test button'],

  // Top-right floating bits.
  [null, '#btn-notif',  '#btn-settings',
   'Notification bell covers settings gear'],
  [null, '#btn-settings', '#btn-save',
   'Settings gear covers save button'],

  // Chat dock (when minimized only — when full it's expected to overlay)
  // shouldn't sit on top of the bottom-nav on mobile.
  // Skipped on desktop (no bottom-nav rendered).
  // Add as a string-only check; runner will tolerate missing elements.
  [null, '#chat-dock.mini #chat-dock-min', '#bottom-nav',
   'Mini chat pill covering mobile bottom nav'],
];

// Elements whose overlap is intentional / by design — never flag.
// Use this to whitelist intentional layering (modals, tooltips, etc).
const OVERLAP_WHITELIST = new Set([
  // Modal / dialog overlays sit over everything by design
  '.modal', '.modal-card', '.welcome-overlay', '.welcome-modal',
  '#buy-modal', '#item-tooltip', '#item-qty-modal', '.qsm-card',
  '#chat-name-menu', '#chat-mention-pop',
  '.ftue-root', '.ftue-card', '.ftue-shade', '.ftue-spot',
  '.dgn-run-overlay', '.drm-modal',
  '#chat-dock.full',
  // Notification toasts pop over content
  '.notifs', '.ach-toast', '.lvl-celebration',
]);

// ── Geometry helpers ───────────────────────────────────────
function rect(el){
  if(!el) return null;
  try { return el.getBoundingClientRect(); } catch (e){ return null; }
}
function intersects(a, b){
  if(!a || !b) return false;
  if(a.width <= 0 || a.height <= 0) return false;
  if(b.width <= 0 || b.height <= 0) return false;
  // 1-pixel tolerance — borders/halos shouldn't trigger us.
  return !(a.right <= b.left + 1
        || b.right <= a.left + 1
        || a.bottom <= b.top + 1
        || b.bottom <= a.top + 1);
}
function isVisible(el){
  if(!el) return false;
  if(el.offsetWidth === 0 && el.offsetHeight === 0) return false;
  var s;
  try { s = getComputedStyle(el); } catch(e){ return false; }
  if(!s) return false;
  if(s.display === 'none' || s.visibility === 'hidden') return false;
  if(parseFloat(s.opacity) === 0) return false;
  return true;
}
function isWhitelisted(el){
  if(!el) return false;
  for(var i = 0; i < OVERLAP_WHITELIST.size; i++){}  // iterate via for-of
  // Walk up the DOM looking for whitelisted ancestors
  var node = el;
  while(node && node !== document.body){
    for(var sel of OVERLAP_WHITELIST){
      try { if(node.matches && node.matches(sel)) return true; } catch(e){}
    }
    node = node.parentElement;
  }
  return false;
}

// ── Pair-based check ───────────────────────────────────────
function checkPair(container, selA, selB, note){
  if(container){
    if(!document.querySelector(container)) return null;     // tab not active
  }
  var a = document.querySelector(selA);
  var b = document.querySelector(selB);
  if(!isVisible(a) || !isVisible(b)) return null;
  if(isWhitelisted(a) || isWhitelisted(b)) return null;
  var ra = rect(a), rb = rect(b);
  if(intersects(ra, rb)){
    return {
      kind: 'pair',
      a: selA, b: selB,
      note: note || '',
      ra: { x: ra.left|0, y: ra.top|0, w: ra.width|0, h: ra.height|0 },
      rb: { x: rb.left|0, y: rb.top|0, w: rb.width|0, h: rb.height|0 },
    };
  }
  return null;
}

// ── Generic positioned-element guard ──────────────────────
// For each visible card-body, look for absolutely-positioned descendants
// that overlap text / button siblings. Catches new "floating control"
// regressions without us having to enumerate them in NO_OVERLAP_PAIRS.
function genericFloatingChecks(){
  var violations = [];
  // Floating elements we care about: position:absolute or position:fixed
  // children of an active panel that aren't whitelisted.
  var panels = document.querySelectorAll('.panel.active');
  panels.forEach(function(panel){
    var floaters = panel.querySelectorAll('*');
    floaters.forEach(function(f){
      if(!isVisible(f)) return;
      if(isWhitelisted(f)) return;
      var s;
      try { s = getComputedStyle(f); } catch(e){ return; }
      if(!s) return;
      if(s.position !== 'absolute' && s.position !== 'fixed') return;
      // Skip the card containers themselves (they're often relative wrappers)
      if(f.classList.contains('card')) return;
      // Skip very large floaters (full-screen overlays were already whitelisted)
      var rf = rect(f);
      if(!rf || rf.width > panel.offsetWidth * 0.7) return;
      // Compare against sibling text/button elements
      var parent = f.parentElement;
      if(!parent) return;
      var sibs = parent.querySelectorAll(
        '.card-title, .card-sub, .card-body, .stats-row, button:not([data-floater]), .ab-name'
      );
      sibs.forEach(function(sib){
        if(sib === f || f.contains(sib) || sib.contains(f)) return;
        if(!isVisible(sib)) return;
        if(isWhitelisted(sib)) return;
        var rs = rect(sib);
        if(intersects(rf, rs)){
          violations.push({
            kind: 'generic',
            a: cssPath(f), b: cssPath(sib),
            note: 'absolute/fixed element covers sibling content',
            ra: { x: rf.left|0, y: rf.top|0, w: rf.width|0, h: rf.height|0 },
            rs: { x: rs.left|0, y: rs.top|0, w: rs.width|0, h: rs.height|0 },
          });
        }
      });
    });
  });
  return violations;
}

// Compact CSS-path-ish selector for identification (id > class chain)
function cssPath(el){
  if(!el) return '<null>';
  if(el.id) return '#' + el.id;
  var cls = el.className && typeof el.className === 'string'
    ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.')
    : el.tagName.toLowerCase();
  var p = el.parentElement;
  return (p && p.id ? '#' + p.id + ' ' : '') + cls;
}

// ── Public API ───────────────────────────────────────────
export function findUiOverlaps(){
  var violations = [];
  NO_OVERLAP_PAIRS.forEach(function(p){
    var v = checkPair(p[0], p[1], p[2], p[3]);
    if(v) violations.push(v);
  });
  // Comment out for now — generic check catches lots of intentional
  // layering. Enable selectively when you want it (set window.__uiOverlapStrict = true).
  if(typeof window !== 'undefined' && window.__uiOverlapStrict){
    violations = violations.concat(genericFloatingChecks());
  }
  return violations;
}

// Watcher: re-runs after tab changes and window resizes. Logs each
// new violation once per session (deduped by `kind|a|b`) so console
// doesn't get spammed by the same overlap on every render.
let watcherTimer = null;
let seenSig = new Set();
let watcherInstalled = false;
let _opts = null;

function runAndReport(){
  var v = findUiOverlaps();
  v.forEach(function(violation){
    var sig = violation.kind + '|' + violation.a + '|' + violation.b;
    if(seenSig.has(sig)) return;
    seenSig.add(sig);
    console.warn('[ui-overlap]', violation.note || '(no note)',
      '\n  A:', violation.a,
      '\n  B:', violation.b,
      '\n  rectA:', violation.ra, 'rectB:', violation.rb || violation.rs);
    if(_opts && _opts.onViolation) try { _opts.onViolation(violation); } catch(e){}
  });
}
function debouncedRun(){
  clearTimeout(watcherTimer);
  watcherTimer = setTimeout(runAndReport, 250);
}

export function watchUiOverlaps(opts){
  if(watcherInstalled) return;
  watcherInstalled = true;
  _opts = opts || {};
  // Hook showTab so we re-check after navigation
  var origShowTab = window.showTab;
  if(typeof origShowTab === 'function'){
    window.showTab = function(name){
      var r = origShowTab.apply(this, arguments);
      debouncedRun();
      return r;
    };
  }
  window.addEventListener('resize', debouncedRun);
  // Initial pass after layout settles
  setTimeout(debouncedRun, 800);
  console.log('[ui-overlap] watcher live — set window.__uiOverlapStrict=true to enable generic checks');
}
export function stopWatchUiOverlaps(){
  watcherInstalled = false;
  clearTimeout(watcherTimer);
  window.removeEventListener('resize', debouncedRun);
  seenSig.clear();
}
export function resetUiOverlapDedup(){
  seenSig.clear();
}

// Expose to window for devtools / smoke test integration without import.
if(typeof window !== 'undefined'){
  window.findUiOverlaps    = findUiOverlaps;
  window.watchUiOverlaps   = watchUiOverlaps;
  window.resetUiOverlapDedup = resetUiOverlapDedup;
}
