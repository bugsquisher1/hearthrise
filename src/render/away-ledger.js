// ============================================================
// src/render/away-ledger.js — the Morning Ledger (render layer)
//
// The away receipt, itemised: what the night brought home, which skills it
// trained and what it used up, under the Home "While you were away" card.
//
// NOTHING HERE OWNS A NUMBER (CLAUDE.md §6). Every row is read from the three
// maps summaryFromAway (src/net/accrue.js) copies off the server's own receipt
// (itemsIn, itemsUsed, xpBySkill); this file reads its argument plus the item,
// skill and rarity catalogues, never G and never a prediction. An id the
// catalogue does not know is counted in "and N more", never printed raw.
// "Used up" is a NET bag movement, so it never says what was eaten or burned.
//
// No inline style and no colour here: src/styles/away-ledger.css owns the look.
// ============================================================
(function () {
  'use strict';

  var CHIP_CAP = 6, SKILL_CAP = 3, USED_CAP = 3;
  var LOUD = { rare: 1, epic: 1, legendary: 1, mythic: 1, unique: 1 };

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function num(n) { return (n | 0).toLocaleString(); }
  function plain(m) { return !!m && typeof m === 'object' && !Array.isArray(m); }
  function positives(m) {
    return plain(m) ? Object.keys(m).filter(function (k) { return Number(m[k]) > 0; }) : [];
  }

  function rank(id) {
    var R = window.RARITY;
    if (!R || !Array.isArray(R.ORDER) || typeof R.of !== 'function') return -1;
    var r = R.of(id);
    return r ? R.ORDER.indexOf(r) : -1;
  }
  function more(k, tail) {
    return k > 0 ? '<span class="hd-al-more">and ' + num(k) + ' more' + tail + '</span>' : '';
  }
  function row(head, cells, rest, tail) {
    if (!cells.length) return '';
    return '<div class="hd-al-row"><span class="hd-al-h">' + esc(head) + '</span>' +
      cells.join('') + more(rest, tail) + '</div>';
  }

  function broughtHome(m) {
    var ITEMS = window.ITEMS || {}, R = window.RARITY;
    var all = positives(m);
    var known = all.filter(function (id) { return ITEMS[id] && ITEMS[id].n; });
    known.sort(function (a, b) {
      return (rank(b) - rank(a)) || (m[b] - m[a]) ||
        String(ITEMS[a].n).localeCompare(String(ITEMS[b].n));
    });
    var shown = known.slice(0, CHIP_CAP);
    var cells = shown.map(function (id) {
      var tier = R && typeof R.of === 'function' ? R.of(id) : null;
      var tag = LOUD[tier] && typeof R.label === 'function' ? ' · ' + R.label(id) : '';
      var insp = typeof window.hrInspectAttrs === 'function' ? window.hrInspectAttrs(id) : '';
      return '<span class="hd-al-chip"' + insp + '>' + esc(num(m[id]) + ' ' + ITEMS[id].n + tag) + '</span>';
    });
    return row('Brought home', cells, all.length - shown.length, '');
  }

  function skills(m) {
    var DEF = window.SKILLS_DEF || {};
    var all = positives(m);
    var known = all.filter(function (k) { return DEF[k] && DEF[k].name; });
    known.sort(function (a, b) { return (m[b] - m[a]) || String(DEF[a].name).localeCompare(String(DEF[b].name)); });
    var shown = known.slice(0, SKILL_CAP);
    var cells = shown.map(function (k) {
      return '<span class="hd-al-chip">' + esc(DEF[k].name + ' +' + num(m[k]) + ' XP') + '</span>';
    });
    return row('Skills', cells, all.length - shown.length, ' skills');
  }

  function usedUp(m) {
    var ITEMS = window.ITEMS || {};
    var all = positives(m);
    var known = all.filter(function (id) { return ITEMS[id] && ITEMS[id].n; });
    known.sort(function (a, b) { return (m[b] - m[a]) || String(ITEMS[a].n).localeCompare(String(ITEMS[b].n)); });
    var shown = known.slice(0, USED_CAP);
    var cells = shown.map(function (id) {
      return '<span class="hd-al-chip">' + esc(num(m[id]) + ' ' + ITEMS[id].n) + '</span>';
    });
    return row('Used up', cells, all.length - shown.length, '');
  }

  function html(off) {
    if (!off || off.serverAuthoritative !== true) return '';
    var loud = (Number(off.gainedItems) > 0) || (Number(off.gainedXp) > 0) ||
      (Number(off.gainedGold) > 0) || (Number(off.gainedKills) > 0) || (Number(off.burnt) > 0);
    if (!loud) return '';
    var rows = broughtHome(off.itemsIn) + skills(off.xpBySkill) + usedUp(off.itemsUsed);
    return rows ? '<div class="hd-away-ledger">' + rows + '</div>' : '';
  }

  window.HearthriseAwayLedger = { html: html };
})();
