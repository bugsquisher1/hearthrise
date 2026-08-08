// ============================================================
// src/features/world-events.js  (b204, SYS-5)
//
// Daily + weekly WORLD EVENTS, shared by every player without a
// server: the event is picked deterministically from the UTC date
// (FNV-1a hash of the date string → index into the pool). Two
// clients on opposite sides of the world compute the same event.
//
// Events grant bonuses through the keys getBonus() already consumes
// (gatherSpeed / cookSpeed / smithSpeed / craftSpeed / prayerSpeed /
// farmYield / allXP / combatXP) — we wrap window.getBonus with a thin
// additive layer, so every existing system (gathering, artisan,
// combat XP, farming) picks the event up with zero further wiring.
//
// UI: a banner strip at the top of the Home panel + a login toast.
// Daily events rotate at UTC midnight; weekly at the UTC week index
// (same weekly key scheme as the quest system).
// ============================================================
(function () {
  'use strict';

  var DAILY = [
    { id: 'gather_surge',  name: 'Gathering Surge',  glyph: '⛏', desc: '+25% gather speed today',            bonus: { gatherSpeed: 0.25 } },
    { id: 'forge_fires',   name: 'Forge Fires',      glyph: '🔥', desc: '+30% smithing & crafting speed',    bonus: { smithSpeed: 0.30, craftSpeed: 0.30 } },
    { id: 'harvest_fest',  name: 'Harvest Festival', glyph: '🌾', desc: '+2 farm yield today',               bonus: { farmYield: 2 } },
    { id: 'scholars_day',  name: "Scholar's Day",    glyph: '📜', desc: '+15% all XP today',                 bonus: { allXP: 0.15 } },
    { id: 'hunters_moon',  name: "Hunter's Moon",    glyph: '🌙', desc: '+20% combat XP today',              bonus: { combatXP: 0.20 } },
    { id: 'feast_day',     name: 'Feast Day',        glyph: '🍲', desc: '+30% cooking speed today',          bonus: { cookSpeed: 0.30 } },
    { id: 'quiet_vigil',   name: 'Quiet Vigil',      glyph: '🕯', desc: '+30% prayer speed today',           bonus: { prayerSpeed: 0.30 } }
  ];

  var WEEKLY = [
    { id: 'grand_fair',  name: 'The Grand Fair',   glyph: '🎪', desc: '+10% all XP all week',       bonus: { allXP: 0.10 } },
    { id: 'deep_veins',  name: 'Deep Veins',       glyph: '⛰', desc: '+15% gather speed all week', bonus: { gatherSpeed: 0.15 } },
    { id: 'war_drums',   name: 'War Drums',        glyph: '🥁', desc: '+15% combat XP all week',    bonus: { combatXP: 0.15 } },
    { id: 'guild_works', name: 'Guild Works',      glyph: '🛠', desc: '+20% artisan speed all week', bonus: { cookSpeed: 0.20, smithSpeed: 0.20, craftSpeed: 0.20 } }
  ];

  // FNV-1a — tiny, deterministic, good enough spread for pool picks
  function hash(s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
    return h >>> 0;
  }

  function utcDayKey(d) {
    d = d || new Date();
    return d.getUTCFullYear() + '-' + (d.getUTCMonth() + 1) + '-' + d.getUTCDate();
  }
  function utcWeekKey(d) {
    d = d || new Date();
    // days since epoch / 7 — same "UTC week index" idea the quest system uses
    return 'w' + Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86400000 / 7);
  }

  function daily(dateKey)  { return DAILY[hash('hr-daily-' + (dateKey || utcDayKey())) % DAILY.length]; }
  function weekly(weekKey) { return WEEKLY[hash('hr-weekly-' + (weekKey || utcWeekKey())) % WEEKLY.length]; }

  // Event bonus for a getBonus key — additive over both active events.
  function bonusFor(key) {
    var t = 0;
    var d = daily(), w = weekly();
    if (d && d.bonus[key]) t += d.bonus[key];
    if (w && w.bonus[key]) t += w.bonus[key];
    return t;
  }

  // ── wire into getBonus (thin additive wrapper; every system inherits it) ──
  var origGetBonus = window.getBonus;
  if (typeof origGetBonus === 'function') {
    window.getBonus = function (key) {
      var t = origGetBonus.apply(this, arguments);
      try { t += bonusFor(key); } catch (e) {}
      return t;
    };
  }

  // ── UI: banner strip on the Home panel + login toast ──
  function bannerHtml() {
    var d = daily(), w = weekly();
    return '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">' +
      '<span class="tiny" style="text-transform:uppercase;letter-spacing:.08em;font-weight:800;color:var(--gold-2)">World events</span>' +
      '<span style="font-size:12px;background:rgba(201,162,74,.10);border:1px solid var(--line);border-radius:99px;padding:3px 10px">' +
        d.glyph + ' <b>' + d.name + '</b> <span class="muted">— ' + d.desc + '</span></span>' +
      '<span style="font-size:12px;background:rgba(255,255,255,.04);border:1px solid var(--line-soft);border-radius:99px;padding:3px 10px">' +
        w.glyph + ' <b>' + w.name + '</b> <span class="muted">— ' + w.desc + '</span></span>' +
      '</div>';
  }

  function injectBanner() {
    var panel = document.getElementById('panel-profile');
    if (!panel) return;
    var el = document.getElementById('hr-worldevents');
    if (!el) {
      el = document.createElement('div');
      el.id = 'hr-worldevents';
      el.className = 'card';
      el.style.cssText = 'margin-bottom:8px;padding:8px 12px';
      panel.insertBefore(el, panel.firstChild);
    }
    el.innerHTML = bannerHtml();
  }

  function boot() {
    try {
      injectBanner();
      // home dashboard re-renders wipe injected nodes — cheap keep-alive
      setInterval(injectBanner, 5000);
      var d = daily(), w = weekly();
      var seenKey = 'hr-event-seen';
      var today = utcDayKey();
      if (localStorage.getItem(seenKey) !== today) {
        localStorage.setItem(seenKey, today);
        if (window.notify) notify(d.glyph + ' World event: ' + d.name + ' — ' + d.desc, 'info');
      }
    } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // NOTE: named HearthriseWorldEvents (NOT HearthriseEvents — that global
  // belongs to src/net/events.js, which loads later via the ESM chain and
  // would clobber us).
  window.HearthriseWorldEvents = {
    DAILY: DAILY, WEEKLY: WEEKLY,
    daily: daily, weekly: weekly,
    bonusFor: bonusFor,
    utcDayKey: utcDayKey, utcWeekKey: utcWeekKey,
    _hash: hash
  };
})();
