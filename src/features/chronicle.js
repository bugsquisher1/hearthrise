// ============================================================
// src/features/chronicle.js — the Journal's Recent tab (the topbar bell
// opens it there).
//
// WHY THIS EXISTS
// The b227 click-through audit found the topbar bell had no handler at all.
// It now answers "I looked away, what happened?": every toast the b219 queue
// is handed, newest first, in a capped in-memory ring.
//
// DELIBERATELY NOT PERSISTED. An idle game emits thousands of "+3 Oak Log"
// toasts a day; persisting them would put noise in the save, and after a
// restore on another device a replayed log would describe events that did
// not happen on this screen. The section is labelled "This session" so the
// contract is visible.
//
// The permanent MILESTONES tier (G.chronicle — renown ranks, level marks,
// boss first kills, pets, homestead and castle tiers, Hunt clears, the name
// claim) was cut by designer ruling in the 2026-10-14 clean-slate demolition,
// together with its hooks, its reconcile sweep and the `chronicle` residue
// field.
//
// Public API (window.HearthriseChronicle):
//   recordToast(text, type)   → the toasts.js choke-point feed
//   paint(host)               → the Journal's Recent tab draws it
//   recent() / clearRecent()  → reads
//
// Classic script (no build step).
// ============================================================
(function () {
  'use strict';

  var MAX_RECENT = 100;   // in-memory toast ring
  var recentRing = [];    // [{ text, type, ts, count }] — oldest first

  // Called from ONE place: the push() choke-point in toasts.js. Deliberately
  // upstream of the queue's visibility decision, so a toast the queue DROPS
  // is still recorded — a dropped toast is precisely the one the player missed.
  function recordToast(text, type) {
    var msg = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    if (!msg) return;
    var t = type || 'info';
    var last = recentRing[recentRing.length - 1];
    if (last && last.text === msg && last.type === t) {
      last.count++; last.ts = Date.now();
      return;
    }
    recentRing.push({ text: msg, type: t, ts: Date.now(), count: 1 });
    while (recentRing.length > MAX_RECENT) recentRing.shift();
  }

  function clockTime(ts) {
    try { return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }
    catch (e) { return ''; }
  }

  // ── Style ─────────────────────────────────────────────────
  // Rows sit on the ground under a small-caps label over a fading rule. Every
  // colour is a token. Nothing below the 14.5px reading floor.
  function ensureStyle() {
    if (document.getElementById('hr-ch-css')) return;
    var s = document.createElement('style');
    s.id = 'hr-ch-css';
    s.textContent = [
      '.hr-ch-sec{font-family:var(--f-label,var(--f-ui,sans-serif));font-size:15.5px;letter-spacing:.06em;color:var(--gold,#c9a24a);padding:16px 18px 5px}',
      '.hr-ch-rule{height:1px;margin:0 18px 6px;background:var(--rule-fade,linear-gradient(90deg,var(--line-strong,#b8893e),transparent))}',
      '.hr-ch-note{font-size:14.5px;color:var(--ink-3,#8a7656);padding:2px 18px 8px;line-height:1.45}',
      '.hr-ch-row{display:flex;align-items:baseline;gap:10px;padding:8px 18px;border-bottom:1px solid var(--line-soft,rgba(184,137,62,.12))}',
      '.hr-ch-row:last-child{border-bottom:0}',
      '.hr-ch-ic{flex:0 0 auto;align-self:center;color:var(--gold,#c9a24a);display:flex}',
      '.hr-ch-txt{flex:1 1 auto;font-size:15px;color:var(--ink-2,#c8b088);line-height:1.35;min-width:0;overflow-wrap:anywhere}',
      '.hr-ch-when{flex:0 0 auto;font-size:14.5px;color:var(--ink-3,#8a7656);font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.hr-ch-xn{font-size:14.5px;color:var(--gold,#c9a24a);font-variant-numeric:tabular-nums;margin-left:6px}',
      '.hr-ch-empty{font-size:15px;color:var(--ink-3,#8a7656);padding:4px 18px 12px;line-height:1.5}'
    ].join('');
    document.head.appendChild(s);
  }

  // ── Render ────────────────────────────────────────────────
  function glyph(key, px) {
    if (window.HR && typeof window.HR.icon === 'function') {
      var g = window.HR.icon(key, px || 16, '--gold');
      if (g) return g;
    }
    // Fallback: a drawn gilt lozenge. Never a pictograph.
    return '<span class="hr-glyph" style="--gsz:' + (px || 16) + 'px">' +
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 1.5 14.5 8 8 14.5 1.5 8Z"/></svg></span>';
  }

  // The toast TYPE is the only thing the queue knows about a notification's
  // meaning, so it is what picks the glyph.
  var TOAST_GLYPH = {
    loot: 'chest', kill: 'sword', levelup: 'xp',
    gold: 'coin', warn: 'warn', info: 'info'
  };
  function toastGlyph(type) { return TOAST_GLYPH[type] || 'info'; }

  function row(iconKey, text, when, count) {
    var el = document.createElement('div');
    el.className = 'hr-ch-row';
    var ic = document.createElement('span');
    ic.className = 'hr-ch-ic';
    ic.innerHTML = glyph(iconKey, 16);
    var tx = document.createElement('span');
    tx.className = 'hr-ch-txt';
    tx.textContent = text;                    // player-supplied strings live here
    if (count > 1) {
      var xn = document.createElement('span');
      xn.className = 'hr-ch-xn';
      xn.textContent = '×' + count;
      tx.appendChild(xn);
    }
    var wh = document.createElement('span');
    wh.className = 'hr-ch-when';
    wh.textContent = when;
    el.appendChild(ic); el.appendChild(tx); el.appendChild(wh);
    return el;
  }

  function note(parent, text, cls) {
    var n = document.createElement('div');
    n.className = cls || 'hr-ch-note'; n.textContent = text;
    parent.appendChild(n);
  }

  /* Paint the session ring into a Journal host. */
  function paint(host) {
    if (!host) return;
    ensureStyle();
    host.textContent = '';
    var h = document.createElement('div');
    h.className = 'hr-ch-sec'; h.textContent = 'This session';
    host.appendChild(h);
    var r = document.createElement('div');
    r.className = 'hr-ch-rule';
    host.appendChild(r);
    if (!recentRing.length) {
      note(host, window.HearthriseSignposts ? window.HearthriseSignposts.fill('chronicle.recentEmpty') : '', 'hr-ch-empty');
      return;
    }
    var rec = recentRing.slice().reverse();
    for (var i = 0; i < rec.length; i++) {
      host.appendChild(row(toastGlyph(rec[i].type), rec[i].text, clockTime(rec[i].ts), rec[i].count));
    }
    note(host, 'Kept for this session only.');
  }

  // ── Boot: the bell opens the Recent tab ───────────────────
  function wireBell() {
    var bell = document.getElementById('btn-notif');
    if (!bell || bell.__hrChron) return;
    bell.__hrChron = 1;
    bell.setAttribute('title', 'Recent');
    bell.addEventListener('click', function (e) {
      e.preventDefault();
      if (window.HearthriseJournal) window.HearthriseJournal.open('recent');
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireBell);
  else wireBell();

  window.HearthriseChronicle = {
    MAX_RECENT: MAX_RECENT,
    recordToast: recordToast,
    recent: function () { return recentRing.slice(); },
    clearRecent: function () { recentRing.length = 0; },
    paint: paint
  };
})();
