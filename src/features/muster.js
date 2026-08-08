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
  var LIVE_XP_AURA    = 0.10;     // +10% all XP while mustered
  var SOLO_BAND       = { gold: 1500, gems: 2, seals: 0, band: 'answered' };

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
      desc: 'Feed the muster or it marches hungry.' },
    { id: 'all_hands',     name: 'The Muster of All Hands',  glyph: 'uiBanner',
      what: 'every activity, at half rate',
      sources: { kill_any: 0.5, gather: 0.5, harvest: 0.5, cooked: 0.5, smithed: 0.5, crafted: 0.5 },
      desc: 'Every hand in the realm, whatever it holds.' }
  ];

  // Points per unit of ordinary play. These piggyback the counters the game
  // ALREADY fires (updateDaily) — no new call sites, nothing to keep in sync.
  var POINTS = { kill_any: null /* 10 x tier */, gather: 4, harvest: 6, cooked: 12, smithed: 12, crafted: 12 };

  function W() { return window.HearthriseWorldEvents; }
  function hash(s) {
    if (W() && W()._hash) return W()._hash(s);
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
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
   *   joinedDayKey, joinedEventKey, joinedStartMs, todayKey, rewardReady, signedIn
   * @returns {{state,copy,tone,rank,cta}} — `rank` encodes the spec's precedence.
   */
  function computeState(o) {
    o = o || {};
    var live = o.live || null, next = o.next || null;
    var joinedToday = !!(o.joinedDayKey && o.joinedDayKey === o.todayKey && o.joinedEventKey);
    var joinedThis  = !!(live && o.joinedEventKey === live.eventKey);
    var toNext = next ? Math.max(0, next.startMs - o.nowMs) : 0;

    // 3 — live and joinable. The loudest the topbar is ever allowed to be.
    if (live && !joinedToday) {
      return { state: 'live', rank: 100, tone: 'gold-pulse',
               copy: 'LIVE · ' + fmtClock(live.endMs - o.nowMs) + ' left', cta: 'join' };
    }
    // 4 — live and you are in it.
    if (live && joinedThis) {
      return { state: 'mustered', rank: 90, tone: 'gold',
               copy: 'Mustered · ' + fmtClock(live.endMs - o.nowMs), cta: 'open' };
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
      return { state: 'imminent', rank: 50, tone: 'warm',
               copy: 'Muster in ' + fmtClock(toNext), cta: 'open' };
    }
    // 1 — upcoming.
    return { state: 'upcoming', rank: 10, tone: 'quiet',
             copy: next ? ('Muster in ' + fmtClock(toNext)) : 'Muster', cta: 'open' };
  }

  // Snapshot of everything computeState needs, read from live state.
  function stateContext(atMs) {
    var st = ensureState();
    var ms = (atMs == null) ? now() : atMs;
    var live = liveWindow(ms);
    return {
      nowMs: ms, live: live, next: nextWindow(ms), todayKey: dayKeyAt(ms),
      joinedDayKey: st.dayKey, joinedEventKey: st.eventKey, joinedStartMs: st.startMs,
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

  async function rpc(name, body) {
    var res = await fetch(cfg().url + '/rest/v1/rpc/' + name, {
      method: 'POST', headers: headers(true), body: JSON.stringify(body || {})
    });
    var json = null;
    try { json = await res.json(); } catch (e) { json = null; }
    return { status: res.status, ok: res.ok, json: json, headers: res.headers };
  }

  var JOIN_ERRORS = {
    already_joined: 'You already answered a muster today — the next one is tomorrow',
    not_live:       'No muster is live right now',
    stale_event:    'That muster has already closed',
    not_signed_in:  'Sign in to join the realm’s muster',
    network:        'Could not reach the server — try again in a moment'
  };
  var CLAIM_ERRORS = {
    already_claimed: 'You have already taken today’s muster chest',
    not_joined:      'You did not join a muster today',
    no_contribution: 'You joined but never contributed — no chest today',
    still_live:      'The muster is still running — claim when it closes',
    expired:         'That chest expired at the day roll',
    not_signed_in:   'Sign in to claim your muster chest',
    network:         'Could not reach the server — try again in a moment'
  };
  function joinErrorText(e)  { return JOIN_ERRORS[e]  || 'The server refused that join'; }
  function claimErrorText(e) { return CLAIM_ERRORS[e] || 'The server refused that claim'; }

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
      seals: out.held ? Math.max(0, Math.min(1, +out.seals || 0)) : 0
    };
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
    persist();
    return st;
  }

  function announceJoin(w) {
    toast('You answer ' + w.event.name + ' — +' + Math.round(LIVE_XP_AURA * 100) +
          '% all XP while the muster runs.', 'levelup');
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
    if (!joinedThisWindow()) { toast('Join the muster first', 'info'); return 0; }
    if (st.rallied) { toast('You have already rallied this muster', 'info'); return 0; }
    var R = window.HearthriseRaids;
    var roll = (R && typeof R.simulateStrike === 'function')
      ? R.simulateStrike({ def: 40, weak: 'sword' })
      : 600;
    var pts = Math.max(20, Math.floor(roll / 12));
    st.rallied = true;
    var got = addPoints(pts);
    persist();
    toast('You rally the muster — +' + got.toLocaleString() + ' to the realm’s effort', 'loot');
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
    if (st.server && isSignedIn() && !rpcMissing('world_event_claim')) {
      await flush();
      var r;
      try { r = await rpc('world_event_claim', { p_day_key: st.dayKey }); }
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

  // The reward. Gold, gems and AT MOST ONE Muster Seal. There is no branch
  // here that can produce a hearth_token — the IAP bond is never PvE-minted.
  function grant(d) {
    var G = window.G, st = ensureState();
    st.claimed = true;
    G.gold = (G.gold || 0) + (d.gold || 0);
    G.gems = (G.gems || 0) + (d.gems || 0);
    if (d.seals > 0 && typeof window.addItem === 'function') window.addItem('muster_seal', d.seals);
    var bits = [(d.gold || 0).toLocaleString() + 'g', (d.gems || 0) + ' gems'];
    if (d.seals > 0) bits.push(d.seals + ' Muster Seal');
    toast('Muster chest: +' + bits.join(', +') + (d.held ? ' — the realm held.' : ''), 'levelup');
    persist();
    if (typeof window.updateTopbar === 'function') try { window.updateTopbar(); } catch (e) {}
    renderAll();
  }

  // ── The live aura: +10% all XP while mustered ───────────────
  // Same thin additive wrapper world-events.js uses, for the same reason:
  // every existing system inherits it with no further wiring.
  var origGetBonus = window.getBonus;
  if (typeof origGetBonus === 'function') {
    window.getBonus = function (key) {
      var t = origGetBonus.apply(this, arguments);
      try { if (key === 'allXP' && joinedThisWindow()) t += LIVE_XP_AURA; } catch (e) {}
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
      '  font-size:12.5px;font-weight:700;letter-spacing:.02em;cursor:pointer;white-space:nowrap;',
      '  line-height:1.2;max-height:30px}',
      '#hr-muster-pill .mp-lab{text-transform:uppercase;font-size:10px;letter-spacing:.08em;color:var(--ink-3)}',
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
      '@media (max-width:540px){#hr-muster-pill{padding:4px 7px;font-size:11.5px}#hr-muster-pill .mp-lab{display:none}}',
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
      '.ev-eyebrow{font-family:var(--f-display,inherit);font-size:12px;font-weight:800;color:var(--gold-2);',
      '  letter-spacing:.14em;text-transform:uppercase;margin:0 0 8px}',
      '.mu-bar{height:10px;background:rgba(0,0,0,.35);border-radius:99px;overflow:hidden;border:1px solid var(--line-soft)}',
      '.mu-bar i{display:block;height:100%;background:linear-gradient(90deg,var(--gold-2),#e3c77e)}',
      '.mu-slots{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-top:10px}',
      '.mu-slot{border:1px solid var(--line-soft);border-radius:10px;padding:10px 12px;background:rgba(255,255,255,.02)}',
      '.mu-slot.is-live{border-color:rgba(201,162,74,.55);background:var(--gold-bg,rgba(201,162,74,.08))}',
      '.mu-slot .mu-when{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-3);font-weight:700}',
      '.mu-slot .mu-nm{font-weight:800;color:var(--ink);margin:2px 0}',
      '.mu-slot .mu-what{font-size:12px;color:var(--ink-3)}',
      /* ── the shared modal (reuses the renown/daily scrim pattern) ── */
      '.hr-mu-scrim{position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.72);backdrop-filter:blur(3px);',
      '  display:flex;align-items:center;justify-content:center;padding:18px}',
      '.hr-mu-wrap{background:var(--surface-2,#221b14);border:1px solid var(--line);border-radius:14px;',
      '  max-width:520px;width:100%;padding:20px;box-shadow:0 24px 60px -20px rgba(0,0,0,.9)}',
      '.hr-mu-wrap h3{margin:0 0 4px;font-family:var(--f-display,inherit);font-size:20px;color:var(--ink)}',
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
      el.innerHTML = '<span class="mp-ic"></span><span class="mp-lab">Muster</span><span class="mp-t"></span>';
      el.addEventListener('click', openModal);
      host.insertBefore(el, host.firstChild);
    }
    var ic = el.querySelector('.mp-ic');
    if (ic && !ic.querySelector('.hr-glyph')) { var g = gly('uiEvent', 14, 'currentColor'); if (g) ic.innerHTML = g; }
    return el;
  }

  var lastToastAt = { t15: null, t5: null };
  function tickPill() {
    var el = ensurePill(); if (!el) return;
    var s = pillState();
    var t = el.querySelector('.mp-t'), lab = el.querySelector('.mp-lab');
    if (t && t.textContent !== s.copy) t.textContent = s.copy;
    if (lab) lab.style.display = (s.state === 'live' || s.state === 'reward' || s.state === 'signedout') ? 'none' : '';
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
      body = '<h3>The Muster</h3><div class="tiny muted">Sign in to join the realm’s muster and its shared goal.</div>';
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
            'solo and take the base chest. Sign in for the realm’s shared goal and the Muster Seal.</div>');
      }
    } else {
      body = '<h3>The Muster</h3>' +
        '<div class="tiny muted">Twice a day the realm calls a muster. Join one per day, play as you '
        + 'normally would, and take a chest when it closes.</div>' + slotsHtml(slots);
      if (s.state === 'reward') {
        body += '<div class="hr-mu-row"><button class="btn btn-primary btn-sm" data-mu="claim">Claim your chest</button></div>';
      }
    }
    scrim(body + '<div class="hr-mu-row"><button class="btn btn-sm" data-close="1">Close</button></div>', modalAction);
  }

  function modalAction(e) {
    var a = e.target.getAttribute('data-mu');
    if (!a) return;
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

  function slotsHtml(slots) {
    var n = now();
    var todayLocal = new Date(n).toDateString();
    return '<div class="mu-slots">' + slots.map(function (w) {
      var d = new Date(w.startMs);
      var when = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (d.toDateString() !== todayLocal) when = 'Tomorrow ' + when;
      var isLive = n >= w.startMs && n < w.endMs;
      var past = n >= w.endMs;
      return '<div class="mu-slot' + (isLive ? ' is-live' : '') + '">' +
        '<div class="mu-when">' + (isLive ? 'Live now' : (past ? 'Closed' : when)) + '</div>' +
        '<div class="mu-nm">' + gly(w.event.glyph, 14, 'var(--gold-2)') + ' ' + esc(w.event.name) + '</div>' +
        '<div class="mu-what">' + esc(w.event.what) + '</div></div>';
    }).join('') + '</div>';
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
    var orig = window.showTab;
    if (typeof orig !== 'function') { setTimeout(wireShowTab, 120); return; }
    if (window.__musterTabHooked) return;
    window.__musterTabHooked = true;
    window.showTab = function (name) {
      // 'dungeons' is no longer a destination — it is a section of Events. Every
      // legacy caller (the combat ribbon, the scavenger, deep links) still works.
      if (name === 'dungeons') { ensurePanel(); name = 'events'; }
      if (name === 'events') ensurePanel();
      var r = orig.apply(this, arguments.length ? [name] : []);
      if (name === 'events') setTimeout(renderPanel, 0);
      return r;
    };
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
      syncClock().then(function () { tickPill(); }).catch(function () {});
      tickPill();
      setInterval(tickPill, 1000);
      setInterval(flush, FLUSH_MS);
    } catch (e) { try { console.warn('[muster] boot failed', e); } catch (e2) {} }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 420); });
  else setTimeout(boot, 420);

  window.HearthriseMuster = {
    EVENTS: EVENTS,
    SLOT_UTC_HOURS: SLOT_UTC_HOURS, WINDOW_MIN: WINDOW_MIN,
    GOAL_PER_PLAYER: GOAL_PER_PLAYER, MIN_GOAL: MIN_GOAL,
    CALL_CLAMP: CALL_CLAMP, TOTAL_CAP: TOTAL_CAP, LIVE_XP_AURA: LIVE_XP_AURA,
    // clock + schedule
    now: now, serverSkewMs: serverSkewMs, syncClock: syncClock,
    eventFor: eventFor, eventForKey: eventForKey, eventIndex: eventIndex,
    liveWindow: liveWindow, nextWindow: nextWindow, todaysWindows: todaysWindows, displaySlots: displaySlots,
    todayKey: todayKey,
    // state
    ensureState: ensureState, rewardReady: rewardReady, joinedThisWindow: joinedThisWindow,
    pillState: pillState, computeState: computeState,
    // actions
    join: join, rally: rally, claim: claim, flush: flush,
    // UI
    render: renderEvents, renderPill: tickPill, openModal: openModal,
    // Server-contract seams — pure, no I/O. Exposed for the regression suite.
    _computeState: computeState, _fmtClock: fmtClock,
    _reduceJoin: reduceJoin, _reduceContribute: reduceContribute, _reduceClaim: reduceClaim,
    _pointsFor: pointsFor, _addPoints: addPoints,
    _setSkew: function (ms) { skewMs = ms | 0; },
    _skewState: function () { return skewState; },
    _resetProbes: _resetProbes,
    _community: function (c) { if (arguments.length) community = c; return community; }
  };
})();
