// ════════════════════════════════════════════════════════════════════════
// src/features/this-week.js — the Quests modal's "Your week" ledger (the
// weekly tab's aside; lane daily-board folded Home's card into it) and the
// hearth band's realm cells (Kills today, Gold earned).
//
// Every figure is the server's: window.HearthriseGoalState.peek() is the one
// goal-state cache legacy.js fills (deep-frozen, null once it is 120 s old).
// This module never fetches, never reads the player record, and a count it
// does not have renders the pending dash, never 0 (CLAUDE.md §6).
// ════════════════════════════════════════════════════════════════════════
import { THIS_WEEK, THIS_WEEK_QUIET, THIS_WEEK_TODAY } from '../data/this-week.js?v=564';

var MAX_ROWS = 6;
var LEAD_AT = 0.25;

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function count(n) {
  var HB = window.HearthriseBalance;
  if (HB && typeof HB.countMarkup === 'function') return HB.countMarkup(n);
  return (n != null && isFinite(n)) ? esc(Math.max(0, Math.floor(n)).toLocaleString()) : '<span class="bal-pending">—</span>';
}

function haveOf(map, key) {
  var e = map && map[key];
  return (e && typeof e.have === 'number' && isFinite(e.have)) ? e : null;
}

function live() {
  var S = window.HearthriseGoalState;
  try { return (S && typeof S.peek === 'function') ? S.peek() : null; } catch (e) { return null; }
}

function view(map) {
  if (!map) return { known: false };
  var rows = [];
  THIS_WEEK.forEach(function (r, i) {
    var e = haveOf(map, 'w:' + r.goal);
    if (e && e.have > 0 && e.target > 0) rows.push({ goal: r.goal, label: r.label, lead: r.lead, have: e.have, ratio: e.have / e.target, i: i });
  });
  rows.sort(function (a, b) { return (b.ratio - a.ratio) || (a.i - b.i); });
  rows = rows.slice(0, MAX_ROWS);
  var lead = (rows.length && rows[0].ratio >= LEAD_AT) ? rows[0].lead : THIS_WEEK_QUIET;
  return { known: true, lead: lead, rows: rows };
}

/* The weekly tab's aside: the week's lead line, then one row per counter. */
function ledgerHtml(v) {
  if (v === undefined) { try { v = view(live()); } catch (e) { v = null; } }
  if (!v || !v.known) return '<div class="qm-sum-row"><span>So far</span><b>' + count(null) + '</b></div>';
  var out = '<p class="qm-info-text"><em>' + esc(v.lead) + '</em></p>';
  v.rows.forEach(function (r) { out += '<div class="qm-sum-row"><span>' + esc(r.label) + '</span><b>' + count(r.have) + '</b></div>'; });
  return out;
}

function todayCells(map) {
  return THIS_WEEK_TODAY.map(function (r) {
    var e = haveOf(map, 'd:' + r.goal);
    return { label: r.label, title: r.title, html: count(e ? e.have : null) };
  });
}

window.HearthriseThisWeek = { live: live, view: view, ledgerHtml: ledgerHtml, todayCells: todayCells };
