// ════════════════════════════════════════════════════════════════════════
// src/features/hearthfind.js — THE HEARTHFIND, CLIENT HALF (Feature Slate §2)
//
// "Once in a very long while the realm stops what it is doing to look at what
// you found." This file renders that moment. It NEVER decides it.
//
// ── AUTHORITY (CLAUDE.md §1) ────────────────────────────────────────────────
// There is no roll here, no odds table, no rate, no clamp and no grant. Every
// number this file prints was authored by the server:
//
//   · THE FIND        `envelope.hearthfind` (hr_apply's receipt) or, on any
//                     later envelope of the same UTC day, `state.hearthfind_last`
//                     (hr_state_of's projection of the append-only ledger row).
//                     Fields: item, source_kind, source_id, one_in, nth_today, at.
//   · THE BOARD       `world_finds` — public-read, RPC-insert-only. The global
//                     chat line is rendered FROM A ROW OF THAT TABLE and never
//                     from the finder's own client claim, which is why one
//                     player cannot make another player's client announce a
//                     find that hr_apply did not journal.
//   · THE NAME        `display_names` (public read), joined client-side. A
//                     find row stores no name on purpose.
//
// If a number is not on one of those three, this file DOES NOT PRINT IT. That
// rule is why the lifetime ordinal degrades to silence rather than to
// `nth_today` wearing the word "ever" (see ordinalFor).
//
// ⚠ KNOWN CONTRACT GAP, FILED NOT FUDGED. The server half journals `nth_today`
//   (finds by THIS character TODAY) and nothing else. The ruling's copy wants
//   "{ordinal} ever found in Hearthrise" — a REALM-WIDE lifetime ordinal. The
//   only public source for it is a count over `world_finds`, and that board is
//   (a) suppressed by the 30-second broadcast clamp and (b) pruned by
//   `hr_world_finds_prune`. So the count this file can take is a LOWER BOUND,
//   not the ordinal. Therefore:
//       · the chat line, which renders a board ROW, uses the board's own
//         running count — the row and the count come from the same table, so
//         the line is self-consistent with what every reader can see;
//       · the attended reveal and the away band OMIT the ordinal clause unless
//         a board count is available for that item, and they never substitute
//         `nth_today`.
//   HANDOFF (Backend): put `nth_ever` on the world_finds row and on the
//   hr_apply receipt (a count over player_ledger kind='hearthfind' item_id=…,
//   taken under the same character lock) and this file prints it instead.
//   Until then the ordinal is honest-or-absent.
//
// ── WHERE THE STATE LIVES (CLAUDE.md §6) ────────────────────────────────────
// Nothing here is added to `G` and nothing is added to RESIDUE_FIELDS. The
// trophy itself is an inventory row the server owns; the "have I already shown
// this one?" mark is a display fact and lives in the STORAGE SEAM
// (window.HearthriseStorage) keyed by the find's server `at` timestamp, so a
// reload does not re-run the reveal. The day-scoped projection makes that mark
// self-expiring: there is nothing to clean up.
//
// ── WHY THIS IS NOT IN legacy.js ────────────────────────────────────────────
// The monolith ratchet (tests/monolith-ratchet.mjs) says legacy.js may only
// shrink. A new feature surface goes in src/features/*; legacy.js is touched
// only where the return card must call in (one line).
//
// NO AUDIO. The ruling asks for "one low long sound"; this repo has no audio
// seam at all (no window.SFX, no HearthriseAudio, no <audio> element). A new
// Web Audio oscillator would be an unowned, unmuteable subsystem shipped as a
// side effect of a drop reveal. `playSound` below is the seam, wired to
// nothing, with the one line an audio owner needs to fill in. Silence, stated.
// ════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  /* ── THE FOUR HEARTHFINDS ─────────────────────────────────────────────────
     DISPLAY ONLY. Ids and names track the designer's ruling of 2026-09-08
     ("The Four Hearthfinds"; emberheart_core→emberheart, deepvein_geode→
     deepvein_lodestar). `alias` carries the pre-ruling id so a client that
     meets an envelope from a server half that has not yet renamed still
     resolves a name and an icon rather than printing a raw id at the loudest
     moment in the game.

     ⚠ THIS IS NOT A SECOND CATALOGUE. It holds no odds, no rates and no rows
       the engine reads — only four names, four placeholder glyphs and the
       human phrasing of where each one hides, all of which is presentation.
       The moment src/data/items.js carries these ids (the server half adds
       them with `hearthfind:true`), `itemName` and `art` prefer ITEMS and this
       table is only the fallback.

     ICONS ARE PLACEHOLDERS. Atlas glyphs, deliberately generic. The four real
     item icons are the Art Director's and are budget-frozen (Tyler's call). */
  var CATALOGUE = [
    { id: 'emberheart',        alias: 'emberheart_core', name: 'Emberheart',
      glyph: 'uiFlame', sources: ['the Elk King', 'the Grim Reaper', 'the Dragon'] },
    { id: 'worldroot_seed',    alias: null,              name: 'Worldroot Seed',
      glyph: 'uiLeaf',  sources: ['ordinary trees', 'yews', 'duskwood'] },
    { id: 'deepvein_lodestar', alias: 'deepvein_geode',  name: 'Deepvein Lodestar',
      glyph: 'uiPick',  sources: ['copper', 'mithril', 'dawnstone'] },
    { id: 'tidecallers_pearl', alias: null,              name: "Tidecaller's Pearl",
      glyph: 'uiFish',  sources: ['shrimp waters', 'shark waters', 'moonfish waters'] }
  ];

  function entryFor(id) {
    for (var i = 0; i < CATALOGUE.length; i++) {
      if (CATALOGUE[i].id === id || CATALOGUE[i].alias === id) return CATALOGUE[i];
    }
    return null;
  }

  /* ITEMS first — it is the single source of truth for what an item IS. The
     table above is the fallback for the window in which one half has landed
     and the other has not. */
  function itemName(id) {
    var it = (window.ITEMS || {})[id];
    if (it && it.n) return it.n;
    var e = entryFor(id);
    return e ? e.name : String(id || 'Something');
  }

  /* The human name of a source, from the game's own catalogues — never a
     hand-typed copy of a monster or node name. */
  function sourceName(kind, id) {
    if (kind === 'monster') {
      var m = (window.MONSTERS || {})[id];
      if (m && m.name) return m.name;
    } else {
      var pools = [window.TREES, window.ROCKS, window.FISH_SPOTS];
      for (var i = 0; i < pools.length; i++) {
        var p = pools[i]; if (!p) continue;
        var n = null;
        if (Array.isArray(p)) {
          for (var j = 0; j < p.length; j++) if (p[j] && p[j].id === id) n = p[j];
        } else { n = p[id]; }
        if (n && (n.name || n.n)) return n.name || n.n;
      }
    }
    return String(id || '').replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function num(n) { return (Number(n) || 0).toLocaleString(); }

  /** 1→"1st", 2→"2nd", 3→"3rd", 11/12/13→"th". Copy, not arithmetic. */
  function ordinal(n) {
    var v = Math.max(0, Math.floor(Number(n) || 0));
    var t = v % 100, u = v % 10;
    var suf = (t >= 11 && t <= 13) ? 'th' : (u === 1 ? 'st' : u === 2 ? 'nd' : u === 3 ? 'rd' : 'th');
    return v + suf;
  }

  function glyph(id, px) {
    var e = entryFor(id);
    var key = e ? e.glyph : 'uiStar';
    if (window.HR && typeof window.HR.icon === 'function') {
      var svg = window.HR.icon(key, px || 22, 'var(--rr-glow, var(--gold-2))');
      if (svg) return svg;
    }
    return '';
  }

  /** The trophy plate art: the real item art if the item exists, else the
      placeholder glyph. Both paths produce already-safe SVG/img markup. */
  function art(id, px) {
    if (typeof window.itemArt === 'function' && (window.ITEMS || {})[id]) {
      try { var a = window.itemArt(id, px || 64); if (a) return a; } catch (e) {}
    }
    return glyph(id, px || 64);
  }

  /* ── THE FIND, NORMALISED ────────────────────────────────────────────────
     One shape, from either door: hr_apply's receipt (`envelope.hearthfind`)
     or hr_state_of's day-scoped projection (`state.hearthfind_last`). A find
     with no `item` or no positive `one_in` is NOT a find — a reveal that says
     "You beat 1 in 0" is worse than no reveal at all. */
  function normalise(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var item = typeof raw.item === 'string' ? raw.item : null;
    var oneIn = Math.floor(Number(raw.one_in));
    if (!item || !isFinite(oneIn) || oneIn <= 0) return null;
    return {
      item: item,
      kind: typeof raw.source_kind === 'string' ? raw.source_kind : null,
      source: raw.source_id == null ? null : String(raw.source_id),
      oneIn: oneIn,
      nthToday: Math.max(0, Math.floor(Number(raw.nth_today) || 0)),
      at: raw.at ? String(raw.at) : null
    };
  }

  /** The find on an envelope: the receipt first (it exists only on the
      original response), the durable day-scoped projection second. */
  function findOn(res) {
    if (!res || typeof res !== 'object') return null;
    return normalise(res.hearthfind) || normalise((res.state || {}).hearthfind_last);
  }

  /* ── "HAVE I ALREADY LIVED THROUGH THIS ONE?" ────────────────────────────
     Keyed on the SERVER's `at`. Not in G, not in the residue: display state.
     The projection is scoped to the UTC day, so one key is enough. */
  var SEEN_KEY = 'hearthrise:hearthfind:seen';
  function store() { return window.HearthriseStorage || null; }
  function seenAt() {
    try { var s = store(); return s ? (s.get(SEEN_KEY) || '') : ''; } catch (e) { return ''; }
  }
  function markSeen(at) {
    try { var s = store(); if (s && at) s.set(SEEN_KEY, String(at)); } catch (e) {}
  }
  function __forgetSeen() {
    try {
      var s = store();
      if (!s) return;
      if (typeof s.remove === 'function') s.remove(SEEN_KEY); else s.set(SEEN_KEY, '');
    } catch (e) {}
  }

  /* ── HOW MANY EXIST, ACCORDING TO THE PUBLIC BOARD ───────────────────────
     A LOWER BOUND on "Nth ever found" (see the header). Cached per item for
     the life of the page; a miss returns null and every caller degrades to
     silence rather than to a guess. */
  var boardCount = Object.create(null);
  function ordinalFor(item) {
    var n = boardCount[item];
    return (typeof n === 'number' && n > 0) ? n : null;
  }
  function __setBoardCount(item, n) { boardCount[item] = n; }

  /* ── HOW MANY SWINGS ─────────────────────────────────────────────────────
     "{n} swings for this one" is a LIFETIME ACTION COUNT ON THAT SOURCE. The
     game keeps one for monsters (`G.bestiary[id].kills`, mirrored from the
     server's kill credit) and keeps NONE for gathering nodes. So a node find
     omits the clause. It does not print the character's total swings, and it
     does not print an estimate derived from oneIn — that would be printing the
     odds back to the player dressed up as their own history.
     HANDOFF (Backend/Systems): a per-node lifetime counter is the missing
     mirror; when it exists, this function is the one place that reads it. */
  function swingsOn(find, G) {
    var g = G || window.G || {};
    if (find && find.kind === 'monster' && g.bestiary && g.bestiary[find.source]) {
      var k = Number(g.bestiary[find.source].kills) || 0;
      return k > 0 ? k : null;
    }
    return null;
  }

  // ── COPY ────────────────────────────────────────────────────────────────
  /* Every string the ruling fixed, in ONE place, as pure functions. A test
     asserts them character for character; copy built inline in three
     renderers drifts a comma at a time. */

  /** Global chat, rendered FROM A world_finds ROW. `nth` < 2 ⇒ first ever. */
  function chatLine(row, playerName, nth) {
    var item = itemName(row && row.item_id);
    var src = sourceName(row && row.source_kind, row && row.source_id);
    var head = '✦ HEARTHFIND — ' + (playerName || 'An adventurer') + ' pulled the ' + item
      + ' from ' + src + '. 1 in ' + num(row && row.one_in) + '. ';
    return head + (nth && nth > 1
      ? 'The ' + ordinal(nth) + ' ever found in Hearthrise.'
      : 'Nobody in Hearthrise has ever found one before.');
  }

  /** The away band's two lines, as text (the band renders them). */
  function awayLines(find) {
    var nth = ordinalFor(find.item);
    return {
      lead: 'Something happened while you were away.',
      body: itemName(find.item) + ' — 1 in ' + num(find.oneIn) + '.'
        + (nth ? ' The ' + ordinal(nth) + ' ever found.' : '')
    };
  }

  /** The attended reveal's headline, name, odds line and provenance line. */
  function revealLines(find, G) {
    var nth = ordinalFor(find.item);
    var sw = swingsOn(find, G);
    var parts = [];
    if (nth) parts.push(ordinal(nth) + ' ever found');
    if (sw) parts.push(num(sw) + ' swings for this one');
    return {
      headline: 'A HEARTHFIND',
      name: itemName(find.item),
      odds: 'You beat 1 in ' + num(find.oneIn) + '.',
      meta: parts.join(' · ')
    };
  }

  /** Collection log, locked state. */
  function lockedLine(entry) {
    return entry.name + ' — not yet found. Somewhere in ' + entry.sources.join(', ') + '.';
  }

  // ── THE ATTENDED REVEAL ─────────────────────────────────────────────────
  /* NOT A TOAST. The panel dims over ~400ms, an over-scaled plate (~1.6× a
     drop plate) rises at --rr-glow with one slow ember bloom, then the odds
     line fades in. It is DISMISSIBLE AND NEVER AUTO-DISMISSED: the rarest
     event in the game must not be able to happen while the player is looking
     at their phone. The ~3.5s in the brief is the length of the ENTRANCE; no
     timer in this file closes anything. */
  var CSS_ID = 'hr-hf-css';
  function ensureStyle() {
    if (document.getElementById(CSS_ID)) return;
    var st = document.createElement('style');
    st.id = CSS_ID;
    /* Tokens only. --rr-glow comes from .rr-unique (src/features/rarity.js);
       the neutral scrims are the same rgba(0,0,0,…) the rest of the app uses
       for depth and carry no palette decision. */
    st.textContent = [
      /* ABOVE every ordinary modal (10050 is the highest of them), BELOW the
         three system overlays that must never be covered — the quest modal
         (999999), the session-moved veil and the boot veil (100000/99999/99998).
         The rarest moment in the game outranks a shop; it does not outrank
         "your session moved to another tab". */
      '.hr-hf-veil{position:fixed;inset:0;z-index:99990;display:flex;align-items:center;',
      'justify-content:center;background:rgba(0,0,0,.72);opacity:0;',
      'transition:opacity 400ms ease}',
      '.hr-hf-veil.in{opacity:1}',
      '.hr-hf-card{position:relative;max-width:min(92vw,420px);padding:26px 22px 18px;',
      /* AN OPAQUE BASE, THEN THE TOKEN GLOW. `--panel` is semi-transparent in
         this theme, and the reveal lands over the hero banner: at 1440×900 the
         profile card read straight through the headline. The base is a neutral
         scrim (no palette decision); the trophy colour comes from --rr-glow. */
      'border-radius:16px;text-align:center;background-color:rgba(10,9,8,.94);',
      'background-image:linear-gradient(180deg,var(--rr-glow,transparent) -70%,rgba(0,0,0,0) 52%);',
      'border:1px solid var(--line-soft,rgba(255,255,255,.14));',
      'box-shadow:0 0 0 1px rgba(0,0,0,.5),0 0 46px -6px var(--rr-glow,transparent);',
      'transform:translateY(26px) scale(.94);opacity:0;',
      'transition:transform 900ms cubic-bezier(.16,.84,.34,1),opacity 900ms ease}',
      '.hr-hf-veil.in .hr-hf-card{transform:none;opacity:1}',
      '.hr-hf-bloom{position:absolute;left:50%;top:34%;width:min(78vw,340px);height:min(78vw,340px);',
      'transform:translate(-50%,-50%) scale(.4);border-radius:50%;pointer-events:none;',
      'background:radial-gradient(circle,var(--rr-glow,transparent) 0%,rgba(0,0,0,0) 68%);',
      'opacity:0;transition:transform 2600ms ease-out,opacity 2600ms ease-out}',
      '.hr-hf-veil.bloom .hr-hf-bloom{transform:translate(-50%,-50%) scale(1);opacity:.85}',
      '.hr-hf-eyebrow{font-size:var(--t-micro);letter-spacing:.24em;',
      'text-transform:uppercase;color:var(--gold-2,var(--gold));margin-bottom:14px}',
      /* THE PLATE: ~1.6× a drop plate (drop plates render their art at 40px). */
      '.hr-hf-plate{width:104px;height:104px;margin:0 auto 14px;display:flex;',
      'align-items:center;justify-content:center}',
      '.hr-hf-plate svg,.hr-hf-plate img{width:64px;height:64px}',
      '.hr-hf-name{font-size:calc(25px * var(--ui-scale,1));line-height:1.15;',
      'color:var(--ink,currentColor);margin-bottom:12px}',
      '.hr-hf-odds,.hr-hf-meta{opacity:0;transition:opacity 900ms ease}',
      '.hr-hf-veil.odds .hr-hf-odds,.hr-hf-veil.odds .hr-hf-meta{opacity:1}',
      '.hr-hf-odds{font-size:calc(17px * var(--ui-scale,1));color:var(--gold-2,var(--gold))}',
      '.hr-hf-meta{font-size:var(--t-micro);color:var(--ink-2,currentColor);margin-top:6px}',
      '.hr-hf-acts{display:flex;gap:10px;justify-content:center;margin-top:20px;flex-wrap:wrap}',
      '.hr-hf-btn{padding:9px 16px;border-radius:9px;cursor:pointer;',
      'font-size:var(--t-micro);color:var(--ink,currentColor);',
      'background:var(--btn,rgba(255,255,255,.06));',
      'border:1px solid var(--line-soft,rgba(255,255,255,.16))}',
      /* THE AWAY BAND — full width, owning the top of the return card. */
      '.hr-hf-band{margin:0 0 14px;padding:12px 14px;border-radius:12px;text-align:left;',
      'background:var(--panel-2,rgba(0,0,0,.28));',
      'border:1px solid var(--line-soft,rgba(255,255,255,.14));',
      'box-shadow:inset 0 0 30px -10px var(--rr-glow,transparent)}',
      '.hr-hf-band-row{display:flex;align-items:center;gap:12px}',
      '.hr-hf-band-ic{flex:0 0 auto;width:38px;height:38px;display:flex;',
      'align-items:center;justify-content:center}',
      '.hr-hf-band-ic svg,.hr-hf-band-ic img{width:34px;height:34px}',
      '.hr-hf-band-lead{font-size:var(--t-micro);letter-spacing:.14em;',
      'text-transform:uppercase;color:var(--ink-2,currentColor)}',
      '.hr-hf-band-body{font-size:calc(15px * var(--ui-scale,1));color:var(--gold-2,var(--gold))}',
      /* THE COLLECTION SECTION. */
      '.hr-hf-cl{display:flex;flex-direction:column;gap:8px;margin-bottom:6px}',
      '.hr-hf-cl-row{display:flex;align-items:center;gap:11px;padding:9px 11px;border-radius:10px;',
      'background:var(--panel-2,rgba(0,0,0,.22));',
      'border:1px solid var(--line-soft,rgba(255,255,255,.10))}',
      '.hr-hf-cl-row.found{box-shadow:0 0 18px -6px var(--rr-glow,transparent)}',
      '.hr-hf-cl-row.miss{opacity:.62}',
      '.hr-hf-cl-ic{flex:0 0 auto;width:30px;height:30px;display:flex;align-items:center;justify-content:center}',
      '.hr-hf-cl-tx{flex:1;font-size:var(--t-micro);color:var(--ink,currentColor)}',
      '.hr-hf-cl-sub{font-size:var(--t-micro);color:var(--ink-2,currentColor);margin-top:3px}',
      /* THE TITLE BESIDE THE NAME. Tokens only: the trophy gold the rest of
         this feature already uses, on the same quiet pill the clan tag and the
         status pill wear, so the topbar row gains a third chip rather than a
         new visual language. `min-width:0` + ellipsis because the row it sits
         in is a flex row that must not push the status pill off a 922px
         landscape phone. */
      /* 18ch, MEASURED not guessed: at 14ch the longest title in the ruling
         ("Wonderkeeper", the full-set reward) ellipsised to "Wonderkeep…" on a
         1440px desktop — the rarest thing in the game, chopped. `ch` is the "0"
         advance of a proportional serif, so 12 characters of title need ~16ch
         of box plus the pill's padding. The cap stays because a future title is
         not this file's to predict, and the row it sits in must not push the
         status pill off a 922px landscape phone. */
      '.hr-hf-title{display:inline-block;max-width:18ch;overflow:hidden;',
      'text-overflow:ellipsis;white-space:nowrap;vertical-align:bottom;',
      'font-size:var(--t-micro);letter-spacing:.06em;',
      'padding:1px 7px;border-radius:999px;color:var(--gold-2,var(--gold));',
      'background:var(--panel-2,rgba(0,0,0,.28));',
      'border:1px solid var(--line-soft,rgba(255,255,255,.14))}',
      '.hr-hf-title.hide{display:none}',
      /* THE CHOOSER. */
      '.hr-hf-titles{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:4px}',
      '.hr-hf-tchip{padding:5px 11px;border-radius:999px;cursor:pointer;',
      'font-size:var(--t-micro);color:var(--ink-2,currentColor);',
      'background:var(--panel-2,rgba(0,0,0,.22));',
      'border:1px solid var(--line-soft,rgba(255,255,255,.12))}',
      '.hr-hf-tchip.on{color:var(--gold-2,var(--gold));',
      'border-color:var(--gold-2,var(--gold));',
      'box-shadow:0 0 14px -6px var(--rr-glow,transparent)}',
      '.hr-hf-tnote{font-size:var(--t-micro);',
      'color:var(--ink-2,currentColor);opacity:.8;margin-bottom:8px}',
      /* THE GLOBAL CHAT LINE — one ✦ accent, the name in the trophy colour. */
      '.chat-msg.system.accent-hearthfind .cm-body{color:var(--gold-2,var(--gold))}',
      '.chat-msg.system.accent-hearthfind{border-left:2px solid var(--rr-glow,transparent);padding-left:7px}',
      '.chat-msg.system.accent-hearthfind .cm-link{color:var(--ink,currentColor);',
      'text-decoration:underline;text-underline-offset:2px;cursor:pointer}',
      /* Landscape phones — the frozen breakpoint set (CLAUDE.md §7). */
      '@media (max-width: 540px), (max-height: 540px) and (max-width: 1024px){',
      '.hr-hf-card{max-width:min(94vw,380px);padding:16px 16px 12px}',
      '.hr-hf-plate{width:74px;height:74px;margin-bottom:8px}',
      '.hr-hf-plate svg,.hr-hf-plate img{width:46px;height:46px}',
      '.hr-hf-name{font-size:calc(20px * var(--ui-scale,1));margin-bottom:8px}',
      '.hr-hf-bloom{top:30%}',
      '.hr-hf-eyebrow{margin-bottom:8px}',
      '.hr-hf-acts{margin-top:12px}}'
    ].join('');
    (document.head || document.documentElement).appendChild(st);
  }

  /* THE AUDIO SEAM. The ruling asks for "one low long sound"; this repo has no
     audio subsystem to reuse, and inventing one inside a drop reveal would
     ship an unowned, unmuteable, unsettable noise on the loudest surface in
     the game. Wired to nothing on purpose. An audio owner fills this in and
     every reveal gets the sound, with no other change anywhere. */
  function playSound() { /* no audio seam in this build — silence, stated. */ }

  var openVeil = null;

  function dismissReveal() {
    if (!openVeil) return false;
    var v = openVeil; openVeil = null;
    v.classList.remove('in');
    setTimeout(function () { if (v && v.parentNode) v.parentNode.removeChild(v); }, 420);
    return true;
  }

  /**
   * Show the attended reveal. Returns the veil element (the test seam).
   * NEVER auto-dismisses: no timer in here removes it.
   */
  function showReveal(find, G) {
    if (!find) return null;
    ensureStyle();
    if (openVeil && openVeil.parentNode) openVeil.parentNode.removeChild(openVeil);
    openVeil = null;
    var L = revealLines(find, G);
    var v = document.createElement('div');
    v.className = 'hr-hf-veil';
    v.id = 'hr-hf-veil';
    v.setAttribute('role', 'dialog');
    v.setAttribute('aria-label', 'A Hearthfind');
    v.innerHTML = '<div class="hr-hf-bloom"></div>'
      + '<div class="hr-hf-card rr-frame rr-unique">'
      + '<div class="hr-hf-eyebrow">' + esc(L.headline) + '</div>'
      + '<div class="hr-hf-plate">' + art(find.item, 64) + '</div>'
      + '<div class="hr-hf-name">' + esc(L.name) + '</div>'
      + '<div class="hr-hf-odds">' + esc(L.odds) + '</div>'
      + (L.meta ? '<div class="hr-hf-meta">' + esc(L.meta) + '</div>' : '')
      + '<div class="hr-hf-acts">'
      + '<button class="hr-hf-btn" data-hf="copy">Copy card</button>'
      + '<button class="hr-hf-btn" data-hf="close">Close</button>'
      + '</div></div>';
    document.body.appendChild(v);
    openVeil = v;
    /* The dim, then the rise, then the bloom, then the odds — the ruling's
       ~3.5s entrance as four transitions, and no timeout that closes it. */
    var run = function () {
      v.classList.add('in');
      setTimeout(function () { v.classList.add('bloom'); }, 420);
      setTimeout(function () { v.classList.add('odds'); }, 1500);
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run); else run();
    v.addEventListener('click', function (e) {
      var b = (e.target && e.target.closest) ? e.target.closest('[data-hf]') : null;
      if (b && b.getAttribute('data-hf') === 'copy') { copyCard(find); return; }
      if (b || e.target === v) dismissReveal();
    });
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape' && openVeil === v) { dismissReveal(); document.removeEventListener('keydown', onKey); }
    });
    playSound();
    return v;
  }

  // ── THE AWAY BAND ───────────────────────────────────────────────────────
  /* Owns the TOP of the return card, full width, above the XP/loot summary.
     Never a loot-list line — the whole point is that it is not one of the rows. */
  function awayBandHtml(find) {
    if (!find) return '';
    var L = awayLines(find);
    return '<div class="hr-hf-band rr-unique"><div class="hr-hf-band-row">'
      + '<div class="hr-hf-band-ic">' + art(find.item, 34) + '</div>'
      + '<div style="flex:1">'
      + '<div class="hr-hf-band-lead">' + esc(L.lead) + '</div>'
      + '<div class="hr-hf-band-body">' + esc(L.body) + '</div>'
      + '</div></div></div>';
  }

  /** Called by the return card (legacy.js maybeShowWelcome). Consumes the
      pending find, so it is shown ONCE and as a band rather than as a modal. */
  function claimAwayBand() {
    var f = pending;
    if (!f) return '';
    pending = null;
    markSeen(f.at);
    lastShown = f;
    return awayBandHtml(f);
  }

  // ── THE COLLECTION LOG SECTION ──────────────────────────────────────────
  /* "The Four Hearthfinds". Reads the collection log the collection-log lane
     levelled today (`G.collection`, reconciled against the realm's bag) and
     the same server-authored find record the reveal reads. LOCKED rows print
     the ruled sentence; FOUND rows print the date, the odds beaten, the
     lifetime action count on that source and the ordinal — each clause omitted
     rather than guessed when its source is absent. */
  function foundRecordFor(id) {
    return (lastShown && lastShown.item === id) ? lastShown : null;
  }
  function collectionRows(G) {
    var g = G || window.G || {};
    var col = g.collection || {};
    var inv = g.inventory || {};
    return CATALOGUE.map(function (e) {
      var held = !!(col[e.id] || col[e.alias] || inv[e.id] || inv[e.alias]);
      var rec = foundRecordFor(e.id) || (e.alias ? foundRecordFor(e.alias) : null);
      var nth = ordinalFor(e.id) || (e.alias ? ordinalFor(e.alias) : null);
      var bits = [];
      if (rec) {
        if (rec.at) {
          var d = new Date(rec.at);
          if (!isNaN(d.getTime())) bits.push(d.toLocaleDateString());
        }
        bits.push('beat 1 in ' + num(rec.oneIn));
        var sw = swingsOn(rec, g);
        if (sw) bits.push(num(sw) + ' swings on ' + sourceName(rec.kind, rec.source));
        if (nth) bits.push(ordinal(nth) + ' ever found');
      }
      return {
        id: e.id, name: e.name, found: held,
        text: held ? e.name : lockedLine(e),
        sub: held ? bits.join(' · ') : ''
      };
    });
  }
  function collectionSection(G) {
    var rows = collectionRows(G);
    var found = rows.filter(function (r) { return r.found; }).length;
    return '<div class="hr-cl-sec">The Four Hearthfinds · ' + found + '/' + rows.length + '</div>'
      + '<div class="hr-hf-cl">' + rows.map(function (r) {
        return '<div class="hr-hf-cl-row rr-unique ' + (r.found ? 'found' : 'miss') + '" data-hf-item="' + esc(r.id) + '">'
          + '<div class="hr-hf-cl-ic">' + art(r.id, 26) + '</div>'
          + '<div class="hr-hf-cl-tx">' + esc(r.text)
          + (r.sub ? '<div class="hr-hf-cl-sub">' + esc(r.sub) + '</div>' : '')
          + '</div></div>';
      }).join('') + '</div>';
  }

  // ── THE TITLES ──────────────────────────────────────────────────────────
  /* WHERE A TITLE COMES FROM, AND WHY IT CANNOT COME FROM ANYWHERE ELSE.
     hr_apply writes the unlock into public.player_cosmetics under the character
     lock, from ITS OWN catalogue lookup of the trophy it just granted;
     hr_state_of projects the set as `state.hearthfind_titles`, an array of
     {code, name, at} ordered oldest-first. THIS MODULE HOLDS THAT ARRAY AND
     NOTHING ELSE. There is no client-side derivation from the inventory ("you
     hold an Emberheart, so you must be Emberborn"), no RESIDUE_FIELDS entry and
     no key on `G`. A client that has never seen the projection shows NO TITLE —
     CLAUDE.md §6's fail-safe of "not unlocked" — which is why `projected`
     starts empty and only a projected key can fill it.

     ⚠ KEY PRESENCE, not truthiness — the same rule reconcileFall uses for
       `consec_falls`. An ABSENT key is a server that predates the projection
       and must leave the last one alone; an EMPTY ARRAY is a server saying
       "this character has earned none" and must clear it. Conflating the two
       would make a mixed-deploy window either erase an earned title or keep
       showing one the server no longer projects.

     ⚠ THE NAME IS THE SERVER'S STRING. Rendered from `row.name`, never looked
       up in this file's CATALOGUE: if the designer renames a title the rename
       reaches every client through the projection with no client deploy, and a
       code this build has never heard of still renders its real name rather
       than a raw id. */
  var projected = [];

  function normaliseTitles(raw) {
    if (!Array.isArray(raw)) return [];
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var r = raw[i];
      if (!r || typeof r !== 'object') continue;
      var code = String(r.code == null ? '' : r.code);
      var name = String(r.name == null ? '' : r.name);
      /* A row with no code cannot be chosen and a row with no name cannot be
         drawn; neither is renderable, so neither is kept. */
      if (!code || !name) continue;
      out.push({ code: code, name: name, at: r.at || null });
    }
    return out;
  }

  /** Called from noteEnvelope on EVERY envelope. Returns the new list, or null
      when this envelope said nothing about titles. */
  function noteTitles(res) {
    var st = res && res.state;
    if (!st || typeof st !== 'object') return null;
    if (!Object.prototype.hasOwnProperty.call(st, 'hearthfind_titles')) return null;
    projected = normaliseTitles(st.hearthfind_titles);
    try { paintTitle(); } catch (e) {}
    return projected.slice();
  }

  /** Every title this character has EARNED, as the server states them. */
  function earnedTitles() { return projected.slice(); }

  /* WHICH ONE IS SHOWN — a DEVICE-LOCAL PREFERENCE OVER A SERVER-OWNED SET.
     The ruling's addendum (2026-09-08 18:15 UTC) defers the equip INTENT to a
     fast follow, so there is no server column to write and this lane authors no
     migration. What is safe without one, and what is not:

       · SAFE. The pick only ever SELECTS from `projected`. It is validated
         against that array on every read, so a hand-edited storage value cannot
         make this client render a title the server never granted — the worst a
         forged value can do is fall back to the default.
       · SAFE. The surfaces it drives (the topbar and the player's own profile
         card) are SELF-ONLY. Nothing here writes to chat, display_names,
         world_finds, a leaderboard or any other player's screen, so no other
         player can ever read a value this client authored. That is the line
         CLAUDE.md §1 draws, and this stays on the right side of it.
       · NOT DONE HERE. Making the choice visible to OTHER players needs the
         server to own it — one column plus an intent, lane C, with the
         anti-impersonation review the addendum asks for.

     The default is the NEWEST earned title (the projection is oldest-first), so
     a character who has never opened the log still wears the thing they just
     did. NO_TITLE is the explicit "show none" pick: a reserved sentinel that
     cannot be mistaken for a server code, because every comparison that could
     accept a code is made against `projected`, which only the server fills. */
  var NO_TITLE = '-none-';
  var TITLE_KEY = 'hearthrise:hearthfind:title';

  function pickedCode() {
    var s = store();
    if (!s) return '';
    try { return String(s.get(TITLE_KEY) || ''); } catch (e) { return ''; }
  }

  /** The title to DRAW, or null. Never invents a row. */
  function activeTitle() {
    if (!projected.length) return null;
    var pick = pickedCode();
    if (pick === NO_TITLE) return null;
    if (pick) {
      for (var i = 0; i < projected.length; i++) {
        if (projected[i].code === pick) return projected[i];
      }
      /* The pick names a title this character has not earned (another
         character's choice, or a stale code). Fall through to the default
         rather than render it. */
    }
    return projected[projected.length - 1];
  }

  /** Choose the shown title. `code` must be an earned code or NO_TITLE;
      anything else clears the pick back to the default. Returns what will now
      be drawn (or null for none). */
  function chooseTitle(code) {
    var c = String(code == null ? '' : code);
    var ok = (c === NO_TITLE);
    for (var i = 0; !ok && i < projected.length; i++) if (projected[i].code === c) ok = true;
    var s = store();
    try {
      if (s) { if (ok) s.set(TITLE_KEY, c); else s.remove(TITLE_KEY); }
    } catch (e) {}
    try { paintTitle(); } catch (e) {}
    return activeTitle();
  }

  /** The badge beside a rendered name. Empty string when there is nothing to
      say — a caller can concatenate it unconditionally. */
  function titleBadgeHtml() {
    var t = activeTitle();
    if (!t) return '';
    /* The sheet is this module's, and a caller that only ever asks for the
       badge (the profile card) may never have opened a reveal, so the styles
       are ensured HERE rather than assumed. The leading space is the separator:
       the badge is an inline pill after a name, not a flex child there. */
    ensureStyle();
    return ' <span class="hr-hf-title">' + esc(t.name) + '</span>';
  }

  /* THE TOPBAR SLOT. Painted by this module and by nothing else, from the two
     moments the answer can change: a new projection (noteTitles) and a new pick
     (chooseTitle). Deliberately NOT hooked into updateTopbar — `#player-title`
     is static markup in index.html that nothing ever replaces (the topbar
     writes textContent, never innerHTML), so a per-frame repaint would be a
     second writer bought for nothing, and this feature does not need to wrap
     another legacy entry point to be correct. An absent element is not an
     error: the topbar does not exist behind the boot veil. */
  function paintTitle() {
    if (typeof document === 'undefined') return '';
    var el = document.getElementById('player-title');
    if (!el) return '';
    var t = activeTitle();
    ensureStyle();
    el.textContent = t ? t.name : '';
    if (t) el.classList.remove('hide'); else el.classList.add('hide');
    return t ? t.name : '';
  }

  /* THE CHOOSER, in the collection log beside the trophies that earned them —
     where the ruling put it ("unlocked + shown in the collection log is
     enough"). Absent when the character has earned none: an empty rail that
     advertises a feature nobody has unlocked is noise on every other screen. */
  function titlesSection() {
    if (!projected.length) return '';
    var active = activeTitle();
    var chips = projected.map(function (t) {
      var on = !!(active && active.code === t.code);
      return '<button type="button" class="hr-hf-tchip' + (on ? ' on' : '') + '"'
        + ' data-hf-title="' + esc(t.code) + '"'
        + ' aria-pressed="' + (on ? 'true' : 'false') + '">' + esc(t.name) + '</button>';
    });
    chips.push('<button type="button" class="hr-hf-tchip' + (active ? '' : ' on') + '"'
      + ' data-hf-title="' + NO_TITLE + '"'
      + ' aria-pressed="' + (active ? 'false' : 'true') + '">None</button>');
    return '<div class="hr-cl-sec">Titles · ' + projected.length + '</div>'
      + '<div class="hr-hf-titles">' + chips.join('') + '</div>'
      + '<div class="hr-hf-tnote">Shown beside your name on this device.</div>';
  }

  /** TEST-ONLY. Forget the projection and the pick. */
  function __resetTitles() {
    projected = [];
    var s = store();
    try { if (s) s.remove(TITLE_KEY); } catch (e) {}
    try { paintTitle(); } catch (e) {}
    return projected;
  }

  // ── THE SHAREABLE CARD ──────────────────────────────────────────────────
  /* Portrait PNG, canvas-rendered, copied to the clipboard.
     WHAT IS DELIBERATELY NOT ON IT: level, gold, gear, clan, playtime, account
     id, email. The card is a picture of a MOMENT, not a profile — a screenshot
     a player posts publicly must not carry anything that identifies or ranks
     the account behind it.
     Colours are READ FROM THE LIVE TOKENS (getComputedStyle on :root), so the
     card matches the theme the player is looking at and this file holds no
     palette of its own. */
  var CARD_W = 720, CARD_H = 1000;
  function token(name, fallback) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name);
      v = (v || '').trim();
      return v || fallback;
    } catch (e) { return fallback; }
  }
  function drawCard(find, playerName) {
    var c = document.createElement('canvas');
    c.width = CARD_W; c.height = CARD_H;
    var x = c.getContext('2d');
    var ink = token('--ink', 'rgb(238,232,222)');
    var ink2 = token('--ink-2', 'rgba(238,232,222,.66)');
    var gold = token('--gold-2', token('--gold', 'rgb(214,177,102)'));
    var glow = token('--rr-glow', 'rgba(22,179,166,.55)');
    x.fillStyle = token('--panel', 'rgb(22,18,15)');
    x.fillRect(0, 0, CARD_W, CARD_H);
    try {
      var g = x.createRadialGradient(CARD_W / 2, 360, 10, CARD_W / 2, 360, 420);
      g.addColorStop(0, glow);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.globalAlpha = 0.5; x.fillStyle = g; x.fillRect(0, 0, CARD_W, 780); x.globalAlpha = 1;
    } catch (e) {}
    x.strokeStyle = gold; x.lineWidth = 3; x.strokeRect(24, 24, CARD_W - 48, CARD_H - 48);
    x.textAlign = 'center';
    x.fillStyle = gold; x.font = '600 26px sans-serif';
    x.fillText('A HEARTHFIND', CARD_W / 2, 130);
    /* THE TROPHY ART IS A PLACEHOLDER DISC. Rasterising an atlas glyph needs an
       image round-trip the clipboard path cannot wait on, and the four real
       trophy illustrations are the Art Director's (budget-frozen). They drop
       in exactly here. */
    x.beginPath(); x.arc(CARD_W / 2, 350, 128, 0, Math.PI * 2);
    x.strokeStyle = glow; x.lineWidth = 6; x.stroke();
    x.fillStyle = ink; x.font = '600 44px serif';
    x.fillText(itemName(find.item), CARD_W / 2, 570);
    x.fillStyle = gold; x.font = '700 96px sans-serif';
    x.fillText('1 in ' + num(find.oneIn), CARD_W / 2, 700);
    x.fillStyle = ink2; x.font = '400 24px sans-serif';
    var when = find.at ? new Date(find.at) : new Date();
    if (isNaN(when.getTime())) when = new Date();
    x.fillText((playerName || 'An adventurer') + ' · ' + sourceName(find.kind, find.source)
      + ' · ' + when.toLocaleDateString(), CARD_W / 2, 770);
    var nth = ordinalFor(find.item);
    if (nth) x.fillText('The ' + ordinal(nth) + ' ever found in Hearthrise', CARD_W / 2, 812);
    x.fillStyle = gold; x.font = '600 30px serif';
    x.fillText('HEARTHRISE', CARD_W / 2, 930);
    return c;
  }
  /* The display name only — never the email, never the account id. */
  function myName() {
    var g = window.G || {};
    return g.name || g.playerName || 'An adventurer';
  }
  function copyCard(find) {
    var canvas = drawCard(find, myName());
    return new Promise(function (resolve) {
      if (!canvas.toBlob || !navigator.clipboard || !window.ClipboardItem) {
        if (typeof window.notify === 'function') window.notify('Card copying is not available in this browser', 'bad');
        resolve(false); return;
      }
      canvas.toBlob(function (blob) {
        if (!blob) { resolve(false); return; }
        navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })])
          .then(function () {
            if (typeof window.notify === 'function') window.notify('Card copied', 'loot');
            resolve(true);
          })
          .catch(function () {
            if (typeof window.notify === 'function') window.notify('Could not copy the card', 'bad');
            resolve(false);
          });
      }, 'image/png');
    });
  }

  // ── THE ENVELOPE HOOK ───────────────────────────────────────────────────
  /* `noteEnvelope` is called from applyEnvelopeState (src/net/accrue.js) — the
     ONE funnel every envelope passes through, away or attended. It decides
     NOTHING about the find; it decides only whether this client has already
     lived through it.

     WHY PRESENTATION IS DEFERRED BY ONE TASK. Whether a find is ATTENDED or
     AWAY is not a field on the envelope; it is whether the receipt this
     envelope paid describes an ABSENCE. That receipt (`G.lastOfflineSummary`)
     is written by the CALLER, immediately after applyEnvelopeState returns. So
     the choice is made one task later, when the caller has finished — never
     inferred from something the server does not send. */
  var pending = null;
  var lastShown = null;

  function noteEnvelope(res) {
    /* THE TITLES FIRST, AND UNCONDITIONALLY. The cosmetic projection is on
       EVERY envelope, not only the one that paid a find: a player who earned
       Emberborn last week must see it on the reload that grants nothing. This
       is why it is read before the `findOn` early return. */
    try { noteTitles(res); } catch (e) {}
    var f = findOn(res);
    if (!f) return null;
    if (f.at && seenAt() === String(f.at)) return null;   // already lived through
    pending = f;
    setTimeout(present, 0);
    return f;
  }

  /** ATTENDED or AWAY. Exported so the suite can grade the choice directly. */
  function classify(find, G) {
    var g = G || window.G || {};
    var s = g.lastOfflineSummary;
    if (!s || typeof s !== 'object') return 'attended';
    var awayMs = Number(s.awayMs) || 0;
    if (awayMs < 60000) return 'attended';
    if (s.source === 'switch') return 'attended';
    /* The find must fall inside the span this receipt paid for. Without the
       window check one away receipt would keep re-labelling every later
       attended find as "while you were away" for the rest of the session. */
    if (find && find.at) {
      var t = Date.parse(find.at);
      if (isFinite(t) && t < Date.now() - awayMs - 300000) return 'attended';
    }
    return 'away';
  }

  function present() {
    var f = pending;
    if (!f) return null;
    if (classify(f, window.G) === 'away') return 'away';  // claimAwayBand takes it
    pending = null;
    markSeen(f.at);
    lastShown = f;
    try { showReveal(f, window.G); } catch (e) {}
    /* The board count that makes the ordinal printable usually arrives after
       the reveal has opened. Refresh once and repaint if it turns up — the
       reveal is never auto-dismissed, so there is time. */
    try {
      var p = refreshBoard();
      if (p && typeof p.then === 'function') {
        p.then(function () {
          if (openVeil && ordinalFor(f.item)) { try { showReveal(f, window.G); } catch (e) {} }
        });
      }
    } catch (e) {}
    return 'attended';
  }

  // ── THE PUBLIC BOARD → THE GLOBAL CHAT LINE ─────────────────────────────
  /* THE LINE IS RENDERED FROM A world_finds ROW, NEVER FROM A CLAIM. This
     module does not call Chat.send: a client that could send the hearthfind
     line into chat_messages could send it for a find that never happened, and
     the chat table has no idea what a find is. Instead every client reads the
     public board itself and injects the line LOCALLY into its own global tab.
     One server row therefore produces one line per reader, all of them derived
     from that row, and a forged client can lie only to itself.

     POLLED, NOT SUBSCRIBED: world_finds is not in the Realtime publication
     (the migration adds no publication membership), and adding one is a lane-C
     change. At roughly two finds per realm-week a 90-second poll is the right
     instrument anyway. */
  var POLL_MS = 90000;
  var BOARD_KEY = 'hearthrise:hearthfind:board';
  var lastRowId = 0;
  var polling = false;

  function cfg() {
    return (window.HearthriseSupabase && window.HearthriseSupabase.getConfig
      && window.HearthriseSupabase.getConfig()) || null;
  }
  function session() {
    return (window.HearthriseAuth && window.HearthriseAuth.getSession
      && window.HearthriseAuth.getSession()) || null;
  }
  function headers() {
    var c = cfg(), s = session();
    return { apikey: c.anonKey, Authorization: 'Bearer ' + ((s && s.access_token) || c.anonKey) };
  }
  /* THE SELF-CONFIGURING SWITCH (the recoverCol idiom, borrowed from the edge).
     `world_finds` is created by a lane-C migration and the client half may ship
     first or last. A client that polls a table that does not exist yet logs a
     404 every ninety seconds forever — noise in every player's console and in
     every future run of the suite, and the exact "UI says one thing, backend
     says another" class this repo keeps paying for. So a MISSING table is
     learned once and remembered for ten minutes, which is also long enough for
     a session that was open when the migration applied to pick it up. */
  var missingUntil = 0;
  function boardMissing() { return Date.now() < missingUntil; }
  function noteMissing() { missingUntil = Date.now() + 600000; }
  function __resetProbe() { missingUntil = 0; }

  function get(path) {
    var c = cfg();
    if (!c) return Promise.resolve(null);
    return fetch(c.url + '/rest/v1/' + path, { headers: headers() })
      .then(function (r) {
        if (r.status === 404) { noteMissing(); return null; }
        return r.ok ? r.json() : null;
      })
      .catch(function () { return null; });
  }

  /** Names for a set of user ids, from the public display_names table. A miss
      is "An adventurer" — the board stores no name and never should. */
  function namesFor(ids) {
    var out = Object.create(null);
    if (!ids.length) return Promise.resolve(out);
    return get('display_names?select=user_id,name&user_id=in.('
      + ids.map(encodeURIComponent).join(',') + ')').then(function (rows) {
      (rows || []).forEach(function (r) { if (r && r.user_id) out[r.user_id] = r.name; });
      return out;
    });
  }

  /**
   * Read the board, update the per-item counts, and inject any row this client
   * has not yet rendered into the global chat tab.
   */
  function refreshBoard(opts) {
    if (polling || !cfg() || boardMissing()) return Promise.resolve(false);
    polling = true;
    return get('world_finds?select=id,user_id,item_id,source_kind,source_id,one_in,found_at'
      + '&order=id.asc&limit=500').then(function (rows) {
      if (!Array.isArray(rows)) return false;
      /* THE COUNT, AND THE ORDINAL IT IMPLIES. Rows arrive oldest-first, so a
         row's position among its own item IS its board ordinal. */
      var running = Object.create(null);
      rows.forEach(function (r) {
        running[r.item_id] = (running[r.item_id] || 0) + 1;
        r.__nth = running[r.item_id];
      });
      Object.keys(running).forEach(function (k) { __setBoardCount(k, running[k]); });

      if (!lastRowId) {
        var s = store();
        try { lastRowId = s ? (Number(s.get(BOARD_KEY)) || 0) : 0; } catch (e) { lastRowId = 0; }
        /* FIRST LOAD ON THIS DEVICE: catch up silently rather than replaying a
           week of the realm's finds into the chat dock on boot. */
        if (!lastRowId && rows.length && !(opts && opts.replayAll)) {
          lastRowId = Number(rows[rows.length - 1].id);
          try { if (s) s.set(BOARD_KEY, String(lastRowId)); } catch (e) {}
          return true;
        }
      }
      var fresh = rows.filter(function (r) { return Number(r.id) > lastRowId; });
      if (!fresh.length) return true;
      var ids = fresh.map(function (r) { return r.user_id; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
      return namesFor(ids).then(function (names) {
        fresh.forEach(function (r) { announce(r, names[r.user_id], r.__nth); });
        lastRowId = Number(fresh[fresh.length - 1].id);
        try { var s2 = store(); if (s2) s2.set(BOARD_KEY, String(lastRowId)); } catch (e) {}
        return true;
      });
    }).then(function (v) { polling = false; return v; },
      function () { polling = false; return false; });
  }

  /** Put ONE board row on the global tab, locally. Never Chat.send. */
  function announce(row, playerName, nth) {
    var body = chatLine(row, playerName, nth);
    ensureStyle();   // the accent lives in this module's sheet, not chat's
    if (window.Chat && typeof window.Chat.inject === 'function') {
      window.Chat.inject('global', {
        id: 'hf-' + row.id,
        body: body,
        ts: row.found_at ? Date.parse(row.found_at) : Date.now(),
        system: true,
        accent: 'hearthfind',
        /* The item name is clickable → the card. The chat renderer makes the
           anchor; this module owns what the click DOES. */
        link: { label: itemName(row.item_id), action: 'hearthfind', item: row.item_id }
      });
    }
    return body;
  }

  /** The chat line's item link lands here: show the card for that item. */
  function openCardFor(itemId) {
    var f = (lastShown && lastShown.item === itemId) ? lastShown : null;
    if (!f && !entryFor(itemId)) return false;
    showReveal(f || { item: itemId, kind: null, source: null, oneIn: 0, at: null }, window.G);
    return true;
  }

  var timer = null;
  function startPolling() {
    if (timer) return;
    timer = setInterval(function () { refreshBoard(); }, POLL_MS);
    refreshBoard();
  }
  if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { setTimeout(startPolling, 4000); });
    } else { setTimeout(startPolling, 4000); }
  }

  window.HearthriseHearthfind = {
    CATALOGUE: CATALOGUE,
    // copy (pure)
    ordinal: ordinal, itemName: itemName, sourceName: sourceName,
    chatLine: chatLine, awayLines: awayLines, revealLines: revealLines, lockedLine: lockedLine,
    // envelope
    noteEnvelope: noteEnvelope, findOn: findOn, classify: classify, present: present,
    // surfaces
    showReveal: showReveal, dismissReveal: dismissReveal,
    awayBandHtml: awayBandHtml, claimAwayBand: claimAwayBand,
    collectionRows: collectionRows, collectionSection: collectionSection,
    // titles (server-projected; the pick is a device-local preference)
    noteTitles: noteTitles, earnedTitles: earnedTitles, activeTitle: activeTitle,
    chooseTitle: chooseTitle, titleBadgeHtml: titleBadgeHtml,
    titlesSection: titlesSection, paintTitle: paintTitle, NO_TITLE: NO_TITLE,
    drawCard: drawCard, copyCard: copyCard, openCardFor: openCardFor,
    // board
    refreshBoard: refreshBoard, announce: announce, ordinalFor: ordinalFor,
    // test seams
    __setBoardCount: __setBoardCount,
    __resetProbe: __resetProbe,
    __resetTitles: __resetTitles,
    __boardMissing: boardMissing,
    __forgetSeen: __forgetSeen,
    __pending: function () { return pending; },
    __setPending: function (f) { pending = f; },
    __lastShown: function () { return lastShown; },
    __setLastShown: function (f) { lastShown = f; }
  };
})();
