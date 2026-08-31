// ============================================================
// src/features/chronicle.js — the Chronicle. The bell's panel.
//
// WHY THIS EXISTS
// The b227 click-through audit (docs/reports/AUDIT-2026-08-08-clickthrough.md
// finding #3) found the topbar bell had no handler at all: no `onclick`, no
// listener anywhere in src/, and a `#nb-dot` badge hardcoded to 0 with class
// `hide` and no writer. A permanently dead control, on every screen. Tyler's
// question is the design brief: "where do the achievements end up after they
// go away? how can I look at them permanently?"
//
// Answer: two tiers of memory, because "what did I miss in the last minute"
// and "what have I accomplished" are different questions and one list cannot
// serve both.
//
//   1. RECENT — every toast the b219 queue is handed, newest first, in a
//      capped in-memory ring. Answers "I looked away, what happened?".
//      DELIBERATELY NOT PERSISTED. Three reasons: (a) it is a session
//      question — a toast that mattered enough to outlive the session is a
//      MILESTONE and belongs in the tier below; (b) an idle game emits
//      thousands of "+3 Oak Log" toasts a day and persisting them would put
//      pure noise in the save AND in the cloud snapshot; (c) after a cloud
//      restore on another device a replayed toast log describes events that
//      did not happen on this screen, which is worse than absent. The section
//      is labelled "This session" so the contract is visible, not implied.
//
//   2. MILESTONES — a curated, permanent record in the save (`G.chronicle`).
//      Only moments that deserve permanence: renown rank-ups, the level
//      marks (25/50/75/92/99), first kill of each boss, companion/pet
//      unlocks, homestead tier, clan-seat castle tier, Hunt clears, and the
//      name claim. Rendered with real relative timestamps.
//
// THE TWO WAYS A MILESTONE GETS RECORDED
//   • A HOOK at the source, for a real timestamp. Every hook is a wrapper
//     installed from THIS file onto an already-exported seam (window.addXp,
//     window.killMonster, HearthriseRenown.celebrate, …) — the same pattern
//     collection-log.js uses. Nothing is edited inside the systems that own
//     those moments, so this module composes with whoever else is wrapping.
//   • RECONCILE, a derivation from save state, for everything a hook could
//     not have seen: progress made before this build existed, progress made
//     offline, and any moment whose source is server-authoritative and only
//     mirrors into the client later. reconcile() is idempotent — every entry
//     carries a stable `id` and record() refuses duplicates — so the hook and
//     the sweep can both fire for the same moment and only one row appears.
//
// HONEST TIMESTAMPS — the rule this file will not break.
// The FIRST reconcile on a save (the migration seed) has no idea when any of
// it happened. Those entries are stored `dated: 0` and rendered under
// "Before the Chronicle", never with a manufactured date. Every reconcile
// AFTER the seed observed the transition itself — it saw the lower value on
// the previous sweep — so those are `dated: 1` at the time of observation,
// which is true.
//
// SAVE FOOTPRINT. Capped at MAX_MILESTONES entries (~105 bytes each, so ~52KB
// at the absolute ceiling). The realistic ceiling is far lower: 13 skills × 5
// marks + 11 ranks + 2 bosses + ~24 pets + 5 property tiers + 4 castle tiers +
// 1 name + one Hunt per week ≈ 150 after a year. The cap is a safety net, not
// the expected size. Compaction drops the OLDEST droppable entry first and may
// never drop a rank-up or a 99 — those are the two things a player would
// actually mourn, and there are at most 24 of them, so the rule can never
// deadlock the cap.
//
// Public API (window.HearthriseChronicle):
//   record(kind, text, opts)  → { added, entry } — idempotent on opts.id
//   recordToast(text, type)   → the toasts.js choke-point feed
//   reconcile(opts)           → derive + record whatever state proves
//   open() / close() / isOpen()
//   unseen() / markSeen()     → badge count, cleared on open
//   entries() / recent()      → reads
//   ensureState() / MILESTONE_KINDS / _compact / _relTime / _derive
//
// Classic script (no build step), loaded after the systems it wraps.
// ============================================================
(function () {
  'use strict';

  // ── Tuning ────────────────────────────────────────────────
  var MAX_MILESTONES = 500;   // persisted cap (see SAVE FOOTPRINT above)
  var MAX_RECENT     = 100;   // in-memory toast ring
  var LEVEL_MARKS    = [25, 50, 75, 92, 99];  // 92 = halfway to 99 in xp, the classic mark
  var SWEEP_MS       = 15000; // reconcile cadence — milestones are rare, polling is cheap
  var BADGE_MS       = 4000;  // badge refresh cadence

  // The milestone catalogue. `glyph` is an HR.icon key (never an emoji —
  // Final Directive). `keep` marks a kind compaction may never drop.
  var KINDS = {
    rank:     { label: 'Renown',     glyph: 'crown',  keep: true },
    skill:    { label: 'Skills',     glyph: 'xp' },
    boss:     { label: 'First kill', glyph: 'skull' },
    pet:      { label: 'Companions', glyph: 'paw' },
    property: { label: 'Homestead',  glyph: 'home' },
    castle:   { label: 'Clan seat',  glyph: 'castle' },
    hunt:     { label: 'The Hunt',   glyph: 'trophy' },
    name:     { label: 'Name',       glyph: 'banner' }
  };

  // ── State ─────────────────────────────────────────────────
  var recentRing = [];        // [{ text, type, ts, count }] — oldest first
  var sweeping   = false;     // reconcile re-entrancy guard

  function G_() { return window.G; }

  function ensureState(G) {
    G = G || G_(); if (!G) return null;
    var c = G.chronicle;
    if (!c || typeof c !== 'object' || Array.isArray(c)) c = G.chronicle = {};
    if (c.v !== 1) c.v = 1;
    if (!Array.isArray(c.entries)) c.entries = [];
    if (typeof c.seenAt !== 'number' || !isFinite(c.seenAt)) c.seenAt = 0;
    if (typeof c.seeded !== 'number' || !isFinite(c.seeded)) c.seeded = 0;
    return c;
  }

  function persist() {
    try { if (typeof window.saveLocal === 'function') window.saveLocal(); } catch (e) {}
  }

  // ── Compaction ────────────────────────────────────────────
  // Oldest-first, protected kinds exempt. Returns the (mutated) list.
  function compact(list, cap) {
    var max = cap || MAX_MILESTONES;
    if (!Array.isArray(list) || list.length <= max) return list;
    for (var i = 0; i < list.length && list.length > max; ) {
      if (list[i] && list[i].keep) { i++; continue; }
      list.splice(i, 1);            // don't advance — the next entry slid down
    }
    return list;
  }

  function protectedEntry(kind, opts) {
    if (KINDS[kind] && KINDS[kind].keep) return true;
    // A 99 is the other thing nobody may lose.
    return kind === 'skill' && opts && (opts.level | 0) === 99;
  }

  // ── record ────────────────────────────────────────────────
  // The seam every future system uses. One line at the moment that matters:
  //   HearthriseChronicle.record('boss', 'First kill — Ancient Lich', {id:'boss:lich'})
  // `opts.id` is the identity — record() is idempotent on it, which is what
  // lets a hook and reconcile() both fire without producing two rows.
  // `opts.dated === false` stores an undated ("before the Chronicle") entry.
  function record(kind, text, opts) {
    var G = G_(); var c = ensureState(G);
    if (!c) return { added: false, entry: null };
    // An unrecognised kind still records — a future system adding a milestone
    // must not be silenced by a table it forgot to register in. It renders
    // with the default glyph and simply isn't compaction-protected.
    kind = String(kind || 'skill');
    var msg = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    if (!msg) return { added: false, entry: null };
    opts = opts || {};
    var id = opts.id ? String(opts.id) : (kind + ':' + msg.toLowerCase());

    for (var i = 0; i < c.entries.length; i++) {
      if (c.entries[i] && c.entries[i].id === id) return { added: false, entry: c.entries[i] };
    }

    var dated = opts.dated === false ? 0 : 1;
    var entry = {
      id: id,
      kind: kind,
      text: msg,
      ts: dated ? (typeof opts.ts === 'number' ? opts.ts : Date.now()) : 0,
      dated: dated
    };
    if (protectedEntry(kind, opts)) entry.keep = 1;
    c.entries.push(entry);
    compact(c.entries, MAX_MILESTONES);
    if (opts.persist !== false) persist();
    if (opts.silent !== true) updateBadge();
    return { added: true, entry: entry };
  }

  // ── The Recent tier ───────────────────────────────────────
  // Called from ONE place: the push() choke-point in toasts.js. Deliberately
  // upstream of the queue's visibility decision, so a toast the queue DROPS
  // (burst overflow, or gone stale before a slot freed) is still recorded —
  // a dropped toast is precisely the one the player missed.
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

  // ── Derivation (reconcile's evidence) ─────────────────────
  // Everything below reads state and returns [{id, kind, text, level?}] in a
  // deliberate reading order — that order is what the seed writes, and the
  // seed is what "Before the Chronicle" shows.
  function skillName(id) {
    var D = window.SKILLS_DEF || {};
    return (D[id] && D[id].name) || (id.charAt(0).toUpperCase() + id.slice(1));
  }
  function levelOf(id) {
    if (typeof window.getLevel === 'function') { try { return window.getLevel(id) | 0; } catch (e) {} }
    var G = G_();
    if (G && G.skills && typeof window.levelFromXp === 'function') {
      /* b431 — the fallback xp read routes through the server-of-record accessor
         (DORMANT no-op today). getLevel above is the primary path (itself swept in
         b429); this only runs pre-boot before it attaches. */
      var SR = window.HearthriseSkillRecord;
      var xp = (SR && typeof SR.skillXpOr === 'function') ? SR.skillXpOr(G, id, 0) : (G.skills[id] || 0);
      try { return window.levelFromXp(xp) | 0; } catch (e) {}
    }
    return 1;
  }
  function skillEntry(id, lv) {
    return {
      id: 'skill:' + id + ':' + lv, kind: 'skill', level: lv,
      text: lv >= 99 ? ('Mastered ' + skillName(id) + ' — level 99')
                     : ('Reached ' + skillName(id) + ' ' + lv)
    };
  }

  function derive(G) {
    G = G || G_(); var out = [];
    if (!G) return out;

    // Name — the one identity moment. nameStatus() is
    // 'none' | 'provisional' | 'confirmed'; provisional counts, because the
    // player did name themselves — only the uniqueness is still pending.
    try {
      var I = window.HearthriseIdentity;
      var st = (I && typeof I.nameStatus === 'function') ? I.nameStatus() : 'none';
      var nm = (I && typeof I.displayName === 'function') ? I.displayName() : G.playerName;
      if (st !== 'none' && nm && nm !== 'Adventurer') {
        out.push({ id: 'name:' + String(nm).toLowerCase(), kind: 'name',
                   text: 'Claimed the name ' + nm });
      }
    } catch (e) {}

    // Renown ranks. Index 0 (Peasant) is where everyone starts — not a moment.
    try {
      var R = window.HearthriseRenown;
      if (R && R.RANKS && typeof R.rankIndexFor === 'function' && typeof R.effective === 'function') {
        var cur = R.rankIndexFor(R.effective(G));
        for (var r = 1; r <= cur && r < R.RANKS.length; r++) {
          out.push({ id: 'rank:' + R.RANKS[r].id, kind: 'rank', text: 'Rose to ' + R.RANKS[r].name });
        }
      }
    } catch (e) {}

    // Level marks, per skill, ascending.
    try {
      var skills = G.skills || {};
      Object.keys(skills).forEach(function (sk) {
        var lv = levelOf(sk);
        for (var i = 0; i < LEVEL_MARKS.length; i++) {
          if (lv >= LEVEL_MARKS[i]) out.push(skillEntry(sk, LEVEL_MARKS[i]));
        }
      });
    } catch (e) {}

    // Boss first kills. The bestiary decorator in legacy.js has always
    // stamped `firstKill`, so this is the one derived kind that can carry a
    // REAL date into the seed — a recorded timestamp, not an invented one.
    try {
      var MON = window.MONSTERS || {}, best = G.bestiary || {};
      Object.keys(MON).forEach(function (id) {
        if (!MON[id] || !MON[id].boss) return;
        if (!best[id] || !(best[id].kills > 0)) return;
        var fk = best[id].firstKill;
        out.push({
          id: 'boss:' + id, kind: 'boss',
          text: 'First kill — ' + (MON[id].name || id),
          ts: (typeof fk === 'number' && fk > 0) ? fk : null
        });
      });
    } catch (e) {}

    // Companions + pets. The starter (fox) is not an unlock.
    try {
      var C = window.COMPANIONS || {};
      var owned = (G.companions && G.companions.ownedIds) || [];
      for (var p = 0; p < owned.length; p++) {
        var cid = owned[p], def = C[cid];
        if (!def || def.source === 'starter') continue;
        out.push({ id: 'pet:' + cid, kind: 'pet', text: 'Bonded with ' + (def.n || cid) });
      }
    } catch (e) {}

    // Homestead tier. Tier 0 is the camp everyone spawns in.
    try {
      var H = window.HearthriseHomestead;
      if (H && typeof H.getTier === 'function' && H.TIERS) {
        var ht = H.getTier() | 0;
        for (var t = 1; t <= ht && t < H.TIERS.length; t++) {
          out.push({ id: 'property:' + t, kind: 'property',
                     text: 'Homestead raised to ' + (H.TIERS[t].name || ('tier ' + t)) });
        }
      }
    } catch (e) {}

    // Clan-seat castle tier — server-authoritative, so only when a seat has
    // actually loaded. Tier 1 (Wayside Camp) is the default, not a raise.
    try {
      var S = window.HearthriseClanSeatUI, CS = window.HearthriseClanSeat;
      if (S && typeof S.seat === 'function' && S.seat() && typeof S.castleTier === 'function') {
        var ct = S.castleTier() | 0;
        for (var k = 2; k <= ct; k++) {
          var nm = (CS && typeof CS.tierName === 'function') ? CS.tierName(k) : ('tier ' + k);
          out.push({ id: 'castle:' + k, kind: 'castle', text: 'Clan seat raised to ' + nm });
        }
      }
    } catch (e) {}

    return out;
  }

  // reconcile — record everything derivation proves that isn't recorded yet.
  // The FIRST run on a save is the seed: undated, because nothing here knows
  // when any of it happened. Every run after that observed the change.
  function reconcile(opts) {
    if (sweeping) return { added: 0, seeded: false };
    var G = G_(); var c = ensureState(G);
    if (!c) return { added: 0, seeded: false };
    opts = opts || {};
    sweeping = true;
    var isSeed = opts.forceSeed === true || !c.seeded;
    var added = 0;
    try {
      var list = derive(G);
      for (var i = 0; i < list.length; i++) {
        var d = list[i];
        // A derived entry carrying its OWN recorded timestamp (boss first
        // kills, via the bestiary's `firstKill`) is dated even in the seed —
        // that date was written down at the time, not reconstructed now.
        var hasTs = typeof d.ts === 'number' && d.ts > 0;
        var res = record(d.kind, d.text, {
          id: d.id, level: d.level,
          dated: hasTs ? true : (isSeed ? false : true),
          ts: hasTs ? d.ts : undefined,
          persist: false, silent: true
        });
        if (res.added) added++;
      }
      if (isSeed) {
        c.seeded = Date.now();
        // A seed is history, not news — the badge must not open on 40.
        c.seenAt = Date.now();
      }
    } catch (e) {
      try { if (typeof window.captureException === 'function') window.captureException(e, { source: 'chronicle-reconcile' }); } catch (_) {}
    }
    sweeping = false;
    if (added || isSeed) { persist(); updateBadge(); }
    return { added: added, seeded: isSeed };
  }

  // ── Badge ─────────────────────────────────────────────────
  // Milestones only. A badge fed by every toast would sit at 9+ forever and
  // teach the player to ignore it; a badge that only lights for a rank-up or
  // a 99 is worth a click. Undated seed entries never count.
  function unseen(G) {
    var c = ensureState(G); if (!c) return 0;
    var n = 0;
    for (var i = 0; i < c.entries.length; i++) {
      var e = c.entries[i];
      if (e && e.dated && e.ts > c.seenAt) n++;
    }
    return n;
  }
  function markSeen() {
    var c = ensureState(); if (!c) return;
    c.seenAt = Date.now();
    persist();
    updateBadge();
  }
  function updateBadge() {
    var dot = document.getElementById('nb-dot');
    if (!dot) return;
    var n = 0;
    try { n = unseen(); } catch (e) { n = 0; }
    if (n > 0) {
      dot.textContent = n > 99 ? '99+' : String(n);
      dot.classList.remove('hide');
      var bell = document.getElementById('btn-notif');
      if (bell) bell.setAttribute('title', 'Chronicle — ' + n + ' new milestone' + (n === 1 ? '' : 's'));
    } else {
      dot.textContent = '0';
      dot.classList.add('hide');
      var b2 = document.getElementById('btn-notif');
      if (b2) b2.setAttribute('title', 'Chronicle');
    }
  }

  // ── Time ──────────────────────────────────────────────────
  function relTime(ts, now) {
    if (!ts) return 'before the Chronicle';
    var d = Math.max(0, (now || Date.now()) - ts);
    var mins = Math.floor(d / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + (mins === 1 ? ' minute ago' : ' minutes ago');
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + (hrs === 1 ? ' hour ago' : ' hours ago');
    var days = Math.floor(hrs / 24);
    if (days < 7) return days + (days === 1 ? ' day ago' : ' days ago');
    if (days < 60) {
      var wks = Math.floor(days / 7);
      return wks + (wks === 1 ? ' week ago' : ' weeks ago');
    }
    try { return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
    catch (e) { return days + ' days ago'; }
  }
  function clockTime(ts) {
    try { return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }
    catch (e) { return ''; }
  }

  // ── Style ─────────────────────────────────────────────────
  // Forge & Stone: containment is earned, so rows sit on the ground under a
  // small-caps label over a fading rule — no card boxes. Every colour is a
  // token. Nothing below the 14.5px reading floor. One block, scoped to
  // .hr-ch-*, plus the #nb-dot override (the legacy badge rule bakes three
  // raw hex values and paints an unread count in a danger hue).
  function ensureStyle() {
    if (document.getElementById('hr-ch-css')) return;
    var s = document.createElement('style');
    s.id = 'hr-ch-css';
    s.textContent = [
      '.hr-ch-scrim{position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.72);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:18px}',
      '.hr-ch-wrap{position:relative;background:var(--bg-1,#1f1a14);border:1px solid var(--line-strong,#b8893e);border-radius:var(--r-lg,5px);width:100%;max-width:560px;max-height:86vh;overflow-y:auto;color:var(--ink,#f4e4bc);box-shadow:0 18px 50px -12px rgba(0,0,0,.72);font-family:var(--f-ui,system-ui,sans-serif);font-size:16px}',
      '.hr-ch-top{position:sticky;top:0;z-index:2;padding:16px 46px 13px 18px;background:var(--bg-1,#1f1a14);border-bottom:1px solid var(--line,rgba(184,137,62,.3))}',
      '.hr-ch-eyebrow{font-family:var(--f-label,var(--f-ui,sans-serif));font-size:14.5px;letter-spacing:.1em;color:var(--ink-3,#8a7656)}',
      '.hr-ch-hn{font-family:var(--f-display,serif);font-size:21.5px;font-weight:600;color:var(--gold,#c9a24a);line-height:1.2;margin-top:2px}',
      '.hr-ch-sub{font-size:14.5px;color:var(--ink-2,#c8b088);margin-top:3px}',
      '.hr-ch-x{position:absolute;top:13px;right:14px;background:transparent;border:1px solid var(--line,rgba(184,137,62,.3));color:var(--ink-2,#c8b088);width:28px;height:28px;border-radius:var(--r-sm,2px);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;line-height:0}',
      '.hr-ch-x:hover{border-color:var(--gold,#c9a24a);color:var(--gold,#c9a24a)}',
      '.hr-ch-sec{font-family:var(--f-label,var(--f-ui,sans-serif));font-size:15.5px;letter-spacing:.06em;color:var(--gold,#c9a24a);padding:16px 18px 5px}',
      '.hr-ch-rule{height:1px;margin:0 18px 6px;background:var(--rule-fade,linear-gradient(90deg,var(--line-strong,#b8893e),transparent))}',
      '.hr-ch-note{font-size:14.5px;color:var(--ink-3,#8a7656);padding:2px 18px 8px;line-height:1.45}',
      '.hr-ch-row{display:flex;align-items:baseline;gap:10px;padding:8px 18px;border-bottom:1px solid var(--line-soft,rgba(184,137,62,.12))}',
      '.hr-ch-row:last-child{border-bottom:0}',
      '.hr-ch-ic{flex:0 0 auto;align-self:center;color:var(--gold,#c9a24a);display:flex}',
      '.hr-ch-txt{flex:1 1 auto;font-size:16px;color:var(--ink,#f4e4bc);line-height:1.35;min-width:0;overflow-wrap:anywhere}',
      '.hr-ch-when{flex:0 0 auto;font-size:14.5px;color:var(--ink-3,#8a7656);font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.hr-ch-row.old .hr-ch-txt{color:var(--ink-2,#c8b088)}',
      '.hr-ch-row.rec .hr-ch-txt{font-size:15px;color:var(--ink-2,#c8b088)}',
      '.hr-ch-xn{font-size:14.5px;color:var(--gold,#c9a24a);font-variant-numeric:tabular-nums;margin-left:6px}',
      '.hr-ch-empty{font-size:15px;color:var(--ink-3,#8a7656);padding:4px 18px 12px;line-height:1.5}',
      '.hr-ch-foot{padding:12px 18px 16px;border-top:1px solid var(--line,rgba(184,137,62,.3));margin-top:10px}',
      '.hr-ch-foot .hr-ch-note{padding-left:0;padding-right:0}',
      '.hr-ch-link{background:transparent;border:1px solid var(--line-strong,#b8893e);color:var(--gold,#c9a24a);border-radius:var(--r-sm,2px);padding:7px 13px;font-size:15px;font-family:inherit;cursor:pointer}',
      '.hr-ch-link:hover{background:var(--gold-bg,rgba(184,137,62,.18))}',
      // The badge. Gilt, not oxblood: --red is destructive-and-lethal only, and
      // "you have something new" is the interactive/attention role.
      '#nb-dot{background:var(--gold,#c9a24a);color:var(--bg-0,#12100c);border:1px solid var(--bg-0,#12100c);font-size:14.5px;min-width:17px;height:17px;top:-3px;right:-3px;box-shadow:0 1px 3px rgba(0,0,0,.55);font-variant-numeric:tabular-nums}'
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
  // meaning, so it is what picks the glyph. One shared icon for a hundred
  // rows would be both monotonous and wrong ("Defeated Ancient Lich" wearing
  // the idle moon).
  var TOAST_GLYPH = {
    loot: 'chest', kill: 'sword', levelup: 'xp',
    gold: 'coin', warn: 'warn', info: 'info'
  };
  function toastGlyph(type) { return TOAST_GLYPH[type] || 'info'; }

  function row(cls, iconKey, text, when, count) {
    var el = document.createElement('div');
    el.className = 'hr-ch-row' + (cls ? ' ' + cls : '');
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

  function sectionLabel(parent, text) {
    var h = document.createElement('div');
    h.className = 'hr-ch-sec'; h.textContent = text;
    parent.appendChild(h);
    var r = document.createElement('div');
    r.className = 'hr-ch-rule';
    parent.appendChild(r);
  }
  function note(parent, text, cls) {
    var n = document.createElement('div');
    n.className = cls || 'hr-ch-note'; n.textContent = text;
    parent.appendChild(n);
    return n;
  }

  function renderBody(host) {
    var c = ensureState(); if (!c) return;
    var now = Date.now();

    var all = c.entries.slice();
    var dated = all.filter(function (e) { return e && e.dated; })
                   .sort(function (a, b) { return b.ts - a.ts; });
    var undated = all.filter(function (e) { return e && !e.dated; });

    sectionLabel(host, 'Milestones');
    if (!dated.length && !undated.length) {
      note(host, 'Nothing recorded yet. Rank-ups, mastered skills, first kills, new companions and every raise of your homestead are written here the moment they happen.', 'hr-ch-empty');
    } else {
      dated.forEach(function (e) {
        host.appendChild(row('', (KINDS[e.kind] || {}).glyph || 'star', e.text, relTime(e.ts, now)));
      });
      if (undated.length) {
        sectionLabel(host, 'Before the Chronicle');
        note(host, 'Earned before this record existed, so the date is genuinely unknown — nothing here is guessed.');
        undated.forEach(function (e) {
          host.appendChild(row('old', (KINDS[e.kind] || {}).glyph || 'star', e.text, 'undated'));
        });
      }
    }

    sectionLabel(host, 'This session');
    if (!recentRing.length) {
      note(host, 'No notifications yet this session.', 'hr-ch-empty');
    } else {
      var rec = recentRing.slice().reverse();
      for (var i = 0; i < rec.length; i++) {
        host.appendChild(row('rec', toastGlyph(rec[i].type), rec[i].text, clockTime(rec[i].ts), rec[i].count));
      }
      note(host, 'Kept for this session only. Anything worth keeping is written above.');
    }

    var foot = document.createElement('div');
    foot.className = 'hr-ch-foot';
    note(foot, 'The Chronicle records events. Items and monsters you have discovered are kept in the Collection Log.');
    var btn = document.createElement('button');
    btn.className = 'hr-ch-link'; btn.type = 'button';
    btn.textContent = 'Open the Collection Log';
    btn.addEventListener('click', function () {
      close();
      try { if (window.HearthriseCollection && window.HearthriseCollection.open) window.HearthriseCollection.open(); } catch (e) {}
    });
    foot.appendChild(btn);
    host.appendChild(foot);
  }

  var escHandler = null;

  function close() {
    var m = document.getElementById('hr-ch-modal');
    if (m) m.remove();
    if (escHandler) { document.removeEventListener('keydown', escHandler, true); escHandler = null; }
  }
  function isOpen() { return !!document.getElementById('hr-ch-modal'); }

  function open() {
    close();
    ensureStyle();
    // A sweep on open means a milestone earned offline (or mirrored down from
    // the server since the last poll) is in the list the player is about to read.
    try { reconcile(); } catch (e) {}

    var c = ensureState();
    var total = c ? c.entries.length : 0;

    var scrim = document.createElement('div');
    scrim.className = 'hr-ch-scrim';
    scrim.id = 'hr-ch-modal';

    var wrap = document.createElement('div');
    wrap.className = 'hr-ch-wrap';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-label', 'Chronicle');
    wrap.tabIndex = -1;

    var top = document.createElement('div');
    top.className = 'hr-ch-top';
    var eb = document.createElement('div'); eb.className = 'hr-ch-eyebrow'; eb.textContent = 'Chronicle';
    var hn = document.createElement('div'); hn.className = 'hr-ch-hn'; hn.textContent = 'What you have done';
    var sb = document.createElement('div'); sb.className = 'hr-ch-sub';
    sb.textContent = total === 0
      ? 'No milestones recorded yet'
      : (total + ' milestone' + (total === 1 ? '' : 's') + ' recorded');
    top.appendChild(eb); top.appendChild(hn); top.appendChild(sb);

    var x = document.createElement('button');
    x.className = 'hr-ch-x'; x.type = 'button';
    x.setAttribute('aria-label', 'Close');
    x.innerHTML = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">' +
      '<path stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M4 4l8 8M12 4l-8 8"/></svg>';
    x.addEventListener('click', close);

    wrap.appendChild(top);
    wrap.appendChild(x);
    renderBody(wrap);
    scrim.appendChild(wrap);
    scrim.addEventListener('click', function (e) { if (e.target === scrim) close(); });
    document.body.appendChild(scrim);

    // Audit finding #10: the newer scrim family binds Escape to itself and
    // never takes focus, so its handler can never fire. Bind at the document
    // (capture) and move focus into the dialog.
    escHandler = function (ev) {
      if (ev.key === 'Escape' || ev.keyCode === 27) { ev.stopPropagation(); close(); }
    };
    document.addEventListener('keydown', escHandler, true);
    try { wrap.focus(); } catch (e) {}

    markSeen();
    return scrim;
  }

  // ── Hooks at the source ───────────────────────────────────
  // Every one is a wrapper on an already-exported seam. Nothing is edited
  // inside the system that owns the moment, so this composes with the other
  // wrappers already on these functions (collection-log, pets, legacy's own
  // level-up celebration).
  function marksCrossed(before, after) {
    var out = [];
    for (var i = 0; i < LEVEL_MARKS.length; i++) {
      if (before < LEVEL_MARKS[i] && after >= LEVEL_MARKS[i]) out.push(LEVEL_MARKS[i]);
    }
    return out;
  }

  function hookAddXp() {
    if (typeof window.addXp !== 'function' || window.addXp.__hrChron) return false;
    var orig = window.addXp;
    var wrapped = function (sk) {
      var before = levelOf(sk);
      var r = orig.apply(this, arguments);
      try {
        var after = levelOf(sk);
        if (after > before) {
          marksCrossed(before, after).forEach(function (lv) {
            var e = skillEntry(sk, lv);
            record('skill', e.text, { id: e.id, level: lv });
          });
        }
      } catch (e) { /* never break xp */ }
      return r;
    };
    wrapped.__hrChron = 1;
    window.addXp = wrapped;
    return true;
  }

  function hookKill() {
    if (typeof window.killMonster !== 'function' || window.killMonster.__hrChron) return false;
    var orig = window.killMonster;
    var wrapped = function (m) {
      var G = window.G;
      var mid = G && G.activeMonster;
      var wasNew = false;
      try {
        wasNew = !!(mid && window.MONSTERS && window.MONSTERS[mid] && window.MONSTERS[mid].boss &&
                    (!G.bestiary || !G.bestiary[mid] || !(G.bestiary[mid].kills > 0)));
      } catch (e) {}
      var r = orig.apply(this, arguments);
      try {
        if (wasNew && G.bestiary && G.bestiary[mid] && G.bestiary[mid].kills > 0) {
          record('boss', 'First kill — ' + (window.MONSTERS[mid].name || mid), { id: 'boss:' + mid });
        }
      } catch (e) { /* never break combat */ }
      return r;
    };
    wrapped.__hrChron = 1;
    window.killMonster = wrapped;
    return true;
  }

  /* b499 — THE EVENT, NOT A WRAPPER AROUND THE CALL.
     This used to wrap window.unlockCompanion and record "Bonded with X" for
     every CALL, which was wrong twice over: a call for an already-owned pet
     recorded a duplicate line (harmless only because record() dedupes by id),
     and — the reason it had to change — under the blob-retire capstone arm
     src/features/companions.js now waits for the server's hr_companion_grant
     verdict before the companion joins. A call-wrapper would have written a
     permanent "Bonded with X" for a companion the server REFUSED and the next
     envelope never delivers.

     `companionUnlock` is emitted by applyUnlockLocally exactly once per real
     acquisition, on BOTH the dormant and the armed paths, which is precisely the
     honest moment this milestone wants. It also removes one wrap site.

     Fails to install (and is retried) only while the ESM event bus is still
     booting; anything it misses is covered by reconcile(), which derives the
     same rows from G.companions.ownedIds. */
  function hookCompanion() {
    var E = window.HearthriseEvents;
    if (!E || typeof E.on !== 'function' || hookCompanion.__hrChron) return false;
    hookCompanion.__hrChron = 1;
    E.on('companionUnlock', function (p) {
      try {
        var id = p && p.id;
        var def = (window.COMPANIONS || {})[id];
        if (def && def.source !== 'starter') {
          record('pet', 'Bonded with ' + (def.n || id), { id: 'pet:' + id });
        }
      } catch (e) {}
    });
    return true;
  }

  function hookRenown() {
    var R = window.HearthriseRenown;
    if (!R || typeof R.celebrate !== 'function' || R.celebrate.__hrChron) return false;
    var orig = R.celebrate;
    var wrapped = function (rank) {
      try { if (rank && rank.id) record('rank', 'Rose to ' + rank.name, { id: 'rank:' + rank.id }); } catch (e) {}
      return orig.apply(this, arguments);
    };
    wrapped.__hrChron = 1;
    R.celebrate = wrapped;
    return true;
  }

  function hookHomestead() {
    var H = window.HearthriseHomestead;
    if (!H || typeof H.upgradeProperty !== 'function' || H.upgradeProperty.__hrChron) return false;
    var orig = H.upgradeProperty;
    var wrapped = function () {
      var before = 0; try { before = H.getTier() | 0; } catch (e) {}
      var r = orig.apply(this, arguments);
      try {
        var after = H.getTier() | 0;
        if (after > before && H.TIERS && H.TIERS[after]) {
          record('property', 'Homestead raised to ' + H.TIERS[after].name, { id: 'property:' + after });
        }
      } catch (e) {}
      return r;
    };
    wrapped.__hrChron = 1;
    H.upgradeProperty = wrapped;
    return true;
  }

  function hookIdentity() {
    var I = window.HearthriseIdentity;
    if (!I || typeof I.claimName !== 'function' || I.claimName.__hrChron) return false;
    var orig = I.claimName;
    var wrapped = function (raw) {
      var r = orig.apply(this, arguments);
      // claimName resolves to {action: 'confirmed'|'provisional'|'invalid'|
      // 'fail'|'taken'|…}. Only the two that actually adopted a name count.
      var note_ = function (d) {
        try {
          var act = d && d.action;
          var nm = (d && d.name) || raw;
          if ((act === 'confirmed' || act === 'provisional') && nm) {
            record('name', 'Claimed the name ' + nm, { id: 'name:' + String(nm).toLowerCase() });
          }
        } catch (e) {}
        return d;
      };
      return (r && typeof r.then === 'function') ? r.then(note_) : note_(r);
    };
    wrapped.__hrChron = 1;
    I.claimName = wrapped;
    return true;
  }

  function hookHunt() {
    var R = window.HearthriseRaids;
    if (!R || R.__hrChronHunt) return false;
    var done = false;
    ['claim', 'claimGrace'].forEach(function (key) {
      if (typeof R[key] !== 'function' || R[key].__hrChron) return;
      var orig = R[key];
      var wrapped = function () {
        var r = orig.apply(this, arguments);
        var note_ = function (ok) {
          try {
            if (ok === true) {
              var wk = (typeof R.weekKey === 'function') ? R.weekKey() : String(Date.now());
              // The Hunt's own tier lives on the server's raid row, which the
              // claim consumed and did not hand back. A solo player is always
              // the Lone Hunt (§3.5 — solo has no tiers); a clan player's
              // Hunt is bounded by the ceiling their castle + War Room set,
              // which is the best name available on this side of the wire.
              var nm = 'the Lone Hunt';
              try {
                if (window.G && window.G.clanId) {
                  var tier = R.tierCeiling ? R.tierCeiling() : null;
                  nm = (tier && R.tierName) ? ('the ' + R.tierName(tier)) : 'the Hunt';
                }
              } catch (e) { nm = 'the Hunt'; }
              record('hunt', 'Cleared ' + nm, { id: 'hunt:' + wk + (key === 'claimGrace' ? ':grace' : '') });
            }
          } catch (e) {}
          return ok;
        };
        return (r && typeof r.then === 'function') ? r.then(note_) : note_(r);
      };
      wrapped.__hrChron = 1;
      R[key] = wrapped;
      done = true;
    });
    if (done) R.__hrChronHunt = 1;
    return done;
  }

  function hookCastle() {
    var S = window.HearthriseClanSeatUI;
    if (!S || typeof S.tierUp !== 'function' || S.tierUp.__hrChron) return false;
    var orig = S.tierUp;
    var wrapped = function () {
      var r = orig.apply(this, arguments);
      var note_ = function (v) {
        // The seat row is re-read asynchronously after a tier-up; let the
        // sweep pick up the new tier rather than guessing at it here.
        setTimeout(function () { try { reconcile(); } catch (e) {} }, 1500);
        return v;
      };
      return (r && typeof r.then === 'function') ? r.then(note_) : note_(r);
    };
    wrapped.__hrChron = 1;
    S.tierUp = wrapped;
    return true;
  }

  // Which wrappers we managed to install. This registry is the truth, NOT the
  // `__hrChron` marker on the live global: src/features/companions.js is an ES
  // module and therefore runs after every classic script, so it re-wraps
  // window.killMonster AFTER us. Our wrapper is still in the chain and still
  // fires — but the marker is on a function that is no longer the outermost
  // one, so reading the global would report a hook we definitely installed as
  // missing. (This is also why every hook composes instead of replacing.)
  var installed = {
    addXp: false, killMonster: false, unlockCompanion: false, renown: false,
    homestead: false, identity: false, hunt: false, castle: false
  };
  var HOOKS = [
    ['addXp', hookAddXp], ['killMonster', hookKill], ['unlockCompanion', hookCompanion],
    ['renown', hookRenown], ['homestead', hookHomestead], ['identity', hookIdentity],
    ['hunt', hookHunt], ['castle', hookCastle]
  ];
  var attachTries = 0;
  function attachHooks() {
    var pending = 0;
    for (var i = 0; i < HOOKS.length; i++) {
      if (installed[HOOKS[i][0]]) continue;
      if (HOOKS[i][1]()) installed[HOOKS[i][0]] = true; else pending++;
    }
    attachTries++;
    // Modules boot on their own timers; retry for ~30s then stop. Anything
    // still unhooked is covered by reconcile(), which needs no hook at all.
    if (pending && attachTries < 60) setTimeout(attachHooks, 500);
  }

  // ── Boot ──────────────────────────────────────────────────
  function wireBell() {
    var bell = document.getElementById('btn-notif');
    if (!bell || bell.__hrChron) return;
    bell.__hrChron = 1;
    bell.setAttribute('title', 'Chronicle');
    bell.setAttribute('aria-haspopup', 'dialog');
    bell.addEventListener('click', function (e) {
      e.preventDefault();
      if (isOpen()) close(); else open();
    });
  }

  function boot() {
    if (!window.G) { setTimeout(boot, 400); return; }
    ensureStyle();
    wireBell();
    ensureState(window.G);
    attachHooks();
    reconcile();                       // first run = the seed
    updateBadge();
    setInterval(function () { try { reconcile(); } catch (e) {} }, SWEEP_MS);
    setInterval(function () { try { updateBadge(); } catch (e) {} }, BADGE_MS);
  }

  function start() {
    if (window.HearthriseGate && typeof window.HearthriseGate.whenOpen === 'function') {
      window.HearthriseGate.whenOpen(boot);
    } else boot();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  window.HearthriseChronicle = {
    MILESTONE_KINDS: KINDS,
    LEVEL_MARKS: LEVEL_MARKS,
    MAX_MILESTONES: MAX_MILESTONES,
    MAX_RECENT: MAX_RECENT,
    ensureState: ensureState,
    record: record,
    recordToast: recordToast,
    reconcile: reconcile,
    entries: function () { var c = ensureState(); return c ? c.entries.slice() : []; },
    recent: function () { return recentRing.slice(); },
    clearRecent: function () { recentRing.length = 0; },
    unseen: unseen,
    markSeen: markSeen,
    updateBadge: updateBadge,
    open: open,
    close: close,
    isOpen: isOpen,
    // Pure seams for the suite.
    _compact: compact,
    _relTime: relTime,
    _hooks: function () { var o = {}; for (var k in installed) o[k] = installed[k]; return o; },
    _derive: derive,
    _marksCrossed: marksCrossed
  };

  console.log('[chronicle] ready (' + Object.keys(KINDS).length + ' milestone kinds, cap ' + MAX_MILESTONES + ')');
})();
