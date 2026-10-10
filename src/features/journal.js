// ============================================================
// src/features/journal.js — THE JOURNAL (window.HearthriseJournal)
//
// Every record of a hero's own history in one place, four tabs
// (coherence audit, 2026-10-09): Collection, Bestiary, Deeds, Stats.
// It replaced eleven separate screens — the Collection Log, Deeds,
// the bestiary with its trophies and charms, the lifetime stats and
// tally, the Chronicle, the Hunter's Ledger, the drop table, the luck
// ledger, the standings and "your week" — whose renderers now paint
// into the tab that holds them.
//
// The Journal is a pane of the Character door (#panel-journal). It
// owns no number: every count is drawn by the module that reads the
// server's projection, and a count not yet stated is the pending dash.
//
//   open(tab)     go to the Journal on a tab ('records' keeps the last)
//   repaint(tab)  redraw if the Journal is showing that tab
// ============================================================
(function () {
  'use strict';

  var TABS = [
    { id: 'collection', label: 'Collection', glyph: 'uiChest' },
    { id: 'bestiary', label: 'Bestiary', glyph: 'uiSkull' },
    { id: 'deeds', label: 'Deeds', glyph: 'uiTrophy' },
    { id: 'stats', label: 'Stats', glyph: 'uiTrend' }
  ];
  var ALIAS = { achievements: 'deeds', chronicle: 'deeds', lifetime: 'stats', records: null };
  var detailMon = null;

  function tabOf(name) {
    if (Object.prototype.hasOwnProperty.call(ALIAS, name)) return ALIAS[name];
    return TABS.some(function (t) { return t.id === name; }) ? name : null;
  }
  function current() { return tabOf(window._journalTab) || 'collection'; }
  function isShowing() {
    var p = document.getElementById('panel-journal');
    return !!(p && p.classList.contains('active'));
  }
  function gly(key, px) {
    return (window.HR && window.HR.icon) ? (window.HR.icon(key, px || 16, null) || '') : '';
  }
  function heading(text) { return '<h3 class="jr-h">' + text + '</h3>'; }
  function safe(fn) { try { return fn() || ''; } catch (e) { return ''; } }

  function shell(panel) {
    var s = panel.querySelector('.jr-shell');
    if (s) return s;
    panel.innerHTML = '<div class="jr-shell"><div class="jr-tabs" role="tablist" aria-label="Journal"></div>' +
      '<div class="jr-body" id="jr-body" role="tabpanel"></div></div>';
    panel.addEventListener('click', onClick);
    panel.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('[data-jr-mon]')) onClick(e);
    });
    return panel.querySelector('.jr-shell');
  }

  function paintTabs(sh, tab) {
    sh.querySelector('.jr-tabs').innerHTML = TABS.map(function (t) {
      var on = t.id === tab;
      return '<button type="button" role="tab" class="jr-tab' + (on ? ' active' : '') + '" aria-selected="' + on + '" data-jr-tab="' + t.id + '">' +
        '<span class="ic" aria-hidden="true">' + gly(t.glyph, 16) + '</span>' + t.label + '</button>';
    }).join('');
  }

  function paintBody(body, tab) {
    body.setAttribute('data-jr-tab', tab);
    if (tab === 'collection') {
      var C = window.HearthriseCollection;
      body.innerHTML = '<div class="jr-sec jr-collection"></div>';
      if (C && C.paint) C.paint(body.firstChild);
      return;
    }
    if (tab === 'bestiary') {
      var CL = window.HearthriseCollection;
      if (detailMon && CL && CL.monsterDetailHtml) {
        body.innerHTML = '<div class="jr-sec jr-detail">' + CL.monsterDetailHtml(detailMon) + '</div>';
        return;
      }
      var HL = window.HearthriseHuntersLedger;
      var B = window.HearthriseBestiary;
      body.innerHTML = safe(function () { return HL && HL.card(); }) +
        '<div class="jr-sec">' + (B ? B.html() : '') + '</div>';
      return;
    }
    if (tab === 'deeds') {
      var D = window.HearthriseDeedsList;
      body.innerHTML = '<div class="jr-col jr-chronicle"></div>' +
        '<div class="jr-col">' + heading('Deeds of the Realm') + (D ? D.html() : '') + '</div>';
      var CH = window.HearthriseChronicle;
      if (CH && CH.paint) CH.paint(body.querySelector('.jr-chronicle'));
      return;
    }
    var LS = window.HearthriseLifetimeSheet, TW = window.HearthriseThisWeek, ST = window.HearthriseStandings;
    body.innerHTML = '<div class="jr-sec jr-stats">' + (LS ? LS.html() : '') + '</div>' +
      '<div class="jr-sec jr-week">' + safe(function () { return TW && TW.card(); }) +
      safe(function () { return ST && ST.card(window.G || {}); }) + '</div>';
  }

  function paint() {
    var panel = document.getElementById('panel-journal');
    if (!panel) return;
    var tab = current();
    window._journalTab = tab;
    var sh = shell(panel);
    paintTabs(sh, tab);
    paintBody(sh.querySelector('.jr-body'), tab);
  }

  function onClick(e) {
    var t = e.target && e.target.closest ? e.target : null;
    if (!t) return;
    var tb = t.closest('[data-jr-tab]');
    if (tb && tb.classList.contains('jr-tab')) { open(tb.getAttribute('data-jr-tab')); return; }
    if (t.closest('[data-jr-back]')) { detailMon = null; paint(); return; }
    if (t.closest('button, a, [data-hl-open], .br-trophy')) return;   // a claim, never a row tap
    var row = t.closest('[data-jr-mon]');
    if (row) { e.preventDefault(); detailMon = row.getAttribute('data-jr-mon'); paint(); scrollTop(); }
  }
  function scrollTop() {
    var p = document.getElementById('panel-journal');
    if (p) p.scrollTop = 0;
  }

  function open(name) {
    var tab = tabOf(name);
    if (tab) { if (tab !== current()) detailMon = null; window._journalTab = tab; }
    if (isShowing()) { paint(); scrollTop(); return; }
    if (typeof window.showTab === 'function') window.showTab('journal');
    scrollTop();
  }
  function repaint(tab) {
    if (isShowing() && (!tab || tab === current())) paint();
  }

  window.HearthriseJournal = Object.freeze({ open: open, repaint: repaint, tabs: TABS });
  window.HearthriseShowTab.wrapShowTab('journal', function () {
    if (isShowing()) paint();
  });
})();
