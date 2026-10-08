// ============================================================
// src/features/world-events.js  (b204, SYS-5 · reworked b227)
//
// Daily + weekly WORLD EVENTS — "blessings" — shared by every player without
// a server: the event is picked deterministically from the UTC date (FNV-1a
// hash of the date string → index into the pool). Two clients on opposite
// sides of the world compute the same event.
//
// ── b560: THE CALENDAR PROMISES NOTHING THE REALM DOES NOT PAY ──
// b227 made the calendar the online advantage: each entry carried a `bonus`
// table and this file wrapped window.getBonus to add it in while the player was
// online. The engine never had that layer — hr-accrue's bonusFor sums rooms/
// perks, the companion and the buff queue, and nothing else — so Home, Events,
// the login toast and the activity note promised speed, yield, gold find and
// XP the server never paid (CLAUDE.md §6). The layer, the magnitudes and every
// sentence naming them are withdrawn (CONFLICTS.md 2026-09-28). A blessing is
// now the realm's mood for the day and the week: a name, a glyph and a line
// saying what it is for, with no number, until a server layer exists to pay
// one. tests/blessing-promise-honesty.mjs keeps it that way.
//
// UI: the blessing card in the Events panel (Home hosts it only as a
// fallback) + a login toast — all behind BLESSINGS_SHOWN (off). Daily events rotate at UTC midnight; weekly at
// the UTC week index (same weekly key scheme as the quest system).
// ============================================================
(function () {
  'use strict';

  // The pool ORDER and LENGTH are load-bearing: the day's pick is
  // hash % length, and the fairness census in the smoke suite measures it.
  var DAILY = [
    { id: 'gather_surge',  name: 'Gathering Surge',   desc: 'a day for axes, picks and nets' },
    { id: 'forge_fires',   name: 'Forge Fires',       desc: 'a day for the forge and the bench' },
    { id: 'harvest_fest',  name: 'Harvest Festival',  desc: 'a day for the fields' },
    { id: 'scholars_day',  name: "Scholar's Day",     desc: 'a day for study and practice' },
    { id: 'hunters_moon',  name: "Hunter's Moon",     desc: 'a night for the hunt' },
    { id: 'feast_day',     name: 'Feast Day',         desc: 'a day for the kitchen' },
    { id: 'quiet_vigil',   name: 'Quiet Vigil',       desc: 'a day for prayer' },
    { id: 'open_coffers',  name: 'The Open Coffers',  desc: 'a day for trade and treasure' },
    { id: 'steady_fire',   name: 'The Steady Fire',   desc: 'a day for patient cooking' }
  ];

  var WEEKLY = [
    { id: 'grand_fair',   name: 'The Grand Fair',   desc: 'a week of fairs across the realm' },
    { id: 'kings_bounty', name: "The King's Bounty", desc: 'a week under the crown’s banner' },
    { id: 'deep_veins',   name: 'Deep Veins',       desc: 'a week for the mines and the woods' },
    { id: 'war_drums',    name: 'War Drums',        desc: 'a week of drums on the border' },
    { id: 'guild_works',  name: 'Guild Works',      desc: 'a week for the guild halls' },
    { id: 'long_harvest', name: 'The Long Harvest', desc: 'a week for the long harvest' }
  ];

  // FNV-1a — tiny, deterministic, good enough spread for pool picks.
  //
  // b332: the multiply MUST be Math.imul. It was `(h * 0x01000193) >>> 0`,
  // which is a float multiply — past 2^53 the low bits that `>>> 0` keeps are
  // rounded away. Measured over the next 730 days that made this hash return
  // an EVEN value every single time, and WEEKLY has 6 entries, so
  // kings_bounty, war_drums and long_harvest could never be drawn. It also
  // made the "daily" blessing repeat for 3-6 days in a row, because adjacent
  // day keys differ only in the last characters — exactly the bits the
  // rounding threw away. Reference implementation: src/core/rng.js hashSeed.
  function hash(s) {
    var h = 0x811c9dc5;
    s = String(s);
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
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

  // TEST/QA SEAM (b227). Pins today's and this week's pick so a test — or a
  // browser verification pass — can put the game under a KNOWN blessing
  // instead of whatever the wall clock happened to deal. Only honoured when
  // the caller asks for "now": an explicit date key always computes the real
  // deterministic pick, so the determinism test cannot be fooled by a pin.
  var _forced = null;
  function forceEvents(pins) { _forced = pins || null; injectBanner(); }

  function daily(dateKey) {
    if (!dateKey && _forced && _forced.daily) return _forced.daily;
    return DAILY[hash('hr-daily-' + (dateKey || utcDayKey())) % DAILY.length];
  }
  function weekly(weekKey) {
    if (!weekKey && _forced && _forced.weekly) return _forced.weekly;
    return WEEKLY[hash('hr-weekly-' + (weekKey || utcWeekKey())) % WEEKLY.length];
  }
  // A blessing-shaped object that grants nothing — the "no calendar" control
  // every gate test needs, so an assertion never depends on today's date.
  var QUIET = { id: 'quiet_season', name: 'A Quiet Season', desc: 'no blessing' };

  /* ── THE SWITCH: BLESSINGS ARE OUT OF THE PLAYER'S VIEW (the front door) ──
     The effects were withdrawn earlier, and what was left — an Events card, a Home
     "The realm" block, a War Table destination and a login toast — told a new
     player each day that something was blessed when nothing was. A name with
     no consequence is a promise with nothing behind it (Game Designer ruling,
     2026-10-08), so every player-facing surface reads this ONE flag and draws
     nothing while it is false. The calendar itself (daily/weekly/hash/day keys)
     stays: Boss of the Day, raids and the muster share its clock. Flip it to
     true the day a server blessing layer pays something. */
  var BLESSINGS_SHOWN = false;
  var _showOverride = null;   // suite seam (_show) — never called by the game
  function shown() { return _showOverride !== null ? _showOverride : BLESSINGS_SHOWN; }

  // ── THE GATE ──────────────────────────────────────────────────────────────
  // "Is the day's blessing active for this player?" — the line the card prints.
  // It pays nothing (see the header); it defers to legacy.js's session layer
  // (not inside an offline replay AND online), and answers NO when that layer
  // is missing.
  function blessingActive() {
    var P = window.HearthrisePresence;
    if (!P || typeof P.blessingsApply !== 'function') return false;
    try { return !!P.blessingsApply(); } catch (e) { return false; }
  }

  // ── UI: the Blessing card + login toast ──
  // b220: these events used to carry an emoji `glyph` in their data. Nothing in
  // Hearthrise renders emoji as art (Final Directive), so b227 removed the
  // field entirely rather than leaving dead emoji in a data table. The ids map
  // onto the baked atlas here, and this map is EXPORTED so home-dashboard.js
  // reads the same one — Home and Events can never disagree about what an
  // event looks like, which the old duplicated copy only promised.
  var EVENT_GLYPH = {
    gather_surge: 'uiPickaxe', forge_fires: 'uiFlame', harvest_fest: 'uiWheat',
    scholars_day: 'uiScroll', hunters_moon: 'uiBow', feast_day: 'uiPot',
    quiet_vigil: 'prayer', open_coffers: 'uiCoinStack', steady_fire: 'uiFire',
    grand_fair: 'uiBanner', kings_bounty: 'uiChest', deep_veins: 'uiOre',
    war_drums: 'uiSword', guild_works: 'uiHammer', long_harvest: 'uiSprout'
  };
  function gly(id) {
    var k = EVENT_GLYPH[id];
    var g = (k && window.HR && window.HR.icon) ? window.HR.icon(k, 14, '--gold-2') : null;
    return g || '';                  // no atlas yet → no glyph, never an emoji
  }
  function bannerHtml() {
    var d = daily(), w = weekly();
    var live = blessingActive();
    // b220: the strip used to lead with its own "World events" label. Inside
    // the Events panel that is a label under a label under a panel of the same
    // name; the section eyebrow says what this is now.
    var onEvents = !!document.getElementById('hr-ev-blessing');
    var pill = function (ev, when, strong) {
      // b230 mobile: 13.5px was below the 14.5 type floor and unscaled; the
      // 99px lozenge wrapped into an ugly pill-blob on a phone. Scale the type
      // and drop to an 8px radius so multi-line text reads as a card, not a bean.
      return '<span style="font-size:calc(14.5px * var(--ui-scale, 1));background:' + (strong ? 'rgba(201,162,74,.10)' : 'rgba(255,255,255,.04)') +
        ';border:1px solid var(--' + (strong ? 'line' : 'line-soft') + ');border-radius:8px;padding:3px 10px' +
        (live ? '' : ';opacity:.55') + '">' +
        gly(ev.id) + ' <b>' + ev.name + '</b> <span class="muted">— ' + ev.desc + ' · ' + when + '</span></span>';
    };
    return '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">' +
      (onEvents ? '' : '<span class="tiny" style="text-transform:uppercase;letter-spacing:.08em;font-weight:800;color:var(--gold-2)">World events</span>') +
      pill(d, 'today', true) + pill(w, 'this week', false) +
      '</div>' +
      // b227: the condition, stated plainly. b229: reworded to the rule as it now actually is — being in
      // the game, not being at the screen. The dim branch is no longer an
      // "idle" scold; the only way to lose the blessing mid-session is to
      // genuinely lose the connection, so that is what it says.
      '<div class="tiny" style="margin-top:6px;color:var(--' + (live ? 'gold-2' : 'ink-2') + ')">' +
        (live
          ? 'Blessings remain active while you are online.'
          : 'Reconnecting — blessings resume when you are back online.') +
      '</div>';
  }

  // b220 (#14): the Blessing strip has moved OFF the Home panel and into the
  // Events destination, where the rest of the day's world event lives. On Home
  // it was a line of text that re-injected itself every five seconds, could not
  // be interacted with, and taught the player that the words "world event" mean
  // "a line of text". Home falls back to hosting it only while the Events panel
  // does not exist yet (early boot, or muster.js failing to load).
  function bannerHost() {
    return document.getElementById('hr-ev-blessing') || document.getElementById('panel-profile');
  }
  function injectBanner() {
    var sec = document.getElementById('hr-ev-blessing');
    if (!shown()) {
      var old = document.getElementById('hr-worldevents');
      if (old && old.parentNode) old.parentNode.removeChild(old);
      if (sec) sec.style.display = 'none';
      return;
    }
    if (sec) sec.style.display = '';
    var host = bannerHost();
    if (!host) return;
    var el = document.getElementById('hr-worldevents');
    if (!el) {
      el = document.createElement('div');
      el.id = 'hr-worldevents';
      el.className = 'card';
      el.style.cssText = 'margin-bottom:8px;padding:8px 12px';
    }
    if (el.parentNode !== host) {
      if (host.id === 'hr-ev-blessing') host.appendChild(el);
      else host.insertBefore(el, host.firstChild);
    }
    el.innerHTML = bannerHtml();
  }

  function boot() {
    try {
      injectBanner();
      // home dashboard re-renders wipe injected nodes — cheap keep-alive, and
      // it is also what makes the live/idle state above refresh on its own.
      setInterval(injectBanner, 5000);
      var d = daily(), w = weekly();
      var seenKey = 'hr-event-seen';
      var today = utcDayKey();
      if (shown() && localStorage.getItem(seenKey) !== today) {
        localStorage.setItem(seenKey, today);
        // Toasts render with textContent, so a glyph here can only ever be a
        // raw emoji character. Say it in words instead.
        if (window.notify) notify('Today’s blessing: ' + d.name + ' — ' + d.desc, 'info');
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
    isActive: blessingActive,
    shown: shown,
    EVENT_GLYPH: EVENT_GLYPH,
    utcDayKey: utcDayKey, utcWeekKey: utcWeekKey,
    renderBlessing: injectBanner,
    /* harness seams — see forceEvents() above */
    QUIET: QUIET,
    _force: forceEvents,
    _show: function (on) { _showOverride = (on === null || on === undefined) ? null : !!on; injectBanner(); },
    _hash: hash
  };
})();
