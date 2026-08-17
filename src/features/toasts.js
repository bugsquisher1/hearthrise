// ============================================================
// src/features/toasts.js — the toast (notification) queue.
//
// b219, backlog #7. Replaces the six-line toast implementation that
// lived inside `notify()` in src/legacy.js. Three things were wrong
// with it, all of them reported by players:
//
//   1. TOO SMALL — 13.5px, below the b218 readable type floor.
//   2. TOO FAST  — a flat 3500ms regardless of how much text the toast
//                  carried, so the long ones ("Your save data could not
//                  be read…", 96 chars) were gone before they were read.
//   3. COVERED   — the toast column is anchored bottom-right at 12px,
//                  and so is the chat pill (#chat-dock.mini, bottom 16px)
//                  AND the bug-report button (#hr-bug-btn, bottom 62px).
//                  Three pieces of floating chrome, one corner. The chat
//                  pill sits at z-index 10000 vs the toasts' 1000, so the
//                  first toast in the stack was literally behind it.
//
// Plus a structural one the report didn't name: the old code hard-capped
// the stack with `while(el.children.length>5) el.children[0].remove()`,
// so during a combat burst toasts were destroyed on arrival — you saw a
// flicker, not a message. Toasts now QUEUE: at most MAX_VISIBLE on screen,
// the rest wait their turn, identical messages coalesce into "xN" instead
// of taking a slot each, and stale queue entries are dropped rather than
// shown minutes after the event they describe.
//
// The covered-by-chrome fix is measured, not hardcoded: `layout()` reads
// the live rects of everything registered in OBSTACLES and lifts (or, if
// the lift would be absurd, side-steps) the column so it clears them. New
// floating chrome in that corner registers its selector here and is
// handled automatically — no new magic offsets to keep in sync.
//
// Public API (window.HearthriseToasts):
//   push(text, type)   → show a toast ('info' | 'loot' | 'kill' | 'levelup')
//   layout()           → recompute clearance (call after moving chrome)
//   register(selector) → add a bottom-right obstacle to avoid
//   clear()            → drop everything (tests)
//   state()            → { visible, pending, dropped } (tests)
//
// Loaded as a classic script AFTER legacy.js; `notify()` in legacy.js
// delegates here when present and falls back to its own minimal render
// if this module ever fails to load.
// ============================================================
(function () {
  'use strict';

  // ── Tuning ────────────────────────────────────────────────
  var MAX_VISIBLE   = 4;      // toasts on screen at once
  var MAX_PENDING   = 12;     // queued behind them; oldest dropped past this
  var STALE_MS      = 15000;  // a queued toast older than this is skipped
  var MIN_MS        = 4000;   // floor — Tyler's "too fast" complaint
  var MAX_MS        = 9000;   // ceiling — don't wallpaper the corner
  var BASE_CHARS    = 22;     // chars covered by MIN_MS
  var MS_PER_CHAR   = 55;     // added reading time per char beyond that
  var GAP           = 10;     // px of air between the column and obstacles
  var MAX_LIFT_FRAC = 0.42;   // lift beyond this share of the viewport and
                              // we side-step horizontally instead
  var COL_W         = 380;    // must match the max-width in CSS
  var BASE_INSET    = 12;     // resting offset from the bottom/right edges

  // Chrome that shares the toast column's band. Anything listed here is
  // measured and cleared; hidden elements measure 0 and are skipped, so a
  // desktop-only or mobile-only entry costs nothing on the other platform.
  // Adding new floating chrome? Add its selector, don't invent an offset.
  var OBSTACLES = [
    '#chat-dock',   // the chat pill / expanded panel (draggable — see chat.js)
    '#hr-bug-btn',  // beta bug-report button, right column
    '#bottom-nav',  // mobile tab bar; full-width, so it always overlaps
  ];

  // Toasts are system chrome: the TYPE carries the tone (kill/loot/levelup/
  // info), so pictographs in the message text are stripped at this single
  // render point rather than hunted through 113 call sites. (Moved here
  // from legacy.js with the rest of the toast render.)
  var EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{231A}-\u{23FF}]/gu;

  // ── State ─────────────────────────────────────────────────
  var visible = [];   // [{ el, key, type, text, count, dur, remaining, timer, startedAt }]
  var pending = [];   // [{ key, type, text, queuedAt }]
  var dropped = 0;    // queue overflow counter (surfaced in state(), for tests)
  var paused  = false;

  function container() { return document.getElementById('notifs'); }

  // b219: toasts render with textContent (they must — some of the text is
  // player-supplied and innerHTML here would be the stored-XSS hole all over
  // again). But at least one call site handed notify() a string built for
  // innerHTML, and ~700 chars of raw <svg> path data got printed into the
  // corner. Tags are stripped here so a caller's markup degrades to its text
  // instead of vomiting source at the player. The tag pattern requires a
  // letter or `/` after `<`, so ordinary copy like "HP < 5" is untouched.
  var TAG_RE = /<\/?[a-z][^>]*>/gi;

  function clean(text) {
    var raw = String(text == null ? '' : text);
    var s = raw
      .replace(TAG_RE, ' ')
      .replace(EMOJI_RE, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    return s || raw;
  }

  // Reading time scales with length. A 12-char "+3 Oak Log" doesn't need
  // the same dwell as a 96-char save-recovery explanation.
  function durationFor(text) {
    var extra = Math.max(0, text.length - BASE_CHARS) * MS_PER_CHAR;
    return Math.max(MIN_MS, Math.min(MAX_MS, MIN_MS + extra));
  }

  // ── Clearance ─────────────────────────────────────────────
  // Measure every registered obstacle and pick offsets that keep the
  // column out from under all of them. Pure geometry — no assumptions
  // about which piece of chrome lives where, so moving the chat pill
  // (backlog #8) is handled by re-running this.
  // Pure placement math (no DOM) so the landscape behaviour is unit-testable.
  // `obstacles` is an array of {left, right, top} rects in the column's band.
  function computeOffsets(vw, vh, obstacles) {
    /* b286: match the narrower column the CSS uses on short (landscape) viewports —
       a 380px column is ~45% of an 852px-wide phone and blankets the very panel the
       toast is reporting on. Kept in step with the @media (max-height:560px) rule. */
    var colW  = Math.min((vh <= 560 ? 280 : COL_W), vw - BASE_INSET * 2);
    var bandR = vw - BASE_INSET;
    var bandL = bandR - colW;

    var lift = 0, leftMost = vw, blocked = false;
    for (var i = 0; i < (obstacles || []).length; i++) {
      var r = obstacles[i];
      if (!r) continue;
      if (r.right < bandL - GAP || r.left > bandR + GAP) continue; // not in band
      blocked = true;
      lift = Math.max(lift, vh - r.top + GAP);
      leftMost = Math.min(leftMost, r.left);
    }

    var bottom = BASE_INSET, right = BASE_INSET;
    if (blocked) {
      var sideRight = Math.round(Math.max(BASE_INSET, vw - leftMost + GAP));
      var sideFits  = (sideRight + colW <= vw - BASE_INSET);
      // Landscape phones are SHORT — a lift that's fine on desktop (a small
      // corner button forces ~112px) drops the column into the middle of the
      // screen, over content (paione's landscape shot). When the viewport is
      // short and we can step LEFT of a narrow obstacle (e.g. the bug button)
      // while staying on-screen, do that and keep the column at the bottom.
      var shortView = vh <= 560;
      if (sideFits && (shortView || lift > vh * MAX_LIFT_FRAC)) {
        right = sideRight;                                   // step beside it
      } else if (lift <= vh * MAX_LIFT_FRAC) {
        bottom = Math.round(lift);                           // small lift, keep corner
      } else {
        bottom = Math.round(Math.min(lift, vh * MAX_LIFT_FRAC)); // tall obstacle, cap
      }
    }
    /* b371 (F21) — THE COLUMN IS CLAMPED INTO THE VIEWPORT AS A LAST STEP.
       Every branch above is individually correct today (the side-step is gated
       on `sideFits`), which is exactly why this belongs here rather than inside
       one of them: the guarantee "a toast is on screen" must not depend on a
       future editor re-deriving the interaction between four branches. `right`
       is bounded so the column's LEFT edge cannot leave the viewport, and
       `bottom` so its top cannot. Cheap, total, and asserted by TOAST-FIT-1. */
    var maxRight = Math.max(BASE_INSET, vw - colW - BASE_INSET);
    right  = Math.max(0, Math.min(right, maxRight));
    bottom = Math.max(0, Math.min(bottom, Math.max(0, vh - BASE_INSET)));
    return { bottom: bottom, right: right };
  }

  function layout() {
    var el = container();
    if (!el) return null;
    var vw = window.innerWidth || 1024;
    var vh = window.innerHeight || 768;

    var rects = [];
    for (var i = 0; i < OBSTACLES.length; i++) {
      var ob = document.querySelector(OBSTACLES[i]);
      if (!ob) continue;
      var r;
      try { r = ob.getBoundingClientRect(); } catch (e) { continue; }
      if (!r || r.width <= 0 || r.height <= 0) continue;
      rects.push({ left: r.left, right: r.right, top: r.top });
    }

    var off = computeOffsets(vw, vh, rects);
    el.style.bottom = 'calc(' + off.bottom + 'px + var(--safe-b, 0px))';
    el.style.right  = 'calc(' + off.right + 'px + var(--safe-r, 0px))';
    return off;
  }

  function register(selector) {
    if (typeof selector !== 'string' || !selector) return;
    if (OBSTACLES.indexOf(selector) < 0) OBSTACLES.push(selector);
    layout();
  }

  // ── Timers (pause-on-hover aware) ─────────────────────────
  function arm(t) {
    if (paused || t.timer) return;
    t.startedAt = Date.now();
    t.timer = setTimeout(function () { t.timer = null; dismiss(t); }, t.remaining);
  }
  function hold(t) {
    if (!t.timer) return;
    clearTimeout(t.timer);
    t.timer = null;
    t.remaining = Math.max(600, t.remaining - (Date.now() - t.startedAt));
  }
  function pauseAll() {
    if (paused) return;
    paused = true;
    visible.forEach(hold);
  }
  function resumeAll() {
    if (!paused) return;
    paused = false;
    visible.forEach(arm);
  }

  // ── Render ────────────────────────────────────────────────
  function build(item) {
    var d = document.createElement('div');
    d.className = 'notif ' + item.type;
    d.setAttribute('role', 'status');
    var body = document.createElement('span');
    body.className = 'notif-text';
    body.textContent = item.text;
    d.appendChild(body);
    var badge = document.createElement('span');
    badge.className = 'notif-count';
    badge.style.display = 'none';
    d.appendChild(badge);
    d.addEventListener('click', function () { dismiss(item); });
    d.addEventListener('mouseenter', pauseAll);
    d.addEventListener('mouseleave', resumeAll);
    return d;
  }

  function bump(t) {
    t.count++;
    var badge = t.el.querySelector('.notif-count');
    if (badge) {
      badge.textContent = 'x' + t.count;
      badge.style.display = '';
    }
    t.remaining = t.dur;
    hold(t);
    arm(t);
  }

  function show(item) {
    var el = container();
    if (!el) return null;
    var t = {
      key: item.key, type: item.type, text: item.text,
      count: 1, dur: durationFor(item.text),
    };
    t.remaining = t.dur;
    t.el = build(t);
    el.appendChild(t.el);
    visible.push(t);
    layout();
    arm(t);
    return t;
  }

  function dismiss(t) {
    var idx = visible.indexOf(t);
    if (idx < 0) return;
    visible.splice(idx, 1);
    if (t.timer) { clearTimeout(t.timer); t.timer = null; }
    var node = t.el;
    if (node) {
      node.classList.add('leaving');
      setTimeout(function () { try { node.remove(); } catch (e) {} }, 220);
    }
    // Clicking a toast while hovering it removes the element, so its
    // `mouseleave` never fires — without this the whole stack would stay
    // frozen for the rest of the session. Resume unless the cursor is
    // genuinely still resting on one of the survivors.
    if (paused && !visible.some(function (o) {
      try { return o.el && o.el.matches(':hover'); } catch (e) { return false; }
    })) resumeAll();
    drain();
  }

  // Promote queued toasts into free slots, skipping entries that have
  // gone stale (an idle game can burst; showing a 40-second-old "+2 Ore"
  // is noise, not information).
  function drain() {
    var now = Date.now();
    while (visible.length < MAX_VISIBLE && pending.length) {
      var next = pending.shift();
      if (now - next.queuedAt > STALE_MS) { dropped++; continue; }
      // Coalesce against what's already on screen.
      var same = find(next.key);
      if (same) { bump(same); continue; }
      show(next);
    }
  }

  function find(key) {
    for (var i = 0; i < visible.length; i++) if (visible[i].key === key) return visible[i];
    return null;
  }

  // ── Public entry point ────────────────────────────────────
  function push(text, type) {
    var el = container();
    if (!el) return;
    var t = type || 'info';
    var msg = clean(text);
    var key = t + ' ' + msg;

    // b228 — the Chronicle's "Recent" feed. This is the ONE choke-point every
    // toast passes through, and the hook sits deliberately ABOVE the
    // visibility decisions below: a toast this queue coalesces or DROPS (burst
    // overflow, or stale before a slot freed) is precisely the one the player
    // missed, so it must still be recorded. Guarded and fire-and-forget — the
    // log never gets to break a notification.
    try { if (window.HearthriseChronicle) window.HearthriseChronicle.recordToast(msg, t); } catch (e) {}

    // Identical message already up → count it instead of stealing a slot.
    var same = find(key);
    if (same) { bump(same); return; }

    if (visible.length < MAX_VISIBLE) {
      show({ key: key, type: t, text: msg });
      return;
    }
    // Full — queue. Past MAX_PENDING the OLDEST queued entry is dropped:
    // in an idle game the newest event is the one the player cares about,
    // and an unbounded queue would show toasts minutes behind reality.
    pending.push({ key: key, type: t, text: msg, queuedAt: Date.now() });
    while (pending.length > MAX_PENDING) { pending.shift(); dropped++; }
  }

  function clear() {
    visible.slice().forEach(function (t) {
      if (t.timer) clearTimeout(t.timer);
      try { t.el.remove(); } catch (e) {}
    });
    visible.length = 0;
    pending.length = 0;
    dropped = 0;
    paused = false;
  }

  // ── Boot ──────────────────────────────────────────────────
  function init() {
    var el = container();
    if (!el) return;
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-atomic', 'false');
    layout();
  }

  var relayoutTimer = null;
  function relayoutSoon() {
    clearTimeout(relayoutTimer);
    relayoutTimer = setTimeout(layout, 60);
  }
  window.addEventListener('resize', relayoutSoon);
  // Chrome that we clear (chat pill, bug button) is injected on a timer
  // after boot, so measure again once things have settled.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  setTimeout(layout, 1200);
  setTimeout(layout, 3000);

  window.HearthriseToasts = {
    push: push,
    layout: layout,
    register: register,
    clear: clear,
    relayout: relayoutSoon,
    state: function () {
      return {
        visible: visible.length,
        pending: pending.length,
        dropped: dropped,
        paused: paused,
        counts: visible.map(function (t) { return t.count; }),
      };
    },
    // Exposed for the regression tests / tuning, not for gameplay code.
    computeOffsets: computeOffsets,
    config: {
      MAX_VISIBLE: MAX_VISIBLE, MAX_PENDING: MAX_PENDING,
      MIN_MS: MIN_MS, MAX_MS: MAX_MS,
    },
    durationFor: durationFor,
  };

  console.log('[toasts] queue ready (max ' + MAX_VISIBLE + ' visible, ' + (MIN_MS / 1000) + 's floor)');
})();
