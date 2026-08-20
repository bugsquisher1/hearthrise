// ============================================================
// src/features/muster.js  (b220, backlog #15 + #14)
//
// THE MUSTER — the live, joinable half of a world event.
//
// A world event now has two layers, and this file is the second one:
//
//   1. THE BLESSING (src/features/world-events.js, untouched) — the passive
//      all-day getBonus modifier every player gets for free, with no login
//      required. It is the fairness valve: missing a muster costs you a chest,
//      never your day.
//   2. THE MUSTER (this file) — twice per UTC day, at 01:00 and 13:00, a
//      45-minute window opens. Join ONE per UTC day; ordinary play then feeds
//      a shared community bar, and a chest is claimed once when it closes.
//
// WHY TWO SLOTS, TWELVE HOURS APART
// Two slots exactly 12h apart means their LOCAL times are always 12h apart, so
// every inhabited UTC offset gets at least one slot between 09:00 and 23:00
// local. One slot is unfair; three is noise. Two is the minimum that is
// globally fair — which is exactly why joining is limited to one per day: the
// limit is not a restriction, it is a decision ("the morning muster is combat,
// the evening one is mining — I'm training mining today, so I'll wait").
//
// ── WHERE THE RULES LIVE ────────────────────────────────────
// The SERVER owns the three things a client cannot be trusted with:
//   • what time it is        (every RPC re-derives the live slot from now())
//   • once per UTC day       (primary key (day_key, user_id) IS the rule)
//   • what the chest is worth (the band is computed server-side from the
//                              median of real contributors)
// Everything here is a MIRROR for UX. See supabase/migrations/2026-08-08-muster.sql.
//
// ── CLIENT-FIRST COMPATIBILITY ──────────────────────────────
// This file ships BEFORE the migration is applied and must work anyway. Every
// RPC is FEATURE-DETECTED (404 / PGRST202 → 'unsupported') with a negative
// probe that expires after ten minutes, so a session left open across the
// migration heals itself without a reload. With no server the muster degrades
// to a SOLO muster: the player still joins, still plays, still takes the
// "Answered the call" band — but there is no shared community bar and no
// Muster Seal, because neither of those can be honest without a server.
//
// ── THE CLOCK ───────────────────────────────────────────────
// HearthriseWorldEvents is the shared clock utility every timed system reads
// (raids.js depends on _hash / utcDayKey / utcWeekKey). It is NEVER renamed or
// restructured — this module is added ALONGSIDE it and consumes it.
// ============================================================
(function () {
  'use strict';

  // ── Tuning (Game Designer owns these numbers — world-event-cadence.md §10) ──
  var SLOT_UTC_HOURS  = [1, 13];
  var WINDOW_MIN      = 45;
  var GOAL_PER_PLAYER = 2000;
  var MIN_GOAL        = 6000;
  var CALL_CLAMP      = 400;      // per contribution flush (mirrors the server)
  var TOTAL_CAP       = 6000;     // per muster    (mirrors the server)
  var FLUSH_MS        = 30000;
  var IMMINENT_MS     = 15 * 60000;
  /* b228 (bonus-rebase.md §3.2): +10% → +2% all XP while mustered. The aura is
     TEMPORARY power on the game's widest key, and at +10% it was two thirds of
     the entire rebased permanent allXP ceiling for turning up to a 45-minute
     window. +2% is the wide-key step, and the muster's real reward has always
     been its band payout, not its aura. */
  var LIVE_XP_AURA    = 0.02;     // +2% all XP while mustered
  var SOLO_BAND       = { gold: 1500, gems: 2, seals: 0, band: 'answered' };

  // ── Pre-selection: "I'll answer this one" (b228) ────────────
  // A player may mark ONE of the day's two rallies as the one they intend to
  // answer, and change it right up until that rally's window opens. If the
  // window then passes without them — offline, or simply never joining — they
  // take HALF HONORS: 50% of the base participation band, and nothing else.
  //
  // WHY HALF, AND WHY ONLY THE BASE BAND
  // Presence has to keep winning or the feature quietly becomes "log in every
  // other day". Half of the base band is 750g + 1 gem against a live chest that
  // starts at 1,500g + 2 gems and reaches the 7,500g / 10 gems / 1 Seal ceiling
  // when the realm holds — so answering in absence is worth 50% of the FLOOR
  // and 10% of the CEILING. It never pays a Rally Seal and never draws on the
  // community bar, because neither can be honest without someone actually
  // being there. It is a consolation, not an alternative.
  var ABSENT_SHARE = 0.5;
  var ABSENT_BAND  = { gold:  Math.round(SOLO_BAND.gold * ABSENT_SHARE),
                       gems:  Math.floor(SOLO_BAND.gems * ABSENT_SHARE),
                       seals: 0, band: 'absent' };

  // ── The muster pool (original content · Forge & Stone · no emoji) ──
  // Each muster carries its own ambient Blessing theme, so the two layers of a
  // world event always describe the same day rather than two unrelated things
  // that happen to share a name.
  var EVENTS = [
    { id: 'ashen_horde',   name: 'The Ashen Horde',          glyph: 'uiFire',
      what: 'combat',                       sources: { kill_any: 1 },
      desc: 'Cinder-wolves pour off the burnt ridge. The watch-fires are already lit.' },
    { id: 'long_harvest',  name: 'The Long Harvest',         glyph: 'uiWheat',
      what: 'farming and gathering',        sources: { harvest: 1, gather: 1 },
      desc: 'Storm on the horizon. Every field must be cleared before dusk.' },
    { id: 'forge_levy',    name: 'The Forge Levy',           glyph: 'uiAnvil',
      what: 'smithing and crafting',        sources: { smithed: 1, crafted: 1 },
      desc: 'The realm has called for arms by nightfall. Every anvil in the valley answers.' },
    { id: 'deep_seam',     name: 'The Deep Seam',            glyph: 'uiPickaxe',
      what: 'mining, woodcutting, fishing', sources: { gather: 1 },
      desc: 'A new vein opened under Ironvale, and it will not stay open.' },
    { id: 'keep_kitchens', name: 'The Kitchens of the Keep', glyph: 'uiPot',
      what: 'cooking',                      sources: { cooked: 1 },
      desc: 'Feed the rally or it marches hungry.' },
    { id: 'all_hands',     name: 'The Rally of All Hands',  glyph: 'uiBanner',
      what: 'every activity, at half rate',
      sources: { kill_any: 0.5, gather: 0.5, harvest: 0.5, cooked: 0.5, smithed: 0.5, crafted: 0.5 },
      desc: 'Every hand in the realm, whatever it holds.' }
  ];

  // Points per unit of ordinary play. These piggyback the counters the game
  // ALREADY fires (updateDaily) — no new call sites, nothing to keep in sync.
  var POINTS = { kill_any: null /* 10 x tier */, gather: 4, harvest: 6, cooked: 12, smithed: 12, crafted: 12 };

  // ════════════════════════════════════════════════════════════
  // 1b · THE THEMED CHEST  (b231 — Tyler: "Forge Levy pays smithing")
  // ════════════════════════════════════════════════════════════
  // A rally that asks you to smith all afternoon and then pays a pile of
  // undifferentiated gold has told you the event was a costume. Every rally's
  // chest now derives from the SAME domain its contribution sources do, so the
  // day describes one thing from the pill to the payout.
  //
  // ── THE RULE THAT KEEPS THIS FROM BEING A BUFF ──────────────
  // Theming CONVERTS value, it never adds any. The band the server computes
  // (1,500g floor … 7,500g ceiling) is a VALUE BUDGET; the table below decides
  // what that budget is paid IN. A fixed slice becomes domain materials priced
  // at their own vendor value, a fixed slice becomes domain XP at one stated
  // rate, and whatever is left stays gold. The sum can only ever round DOWN,
  // never up — chestValue() asserts exactly that, and the smoke suite runs it
  // across every event at both the floor and the ceiling.
  //
  //   gems  — untouched, still the same small constant per band.
  //   seals — untouched. A Rally Seal still means only "the realm held".
  //
  // ── THE TWO CONVERSION CONSTANTS (Designer owns both) ───────
  // XP_PER_GOLD is anchored on the game's own economy rather than invented:
  // smelting an Iron Bar turns 65g of ore and coal into a 90g bar and 30
  // smithing XP — about 1.2 XP per gold of value added — and gathering is
  // cheaper per gold than that. 2 XP per gold of converted budget sits just
  // above the artisan anchor, which is the right side to err on for a reward
  // that costs a player their whole day's rally.
  //
  // Every XP grant goes through window.addXp, so PACE, the fuse and the
  // blessing all apply exactly as they do to played XP. There is no raw
  // G.skills write anywhere in this file.
  var CHEST_ITEM_SHARE = 0.30;   // of the band's value, paid as domain materials
  var CHEST_XP_SHARE   = 0.20;   // of the band's value, paid as domain XP
  var XP_PER_GOLD      = 2;      // XP per gold of converted budget

  // `v` is the item's vendor value, stated INLINE. Both this table and the
  // server's copy carry the number, so neither can drift into paying a
  // different chest than the other; a smoke assertion checks each one against
  // window.ITEMS so an economy change cannot silently unbalance a rally.
  var THEMES = {
    ashen_horde:   { skills: ['attack', 'strength', 'defense'],
                     items: [{ id: 'wolf_pelt',    v: 35, w: 0.6 },
                             { id: 'dragon_bones', v: 10, w: 0.4 }] },
    long_harvest:  { skills: ['farming', 'woodcutting'],
                     items: [{ id: 'wheat',        v: 50, w: 0.5 },
                             { id: 'pumpkin_seed', v: 50, w: 0.5 }] },
    forge_levy:    { skills: ['smithing', 'crafting'],
                     items: [{ id: 'iron_bar',     v: 90, w: 0.6 },
                             { id: 'coal',         v: 40, w: 0.4 }] },
    deep_seam:     { skills: ['mining', 'woodcutting', 'fishing'],
                     items: [{ id: 'iron_ore',     v: 25, w: 0.4 },
                             { id: 'coal',         v: 40, w: 0.3 },
                             { id: 'oak_log',      v: 20, w: 0.3 }] },
    keep_kitchens: { skills: ['cooking', 'fishing'],
                     items: [{ id: 'trout',        v: 20, w: 0.5 },
                             { id: 'lobster',      v: 100, w: 0.5 }] },
    // Every hand in the realm — so the payout spreads the same way the
    // contribution sources do, thin across the four everyday domains.
    all_hands:     { skills: ['woodcutting', 'mining', 'smithing', 'cooking'],
                     items: [{ id: 'iron_bar',     v: 90, w: 0.5 },
                             { id: 'oak_log',      v: 20, w: 0.5 }] }
  };
  var CHEST_GOLD_CEIL = 7500, CHEST_GEM_CEIL = 10;

  function themeFor(eventId) { return THEMES[eventId] || null; }

  /**
   * PURE. Turn a band's gold budget into that rally's themed chest.
   * Never invents value: goldOut + materials + xp/XP_PER_GOLD <= gold, always.
   * An unknown event (a save from a future pool, a malformed key) falls back to
   * plain gold rather than paying nothing — degrade poorer, never emptier.
   */
  function themedChest(eventId, gold, gems, seals) {
    gold  = Math.max(0, Math.min(CHEST_GOLD_CEIL, Math.floor(+gold || 0)));
    gems  = Math.max(0, Math.min(CHEST_GEM_CEIL,  Math.floor(+gems || 0)));
    seals = Math.max(0, Math.min(1, Math.floor(+seals || 0)));
    var t = themeFor(eventId);
    if (!t) return { eventId: eventId || null, gold: gold, gems: gems, seals: seals, xp: [], items: [] };

    var itemBudget = Math.floor(gold * CHEST_ITEM_SHARE);
    var xpBudget   = Math.floor(gold * CHEST_XP_SHARE);
    var items = [], spent = 0, i;
    for (i = 0; i < t.items.length; i++) {
      var it = t.items[i];
      var qty = Math.floor((itemBudget * it.w) / it.v);
      if (qty > 0) { items.push({ id: it.id, qty: qty, value: qty * it.v }); spent += qty * it.v; }
    }
    // The XP budget is spent whether or not it divides evenly — the remainder
    // is simply not paid, which is the rounding direction that cannot inflate.
    var per = Math.floor((xpBudget * XP_PER_GOLD) / t.skills.length);
    var xp = t.skills.map(function (s) { return { skill: s, amount: per }; });
    var goldOut = Math.max(0, gold - spent - xpBudget);
    return { eventId: eventId, gold: goldOut, gems: gems, seals: seals, xp: xp, items: items };
  }

  // The audit function. What a chest is actually worth, in gold, by the same
  // rate that built it. The smoke suite asserts this never exceeds the band.
  function chestValue(c) {
    if (!c) return 0;
    var v = c.gold || 0, i;
    for (i = 0; i < (c.items || []).length; i++) v += (c.items[i].value || 0);
    for (i = 0; i < (c.xp || []).length; i++) v += (c.xp[i].amount || 0) / XP_PER_GOLD;
    return v;
  }

  // One line a player can read before they commit their day to a rally.
  function chestSummary(c) {
    if (!c) return '';
    var bits = [(c.gold || 0).toLocaleString() + 'g'];
    if (c.gems) bits.push(c.gems + (c.gems === 1 ? ' gem' : ' gems'));
    (c.items || []).forEach(function (it) { bits.push(it.qty.toLocaleString() + ' ' + itemName(it.id)); });
    var xp = (c.xp || []).filter(function (x) { return x.amount > 0; });
    if (xp.length) {
      bits.push(xp.map(function (x) { return x.amount.toLocaleString() + ' ' + skillName(x.skill); }).join(', ') + ' XP');
    }
    if (c.seals > 0) bits.push(c.seals + ' Rally Seal');
    return bits.join(', ');
  }
  function itemName(id) {
    var it = (window.ITEMS && window.ITEMS[id]) || null;
    return (it && it.n) || String(id).replace(/_/g, ' ');
  }
  function skillName(id) {
    var s = (window.SKILLS_DEF && window.SKILLS_DEF[id]) || null;
    return (s && s.name) || (String(id).charAt(0).toUpperCase() + String(id).slice(1));
  }

  function W() { return window.HearthriseWorldEvents; }
  /* b332: the standalone copy (used only when world-events.js has not loaded)
     must stay byte-identical to it, AND to the SQL oracle hr_fnv1a in
     supabase/migrations/2026-08-09-rally-v2.sql — which is what decides what
     a rally chest actually CONTAINS. The old `(h * 0x01000193) >>> 0` is a
     float multiply that loses the low bits, so the client and the server drew
     DIFFERENT rallies on 1230 of 1460 measured day/slot pairs. With Math.imul
     they agree on all 1460. Reference: src/core/rng.js hashSeed. */
  function hash(s) {
    if (W() && W()._hash) return W()._hash(s);
    var h = 0x811c9dc5;
    s = String(s);
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }

  // ════════════════════════════════════════════════════════════
  // 1 · THE CLOCK  (server-corrected, never the raw device clock)
  // ════════════════════════════════════════════════════════════
  // A player whose laptop is nine minutes fast otherwise watches the countdown
  // hit zero, presses Join, and is refused by the server — which reads as a
  // broken feature rather than a wrong clock. serverSkewMs is fetched ONCE per
  // session and applied to every piece of slot maths in this file.
  var skewMs = 0, skewState = 'pending';   // pending | synced | unavailable

  function now() { return Date.now() + skewMs; }
  function serverSkewMs() { return skewMs; }

  function utcMidnight(ms) {
    var d = new Date(ms);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  function dayKeyAt(ms) {
    var d = new Date(ms);
    return W() ? W().utcDayKey(d)
               : d.getUTCFullYear() + '-' + (d.getUTCMonth() + 1) + '-' + d.getUTCDate();
  }
  function todayKey() { return dayKeyAt(now()); }

  // When a UTC day's rallies are FINISHED — the end of its last window. The
  // absent consolation cannot settle before this instant, and that single rule
  // is what makes stacking impossible: while the day is still open the player
  // can still join live, so paying half honors early could hand out both.
  function dayCloseMs(dayKey) {
    var p = String(dayKey || '').split('-');
    if (p.length !== 3) return NaN;
    var y = +p[0], mo = +p[1], d = +p[2];
    if (!isFinite(y) || !isFinite(mo) || !isFinite(d) || !p[0] || !p[1] || !p[2]) return NaN;
    var last = SLOT_UTC_HOURS[SLOT_UTC_HOURS.length - 1];
    return Date.UTC(y, mo - 1, d, last, 0, 0) + WINDOW_MIN * 60000;
  }

  // ── Schedule: derived, never stored ─────────────────────────
  // Both slots of a UTC day are DIFFERENT musters, and that is the whole point
  // of the once-per-day limit. FNV-1a alone would collide ~1 day in 6, so slot
  // B is picked from the pool with slot A removed — guaranteeing the choice a
  // player is asked to make is always a real one.
  function eventIndex(dayKey, slot) {
    var a = hash('hr-muster-' + dayKey + '#' + SLOT_UTC_HOURS[0]) % EVENTS.length;
    if (slot === SLOT_UTC_HOURS[0]) return a;
    var off = hash('hr-muster-' + dayKey + '#' + slot) % (EVENTS.length - 1);
    return (a + 1 + off) % EVENTS.length;
  }
  function eventFor(dayKey, slot) { return EVENTS[eventIndex(dayKey, slot)]; }
  function eventForKey(eventKey) {
    var p = String(eventKey || '').split('#');
    if (p.length !== 2) return null;
    return eventFor(p[0], +p[1]);
  }

  function windowsAround(ms) {
    var out = [];
    for (var dd = -1; dd <= 1; dd++) {
      var base = utcMidnight(ms) + dd * 86400000;
      var dk = dayKeyAt(base + 43200000);          // noon — never near a boundary
      for (var i = 0; i < SLOT_UTC_HOURS.length; i++) {
        var slot = SLOT_UTC_HOURS[i];
        var st = base + slot * 3600000;
        out.push({
          slot: slot, dayKey: dk, startMs: st, endMs: st + WINDOW_MIN * 60000,
          eventKey: dk + '#' + slot, event: eventFor(dk, slot)
        });
      }
    }
    out.sort(function (a, b) { return a.startMs - b.startMs; });
    return out;
  }
  function liveWindow(ms) {
    ms = (ms == null) ? now() : ms;
    var all = windowsAround(ms);
    for (var i = 0; i < all.length; i++) if (ms >= all[i].startMs && ms < all[i].endMs) return all[i];
    return null;
  }
  function nextWindow(ms) {
    ms = (ms == null) ? now() : ms;
    var all = windowsAround(ms);
    for (var i = 0; i < all.length; i++) if (all[i].startMs > ms) return all[i];
    return null;
  }
  function todaysWindows(ms) {
    ms = (ms == null) ? now() : ms;
    var dk = dayKeyAt(ms);
    return windowsAround(ms).filter(function (w) { return w.dayKey === dk; });
  }
  // What the player is actually shown: the live window (if any) plus the next
  // one. Showing "today's two slots" reads as two Closed cards for anyone
  // playing after 13:45 UTC — the useful information is always what is coming,
  // because that is the decision the player is being asked to plan around.
  function displaySlots(ms) {
    ms = (ms == null) ? now() : ms;
    return windowsAround(ms).filter(function (w) { return w.endMs > ms; }).slice(0, 2);
  }

  // ════════════════════════════════════════════════════════════
  // 2 · THE PILL STATE MACHINE  (pure — no clock, no DOM, no I/O)
  // ════════════════════════════════════════════════════════════
  // Every state in world-event-cadence.md §6.2 is here, INCLUDING the boring
  // ones. Deliberately absent: a "you missed it" state. After both slots pass
  // unjoined the pill silently returns to `upcoming` for tomorrow — guilt is a
  // churn mechanic, not a retention mechanic.
  function fmtClock(ms) {
    ms = Math.max(0, ms | 0);
    var s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return h > 0 ? (h + ':' + p(m) + ':' + p(ss)) : (p(m) + ':' + p(ss));
  }
  // "joined this morning" is friendlier than "joined at 13:00 UTC", and it is
  // the player's LOCAL morning that matters, so it is derived from the local
  // hour of the slot they actually took.
  function partOfDay(startMs) {
    var h = new Date(startMs).getHours();
    if (h < 12) return 'this morning';
    if (h < 18) return 'this afternoon';
    return 'this evening';
  }

  /**
   * @param {object} o
   *   nowMs, live {slot,endMs,startMs,eventKey,event}|null, next {startMs,event}|null,
   *   joinedDayKey, joinedEventKey, joinedStartMs, todayKey, rewardReady, signedIn,
   *   pledgedEventKey
   * @returns {{state,copy,tone,rank,cta,answering}} — `rank` encodes the spec's precedence.
   */
  function computeState(o) {
    o = o || {};
    var live = o.live || null, next = o.next || null;
    var joinedToday = !!(o.joinedDayKey && o.joinedDayKey === o.todayKey && o.joinedEventKey);
    var joinedThis  = !!(live && o.joinedEventKey === live.eventKey);
    var toNext = next ? Math.max(0, next.startMs - o.nowMs) : 0;
    // A rally the player has already chosen stops ASKING and starts confirming.
    // It changes the countdown's words, never its state or its precedence —
    // pre-selecting is a plan, not an event.
    var answering = !!(next && o.pledgedEventKey && next.eventKey === o.pledgedEventKey);
    var lead = answering ? 'Answering in ' : 'Rally in ';

    // 3 — live and joinable. The loudest the topbar is ever allowed to be.
    if (live && !joinedToday) {
      return { state: 'live', rank: 100, tone: 'gold-pulse',
               copy: 'LIVE · ' + fmtClock(live.endMs - o.nowMs) + ' left', cta: 'join' };
    }
    // 4 — live and you are in it.
    if (live && joinedThis) {
      return { state: 'mustered', rank: 90, tone: 'gold',
               copy: 'Rallied · ' + fmtClock(live.endMs - o.nowMs), cta: 'open' };
    }
    // 6 — a chest is waiting. Outranks 1, never outranks 3.
    if (o.rewardReady) {
      return { state: 'reward', rank: 80, tone: 'claim', copy: 'Reward ready', cta: 'claim' };
    }
    // 5 — live, but you already mustered today. Muted, NO call to action: an
    // idle game must never punish a player for having played earlier.
    if (live && joinedToday) {
      return { state: 'joined_earlier', rank: 60, tone: 'muted',
               copy: 'Live · joined ' + (o.joinedStartMs ? partOfDay(o.joinedStartMs) : 'today'),
               cta: 'open' };
    }
    // 7 — signed out. Quiet, no countdown urgency.
    if (!o.signedIn && o.requireSignIn) {
      return { state: 'signedout', rank: 20, tone: 'quiet', copy: 'Sign in to join', cta: 'signin' };
    }
    // 2 — imminent (T-15m). Warms up, and toasts once at T-15 and T-5.
    if (next && toNext <= IMMINENT_MS) {
      return { state: 'imminent', rank: 50, tone: 'warm', answering: answering,
               copy: lead + fmtClock(toNext), cta: 'open' };
    }
    // 1 — upcoming.
    return { state: 'upcoming', rank: 10, tone: 'quiet', answering: answering,
             copy: next ? (lead + fmtClock(toNext)) : 'Rally', cta: 'open' };
  }

  // Snapshot of everything computeState needs, read from live state.
  function stateContext(atMs) {
    var st = ensureState();
    var ms = (atMs == null) ? now() : atMs;
    var live = liveWindow(ms);
    var pl = readPledge();
    return {
      nowMs: ms, live: live, next: nextWindow(ms), todayKey: dayKeyAt(ms),
      joinedDayKey: st.dayKey, joinedEventKey: st.eventKey, joinedStartMs: st.startMs,
      pledgedEventKey: pl ? pl.eventKey : null,
      rewardReady: rewardReady(ms), signedIn: isSignedIn(), requireSignIn: false
    };
  }
  function pillState(atMs) { return computeState(stateContext(atMs)); }

  // ════════════════════════════════════════════════════════════
  // 3 · LOCAL MIRROR (save state)
  // ════════════════════════════════════════════════════════════
  function ensureState() {
    var G = window.G || {};
    if (!G.muster || typeof G.muster !== 'object') {
      G.muster = { dayKey: null, eventKey: null, slot: null, startMs: 0, endMs: 0,
                   points: 0, pending: 0, rallied: false, claimed: false, server: false };
    }
    // The mirror only ever needs TODAY. Without this it grows a record per day
    // forever inside a save file that is already fragile.
    if (G.muster.dayKey && G.muster.dayKey !== todayKey()) {
      G.muster = { dayKey: null, eventKey: null, slot: null, startMs: 0, endMs: 0,
                   points: 0, pending: 0, rallied: false, claimed: false, server: false };
    }
    return G.muster;
  }
  function persist() { if (typeof window.saveLocal === 'function') window.saveLocal(); }
  function joinedThisWindow() {
    var st = ensureState(), w = liveWindow();
    return !!(w && st.eventKey === w.eventKey);
  }
  // A chest exists once your window has CLOSED, you contributed, and you have
  // not taken it. It expires at the UTC day roll (ensureState prunes it).
  function rewardReady(ms) {
    var st = ensureState();
    ms = (ms == null) ? now() : ms;
    return !!(st.eventKey && !st.claimed && st.points > 0 && ms >= st.endMs);
  }

  // ── The pre-selection, stored SEPARATELY from the muster mirror ──
  // G.muster is deliberately pruned at the UTC day roll. The pledge must
  // outlive its day — the whole promise is "we'll settle it when you come
  // back", and a player who comes back on Thursday still gets Tuesday's half
  // honors. So it lives at G.rallyPledge and is cleared by settlement, not by
  // the calendar. At most ONE is ever outstanding (pledge() settles the old one
  // before taking a new one), so half honors can never queue up behind itself.
  //   { dayKey, eventKey, slot, startMs, at, joined, provisional }
  function readPledge() {
    var G = window.G || {};
    var p = G.rallyPledge;
    if (!p || typeof p !== 'object' || !p.dayKey || !p.eventKey) return null;
    return p;
  }
  function writePledge(p) {
    var G = window.G || {};
    if (p) G.rallyPledge = p; else delete G.rallyPledge;
    persist();
    return p || null;
  }

  /**
   * PURE. May this player mark `eventKey` as the rally they mean to answer?
   * o: { nowMs, todayKey, windows:[{eventKey,dayKey,slot,startMs}], pledge, joinedToday }
   */
  function canPledge(eventKey, o) {
    o = o || {};
    var all = o.windows || [];
    var w = null, i;
    for (i = 0; i < all.length; i++) if (all[i].eventKey === eventKey) { w = all[i]; break; }
    if (!w) return { ok: false, error: 'unknown_slot' };
    // Only TODAY's two rallies. Tomorrow's opens for answering at the day roll,
    // which keeps "one per day" a rule about a day the server can name.
    if (w.dayKey !== o.todayKey) return { ok: false, error: 'not_today' };
    if (o.nowMs >= w.startMs)   return { ok: false, error: 'window_open' };
    // Already answered live today: the day is spent, and offering a pledge that
    // could never pay would be a lie in the interface.
    if (o.joinedToday) return { ok: false, error: 'already_answered' };
    var p = o.pledge;
    if (p && p.dayKey === o.todayKey) {
      if (p.eventKey === eventKey) return { ok: false, error: 'already_pledged' };
      // "Changeable until that rally's window opens" — once YOUR chosen rally
      // has begun, the choice is made and the day is committed.
      var cur = null;
      for (i = 0; i < all.length; i++) if (all[i].eventKey === p.eventKey) { cur = all[i]; break; }
      if (cur && o.nowMs >= cur.startMs) return { ok: false, error: 'locked' };
    }
    return { ok: true, dayKey: w.dayKey, slot: w.slot, startMs: w.startMs };
  }

  /**
   * PURE. What happens to an outstanding pledge? This is the no-double-pay
   * rule in one function, and it is the one thing in the feature worth testing
   * hardest: `pay` is reachable ONLY when the pledged day is over AND no live
   * join happened on it.
   * o: { nowMs, dayCloseMs, joinedThatDay }
   */
  function pledgeOutcome(p, o) {
    o = o || {};
    if (!p || !p.dayKey || !p.eventKey) return { action: 'none', reason: 'no_pledge' };
    var close = isFinite(o.dayCloseMs) ? o.dayCloseMs : dayCloseMs(p.dayKey);
    if (!isFinite(close)) return { action: 'none', reason: 'bad_day_key' };
    // While the day's rallies can still be joined, nothing is owed yet.
    if (o.nowMs < close) return { action: 'hold', reason: 'day_open' };
    // The pre-selection became a real join. It paid in full at the chest; the
    // consolation is not owed and never was.
    if (o.joinedThatDay) return { action: 'forfeit', reason: 'answered_live' };
    return { action: 'pay', reason: 'absent',
             gold: ABSENT_BAND.gold, gems: ABSENT_BAND.gems, seals: 0 };
  }

  // ════════════════════════════════════════════════════════════
  // 4 · TRANSPORT + PURE REDUCERS
  // ════════════════════════════════════════════════════════════
  function cfg() { return (window.HearthriseSupabase && window.HearthriseSupabase.getConfig && window.HearthriseSupabase.getConfig()) || null; }
  function session() { return (window.HearthriseAuth && window.HearthriseAuth.getSession && window.HearthriseAuth.getSession()) || null; }
  function isSignedIn() { var s = session(); return !!(s && s.user && cfg()); }
  function headers(j) {
    var c = cfg(), s = session();
    var h = { 'apikey': c.anonKey, 'Authorization': 'Bearer ' + ((s && s.access_token) || c.anonKey) };
    if (j) { h['Content-Type'] = 'application/json'; }
    return h;
  }

  // Feature detection, one probe per RPC. A NEGATIVE result expires after ten
  // minutes so a session that was open while the migration was applied starts
  // using the server path without a reload.
  var probe = {};
  function rpcMissing(n) { var p = probe[n]; return !!(p && p.known === false && (Date.now() - p.at) < 600000); }
  function noteRpc(n, present) { probe[n] = { known: present, at: Date.now() }; }
  function _resetProbes() { probe = {}; }

  /**
   * b349 — THE REFUSAL, at the transport rather than at each call site.
   *
   * `headers()` above ends in `|| c.anonKey`, which does not mean "call this
   * anonymously" — it means "send the call anyway, without the standing to
   * make it". For an authenticated-only RPC that is a guaranteed 42501, and
   * this one helper produced 3,196 of them a day against production: boot()
   * ran syncClock() 420ms after DOMContentLoaded and auth.js could not publish
   * a session until a CDN import() of supabase-js resolved, 94–1,040ms later.
   *
   * Refusing HERE and not in syncClock() is the point — every RPC that ever
   * goes through this helper is covered, including the ones nobody has written
   * yet. The decision itself is HearthriseRpc.mayCall(), shared with the rest
   * of the client so there is one idea of it and not six.
   *
   * The refusal is shaped as the server's own `{ok:false, error:'not_signed_in'}`
   * at 401, deliberately:
   *   • every reducer below already routes that to its `not_signed_in` copy,
   *     so no caller learns a new failure shape;
   *   • it is NOT an isMissingRpc() shape, so a refusal can never poison the
   *     feature probe into believing the RPC does not exist for ten minutes.
   */
  /* The active character slot, for the server to credit against (player_state is
     keyed by (user_id, slot)). Derived server-authoritatively from the profile,
     clamped to [0,5]; never a value that could cross to another player. */
  function activeSlot() {
    try {
      var P = window.HearthriseProfile;
      if (P && typeof P.activeSlot === 'function') {
        var s = P.activeSlot();
        if (typeof s === 'number' && s >= 0 && s <= 5) return s | 0;
      }
    } catch (e) {}
    return 0;
  }

  async function rpc(name, body) {
    var R = window.HearthriseRpc;
    if (R && typeof R.mayCall === 'function' && !R.mayCall(name, isSignedIn())) {
      return { status: 401, ok: false, json: { ok: false, error: 'not_signed_in' },
               headers: null, refused: true };
    }
    var res = await fetch(cfg().url + '/rest/v1/rpc/' + name, {
      method: 'POST', headers: headers(true), body: JSON.stringify(body || {})
    });
    var json = null;
    try { json = await res.json(); } catch (e) { json = null; }
    return { status: res.status, ok: res.ok, json: json, headers: res.headers };
  }

  var JOIN_ERRORS = {
    already_joined: 'You already answered a rally today — the next one is tomorrow',
    not_live:       'No rally is live right now',
    stale_event:    'That rally has already closed',
    not_signed_in:  'Sign in to join the realm’s rally',
    network:        'Could not reach the server — try again in a moment'
  };
  var CLAIM_ERRORS = {
    already_claimed: 'You have already taken today’s rally chest',
    not_joined:      'You did not join a rally today',
    no_contribution: 'You joined but never contributed — no chest today',
    still_live:      'The rally is still running — claim when it closes',
    expired:         'That chest expired at the day roll',
    not_signed_in:   'Sign in to claim your rally chest',
    network:         'Could not reach the server — try again in a moment'
  };
  var PLEDGE_ERRORS = {
    window_open:      'That rally has already begun — join it live instead',
    locked:           'Your rally has begun — your answer is locked in for today',
    not_today:        'You can only answer one of today’s two rallies',
    unknown_slot:     'That rally is not on today’s roll',
    already_answered: 'You already joined a rally today',
    already_pledged:  'You have already marked this rally',
    not_signed_in:    'Sign in to answer a rally in advance',
    network:          'Could not reach the server — try again in a moment'
  };
  function joinErrorText(e)   { return JOIN_ERRORS[e]   || 'The server refused that join'; }
  function claimErrorText(e)  { return CLAIM_ERRORS[e]  || 'The server refused that claim'; }
  function pledgeErrorText(e) { return PLEDGE_ERRORS[e] || 'The server refused that answer'; }

  // ── Reducers: pure, no fetch, no DOM. These carry the whole server contract
  //    and are directly unit-tested, including the pre-migration shape.
  function isMissingRpc(status, out) {
    return status === 404 || (out && (out.code === 'PGRST202' || out.code === '42883' || out.code === '42P01'));
  }
  function reduceJoin(status, out, attempt) {
    if (isMissingRpc(status, out)) return { action: 'unsupported' };
    if (status >= 400 || !out || typeof out !== 'object' || typeof out.ok !== 'boolean') {
      return { action: 'fail', message: joinErrorText('') };
    }
    if (out.ok === false) {
      var err = out.error || '';
      // Exactly ONE clock re-sync, never a loop.
      if (err === 'stale_event' && out.event_key && !attempt) {
        return { action: 'retry', eventKey: out.event_key, dayKey: out.day_key };
      }
      if (err === 'already_joined') {
        return { action: 'spent', dayKey: out.day_key, eventKey: out.event_key,
                 slot: +out.slot || null, points: +out.points || 0, claimed: !!out.claimed,
                 message: joinErrorText(err) };
      }
      return { action: 'fail', message: joinErrorText(err) };
    }
    return { action: 'accept', dayKey: out.day_key, eventKey: out.event_key,
             slot: +out.slot || null, endsAt: out.ends_at,
             participants: +out.participants || 0, goal: +out.goal || MIN_GOAL,
             progress: +out.progress || 0 };
  }
  function reduceContribute(status, out) {
    if (isMissingRpc(status, out)) return { action: 'unsupported' };
    if (status >= 400 || !out || typeof out !== 'object' || typeof out.ok !== 'boolean') {
      return { action: 'fail' };
    }
    if (out.ok === false) {
      var err = out.error || '';
      if (err === 'window_closed' || err === 'not_joined') return { action: 'closed', error: err };
      return { action: 'fail', error: err };
    }
    return { action: 'accept', added: +out.added || 0, points: +out.points || 0,
             progress: +out.progress || 0, goal: +out.goal || 0, met: !!out.met };
  }
  // The chest. A response that is not the RPC's own {ok:boolean,…} envelope is
  // a refusal, never a payout — a 401 body has no `ok` field, and treating one
  // as success would hand out gold.
  function reduceClaim(status, out) {
    if (isMissingRpc(status, out)) return { action: 'unsupported' };
    if (status >= 400 || !out || typeof out !== 'object' || typeof out.ok !== 'boolean') {
      return { action: 'fail', message: claimErrorText('') };
    }
    if (out.ok === false) {
      var err = out.error || '';
      if (err === 'already_claimed') return { action: 'spent', message: claimErrorText(err) };
      return { action: 'fail', message: claimErrorText(err) };
    }
    return {
      action: 'accept', band: out.band || 'answered', held: !!out.held,
      // Server caps, mirrored so a compromised server cannot mint either.
      // A Muster Seal is only ever awarded when the realm held the line.
      gold:  Math.max(0, Math.min(7500, +out.gold || 0)),
      gems:  Math.max(0, Math.min(10,   +out.gems || 0)),
      seals: out.held ? Math.max(0, Math.min(1, +out.seals || 0)) : 0,
      /* SERVER-AUTHORITATIVE THEMED CHEST (2026-08-20). When the RPC returns an
         `items` array it has ALREADY computed the themed chest server-side
         (hr_rally_chest) and WRITTEN the materials into player_inventory — `gold`
         above is then the REDUCED goldOut, not the full band. The client renders
         these instead of re-deriving its own chest (which would double-reduce).
         When `items` is absent (an un-migrated server, or the solo fall-through)
         the client keeps computing the chest from the full band gold — the
         legacy path. Item ids/qtys are sanitised but ORIGINATE server-side; the
         client never sends them. */
      items: sanitizeServerChest(out.items),
      xp:    sanitizeServerXp(out.xp)
    };
  }

  // Defensive coercion of the server's own chest list. These come from OUR
  // trusted RPC, but reduce-layer discipline is to never hand an unshaped value
  // to the payout path: coerce id→string, qty→clamped int, drop the rest.
  function sanitizeServerChest(arr) {
    if (!Array.isArray(arr)) return null;
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var it = arr[i];
      if (!it || typeof it.id !== 'string' || !it.id) continue;
      var qty = Math.max(0, Math.min(1e6, Math.floor(+it.qty || 0)));
      if (qty > 0) out.push({ id: it.id, qty: qty, value: Math.max(0, Math.floor(+it.value || 0)) });
    }
    return out;
  }
  function sanitizeServerXp(arr) {
    if (!Array.isArray(arr)) return null;
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var x = arr[i];
      if (!x || typeof x.skill !== 'string' || !x.skill) continue;
      var amt = Math.max(0, Math.min(1e7, Math.floor(+x.amount || 0)));
      if (amt > 0) out.push({ skill: x.skill, amount: amt });
    }
    return out;
  }

  function reducePledge(status, out) {
    if (isMissingRpc(status, out)) return { action: 'unsupported' };
    if (status >= 400 || !out || typeof out !== 'object' || typeof out.ok !== 'boolean') {
      return { action: 'fail', message: pledgeErrorText('') };
    }
    if (out.ok === false) {
      return { action: 'fail', error: out.error || '', message: pledgeErrorText(out.error || '') };
    }
    return { action: 'accept', dayKey: out.day_key, eventKey: out.event_key, slot: +out.slot || null };
  }

  // Half honors. The client mirrors the server's ceiling for the same reason
  // reduceClaim does — so a compromised or confused server cannot mint — and it
  // hard-zeroes seals here rather than trusting a field: absence never earns a
  // Rally Seal, so there is no number the server could send that would pay one.
  function reduceAbsence(status, out) {
    if (isMissingRpc(status, out)) return { action: 'unsupported' };
    if (status >= 400 || !out || typeof out !== 'object' || typeof out.ok !== 'boolean') {
      return { action: 'fail', error: 'network' };
    }
    if (out.ok === false) {
      var err = out.error || '';
      // Not a failure: the server found a live join (or an earlier settlement)
      // for that day. The pledge did its job — close it, pay nothing.
      if (err === 'answered_live' || err === 'already_settled' || err === 'no_pledge') {
        return { action: 'forfeit', error: err };
      }
      if (err === 'day_open') return { action: 'hold', error: err };
      return { action: 'fail', error: err };
    }
    return { action: 'accept',
             gold:  Math.max(0, Math.min(ABSENT_BAND.gold, +out.gold || 0)),
             gems:  Math.max(0, Math.min(ABSENT_BAND.gems, +out.gems || 0)),
             seals: 0 };
  }

  // ── serverSkewMs ────────────────────────────────────────────
  async function syncClock() {
    if (!cfg()) { skewState = 'unavailable'; return 0; }
    var t0 = Date.now(), r;
    try { r = await rpc('hr_server_now', {}); }
    catch (e) { skewState = 'unavailable'; return 0; }
    var t1 = Date.now();
    noteRpc('hr_server_now', !isMissingRpc(r.status, r.json));
    var serverMs = (r.json && typeof r.json.epoch_ms === 'number') ? r.json.epoch_ms : null;
    if (serverMs === null) {
      // Pre-migration fallback: the `Date` response header of the very same
      // (404) request. Verified readable against the live Supabase project —
      // PostgREST exposes it — which means serverSkewMs works BEFORE the
      // migration is applied, not only after. If a future CORS policy hides
      // it we keep skew 0 and the device clock: exactly the pre-b220
      // behaviour. Honest degradation, never a fabricated correction.
      try { var h = r.headers && r.headers.get && r.headers.get('date'); if (h) { var p = Date.parse(h); if (isFinite(p)) serverMs = p; } } catch (e2) {}
    }
    if (serverMs === null) { skewState = 'unavailable'; return 0; }
    var skew = serverMs - (t0 + (t1 - t0) / 2);
    // The header/epoch has ~1s resolution. Never "correct" by less than that
    // or a perfectly healthy clock acquires a permanent sub-second wobble.
    skewMs = Math.abs(skew) < 1500 ? 0 : skew;
    skewState = 'synced';
    return skewMs;
  }

  // ════════════════════════════════════════════════════════════
  // 5 · JOIN · CONTRIBUTE · RALLY · CLAIM
  // ════════════════════════════════════════════════════════════
  var CONFIRM_KEY = 'hr-muster-confirmed';
  function readFlag(k) {
    try { return window.HearthriseStorage ? window.HearthriseStorage.get(k) : localStorage.getItem(k); }
    catch (e) { return null; }
  }
  function writeFlag(k, v) {
    try { if (window.HearthriseStorage) window.HearthriseStorage.set(k, v); else localStorage.setItem(k, v); }
    catch (e) {}
  }

  async function join(confirmed) {
    var st = ensureState();
    var w = liveWindow();
    if (!w) { toast(JOIN_ERRORS.not_live, 'info'); return false; }
    if (st.dayKey === w.dayKey && st.eventKey) { toast(JOIN_ERRORS.already_joined, 'info'); return false; }

    // Once per ACCOUNT, not once per day: joining and contributing nothing
    // still burns the day, and the player must know that before the first one.
    if (!confirmed && readFlag(CONFIRM_KEY) !== '1') { openConfirm(w); return false; }
    writeFlag(CONFIRM_KEY, '1');

    if (isSignedIn() && !rpcMissing('world_event_join')) {
      var d = await serverJoin(w.eventKey, 0);
      if (d.action === 'fail') { toast(d.message, 'kill'); return false; }
      if (d.action === 'spent') {                       // the server knows better
        adopt({ dayKey: d.dayKey, eventKey: d.eventKey, slot: d.slot, points: d.points, claimed: d.claimed });
        toast(d.message, 'info'); renderAll(); return false;
      }
      if (d.action === 'accept') {
        adopt({ dayKey: d.dayKey, eventKey: d.eventKey, slot: d.slot,
                startMs: w.startMs, endMs: d.endsAt ? Date.parse(d.endsAt) : w.endMs,
                server: true });
        community = { eventKey: d.eventKey, participants: d.participants, goal: d.goal, progress: d.progress, met: false };
        announceJoin(w);
        renderAll(); return true;
      }
      // 'unsupported' falls through to the solo path below.
    }
    // Degraded path: no server (signed out, offline, or pre-migration). A solo
    // muster — real join, real contribution, real chest, but no community bar
    // and no Muster Seal, because neither would be true.
    adopt({ dayKey: w.dayKey, eventKey: w.eventKey, slot: w.slot,
            startMs: w.startMs, endMs: w.endMs, server: false });
    community = null;
    announceJoin(w);
    renderAll();
    return true;
  }

  function adopt(o) {
    var G = window.G || {}; var st = ensureState();
    if (o.dayKey)   st.dayKey = o.dayKey;
    if (o.eventKey) st.eventKey = o.eventKey;
    if (o.slot != null) st.slot = o.slot;
    if (o.startMs)  st.startMs = o.startMs;
    if (o.endMs)    st.endMs = o.endMs;
    if (o.points != null) st.points = o.points;
    if (o.claimed != null) st.claimed = !!o.claimed;
    if (o.server != null) st.server = !!o.server;
    // Derive a window from the key when the server only told us the key.
    if (!st.endMs && st.eventKey) {
      var m = windowsAround(now()).filter(function (w) { return w.eventKey === st.eventKey; })[0];
      if (m) { st.startMs = m.startMs; st.endMs = m.endMs; }
    }
    // THE NO-DOUBLE-PAY LATCH. A pre-selection that becomes a real join is
    // simply UPGRADED into that join — full chest, no consolation. It is
    // recorded on the pledge (not on the muster mirror) because the mirror is
    // pruned at the day roll, and settlement can happen days later.
    var pl = readPledge();
    if (pl && st.dayKey && pl.dayKey === st.dayKey && !pl.joined) pl.joined = true;
    persist();
    return st;
  }

  function announceJoin(w) {
    var aura = ' — +' + Math.round(LIVE_XP_AURA * 100) + '% all XP while the rally runs.';
    toast(autoJoining ? (w.event.name + ' opened and you were here — you are in' + aura)
                      : ('You answer ' + w.event.name + aura), 'levelup');
  }

  async function serverJoin(eventKey, attempt) {
    var r;
    try { r = await rpc('world_event_join', { p_event_key: eventKey }); }
    catch (e) { return { action: 'fail', message: joinErrorText('network') }; }
    var d = reduceJoin(r.status, r.json, attempt);
    noteRpc('world_event_join', d.action !== 'unsupported');
    if (d.action === 'retry' && !attempt) {
      // The server told us which muster is actually live. Adopt it once.
      return await serverJoin(d.eventKey, attempt + 1);
    }
    return d;
  }

  // ── Contribution: piggybacks the counters the game already fires ──
  // updateDaily() is called from every meaningful player action already
  // (kills, gathers, harvests, cooks, smiths, crafts). Wrapping it — the same
  // thin additive pattern world-events.js uses on getBonus — means the muster
  // scores real play with ZERO new call sites in the monolith to keep in sync.
  function pointsFor(type, amt) {
    var w = liveWindow(); if (!w) return 0;
    var st = ensureState();
    if (st.eventKey !== w.eventKey) return 0;
    var mult = w.event.sources[type];
    if (!mult) return 0;
    var base;
    if (type === 'kill_any') {
      var mon = (window.MONSTERS && window.G && window.MONSTERS[window.G.activeMonster]) || null;
      base = 10 * ((mon && mon.tier) || 1);
    } else {
      base = (POINTS[type] || 0) * Math.max(1, amt || 1);
    }
    return Math.max(0, Math.floor(base * mult));
  }
  function addPoints(n) {
    if (!(n > 0)) return 0;
    var st = ensureState();
    var room = Math.max(0, TOTAL_CAP - st.points);
    n = Math.min(n, room);
    if (n <= 0) return 0;
    st.points += n;
    st.pending = (st.pending || 0) + n;
    return n;
  }

  var flushing = false;
  async function flush() {
    var st = ensureState();
    if (flushing || !(st.pending > 0)) return;
    if (!st.server || !isSignedIn() || rpcMissing('world_event_contribute')) { st.pending = 0; persist(); return; }
    var send = Math.min(CALL_CLAMP, st.pending);
    flushing = true;
    var r;
    try { r = await rpc('world_event_contribute', { p_event_key: st.eventKey, p_points: send }); }
    catch (e) { flushing = false; return; }               // keep pending, retry next tick
    flushing = false;
    var d = reduceContribute(r.status, r.json);
    noteRpc('world_event_contribute', d.action !== 'unsupported');
    if (d.action === 'unsupported') { st.pending = 0; st.server = false; persist(); return; }
    if (d.action === 'closed') { st.pending = 0; persist(); return; }
    if (d.action !== 'accept') return;
    st.pending = Math.max(0, st.pending - send);
    st.points = d.points || st.points;                    // the server's total wins
    community = { eventKey: st.eventKey, participants: (community && community.participants) || 0,
                  goal: d.goal || MIN_GOAL, progress: d.progress, met: d.met };
    persist();
    renderPanel();
  }

  // Rally — one large one-shot contribution, so a player with sixty free
  // seconds can still take part meaningfully. One per muster.
  function rally() {
    var st = ensureState();
    if (!joinedThisWindow()) { toast('Join the rally first', 'info'); return 0; }
    if (st.rallied) { toast('You have already rallied at this event', 'info'); return 0; }
    var R = window.HearthriseRaids;
    var roll = (R && typeof R.simulateStrike === 'function')
      ? R.simulateStrike({ def: 40, weak: 'sword' })
      : 600;
    var pts = Math.max(20, Math.floor(roll / 12));
    st.rallied = true;
    var got = addPoints(pts);
    persist();
    toast('You rally — +' + got.toLocaleString() + ' to the realm’s effort', 'loot');
    flush(); renderAll();
    return got;
  }

  async function claim() {
    var st = ensureState();
    if (!rewardReady()) {
      toast(st.claimed ? CLAIM_ERRORS.already_claimed
                       : (st.eventKey ? CLAIM_ERRORS.still_live : CLAIM_ERRORS.not_joined), 'info');
      return false;
    }
    /* SERVER-CREDITED (2026-08-19): world_event_claim now credits the chest
       gold/gems INTO player_state, atomically with consuming the once-per-day
       claim (the migration in this change). The b411 arm-safety DEFER is GONE —
       claim + payout are one server transaction, so the day can never be spent
       for a zero payout. payChest's local gold/gems write is a DISPLAY prediction
       gated on clientMayWriteRecordField: pre-arm it credits locally (the server
       credit is dark), post-arm it no-ops and the server's player_state value
       arrives on the next envelope. p_slot names the character to credit — the
       active slot, never a cross-player value. */
    if (st.server && isSignedIn() && !rpcMissing('world_event_claim')) {
      await flush();
      var r;
      try { r = await rpc('world_event_claim', { p_day_key: st.dayKey, p_slot: activeSlot() }); }
      catch (e) { toast(claimErrorText('network'), 'kill'); return false; }
      var d = reduceClaim(r.status, r.json);
      noteRpc('world_event_claim', d.action !== 'unsupported');
      if (d.action === 'spent') { st.claimed = true; persist(); renderAll(); toast(d.message, 'info'); return false; }
      if (d.action === 'fail')  { toast(d.message, 'kill'); return false; }
      if (d.action === 'accept') { grant(d); return true; }
      // 'unsupported' → the migration is not applied. Fall through to solo.
    }
    grant(SOLO_BAND);
    return true;
  }

  // The reward. Gold, gems, the rally's own materials and XP, and AT MOST ONE
  // Muster Seal. There is no branch here that can produce a hearth_token — the
  // IAP bond is never PvE-minted.
  function grant(d) {
    var st = ensureState();
    st.claimed = true;
    var ev = eventForKey(st.eventKey);
    var chest, serverItems = false;
    if (d && Array.isArray(d.items)) {
      /* SERVER-AUTHORITATIVE (2026-08-20): the RPC already computed the themed
         chest AND wrote its materials into player_inventory. d.gold is the
         reduced goldOut. Render the server's list; do NOT re-derive it (that
         would convert goldOut a second time and under-pay). */
      chest = { eventId: ev ? ev.id : null, gold: d.gold, gems: d.gems,
                seals: d.seals, items: d.items, xp: d.xp || [] };
      serverItems = true;
    } else {
      /* LEGACY / SOLO: no server chest in the response — compute it client-side
         from the full band gold, exactly as before. */
      chest = themedChest(ev ? ev.id : null, d.gold, d.gems, d.seals);
    }
    payChest(chest, { serverItems: serverItems });
    toast('Rally chest: ' + chestSummary(chest) + (d.held ? ' — the realm held.' : ''), 'levelup');
    persist();
    if (typeof window.updateTopbar === 'function') try { window.updateTopbar(); } catch (e) {}
    renderAll();
  }

  // The ONE payout path, shared by the live chest and half honors. XP goes
  // through addXp so PACE, the fuse and the day's blessing all apply — a rally
  // must never be a way to inject XP the rest of the game cannot see.
  function payChest(c, opts) {
    opts = opts || {};
    var G = window.G;
    /* SECURITY (gold record-flip, Finding #2): world_event_claim PRICES the
       chest server-side (v_gold/v_gems in 2026-08-08-muster.sql) and is the
       double-claim arbiter, but it does NOT credit player_state.gold — the RPC
       only RETURNS the amount and the credit happens here. So on the day gold
       joins SERVER_OF_RECORD this local grant would be ERASED by the next
       absolute envelope. Gate it on the record seam so a number the server will
       overwrite is never minted; the gate is a no-op until gold is armed, so
       today's behaviour is byte-identical. Items/seals/XP are NOT on the record
       and stay client-authored. */
    var _mayGold = !window.clientMayWriteRecordField || window.clientMayWriteRecordField('gold');
    var _mayGems = !window.clientMayWriteRecordField || window.clientMayWriteRecordField('gems');
    if (_mayGold) G.gold = (G.gold || 0) + (c.gold || 0);
    if (_mayGems) G.gems = (G.gems || 0) + (c.gems || 0);
    /* ITEMS (2026-08-20). When opts.serverItems is set the RPC has already
       written these materials into player_inventory (the record). Gate the local
       addItem on the inventory record seam exactly as gold is gated: pre-arm the
       server write is dark, so credit locally for display; post-arm the absolute
       envelope carries the rows, so skip to avoid a double. The LEGACY/SOLO path
       (serverItems false) still addItems unconditionally — nothing wrote them
       server-side. Seals + XP are NOT server-owned (muster_seal is excluded from
       item-authority; XP flows through addXp so PACE/fuse/blessing apply) and
       stay client-authored on every path. */
    var _mayInv = !opts.serverItems
      || !window.clientMayWriteRecordField
      || window.clientMayWriteRecordField('inventory');
    (c.items || []).forEach(function (it) {
      if (it.qty > 0 && _mayInv && typeof window.addItem === 'function') window.addItem(it.id, it.qty);
    });
    if (c.seals > 0 && typeof window.addItem === 'function') window.addItem('muster_seal', c.seals);
    (c.xp || []).forEach(function (x) {
      if (x.amount > 0 && typeof window.addXp === 'function') window.addXp(x.skill, x.amount);
    });
    persist();
  }

  // ════════════════════════════════════════════════════════════
  // 5b · PRE-SELECTION — answering in advance, and answering in absence
  // ════════════════════════════════════════════════════════════
  function pledgeContext(atMs) {
    var ms = (atMs == null) ? now() : atMs;
    var st = ensureState(), dk = dayKeyAt(ms);
    return { nowMs: ms, todayKey: dk, windows: windowsAround(ms), pledge: readPledge(),
             joinedToday: !!(st.dayKey === dk && st.eventKey) };
  }

  // ── Is a pledge a thing this session can actually hold? ─────
  // b231, Tyler: an answer the server cannot keep is not a feature, it is a
  // rumour. So there is no local-only pledge any more. Client-first still
  // holds — the affordance shows until a probe PROVES the RPC is absent, and
  // then it disappears rather than degrading into a promise nothing backs.
  var UNAVAILABLE = 'Rally pledges are unavailable right now.';
  // Test seam only: null = ask the real thing. The suite runs without a
  // session, so there is no other way to exercise the supported branch.
  var forcedSupport = null;
  function pledgeSupported() {
    if (forcedSupport !== null) return forcedSupport;
    if (!isSignedIn()) return false;
    return !rpcMissing('world_event_pledge') && !rpcMissing('hr_rally_pledge_state');
  }

  async function pledge(eventKey) {
    if (!pledgeSupported()) { toast(UNAVAILABLE, 'info'); renderAll(); return false; }
    var ok = canPledge(eventKey, pledgeContext());
    if (!ok.ok) { toast(pledgeErrorText(ok.error), 'info'); return false; }

    // Settle whatever is outstanding FIRST. One answer at a time is what keeps
    // half honors from accruing into a savings account.
    await settlePledge();

    var r;
    try { r = await rpc('world_event_pledge', { p_event_key: eventKey }); }
    catch (e) { toast(pledgeErrorText('network'), 'kill'); return false; }
    var d = reducePledge(r.status, r.json);
    noteRpc('world_event_pledge', d.action !== 'unsupported');
    // Un-migrated: the affordance goes away. No half-kept promise, no jargon.
    if (d.action === 'unsupported') { toast(UNAVAILABLE, 'info'); renderAll(); return false; }
    if (d.action === 'fail') { toast(d.message, 'info'); renderAll(); return false; }

    writePledge({ dayKey: ok.dayKey, eventKey: eventKey, slot: ok.slot, startMs: ok.startMs,
                  at: now(), joined: false, provisional: false });
    var ev = eventForKey(eventKey);
    toast('You will answer ' + (ev ? ev.name : 'the rally') + '. Be online when it opens and you are ' +
          'in automatically — miss it entirely and half honors find you.', 'info');
    renderAll();
    return true;
  }

  // Settlement. Called at boot, once a minute, and before any new pledge.
  //
  // THE OWNERSHIP RULE that makes double-pay impossible across devices: a
  // pledge the SERVER registered is settled ONLY by the server, and a
  // provisional (local-only) pledge is settled ONLY locally. There is no path
  // where a signed-out client pays out a pledge the server still holds open.
  var settling = false;
  async function settlePledge() {
    var p = readPledge();
    if (!p || settling) return { action: 'none', reason: p ? 'busy' : 'no_pledge' };
    var st = ensureState();
    var joined = !!p.joined || !!(st.dayKey === p.dayKey && st.eventKey);
    var o = pledgeOutcome(p, { nowMs: now(), dayCloseMs: dayCloseMs(p.dayKey), joinedThatDay: joined });
    if (o.action === 'hold' || o.action === 'none') return o;
    if (o.action === 'forfeit') { writePledge(null); renderAll(); return o; }

    settling = true;
    try {
      if (!p.provisional) {
        // Server-owned. If we cannot ask it, we wait — never guess.
        if (!isSignedIn()) return { action: 'hold', reason: 'signed_out' };
        if (rpcMissing('world_event_absence_claim')) return { action: 'hold', reason: 'unsupported' };
        var r;
        try { r = await rpc('world_event_absence_claim', { p_day_key: p.dayKey }); }
        catch (e) { return { action: 'hold', reason: 'network' }; }
        var d = reduceAbsence(r.status, r.json);
        noteRpc('world_event_absence_claim', d.action !== 'unsupported');
        if (d.action === 'unsupported' || d.action === 'hold') return { action: 'hold', reason: d.action === 'hold' ? 'day_open' : 'unsupported' };
        // A refusal we do not understand closes the pledge and pays NOTHING.
        // No payout is ever invented out of an error.
        if (d.action === 'forfeit' || d.action === 'fail') { writePledge(null); renderAll(); return d; }
        grantAbsent(p, d);
        writePledge(null);
        return d;
      }
      grantAbsent(p, ABSENT_BAND);
      writePledge(null);
      return { action: 'accept', gold: ABSENT_BAND.gold, gems: ABSENT_BAND.gems, seals: 0, provisional: true };
    } finally { settling = false; }
  }

  // Half honors — the SAME themed table, on half the band. That is what makes
  // the consolation legible: a Forge Levy you missed still pays bars and
  // smithing, just half of it. No Rally Seal, no community share, and no branch
  // that could name the IAP-only Hearth Token.
  function absentChest(eventKey, gold, gems) {
    var ev = eventForKey(eventKey);
    return themedChest(ev ? ev.id : null,
      Math.max(0, Math.min(ABSENT_BAND.gold, Math.floor(+gold || 0))),
      Math.max(0, Math.min(ABSENT_BAND.gems, Math.floor(+gems || 0))), 0);
  }
  function grantAbsent(p, d) {
    var ev = eventForKey(p.eventKey);
    var chest = absentChest(p.eventKey, d.gold, d.gems);
    payChest(chest);
    toast('You answered ' + (ev ? ev.name : 'the rally') + ' in absence — half honors: ' +
          chestSummary(chest), 'levelup');
    if (typeof window.updateTopbar === 'function') try { window.updateTopbar(); } catch (e) {}
    renderAll();
  }

  // Cross-device honesty: the answer may have been given on the player's phone.
  // Only ADOPTS a server pledge — it never deletes a provisional local one the
  // server has never heard of, because that would silently eat half honors.
  var lastHydrateAt = 0;
  async function hydratePledge() {
    if (!isSignedIn() || rpcMissing('hr_rally_pledge_state')) return null;
    var r;
    try { r = await rpc('hr_rally_pledge_state', {}); } catch (e) { return null; }
    var missing = isMissingRpc(r.status, r.json);
    noteRpc('hr_rally_pledge_state', !missing);
    if (missing || !r.json || r.json.ok !== true) return null;
    var pick = r.json.pending || r.json.today || null;
    if (!pick || !pick.day_key || !pick.event_key) return r.json;
    var local = readPledge();
    if (local && local.provisional) return r.json;
    if (!local || local.dayKey !== pick.day_key || local.eventKey !== pick.event_key) {
      writePledge({ dayKey: pick.day_key, eventKey: pick.event_key, slot: +pick.slot || null,
                    startMs: 0, at: now(), joined: !!pick.joined, provisional: false });
      renderAll();
    }
    return r.json;
  }
  async function pledgeTick() {
    try {
      if (!readPledge() && isSignedIn() && (Date.now() - lastHydrateAt) > 600000) {
        lastHydrateAt = Date.now();
        await hydratePledge();
      }
      await settlePledge();
    } catch (e) {}
  }

  // ════════════════════════════════════════════════════════════
  // 5c · AUTO-JOIN — the pledge answers itself (b231)
  // ════════════════════════════════════════════════════════════
  // Tyler: a player who marked a rally and is THERE when it opens should not
  // have to find a button. The pledge was the decision; clicking Join again is
  // only a tax on the players who did the planning the feature asked for.
  //
  // So: pledged + online at any point inside the window = the pledge UPGRADES
  // itself into the ordinary join, at full value, through the ordinary join
  // path. Nothing downstream changes — contribution, the community bar, the
  // aura and the chest are the same code they were before this existed.
  //
  // ── WHAT "ONLINE" MEANS ─────────────────────────────────────
  // Exactly what the blessing gate means by it: HearthrisePresence.isOnline,
  // which is the one oracle (HearthriseNetStatus → navigator.onLine plus a
  // real probe). One question, one answer, one story told to the player. It
  // fails OPEN — with no honest disconnection signal the player is online,
  // because their session is what is executing this line.
  //
  // ── WHY THIS CANNOT DOUBLE-PAY ──────────────────────────────
  // Auto-join is not a new payout; it is a join. Every no-double-pay lock the
  // pledge already had applies unchanged, and the join itself is idempotent on
  // four independent guards:
  //   1. joinedThisWindow() — the local mirror already names this rally.
  //   2. the day-spent check — a join for today under ANY key stops it.
  //   3. `autoJoining`, an in-flight latch, so a 1Hz tick cannot start a second
  //      attempt while the first is still awaiting the server.
  //   4. world_event_joins' primary key (day_key, user_id), server-side, which
  //      answers `already_joined` and is adopted rather than retried.
  // And once it lands, adopt() latches joined=true on the PLEDGE, so
  // pledgeOutcome() forfeits the consolation and world_event_absence_claim's
  // LOCK 2 refuses it independently on the server. Full chest OR half honors,
  // never both, on either side of the wire.
  function sessionOnline() {
    var P = window.HearthrisePresence;
    if (P && typeof P.isOnline === 'function') { try { return !!P.isOnline(); } catch (e) { return true; } }
    try { if (typeof navigator !== 'undefined' && navigator.onLine === false) return false; } catch (e2) {}
    return true;
  }

  /**
   * PURE. Should the pledge become a join right now?
   * o: { live, pledge, joinedDayKey, joinedEventKey, todayKey, online }
   */
  function autoJoinDecision(o) {
    o = o || {};
    if (!o.live)    return { action: 'skip', reason: 'no_window' };
    if (!o.pledge)  return { action: 'skip', reason: 'no_pledge' };
    if (o.pledge.eventKey !== o.live.eventKey) return { action: 'skip', reason: 'other_rally' };
    if (o.joinedDayKey === o.todayKey && o.joinedEventKey) {
      return { action: 'skip',
               reason: o.joinedEventKey === o.live.eventKey ? 'already_joined' : 'day_spent' };
    }
    // Offline through the window is the OTHER branch of the promise: it is not
    // a failure, it is the half-honors path, settled when they come back.
    if (!o.online) return { action: 'skip', reason: 'offline' };
    return { action: 'join', eventKey: o.live.eventKey };
  }

  function autoJoinContext(atMs) {
    var ms = (atMs == null) ? now() : atMs;
    var st = ensureState();
    return { live: liveWindow(ms), pledge: readPledge(), todayKey: dayKeyAt(ms),
             joinedDayKey: st.dayKey, joinedEventKey: st.eventKey, online: sessionOnline() };
  }

  var autoJoining = false;
  async function autoJoinTick() {
    if (autoJoining) return { action: 'skip', reason: 'busy' };
    var d = autoJoinDecision(autoJoinContext());
    if (d.action !== 'join') return d;
    autoJoining = true;
    try {
      var ok = await join(true);          // the ordinary join path, confirm bypassed
      if (!ok) return { action: 'skip', reason: 'refused' };
      await closeJoinedPledge();
      return { action: 'joined', eventKey: d.eventKey };
    } catch (e) { return { action: 'skip', reason: 'error' }; }
    finally { autoJoining = false; }
  }

  // Close the server's copy of the pledge the moment it has been answered.
  // Not required for correctness — LOCK 2 already refuses half honors for a
  // day with a join row — but it means a second device never even SEES a
  // pending consolation it would then have to be told it cannot have.
  async function closeJoinedPledge() {
    var p = readPledge();
    if (!p || p.provisional || !isSignedIn() || rpcMissing('world_event_pledge_settle')) return null;
    var r;
    try { r = await rpc('world_event_pledge_settle', { p_day_key: p.dayKey }); } catch (e) { return null; }
    noteRpc('world_event_pledge_settle', !isMissingRpc(r.status, r.json));
    return r.json || null;
  }

  // ── The live aura: +2% all XP while mustered ────────────────
  // Same thin additive wrapper world-events.js uses, for the same reason:
  // every existing system inherits it with no further wiring.
  //
  // b228: extracted into a named function and EXPORTED, because the power
  // budget has to be able to ask "how much of this key is temporary?" without
  // guessing. A rally aura ends when the window does, so it is temporary by
  // nature and belongs in the ceremony budget, not the permanent one.
  function liveAura(key) {
    if (key !== 'allXP') return 0;
    try { return joinedThisWindow() ? LIVE_XP_AURA : 0; } catch (e) { return 0; }
  }
  var origGetBonus = window.getBonus;
  if (typeof origGetBonus === 'function') {
    window.getBonus = function (key) {
      var t = origGetBonus.apply(this, arguments);
      try { t += liveAura(key); } catch (e) {}
      return t;
    };
  }

  function toast(msg, kind) { if (typeof window.notify === 'function') window.notify(msg, kind || 'info'); }

  // ════════════════════════════════════════════════════════════
  // 6 · PRESENTATION
  // ════════════════════════════════════════════════════════════
  var community = null;   // {eventKey, participants, goal, progress, met} | null

  function gly(key, px, col) {
    return (window.HR && window.HR.icon) ? (window.HR.icon(key, px || 16, col || null) || '') : '';
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  var STYLE_ID = 'hr-muster-style';
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      /* ── the topbar pill ── it must never grow taller than a .t-stat chip ── */
      '#hr-muster-pill{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:99px;',
      '  border:1px solid var(--line);background:rgba(255,255,255,.04);color:var(--ink-2);',
      '  font-size:calc(14.5px * var(--ui-scale, 1));font-weight:700;letter-spacing:.02em;cursor:pointer;white-space:nowrap;',
      '  line-height:1.2;max-height:30px}',
      '#hr-muster-pill .mp-lab{text-transform:uppercase;font-size:calc(14.5px * var(--ui-scale, 1));letter-spacing:.08em;color:var(--ink-3)}',
      '#hr-muster-pill .mp-t{font-variant-numeric:tabular-nums}',
      '#hr-muster-pill:hover{border-color:var(--line-strong,rgba(201,162,74,.45))}',
      '#hr-muster-pill[data-tone="quiet"]{color:var(--ink-3)}',
      '#hr-muster-pill[data-tone="muted"]{color:var(--ink-3);opacity:.8}',
      '#hr-muster-pill[data-tone="warm"]{color:var(--gold-2);border-color:rgba(201,162,74,.38)}',
      '#hr-muster-pill[data-tone="gold"],#hr-muster-pill[data-tone="claim"]{color:var(--gold-2);',
      '  border-color:rgba(201,162,74,.55);background:var(--gold-bg,rgba(201,162,74,.10))}',
      '#hr-muster-pill[data-tone="gold-pulse"]{color:var(--gold-2);border-color:rgba(201,162,74,.7);',
      '  background:var(--gold-bg,rgba(201,162,74,.12));animation:hr-mu-pulse 2.4s ease-in-out infinite}',
      '#hr-muster-pill[data-tone="claim"] .mp-dot{width:7px;height:7px;border-radius:50%;background:var(--gold-2);display:inline-block}',
      '@keyframes hr-mu-pulse{0%,100%{box-shadow:0 0 0 0 rgba(201,162,74,.30)}50%{box-shadow:0 0 0 5px rgba(201,162,74,0)}}',
      '@media (prefers-reduced-motion: reduce){#hr-muster-pill[data-tone="gold-pulse"]{animation:none}}',
      '@media (max-width:540px){#hr-muster-pill{padding:4px 7px;font-size:calc(14.5px * var(--ui-scale, 1))}#hr-muster-pill .mp-lab{display:none}}',
      /* ── the Events panel ──
         .panel.active is display:grid with no template, which sizes injected
         cards as implicit rows against a fixed-height container — that is what
         collapsed #hr-raid-card to 16px inside #panel-dungeons. This panel is a
         BLOCK column that scrolls, so every card gets its natural height. */
      '#panel-events.active{display:block;overflow-y:auto;padding:var(--gap);padding-bottom:78px}',
      '#panel-events .ev-sec{margin-bottom:14px}',
      '#panel-events #panel-dungeons{display:block;padding:0;overflow:visible;min-height:0;flex:none}',
      '#panel-events #hr-raid-card{display:block;height:auto;min-height:0;margin-bottom:0}',
      '#panel-events #hr-dungeons-back{display:none}',
      '.ev-eyebrow{font-family:var(--f-display,inherit);font-size:calc(14.5px * var(--ui-scale, 1));font-weight:800;color:var(--gold-2);',
      '  letter-spacing:.14em;text-transform:uppercase;margin:0 0 8px}',
      '.mu-bar{height:10px;background:rgba(0,0,0,.35);border-radius:99px;overflow:hidden;border:1px solid var(--line-soft)}',
      '.mu-bar i{display:block;height:100%;background:linear-gradient(90deg,var(--gold-2),#e3c77e)}',
      '.mu-slots{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-top:10px}',
      '.mu-slot{border:1px solid var(--line-soft);border-radius:10px;padding:10px 12px;background:rgba(255,255,255,.02)}',
      '.mu-slot.is-live{border-color:rgba(201,162,74,.55);background:var(--gold-bg,rgba(201,162,74,.08))}',
      '.mu-slot .mu-when{font-size:calc(14.5px * var(--ui-scale, 1));text-transform:uppercase;letter-spacing:.08em;color:var(--ink-3);font-weight:700}',
      '.mu-slot .mu-nm{font-weight:800;color:var(--ink);margin:2px 0}',
      '.mu-slot .mu-what{font-size:calc(14.5px * var(--ui-scale, 1));color:var(--ink-3)}',
      /* the pre-selection footer — one line, never taller than the card it sits in */
      '.mu-slot.is-mine{border-color:rgba(201,162,74,.45)}',
      '.mu-slot .mu-foot{margin-top:8px}',
      '.mu-slot .mu-pledged{display:flex;align-items:center;gap:5px;font-size:calc(14.5px * var(--ui-scale, 1));font-weight:700;',
      '  color:var(--gold-2);letter-spacing:.02em}',
      '.mu-slot .mu-pledge{width:100%}',
      /* ── the shared modal (reuses the renown/daily scrim pattern) ── */
      '.hr-mu-scrim{position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.72);backdrop-filter:blur(3px);',
      '  display:flex;align-items:center;justify-content:center;padding:18px}',
      '.hr-mu-wrap{background:var(--surface-2,#221b14);border:1px solid var(--line);border-radius:14px;',
      '  max-width:520px;width:100%;padding:20px;box-shadow:0 24px 60px -20px rgba(0,0,0,.9)}',
      '.hr-mu-wrap h3{margin:0 0 4px;font-family:var(--f-display,inherit);font-size:calc(21px * var(--ui-scale, 1));color:var(--ink)}',
      '.hr-mu-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}',
      /* mobile: the More button is the only spare surface in a 6-tab nav */
      '.bn-btn.more.hr-mu-alert{position:relative}',
      '.bn-btn.more.hr-mu-alert::after{content:"";position:absolute;top:6px;right:calc(50% - 16px);',
      '  width:7px;height:7px;border-radius:50%;background:var(--gold-2);box-shadow:0 0 0 2px rgba(0,0,0,.45)}'
    ].join('');
    document.head.appendChild(s);
  }

  // ── The topbar pill ─────────────────────────────────────────
  // Injected as the first child of .top-stats so the topbar reads left-to-right
  // as "what's happening" before "what I own". It ticks its own text node at
  // 1Hz and NEVER calls updateTopbar(), which writes five elements and is
  // called from a dozen places.
  function ensurePill() {
    var host = document.querySelector('.topbar .top-stats');
    if (!host) return null;
    var el = document.getElementById('hr-muster-pill');
    if (!el) {
      ensureStyle();
      el = document.createElement('button');
      el.id = 'hr-muster-pill';
      el.type = 'button';
      el.title = 'World event — the muster';
      el.innerHTML = '<span class="mp-ic"></span><span class="mp-lab">Rally</span><span class="mp-t"></span>';
      el.addEventListener('click', openModal);
      host.insertBefore(el, host.firstChild);
    }
    var ic = el.querySelector('.mp-ic');
    if (ic && !ic.querySelector('.hr-glyph')) { var g = gly('uiEvent', 14, 'currentColor'); if (g) ic.innerHTML = g; }
    return el;
  }

  var lastToastAt = { t15: null, t5: null };
  function tickPill() {
    // The pledge answers itself the second its window opens, which is why this
    // rides the 1Hz pill tick rather than the 60s settle pass: a player who is
    // here at 13:00:01 should already be mustered, not a minute late.
    // autoJoinDecision() is pure and returns on its first line in every state
    // but the one that matters, so this costs nothing on an ordinary session.
    try { var pj = autoJoinTick(); if (pj && pj.catch) pj.catch(function () {}); } catch (e) {}
    var el = ensurePill(); if (!el) return;
    var s = pillState();
    var t = el.querySelector('.mp-t'), lab = el.querySelector('.mp-lab');
    if (t && t.textContent !== s.copy) t.textContent = s.copy;
    /* b285 (player's-eye QA, Tyler's screenshot): the pill printed the static
       "RALLY" label AND copy that already begins "Rally in …", so the topbar read
       "RALLY Rally in 10:19:42". Hide the label whenever the copy already leads
       with it — the countdown says what it is. */
    if (lab) {
      var _redundant = /^\s*(rally|answering)\b/i.test(s.copy || '');
      lab.style.display = (s.state === 'live' || s.state === 'reward' || s.state === 'signedout' || _redundant) ? 'none' : '';
    }
    if (el.getAttribute('data-tone') !== s.tone) el.setAttribute('data-tone', s.tone);
    if (el.getAttribute('data-state') !== s.state) el.setAttribute('data-state', s.state);

    // Mobile: state dot on the More button whenever there is something to do.
    var more = document.querySelector('.bn-btn.more');
    if (more) more.classList.toggle('hr-mu-alert', s.state === 'live' || s.state === 'reward');

    // T-15 / T-5 heralds, once each, and only for a muster you can still join.
    if (s.state === 'imminent' && !joinedThisWindow()) {
      var n = nextWindow(); if (n) {
        var left = n.startMs - now();
        if (left <= IMMINENT_MS && left > IMMINENT_MS - 65000 && lastToastAt.t15 !== n.eventKey) {
          lastToastAt.t15 = n.eventKey;
          if (heraldsOn()) toast(n.event.name + ' musters in 15 minutes — ' + n.event.what + '.', 'info');
        }
        if (left <= 300000 && left > 240000 && lastToastAt.t5 !== n.eventKey) {
          lastToastAt.t5 = n.eventKey;
          if (heraldsOn()) toast(n.event.name + ' musters in 5 minutes.', 'info');
        }
      }
    }
  }
  function heraldsOn() {
    var G = window.G;
    return !(G && G.settings && G.settings.musterHeralds === false);
  }

  // ── The modal ───────────────────────────────────────────────
  function closeModal() { var m = document.querySelector('.hr-mu-scrim'); if (m) m.remove(); }
  function scrim(html, onClick) {
    ensureStyle(); closeModal();
    var s = document.createElement('div');
    s.className = 'hr-mu-scrim';
    s.innerHTML = '<div class="hr-mu-wrap">' + html + '</div>';
    s.addEventListener('click', function (e) {
      if (e.target === s || e.target.getAttribute('data-close')) { closeModal(); return; }
      if (onClick) onClick(e);
    });
    document.body.appendChild(s);
    return s;
  }

  function openConfirm(w) {
    scrim(
      '<h3>Join ' + esc(w.event.name) + '?</h3>' +
      '<div class="tiny muted" style="margin-bottom:6px">This is your muster for today. ' +
      'You can join one muster per day, and there is no leaving — the other slot will be closed to you.</div>' +
      '<div class="tiny muted">Contributes: <b>' + esc(w.event.what) + '</b>. ' +
      'You keep the Blessing either way.</div>' +
      '<div class="hr-mu-row"><button class="btn btn-primary btn-sm" data-mu="confirm">Join the muster</button>' +
      '<button class="btn btn-sm" data-close="1">Not today</button></div>',
      function (e) {
        if (e.target.getAttribute('data-mu') === 'confirm') { closeModal(); join(true); }
      });
  }

  function openModal() {
    var s = pillState(), st = ensureState(), live = liveWindow(), slots = displaySlots();
    var body = '';

    if (s.state === 'signedout') {
      body = '<h3>The Rally</h3><div class="tiny muted">Sign in to join the realm’s rally and its shared goal.</div>';
    } else if (live) {
      var ev = live.event;
      body = '<h3>' + esc(ev.name) + '</h3>' +
        '<div class="tiny muted" style="margin-bottom:8px">' + esc(ev.desc) + '</div>' +
        '<div class="tiny" style="margin-bottom:10px">Contributes: <b style="color:var(--gold-2)">' + esc(ev.what) + '</b> · ' +
        fmtClock(live.endMs - now()) + ' left</div>' + communityHtml();
      if (joinedThisWindow()) {
        body += '<div class="tiny" style="margin-top:8px">Your contribution: <b>' + st.points.toLocaleString() + '</b> points' +
          (st.server ? '' : ' <span class="muted">(solo muster)</span>') + '</div>' +
          '<div class="hr-mu-row">' +
          (st.rallied ? '<button class="btn btn-sm" disabled>Rallied</button>'
                      : '<button class="btn btn-primary btn-sm" data-mu="rally">Rally</button>') +
          '<button class="btn btn-sm" data-mu="events">Open Events</button></div>';
      } else if (st.dayKey === live.dayKey && st.eventKey) {
        body += '<div class="tiny muted" style="margin-top:8px">You already answered a muster today. ' +
          'Next muster ' + fmtClock((nextWindow() ? nextWindow().startMs : now()) - now()) + '.</div>';
      } else {
        body += '<div class="hr-mu-row"><button class="btn btn-primary btn-sm" data-mu="join">Join the muster</button>' +
          '<button class="btn btn-sm" data-mu="events">Open Events</button></div>' +
          (isSignedIn() ? '' : '<div class="tiny muted" style="margin-top:8px">Playing offline — you can still muster ' +
            'solo and take the base chest. Sign in for the realm’s shared goal and the Rally Seal.</div>');
      }
    } else {
      body = '<h3>The Rally</h3>' +
        '<div class="tiny muted">Twice a day the realm calls a muster. Join one per day, play as you '
        + 'normally would, and take a chest when it closes.</div>' + slotsHtml(slots);
      if (s.state === 'reward') {
        body += '<div class="hr-mu-row"><button class="btn btn-primary btn-sm" data-mu="claim">Claim your chest</button></div>';
      }
    }
    scrim(body + '<div class="hr-mu-row"><button class="btn btn-sm" data-close="1">Close</button></div>', modalAction);
  }

  function modalAction(e) {
    var el = e.target.closest ? e.target.closest('[data-mu]') : e.target;
    var a = el && el.getAttribute ? el.getAttribute('data-mu') : null;
    if (!a) return;
    if (a === 'pledge') {
      var key = el.getAttribute('data-key');
      var inModal = !!document.querySelector('.hr-mu-scrim');
      if (key) {
        var pr = pledge(key);
        if (pr && pr.then) pr.then(function (ok) { if (ok && inModal) openModal(); });
      }
      return;
    }
    if (a === 'join')   { closeModal(); join(false); }
    if (a === 'rally')  { closeModal(); rally(); }
    if (a === 'claim')  { closeModal(); claim(); }
    if (a === 'events') { closeModal(); if (typeof window.showTab === 'function') window.showTab('events'); }
  }

  function communityHtml() {
    if (!community || !community.goal) {
      return '<div class="tiny muted">Solo muster — the shared community bar needs a signed-in session.</div>';
    }
    var pct = Math.max(0, Math.min(100, Math.round(100 * community.progress / community.goal)));
    return '<div class="mu-bar"><i style="width:' + pct + '%"></i></div>' +
      '<div class="tiny muted" style="margin-top:4px">' + community.progress.toLocaleString() + ' / ' +
      community.goal.toLocaleString() + ' · ' + community.participants + ' mustered' +
      (community.met ? ' · <b style="color:var(--gold-2)">the realm held</b>' : '') + '</div>';
  }

  // The other one of today's two rallies — the thing "Switch to …" points at.
  // Null once it can no longer be taken (its own window opened, or ours did and
  // the day is committed), so the button can never offer a move that would be
  // refused the moment it was clicked.
  function switchTarget(ctx) {
    var pl = ctx.pledge;
    if (!pl || pl.dayKey !== ctx.todayKey) return null;
    var all = ctx.windows || [];
    for (var i = 0; i < all.length; i++) {
      var w = all[i];
      if (w.dayKey !== ctx.todayKey || w.eventKey === pl.eventKey) continue;
      if (canPledge(w.eventKey, ctx).ok) return w;
    }
    return null;
  }

  function slotsHtml(slots) {
    var n = now();
    var todayLocal = new Date(n).toDateString();
    var ctx = pledgeContext(n), pl = ctx.pledge;
    var supported = pledgeSupported();
    return '<div class="mu-slots">' + slots.map(function (w) {
      var d = new Date(w.startMs);
      var when = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (d.toDateString() !== todayLocal) when = 'Tomorrow ' + when;
      var isLive = n >= w.startMs && n < w.endMs;
      var past = n >= w.endMs;
      var mine = !!(pl && pl.eventKey === w.eventKey);
      var can = canPledge(w.eventKey, ctx);
      var foot = '';
      if (!supported) {
        foot = '';                                   // the affordance is simply not there
      } else if (mine) {
        // THE SWITCH (b231). The choice lives on the card that holds it, and
        // it names the rally it would move to — "Switch to The Deep Seam" is a
        // decision a player can make without opening anything else. It is
        // present until YOUR window opens; after that canPledge() answers
        // 'locked' and the line below simply states the plan.
        var alt = switchTarget(ctx);
        foot = '<div class="mu-foot"><div class="mu-pledged">' +
          gly('uiBanner', 12, 'currentColor') + '<span>You answer this one</span></div>' +
          (alt ? '<button class="btn btn-sm mu-pledge" data-mu="pledge" data-key="' + esc(alt.eventKey) +
                 '">Switch to ' + esc(alt.event.name) + '</button>' : '') +
          '</div>';
      } else if (can.ok && !(pl && pl.dayKey === ctx.todayKey)) {
        foot = '<div class="mu-foot"><button class="btn btn-sm mu-pledge" data-mu="pledge" data-key="' +
          esc(w.eventKey) + '">I’ll answer this one</button></div>';
      }
      return '<div class="mu-slot' + (isLive ? ' is-live' : '') + (mine ? ' is-mine' : '') + '">' +
        '<div class="mu-when">' + (isLive ? 'Live now' : (past ? 'Closed' : when)) + '</div>' +
        '<div class="mu-nm">' + gly(w.event.glyph, 14, 'var(--gold-2)') + ' ' + esc(w.event.name) + '</div>' +
        '<div class="mu-what">' + esc(w.event.what) + '</div>' + foot + '</div>';
    }).join('') + '</div>' + pledgeNote(ctx, slots, supported);
  }

  // One honest line under the two slots. It must never promise more than the
  // consolation actually is — half of the BASE band's themed table, and
  // nothing else. b231: it also states the auto-join rule, because that rule is
  // the whole reason to mark a rally in the first place.
  //
  // There is NO implementation-state copy here, at any branch. If the server
  // cannot hold a pledge the affordance is gone and this says one plain
  // sentence about the feature, never a word about devices or storage.
  function pledgeNote(ctx, slots, supported) {
    var pl = ctx.pledge;
    var half = chestSummary(absentChest(pl ? pl.eventKey : null, ABSENT_BAND.gold, ABSENT_BAND.gems));
    if (!supported) {
      return isSignedIn()
        ? '<div class="tiny muted" style="margin-top:8px">' + UNAVAILABLE + '</div>'
        : '';
    }
    if (pl) {
      var ev = eventForKey(pl.eventKey);
      return '<div class="tiny muted" style="margin-top:8px">You have answered <b>' +
        esc(ev ? ev.name : 'a rally') + '</b>. Be online when it opens and you join automatically, ' +
        'for the full chest. If the whole window passes without you, half honors (' + esc(half) +
        ') are waiting when you return.</div>';
    }
    var any = (slots || []).some(function (w) { return canPledge(w.eventKey, ctx).ok; });
    if (ctx.joinedToday) return '';
    return '<div class="tiny muted" style="margin-top:8px">' + (any
      ? 'Mark the rally you mean to answer and you are entered automatically if you are online when ' +
        'it opens. Miss the window entirely and you still take half honors (' + esc(half) + ').'
      : 'Tomorrow’s rallies open for answering at the day roll.') + '</div>';
  }

  // ════════════════════════════════════════════════════════════
  // 7 · DISCOVERABILITY — the Events destination (backlog #14)
  // ════════════════════════════════════════════════════════════
  // Everything scheduled or instanced lives in ONE top-level place: the muster,
  // the Blessing, the weekly clan boss and the dungeons. Before this, dungeons
  // were reachable only through a secondary button in the combat ribbon, and
  // the flagship SOCIAL feature — the weekly clan raid — was rendered inside
  // that same hidden combat sub-panel. A player could be in a clan for a month
  // and never learn raids exist.
  function ensurePanel() {
    var main = document.querySelector('main.main');
    if (!main) return null;
    var p = document.getElementById('panel-events');
    if (!p) {
      ensureStyle();
      p = document.createElement('section');
      p.className = 'panel';
      p.id = 'panel-events';
      p.innerHTML =
        '<div class="ev-sec" id="hr-muster-card"></div>' +
        '<div class="ev-sec" id="hr-ev-blessing"><div class="ev-eyebrow">Today’s blessing</div></div>' +
        '<div class="ev-sec" id="hr-events-raid"><div class="ev-eyebrow">Weekly clan boss</div></div>' +
        // No eyebrow here: the dungeon list brings its own three section
        // headings ("Dungeons (Solo)" …), and a label above a label is noise.
        '<div class="ev-sec" id="hr-events-dungeons"></div>';
      main.appendChild(p);
    }
    // Relocate the dungeon list into Events. It stops being a PANEL (it has no
    // nav entry of its own any more) and becomes a section of this one, which
    // is also what frees #hr-raid-card from the grid that collapsed it.
    var dgn = document.getElementById('panel-dungeons');
    var host = document.getElementById('hr-events-dungeons');
    if (dgn && host && dgn.parentNode !== host) {
      dgn.classList.remove('panel', 'active');
      host.appendChild(dgn);
    }
    // nav-consolidation.js boots ~120ms before this module, so on a cold load
    // it can inject its "← Back to Combat" escape hatch into a panel that is
    // about to stop being a dead end. Remove it once; its own guard keeps it
    // from coming back now that #panel-events exists.
    var back = document.getElementById('hr-dungeons-back');
    if (back) back.remove();
    return p;
  }

  function renderMusterCard() {
    var host = document.getElementById('hr-muster-card');
    if (!host) return;
    /* b385: the muster is a clan-branded social surface deferred with the rest of
       the clan program — while CLAN_LAUNCHED is false it shows the SAME coming-soon
       card as the clan panel and the weekly boss, never a Join / Rally / Claim
       control. Client GATE only, behind the one flag; flip CLAN_LAUNCHED → the real
       card below returns. */
    var CL = window.HearthriseClans;
    if (CL && typeof CL.clanLaunched === 'function' && !CL.clanLaunched()) {
      host.innerHTML = '<div class="ev-eyebrow">The muster</div>' +
        ((typeof CL.comingSoonHtml === 'function')
          ? CL.comingSoonHtml('The Muster',
              'A rolling call-to-arms where the whole realm rallies on a shared goal ' +
              'in a timed window, then splits the spoils. It opens alongside clans, ' +
              'once there are enough of you online for a muster to feel like a crowd. ' +
              'Keep rising solo — you’ll answer the horn when it sounds.')
          : '');
      return;
    }
    var s = pillState(), st = ensureState(), live = liveWindow(), slots = displaySlots();
    var head = live ? live.event : (nextWindow() ? nextWindow().event : EVENTS[0]);
    var cta = '';
    if (live && joinedThisWindow()) {
      cta = (st.rallied ? '<button class="btn btn-sm" disabled>Rallied</button>'
                        : '<button class="btn btn-primary btn-sm" data-mu="rally">Rally</button>');
    } else if (live && !(st.dayKey === live.dayKey && st.eventKey)) {
      cta = '<button class="btn btn-primary btn-sm" data-mu="join">Join the muster</button>';
    }
    if (s.state === 'reward') cta = '<button class="btn btn-primary btn-sm" data-mu="claim">Claim your chest</button>';

    host.innerHTML =
      '<div class="ev-eyebrow">The muster</div>' +
      '<div class="card"><div class="card-head">' +
        '<div class="card-title">' + gly(head.glyph, 16, 'var(--gold-2)') + ' ' + esc(head.name) + '</div>' +
        '<div class="card-sub">' + esc(s.copy) + '</div></div>' +
      '<div class="card-body" style="padding:12px 14px">' +
        '<div class="tiny muted" style="margin-bottom:8px">' + esc(head.desc) + '</div>' +
        (live ? communityHtml() : '') +
        (joinedThisWindow() ? '<div class="tiny" style="margin-top:6px">Your contribution: <b>' +
            st.points.toLocaleString() + '</b> points · +' + Math.round(LIVE_XP_AURA * 100) + '% all XP while mustered</div>' : '') +
        slotsHtml(slots) +
        (cta ? '<div class="hr-mu-row">' + cta + '</div>' : '') +
      '</div></div>';
    if (!host.__wired) {
      host.__wired = true;
      host.addEventListener('click', modalAction);
    }
  }

  function renderPanel() {
    var p = document.getElementById('panel-events');
    if (!p || !p.classList.contains('active')) return;
    renderMusterCard();
    if (window.HearthriseWorldEvents && typeof window.HearthriseWorldEvents.renderBlessing === 'function') {
      try { window.HearthriseWorldEvents.renderBlessing(); } catch (e) {}
    }
    if (window.HearthriseRaids && typeof window.HearthriseRaids.render === 'function') {
      try { var r = window.HearthriseRaids.render(); if (r && r.catch) r.catch(function () {}); } catch (e) {}
    }
    if (typeof window.renderDungeons === 'function') { try { window.renderDungeons(); } catch (e) {} }
  }
  function renderAll() { tickPill(); renderPanel(); }

  function renderEvents() { ensurePanel(); renderPanel(); }

  // ════════════════════════════════════════════════════════════
  // 8 · BOOT
  // ════════════════════════════════════════════════════════════
  function wireShowTab() {
    // b405: the 'dungeons' → 'events' ROUTE REMAP used to live here, transforming
    // showTab's argument BEFORE the base ran — the one wrapper in the whole chain
    // that mutated its input, which a post-tap cannot do. It now lives in the base
    // showTab alias table (legacy.js), the single home for route remaps, so every
    // legacy caller (combat ribbon, scavenger, deep links) still lands on Events.
    // This tap only ensures the panel exists and repaints it; it fires on both the
    // 'dungeons' and 'events' entry names (the tap sees the ORIGINAL argument).
    window.HearthriseShowTab.wrapShowTab('muster-events', function (name) {
      if (name === 'events' || name === 'dungeons') { ensurePanel(); setTimeout(renderPanel, 0); }
    });
  }

  // The mobile More sheet. `bindEvents()` only binds `.nav-btn,.bn-btn`, so the
  // static `#more-modal .tap[data-tab]` buttons have never had a click handler
  // of their own — the two entries that work (Bounty, Stable) each attach one
  // when they inject themselves. One delegated listener fixes the whole sheet
  // rather than adding a 3rd one-off, which is the same discoverability failure
  // #14 is about: a route that exists in the markup and does nothing.
  function wireMoreSheet() {
    if (window.__musterMoreHooked) return;
    var sheet = document.getElementById('more-modal');
    if (!sheet) return;
    window.__musterMoreHooked = true;
    sheet.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.tap[data-tab]');
      if (!b) return;
      var tab = b.getAttribute('data-tab');
      if (!tab || tab === 'more') return;
      sheet.classList.remove('show');
      if (typeof window.showTab === 'function') window.showTab(tab);
    });
  }

  // Contribution: wrap the counter the game already fires everywhere.
  //
  // b222: routed through window.wrapUpdateDaily('muster', …) — the named
  // wrapper chain (legacy.js SEAM 4). The chain owns the idempotency roster
  // now (updateDaily.__wrappedBy), so castle Labour can wrap the same seam
  // under its own name without either system inventing a private global that
  // the other cannot see. The retry-until-defined loop stays: script order
  // does not guarantee legacy.js has run. The local flag stays too, so a
  // double boot() short-circuits BEFORE the chain throws.
  function wireCounters() {
    if (window.__musterCountersHooked) return;
    if (typeof window.wrapUpdateDaily !== 'function' || typeof window.updateDaily !== 'function') {
      setTimeout(wireCounters, 200); return;
    }
    window.__musterCountersHooked = true;
    window.wrapUpdateDaily('muster', function (type, amt) {
      addPoints(pointsFor(type, amt));
    });
  }

  function boot() {
    try {
      ensureStyle();
      ensureState();
      ensurePill();
      ensurePanel();
      wireShowTab();
      wireCounters();
      wireMoreSheet();
      // The Muster Seal has no drop table, so nothing else registers its art.
      window._itemPath = window._itemPath || {};
      if (!window._itemPath.muster_seal) window._itemPath.muster_seal = 'assets/icons-bundle/medieval/muster-seal.svg';
      var origGlyphKey = window.itemGlyphKey;
      if (typeof origGlyphKey === 'function' && !window.__musterGlyphHooked) {
        window.__musterGlyphHooked = true;
        window.itemGlyphKey = function (id) {
          if (id === 'muster_seal') return 'uiMedal';
          return origGlyphKey.apply(this, arguments);
        };
      }
      // pledgeTick's first pass hydrates, which is also what PROBES the pledge
      // RPCs. Re-render once it settles so an un-migrated project drops the
      // affordance on its own rather than after the player's first click.
      //
      // ── b349: HELD UNTIL THERE IS A TOKEN TO SIGN IT WITH ──────────────
      // Both halves of this chain are authenticated-only RPCs (hr_server_now,
      // hr_rally_pledge_state) and both used to fire right here — 420ms after
      // DOMContentLoaded, which is BEFORE auth.js can publish a session,
      // because auth.js has to resolve a CDN import() of supabase-js first.
      // Measured on a warm local server: the session landed 94–1,040ms too
      // late, on every run. So hr_server_now went out with the anon key in the
      // Authorization header and Postgres refused it — 3,196 times a day, 61%
      // of every database error the project logged. hydratePledge's own
      // isSignedIn() check meant it lost the same race quietly instead of
      // loudly: it did nothing at boot and the probe sat un-run until the 60s
      // tick, which is the exact "settle before the player's first click"
      // promise the comment above makes.
      //
      // whenSignedIn() holds it until a session exists and NEVER runs it if
      // one never does. If the seam itself is missing (only reachable with a
      // half-stale service-worker payload mid-deploy) the work is DROPPED, not
      // run unguarded: skew is 0 for any healthy device clock, so the cost is
      // nothing and it heals on the next load. Fail closed.
      var holdForSession = (window.HearthriseGate && window.HearthriseGate.whenSignedIn) || null;
      if (holdForSession) {
        holdForSession(function () {
          syncClock().then(function () { tickPill(); return pledgeTick(); })
                     .then(function () { renderAll(); }).catch(function () {});
        }, 'muster:clock+pledge');
      }
      tickPill();
      setInterval(tickPill, 1000);
      setInterval(flush, FLUSH_MS);
      // Settlement is cheap when nothing is owed (a pure outcome check that
      // returns 'hold'/'no_pledge' without touching the network), so a minute
      // is frequent enough to catch a day roll mid-session and quiet enough to
      // add no traffic on an ordinary session.
      setInterval(pledgeTick, 60000);
    } catch (e) { try { console.warn('[muster] boot failed', e); } catch (e2) {} }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 420); });
  else setTimeout(boot, 420);

  window.HearthriseMuster = {
    EVENTS: EVENTS,
    SLOT_UTC_HOURS: SLOT_UTC_HOURS, WINDOW_MIN: WINDOW_MIN,
    GOAL_PER_PLAYER: GOAL_PER_PLAYER, MIN_GOAL: MIN_GOAL,
    CALL_CLAMP: CALL_CLAMP, TOTAL_CAP: TOTAL_CAP, LIVE_XP_AURA: LIVE_XP_AURA,
    liveAura: liveAura,   // b228: what the aura pays right now, for power-budget.js
    SOLO_BAND: SOLO_BAND, ABSENT_BAND: ABSENT_BAND, ABSENT_SHARE: ABSENT_SHARE,
    // clock + schedule
    now: now, serverSkewMs: serverSkewMs, syncClock: syncClock, dayCloseMs: dayCloseMs,
    eventFor: eventFor, eventForKey: eventForKey, eventIndex: eventIndex,
    liveWindow: liveWindow, nextWindow: nextWindow, todaysWindows: todaysWindows, displaySlots: displaySlots,
    todayKey: todayKey,
    // state
    ensureState: ensureState, rewardReady: rewardReady, joinedThisWindow: joinedThisWindow,
    pillState: pillState, computeState: computeState,
    // actions
    join: join, rally: rally, claim: claim, flush: flush,
    // pre-selection
    pledge: pledge, settlePledge: settlePledge, getPledge: readPledge,
    hydratePledge: hydratePledge, canPledge: canPledge, pledgeSupported: pledgeSupported,
    // themed chests (b231)
    THEMES: THEMES, CHEST_ITEM_SHARE: CHEST_ITEM_SHARE, CHEST_XP_SHARE: CHEST_XP_SHARE,
    XP_PER_GOLD: XP_PER_GOLD, themedChest: themedChest, chestValue: chestValue,
    chestSummary: chestSummary, absentChest: absentChest,
    // auto-join (b231)
    autoJoinDecision: autoJoinDecision, autoJoin: autoJoinTick,
    _autoJoinContext: autoJoinContext, _sessionOnline: sessionOnline,
    _switchTarget: switchTarget, _noteRpc: noteRpc, UNAVAILABLE: UNAVAILABLE,
    _forceSupport: function (v) { forcedSupport = (v == null) ? null : !!v; },
    // UI
    render: renderEvents, renderPill: tickPill, openModal: openModal,
    // Test seams for the beta clan-gate assertion (b385).
    _ensurePanel: ensurePanel, _renderMusterCard: renderMusterCard,
    // Server-contract seams — pure, no I/O. Exposed for the regression suite.
    _computeState: computeState, _fmtClock: fmtClock,
    _reduceJoin: reduceJoin, _reduceContribute: reduceContribute, _reduceClaim: reduceClaim,
    _payChest: payChest,
    _reducePledge: reducePledge, _reduceAbsence: reduceAbsence,
    _canPledge: canPledge, _pledgeOutcome: pledgeOutcome, _pledgeContext: pledgeContext,
    _writePledge: writePledge, _grantAbsent: grantAbsent, _adopt: adopt,
    _pointsFor: pointsFor, _addPoints: addPoints,
    _setSkew: function (ms) { skewMs = ms | 0; },
    _skewState: function () { return skewState; },
    _resetProbes: _resetProbes,
    _community: function (c) { if (arguments.length) community = c; return community; }
  };
})();
