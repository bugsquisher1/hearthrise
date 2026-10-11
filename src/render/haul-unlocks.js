// ============================================================
// src/render/haul-unlocks.js — "what your haul unlocks" (W0, coherence audit Top-10 #1)
//
// The return was mostly numbers: it never said "you now have enough to build
// your Homestead" or "enough bars for an Iron Helm". This turns the bag into the
// next goal, in one short sentence, on the away receipt (Home card + welcome
// modal) and on Home.
//
// NOTHING HERE OWNS A NUMBER (CLAUDE.md §6). Every holding is the SERVER's:
//   items   HearthriseAccrual.gateItemCount (the projected player_inventory; NULL
//           until an envelope has stated the bag — never the display bag G.inventory)
//   gold    balKnown/balOr (the server-of-record balance)
//   levels  HearthriseSkillRecord.skillLevelOf (server XP; NULL when unknown)
//   worn    HearthriseEquipRead.equipmentOf (NULL when unknown: no gear is offered)
//   rung    HearthriseProperty (the next tier is offered only once the server has
//           stated the current one)
// UNKNOWN IS NEVER ENOUGH: a null holding fails the check, so the line can only
// under-claim. Costs are the real ones: features/homestead.js TIERS (bound to the
// server's unlock offers) and ARTISAN_RECIPES (the catalogue hr_activities is
// generated from), read through core artisan.recipeInputs.
//
// At most THREE unlocks (`MAX`), one per gear slot, the property rung first: a
// line, never a wall. `pick` is pure so the suite can drive it with a fixture.
// ============================================================
(function () {
  'use strict';

  var MAX = 3;
  var VERB = { smithing: 'forge', crafting: 'craft', cooking: 'cook' };

  function plain(m) { return !!m && typeof m === 'object' && !Array.isArray(m); }
  function nonneg(n) { n = Number(n); return (isFinite(n) && n >= 0) ? Math.floor(n) : null; }

  /* A gear piece's fighting worth: the sum of its bonus stats (`atkB`, `defB`,
     `magicAtkB` …). Read off the row's own keys, so a new bonus stat counts the
     day it is authored. `xpB` is a training bonus, not fighting worth. */
  function power(it) {
    if (!it) return 0;
    var p = 0;
    Object.keys(it).forEach(function (k) {
      if (k !== 'xpB' && /B$/.test(k) && typeof it[k] === 'number' && isFinite(it[k])) p += it[k];
    });
    return p;
  }

  function affordable(cost, ctx) {
    var keys = Object.keys(cost || {});
    if (!keys.length) return false;
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i], need = Number(cost[k]) || 0;
      var have = k === 'gold' ? ctx.gold : ctx.held(k);
      if (have === null || have === undefined || !(have >= need)) return false;
    }
    return true;
  }

  /* The haul item that most explains this unlock: the largest stack the absence
     brought home among the cost's own ids, or null if none of them came home. */
  function viaOf(cost, haul) {
    if (!plain(haul)) return null;
    var best = null;
    Object.keys(cost || {}).forEach(function (k) {
      var q = Number(haul[k]) || 0;
      if (k !== 'gold' && q > 0 && (!best || q > best.qty)) best = { id: k, qty: Math.floor(q) };
    });
    return best;
  }

  /* PURE. ctx = { held(id)->n|null, gold:n|null, next:{name,cost}|null,
     recipes:[{skill,req,inputs,output}], level(skill)->n|null, items, equipped,
     haul:{id:qty}|null, max }. With a haul, only unlocks it fed are returned. */
  function pick(ctx) {
    var out = [];
    var haul = plain(ctx.haul) ? ctx.haul : null;
    var max = Math.max(0, Number(ctx.max) || MAX);

    if (ctx.next && ctx.next.cost && affordable(ctx.next.cost, ctx)) {
      var v = viaOf(ctx.next.cost, haul);
      if (!haul || v) out.push({ kind: 'property', id: ctx.next.id || null, name: ctx.next.name, via: v });
    }

    /* An UNKNOWN worn set offers no gear: "an upgrade" is a claim about it. */
    var items = ctx.items || {}, eq = plain(ctx.equipped) ? ctx.equipped : null;
    var bestBySlot = {};
    (eq ? (ctx.recipes || []) : []).forEach(function (r) {
      var it = r && items[r.output];
      if (!it || !it.slot) return;
      var gain = power(it) - power(items[eq[it.slot]]);
      if (!(gain > 0)) return;                                     // not an upgrade on what is worn
      var lv = ctx.level(r.skill);
      if (lv === null || lv === undefined || lv < (Number(r.req) || 1)) return;
      var owned = ctx.held(r.output);
      if (owned === null || owned > 0 || eq[it.slot] === r.output) return;   // unknown or already have one
      if (!affordable(r.inputs, ctx)) return;
      var via = viaOf(r.inputs, haul);
      if (haul && !via) return;
      var cand = { kind: 'gear', id: r.output, name: it.n || r.output, skill: r.skill, slot: it.slot,
        gain: gain, req: Number(r.req) || 1, via: via };
      var cur = bestBySlot[it.slot];
      if (!cur || cand.gain > cur.gain || (cand.gain === cur.gain && cand.req > cur.req)) bestBySlot[it.slot] = cand;
    });
    Object.keys(bestBySlot).map(function (s) { return bestBySlot[s]; })
      .sort(function (a, b) { return (b.gain - a.gain) || (b.req - a.req) || String(a.name).localeCompare(String(b.name)); })
      .forEach(function (c) { out.push(c); });
    return out.slice(0, max);
  }

  // ── the live seams ─────────────────────────────────────────────────────
  /* The SERVER's worn set (net/equipment-record.js), or null while unknown. */
  function worn(G) {
    var ER = window.HearthriseEquipRead;
    try {
      var o = (ER && typeof ER.equipmentOf === 'function') ? ER.equipmentOf(G) : null;
      return (o && o.known && plain(o.map)) ? o.map : null;
    } catch (e) { return null; }
  }
  function context(haul) {
    var G = window.G || {};
    var A = window.HearthriseAccrual, H = window.HearthriseHomestead, SR = window.HearthriseSkillRecord;
    var C = window.HearthriseCore, inputsOf = C && C.artisan && C.artisan.recipeInputs;
    var held = function (id) {
      return (A && typeof A.gateItemCount === 'function') ? nonneg(A.gateItemCount(G, id)) : null;
    };
    var gold = null;
    try {
      if (typeof window.balKnown === 'function' && window.balKnown('gold') && typeof window.balOr === 'function') {
        gold = nonneg(window.balOr('gold', -1));
      }
    } catch (e) { gold = null; }
    var next = null;
    try { if (H && H.serverRungKnown() && typeof H.nextTier === 'function') next = H.nextTier(); } catch (e) { next = null; }
    var recipes = [];
    var AR = window.ARTISAN_RECIPES;
    if (plain(AR) && typeof inputsOf === 'function') {
      Object.keys(AR).forEach(function (skill) {
        (Array.isArray(AR[skill]) ? AR[skill] : []).forEach(function (r) {
          if (r && r.output) recipes.push({ skill: skill, req: r.req, inputs: inputsOf(r), output: r.output });
        });
      });
    }
    return {
      held: held, gold: gold, next: next, recipes: recipes,
      level: function (sk) {
        try { return (SR && typeof SR.skillLevelOf === 'function') ? SR.skillLevelOf(G, sk) : null; } catch (e) { return null; }
      },
      items: window.ITEMS || {}, equipped: worn(G), haul: haul || null, max: MAX,
    };
  }

  function article(name) { return /^[aeiou]/i.test(name) ? 'an' : 'a'; }
  function phrase(u) {
    if (u.kind === 'property') return 'build your ' + u.name;
    return (VERB[u.skill] || 'make') + ' ' + article(u.name) + ' ' + u.name;
  }
  function joinAnd(list) {
    if (list.length < 2) return list.join('');
    return list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1];
  }
  function itemName(id) {
    var it = window.ITEMS && window.ITEMS[id];
    return (it && it.n) || id;
  }

  /* One sentence, or '' when nothing is within reach. With a haul it leads with
     what came home ("With 412 Normal Log home, you have enough to build your
     Hearthside Homestead and forge an Iron Helm." — count-then-name, the ledger's
     own chip form); without, it is Home's standing line. */
  function lineFrom(list, haul) {
    if (!list.length) return '';
    var body = 'you have enough to ' + joinAnd(list.map(phrase)) + '.';
    var v = haul ? list[0].via : null;
    if (!v) return 'Y' + body.slice(1);
    return 'With ' + v.qty.toLocaleString() + ' ' + itemName(v.id) + ' home, ' + body;
  }
  function line(haul) {
    try { return lineFrom(pick(context(haul)), plain(haul) ? haul : null); } catch (e) { return ''; }
  }

  /* The welcome-back modal's row (legacy.js maybeShowWelcome): only a SERVER
     receipt's `itemsIn` is a haul. Escaped, because that modal renders rows raw. */
  function welcomeRow(off) {
    if (!off || off.serverAuthoritative !== true || !plain(off.itemsIn)) return null;
    var t = line(off.itemsIn);
    return t ? { g: 'uiHome', t: t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'), v: '' } : null;
  }

  window.HearthriseHaulUnlocks = { MAX: MAX, pick: pick, context: context, lineFrom: lineFrom, line: line,
    welcomeRow: welcomeRow };
})();
