// ════════════════════════════════════════════════════════════════════════
// src/features/lucky-finds.js — LUCKY FINDS, CLIENT HALF (content pack 1)
//
// A lucky find is a `{id, ch, lucky:true}` drop row (src/data/monsters.js): a
// very-rare named gear drop, 4-30 expected hours at its hunting spot. The
// SERVER rolls it (hr-accrue, hr_seed + a server secret) and mints it. This
// file does two things and decides nothing:
//
//   (i)  SILENCE THE CLIENT'S DICE. The live tick and the local away replay run
//        the same engine with a Math.random-seeded stream (core-bridge.js), so
//        they will "roll" lucky rows the server never did. Such a roll is never
//        shown or credited: no combat-log line, no toast, no bag/rail credit
//        (COMBAT_FX.addItem), no G.collection entry (collection-log.js wraps the
//        global addItem that credit would have reached), no drop-log count.
//        The RNG draw itself is untouched — core/combat-sim.js still walks the
//        row — so AWAY-1 parity holds; only presentation and credit are dropped.
//        Every other row keeps legacy.js's existing 'RARE:' branch exactly.
//   (ii) REVEAL WHAT THE SERVER SAID. A settle response's `away.events` carries
//        {type:'rare_drop', item} (hr-accrue accrual.js onDrop). For a lucky
//        item that is the one and only announcement: a VERY RARE combat-log
//        line and, one task later, a reveal SHEET (attended) or a band on the
//        return cards (away, by HearthriseAccrual.classifyReceipt), stating the
//        BASE odds, once per item per envelope version. It is exempt from
//        "attended settles narrate nothing": the rarest thing a player can meet
//        while hunting is not chatter. LUCKY-5..7 hold the sheet and band.
//
// CLAUDE.md §6 ("the browser never says one thing while the server says
// another") and Tyler's 2026-09-16 no-new-prediction ruling are the reason for
// (i); tests/lucky-finds.mjs holds the rows, LUCKY-1..4 (in-page) hold this.
//
// FIELD SALVAGE (content pack 6) is the same contract for a commoner row:
// `{id, ch, salvage:true}`, an own-tier helm/boots/gloves/belt at 0.5-10 h.
// Both kinds are "server-revealed rows" here. (i) is identical; (ii) reads
// RARE (not VERY RARE, which stays lucky-only) with the base odds through the
// one formatter, formatDropOdds. tests/field-salvage.mjs holds the rows,
// SALVAGE-1..2 (in-page) hold this.
// ════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  /* item id -> {mid, row}. A lucky or salvage item is a drop of exactly ONE
     row in the roster (rule a of tests/lucky-finds.mjs and
     tests/field-salvage.mjs), so the id alone identifies it — which matters,
     because COMBAT_FX.addItem is handed nothing but the id. */
  var _index = null;
  function index() {
    if (_index) return _index;
    var ms = window.MONSTERS;
    if (!ms) return {};
    var out = {};
    Object.keys(ms).forEach(function (mid) {
      /* W0: a field champion's relic row (`champion: true`, src/data/champions.js)
         is server-revealed too, and reads like salvage: RARE with base odds. */
      (ms[mid].drops || []).forEach(function (d) { if (d && (d.lucky || d.salvage || d.champion)) out[d.id] = { mid: mid, row: d }; });
    });
    _index = out;
    return out;
  }
  function hit(id) { return (id && Object.prototype.hasOwnProperty.call(index(), id)) ? index()[id] : null; }
  function isRevealed(id) { return !!hit(id); }
  function isLucky(id) { var h = hit(id); return !!(h && h.row.lucky); }
  function isSalvage(id) { var h = hit(id); return !!(h && h.row.salvage && !h.row.lucky); }

  function itemName(id) { var it = window.ITEMS && window.ITEMS[id]; return (it && it.n) || id; }

  /* The BASE odds: the row through effectiveDropChance with the monster's own
     dropBonus and nothing else — no charm, no buff, no Boss of the Day, no
     Vigour — because those vary per player and per night. small_wolf's
     .0008 x 1.15 reads "1 in 1,087". */
  function baseChance(id) {
    var h = hit(id);
    if (!h) return 0;
    var m = (window.MONSTERS || {})[h.mid] || {};
    var D = window.HearthriseCore && window.HearthriseCore.drops;
    return (D && typeof D.effectiveDropChance === 'function')
      ? D.effectiveDropChance(h.row, { dropMult: m.dropBonus || 1 }) : h.row.ch;
  }
  function baseOneIn(id) {
    var ch = baseChance(id);
    return ch > 0 ? Math.round(1 / ch) : null;
  }

  /* ── (i) SILENCE THE CLIENT'S DICE ─────────────────────────────────────
     COMBAT_FX is legacy.js's ONE combat-fx object, published as
     HearthriseCombatSim.fx. Every kill path — the live tick's fresh
     combatSimCtx() and simulateAwayCombat's Object.assign copy — reads these
     properties at call time, so replacing them here covers both. */
  function hookCombatFx() {
    var S = window.HearthriseCombatSim;
    var fx = S && S.fx;
    if (!fx || fx.__hrLuckyHooked) return !!fx;
    fx.__hrLuckyHooked = true;
    var addItem = fx.addItem, onDrop = fx.onDrop, recordKill = fx.recordKill;
    fx.addItem = function (id) { if (isRevealed(id)) return; return addItem.apply(this, arguments); };
    /* core/combat-sim.js counts a rare event into state.stats.rareDrops BEFORE
       onDrop, and the client's state is G on both paths — so the client-dice
       count is taken back here, or "Rare drops looted" and the Lucky
       achievement would record a roll the server never made. */
    fx.onDrop = function (ev) {
      if (ev && isRevealed(ev.id)) {
        var st = window.G && window.G.stats;
        if (ev.rare && st && st.rareDrops > 0) st.rareDrops--;
        return;
      }
      return onDrop.apply(this, arguments);
    };
    fx.recordKill = function (mid, dropped) {
      var kept = dropped;
      if (dropped && typeof dropped === 'object') {
        kept = {};
        Object.keys(dropped).forEach(function (k) { if (!isRevealed(k)) kept[k] = dropped[k]; });
      }
      return recordKill.call(this, mid, kept);
    };
    return true;
  }
  /* legacy.js publishes HearthriseCombatSim at parse time and loads before
     this file, so this binds on the first try; LUCKY-1 asserts it did. */
  hookCombatFx();

  /* ── (ii) REVEAL WHAT THE SERVER SAID ──────────────────────────────────
     Called from the envelope funnel in src/net/accrue.js (the one every
     applied envelope passes, beside the Hearthfind reveal). Deduped on
     `version` so a replayed envelope — the replacement sheet re-applies the
     one the player consented to — says nothing twice. No events (a world-tick
     frame, a boot read) says nothing at all.
     A LUCKY find is no longer a toast (dropped after 15 s in the queue, folded
     into "Items found" overnight): it is queued here and PRESENTED one task
     later, because the funnel runs before G.lastOfflineSummary is written
     (accrue.js applyEnvelope), and the one client classifier must read THIS
     envelope's receipt. Salvage keeps its toast exactly. */
  var _told = [];          // "version:item", most recent last, bounded
  var TOLD_MAX = 64;
  var _pendLucky = [];     // {item, version}, waiting for present()
  var _pendRare = [];      // non-lucky rare_drop ids, for the away band
  var _queue = [];         // attended sheets waiting for a clear screen
  var _held = null;        // {at, finds, rare}: the away band, read not consumed
  var _presentT = null, _waitT = null;
  var BAND_MS = 30 * 60000;   // the Home away card's own freshness box
  function noteEnvelope(res) {
    var ev = res && res.away && res.away.events;
    if (!Array.isArray(ev) || !ev.length) return 0;
    var ver = String(res.version);
    var said = 0;
    ev.forEach(function (e) {
      if (!e || e.type !== 'rare_drop' || !e.item) return;
      var key = ver + ':' + e.item;
      if (_told.indexOf(key) >= 0) return;
      _told.push(key);
      if (_told.length > TOLD_MAX) _told.shift();
      if (!isLucky(e.item) && _pendRare.indexOf(e.item) < 0) _pendRare.push(e.item);
      if (!isRevealed(e.item)) return;
      var name = itemName(e.item);
      var G = window.G;
      var line;
      if (isLucky(e.item)) {
        line = '<span class="rare vrare">VERY RARE: ' + name + '</span>';
        _pendLucky.push({ item: e.item, version: res.version });
      } else {
        var D = window.HearthriseCore && window.HearthriseCore.drops;
        var ch = baseChance(e.item);
        line = '<span class="rare">RARE: ' + name + '</span>';
        if (typeof window.notify === 'function') {
          window.notify('Rare find: ' + name + '!' + ((ch > 0 && D && D.formatDropOdds) ? ' (base odds ' + D.formatDropOdds(ch) + ')' : ''), 'levelup');
        }
      }
      if (G && Array.isArray(G.combatLog)) G.combatLog.push(line);
      said++;
    });
    if ((_pendLucky.length || _pendRare.length) && !_presentT) _presentT = setTimeout(present, 0);
    return said;
  }

  /* ONE classifier: HearthriseAccrual.classifyReceipt (SYNC_MAX_MS, 10 min).
     Never Hearthfind's 60 s rule — the settle cadence is 90 s, so that rule
     would send every attended find to a band nothing draws. */
  function present() {
    _presentT = null;
    var finds = _pendLucky, rare = _pendRare;
    _pendLucky = []; _pendRare = [];
    var A = window.HearthriseAccrual;
    var rec = window.G && window.G.lastOfflineSummary;
    var kind = null;
    try { if (A && typeof A.classifyReceipt === 'function') kind = A.classifyReceipt(rec); } catch (e) { kind = null; }
    if (kind === 'away') {
      _held = { at: Number(rec && rec.at) || Date.now(), finds: finds, rare: rare };
      return;
    }
    finds.forEach(function (f) { _queue.push(f); });
    pump();
  }

  /* ── THE ATTENDED SHEET QUEUE — one at a time, never over another sheet,
     never auto-dismissed, never dropped. */
  function busy() {
    if (document.getElementById('hr-lucky-veil')) return true;
    var S = window.HearthriseSheet;
    var f = S && (S.anyOpen || S.topOpen);
    try { return !!(f && f.call(S)); } catch (e) { return false; }
  }
  function pump() {
    _waitT = null;
    if (!_queue.length) return;
    if (busy()) { _waitT = setTimeout(pump, 1000); return; }
    show(_queue.shift());
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function monsterName(id) {
    var h = hit(id); var m = h && (window.MONSTERS || {})[h.mid];
    return (m && m.name) || '';
  }
  function oddsText(id) {
    var n = baseOneIn(id);
    return n ? 'about 1 in ' + n.toLocaleString('en-US') : '';
  }
  function art(id) {
    try { return (typeof window.itemArt === 'function' && window.itemArt(id, 64)) || ''; } catch (e) { return ''; }
  }

  function show(find) {
    var id = find && find.item;
    if (!isLucky(id)) return null;
    dismiss();
    var rumour = (window.HearthriseLuckyRumours || {})[id];
    var desc = typeof window.itemDesc === 'function' ? window.itemDesc(id) : '';
    var odds = oddsText(id);
    var v = document.createElement('div');
    v.id = 'hr-lucky-veil';
    v.className = 'ach-overlay hr-scrim show';
    v.setAttribute('role', 'dialog');
    v.setAttribute('aria-label', 'A lucky find');
    v.innerHTML = '<div class="ach-modal hr-sheet hr-lf-card rr-frame">'
      + '<h2 class="hr-sheet-head">A lucky find</h2>'
      + '<div class="hr-sheet-body hr-lf-body">'
      + '<div class="hr-lf-art">' + art(id) + '</div>'
      + '<div class="hr-lf-name">' + esc(itemName(id)) + '</div>'
      + '<div class="hr-lf-meta">' + esc('Dropped by ' + monsterName(id) + (odds ? ' · base odds ' + odds : '')) + '</div>'
      + (desc ? '<div class="hr-lf-desc">' + esc(desc) + '</div>' : '')
      + (rumour ? '<i class="hr-lf-rumour">' + esc(rumour) + '</i>' : '')
      + '</div>'
      + '<div class="hr-sheet-foot hr-lf-foot">'
      + '<button type="button" class="btn" data-lf="luck">Where luck hides</button>'
      + '<button type="button" class="btn" data-lf="close" data-hr-dismiss>Close</button>'
      + '</div></div>';
    document.body.appendChild(v);
    return v;
  }
  function dismiss() {
    var v = document.getElementById('hr-lucky-veil');
    if (v && v.parentNode) v.parentNode.removeChild(v);
  }

  /** User gesture ('See it'): no wait, and the find leaves the held band. */
  function open(id) {
    if (!isLucky(id)) return null;
    if (_held) _held.finds = _held.finds.filter(function (f) { return f.item !== id; });
    return show({ item: id });
  }

  function whereLuckHides() {
    dismiss();
    var wb = document.getElementById('welcome-overlay');
    var wd = wb && wb.classList.contains('show') && wb.querySelector('[data-hr-dismiss]');
    if (wd) wd.click();
    if (typeof window.openBestiary === 'function') window.openBestiary();
    var d = document.getElementById('best-luck');
    if (d) { d.open = true; if (d.scrollIntoView) d.scrollIntoView({ block: 'start' }); }
    pump();
  }

  /* ── THE AWAY BAND — a NON-consuming read: the Home card repaints every
     1.5 s and the welcome card may draw first, so both read the same held
     band until its receipt is 30 minutes old. Every name and count comes from
     the server's events. */
  function nameList(ids) {
    var n = ids.map(itemName);
    if (n.length > 3) return n.slice(0, 3).join(', ') + ' and ' + (n.length - 3) + ' more';
    return n.length > 1 ? n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1] : (n[0] || '');
  }
  function awayBandHtml() {
    var h = _held;
    if (!h || !(Date.now() - h.at < BAND_MS)) return '';
    var rows = h.finds.map(function (f) {
      var odds = baseOneIn(f.item);
      return '<div class="hr-lf-band-row">' + esc('Lucky find while you were away: ' + itemName(f.item)
        + ', dropped by ' + monsterName(f.item) + '.' + (odds ? ' Base odds about 1 in ' + odds.toLocaleString('en-US') + '.' : ''))
        + ' <button type="button" class="btn hr-lf-see" data-lf-see="' + esc(f.item) + '">See it</button></div>';
    });
    if (h.rare.length) rows.push('<div class="hr-lf-band-row">' + esc('Rare finds while you were away: ' + nameList(h.rare) + '.') + '</div>');
    return rows.length ? '<div class="hr-lf-band">' + rows.join('') + '</div>' : '';
  }

  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target : null;
    var see = t && t.closest('[data-lf-see]');
    if (see) { open(see.getAttribute('data-lf-see')); return; }
    var b = t && t.closest('#hr-lucky-veil [data-lf]');
    if (b) {
      if (b.getAttribute('data-lf') === 'luck') whereLuckHides();
      else { dismiss(); pump(); }
      return;
    }
    if (t && t.id === 'hr-lucky-veil') { dismiss(); pump(); }
  });

  window.HearthriseLuckyFinds = {
    isLucky: isLucky,
    isSalvage: isSalvage,
    isRevealed: isRevealed,
    baseOneIn: baseOneIn,
    noteEnvelope: noteEnvelope,
    open: open,
    awayBandHtml: awayBandHtml,
    /* the welcome concat's name (legacy.js maybeShowWelcome); NOT consuming. */
    claimAwayBand: awayBandHtml,
    /* test seam: forget what was announced (the in-page suite replays one
       envelope and must see the first apply speak). */
    __reset: function () {
      _told = []; _index = null; _queue = []; _pendLucky = []; _pendRare = []; _held = null;
      if (_presentT) clearTimeout(_presentT);
      if (_waitT) clearTimeout(_waitT);
      _presentT = _waitT = null;
      dismiss();
    },
    /* test seam, render assertions only: 'away' holds a band, else a sheet. */
    __present: function (find, mode) {
      if (mode === 'away') { _held = { at: Date.now(), finds: [find], rare: [] }; return awayBandHtml(); }
      return show(find);
    },
  };
})();
