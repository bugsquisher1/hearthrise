// ════════════════════════════════════════════════════════════════════════
// src/features/lucky-finds.js — LUCKY FINDS, CLIENT HALF (content pack 1)
//
// A lucky find is a `{id, ch, lucky:true}` drop row (src/data/monsters.js): a
// very-rare named gear drop, 4-30 expected hours at its hunting spot. The
// SERVER rolls it (hr-accrue, hr_seed + a server secret) and mints it. This
// file does two things and decides nothing:
//
//   (i)  SILENCE THE CLIENT'S DICE. The live tick and the local away replay run
//        the same engine with a Math.random-seeded stream (core-bridge.js), so
//        they will "roll" lucky rows the server never did. Such a roll is never
//        shown or credited: no combat-log line, no toast, no bag/rail credit
//        (COMBAT_FX.addItem), no G.collection entry (collection-log.js wraps the
//        global addItem that credit would have reached), no drop-log count.
//        The RNG draw itself is untouched — core/combat-sim.js still walks the
//        row — so AWAY-1 parity holds; only presentation and credit are dropped.
//        Every NON-lucky row keeps legacy.js's existing 'RARE:' branch exactly.
//   (ii) REVEAL WHAT THE SERVER SAID. A settle response's `away.events` carries
//        {type:'rare_drop', item} (hr-accrue accrual.js onDrop). For a lucky
//        item that is the one and only announcement: a VERY RARE combat-log
//        line and a toast stating the BASE odds, once per item per envelope
//        version. It is exempt from "attended settles narrate nothing": the
//        rarest thing a player can meet while hunting is not chatter.
//
// CLAUDE.md §6 ("the browser never says one thing while the server says
// another") and Tyler's 2026-09-16 no-new-prediction ruling are the reason for
// (i); tests/lucky-finds.mjs holds the rows, LUCKY-1..4 (in-page) hold this.
// ════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  /* item id -> {mid, row}. A lucky item is a drop of exactly ONE row in the
     roster (tests/lucky-finds.mjs rule a), so the id alone identifies it —
     which matters, because COMBAT_FX.addItem is handed nothing but the id. */
  var _index = null;
  function index() {
    if (_index) return _index;
    var ms = window.MONSTERS;
    if (!ms) return {};
    var out = {};
    Object.keys(ms).forEach(function (mid) {
      (ms[mid].drops || []).forEach(function (d) { if (d && d.lucky) out[d.id] = { mid: mid, row: d }; });
    });
    _index = out;
    return out;
  }
  function isLucky(id) { return !!(id && Object.prototype.hasOwnProperty.call(index(), id)); }

  function itemName(id) { var it = window.ITEMS && window.ITEMS[id]; return (it && it.n) || id; }

  /* The BASE odds: the row through effectiveDropChance with the monster's own
     dropBonus and nothing else — no charm, no buff, no Boss of the Day, no
     Vigour — because those vary per player and per night. small_wolf's
     .0008 x 1.15 reads "1 in 1,087". */
  function baseOneIn(id) {
    var hit = index()[id];
    if (!hit) return null;
    var m = (window.MONSTERS || {})[hit.mid] || {};
    var D = window.HearthriseCore && window.HearthriseCore.drops;
    var ch = (D && typeof D.effectiveDropChance === 'function')
      ? D.effectiveDropChance(hit.row, { dropMult: m.dropBonus || 1 }) : hit.row.ch;
    return ch > 0 ? Math.round(1 / ch) : null;
  }

  /* ── (i) SILENCE THE CLIENT'S DICE ─────────────────────────────────────
     COMBAT_FX is legacy.js's ONE combat-fx object, published as
     HearthriseCombatSim.fx. Every kill path — the live tick's fresh
     combatSimCtx() and simulateAwayCombat's Object.assign copy — reads these
     properties at call time, so replacing them here covers both. */
  function hookCombatFx() {
    var S = window.HearthriseCombatSim;
    var fx = S && S.fx;
    if (!fx || fx.__hrLuckyHooked) return !!fx;
    fx.__hrLuckyHooked = true;
    var addItem = fx.addItem, onDrop = fx.onDrop, recordKill = fx.recordKill;
    fx.addItem = function (id) { if (isLucky(id)) return; return addItem.apply(this, arguments); };
    fx.onDrop = function (ev) { if (ev && isLucky(ev.id)) return; return onDrop.apply(this, arguments); };
    fx.recordKill = function (mid, dropped) {
      var kept = dropped;
      if (dropped && typeof dropped === 'object') {
        kept = {};
        Object.keys(dropped).forEach(function (k) { if (!isLucky(k)) kept[k] = dropped[k]; });
      }
      return recordKill.call(this, mid, kept);
    };
    return true;
  }
  /* legacy.js publishes HearthriseCombatSim at parse time and loads before
     this file, so this binds on the first try; LUCKY-1 asserts it did. */
  hookCombatFx();

  /* ── (ii) REVEAL WHAT THE SERVER SAID ──────────────────────────────────
     Called from the envelope funnel in src/net/accrue.js (the one every
     applied envelope passes, beside the Hearthfind reveal). Deduped on
     `version` so a replayed envelope — the replacement sheet re-applies the
     one the player consented to — says nothing twice. No events (a world-tick
     frame, a boot read) says nothing at all. */
  var _told = [];          // "version:item", most recent last, bounded
  var TOLD_MAX = 64;
  function noteEnvelope(res) {
    var ev = res && res.away && res.away.events;
    if (!Array.isArray(ev) || !ev.length) return 0;
    var ver = String(res.version);
    var said = 0;
    ev.forEach(function (e) {
      if (!e || e.type !== 'rare_drop' || !isLucky(e.item)) return;
      var key = ver + ':' + e.item;
      if (_told.indexOf(key) >= 0) return;
      _told.push(key);
      if (_told.length > TOLD_MAX) _told.shift();
      var name = itemName(e.item);
      var G = window.G;
      if (G && Array.isArray(G.combatLog)) G.combatLog.push('<span class="rare vrare">VERY RARE: ' + name + '</span>');
      var n = baseOneIn(e.item);
      var odds = n ? ' (base odds about 1 in ' + n.toLocaleString('en-US') + ')' : '';
      if (typeof window.notify === 'function') window.notify('Very rare find: ' + name + '!' + odds, 'levelup');
      said++;
    });
    return said;
  }

  window.HearthriseLuckyFinds = {
    isLucky: isLucky,
    baseOneIn: baseOneIn,
    noteEnvelope: noteEnvelope,
    /* test seam: forget what was announced (the in-page suite replays one
       envelope and must see the first apply speak). */
    __reset: function () { _told = []; _index = null; },
  };
})();
