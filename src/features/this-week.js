// ════════════════════════════════════════════════════════════════════════
// src/features/this-week.js — Home's "Your week" card and the hearth band's
// realm cells (Kills today, Gold earned).
//
// Every figure is the server's: window.HearthriseGoalState.peek() is the one
// goal-state cache legacy.js fills (deep-frozen, null once it is 120 s old).
// This module never fetches, never reads the player record, and a count it
// does not have renders the pending dash, never 0 (CLAUDE.md §6).
// ════════════════════════════════════════════════════════════════════════
import { THIS_WEEK, THIS_WEEK_QUIET, THIS_WEEK_TODAY } from '../data/this-week.js?v=562';

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

function duo(label, html) {
  return '<div class="hd-card hd-duo"><div class="bd"><div class="t">' + esc(label) + '</div></div>' +
    '<div class="when">' + html + '</div></div>';
}

function cardHtml(v) {
  var body = '<div class="hd-card hd-mini"><div>Since Monday, midnight UTC</div></div>';
  if (!v || !v.known) body += duo('So far', count(null));
  else {
    body += '<div class="hd-card hd-duo"><div class="bd"><div class="s"><em>' + esc(v.lead) + '</em></div></div></div>';
    v.rows.forEach(function (r) { body += duo(r.label, count(r.have)); });
  }
  return '<div><div class="hd-h"><h3>Your week</h3></div><div class="hd-rows">' + body + '</div></div>';
}

function card() {
  try { return cardHtml(view(live())); } catch (e) { return ''; }
}

function todayCells(map) {
  return THIS_WEEK_TODAY.map(function (r) {
    var e = haveOf(map, 'd:' + r.goal);
    return { label: r.label, title: r.title, html: count(e ? e.have : null) };
  });
}

window.HearthriseThisWeek = { live: live, view: view, cardHtml: cardHtml, card: card, todayCells: todayCells };
