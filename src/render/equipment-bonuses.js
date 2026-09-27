// ============================================================
// src/render/equipment-bonuses.js — Equipment bonuses presentation (render layer)
//
// FIFTH render-layer strangler-fig extraction out of src/legacy.js
// (structural track, 2026-08-18). See docs/design/render-extraction-pattern.md
// for the playbook every extraction follows.
//
// WHAT THIS IS: the READ-ONLY presentation surface of the equipment-bonus
// summary — renderEquipmentStatsHTML (builds the "summed bonuses of everything
// you're wearing" markup: bonus grid + armour-set line + worn list). It reads
// window.getEquipmentTotals() (the derived totals accessor), window.EQUIP_SLOT_META
// (slot labels) and window.getArmorSetBonus() (the set-bonus computation), names a
// set from the pieces actually worn, and paints. It neither computes nor mutates
// authoritative state — getEquipmentTotals / getArmorSetBonus are the LOGIC and
// stay in legacy.js; only the RENDER moved. Blast radius is the character-doll
// stats pane; zero risk to the economy or save path.
//
// b402: the standalone openEquipmentBonuses modal was retired here as confirmed
// dead code — the pop-out button that once opened it was removed long ago, leaving
// the function orphaned (zero live callers by bare call, inline onclick, or dynamic
// dispatch across src/**, index.html, tests/**). renderEquipmentStatsHTML remains
// the single live surface, consumed by buildTibiaDoll's Stats pane. Its modal-only
// CSS (.eqb-card/.eqb-head/.eqb-close in theme-cozy.css) was removed with it; the
// shared .eqb-grid/.eqb-row/.eqb-set classes stay (the Stats pane renders them).
//
// PURE REFACTOR. Byte-for-byte the same DOM and behaviour that used to live at
// legacy.js window.renderEquipmentStatsHTML. There are NO hardcoded theme colours
// in this JS; the set-bonus mark is now the gilt uiShield glyph. All colour lives in the
// .eqb-* selectors in src/styles/{audit-overrides,theme-cozy}.css.
//
// Globals are read via window.* (the established src/features/* convention),
// resolved at call time so this script may load in any order after legacy.js.
// renderEquipmentStatsHTML is re-exported onto window because legacy.js's
// buildTibiaDoll stats pane calls window.renderEquipmentStatsHTML() (two call sites).
// ============================================================
(function () {
  'use strict';

  /* A set is named from the pieces armorSetBonus counted (combat.js predicate):
     their longest common leading words, else tier + player-facing class word. */
  var CLASS_WORDS = { plate: 'heavy', leather: 'leather', cloth: 'cloth' };
  window.armourSetLabel = function (set, map, items) {
    var words = Object.values(map || {}).map(function (id) { return items && items[id]; }).filter(function (it) {
      return it && it.type === 'armor' && it.tier === set.tier && (it.armourClass || 'plate') === set.armourClass;
    }).map(function (it) { return String(it.n).split(' '); });
    var common = words.length ? words.reduce(function (a, w) {
      var i = 0; while (i < a.length && a[i] === w[i]) i++; return a.slice(0, i);
    }) : [];
    return common.length ? common.join(' ') + ' set'
      : 'tier-' + set.tier + ' ' + (CLASS_WORDS[set.armourClass] || set.armourClass) + ' set';
  };

  /* The crit chance the engine rolls against (gear + set + active buffs);
     null while the worn set is UNKNOWN, rendered as a pending mark. */
  window.getPlayerCritChance = function () {
    var E = window.HearthriseEquipRead;
    if (E && !E.isEquipmentKnown(window.G)) return null;
    return window.getPlayerCombatRolls(null).critChance;
  };

  window.renderEquipmentStatsHTML = function () {
    var t = window.getEquipmentTotals();
    var pct = { xpB: 1, spdB: 1 };
    var crit = window.getPlayerCritChance();
    var rows = t.fields.filter(function (f) { return f[0] === 'critB' ? crit !== 0 : t.totals[f[0]]; }).map(function (f) {
      var v = t.totals[f[0]];
      if (f[0] === 'critB') {
        return '<div class="eqb-row" title="Gear + set bonus + active buffs — what your hits roll against"><span>' + f[1] +
          '</span><b>' + (crit == null ? '—' : Math.round(crit * 100) + '%') + '</b></div>';
      }
      var shown = pct[f[0]] ? (Math.round(v * 1000) / 10) + '%' : (v >= 0 ? '+' : '') + v;
      return '<div class="eqb-row"><span>' + f[1] + '</span><b>' + shown + '</b></div>';
    }).join('') || '<div class="eqb-empty">Nothing equipped yet — gear up to see your bonuses here.</div>';
    var EQUIP_SLOT_META = window.EQUIP_SLOT_META || {};
    var wornList = t.worn.length
      ? t.worn.map(function (w) {
          var lbl = (EQUIP_SLOT_META[w.slot] && EQUIP_SLOT_META[w.slot].label) || w.slot;
          return '<div class="eqb-worn"><span>' + lbl + '</span><b>' + w.name + '</b></div>';
        }).join('')
      : '';
    /* Wave 5c: surface the armour SET bonus so completing a set is a legible goal. */
    var _set = (typeof window.getArmorSetBonus === 'function') ? window.getArmorSetBonus() : null;
    var setHtml = _set
      ? '<div class="eqb-set">'+((window.HR&&window.HR.icon)?(window.HR.icon('uiShield',14,'--gold-2')||''):'')+' Set bonus · <b>' + _set.pieces + '-piece ' + window.armourSetLabel(_set, window.HearthriseEquipRead ? window.HearthriseEquipRead.equipmentMap(window.G) : ((window.G && window.G.equipment) || {}), window.ITEMS) + '</b> — +' + Math.round(_set.critB * 100) + '% crit</div>'
      : '';
    return '<div class="eqb-grid">' + rows + '</div>' + setHtml +
      (wornList ? '<div class="eqb-sub">Equipped</div><div class="eqb-wornlist">' + wornList + '</div>' : '');
  };

  console.log('Equipment bonuses panel: loaded');
})();
