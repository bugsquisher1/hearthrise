// ============================================================
// src/render/hunt-panel.js — THE HUNT PANEL. One screen, server-rendered.
//
// Specification: docs/design/HUNT_ANALYZER_UI.md. That document owns the
// INFORMATION ARCHITECTURE — what is on the screen, in what order, what it is
// called. The visual craft (spacing, weight, the frame treatment, the icon set)
// is the Art Director's; where this file names a CSS token it is naming the
// SEMANTIC SLOT, not a look.
//
// ── THE ONE RULE THIS FILE EXISTS TO OBEY ───────────────────────────────────
// NOTHING HERE COMPUTES A GAME VALUE. Every number on this panel is read from
// the server's projection (`G._huntAnalyzer`, `G._vigour`, `G._hunt` — all
// written ONLY by src/net/accrue.js reconcileHunt out of an envelope) and is
// REPLACED by each envelope. Nothing is merged upward, nothing is extrapolated
// between settles, and there is no client-side kill counter ticking up: a
// counter that runs ahead of the server is the phantom-seed bug with a
// different noun (CLAUDE.md §6, Tyler 2026-09-14).
//
// THE SINGLE EXCEPTION is the elapsed clock in the header, and it is a WALL
// CLOCK rather than a game value — the design names it as the one thing that
// may move between settles (HUNT_ANALYZER_UI.md §A). It is computed from the
// server's own `started_at` against the browser clock purely so the pill does
// not freeze; nothing reads it, no gate consults it, and it cannot be spent.
//
// ── THE HONESTY LINE IS A REQUIREMENT, NOT DECORATION (§F) ──────────────────
// `settled HH:MM UTC` is never omitted. A player who reloads twice inside one
// window must see the SAME numbers both times and understand why.
//
// ── WHAT IS DELIBERATELY ABSENT ─────────────────────────────────────────────
//  · NO REFILL BUTTON. Slice 1 ships Vigour read-only (HUNTS_AND_ANALYZER.md
//    §4.6); the gold sink is staged but unapplied and needs Tyler's four
//    numbers plus a Security GO.
//  · NO "if the bag fills" IN THE STOP SENTENCE. This game has no bag capacity
//    today, so the rule cannot fire; printing it would promise a stop that
//    never comes. The field is still accepted and stored server-side for the
//    day a cap exists. Reported to the Game Designer by the M6 backend lane.
//  · NO HARDCODED COLOURS. Every colour is a token from theme-cozy.css
//    (CLAUDE.md §7); a new component is the cheapest possible place to be
//    token-clean, because there is nothing to convert.
//  · NO NEW BREAKPOINT. The frozen set only (tests/breakpoint-guard.mjs).
//
// Globals are read via window.* at call time — the established src/render/*
// convention — so this script may load in any order after legacy.js.
// ============================================================
(function () {
  'use strict';

  /* PLAIN WORDS FOR A MACHINE CODE. The server names the rule that ended the
     hunt (`meta.stopped` -> the Analyzer's `stopped`); this is the only place
     that name becomes a sentence, and an UNKNOWN code falls through to the code
     itself rather than to silence — a stop nobody can read is still better than
     a stop nobody is told about. */
  var STOP_WORDS = {
    falls: 'too many deaths in a row',
    bag_full: 'the bag filled up',
    food_floor: 'food ran low',
    ammo_floor: 'ammo ran low',
    ammo_dry: 'the quiver ran dry',
    hours: 'the time limit',
  };

  var STANCE_WORDS = { careful: 'Careful', steady: 'Steady', reckless: 'Reckless' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /** An integer with thousands separators. PRESENTATION ONLY — it never rounds
      a value the server sent, it only groups its digits. */
  function num(n) {
    if (n === null || typeof n === 'undefined') return '—';
    var v = Number(n);
    if (!isFinite(v)) return '—';
    return Math.round(v).toLocaleString('en-US');
  }

  /** A signed integer, for the one line the whole panel exists to deliver. */
  function signed(n) {
    if (n === null || typeof n === 'undefined') return '—';
    var v = Number(n);
    if (!isFinite(v)) return '—';
    return (v >= 0 ? '+ ' : '− ') + Math.abs(Math.round(v)).toLocaleString('en-US');
  }

  /** `3h 12m` from a millisecond span the SERVER computed. */
  function dur(ms) {
    var v = Number(ms);
    if (!isFinite(v) || v < 0) return '—';
    var m = Math.floor(v / 60000);
    var h = Math.floor(m / 60);
    return h > 0 ? (h + 'h ' + (m % 60) + 'm') : (m + 'm');
  }

  function hhmmUtc(iso) {
    var t = Date.parse(String(iso || ''));
    if (!isFinite(t)) return null;
    var d = new Date(t);
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes());
  }

  /** "2 minutes ago", from the server's settle instant against the wall clock.
      A DURATION, not a game value — the §A exception. */
  function agoWords(iso) {
    var t = Date.parse(String(iso || ''));
    if (!isFinite(t)) return null;
    var mins = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (mins < 1) return 'just now';
    if (mins === 1) return '1 minute ago';
    if (mins < 60) return mins + ' minutes ago';
    var h = Math.floor(mins / 60);
    return h === 1 ? '1 hour ago' : (h + ' hours ago');
  }

  /* ── THE STOP RULES AS A SENTENCE, NOT A FORM (§B) ────────────────────────
     The resting state is what a player reads at 11 p.m. before closing the tab,
     and a form at that moment invites fiddling with something that was already
     right. Built ONLY from the server-projected `stop` object.
     ⚠ `bag_full` IS NOT PRINTED — see the header. */
  function stopSentence(stop) {
    if (!stop || typeof stop !== 'object') return 'Runs until you stop it.';
    var parts = [];
    if (typeof stop.hours === 'number') parts.push('after ' + stop.hours + ' hours');
    if (typeof stop.falls === 'number') parts.push('after ' + stop.falls + ' deaths in a row');
    if (typeof stop.food_floor === 'number') parts.push('if food drops below ' + num(stop.food_floor));
    if (typeof stop.ammo_floor === 'number') parts.push('if ammo drops below ' + num(stop.ammo_floor));
    if (!parts.length) return 'Runs until you stop it.';
    return 'Stops ' + parts.join(' · ') + '.';
  }

  /* ── THE LIMITER (§C) ─────────────────────────────────────────────────────
     A single bar, labelled in ABSOLUTE MINUTES — never a percentage, because a
     percentage of an invisible budget is a number players learn to ignore.
     When it runs out the label becomes one sentence carrying the consequence
     AND the reset time, so no tooltip is required. */
  function vigourRow(v) {
    if (!v || typeof v !== 'object') return '';
    var spent = Math.max(0, Number(v.spent_min) || 0);
    var budget = Math.max(1, Number(v.budget_min) || 1);
    var pct = Math.max(0, Math.min(100, Math.round((spent / budget) * 100)));
    var dry = spent >= budget;
    var label = dry
      ? 'Tired — hunts pay a quarter until 00:00 UTC.'
      : (num(spent) + ' / ' + num(budget) + ' min today');
    return ''
      + '<div class="hunt-vigour' + (dry ? ' is-dry' : '') + '">'
      + '<span class="hunt-vigour-key">VIGOUR</span>'
      + '<span class="hunt-vigour-track"><span class="hunt-vigour-fill" style="width:' + pct + '%"></span></span>'
      + '<span class="hunt-vigour-label">' + esc(label) + '</span>'
      + '</div>';
  }

  /* ── THE EVIDENCE (§E) ────────────────────────────────────────────────────
     Six rows, each a total beside its rate or a cost beside its cause. The
     PAIRING is the design, not a space saving: the gap between raw and
     effective XP/h IS the diagnosis, and a player who sees it once understands
     their stance is wrong without anyone explaining stances. */
  function evidence(a) {
    var rows = [
      ['XP / h', num(a.xp_per_h), 'raw', num(a.raw_xp_per_h)],
      ['Kills', num(a.kills), 'per h', num(a.kills_per_h)],
      ['Loot (vendor)', num(a.loot_value) + ' g', 'Gold', num(a.gold) + ' g'],
      /* A COST RENDERED AS A POSITIVE NUMBER IS A COST PLAYERS DO NOT SUBTRACT
         — so supplies always carries a leading minus, in --red. */
      ['Supplies', '− ' + num(a.supplies_value) + ' g', 'Deaths', num(a.deaths)],
      ['Paid time', dur(a.paid_ms), 'Idle', dur(a.downtime_ms)],
    ];
    var html = '';
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var costly = r[0] === 'Supplies';
      html += '<div class="hunt-ev-row">'
        + '<span class="hunt-ev-k">' + esc(r[0]) + '</span>'
        + '<span class="hunt-ev-v' + (costly ? ' is-cost' : '') + '">' + esc(r[1]) + '</span>'
        + '<span class="hunt-ev-k2">' + esc(r[2]) + '</span>'
        + '<span class="hunt-ev-v2">' + esc(r[3]) + '</span>'
        + '</div>';
    }
    return '<div class="hunt-evidence">' + html + '</div>';
  }

  /**
   * THE WHOLE PANEL, as a string. PURE: it takes the three server-projected
   * blocks and returns HTML. It reads no globals and writes none, which is what
   * lets the smoke suite assert what a player sees without a DOM.
   *
   * @param o.hunt     G._hunt      — {stance, stop} from state.hunt_*
   * @param o.vigour   G._vigour    — hr_vigour_of's block
   * @param o.analyzer G._huntAnalyzer — hr_hunt_analyzer's block, or null
   * @param o.monsters window.MONSTERS — the display NAME only, never a value
   */
  function huntPanelHtml(o) {
    var opt = o || {};
    var a = opt.analyzer || null;
    var hunt = opt.hunt || null;
    var monsters = opt.monsters || {};

    var running = !!(a && a.spawn_id);
    var mon = running && Object.prototype.hasOwnProperty.call(monsters, a.spawn_id)
      ? monsters[a.spawn_id] : null;
    var name = running ? ((mon && mon.name) || a.spawn_id) : 'No hunt';
    var stance = (a && a.stance) || (hunt && hunt.stance) || 'steady';

    /* A. THE HEADER. The live pill and the elapsed WALL clock beside it. */
    var head = '<div class="hunt-head">'
      + '<span class="hunt-spawn">' + esc(name) + '</span>'
      + '<span class="hunt-pill' + (running ? ' is-live' : '') + '">'
      + (running ? 'hunting' : 'idle') + '</span>'
      + (running ? '<span class="hunt-clock">' + esc(dur(a.elapsed_ms)) + '</span>' : '')
      + '</div>';

    /* B. THE SETUP. Three buttons, one visibly selected, and the stop rules as
       a sentence. Selection is read from the SERVER's projection with a
       fail-safe of the default — never from a click this panel remembers
       (CLAUDE.md §6, residue-ahead). */
    var buttons = '';
    for (var k in STANCE_WORDS) {
      if (!Object.prototype.hasOwnProperty.call(STANCE_WORDS, k)) continue;
      buttons += '<button type="button" class="hunt-stance-btn' + (k === stance ? ' is-on' : '')
        + '" data-stance="' + esc(k) + '">' + esc(STANCE_WORDS[k]) + '</button>';
    }
    var setup = '<div class="hunt-setup">'
      + '<div class="hunt-setup-row"><span class="hunt-key">STANCE</span>'
      + '<span class="hunt-stance-buttons">' + buttons + '</span></div>'
      + '<div class="hunt-setup-row"><span class="hunt-key">STOPS</span>'
      + '<span class="hunt-stops">' + esc(stopSentence(hunt && hunt.stop)) + '</span></div>'
      + '</div>';

    var meter = vigourRow(opt.vigour);

    /* §3. THE EMPTY STATE. Eleven words, no tutorial, no carousel. */
    if (!running) {
      return '<div class="hunt-panel">' + head + setup + meter
        + '<div class="hunt-empty"><strong>No hunts yet.</strong> '
        + 'Start one and this panel will tell you what it was worth.</div></div>';
    }

    /* A HUNT THAT HAS NOT SETTLED A WINDOW YET SHOWS EM-DASHES, not zeroes.
       A zero is a CLAIM; an em-dash is the truth (§3). `num()` already answers
       null with an em-dash, so this is one line rather than a branch per cell. */
    var settledIso = a.settled_at || null;
    var honesty = settledIso
      ? ('settled ' + (hhmmUtc(settledIso) || '—') + ' UTC · ' + (agoWords(settledIso) || ''))
      : 'nothing settled yet.';

    /* D. THE VERDICT. One number, alone, with a sign — the line the whole panel
       exists to deliver. Its subtitle is six words that stop it ever being
       mistaken for gold banked. */
    var profit = a.profit_per_h;
    var pos = Number(profit) >= 0;
    var verdict = '<div class="hunt-verdict' + (profit == null ? '' : (pos ? ' is-up' : ' is-down')) + '">'
      + '<span class="hunt-verdict-key">PROFIT</span>'
      + '<span class="hunt-verdict-n">' + esc(signed(profit)) + ' gold / h</span>'
      + '<span class="hunt-verdict-sub">gold + vendor value of loot − food and arrows.</span>'
      + '</div>';

    var stoppedLine = a.stopped
      ? ('<div class="hunt-stopped">Stopped: ' + esc(STOP_WORDS[a.stopped] || a.stopped) + '.</div>')
      : '';

    return '<div class="hunt-panel">' + head + setup + meter + verdict + evidence(a)
      + stoppedLine
      + '<div class="hunt-honesty">' + esc(honesty) + '</div></div>';
  }

  /** Paint it into a container from the CURRENT projection. The globals are
      read HERE and nowhere else, so the builder above stays pure. */
  function renderHuntPanel(el) {
    var node = (typeof el === 'string') ? document.getElementById(el) : el;
    if (!node) return null;
    var G = window.G || {};
    node.innerHTML = huntPanelHtml({
      hunt: G._hunt || null,
      vigour: G._vigour || null,
      analyzer: G._huntAnalyzer || null,
      monsters: window.MONSTERS || {},
    });
    return node;
  }

  window.huntPanelHtml = huntPanelHtml;
  window.renderHuntPanel = renderHuntPanel;
  window.huntStopSentence = stopSentence;
}());
