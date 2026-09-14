// ============================================================
// src/render/streak-chip.js — the topbar PLAY-STREAK flame (render layer)
//
// The 21st render-layer strangler-fig extraction out of src/legacy.js block 16
// (docs/design/render-extraction-pattern.md is the playbook). Moved, not
// redesigned: `checkStreak` and `paintStreak` are the same two functions that
// lived beside `todayKey` in the monolith, plus the ONE reader every
// play-streak surface now asks.
//
// WHY IT CAME OUT HERE AND NOW (2026-09-14): the chip read `1` while
// `player_state.streak_days` held `3` on the QA account. Two counters lived
// under one word — a per-DEVICE residue this file still advances from the local
// clock, and the server's own count, advanced from now() on any delta carrying
// `accrued_to` (2026-08-21-streak-state.sql §4c). CLAUDE.md §6: the browser
// never says one thing while the server says another. The fix is `days()`
// below, and it belongs in ONE place because four surfaces ask it (the chip,
// the welcome card, the Week Warrior / Devoted achievements, and renown, which
// SPENDS it at ×5 a day).
//
// WHAT IS STILL THE CLIENT'S: `advance()` — the local residue counter. It is
// the only answer before the first envelope, and nothing else. It is never
// merged upward and never overrules an observation.
//
// Globals are read via window.* at CALL time (the src/render/* convention), so
// this may load in any order after legacy.js.
// ============================================================
(function () {
  'use strict';

  /** The UTC day key legacy's `todayKey()` and hr_utc_day_key both use. */
  function todayKey() {
    var d = new Date();
    return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  }

  /* THE PER-DEVICE COUNTER (residue). Unchanged from the monolith: first day
     ever → 1, same day → idempotent, yesterday → +1, any larger gap → 1. */
  function advance(G) {
    G = G || window.G;
    if (!G || typeof G !== 'object') return;
    if (!G.streak || typeof G.streak !== 'object') G.streak = { count: 1, lastDay: 0 };
    var today = todayKey();
    if (!G.streak.lastDay) { G.streak = { count: 1, lastDay: today }; return; }
    if (G.streak.lastDay === today) return;
    var prev = new Date();
    prev.setUTCFullYear(Math.floor(G.streak.lastDay / 10000),
      (Math.floor(G.streak.lastDay / 100) % 100) - 1, G.streak.lastDay % 100);
    var dayDiff = Math.round((new Date() - prev) / 86400000);
    if (dayDiff === 1) { G.streak.count++; }
    else if (dayDiff > 1) { G.streak.count = 1; }
    G.streak.lastDay = today;
  }

  /** HOW MANY CONSECUTIVE DAYS THIS ACCOUNT HAS PLAYED — the server's
   *  `streak_days` whenever an envelope has carried one (accrue.js records it
   *  into `G._serverStreak` scratch), the device residue only until then.
   *  See reconcilePlayStreak's header in src/net/accrue.js for the full why. */
  function days(G) {
    G = G || window.G;
    var A = window.HearthriseAccrual;
    if (A && typeof A.playStreakDays === 'function') {
      try { return A.playStreakDays(G); } catch (e) { /* fall through */ }
    }
    return (G && G.streak && G.streak.count) || 0;
  }

  /* The chip itself. Painted from `days()`, so the number on the flame is the
     number renown scores and the achievements count. */
  function paint(G) {
    G = G || window.G;
    var el = document.getElementById('top-streak-count');
    if (!el || !G || !G.streak) return;
    var n = days(G);
    el.textContent = n;
    if (el.parentElement) el.parentElement.classList.toggle('hot', n >= 3);
  }

  window.HearthriseStreakChip = { advance: advance, days: days, paint: paint, todayKey: todayKey };
}());
