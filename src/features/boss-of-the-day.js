// ============================================================
// src/features/boss-of-the-day.js — Featured "Boss of the Day" (b254)
//
// The boss-ecosystem wave, step 1. The audit found bosses lived in three
// disconnected systems and there was NO solo-facing "featured boss" surface —
// only clan Hunt bosses and stat blessings rotated. This adds one:
//
//   • A single curated boss is FEATURED each UTC day, picked deterministically
//     from the same rotation clock the daily blessing + clan Hunt already use
//     (HearthriseWorldEvents._hash + utcDayKey), so every client agrees and it
//     needs no server round-trip.
//   • Fighting the featured boss pays a bonus: +50% drop chance on its
//     non-guaranteed drops and +25% combat XP (applied in killMonster). A reason
//     to check in daily and to actually seek the boss out — a retention hook.
//   • A card in the Combat panel shows the boss, a LOOT PREVIEW (its notable
//     drops with odds — closing the Wave-2 "see loot before you commit" gap for
//     this surface), a countdown to rotation, and a Fight button that jumps
//     straight into the encounter (level-gated like the monster list).
//
// SAFE TO EXTEND: the pool is data; add ids and the rotation absorbs them.
// ============================================================

(function () {
  'use strict';

  // Curated pool — the marquee mid→endgame monsters, so a week's rotation has
  // real variety and always lands on something that feels like an event. Ids
  // are filtered against MONSTERS at read time, so a cut/renamed id is skipped
  // rather than crashing.
  var POOL = [
    'dark_wizard', 'venom_spider', 'goblin_brute', 'zombie', 'warlock',
    'plague_swarm', 'goblin_warlord', 'bear', 'wraith', 'lesser_demon', 'mountain_troll',
    'shadow_creeper', 'warband_captain', 'panther', 'death_knight', 'archmage',
    'void_parasite', 'war_king', 'ancient_bear', 'lich', 'dragon'
  ];

  var BONUS = { dropMult: 1.5, xpMult: 1.25 };  // while a monster is featured

  /* Wave 6: the WEEKLY boss — a bigger, rarer event on a 7-day clock. Drawn from
     the apex end of the roster so it always feels like the week's marquee fight,
     and it pays double drops + 50% XP (vs the daily's +50%/+25%). "I need to make
     sure I do this this week." */
  var WEEKLY_POOL = [
    'death_knight', 'archmage', 'war_king', 'ancient_bear', 'lich', 'dragon', 'void_parasite'
  ];
  var WEEKLY_BONUS = { dropMult: 2.0, xpMult: 1.5 };

  function WE() { return window.HearthriseWorldEvents; }

  function pool() {
    var M = window.MONSTERS || {};
    return POOL.filter(function (id) { return M[id]; });
  }
  function weeklyPool() {
    var M = window.MONSTERS || {};
    return WEEKLY_POOL.filter(function (id) { return M[id]; });
  }
  // Deterministic UTC week number (days since epoch / 7) — same idea as utcDayKey.
  function weekKey() {
    var d = new Date();
    var dayNum = Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86400000);
    return Math.floor(dayNum / 7);
  }
  function weeklyId(wk) {
    var we = WE(), p = weeklyPool();
    if (!we || !p.length) return null;
    return p[we._hash('hr-weekly-boss-' + (wk == null ? weekKey() : wk)) % p.length];
  }
  function isWeekly(id) { return !!id && id === weeklyId(); }
  function msUntilWeeklyRotate() {
    var d = new Date();
    var dayNum = Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86400000);
    var daysIntoWeek = dayNum % 7;
    var nextWeekMidnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + (7 - daysIntoWeek), 0, 0, 0, 0);
    return Math.max(0, nextWeekMidnight - d.getTime());
  }

  // Deterministic daily pick — same hash/day-key machinery as the blessing.
  function featuredId(dayKey) {
    var we = WE(), p = pool();
    if (!we || !p.length) return null;
    var key = dayKey || we.utcDayKey();
    return p[we._hash('hr-boss-' + key) % p.length];
  }

  function isFeatured(id) { return !!id && id === featuredId(); }

  // Read by killMonster — 1× multipliers when the kill isn't a featured boss.
  // The WEEKLY boss (bigger bonus) takes precedence over the daily.
  function killBonuses(id) {
    if (isWeekly(id)) return { dropMult: WEEKLY_BONUS.dropMult, xpMult: WEEKLY_BONUS.xpMult };
    return isFeatured(id)
      ? { dropMult: BONUS.dropMult, xpMult: BONUS.xpMult }
      : { dropMult: 1, xpMult: 1 };
  }

  // ms until the next UTC midnight (when the boss rotates).
  function msUntilRotate() {
    var now = new Date();
    var next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0);
    return Math.max(0, next - now.getTime());
  }

  function fmtCountdown(ms) {
    var s = Math.floor(ms / 1000);
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return h + ':' + pad(m) + ':' + pad(sec);
  }

  function combatLevel() {
    return (typeof window.getCombatLevel === 'function') ? window.getCombatLevel() : 1;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Notable drops for the preview: rarest first (the exciting ones), skipping
  // guaranteed junk. Up to `n`.
  function notableDrops(m, n) {
    return (m.drops || [])
      .filter(function (d) { return d.ch < 1; })
      .slice()
      .sort(function (a, b) { return a.ch - b.ch; })
      .slice(0, n || 4);
  }

  function pct(ch) {
    var p = ch * 100;
    return p >= 1 ? Math.round(p) + '%' : p.toFixed(1) + '%';
  }

  /* b283 (studio-review P1): draw the PAINTED monster portrait when one exists —
     many featured mobs (dragon, lich, death_knight…) already have 128px art that
     was being ignored in favour of the data emoji. Emoji only as last resort. */
  function bossIconHtml(id, m) {
    var path = window._monsterIcon && window._monsterIcon[id];
    if (path) return '<img src="' + path + '" alt="" style="width:100%;height:100%;object-fit:contain">';
    return m && m.icon ? m.icon : '';
  }

  // ── The card ──────────────────────────────────────────────
  function ensureCard() {
    var panel = document.getElementById('panel-combat');
    if (!panel) return null;
    var card = document.getElementById('hr-botd-card');
    if (!card) {
      card = document.createElement('div');
      card.id = 'hr-botd-card';
      card.className = 'card hr-botd';
    }
    // Live with the monster picker ("choose a fight"), so the mobile sub-tabs
    // keep it on the Foes tab and out of an active fight. Sit just before the
    // picker card; fall back to the panel top if the picker isn't there yet.
    var picker = panel.querySelector('.combat-picker');
    var target = picker || panel.firstChild;
    if (card.parentElement !== panel || (picker && card.nextElementSibling !== picker)) {
      panel.insertBefore(card, target);
    }
    return card;
  }

  function render() {
    var card = ensureCard();
    if (!card) return;
    var M = window.MONSTERS || {};
    var id = featuredId();
    var m = id && M[id];
    if (!m) { card.style.display = 'none'; return; }
    card.style.display = '';

    var req = (m.tier - 1) * 15;
    var unlocked = combatLevel() >= req;
    var fighting = window.G && window.G.activeMonster === id;

    var lootHtml = notableDrops(m, 4).map(function (d) {
      var it = (window.ITEMS || {})[d.id];
      return '<span class="botd-drop"><b>' + esc(it && it.n ? it.n : d.id) + '</b>' +
             '<em>' + pct(d.ch) + '</em></span>';
    }).join('');
    if (!lootHtml) lootHtml = '<span class="botd-drop muted">Gold &amp; common spoils</span>';

    var weak = (window.WEAPON_TYPES && window.WEAPON_TYPES[m.weaponWeak]) || m.weaponWeak || '—';

    var btn = fighting
      ? '<button class="btn btn-sm" disabled>In the fight…</button>'
      : unlocked
        ? '<button class="btn btn-sm btn-primary" onclick="window.HearthriseBossOfDay.fight()">Fight ' + esc(m.name) + '</button>'
        : '<button class="btn btn-sm" disabled>Unlocks at Combat Lv ' + req + '</button>';

    card.innerHTML =
      '<div class="botd-head">' +
        '<span class="botd-kicker">Boss of the Day</span>' +
        '<span class="botd-timer" id="hr-botd-timer">new in ' + fmtCountdown(msUntilRotate()) + '</span>' +
      '</div>' +
      '<div class="botd-body">' +
        '<span class="botd-icon">' + bossIconHtml(id, m) + '</span>' +
        '<div class="botd-main">' +
          '<div class="botd-name">' + esc(m.name) + '</div>' +
          '<div class="botd-sub">' + esc(m.family || 'Monster') + ' · weak to ' + esc(weak) + '</div>' +
          '<div class="botd-bonus">+' + Math.round((BONUS.dropMult - 1) * 100) + '% drops · +' +
             Math.round((BONUS.xpMult - 1) * 100) + '% combat XP while featured</div>' +
        '</div>' +
      '</div>' +
      '<div class="botd-loot"><span class="botd-loot-lab">Notable drops</span>' + lootHtml + '</div>' +
      '<div class="botd-foot">' + btn + '</div>';
  }

  function fmtWeekCountdown(ms) {
    var d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000);
    return d + 'd ' + h + 'h ' + m + 'm';
  }

  // ── The weekly card (sits directly under the daily card) ──
  function ensureWeeklyCard() {
    var panel = document.getElementById('panel-combat');
    if (!panel) return null;
    var card = document.getElementById('hr-weekly-card');
    if (!card) {
      card = document.createElement('div');
      card.id = 'hr-weekly-card';
      card.className = 'card hr-botd hr-weekly';
    }
    var daily = document.getElementById('hr-botd-card');
    if (daily && daily.parentElement === panel) {
      if (card.previousElementSibling !== daily) panel.insertBefore(card, daily.nextSibling);
    } else if (card.parentElement !== panel) {
      var picker = panel.querySelector('.combat-picker');
      panel.insertBefore(card, picker || panel.firstChild);
    }
    return card;
  }

  function renderWeekly() {
    var card = ensureWeeklyCard();
    if (!card) return;
    var M = window.MONSTERS || {};
    var id = weeklyId();
    var m = id && M[id];
    if (!m) { card.style.display = 'none'; return; }
    card.style.display = '';
    var req = (m.tier - 1) * 15;
    var unlocked = combatLevel() >= req;
    var fighting = window.G && window.G.activeMonster === id;
    var lootHtml = notableDrops(m, 4).map(function (d) {
      var it = (window.ITEMS || {})[d.id];
      return '<span class="botd-drop"><b>' + esc(it && it.n ? it.n : d.id) + '</b><em>' + pct(d.ch) + '</em></span>';
    }).join('') || '<span class="botd-drop muted">Gold &amp; common spoils</span>';
    var weak = (window.WEAPON_TYPES && window.WEAPON_TYPES[m.weaponWeak]) || m.weaponWeak || '—';
    var btn = fighting
      ? '<button class="btn btn-sm" disabled>In the fight…</button>'
      : unlocked
        ? '<button class="btn btn-sm btn-primary" onclick="window.HearthriseBossOfDay.fightWeekly()">Fight ' + esc(m.name) + '</button>'
        : '<button class="btn btn-sm" disabled>Unlocks at Combat Lv ' + req + '</button>';
    card.innerHTML =
      '<div class="botd-head">' +
        '<span class="botd-kicker">★ Weekly Boss</span>' +
        '<span class="botd-timer" id="hr-weekly-timer">resets in ' + fmtWeekCountdown(msUntilWeeklyRotate()) + '</span>' +
      '</div>' +
      '<div class="botd-body">' +
        '<span class="botd-icon">' + bossIconHtml(id, m) + '</span>' +
        '<div class="botd-main">' +
          '<div class="botd-name">' + esc(m.name) + '</div>' +
          '<div class="botd-sub">' + esc(m.family || 'Monster') + ' · weak to ' + esc(weak) + '</div>' +
          '<div class="botd-bonus">+' + Math.round((WEEKLY_BONUS.dropMult - 1) * 100) + '% drops · +' +
             Math.round((WEEKLY_BONUS.xpMult - 1) * 100) + '% combat XP this week</div>' +
        '</div>' +
      '</div>' +
      '<div class="botd-loot"><span class="botd-loot-lab">Notable drops</span>' + lootHtml + '</div>' +
      '<div class="botd-foot">' + btn + '</div>';
  }

  function fightWeekly() {
    var id = weeklyId(); if (!id) return;
    var m = (window.MONSTERS || {})[id]; if (!m) return;
    if (combatLevel() < (m.tier - 1) * 15) {
      if (window.notify) window.notify('You are not strong enough for ' + m.name + ' yet.', 'kill');
      return;
    }
    if (typeof window.showTab === 'function') window.showTab('combat');
    if (typeof window.selectTier === 'function') { try { window.selectTier(m.tier); } catch (e) {} }
    if (typeof window.startCombat === 'function') window.startCombat(id);
  }

  // Jump into the featured fight (level-gated at the button, re-checked here).
  function fight() {
    var id = featuredId();
    if (!id) return;
    var m = (window.MONSTERS || {})[id];
    if (!m) return;
    if (combatLevel() < (m.tier - 1) * 15) {
      if (window.notify) window.notify('You are not strong enough for ' + m.name + ' yet.', 'kill');
      return;
    }
    if (typeof window.showTab === 'function') window.showTab('combat');
    // Match the tier chip so the monster list also reflects the jump.
    if (typeof window.selectTier === 'function') { try { window.selectTier(m.tier); } catch (e) {} }
    if (typeof window.startCombat === 'function') window.startCombat(id);
  }

  // Just update the countdown text cheaply each second; full re-render on the
  // slower tick (and whenever the card is missing / the day rolled over).
  /* b292 (paione: "Weekly and daily boss keeps coming out in the middle of combat").
     b290 added CSS to hide both cards during a fight, but CSS alone proved fragile
     (cascade order / stale cached sheets / desktop widths where the mobile sub-tab
     rules never apply). Enforce it in JS on the same tick that drives the cards, so
     the moment a fight starts they are gone regardless of stylesheet state. */
  function applyCombatVisibility() {
    var fighting = !!(window.G && window.G.activeMonster);
    ['hr-botd-card', 'hr-weekly-card'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      if (fighting) el.style.setProperty('display', 'none', 'important');
      else el.style.removeProperty('display');
    });
  }

  var lastDay = null, lastWeek = null;
  function tick() {
    applyCombatVisibility();
    var we = WE();
    var today = we ? we.utcDayKey() : null;
    var thisWeek = weekKey();
    var card = document.getElementById('hr-botd-card');
    if (!card || today !== lastDay) { lastDay = today; render(); }
    else { var timer = document.getElementById('hr-botd-timer'); if (timer) timer.textContent = 'new in ' + fmtCountdown(msUntilRotate()); }
    var wcard = document.getElementById('hr-weekly-card');
    if (!wcard || thisWeek !== lastWeek) { lastWeek = thisWeek; renderWeekly(); }
    else { var wtimer = document.getElementById('hr-weekly-timer'); if (wtimer) wtimer.textContent = 'resets in ' + fmtWeekCountdown(msUntilWeeklyRotate()); }
    applyCombatVisibility();   // after any re-render, so it cannot re-show mid-fight
  }

  function boot() {
    render();
    renderWeekly();
    setInterval(tick, 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.HearthriseBossOfDay = {
    POOL: POOL, BONUS: BONUS,
    WEEKLY_POOL: WEEKLY_POOL, WEEKLY_BONUS: WEEKLY_BONUS,
    featuredId: featuredId,
    isFeatured: isFeatured,
    weeklyId: weeklyId,
    isWeekly: isWeekly,
    killBonuses: killBonuses,
    msUntilRotate: msUntilRotate,
    msUntilWeeklyRotate: msUntilWeeklyRotate,
    render: render,
    renderWeekly: renderWeekly,
    fight: fight,
    fightWeekly: fightWeekly
  };
})();
