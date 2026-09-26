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
//  · NO VIGOUR BAR WITHOUT PRICES. The meter and its refill control are one
//    block, drawn only when the server's catalogue (`hr_vigour_prices`, read by
//    src/net/vigour.js) has priced rows — Security C-1 / condition 5. Empty or
//    absent catalogue = nothing drawn, exactly as the held bar was.
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

  /* ── THE LIMITER (§C) — ON ONLY WHEN THE SERVER HAS PRICES ───────────────
     The bar was held (Security C-1): a meter with nothing to act on only
     raises questions, and until the refill catalogue is priced there is
     nothing to act on. So the SWITCH IS THE CATALOGUE: no priced row, no bar
     and no control, whatever meter the envelope carries. The reviewed INSERT
     of Tyler's prices turns it on with no client change.

     EVERY NUMBER BELOW IS A FIELD THE SERVER SENT, printed as sent:
       meter    hr_vigour_of via `res.vigour` — spent_min, budget_min,
                grant_min, bought_min, remaining_min, refills, refills_max,
                dry_mult
       price    the catalogue row whose nth is the next refill — cost_gold,
                minutes (the same row the verb charges from)
       receipt  hr_vigour_refill's own answer — minutes, cost, gold
     The one derived thing is the fill WIDTH, a display ratio no gate reads.
     Whether a refill is affordable or fits under the ceiling is NOT predicted
     here: the verb decides under the lock and the refusal is shown in words.
     §C: ABSOLUTE MINUTES, never a percentage of an invisible budget. */
  function fin(n) { return typeof n === 'number' && isFinite(n); }

  function vigourRow(v, prices, refill) {
    var rows = prices && Array.isArray(prices.rows) ? prices.rows : null;
    if (!rows || !rows.length) return '';
    if (!v || typeof v !== 'object' || !fin(v.spent_min) || !fin(v.budget_min)) return '';

    var dry = v.remaining_min === 0;
    var pct = v.budget_min > 0 ? Math.max(0, Math.min(100, (v.spent_min / v.budget_min) * 100)) : 100;
    var detail = [];
    if (fin(v.grant_min)) detail.push(num(v.grant_min) + ' free');
    if (fin(v.bought_min) && v.bought_min > 0) detail.push(num(v.bought_min) + ' bought');
    var meter = '<div class="hunt-vigour' + (dry ? ' is-dry' : '') + '">'
      + '<span class="hunt-vigour-key">VIGOUR</span>'
      + '<span class="hunt-vigour-track"><span class="hunt-vigour-fill" style="width:'
      + pct.toFixed(1) + '%"></span></span>'
      + '<span class="hunt-vigour-label">' + esc(num(v.spent_min) + ' / ' + num(v.budget_min) + ' min today')
      + (detail.length ? ' · ' + esc(detail.join(' + ')) : '') + '</span>'
      + '</div>';
    var dryLine = dry
      ? '<div class="hunt-vigour-dry">' + esc(fin(v.dry_mult)
          ? 'Tired — hunts pay ×' + v.dry_mult + ' until the day turns (UTC).'
          : 'Tired — hunts pay reduced rates until the day turns (UTC).') + '</div>'
      : '';

    /* THE NEXT RUNG. The verb's cap is the smaller of the meter's refills_max
       and the last priced nth (a nth with no row is refused), so the counter
       names whichever of those two SERVER numbers binds. */
    var last = 0;
    for (var i = 0; i < rows.length; i++) if (rows[i].nth > last) last = rows[i].nth;
    var cap = fin(v.refills_max) ? Math.min(v.refills_max, last) : last;
    var bought = fin(v.refills) ? v.refills : 0;
    var next = null;
    for (var j = 0; j < rows.length; j++) {
      if (rows[j].nth === bought + 1 && rows[j].nth <= cap) next = rows[j];
    }
    var r = refill || {};
    var control = next
      ? '<button type="button" class="hunt-vigour-btn" data-vigour-refill="1"' + (r.busy ? ' disabled' : '') + '>'
        + esc(r.busy ? 'Refilling…' : ('Refill +' + num(next.minutes) + ' min · ' + num(next.cost_gold) + ' gold'))
        + '</button>'
      : '<span class="hunt-vigour-none">No refills left today.</span>';
    var count = '<span class="hunt-vigour-count">' + esc(num(bought) + ' of ' + num(cap) + ' refills bought today') + '</span>';
    var notice = '';
    if (r.ok === true && r.receipt) {
      notice = 'Bought ' + num(r.receipt.minutes) + ' min for ' + num(r.receipt.cost) + ' gold'
        + (fin(r.receipt.gold) ? ' — ' + num(r.receipt.gold) + ' gold left.' : '.');
    } else if (r.ok === false && r.notice) {
      notice = r.notice;
    }
    return '<div class="hunt-vigour-block">' + meter + dryLine
      + '<div class="hunt-vigour-refill">' + control + count + '</div>'
      + (notice ? '<div class="hunt-vigour-notice' + (r.ok === false ? ' is-refused' : '') + '">'
        + esc(notice) + '</div>' : '')
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
   * @param o.prices   G._vigourPrices — {rows} from hr_vigour_prices; no priced
   *                                row = no bar (see THE LIMITER above)
   * @param o.refill   G._vigourRefill — the last refill gesture's state/answer
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
    var meter = vigourRow(opt.vigour || null, opt.prices || null, opt.refill || null);

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
    /* ⚠ WHICH SPAN THE TOTALS COVER. The Analyzer's scan is floored at 24 hours
       (finding A-1) and every sum and rate below divides by `window_ms`, while
       the clock in the header is the WHOLE hunt. On a hunt older than a day
       those are different numbers, and a panel that showed both without saying
       which is which would be the server and the browser disagreeing in the
       reader's head. Printed only when the server says the window was capped —
       never inferred from a clock here. */
    if (a.window_capped === true) honesty += ' · totals cover the last 24h';

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
      prices: G._vigourPrices || null,
      refill: G._vigourRefill || null,
      analyzer: G._huntAnalyzer || null,
      monsters: window.MONSTERS || {},
    });
    /* THE REFILL GESTURE, delegated once per container: the panel replaces its
       innards on every paint, so a listener on the button would die with it. */
    var V = window.HearthriseVigour;
    if (!node.__huntVigourWired) {
      node.__huntVigourWired = true;
      node.addEventListener('click', function (ev) {
        var t = ev.target && ev.target.closest ? ev.target.closest('[data-vigour-refill]') : null;
        var M = window.HearthriseVigour;
        if (!t || t.disabled || !M) return;
        var p = M.refill();
        renderHuntPanel(node);
        Promise.resolve(p).then(function () { renderHuntPanel(node); });
      });
    }
    /* The catalogue is read only once the server projects a meter at all, and
       re-read on its own slow clock; a changed answer repaints. */
    if (V && G._vigour && V.pricesStale()) {
      Promise.resolve(V.readPrices()).then(function (rows) {
        if (rows && node.isConnected) renderHuntPanel(node);
      });
    }
    return node;
  }

  window.huntPanelHtml = huntPanelHtml;
  window.renderHuntPanel = renderHuntPanel;
  window.huntStopSentence = stopSentence;
}());
