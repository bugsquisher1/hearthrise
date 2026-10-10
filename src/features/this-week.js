// ════════════════════════════════════════════════════════════════════════
// src/features/this-week.js — Home's "Your week" card and the hearth band's
// realm cells (Kills today, Gold earned).
//
// Every figure is the server's: window.HearthriseTally.peek() is the one tally
// cache src/features/daily-quests.js fills from hr_tally_state (deep-frozen,
// null once it is 120 s old).
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

/* A counter's value in a KNOWN tally: an absent ev: key is the server saying
   none; a gold figure it did not state is unknown (null, the pending dash). */
function haveOf(map, counter, weekly) {
  if (!map) return null;
  if (counter === 'gold') {
    var g = Number(weekly ? map.goldWeek : map.goldDay);
    return isFinite(g) ? Math.max(0, g) : null;
  }
  var bag = weekly ? map.week : map.day;
  if (!bag || typeof bag !== 'object') return null;
  var n = Number(bag[counter]);
  return isFinite(n) && n > 0 ? n : 0;
}

function live() {
  var S = window.HearthriseTally;
  try { return (S && typeof S.peek === 'function') ? S.peek() : null; } catch (e) { return null; }
}

function view(map) {
  if (!map) return { known: false };
  var rows = [];
  THIS_WEEK.forEach(function (r, i) {
    var have = haveOf(map, r.counter, true);
    if (have > 0 && r.par > 0) rows.push({ counter: r.counter, label: r.label, lead: r.lead, have: have, ratio: have / r.par, i: i });
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
    return { label: r.label, title: r.title, html: count(haveOf(map, r.counter, false)) };
  });
}

window.HearthriseThisWeek = { live: live, view: view, cardHtml: cardHtml, card: card, todayCells: todayCells };
