// ============================================================
// src/features/rarity.js  (b186)
//
// Standard RPG item-rarity system. Gear "visibly upgrades" via a
// coloured BORDER around the item medallion — NOT by recolouring the
// painted sprite (Tyler's call, 2026-08-08). Six tiers + unique:
//   common=gray  uncommon=green  rare=blue  epic=purple
//   legendary=gold  mythic=deep red   unique=teal (cool one TBD)
//
// window.itemRarity(id) resolves a game item id -> tier string (or null
// for non-gear, which gets no border). Precedence:
//   1. explicit ITEMS[id].rarity   2. named-unique override
//   3. value thresholds (auto — future gear works with no data edits)
//
// window.RARITY.classFor(id) -> 'rr-rare' etc (or '' ). The frame CSS
// (.rr-frame + .rr-<tier>) is injected here so any render site can opt
// in by adding those classes to an icon wrapper.
// ============================================================
(function () {
  'use strict';

  var TIERS = {
    common:    { label: 'Common',    color: '#8d949c', glow: 'rgba(141,148,156,.00)' },
    uncommon:  { label: 'Uncommon',  color: '#5aa84f', glow: 'rgba(90,168,79,.35)' },
    rare:      { label: 'Rare',      color: '#3f83d6', glow: 'rgba(63,131,214,.40)' },
    epic:      { label: 'Epic',      color: '#9a55c9', glow: 'rgba(154,85,201,.45)' },
    legendary: { label: 'Legendary', color: '#e0b23c', glow: 'rgba(224,178,60,.55)' },
    mythic:    { label: 'Mythic',    color: '#c0392b', glow: 'rgba(192,57,43,.55)' },
    unique:    { label: 'Unique',    color: '#16b3a6', glow: 'rgba(22,179,166,.55)' }
  };
  var ORDER = ['common','uncommon','rare','epic','legendary','mythic','unique'];

  // Named one-off items that should always read as Unique regardless of value.
  var UNIQUE = {
    captains_ribblade: 1, chief_blade: 1, alpha_cloak: 1,
    war_crown: 1, void_core: 1, hollow_sigil: 1
  };

  // Only these item types carry a rarity border. Everything else -> null.
  var GEAR_TYPES = { weapon: 1, armor: 1, jewelry: 1, ammo: 1 };

  function rarityByValue(v) {
    v = v || 0;
    if (v < 150)   return 'common';
    if (v < 350)   return 'uncommon';
    if (v < 1000)  return 'rare';
    if (v < 2500)  return 'epic';
    if (v < 8000)  return 'legendary';
    return 'mythic';
  }

  function itemRarity(id, item) {
    var ITEMS = window.ITEMS || (window.DATA && window.DATA.ITEMS) || {};
    var it = item || ITEMS[id];
    if (!it) return null;
    if (it.rarity && TIERS[it.rarity]) return it.rarity;   // explicit wins
    if (UNIQUE[id]) return 'unique';
    if (!GEAR_TYPES[it.type]) return null;                 // non-gear = no border
    return rarityByValue(it.v);
  }

  function classFor(id, item) {
    var r = itemRarity(id, item);
    return r ? 'rr-' + r : '';
  }
  function colorFor(id, item) {
    var r = itemRarity(id, item);
    return r ? TIERS[r].color : null;
  }

  function css() {
    var lines = [
      // Frame wrapper: a rounded medallion whose border carries the rarity.
      '.rr-frame{position:relative;border:2px solid var(--rr-color,transparent);' +
        'border-radius:10px;box-shadow:0 0 0 1px rgba(0,0,0,.35),0 0 9px -1px var(--rr-glow,transparent);' +
        'background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(0,0,0,.12));overflow:hidden}',
      // slightly stronger presence for the top tiers
      '.rr-legendary,.rr-mythic,.rr-unique{box-shadow:0 0 0 1px rgba(0,0,0,.4),0 0 14px -2px var(--rr-glow,transparent)}'
    ];
    ORDER.forEach(function (k) {
      lines.push('.rr-' + k + '{--rr-color:' + TIERS[k].color + ';--rr-glow:' + TIERS[k].glow + '}');
    });
    return lines.join('\n');
  }

  function mount() {
    if (!document.getElementById('rr-css')) {
      var st = document.createElement('style');
      st.id = 'rr-css';
      st.textContent = css();
      (document.head || document.documentElement).appendChild(st);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();

  window.RARITY = {
    TIERS: TIERS, ORDER: ORDER,
    of: itemRarity, classFor: classFor, colorFor: colorFor,
    label: function (id, item) { var r = itemRarity(id, item); return r ? TIERS[r].label : ''; }
  };
  window.itemRarity = itemRarity;
})();
