// ============================================================
// src/features/world-events.js  (b204, SYS-5 · reworked b227)
//
// Daily + weekly WORLD EVENTS — "blessings" — shared by every player without
// a server: the event is picked deterministically from the UTC date (FNV-1a
// hash of the date string → index into the pool). Two clients on opposite
// sides of the world compute the same event.
//
// ── b227: THE CALENDAR *IS* THE ONLINE BONUS ──
// b226 paid a flat ×1.12 XP for being at the screen. Tyler replaced it:
// "if you're offline the event doesn't apply to you... you only get that
// stuff WHILE online. One week it may be 12% exp, another week it may be
// +10% gold find." So the flat multiplier is gone and these blessings are
// SESSION-GATED.
//
// ── b229: THE GATE IS BEING ONLINE, NOT PAYING ATTENTION ──
// b227's first cut also demanded a visible tab and recent input, which made
// the shipped copy say "this tab open". Tyler: "Reword this, that's
// confusing. The tab shouldn't need to be open, they just need to be
// online." So the gate is now: the game is OPEN and CONNECTED. A
// backgrounded tab with an activity running is blessed; an untouched screen
// is blessed. Only a CLOSED game — the offline catch-up — earns the steady
// base rate, and that boundary is held by legacy.js's replay latch, not by
// any "are they looking?" heuristic.
//
// That makes the online advantage a thing with a SHAPE: a Grand Fair week is
// worth +12% XP to everyone, a King's Bounty week is worth +10% gold find to
// whoever is killing things, and a week whose blessing misses your skill is
// worth nothing — which is a reason to check the calendar rather than a
// constant nobody could feel.
//
// Events grant bonuses through the keys getBonus() already consumes. EVERY
// key in the pools below has a live consumer — see the audit table above the
// pools. Adding a key nothing reads would be a promise the game never keeps.
//
// UI: the blessing card in the Events panel (Home hosts it only as a
// fallback) + a login toast + the live note beside the running activity.
// Daily events rotate at UTC midnight; weekly at the UTC week index (same
// weekly key scheme as the quest system).
// ============================================================
(function () {
  'use strict';

  // ── The wired-key audit (b227). A pool entry may only use a key that some
  // system actually reads; the smoke suite asserts each of these moves
  // something, so a future addition cannot quietly become a ghost.
  //
  //   allXP        → addXp()                       (legacy.js)
  //   combatXP     → addXp(), combat skills         (legacy.js)
  //   gatherSpeed  → activityIntervalMs()           (legacy.js)
  //   cookSpeed    → activityIntervalMs()           (legacy.js, artisan)
  //   smithSpeed   → activityIntervalMs()           (legacy.js, artisan)
  //   craftSpeed   → activityIntervalMs()           (legacy.js, artisan)
  //   prayerSpeed  → activityIntervalMs()           (legacy.js, artisan)
  //   farmYield    → harvestPlot()                  (legacy.js)
  //   goldFind     → applyGoldFind()                (legacy.js, wired b222)
  //   noBurn       → cookBurnChance()               (legacy.js, wired b225)
  //
  // DELIBERATELY ABSENT: `rareDrop`. It exists on pets and equipment as an
  // ITEM stat (getEquipmentStats().rareDrop), but nothing reads
  // getBonus('rareDrop') — a rare-drop blessing would render a promise the
  // engine cannot pay. It becomes poolable the day a drop-roll seam reads it.
  // Also absent: `restedXp` (potency is 0 until the Tavern ships) and
  // `raidPower` (raids are join-gated live content, which this rework leaves
  // untouched by design).
  //
  // MAGNITUDES. These are TEMPORARY power, which the clan-overhaul §8.4
  // budget accounts for separately from the ≤+52% permanent stack. They are
  // unchanged from b204 (plus the new families at comparable strength)
  // because presence-gating SHRANK their real contribution enormously: a
  // blessing used to be paid across all ~14.5 effective hours of a day, and
  // now rides only the ~2.5 hours the player is actually at the screen. The
  // headline day-average uplift from the whole calendar is ~+1.7%, against
  // the flat +12%-on-active-hours it replaces — so keeping the numbers is
  // the conservative choice, not the generous one.

  var DAILY = [
    { id: 'gather_surge',  name: 'Gathering Surge',   desc: '+25% gather speed',                bonus: { gatherSpeed: 0.25 } },
    { id: 'forge_fires',   name: 'Forge Fires',       desc: '+30% smithing & crafting speed',   bonus: { smithSpeed: 0.30, craftSpeed: 0.30 } },
    { id: 'harvest_fest',  name: 'Harvest Festival',  desc: '+2 farm yield',                    bonus: { farmYield: 2 } },
    { id: 'scholars_day',  name: "Scholar's Day",     desc: '+15% all XP',                      bonus: { allXP: 0.15 } },
    { id: 'hunters_moon',  name: "Hunter's Moon",     desc: '+20% combat XP',                   bonus: { combatXP: 0.20 } },
    { id: 'feast_day',     name: 'Feast Day',         desc: '+30% cooking speed',               bonus: { cookSpeed: 0.30 } },
    { id: 'quiet_vigil',   name: 'Quiet Vigil',       desc: '+30% prayer speed',                bonus: { prayerSpeed: 0.30 } },
    // b227 — the two families the daily pool never covered.
    { id: 'open_coffers',  name: 'The Open Coffers',  desc: '+15% gold find',                   bonus: { goldFind: 0.15 } },
    { id: 'steady_fire',   name: 'The Steady Fire',   desc: '−25% burn chance · +10% cooking speed', bonus: { noBurn: 0.25, cookSpeed: 0.10 } }
  ];

  var WEEKLY = [
    // Tyler's two worked examples are entries 1 and 2, at his numbers.
    { id: 'grand_fair',   name: 'The Grand Fair',   desc: '+12% all XP',                   bonus: { allXP: 0.12 } },
    { id: 'kings_bounty', name: "The King's Bounty", desc: '+10% gold find',               bonus: { goldFind: 0.10 } },
    { id: 'deep_veins',   name: 'Deep Veins',       desc: '+15% gather speed',             bonus: { gatherSpeed: 0.15 } },
    { id: 'war_drums',    name: 'War Drums',        desc: '+15% combat XP',                bonus: { combatXP: 0.15 } },
    { id: 'guild_works',  name: 'Guild Works',      desc: '+20% artisan speed',            bonus: { cookSpeed: 0.20, smithSpeed: 0.20, craftSpeed: 0.20 } },
    { id: 'long_harvest', name: 'The Long Harvest', desc: '+1 farm yield · +8% gather speed', bonus: { farmYield: 1, gatherSpeed: 0.08 } }
  ];

  // How each key reads in a sentence. One map, so the activity note, the
  // blessing card and any future surface all name a bonus the same way.
  var KEY_LABEL = {
    allXP: 'all XP', combatXP: 'combat XP', gatherSpeed: 'gather speed',
    cookSpeed: 'cooking speed', smithSpeed: 'smithing speed',
    craftSpeed: 'crafting speed', prayerSpeed: 'prayer speed',
    farmYield: 'farm yield', goldFind: 'gold find', noBurn: 'burn chance'
  };
  // Flat-value keys print as "+2 farm yield"; the rest as "+25%".
  var FLAT_KEYS = { farmYield: 1 };

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
  var QUIET = { id: 'quiet_season', name: 'A Quiet Season', desc: 'no blessing', bonus: {} };

  // ── THE GATE ──────────────────────────────────────────────────────────────
  // The single question "is the calendar paying right now?". It defers to
  // legacy.js's session layer, which owns both halves of the answer: we are
  // not inside an offline replay AND the session is online. If that layer is
  // missing we answer NO — this module wraps getBonus for the whole game, and
  // the failure mode of a silent extra +25% paid to a catch-up is far worse
  // than the failure mode of a missing one. (Note the asymmetry with
  // sessionOnline() itself, which fails OPEN: there, "no disconnection signal"
  // genuinely means online. Here, "no gate at all" means the replay latch is
  // missing too, which is the dangerous direction.)
  function blessingActive() {
    var P = window.HearthrisePresence;
    if (!P || typeof P.blessingsApply !== 'function') return false;
    try { return !!P.blessingsApply(); } catch (e) { return false; }
  }

  // What the calendar OFFERS for a key — the raw pool value, ungated. This is
  // what the UI reads to describe the day; it is never what the engine pays.
  function bonusFor(key) {
    var t = 0;
    var d = daily(), w = weekly();
    if (d && d.bonus[key]) t += d.bonus[key];
    if (w && w.bonus[key]) t += w.bonus[key];
    return t;
  }
  // What the calendar actually PAYS for a key, right now. This is the only
  // one getBonus consults.
  function liveBonusFor(key) {
    return blessingActive() ? bonusFor(key) : 0;
  }

  // The blessing that touches a given set of keys, described in words — used
  // by the live activity note so a "+30% smithing" hint can never appear
  // beside a woodcutting bar. Prefers the daily (it is the one that changes
  // most often, so it is the one worth pointing at); falls back to the weekly.
  function describe(ev, keys) {
    if (!ev) return null;
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var v = ev.bonus[k];
      if (!v) continue;
      var label = KEY_LABEL[k] || k;
      var amount = FLAT_KEYS[k] ? ('+' + v) : ((k === 'noBurn' ? '−' : '+') + Math.round(v * 100) + '%');
      return { id: ev.id, name: ev.name, key: k, value: v, effect: amount + ' ' + label };
    }
    return null;
  }
  function summaryFor(keys) {
    if (!keys || !keys.length) return null;
    return describe(daily(), keys) || describe(weekly(), keys);
  }

  // ── wire into getBonus (thin additive layer; every system inherits it) ──
  var origGetBonus = window.getBonus;
  if (typeof origGetBonus === 'function') {
    window.getBonus = function (key) {
      var t = origGetBonus.apply(this, arguments);
      try { t += liveBonusFor(key); } catch (e) {}
      return t;
    };
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
      return '<span style="font-size:13.5px;background:' + (strong ? 'rgba(201,162,74,.10)' : 'rgba(255,255,255,.04)') +
        ';border:1px solid var(--' + (strong ? 'line' : 'line-soft') + ');border-radius:99px;padding:3px 10px' +
        (live ? '' : ';opacity:.55') + '">' +
        gly(ev.id) + ' <b>' + ev.name + '</b> <span class="muted">— ' + ev.desc + ' · ' + when + '</span></span>';
    };
    return '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">' +
      (onEvents ? '' : '<span class="tiny" style="text-transform:uppercase;letter-spacing:.08em;font-weight:800;color:var(--gold-2)">World events</span>') +
      pill(d, 'today', true) + pill(w, 'this week', false) +
      '</div>' +
      // b227: the condition, stated plainly and in the same place as the
      // bonus. b229: reworded to the rule as it now actually is — being in
      // the game, not being at the screen. The dim branch is no longer an
      // "idle" scold; the only way to lose the blessing mid-session is to
      // genuinely lose the connection, so that is what it says.
      '<div class="tiny" style="margin-top:6px;color:var(--' + (live ? 'gold-2' : 'ink-2') + ')">' +
        (live
          ? 'Alive while you’re in the game. Away? You earn the steady base rate.'
          : 'Reconnecting — blessings resume the moment you’re back online.') +
      '</div>';
  }

  // b220 (#14): the Blessing strip has moved OFF the Home panel and into the
  // Events destination, where the rest of the day's world event lives. On Home
  // it was a line of text that re-injected itself every five seconds, could not
  // be interacted with, and taught the player that the words "world event" mean
  // "a line of text". Home falls back to hosting it only while the Events panel
  // does not exist yet (early boot, or muster.js failing to load) — a bonus the
  // player is already receiving must never become invisible.
  function bannerHost() {
    return document.getElementById('hr-ev-blessing') || document.getElementById('panel-profile');
  }
  function injectBanner() {
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
      if (localStorage.getItem(seenKey) !== today) {
        localStorage.setItem(seenKey, today);
        // Toasts render with textContent, so a glyph here can only ever be a
        // raw emoji character. Say it in words instead.
        if (window.notify) notify('Today’s blessing: ' + d.name + ' — ' + d.desc + ', alive while you’re in the game', 'info');
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
    bonusFor: bonusFor,               // what the calendar OFFERS (ungated)
    liveBonusFor: liveBonusFor,       // what it PAYS right now (gated)
    isActive: blessingActive,
    summaryFor: summaryFor,
    KEY_LABEL: KEY_LABEL,
    EVENT_GLYPH: EVENT_GLYPH,
    utcDayKey: utcDayKey, utcWeekKey: utcWeekKey,
    renderBlessing: injectBanner,
    /* harness seams — see forceEvents() above */
    QUIET: QUIET,
    _force: forceEvents,
    _hash: hash
  };
})();
