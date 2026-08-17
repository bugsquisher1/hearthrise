// ============================================================
// src/features/clan-seat-ui.js  (b223, Wave 3b — THE VISIBLE CLAN SEAT)
//
// docs/design/clan-overhaul.md v2 ("The Clan Seat"), §16 build steps 4-8.
//
// WHAT THIS FILE IS
//   The half of the castle a player can see and touch: the hold band, the
//   "this week" strip, the five modals, the Work Order loop, the Tavern, and
//   the perk flow into getBonus. It is the renderer and the transport.
//
// WHAT IT IS NOT
//   It is NOT a second copy of the maths. Every number the spec states — CP,
//   Standing, the demand multiplier, the tier gates, the labour factor, the
//   labour target, the material scale, the time floor, upkeep, the Tavern
//   curves, the withdrawal delay, succession — comes from
//   window.HearthriseClanSeat (b222, under test). If a formula is needed here
//   and is not there, the fix is to ADD IT THERE, not to inline arithmetic in a
//   renderer. That was the explicit hand-off from the Wave-3a foundation and it
//   is the reason this file has no magic constants for anything the Designer
//   owns.
//
//   The few numbers that ARE declared here are the ones the spec puts on the
//   BUILDINGS (§7's perk column) and the power budget (§8) — i.e. the mapping
//   from a building level to a getBonus key. They live next to the getBonus
//   wiring that consumes them, and the b223 suite asserts them against §8.2's
//   audited table.
//
// FEATURE DETECTION — THE CLIENT SHIPS BEFORE THE MIGRATION
//   Identical contract to muster.js and to the b222 reducers: 404 / PGRST202 /
//   42883 / 42P01 → 'unsupported', which is NOT an error. Unsupported means
//   "the hold is not chartered on the server yet", and the panel says exactly
//   that and renders what it honestly knows (name, level, treasury from
//   clans.js) with no meters. There is no state in which this file draws a bar
//   whose number it does not have.
//
// THE HONEST LIMITATION (spec §12.3, CONFLICTS #8)
//   Deposits are SERVER-AUTHORITATIVE for currency, gates, rewards and rate,
//   and CLIENT-TRUSTED for item possession, clamped and audited. This file
//   removes the deposited stack from the local inventory only AFTER the server
//   accepts, so a refused deposit never costs the player anything — but nothing
//   here proves the player owned it. Never describe Phase A as fully
//   server-authoritative for materials.
// ============================================================
(function () {
  'use strict';

  function C() { return window.HearthriseClanSeat; }
  function G_() { return window.G || {}; }

  // ════════════════════════════════════════════════════════════
  // 1 · THE SIX BUILDINGS (§7) AND THE POWER BUDGET (§8)
  // ════════════════════════════════════════════════════════════
  // Each building does two things: a castle function and a member-facing perk.
  // The perk column is the ONLY place a building level becomes a getBonus
  // contribution, so the power budget is auditable by reading one table.
  //
  // The Great Hall is deliberately absent from this list: it IS castle_tier,
  // not a Work Order, and the migration's hr_castle_buildings agrees (five
  // rows, not six). Its perk is handled separately below.
  /* ── b228 · THE BONUS REBASE (docs/design/bonus-rebase.md §3.1, §4.2) ─────
     `per: 0.005` is deleted from the vocabulary. A grant of half a percent is
     not a reward, it is a rounding error with a price tag, and it was also the
     single worst offender against the new grammar ("every percentage a source
     grants is a whole number of percent").

     Each building now pays **+1% at level 4, at level 7 and at level 10** —
     three felt steps totalling +3%, in place of ten invisible ones totalling
     +5%. RUNGS is that ladder, written down rather than computed, so the
     Systems value and the panel copy read off one array.

     The War Room comes down hardest (10% → 3%) and loses nothing that matters:
     its real payload is the HUNT TIER CEILING — the highest Hunt the clan may
     declare — which is access, not throughput, and the panel copy leads with
     it (§5.3). The Tavern's `restedXp` percentage is gone entirely; Rested is
     now a flat XP quantum (see restedQuantum below). */
  var PERK_RUNGS = [4, 7, 10];
  var PERK_PER_RUNG = 0.01;
  function perkAtLevel(lv) {
    var n = 0, l = Math.max(0, Math.min(10, lv | 0));
    for (var i = 0; i < PERK_RUNGS.length; i++) if (l >= PERK_RUNGS[i]) n++;
    return n * PERK_PER_RUNG;
  }
  var BUILDINGS = [
    { id: 'treasury', name: 'Treasury', district: 'Keep',
      perk: 'goldFind', rungs: PERK_RUNGS,
      fn: 'Storehouse cap 2,500 x level per item, and −1% upkeep per level.',
      gold: 4000, bundle: { timber_beam: 30, iron_fitting: 15 } },
    { id: 'tavern', name: 'The Tavern', district: 'Village',
      perk: 'restedXp', rungs: PERK_RUNGS,
      fn: 'Feasts, Rested XP and the Board. Its power is bursty by design.',
      gold: 6000, bundle: { timber_beam: 40, iron_fitting: 20, field_ration: 60 } },
    { id: 'sawmill', name: 'Sawmill', district: 'Outer Ward',
      perk: 'craftSpeed', rungs: PERK_RUNGS,
      fn: '−0.4% Timber Beam input per level. It is built of Beams and it makes Beams cheaper.',
      gold: 5000, bundle: { timber_beam: 35, iron_fitting: 15 } },
    { id: 'smeltery', name: 'Smeltery', district: 'Outer Ward',
      perk: 'smithSpeed', rungs: PERK_RUNGS,
      fn: '−0.4% Iron Fitting input per level.',
      gold: 5000, bundle: { timber_beam: 25, iron_fitting: 25 } },
    { id: 'war_room', name: 'War Room', district: 'Keep',
      perk: 'raidPower', rungs: PERK_RUNGS,
      fn: 'Hosts the Hunt — it sets the highest Hunt tier the clan may declare, and hosts declaration and rally.',
      gold: 8000, bundle: { timber_beam: 40, iron_fitting: 30 } }
  ];
  function buildingDef(id) {
    for (var i = 0; i < BUILDINGS.length; i++) if (BUILDINGS[i].id === id) return BUILDINGS[i];
    return null;
  }

  /* The Great Hall's own perk. b228: +1% allXP per castle tier ABOVE THE
     FIRST → +4% at tier 5 (§3.1). Tier 1 is the castle merely existing; the
     ladder should pay for climbing it, not for arriving. */
  var GREAT_HALL_ALLXP_PER_TIER = 0.01;
  function greatHallAllXp(tier) {
    return GREAT_HALL_ALLXP_PER_TIER * Math.max(0, Math.min(5, tier | 0) - 1);
  }

  /* ── THE POWER BUDGET, ENFORCED (§8.1) ──────────────────────────────────
     Three numbers, and each one is a rule the spec states rather than a taste:

       CASTLE_KEY_CAP     no single getBonus key may receive more than +10%
                          FROM THE CASTLE (§8.1 rule 2). Binds on raidPower
                          today, which is exactly at the ceiling.
       CASTLE_TOTAL_CAP   permanent castle-derived throughput may not exceed
                          +25% aggregate at Phase-A max (§8.1 rule 1). Phase A
                          audits to +30 percentage points across five keys that
                          apply to five different activities; the aggregate
                          EFFECTIVE throughput figure the spec bounds is the sum
                          over keys a single action can use, which is at most
                          allXP + one speed key + goldFind = 15%. The suite
                          asserts the audit rather than trusting the comment.
       PERMANENT_ALLXP    the §8.3 fuse: homestead + renown + clan perks +
                          castle may not stack past +60% allXP.

     ── WHERE THE FUSE IS APPLIED, AND WHY THERE ──────────────────────────
     `getBonus` is a chain of six additive wrappers (rooms/renown/homestead in
     the base, then companions, buffs, clans, muster, world-events). A clamp
     placed anywhere in that chain either binds on TEMPORARY power it must not
     touch — §8.4 deliberately budgets a Tavern-10 Feast at Last Call ABOVE the
     permanent ceiling — or is escaped by whoever wraps last.

     So the fuse is not a blind clamp on the chain's output. It computes the
     PERMANENT stack directly from its four named sources, and when that stack
     would exceed the ceiling it reduces THE CASTLE'S OWN contribution. The
     newest system yields, which is precisely the standing design rule the spec
     writes down ("no future system may add more than +5% allXP"). Temporary
     power — feasts, food buffs, the muster aura, the daily blessing — is added
     outside the fuse and is never touched by it.

     Under today's real values the fuse does not bind: homestead 5 (castle
     capstone) + renown 22 + clan perks 0 (re-scoped in §8.3) + Great Hall 5 =
     32%. That is the point. It is a fuse, not a nerf. */
  /* ── b228 · THE FUSE LEFT THE CASTLE ─────────────────────────────────────
     Everything the comment above says about WHERE a clamp can live is still
     true, and the conclusion it drew was wrong: the castle cannot police a
     chain it sits in the middle of. `fuseAllXp` reduced only layer 4's own
     contribution, and layers 5 (muster) and 6 (blessings) — plus companions
     and food buffs — were added afterwards and were never policed at all. It
     also policed exactly one key, which is how `smithSpeed` reached +90%
     unnoticed.

     The budget now lives in features/power-budget.js, installed as the FINAL
     wrapper in the chain, where nothing can be added after it: permanent
     ≤ 0.20 per key, temporary ≤ 0.15 per key, total ≤ 0.30 per key
     (bonus-rebase.md §2.2, §4.1).

     So `fuseAllXp` and `CASTLE_TOTAL_CAP` retire — a mid-chain fuse that a
     later wrapper escapes is a false assurance written into the code, and the
     honest move is to delete it rather than leave two half-clamps disagreeing.
     `CASTLE_KEY_CAP` stays and comes to 0.05, because it is not a fuse: it is
     the castle's OWN share of the budget (§2.2 — "a castle wing at L10 is
     worth 3%"), enforced at the source that grants it, which is the one place
     a share can be enforced honestly. */
  var CASTLE_KEY_CAP = 0.05;

  // ════════════════════════════════════════════════════════════
  // 2 · TRANSPORT (the muster.js contract, verbatim)
  // ════════════════════════════════════════════════════════════
  function cfg() { return (window.HearthriseSupabase && window.HearthriseSupabase.getConfig && window.HearthriseSupabase.getConfig()) || null; }
  function session() { return (window.HearthriseAuth && window.HearthriseAuth.getSession && window.HearthriseAuth.getSession()) || null; }
  function signedIn() { var s = session(); return !!(s && s.user && s.access_token && cfg()); }
  function headers() {
    var c = cfg(), s = session();
    return {
      'apikey': c.anonKey,
      'Authorization': 'Bearer ' + ((s && s.access_token) || c.anonKey),
      'Content-Type': 'application/json'
    };
  }
  // One probe per RPC. A NEGATIVE result expires after ten minutes so a session
  // left open across the migration heals itself without a reload.
  var probe = {};
  function rpcMissing(n) { var p = probe[n]; return !!(p && p.known === false && (Date.now() - p.at) < 600000); }
  function noteRpc(n, present) { probe[n] = { known: present, at: Date.now() }; }

  async function rpc(name, body) {
    var res = await fetch(cfg().url + '/rest/v1/rpc/' + name, {
      method: 'POST', headers: headers(), body: JSON.stringify(body || {})
    });
    var json = null;
    try { json = await res.json(); } catch (e) { json = null; }
    return { status: res.status, json: json };
  }
  // Every clan-seat RPC answers the same {ok:boolean,…} envelope, so there is
  // one call helper and it returns the b222 reducer's verdict.
  async function call(name, body, pick) {
    if (!signedIn() || rpcMissing(name)) return { action: 'unsupported' };
    var r;
    try { r = await rpc(name, body); }
    catch (e) { return { action: 'fail', error: 'network', message: C().errorText('network') }; }
    var d = C().reduceEnvelope(r.status, r.json, pick || function (o) { return { out: o }; });
    noteRpc(name, d.action !== 'unsupported');
    return d;
  }

  // ════════════════════════════════════════════════════════════
  // 3 · SEAT STATE — one read for the whole panel
  // ════════════════════════════════════════════════════════════
  // clan_seat_read applies the lazy upkeep settle and the lazy CP decay before
  // it answers, which is what makes "no cron" honest: the state is correct at
  // the moment somebody looks at it.
  var _seat = null;        // the last accepted clan_seat_read payload
  var _seatClan = null;    // which clan id it describes
  var _support = 'unknown';// unknown | live | unsupported | signedout
  var _reading = null;

  /* `_clanStub` exists so the regression suite can render every state of this
     panel — tier 1 through 5, dormant, strained, un-migrated — without a live
     Supabase project and a real clan. It is null in every real session and the
     only writer is the exported test seam. */
  var _clanStub = null;
  function myClanObj() {
    if (_clanStub) return _clanStub;
    return (window.HearthriseClans && window.HearthriseClans.myClan && window.HearthriseClans.myClan()) || null;
  }
  function clanId() { var c = myClanObj(); return (c && c.id) || null; }
  function seat() { return (_seat && _seatClan && _seatClan === clanId()) ? _seat : null; }
  function supported() { return _support === 'live'; }

  function upgrades() { var s = seat(); return (s && s.upgrades) || {}; }
  function level(id) {
    var u = upgrades();
    var v = Number(u[id]);
    return (isFinite(v) && v > 0) ? Math.floor(v) : 0;
  }
  function castleTier() { var s = seat(); return s ? Math.max(1, s.castle_tier | 0) : 1; }
  function upkeepState() { var s = seat(); return (s && s.upkeep_state) || 'active'; }

  async function readSeat(force) {
    var id = clanId();
    if (!id) { _seat = null; _seatClan = null; return null; }
    if (!signedIn()) { _support = 'signedout'; return null; }
    if (_reading && !force) return _reading;
    _reading = (async function () {
      var d = await call('clan_seat_read', { p_clan_id: id }, function (o) { return { out: o }; });
      if (d.action === 'unsupported') { _support = 'unsupported'; _seat = null; _seatClan = null; return null; }
      if (d.action !== 'accept') { _support = 'unknown'; return null; }
      _support = 'live';
      _seat = d.out;
      _seatClan = id;
      /* The server's answer to "what have I spent today" wins over the local
         accumulator on every read — otherwise a reload restarts the 400-cap
         counter at zero and the Work Order card lies until the first flush.
         Pre-part-2 servers do not send it, and `null` must not become 0: that
         would silently re-introduce the same lie. */
      if (_seat && _seat.my_labour_today != null) _labourToday = Math.max(0, +_seat.my_labour_today || 0);
      /* Push the two authoritative castle fields back onto the clan row.
         `raids.js` reads `HearthriseClans.myClan().castle_tier` and `.upgrades`
         to derive the Hunt's tier ceiling (§11.3) — and that row is only ever
         populated at sign-in, so without this a tier-up or a completed War Room
         Work Order would not raise the ceiling until the next reload. The seat
         read is the newer answer; the clan row is a cache of the older one. */
      var row = myClanObj();
      if (row && _seat) {
        row.castle_tier = _seat.castle_tier;
        row.upgrades = _seat.upgrades;
        row.standing = _seat.standing;
        row.treasury = _seat.treasury;
        if (_seat.my_role) row.myRole = _seat.my_role;
      }
      // The Common Room's potency and its server-side audit trail. See §5.
      grantRested(id).catch(function () {});
      return _seat;
    })();
    try { return await _reading; } finally { _reading = null; }
  }

  // ════════════════════════════════════════════════════════════
  // 4 · PERKS — the castle's contribution to getBonus
  // ════════════════════════════════════════════════════════════
  // A dormant hold's perks are OFF and a strained hold's run at 60% (§10). That
  // is the only punishment in the whole upkeep system: nothing is ever
  // destroyed or de-levelled, so a clan that goes quiet for three months comes
  // back and is running again inside a day.
  function perkScale() { return C().perkScaleFor(upkeepState()); }

  /* The permanent castle contribution to one key.
     b228: `restedXp` no longer appears here at all — Rested converted from a
     percentage potency to a flat XP quantum (restedQuantum, §5 below), so the
     Tavern's Common Room stopped being a getBonus contribution entirely. */
  function castlePermanent(key) {
    if (!seat()) return 0;
    if (key === 'restedXp') return 0;
    var v = 0;
    if (key === 'allXP') v = greatHallAllXp(castleTier());
    else {
      for (var i = 0; i < BUILDINGS.length; i++) {
        var b = BUILDINGS[i];
        if (b.perk === key && b.perk !== 'restedXp') v += perkAtLevel(level(b.id));
      }
    }
    if (v <= 0) return 0;
    /* The castle's own share of the per-key budget (bonus-rebase.md §2.2): a
       wing at level 10 is worth +3%, and no key may draw more than +5% from
       the castle whatever future buildings are added. Enforced at the source,
       not in the chain — the chain-wide fuse is power-budget.js's job now. */
    return Math.min(CASTLE_KEY_CAP, v) * perkScale();
  }

  /* The permanent allXP sources that are NOT the castle. Read directly from
     their owners rather than inferred, so the audit can never be fooled by a
     wrapper that runs in a different order.
     b228: the homestead capstone came to +2% with everything else. */
  function otherPermanentAllXp() {
    var t = 0;
    try {
      if (window.HearthriseRenown && typeof window.HearthriseRenown.getPerks === 'function') {
        t += (window.HearthriseRenown.getPerks(G_()).allXP || 0);
      }
    } catch (e) {}
    try {
      if (window.HearthriseHomestead && typeof window.HearthriseHomestead.isCastle === 'function'
          && window.HearthriseHomestead.isCastle()) t += 0.02;
    } catch (e) {}
    try {
      if (window.HearthriseClans && typeof window.HearthriseClans.myPerks === 'function') {
        t += (window.HearthriseClans.myPerks().allXP || 0);
      }
    } catch (e) {}
    return t;
  }
  /* Reporting only — what the four named permanent allXP sources come to.
     b228: this used to be a FUSE that reduced the castle's own share when the
     stack ran hot. It is now a plain sum, because the clamping moved to
     power-budget.js at the end of the chain where it cannot be escaped. */
  function permanentAllXp() { return otherPermanentAllXp() + castleBonus('allXP', true); }

  /* ── THE FEAST (§9.3) — temporary, and budgeted separately (§8.4) ────────
     A Tavern-10 Feast at Last Call reaches ~+65% allXP on top of the permanent
     stack, for four hours in every twenty-four. That is deliberate: it is a
     scheduled celebration a clan pays materials for, and it is the single
     most-anticipated moment in the design. It is applied OUTSIDE the fuse for
     exactly that reason, and it is recorded here so nobody discovers it in a
     spreadsheet later.

     Mapping note for the Designer: §9.3 grants "+N% gathering yield". Hearthrise
     has no percentage yield key — `farmYield` is an integer count of extra
     crops, and multiplying it by 1.08 would round to nothing. The feast's
     gathering line therefore ships as `gatherSpeed`, which is the same promise
     in an idle game (more actions per hour) and is labelled "gathering speed"
     in the UI rather than "yield". Flagged, not silently substituted. */
  function feastActive() {
    var s = seat();
    if (!s || !s.feast_until) return null;
    var end = Date.parse(s.feast_until);
    if (!isFinite(end)) return null;
    var left = end - Date.now();
    if (left <= 0) return null;
    return { endsAt: end, left: left, effect: C().feastEffectAt(level('tavern'), left) };
  }
  function feastBonus(key) {
    var f = feastActive();
    if (!f || perkScale() <= 0) return 0;
    var e = f.effect;
    if (key === 'allXP') return e.allXP || 0;
    if (key === 'gatherSpeed') return e.yield || 0;
    if (key === 'craftSpeed' || key === 'smithSpeed' || key === 'cookSpeed') return e.artisan || 0;
    return 0;
  }

  function castleBonus(key, permanentOnly) {
    var v = castlePermanent(key);
    if (permanentOnly) return v;
    return v + feastBonus(key);
  }

  /* The audit the panel prints. Exposed so the suite checks the real numbers
     rather than a comment that can drift away from them.
     b228: `restedXp` leaves the audit — it is no longer a getBonus key the
     castle produces. */
  function budgetAudit() {
    var out = { keys: {}, largest: 0, total: 0 };
    var keys = ['allXP', 'goldFind', 'craftSpeed', 'smithSpeed', 'raidPower'];
    keys.forEach(function (k) {
      var v = castlePermanent(k);
      out.keys[k] = v;
      out.total += v;
      if (v > out.largest) out.largest = v;
    });
    return out;
  }

  var _bonusHooked = false;
  function installBonusHook() {
    if (_bonusHooked) return;
    if (typeof window.getBonus !== 'function') { setTimeout(installBonusHook, 200); return; }
    _bonusHooked = true;
    var orig = window.getBonus;
    window.getBonus = function (key) {
      var t = orig.apply(this, arguments);
      try { t += castleBonus(key); } catch (e) {}
      return t;
    };
    window.getBonus.__hrCastleBonus = true;
  }

  // ════════════════════════════════════════════════════════════
  // 5 · RESTED XP — the Common Room (§9.4)
  // ════════════════════════════════════════════════════════════
  // ⚠ THE CLIENT IS THE ONLY WRITER OF THE BANK. legacy.js accrueRestedXp()
  //   already banks charges from its own watermark (G.restedAt) on every
  //   processOffline, and clan_rested_grant banks them from ITS own watermark
  //   (clan_members.last_seen). Adding the server's charges to G.restedXp would
  //   pay the same offline hours twice — the exact b214 double-pay class of bug
  //   both watermarks were built to prevent.
  //
  //   So the RPC is consulted for the two things only the server can answer:
  //   the POTENCY (which depends on the clan's Tavern level and its upkeep
  //   state) and the ledger row that makes the grant auditable. The bank itself
  //   stays local, replay-proof, and inside the save allowlist.
  //
  //   The seam then completes itself with no further wiring: getBonus('restedXp')
  //   returns the potency above, legacy.js spendRestedCharge() burns one charge
  //   per XP grant, and addXp multiplies. A charge is never burned while the
  //   potency is zero, which is what kept the seam genuinely inert in b222.
  var _restedAt = 0;
  async function grantRested(id) {
    if (Date.now() - _restedAt < 60000) return null;      // at most once a minute
    _restedAt = Date.now();
    var d = await call('clan_rested_grant', { p_clan_id: id || clanId() });
    if (d.action !== 'accept') return null;
    return d.out;
  }

  // ════════════════════════════════════════════════════════════
  // 6 · LABOUR — the Work Order's third phase (§6.2, §6.3, §6.6)
  // ════════════════════════════════════════════════════════════
  // Every qualifying skill action any member performs generates Labour. There
  // is NO "On Site" toggle: an idle game's cardinal sin is a mode you forget to
  // enable, and a member who grinds all evening for zero credit is precisely
  // the "that reward doesn't matter" bug this spec exists to fix (§6.4).
  //
  // The wrapper goes through window.wrapUpdateDaily under its OWN name. The
  // Muster holds 'muster'; this holds 'castleLabour'. The chain owns the
  // idempotency roster (updateDaily.__wrappedBy), so neither system needs a
  // private global the other cannot see — CONFLICTS #6, closed by construction.
  // An action legitimately feeds both meters. That is not double-dipping: they
  // are different rewards from the same hour of play.
  var GATHER_SKILLS = ['woodcutting', 'mining', 'fishing', 'foraging'];
  function skillLevelFor(type) {
    var lv = window.getLevel;
    if (typeof lv !== 'function') return 1;
    try {
      if (type === 'kill_any') return (typeof window.getCombatLevel === 'function') ? window.getCombatLevel() : 1;
      if (type === 'harvest') return lv('farming');
      if (type === 'cooked') return lv('cooking');
      if (type === 'smithed') return lv('smithing');
      if (type === 'crafted') return lv('crafting');
      if (type === 'gather') {
        var act = G_().activeSkill;
        if (act && GATHER_SKILLS.indexOf(act) >= 0) return lv(act);
        return GATHER_SKILLS.reduce(function (m, s) { return Math.max(m, lv(s) || 1); }, 1);
      }
    } catch (e) {}
    return 1;
  }
  var LABOUR_TYPES = { kill_any: 1, gather: 1, harvest: 1, cooked: 1, smithed: 1, crafted: 1 };

  var _labour = 0;          // fractional accumulator; only whole ticks are sent
  var _labourToday = 0;     // the server's answer to "what have I spent today"
  var _labourCapped = false;
  var _assignment = null;   // the order this member chose to work (tier 3+ only)

  function activeOrder() {
    var s = seat();
    if (!s || !s.orders || !s.orders.length) return null;
    // Default assignment is the oldest open order in its Labour phase — the
    // choice the rejected "On Site" toggle was protecting is preserved as a
    // real one only when a second slot is open (tier 3+, §6.4).
    var labour = s.orders.filter(function (o) { return o.phase === 'labour'; });
    if (!labour.length) return null;
    labour.sort(function (a, b) { return Date.parse(a.posted_at || 0) - Date.parse(b.posted_at || 0); });
    var pick = _assignment && labour.filter(function (o) { return o.id === _assignment; })[0];
    return pick || labour[0];
  }
  function openOrders() { var s = seat(); return (s && s.orders) || []; }

  function addLabour(type, amt) {
    if (!LABOUR_TYPES[type]) return 0;
    if (!supported() || !activeOrder()) return 0;
    if (perkScale() <= 0) return 0;                       // a dormant hold freezes work
    /* The cap is checked against the FRACTIONAL accumulator, not its floor.
       Flooring here let the bank drift up to one whole tick past 400 before the
       cap noticed — invisible in a flush (only whole ticks are sent) and wrong
       in the number the Work Order card prints back to the player. */
    var room = Math.max(0, C().labourRemainingToday(_labourToday) - _labour);
    if (room <= 0) { _labourCapped = true; return 0; }
    var gain = C().labourForAction(skillLevelFor(type), Math.max(1, amt || 1));
    gain = Math.min(gain, room);
    _labour += gain;
    return gain;
  }

  var _flushing = false;
  async function flushLabour() {
    if (_flushing) return;
    var ticks = Math.floor(_labour);
    if (ticks <= 0) return;
    var order = activeOrder();
    var id = clanId();
    if (!order || !id || !supported()) { _labour = 0; return; }
    var send = Math.min(C().LABOUR_CALL_CLAMP, ticks);
    _flushing = true;
    var d = await call('clan_work_labour', { p_clan_id: id, p_order: order.id, p_ticks: send },
      function (o) { return { out: o }; });
    _flushing = false;
    if (d.action === 'unsupported') { _support = 'unsupported'; _labour = 0; return; }
    if (d.action !== 'accept') return;                    // keep it pending, retry next tick
    var r = C().reduceWorkLabour(200, d.out);
    _labour = Math.max(0, _labour - send);
    _labourToday = r.ticksToday;                          // the SERVER's total always wins
    _labourCapped = r.capped;
    order.labour_done = r.labourDone;
    order.labour_target = r.labourTarget || order.labour_target;
    renderIfOpen();
  }

  // ════════════════════════════════════════════════════════════
  // 7 · THE TAVERN BOARD (§9.2)
  // ════════════════════════════════════════════════════════════
  // The Board's RPCs land in supabase/migrations/2026-08-08-clan-seat-2.sql.
  // Until that file is run this whole section feature-detects to 'unsupported'
  // and the Tavern modal says the Barkeep has not posted yet — it does not
  // invent tasks, because a task nobody can claim is a fake.
  var _board = null;              // [{task_id,label,counter,target,progress,claimed,cp,standing,weekly}]
  var _boardPending = {};         // counter → delta not yet flushed
  var _boardAt = 0;

  function boardCounterFor(type) {
    // The Board reads the same six counters the game already fires. A task that
    // needed a new call site would be a task that silently stopped counting the
    // first time somebody refactored a skill.
    return LABOUR_TYPES[type] ? type : null;
  }
  function addBoard(type, amt) {
    var c = boardCounterFor(type);
    if (!c || !_board || !_board.length) return;
    var wanted = false;
    for (var i = 0; i < _board.length; i++) if (_board[i].counter === c && !_board[i].done) wanted = true;
    if (!wanted) return;
    _boardPending[c] = (_boardPending[c] || 0) + Math.max(1, amt || 1);
  }
  async function flushBoard() {
    var id = clanId();
    if (!id || !supported() || !_board) return;
    var keys = Object.keys(_boardPending);
    for (var i = 0; i < keys.length; i++) {
      var c = keys[i], n = _boardPending[c];
      if (!(n > 0)) continue;
      delete _boardPending[c];
      var d = await call('clan_board_progress', { p_clan_id: id, p_counter: c, p_delta: Math.min(500, n) },
        function (o) { return { out: o }; });
      if (d.action === 'unsupported') { _board = null; return; }
      if (d.action === 'accept' && d.out && d.out.tasks) adoptBoard(d.out.tasks);
    }
  }
  function adoptBoard(rows) {
    _board = (rows || []).map(function (r) {
      return {
        task_id: r.task_id, label: r.label || r.task_id, counter: r.counter,
        target: Math.max(1, +r.target || 1), progress: Math.max(0, +r.progress || 0),
        cp: Math.max(0, +r.cp || 0), standing: Math.max(0, +r.standing || 0),
        weekly: !!r.weekly, claimed: !!r.claimed,
        done: (+r.progress || 0) >= (+r.target || 1)
      };
    });
  }
  async function readBoard(force) {
    var id = clanId();
    if (!id || !supported()) return null;
    if (!force && Date.now() - _boardAt < 60000 && _board) return _board;
    _boardAt = Date.now();
    var d = await call('clan_board_roll', { p_clan_id: id }, function (o) { return { out: o }; });
    if (d.action === 'unsupported') { _board = null; return null; }
    if (d.action !== 'accept') return null;
    adoptBoard(d.out && d.out.tasks);
    return _board;
  }

  // ════════════════════════════════════════════════════════════
  // 8 · ACTIONS
  // ════════════════════════════════════════════════════════════
  function toast(m, k) { if (typeof window.notify === 'function') window.notify(m, k || 'info'); }
  function persist() { if (typeof window.saveLocal === 'function') window.saveLocal(); }
  function needServer() {
    if (!signedIn()) { toast('Sign in to act for the hold', 'kill'); return true; }
    if (!supported()) { toast('The hold is not chartered on the server yet', 'kill'); return true; }
    return false;
  }

  /* THE STOREHOUSE. Possession is client-trusted (§12.3): the local stack is
     removed only after the server accepts, so a refusal never costs anything,
     but nothing here proves ownership. The clamps, CP decay, the power budget
     and clan_ledger are the four bounds on that trust. */
  async function deposit(itemId, qty) {
    qty = Math.max(0, Math.floor(+qty || 0));
    if (needServer()) return false;
    var have = (G_().inventory || {})[itemId] || 0;
    if (qty <= 0 || qty > have) { toast('You do not hold that many', 'kill'); return false; }
    /* ── §3.5 — SETTLE BEFORE A VALUE-MOVING INTENT (b366, Phase 2) ───────
       A deposit escrows ITEMS out of the server's inventory, and under a 90 s
       settle cadence the player may be holding up to ninety seconds of drops
       the server has not paid yet. Settling first makes the server's count the
       one the deposit is priced against, so a deposit of something genuinely
       earned at the keyboard is not refused for not existing yet.

       ⚠ IT NEVER BLOCKS THE DEPOSIT. A settle that fails, is rate-limited or is
         under the 60 s server floor returns a verdict and the deposit proceeds;
         turning a flaky network into "you cannot contribute" would be a larger
         fault than the one this fixes.

       Reached through the WINDOW SEAM rather than an import because this file
       is a classic script, not ESM — the same reason every other server call in
       it goes through `window.HearthriseSupabase`. Absent (an old build, a boot
       before accrue.js) it is simply skipped, which is the pre-b366 behaviour. */
    try {
      var A = window.HearthriseAccrual;
      if (A && typeof A.settleBeforeIntent === 'function') await A.settleBeforeIntent();
    } catch (e) { /* best effort by contract — see above */ }

    var body = { p_clan_id: clanId(), p_items: {} };
    body.p_items[itemId] = qty;
    var d = await call('clan_deposit', body, function (o) { return { out: o }; });
    if (d.action === 'unsupported') { _support = 'unsupported'; renderIfOpen(); return false; }
    var r = C().reduceDeposit(200, d.action === 'accept' ? d.out : { ok: false, error: d.error });
    if (r.action !== 'accept') { toast(r.message, 'kill'); return false; }
    if (typeof window.removeItem === 'function') window.removeItem(itemId, qty);
    persist();
    var name = itemName(itemId);
    toast('The hold takes ' + qty.toLocaleString() + ' ' + name + ' — +' + r.cp.toLocaleString() +
      ' Contribution, +' + r.standing.toLocaleString() + ' Standing' +
      (r.demand === 'capped' ? ' (Storehouse full: paid at 0.4x)' : r.demand === 'ordered' ? ' (on demand: 1.5x)' : ''),
      r.demand === 'capped' ? 'info' : 'loot');
    await readSeat(true);
    renderIfOpen();
    return true;
  }

  async function postOrder(building) {
    if (needServer()) return false;
    var to = level(building) + 1;
    var d = await call('clan_work_post', { p_clan_id: clanId(), p_building: building, p_to_level: to },
      function (o) { return { out: o }; });
    if (d.action !== 'accept') { toast(d.message || C().errorText(d.error), 'kill'); return false; }
    toast('Work Order posted: ' + buildingDef(building).name + ' to level ' + to + '. The hold needs materials.', 'levelup');
    await readSeat(true);
    renderIfOpen();
    return true;
  }
  async function supplyOrder(orderId, items) {
    if (needServer()) return false;
    var d = await call('clan_work_supply', { p_clan_id: clanId(), p_order: orderId, p_items: items },
      function (o) { return { out: o }; });
    if (d.action !== 'accept') { toast(d.message || C().errorText(d.error), 'kill'); return false; }
    if (d.out && d.out.phase === 'labour') {
      toast('The Work Order is fully supplied — construction begins. Every skill action now feeds it.', 'levelup');
    } else {
      toast('Materials moved onto the Work Order.', 'info');
    }
    await readSeat(true);
    renderIfOpen();
    return true;
  }
  async function completeOrder(orderId) {
    if (needServer()) return false;
    await flushLabour();
    var d = await call('clan_work_complete', { p_clan_id: clanId(), p_order: orderId },
      function (o) { return { out: o }; });
    if (d.action !== 'accept') { toast(d.message || C().errorText(d.error), 'kill'); return false; }
    var b = buildingDef(d.out.building);
    toast('The ' + ((b && b.name) || d.out.building) + ' stands at level ' + d.out.level + '.', 'levelup');
    await readSeat(true);
    renderIfOpen();
    return true;
  }
  async function tierUp() {
    if (needServer()) return false;
    var d = await call('clan_tier_up', { p_clan_id: clanId() }, function (o) { return { out: o }; });
    if (d.action !== 'accept') { toast(d.message || C().errorText(d.error), 'kill'); return false; }
    var r = C().reduceTierUp(200, d.out);
    toast('The hold rises: ' + r.name + '.', 'levelup');
    await readSeat(true);
    renderIfOpen();
    return true;
  }

  /* THE FEAST. Fill contribution is the food's `heals` value, so a Cooked Shark
     counts 42 and a Cooked Shrimp counts 8 — the meter is honest about effort. */
  async function feastDeposit(itemId, qty) {
    qty = Math.max(0, Math.floor(+qty || 0));
    if (needServer()) return false;
    var def = (window.ITEMS || {})[itemId];
    var heals = def && def.heals;
    if (!heals) { toast('The Tavern takes cooked food only', 'kill'); return false; }
    var have = (G_().inventory || {})[itemId] || 0;
    if (qty <= 0 || qty > have) { toast('You do not hold that many', 'kill'); return false; }
    var d = await call('clan_feast_deposit', { p_clan_id: clanId(), p_heals: heals * qty },
      function (o) { return { out: o }; });
    if (d.action !== 'accept') { toast(d.message || C().errorText(d.error), 'kill'); return false; }
    if (typeof window.removeItem === 'function') window.removeItem(itemId, qty);
    persist();
    toast('You lay ' + qty + ' ' + itemName(itemId) + ' on the Tavern table — the meter reads ' +
      (+d.out.meter).toLocaleString() + ' / ' + (+d.out.cap).toLocaleString() + '.', 'loot');
    await readSeat(true);
    renderIfOpen();
    return true;
  }
  async function feastCall() {
    if (needServer()) return false;
    var d = await call('clan_feast_call', { p_clan_id: clanId() }, function (o) { return { out: o }; });
    if (d.action !== 'accept') { toast(d.message || C().errorText(d.error), 'kill'); return false; }
    toast('The Feast is called — ' + d.out.hours + 'h of ' +
      Math.round((+d.out.all_xp || 0) * 100) + '% all XP for the whole hold.', 'levelup');
    await readSeat(true);
    renderIfOpen();
    return true;
  }
  /* ── GOVERNANCE: the vice charge and the opt-in vote (b228) ──────────────
     All four RPCs live in 2026-08-09-clan-governance.sql and feature-detect
     exactly like every other call in this file. `_voteSupport` starts at
     'unknown' and only ever becomes 'live' after a real answer, so a hold whose
     project has not run the migration is never offered a vote it cannot hold —
     the affordance is HIDDEN, not shown-and-broken. */
  var _vote = null;              // the normalized vote, or null
  var _mayOpenVote = false;      // the SERVER's answer to "may I open one"
  var _voteSupport = 'unknown';  // unknown | live | unsupported
  var _voteAt = 0;
  var _voteReading = null;
  var _votePick = [];            // the candidate buildings leadership has ticked

  function voteSupported() { return _voteSupport === 'live'; }

  /* Fire-and-redraw. The panel never BLOCKS on the vote read — it draws what it
     knows, and the card appears a moment later if there is one. A governance
     card that delayed the castle would be a governance card nobody thanked. */
  var _voteChecking = false;
  function ensureVote() {
    if (_voteSupport === 'unsupported' || _voteChecking) return;
    if (_voteSupport === 'live' && Date.now() - _voteAt < 20000) return;
    _voteChecking = true;
    readVote(true).then(function () { _voteChecking = false; renderIfOpen(); })
      .catch(function () { _voteChecking = false; });
  }

  async function readVote(force) {
    var id = clanId();
    if (!id || !supported()) return null;
    if (_voteSupport === 'unsupported') return null;
    if (!force && Date.now() - _voteAt < 20000 && _vote !== undefined) return _vote;
    if (_voteReading && !force) return _voteReading;
    _voteAt = Date.now();
    _voteReading = (async function () {
      var d = await call('clan_vote_read', { p_clan_id: id }, function (o) { return { out: o }; });
      if (d.action === 'unsupported') { _voteSupport = 'unsupported'; _vote = null; return null; }
      if (d.action !== 'accept') return _vote;
      var r = C().reduceVoteRead(200, d.out);
      _voteSupport = 'live';
      _vote = r.vote || null;
      _mayOpenVote = !!r.mayOpen;
      return _vote;
    })();
    try { return await _voteReading; } finally { _voteReading = null; }
  }

  async function openVote(buildings, hours) {
    if (needServer()) return false;
    var list = (buildings || []).slice(0, C().VOTE_MAX_CANDIDATES);
    if (list.length < C().VOTE_MIN_CANDIDATES) {
      toast('Pick at least ' + C().VOTE_MIN_CANDIDATES + ' things for the hold to choose between', 'kill');
      return false;
    }
    var d = await call('clan_vote_open',
      { p_clan_id: clanId(), p_candidates: list, p_hours: hours || C().VOTE_DEFAULT_HOURS },
      function (o) { return { out: o }; });
    if (d.action === 'unsupported') { _voteSupport = 'unsupported'; renderIfOpen(); return false; }
    var r = C().reduceVoteOpen(200,
      d.action === 'accept' ? d.out : { ok: false, error: d.error });
    if (r.action !== 'accept') { toast(r.message, 'kill'); return false; }
    _votePick = [];
    toast('The hold is voting on its next work order — ' + (r.hours || 24) + ' hours to decide.', 'levelup');
    await readVote(true);
    renderIfOpen();
    return true;
  }

  async function castVote(building) {
    if (needServer()) return false;
    if (!_vote || !_vote.id) return false;
    var d = await call('clan_vote_cast', { p_clan_id: clanId(), p_vote: _vote.id, p_building: building },
      function (o) { return { out: o }; });
    if (d.action === 'unsupported') { _voteSupport = 'unsupported'; renderIfOpen(); return false; }
    var r = C().reduceVoteCast(200,
      d.action === 'accept' ? d.out : { ok: false, error: d.error });
    if (r.action === 'expired') {
      toast('The vote closed while you were deciding — here is what the hold chose.', 'info');
      await readVote(true); await readSeat(true); renderIfOpen();
      return false;
    }
    if (r.action !== 'accept') { toast(r.message, 'kill'); return false; }
    var b = buildingDef(building);
    toast('Your vote is in: ' + ((b && b.name) || building) + '.', 'loot');
    await readVote(true);
    renderIfOpen();
    return true;
  }

  async function closeVote() {
    if (needServer()) return false;
    if (!_vote || !_vote.id) return false;
    var d = await call('clan_vote_close', { p_clan_id: clanId(), p_vote: _vote.id },
      function (o) { return { out: o }; });
    if (d.action === 'unsupported') { _voteSupport = 'unsupported'; renderIfOpen(); return false; }
    var r = C().reduceVoteClose(200,
      d.action === 'accept' ? d.out : { ok: false, error: d.error });
    if (r.action !== 'accept') { toast(r.message, 'kill'); return false; }
    if (r.outcome === 'posted') {
      var b = buildingDef(r.winner);
      toast('The hold has chosen: ' + ((b && b.name) || r.winner) + '. The work order is posted.', 'levelup');
    } else if (r.outcome === 'tie') {
      toast('The vote is tied — leadership picks. Nothing was posted.', 'info');
    } else {
      toast(r.reason === 'no_ballots' ? 'Nobody voted, so nothing was posted.'
                                      : 'The vote closed without posting: ' + C().errorText(r.reason), 'info');
    }
    await readVote(true);
    await readSeat(true);
    renderIfOpen();
    return true;
  }

  /* Granting the office. Leader only, server-enforced; this button simply is
     not drawn for anyone else. */
  async function setVice(userId, grant) {
    if (needServer()) return false;
    var d = await call('clan_vice_set', { p_clan_id: clanId(), p_user: userId, p_grant: !!grant },
      function (o) { return { out: o }; });
    if (d.action === 'unsupported') {
      toast('Vice leaders need the clan governance migration on this project', 'kill');
      _viceSupport = 'unsupported'; renderIfOpen(); return false;
    }
    var r = C().reduceViceSet(200,
      d.action === 'accept' ? d.out : { ok: false, error: d.error });
    if (r.action !== 'accept') { toast(r.message, 'kill'); return false; }
    _viceSupport = 'live';
    toast(grant ? 'They are a vice leader now — they can post work orders and open votes.'
                : 'They are no longer a vice leader.', 'info');
    _roster = null;
    try {
      var rows = await window.HearthriseClans.roster();
      _roster = rows || [];
    } catch (e) { _roster = []; }
    renderIfOpen();
    return true;
  }
  var _viceSupport = 'unknown';

  async function boardClaim(taskId) {
    if (needServer()) return false;
    var d = await call('clan_board_claim', { p_clan_id: clanId(), p_task_id: taskId },
      function (o) { return { out: o }; });
    if (d.action !== 'accept') { toast(d.message || C().errorText(d.error), 'kill'); return false; }
    toast('The Barkeep pays out: +' + (+d.out.cp || 0).toLocaleString() + ' Contribution, +' +
      (+d.out.standing || 0).toLocaleString() + ' Standing.', 'loot');
    await readBoard(true);
    renderIfOpen();
    return true;
  }

  // ════════════════════════════════════════════════════════════
  // ════════════════════════════════════════════════════════════
  // 9 · DRAWING — masonry, the hold, and six room interiors
  // ════════════════════════════════════════════════════════════
  // Drawn in code, in the idiom backdrop.js's homesteadScene established and
  // board-and-shop.css's noticeboard/shopfront confirmed: shapes carry classes,
  // colours are --scene-* tokens in clan-seat.css. No emoji, no asset
  // dependency, and it re-tints for free when Art lands a painted pass.
  //
  // TWO RULES GOVERN EVERY SHAPE BELOW.
  //
  // 1 · THE HOLD IS BUILT FROM BLOCKS. A castle drawn as flat silhouettes reads
  //     as a logo. Every stone surface therefore carries real coursing — mortar
  //     lines with staggered joints, drawn at the scale of the structure — and
  //     every timber surface carries plank lines. That is what makes the tier-4
  //     wall feel like masonry and the tier-3 wall feel like carpentry, which is
  //     the whole story those two tiers are telling.
  //
  // 2 · THE PICTURE NEVER LIES ABOUT PROGRESS. A hold with no Sawmill has no
  //     sawmill in it — it has a dashed outline where one would stand. Ghosted →
  //     lit is the payoff the entire Work Order loop is built to deliver, and it
  //     only works if the unbuilt state is structurally different rather than
  //     the same shape at lower opacity.
  //
  // 3 · (b227) THE FOOTPRINT IS THE SPINE OF THE PROGRESSION. Tier 1 was a camp
  //     — two tents and a fire, which is the HOMESTEAD's vocabulary and told a
  //     clan its shared castle began as somebody's smallholding. It is now the
  //     same castle's FOUNDATION: the exact rectangle the tier-4 curtain wall
  //     stands on, set out on the ground in stakes and cord, with the first
  //     course of footings laid along it. Every tier after it fills that same
  //     rectangle in — footings, then a plinth with a wall rising on it, then a
  //     finished wall, then masonry, then masonry and trophies — so a player who
  //     has seen tier 1 recognises tier 4 as the thing they were promised.
  //     The constants below are that promise, and every tier reads them.
  var GY = 252;

  var WALL_L = 516;                 // the curtain run — tier 4's `crenel(lo,…)`
  var WALL_R = 1084;
  var TOWER_W = 48;                 // the corner tower pads, straddling the ends
  var TOWER_L = WALL_L - 16;        // 500 — tier 4's left tower, exactly
  var TOWER_R = WALL_R - 32;        // 1052 — and its right one
  var GATE_L = 756;                 // the opening the gatehouse (766–834) fills
  var GATE_R = 844;

  function starField(n, w, h) {
    var s = '';
    for (var i = 0; i < n; i++) {
      var x = (i * 211) % w, y = (i * 67) % h, r = (i % 4) ? 0.9 : 1.5;
      s += '<circle cx="' + x + '" cy="' + y + '" r="' + r + '"/>';
    }
    return s;
  }
  function smoke(x, y) {
    return '<g class="hrcs-smoke">' +
      '<ellipse cx="' + (x + 2) + '" cy="' + (y - 10) + '" rx="6" ry="4.5"/>' +
      '<ellipse cx="' + (x + 10) + '" cy="' + (y - 24) + '" rx="9" ry="5.5" opacity=".8"/>' +
      '<ellipse cx="' + (x + 22) + '" cy="' + (y - 41) + '" rx="13" ry="7" opacity=".55"/>' +
      '<ellipse cx="' + (x + 40) + '" cy="' + (y - 58) + '" rx="18" ry="8.5" opacity=".3"/>' +
      '</g>';
  }

  /* ── MASONRY ──────────────────────────────────────────────────────────────
     Block coursing inside a rectangle. Courses are horizontal mortar lines; the
     vertical joints are offset by half a block on alternate courses, which is
     what makes it read as a bonded wall rather than a grid. The last course is
     clipped rather than squeezed, exactly as a real course meets a sill. */
  function courses(x, y, w, h, ch, cw) {
    ch = ch || 11; cw = cw || 26;
    var s = '<g class="hrcs-mortar">';
    for (var r = 1; r * ch < h; r++) {
      s += '<path d="M' + x + ',' + (y + r * ch) + ' H' + (x + w) + '"/>';
    }
    for (var r2 = 0; r2 * ch < h; r2++) {
      var off = (r2 % 2) ? cw / 2 : 0;
      var top = y + r2 * ch, bot = Math.min(y + h, top + ch);
      for (var jx = x + off; jx < x + w; jx += cw) {
        if (jx <= x) continue;
        s += '<path d="M' + jx.toFixed(1) + ',' + top + ' V' + bot + '"/>';
      }
    }
    return s + '</g>';
  }
  /* Timber reads the other way round: long horizontal boards, few joints. */
  function planks(x, y, w, h, ph) {
    ph = ph || 12;
    var s = '<g class="hrcs-mortar">';
    for (var r = 1; r * ph < h; r++) s += '<path d="M' + x + ',' + (y + r * ph) + ' H' + (x + w) + '"/>';
    s += '<path d="M' + (x + w * 0.34).toFixed(1) + ',' + y + ' V' + (y + h) + '"/>';
    s += '<path d="M' + (x + w * 0.71).toFixed(1) + ',' + y + ' V' + (y + h) + '"/>';
    return s + '</g>';
  }
  function crenel(x, y, w, h, mw) {
    var s = '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '"/>';
    var n = Math.floor(w / (mw * 2)) + 1;
    for (var i = 0; i < n; i++) {
      var mx = x + i * mw * 2;
      if (mx + mw > x + w) break;
      s += '<rect x="' + mx + '" y="' + (y - mw) + '" width="' + mw + '" height="' + mw + '"/>';
    }
    return s;
  }
  function pineRow(xs, base, scale) {
    var s = '<g class="hrcs-tree">';
    xs.forEach(function (x) {
      var h = 46 * scale, w = 17 * scale;
      s += '<path d="M' + x + ',' + base + ' l' + w + ',' + (h * .46) + ' l' + (-w * 2) + ',0 z' +
        ' M' + x + ',' + (base - h * .28) + ' l' + (w * 1.2) + ',' + (h * .44) + ' l' + (-w * 2.4) + ',0 z' +
        ' M' + x + ',' + (base - h * .54) + ' l' + (w * 1.4) + ',' + (h * .42) + ' l' + (-w * 2.8) + ',0 z"/>';
    });
    return s + '</g>';
  }
  function litRect(x, y, w, h) { return '<rect class="hrcs-lit" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="1"/>'; }

  /* Close-set vertical timbers. `planks()` draws boards lying down (long
     horizontal joints); a palisade is the same material stood up, and drawing it
     with the horizontal helper is what made the old tier-2 wall read as farm
     fencing rather than as a wall under construction. */
  function staves(x, y, w, h, sw) {
    sw = sw || 13;
    var s = '<g class="hrcs-mortar">';
    for (var i = x + sw; i < x + w - 1; i += sw) s += '<path d="M' + i.toFixed(1) + ',' + y + ' V' + (y + h) + '"/>';
    return s + '</g>';
  }

  /* ── THE BUILDING SITE ────────────────────────────────────────────────────
     The vocabulary of a castle that is being MADE. Every mark here is a real
     mason's-yard object drawn in the scene's own silhouette idiom — the point
     is that tier 1 is not "a small castle", it is "this castle, before it".

     ONE MEASURED CONSTRAINT GOVERNS ALL OF IT. Hearthlight's ground tokens are
     `--scene-build #090705`, `--scene-ridge-near #0b0806`, `--scene-ridge-mid
     #120e0a`: three values inside 9/255 of each other. Every structure in this
     picture that reads, reads because it is silhouetted against the SKY — and
     the whole foundation stage is, by definition, shorter than the horizon.
     My first pass drew a correct, complete building site that was invisible.
     The terrace below is the fix: the levelled platform a castle is actually
     begun on, drawn in `--scene-ridge-far #1a150f` — the only ground token with
     real separation from the build colour — so that a 22-unit footing course
     has something to be seen against. */

  /* The cut-and-fill platform. Its far edge is the light band behind the wall
     line; everything on the site stands in front of it. */
  function terrace() {
    var t = GY - 34, x0 = 452, x1 = 1104;
    // No highlight along the far edge: an unbroken 2px line 650 units long
    // reads as a wire stretched across the picture, not as ground. The value
    // step between ridge-far and ridge-mid is the edge.
    return '<path class="hrcs-terrace" d="M' + (x0 - 42) + ',' + GY + ' L' + x0 + ',' + t +
        ' H' + x1 + ' L' + (x1 + 42) + ',' + GY + ' Z"/>' +
      // the ward, lit low and warm — a worked site at dusk, not an empty field
      '<ellipse class="hrcs-glow" cx="800" cy="' + (GY - 6) + '" rx="330" ry="54"/>';
  }

  /* A driven post. Everything on a site starts as one. */
  function post(x, h, w) { w = w || 4; return '<rect x="' + (x - w / 2) + '" y="' + (GY - h) + '" width="' + w + '" height="' + h + '"/>'; }

  /* Setting-out: short stakes at a pace apart with a taut cord strung between
     them. This is the line the wall will stand on, and at tier 4 it does. */
  function stakeRun(x0, x1, h) {
    h = h || 13;
    var s = '<g class="hrcs-site">';
    for (var x = x0; x <= x1 + 0.5; x += 34) s += post(x, h);
    return s + '</g><path class="hrcs-cord" d="M' + x0 + ',' + (GY - h + 2) + ' H' + x1 + '"/>';
  }

  /* Batter boards — the pair of posts with a board nailed across that a mason
     sets at every corner so the cord can be re-strung true after digging. They
     are the single most legible "this is a foundation" object there is. */
  function batterBoard(x, w, h) {
    h = h || 52;
    return '<g class="hrcs-site">' + post(x, h) + post(x + w, h) +
      '<rect x="' + (x - 7) + '" y="' + (GY - h + 2) + '" width="' + (w + 14) + '" height="5"/></g>';
  }

  /* Dressed footing stone with its joints and the catch-light along the top
     arris. `ch` is the course height: pass the block's full height for a single
     course (a footing), or a fraction of it for a plinth several courses deep.
     The whole castle grows off this line. */
  function footing(x, w, h, ch) {
    h = h || 22;
    return '<g class="hrcs-wall"><rect x="' + x + '" y="' + (GY - h) + '" width="' + w + '" height="' + h + '"/></g>' +
      courses(x, GY - h, w, h, ch || h, 30) +
      '<path class="hrcs-arris" d="M' + x + ',' + (GY - h) + ' H' + (x + w) + '"/>';
  }

  /* THE PLAN. The mason's drawing of the thing being built, set out over the
     ground it will stand on — the tier-4 curtain, its two corner towers and its
     gatehouse, at the exact coordinates tier 4 draws them.

     This is the answer to "does tier 1 promise a castle". Every other mark on
     the site says *work is happening here*; only this one says *and this is
     what it will be*. It is deliberately NOT the `.is-ghost` dash the unbuilt
     wings wear — a ghosted wing is a building that is absent, and this is not a
     building at all, it is a drawing. Gilt, finer, longer dashes, lower
     opacity: a survey line, in the same colour the tier name above it is set. */
  function castlePlan(tier) {
    if (tier > 2) return '';
    return '<g class="hrcs-plan">' +
        crenel(WALL_L, GY - 62, WALL_R - WALL_L, 62, 13) +
        crenel(TOWER_L, GY - 96, TOWER_W, 96, 14) +
        crenel(TOWER_R, GY - 96, TOWER_W, 96, 14) +
        '<rect x="766" y="' + (GY - 86) + '" width="68" height="86"/>' +
        '<path d="M780,' + GY + ' v-40 a20,20 0 0 1 40,0 v40"/>' +
      '</g>';
  }

  /* A cresset — a fire basket on a post. The site is worked after dark, and a
     picture whose only warm light is in one corner has nothing holding its
     middle together. */
  function cresset(x, h) {
    return '<ellipse class="hrcs-glow" cx="' + x + '" cy="' + (GY - h + 4) + '" rx="58" ry="40"/>' +
      '<g class="hrcs-site">' + post(x, h, 4) +
        '<path d="M' + (x - 11) + ',' + (GY - h) + ' h22 l-4,11 h-14 z"/></g>' +
      '<path class="hrcs-lit" d="M' + (x - 7) + ',' + (GY - h) + ' q4,-15 8,-4 q4,-16 7,2 q6,-8 3,2 z"/>';
  }

  /* An open trench with its spoil thrown up alongside — the footing that has
     been dug and not yet filled. This is what makes the tier-1 line read as
     WORK IN PROGRESS rather than as a low decorative kerb. */
  function trench(x, w) {
    return '<path class="hrcs-ridge-near" d="M' + (x - 10) + ',' + GY + ' q' + (w / 2 + 10) + ',-17 ' + (w + 20) + ',0 z"/>' +
      '<rect class="hrcs-trench" x="' + x + '" y="' + (GY - 8) + '" width="' + w + '" height="8"/>' +
      '<path class="hrcs-cord" d="M' + x + ',' + (GY - 8) + ' H' + (x + w) + '"/>';
  }

  /* Dressed blocks stacked to hand, waiting on the wall. */
  function stoneStack(x) {
    return '<g class="hrcs-wall">' +
        '<rect x="' + x + '" y="' + (GY - 13) + '" width="56" height="13"/>' +
        '<rect x="' + (x + 7) + '" y="' + (GY - 24) + '" width="42" height="11"/>' +
        '<rect x="' + (x + 15) + '" y="' + (GY - 34) + '" width="27" height="10"/></g>' +
      '<g class="hrcs-mortar"><path d="M' + (x + 28) + ',' + (GY - 13) + ' V' + GY + '"/>' +
        '<path d="M' + (x + 28) + ',' + (GY - 24) + ' V' + (GY - 13) + '"/></g>' +
      '<path class="hrcs-rim2" d="M' + (x + 15) + ',' + (GY - 34) + ' h27"/>';
  }

  /* The mason's lean-to: a one-slope roof off two posts, a banker (the trestle
     a block is dressed on) under it, and the lamp that is the only warm light
     on the site. A camp's fire says "we are sleeping here"; a lamp over a
     banker says "we are working here", and that is the whole difference between
     the old tier 1 and this one. */
  function leanTo(x) {
    return '<ellipse class="hrcs-glow" cx="' + (x + 58) + '" cy="' + (GY - 26) + '" rx="86" ry="46"/>' +
      '<g class="hrcs-site">' +
        post(x + 4, 74, 5.5) + post(x + 100, 52, 5.5) +
        '<path d="M' + (x - 10) + ',' + (GY - 74) + ' L' + (x + 114) + ',' + (GY - 52) +
          ' L' + (x + 114) + ',' + (GY - 45) + ' L' + (x - 10) + ',' + (GY - 67) + ' Z"/>' +
        '<rect x="' + (x + 24) + '" y="' + (GY - 29) + '" width="56" height="5"/>' +
        post(x + 31, 24, 4.5) + post(x + 73, 24, 4.5) +
        '<rect x="' + (x + 36) + '" y="' + (GY - 44) + '" width="30" height="15"/>' +
      '</g>' +
      '<g class="hrcs-mortar"><path d="M' + (x + 51) + ',' + (GY - 44) + ' V' + (GY - 29) + '"/></g>' +
      '<g class="hrcs-site"><rect x="' + (x + 84) + '" y="' + (GY - 66) + '" width="4" height="9"/></g>' +
      litRect(x + 81, GY - 57, 10, 13);
  }

  /* A two-wheeled tip cart with its shafts down and stone on the bed. */
  function toolCart(x) {
    return '<g class="hrcs-site">' +
        '<rect x="' + x + '" y="' + (GY - 28) + '" width="74" height="12"/>' +
        '<path d="M' + (x + 72) + ',' + (GY - 26) + ' l32,-13 l3.5,6 l-32,13 z"/>' +
        '<rect x="' + (x + 9) + '" y="' + (GY - 41) + '" width="21" height="13"/>' +
        '<rect x="' + (x + 34) + '" y="' + (GY - 39) + '" width="17" height="11"/>' +
        '<circle cx="' + (x + 17) + '" cy="' + (GY - 11) + '" r="11"/>' +
        '<circle cx="' + (x + 58) + '" cy="' + (GY - 11) + '" r="11"/>' +
      '</g>' +
      '<g class="hrcs-mortar"><path d="M' + (x + 6) + ',' + (GY - 11) + ' a11,11 0 0 1 22,0"/>' +
        '<path d="M' + (x + 47) + ',' + (GY - 11) + ' a11,11 0 0 1 22,0"/></g>';
  }

  /* The pole that says this ground is spoken for. It stands on the gate line,
     so at tier 4 the gatehouse rises exactly where the banner was planted.
     NOT called `banner` — the room interiors already declare one further down
     this file, and a hoisted duplicate silently ate this one's arguments. */
  function claimPole(x, h) {
    var y = GY - h + 6;
    return '<g class="hrcs-site">' + post(x, h, 4.5) +
        '<path d="M' + (x - 5) + ',' + (GY - h + 1) + ' l5,-10 l5,10 z"/></g>' +
      '<path class="hrcs-wall-2" d="M' + (x + 2) + ',' + y + ' L' + (x + 58) + ',' + (y + 6) +
        ' L' + (x + 42) + ',' + (y + 13) + ' L' + (x + 58) + ',' + (y + 20) +
        ' L' + (x + 2) + ',' + (y + 26) + ' Z"/>';
  }

  /* Putlog scaffolding with a lifting gin on top and a block on the rope.
     Nothing states "this wall is going up" as plainly as stone in mid-air. */
  function scaffold(x, w, h) {
    var s = '<g class="hrcs-frame">' +
      '<path d="M' + x + ',' + GY + ' V' + (GY - h) + '"/>' +
      '<path d="M' + (x + w) + ',' + GY + ' V' + (GY - h) + '"/>';
    for (var i = 1; i <= 3; i++) {
      var ly = GY - Math.round(h * i / 3);
      s += '<path d="M' + (x - 7) + ',' + ly + ' H' + (x + w + 7) + '"/>';
    }
    s += '<path d="M' + x + ',' + GY + ' L' + (x + w) + ',' + (GY - Math.round(h * 0.66)) + '"/>';
    // the gin: an A-frame, a rope, and a dressed block hanging off it
    s += '<path d="M' + (x + 5) + ',' + (GY - h) + ' L' + (x + w / 2) + ',' + (GY - h - 42) +
      ' L' + (x + w - 5) + ',' + (GY - h) + '"/>' +
      '<path d="M' + (x + w / 2) + ',' + (GY - h - 40) + ' V' + (GY - h + 26) + '"/></g>' +
      '<g class="hrcs-wall"><rect x="' + (x + w / 2 - 12) + '" y="' + (GY - h + 26) + '" width="24" height="15"/></g>' +
      '<path class="hrcs-rim2" d="M' + (x + w / 2 - 12) + ',' + (GY - h + 26) + ' h24"/>';
  }

  /* The yard. It lives OUTSIDE every clickable group on purpose: a tool cart is
     not a door, and a hover halo that lit up because the pointer crossed a
     wheelbarrow would teach the player the wrong thing about this picture. */
  function siteWorks(tier) {
    if (tier > 2) return '';
    // Kept out of the left third: that is where the hold's name stands on its
    // scrim, and a lamp behind a wordmark is a lamp nobody sees.
    var out = toolCart(566) + stoneStack(662) + stoneStack(878) + leanTo(1124);
    if (tier === 2) out += scaffold(958, 76, 76);
    return out;
  }

  /* ── THE DEFENCES ─────────────────────────────────────────────────────────
     One rectangle, five states of completion.

       1  the ground is set out and the first footings are in — batter boards at
          both corners, cord strung along the run, one course laid where the
          masons have got to, an open trench where they have not, and bare
          stakes where they have only measured. A banner on the gate line.
       2  the plinth is complete and a boarded wall is rising on it, unevenly,
          with a scaffold and a lifting gin at the far end.
       3  that wall finished: full height, roofed corner towers, a gate leaf —
          timber over the tier-1 stone, which is exactly how a real hold got
          defensible before it got rich.
       4  the timber is replaced in coursed masonry, crenellated, with the
          gatehouse standing on the gate line the banner marked at tier 1.
       5  the same, thickened outward, wearing its trophies.

     Tiers 1-4 share WALL_L/WALL_R/GATE_L/GATE_R to the unit. That is not tidy
     bookkeeping — it is the entire reason tier 1 promises a castle. */
  /* THE LADDER, in one place so it can be read as a ladder. Wall crest, corner
     tower and gate, per tier, in viewBox units above the ground line. Nothing
     in this list may go down as the tier goes up — that is the whole contract
     the picture makes with the player. */
  //                     t1   t2   t3   t4/5
  //   wall crest        22   42   54    62 (+13 of merlon)
  //   corner            38   54   76    96
  //   gate              44   60   —     86
  function defences(tier) {
    var pad = TOWER_W;                             // the corner pads, both ends
    if (tier <= 1) {
      // The boards straddle the corner pads and stand clear above them — set
      // level with the pad tops they were invisible, which is the same lesson
      // the terrace taught: at the ground, only height reads.
      return castlePlan(tier) +
        batterBoard(TOWER_L - 10, pad + 20, 52) + batterBoard(TOWER_R + 2, pad + 4, 52) +
        // the corner pads go in first and go in deepest — two courses
        footing(TOWER_L, pad, 38, 19) + footing(TOWER_R, pad, 38, 19) +
        // laid → dug → the gate → laid → merely measured, left to right
        footing(WALL_L, 700 - WALL_L, 22) +
        trench(700, GATE_L - 700) +
        footing(GATE_R, 940 - GATE_R, 22) +
        stakeRun(946, WALL_R, 20) +
        // the gate piers, begun, with the pole planted between them and a
        // cresset burning beside it — the one warm light in the middle third
        footing(GATE_L + 8, 26, 44, 22) + footing(GATE_R - 34, 26, 44, 22) +
        cresset(742, 62) +
        claimPole(800, 118);
    }
    if (tier === 2) {
      // The plinth: the tier-1 footing carried all the way round and brought up
      // to a level course. Everything above it is carpentry.
      var pl = 26, top = GY - pl;
      var s = castlePlan(tier) +
        footing(TOWER_L, pad, 54, 18) + footing(TOWER_R, pad, 54, 18) +
        footing(WALL_L, GATE_L - WALL_L, pl, 13) + footing(GATE_R, WALL_R - GATE_R, pl, 13);
      // Four runs in four STATES, not four heights. Four heights of the same
      // mark reads as a wall that was built badly. A clad run, a bare run with
      // the next course landed on it waiting to be set, another clad run, and a
      // run that is standarded but not yet clad — that reads as a wall being
      // built, and the eye can follow the masons from left to right.
      var tb = 24;
      var runs = [[WALL_L, 664, 'clad'], [664, GATE_L, 'bare'],
                  [GATE_R, 944, 'clad'], [944, WALL_R, 'framed']];
      runs.forEach(function (r) {
        var w = r[1] - r[0];
        if (r[2] === 'clad') {
          s += '<g class="hrcs-wall"><rect x="' + r[0] + '" y="' + (top - tb) + '" width="' + w + '" height="' + tb + '"/></g>' +
            staves(r[0], top - tb, w, tb, 12) +
            '<path class="hrcs-arris" d="M' + r[0] + ',' + (top - tb) + ' H' + r[1] + '"/>';
        } else if (r[2] === 'bare') {
          s += '<g class="hrcs-wall"><rect x="' + (r[0] + 14) + '" y="' + (top - 11) + '" width="' + (w - 46) + '" height="11"/></g>' +
            '<path class="hrcs-arris" d="M' + (r[0] + 14) + ',' + (top - 11) + ' H' + (r[1] - 32) + '"/>';
        } else {
          // standarded and not yet clad: posts, one rail, and sky between them
          s += '<g class="hrcs-frame"><path d="M' + (r[0] + 8) + ',' + top + ' V' + (top - tb - 6) + '"/>' +
            '<path d="M' + ((r[0] + r[1]) / 2) + ',' + top + ' V' + (top - tb - 6) + '"/>' +
            '<path d="M' + (r[1] - 8) + ',' + top + ' V' + (top - tb - 6) + '"/>' +
            '<path d="M' + r[0] + ',' + (top - tb - 3) + ' H' + r[1] + '"/></g>';
        }
      });
      // the gateway: two stone piers framing the hall, and a timber lintel
      s += footing(GATE_L, 22, 60, 15) + footing(GATE_R - 22, 22, 60, 15) +
        '<g class="hrcs-site"><rect x="' + (GATE_L - 7) + '" y="' + (GY - 71) + '" width="' + (GATE_R - GATE_L + 14) + '" height="11"/></g>' +
        cresset(722, 64);
      return s;
    }
    if (tier === 3) {
      // The timber wall the last two tiers were laying the stone for. Its
      // silhouette is unchanged from b223 — crest 54, towers 76, roofs 96 — but
      // it now stands on the footing course tier 1 set out, on tier 4's lines.
      var base = 18;
      return footing(WALL_L, WALL_R - WALL_L, base, 18) +
        '<g class="hrcs-wall">' +
          '<rect x="' + WALL_L + '" y="' + (GY - 54) + '" width="' + (WALL_R - WALL_L) + '" height="' + (54 - base) + '"/>' +
          '<rect x="510" y="' + (GY - 76) + '" width="28" height="76"/>' +
          '<rect x="1062" y="' + (GY - 76) + '" width="28" height="76"/>' +
          '<path d="M498,' + (GY - 76) + ' L524,' + (GY - 96) + ' L550,' + (GY - 76) + ' Z"/>' +
          '<path d="M1050,' + (GY - 76) + ' L1076,' + (GY - 96) + ' L1102,' + (GY - 76) + ' Z"/>' +
          '<rect x="772" y="' + (GY - 42) + '" width="56" height="42"/></g>' +
        planks(WALL_L, GY - 54, WALL_R - WALL_L, 54 - base, 12) +
        courses(510, GY - 18, 28, 18, 18, 22) + courses(1062, GY - 18, 28, 18, 18, 22) +
        staves(772, GY - 42, 56, 42, 11) +
        '<path class="hrcs-rim2" d="M' + WALL_L + ',' + (GY - 54) + ' H' + WALL_R + '"/>';
    }
    // Masonry: crenellated curtain wall, corner towers, a gatehouse — all coursed.
    var lo = tier >= 5 ? TOWER_L : WALL_L;
    var hi = tier >= 5 ? WALL_R + 16 : WALL_R;
    var out = '<g class="hrcs-wall">' +
        crenel(lo, GY - 62, hi - lo, 62, 13) +
        crenel(lo - 16, GY - 96, 48, 96, 14) +
        crenel(hi - 32, GY - 96, 48, 96, 14) +
        '<rect x="766" y="' + (GY - 86) + '" width="68" height="86"/>' +
        '<path d="M780,' + GY + ' v-40 a20,20 0 0 1 40,0 v40 z"/></g>' +
      courses(lo, GY - 62, hi - lo, 62, 12, 30) +
      courses(lo - 16, GY - 96, 48, 96, 12, 24) +
      courses(hi - 32, GY - 96, 48, 96, 12, 24) +
      '<path class="hrcs-rim2" d="M' + lo + ',' + (GY - 62) + ' H' + hi + '"/>' +
      litRect(lo - 2, GY - 74, 13, 18) + litRect(hi - 12, GY - 74, 13, 18);
    if (tier >= 5) {
      // The tier-5 capstone: one War Crown, one Ancient Claw, one Dragon Gem,
      // hung on the gatehouse. They read as three objects on a wall because
      // that is exactly what the spec makes them (§4.4) — trophies, not a grind.
      out += '<g class="hrcs-wall-2">' +
        '<path d="M772,' + (GY - 98) + ' l7,-11 l7,7 l7,-11 l7,11 l-4,9 h-20 z"/>' +
        '<path d="M806,' + (GY - 96) + ' q11,-4 16,6 q-9,7 -16,-6 z"/>' +
        '<path d="M792,' + (GY - 76) + ' l7,-9 l7,9 l-7,10 z"/></g>';
    }
    return out;
  }

  /* The Great Hall — the keep itself, which IS castle_tier. It grows with every
     tier, so the one structure a clan cannot commission is also the one whose
     progress is most visible from across the valley. */
  function greatHallMark(tier, dorm) {
    if (tier <= 1) return '';
    var st = ' class="hrcs-b' + (dorm ? ' is-dorm' : '') + '"';
    if (tier === 2) {
      return '<g' + st + '><rect x="756" y="' + (GY - 106) + '" width="88" height="48"/>' +
          '<path d="M746,' + (GY - 104) + ' L800,' + (GY - 140) + ' L854,' + (GY - 104) + ' Z"/>' +
          litRect(770, GY - 96, 15, 18) + litRect(816, GY - 96, 15, 18) + '</g>' +
        planks(756, GY - 106, 88, 48, 12) +
        '<path class="hrcs-rim2" d="M800,' + (GY - 140) + ' L854,' + (GY - 104) + '"/>';
    }
    if (tier === 3) {
      return '<g' + st + '><rect x="748" y="' + (GY - 132) + '" width="104" height="58"/>' +
          '<path d="M738,' + (GY - 130) + ' L800,' + (GY - 174) + ' L862,' + (GY - 130) + ' Z"/>' +
          '<rect x="838" y="' + (GY - 186) + '" width="14" height="34"/>' +
          litRect(762, GY - 122, 16, 20) + litRect(806, GY - 122, 16, 20) + '</g>' +
        planks(748, GY - 132, 104, 58, 13) +
        '<path class="hrcs-rim2" d="M800,' + (GY - 174) + ' L862,' + (GY - 130) + '"/>' +
        smoke(845, GY - 188);
    }
    var top = tier >= 5 ? 214 : 178;
    return '<g' + st + '>' +
        crenel(748, GY - top, 104, top - 62, 14) +
        '<path d="M742,' + (GY - top - 4) + ' L800,' + (GY - top - 48) + ' L858,' + (GY - top - 4) + ' Z"/>' +
        '<rect x="798" y="' + (GY - top - 84) + '" width="4" height="38"/>' +
        (tier >= 5 ? '<path d="M802,' + (GY - top - 82) + ' l38,12 l-38,12 z"/>' : '') +
        litRect(762, GY - top + 22, 16, 22) + litRect(810, GY - top + 22, 16, 22) +
        litRect(762, GY - top + 66, 16, 22) + litRect(810, GY - top + 66, 16, 22) +
      '</g>' +
      courses(748, GY - top, 104, top - 62, 13, 26) +
      '<path class="hrcs-rim2" d="M800,' + (GY - top - 48) + ' L858,' + (GY - top - 4) + '"/>' +
      smoke(838, GY - top - 30);
  }

  function stateClass(st) { return st === 'built' ? '' : st === 'dormant' ? ' is-dorm' : ' is-ghost'; }

  /* ── THE FIVE COMMISSIONABLE WINGS ────────────────────────────────────────
     Each carries an explicit box so the clickable hit area and the hover halo
     are derived from the drawing rather than guessed alongside it. */
  var MARKS = {
    tavern: {
      box: [270, GY - 112, 178, 112],
      draw: function (st) {
        return '<g class="hrcs-b' + stateClass(st) + '">' +
            '<rect x="286" y="' + (GY - 58) + '" width="112" height="58"/>' +
            '<path d="M276,' + (GY - 56) + ' L342,' + (GY - 92) + ' L408,' + (GY - 56) + ' Z"/>' +
            '<rect x="378" y="' + (GY - 104) + '" width="13" height="30"/>' +
            '<path d="M410,' + (GY - 66) + ' h26 v4 h-10 v14 h-6 v-14 h-10 z"/>' +
            litRect(300, GY - 46, 18, 20) + litRect(352, GY - 46, 18, 20) +
          '</g>' +
          (st === 'ghost' ? '' : planks(286, GY - 58, 112, 58, 14) + smoke(384, GY - 106));
      }
    },
    treasury: {
      box: [628, GY - 122, 86, 122],
      draw: function (st) {
        return '<g class="hrcs-b' + stateClass(st) + '">' +
            '<rect x="640" y="' + (GY - 92) + '" width="62" height="92"/>' +
            '<path d="M634,' + (GY - 90) + ' L671,' + (GY - 118) + ' L708,' + (GY - 90) + ' Z"/>' +
            litRect(660, GY - 78, 14, 18) +
          '</g>' +
          (st === 'ghost' ? '' : courses(640, GY - 92, 62, 92, 12, 22));
      }
    },
    war_room: {
      box: [894, GY - 160, 70, 160],
      draw: function (st) {
        return '<g class="hrcs-b' + stateClass(st) + '">' +
            crenel(902, GY - 122, 54, 122, 13) +
            '<rect x="926" y="' + (GY - 156) + '" width="4" height="34"/>' +
            litRect(918, GY - 106, 14, 20) + litRect(918, GY - 62, 14, 20) +
          '</g>' +
          (st === 'ghost' ? '' : courses(902, GY - 122, 54, 122, 12, 26));
      }
    },
    sawmill: {
      box: [1108, GY - 82, 176, 82],
      draw: function (st) {
        return '<g class="hrcs-b' + stateClass(st) + '">' +
            '<rect x="1136" y="' + (GY - 46) + '" width="92" height="46"/>' +
            '<path d="M1128,' + (GY - 44) + ' L1182,' + (GY - 76) + ' L1236,' + (GY - 44) + ' Z"/>' +
            '<path d="M1240,' + GY + ' h34 l-6,-13 h-22 z"/>' +
            '<circle cx="1128" cy="' + (GY - 20) + '" r="15"/>' +
            litRect(1160, GY - 34, 16, 18) +
          '</g>' +
          (st === 'ghost' ? '' : planks(1136, GY - 46, 92, 46, 12));
      }
    },
    smeltery: {
      box: [1272, GY - 110, 120, 110],
      draw: function (st) {
        return '<g class="hrcs-b' + stateClass(st) + '">' +
            '<rect x="1288" y="' + (GY - 48) + '" width="86" height="48"/>' +
            '<path d="M1280,' + (GY - 46) + ' L1331,' + (GY - 72) + ' L1382,' + (GY - 46) + ' Z"/>' +
            '<rect x="1352" y="' + (GY - 104) + '" width="20" height="42"/>' +
            litRect(1306, GY - 36, 18, 20) +
          '</g>' +
          (st === 'ghost' ? '' : courses(1288, GY - 48, 86, 48, 12, 22) + smoke(1362, GY - 106));
      }
    }
  };

  /* Every structure in the hold is a door. The <g> carries the same data-cs
     contract the buttons do, so one delegated listener serves the picture and
     the chip row alike, and a keyboard user reaches the room the same way.
     The transparent hitbox is what makes a dashed outline as clickable as a
     solid wall — without it, a ghosted wing would be nearly un-hittable. */
  function clickable(id, name, box, inner) {
    return '<g class="hrcs-room" data-cs="room" data-b="' + id + '" role="button" tabindex="0" ' +
        'aria-label="' + esc(name) + '">' +
        '<title>' + esc(name) + '</title>' +
        '<ellipse class="hrcs-halo" cx="' + (box[0] + box[2] / 2) + '" cy="' + (box[1] + box[3] * 0.72) +
          '" rx="' + (box[2] * 0.78) + '" ry="' + (box[3] * 0.62) + '"/>' +
        inner +
        '<rect class="hrcs-hitbox" x="' + box[0] + '" y="' + box[1] +
          '" width="' + box[2] + '" height="' + box[3] + '"/>' +
      '</g>';
  }

  function holdScene(tier, lv, dorm) {
    lv = lv || {};
    function st(id) {
      if (!(lv[id] > 0)) return 'ghost';
      return dorm ? 'dormant' : 'built';
    }
    var wings = '';
    ['tavern', 'treasury', 'war_room', 'sawmill', 'smeltery'].forEach(function (id) {
      var m = MARKS[id], b = buildingDef(id);
      wings += clickable(id, (b && b.name) || id, m.box, m.draw(st(id)));
    });
    // The hall's door. At tier 1 there is no hall yet, so the door is the thing
    // that stands for it: the gate piers and the banner planted between them —
    // the exact ground the gatehouse occupies from tier 4 on.
    var hallBox = tier >= 4 ? [736, GY - 266, 128, 266] : tier >= 3 ? [736, GY - 190, 128, 190]
      : tier >= 2 ? [744, GY - 144, 112, 144] : [GATE_L - 6, GY - 128, GATE_R - GATE_L + 12, 128];
    return '<svg class="hrcs-svg" viewBox="0 0 1600 300" preserveAspectRatio="xMidYMax slice" focusable="false">' +
      '<defs>' +
        '<linearGradient id="hrcsSky" x1="0" y1="0" x2="0" y2="1">' +
          '<stop class="hrcs-s0" offset="0%"/><stop class="hrcs-s1" offset="26%"/>' +
          '<stop class="hrcs-s2" offset="44%"/><stop class="hrcs-s3" offset="55%"/>' +
          '<stop class="hrcs-s4" offset="64%"/></linearGradient>' +
        '<radialGradient id="hrcsGlow" cx="50%" cy="50%" r="50%">' +
          '<stop class="hrcs-g0" offset="0%"/><stop class="hrcs-g1" offset="48%"/><stop class="hrcs-g2" offset="100%"/></radialGradient>' +
        '<linearGradient id="hrcsHaze" x1="0" y1="0" x2="0" y2="1">' +
          '<stop class="hrcs-h0" offset="0%"/><stop class="hrcs-h1" offset="100%"/></linearGradient>' +
        '<radialGradient id="hrcsFire" cx="50%" cy="50%" r="50%">' +
          '<stop class="hrcs-f0" offset="0%"/><stop class="hrcs-f1" offset="100%"/></radialGradient>' +
        '<radialGradient id="hrcsHalo" cx="50%" cy="50%" r="50%">' +
          '<stop class="hrcs-q0" offset="0%"/><stop class="hrcs-q1" offset="100%"/></radialGradient>' +
      '</defs>' +
      '<rect width="1600" height="300" fill="url(#hrcsSky)"/>' +
      '<ellipse cx="800" cy="180" rx="520" ry="104" fill="url(#hrcsGlow)"/>' +
      '<g class="hrcs-star">' + starField(30, 1600, 120) + '</g>' +
      '<path class="hrcs-ridge-far" d="M0,180 L210,152 L430,184 L680,140 L920,188 L1170,148 L1400,182 L1600,154 V300 H0 Z"/>' +
      '<path class="hrcs-rim" d="M680,140 L920,188 L1170,148 L1400,182 L1600,154"/>' +
      '<rect x="0" y="152" width="1600" height="88" fill="url(#hrcsHaze)"/>' +
      pineRow([70, 112, 158, 1470, 1516, 1560], 198, .7) +
      '<path class="hrcs-ridge-mid" d="M0,216 Q300,192 640,214 T1240,210 T1600,200 V300 H0 Z"/>' +
      terrace() +
      siteWorks(tier) +
      wings +
      clickable('great_hall', 'The Great Hall', hallBox, greatHallMark(tier, dorm) + defences(tier)) +
      '<path class="hrcs-ridge-near" d="M0,' + (GY + 6) + ' Q340,' + (GY - 10) + ' 700,' + (GY + 5) +
        ' T1330,' + (GY + 3) + ' T1600,' + (GY - 4) + ' V300 H0 Z"/>' +
      '<path class="hrcs-track" d="M210,300 Q520,286 700,268 T812,' + (GY - 1) + ' L768,' + (GY - 1) +
        ' Q640,278 470,292 T90,300 Z"/>' +
      pineRow([20, 56, 1552, 1592], GY + 8, 1) +
      '</svg>';
  }

  /* ── SIX INTERIORS ────────────────────────────────────────────────────────
     Each room modal opens on its own space, drawn at 620x190 in the same idiom
     as the hold. They are NOT six recolours of one frame: a vault is an arch
     and iron, a tavern is a hearth and barrels, a mill is a blade and a log
     carriage. That difference is the whole point of making a building a place
     you walk into rather than a row you expand.

     Every interior shares three structural elements so they still read as one
     castle: a coursed (or planked) back wall, a floor line, and one real light
     source that throws the room's colour. */
  var RW = 620, RH = 190, RF = 156;      // width, height, floor line

  function roomShell(kind, extraDefs) {
    var wall = kind === 'timber'
      ? '<rect class="hrcs-wall-2" x="0" y="0" width="' + RW + '" height="' + RF + '"/>' +
        planks(0, 0, RW, RF, 17)
      : '<rect class="hrcs-wall-2" x="0" y="0" width="' + RW + '" height="' + RF + '"/>' +
        courses(0, 0, RW, RF, 19, 46);
    return { defs: extraDefs || '', wall: wall };
  }
  function roomSvg(inner, defs) {
    /* xMidYMax: the FLOOR is the anchor. Cropping a room from the ceiling down
       loses a rafter; cropping it from the floor up loses the furniture, which
       is the half that says which room this is. */
    return '<svg class="hr-room-svg" viewBox="0 0 ' + RW + ' ' + RH + '" preserveAspectRatio="xMidYMax slice" ' +
      'aria-hidden="true" focusable="false"><defs>' +
      '<radialGradient id="hrcsRoomFire" cx="50%" cy="50%" r="50%">' +
        '<stop class="hrcs-f0" offset="0%"/><stop class="hrcs-f1" offset="100%"/></radialGradient>' +
      '<radialGradient id="hrcsRoomHot" cx="50%" cy="50%" r="50%">' +
        '<stop class="hrcs-f2" offset="0%"/><stop class="hrcs-f1" offset="100%"/></radialGradient>' +
      (defs || '') + '</defs>' + inner +
      '<rect class="hrcs-floor" x="0" y="' + RF + '" width="' + RW + '" height="' + (RH - RF) + '"/>' +
      '<path class="hrcs-rim2" d="M0,' + RF + ' H' + RW + '"/>' +
      '</svg>';
  }
  function banner(x, y, h, w) {
    w = w || 26;
    return '<g class="hrcs-banner"><rect x="' + (x - w / 2 - 4) + '" y="' + (y - 5) + '" width="' + (w + 8) + '" height="5"/>' +
      '<path d="M' + (x - w / 2) + ',' + y + ' h' + w + ' v' + h + ' l' + (-w / 2) + ',-11 l' + (-w / 2) + ',11 z"/></g>';
  }

  var ROOM_ART = {
    /* THE GREAT HALL — the room the hold gathers in. A dais, a high seat, the
       long table, and the banners that are the only thing clan level buys. */
    great_hall: function (tier) {
      var t = Math.max(1, tier | 0);
      var s = roomShell('stone');
      var art = s.wall +
        // arched windows, lit from outside
        '<g class="hrcs-arch"><path d="M96,84 v-30 a24,24 0 0 1 48,0 v30 z"/>' +
          '<path d="M476,84 v-30 a24,24 0 0 1 48,0 v30 z"/></g>' +
        '<g class="hrcs-litglass"><path d="M102,80 v-26 a18,18 0 0 1 36,0 v26 z"/>' +
          '<path d="M482,80 v-26 a18,18 0 0 1 36,0 v26 z"/></g>' +
        // banners: one per tier, so the room fills up as the hold rises
        (function () {
          var b = '', xs = [216, 258, 362, 404, 310];
          for (var i = 0; i < Math.min(5, t); i++) b += banner(xs[i], 16, 62, 28);
          return b;
        })() +
        // the dais and the high seat
        '<g class="hrcs-furn"><path d="M236,' + RF + ' h148 v-10 h-14 v-10 h-120 v10 h-14 z"/>' +
          '<rect x="292" y="60" width="36" height="76"/>' +
          '<path d="M290,62 l20,-26 l20,26 z"/></g>' +
        // the long table with candles
        '<g class="hrcs-furn"><rect x="60" y="128" width="180" height="7"/>' +
          '<rect x="72" y="135" width="6" height="21"/><rect x="222" y="135" width="6" height="21"/>' +
          '<rect x="380" y="128" width="180" height="7"/>' +
          '<rect x="392" y="135" width="6" height="21"/><rect x="542" y="135" width="6" height="21"/></g>' +
        '<g class="hrcs-lit"><rect x="108" y="118" width="4" height="10"/><rect x="176" y="118" width="4" height="10"/>' +
          '<rect x="436" y="118" width="4" height="10"/><rect x="506" y="118" width="4" height="10"/></g>' +
        '<ellipse fill="url(#hrcsRoomFire)" cx="310" cy="120" rx="250" ry="80"/>';
      // the three trophies, hung only when the hold has actually taken them
      if (t >= 5) {
        art += '<g class="hrcs-trophy">' +
          '<path d="M274,34 l9,-14 l9,9 l9,-14 l9,14 l-5,12 h-26 z"/>' +
          '<path d="M312,40 q14,-6 21,8 q-12,9 -21,-8 z"/>' +
          '<path d="M348,32 l9,-12 l9,12 l-9,13 z"/></g>';
      }
      return roomSvg(art);
    },

    /* THE TREASURY — a vault, not an office. Thick arch, an iron-bound door,
       chests, and the shelf of ledgers that makes clan_ledger a real object. */
    treasury: function (lv) {
      var s = roomShell('stone');
      var art = s.wall +
        // the vault arch
        '<g class="hrcs-arch"><path d="M198,' + RF + ' v-74 a112,112 0 0 1 224,0 v74 h-22 v-74 a90,90 0 0 0 -180,0 v74 z"/></g>' +
        '<g class="hrcs-furn"><path d="M226,' + RF + ' v-70 a84,84 0 0 1 168,0 v70 z"/></g>' +
        courses(226, 60, 168, RF - 60, 17, 40) +
        // the door band and the wheel lock
        '<g class="hrcs-iron"><rect x="226" y="92" width="168" height="9"/><rect x="226" y="126" width="168" height="9"/>' +
          '<circle cx="310" cy="112" r="21"/></g>' +
        '<g class="hrcs-wall-2"><circle cx="310" cy="112" r="13"/></g>' +
        '<g class="hrcs-iron"><rect x="306" y="88" width="8" height="48"/><rect x="286" y="108" width="48" height="8"/></g>' +
        // chests either side, one open and spilling
        '<g class="hrcs-furn"><rect x="60" y="118" width="86" height="38"/><path d="M56,118 h94 l-10,-16 h-74 z"/>' +
          '<rect x="472" y="122" width="80" height="34"/></g>' +
        '<g class="hrcs-iron"><rect x="98" y="118" width="10" height="38"/><rect x="506" y="122" width="10" height="34"/></g>' +
        '<g class="hrcs-gilt"><ellipse cx="86" cy="114" rx="16" ry="5"/><ellipse cx="118" cy="112" rx="12" ry="4"/>' +
          '<ellipse cx="500" cy="119" rx="14" ry="4"/></g>' +
        // ledgers on a shelf, plus a lantern
        '<g class="hrcs-furn"><rect x="452" y="52" width="112" height="6"/>' +
          '<rect x="462" y="26" width="9" height="26"/><rect x="474" y="30" width="9" height="22"/>' +
          '<rect x="486" y="24" width="9" height="28"/><rect x="498" y="31" width="9" height="21"/></g>' +
        '<g class="hrcs-lit"><rect x="150" y="46" width="14" height="18" rx="2"/></g>' +
        '<ellipse fill="url(#hrcsRoomFire)" cx="157" cy="60" rx="120" ry="70"/>' +
        '<ellipse fill="url(#hrcsRoomFire)" cx="310" cy="130" rx="200" ry="66"/>';
      return roomSvg(art);
    },

    /* THE TAVERN — the loudest room in the hold and the only one with a fire
       big enough to see from the door. Hearth, barrels, benches, and the
       Barkeep's chalk board on the wall. */
    tavern: function (lv) {
      var s = roomShell('timber');
      var art = s.wall +
        // the hearth: a stone breast set into a timber wall
        '<g class="hrcs-wall"><rect x="42" y="14" width="176" height="142"/></g>' +
        courses(42, 14, 176, 142, 18, 42) +
        '<g class="hrcs-furn"><rect x="34" y="66" width="192" height="11"/></g>' +
        '<g class="hrcs-hearthmouth"><path d="M84,' + RF + ' v-52 a46,46 0 0 1 92,0 v52 z"/></g>' +
        '<ellipse fill="url(#hrcsRoomHot)" cx="130" cy="130" rx="120" ry="76"/>' +
        '<g class="hrcs-lit"><path d="M108,' + RF + ' q10,-40 22,-12 q9,-42 20,6 q14,-22 8,6 z"/></g>' +
        // a cauldron on a hook
        '<g class="hrcs-iron"><path d="M112,96 h36 v6 a18,18 0 0 1 -36,0 z"/><rect x="126" y="84" width="8" height="12"/></g>' +
        // barrels, stacked
        '<g class="hrcs-furn"><rect x="470" y="104" width="52" height="52" rx="8"/>' +
          '<rect x="528" y="104" width="52" height="52" rx="8"/>' +
          '<rect x="498" y="52" width="52" height="52" rx="8"/></g>' +
        '<g class="hrcs-iron"><rect x="470" y="118" width="52" height="5"/><rect x="470" y="138" width="52" height="5"/>' +
          '<rect x="528" y="118" width="52" height="5"/><rect x="528" y="138" width="52" height="5"/>' +
          '<rect x="498" y="66" width="52" height="5"/><rect x="498" y="86" width="52" height="5"/></g>' +
        // the long bench and table with mugs
        '<g class="hrcs-furn"><rect x="252" y="120" width="190" height="8"/>' +
          '<rect x="264" y="128" width="7" height="28"/><rect x="424" y="128" width="7" height="28"/>' +
          '<rect x="252" y="142" width="190" height="6"/></g>' +
        '<g class="hrcs-gilt"><rect x="286" y="108" width="13" height="12" rx="2"/>' +
          '<rect x="318" y="110" width="13" height="10" rx="2"/><rect x="384" y="108" width="13" height="12" rx="2"/></g>' +
        // the Board itself, chalked
        '<g class="hrcs-slate"><rect x="270" y="26" width="150" height="66" rx="3"/></g>' +
        '<g class="hrcs-chalk"><path d="M284,44 H392 M284,58 H370 M284,72 H398"/></g>' +
        // a hanging lamp
        '<g class="hrcs-iron"><rect x="344" y="0" width="3" height="16"/></g>' +
        '<g class="hrcs-lit"><path d="M336,16 h20 l5,14 h-30 z"/></g>' +
        '<ellipse fill="url(#hrcsRoomFire)" cx="346" cy="34" rx="90" ry="52"/>';
      return roomSvg(art);
    },

    /* THE SAWMILL — a working floor. The blade is the biggest object in the
       room because it is the reason the room exists, and the beams stacked
       against the wall are the thing the whole castle is made of. */
    sawmill: function (lv) {
      var s = roomShell('timber');
      var art = s.wall +
        // roof trusses, because a mill is a shed
        '<g class="hrcs-furn"><path d="M0,44 L310,4 L620,44 v9 L310,13 L0,53 z"/>' +
          '<rect x="306" y="13" width="8" height="46"/>' +
          '<path d="M120,32 L310,60 M500,32 L310,60"/></g>' +
        // the blade on its shaft
        '<g class="hrcs-iron"><rect x="150" y="112" width="180" height="7"/>' +
          '<rect x="234" y="60" width="7" height="52"/></g>' +
        '<g class="hrcs-blade"><circle cx="238" cy="96" r="44"/></g>' +
        '<g class="hrcs-wall-2"><circle cx="238" cy="96" r="10"/></g>' +
        (function () {                       // the teeth
          var t = '<g class="hrcs-blade-teeth">';
          for (var i = 0; i < 24; i++) {
            var a = (i / 24) * Math.PI * 2;
            var x1 = 238 + Math.cos(a) * 44, y1 = 96 + Math.sin(a) * 44;
            var x2 = 238 + Math.cos(a + 0.09) * 51, y2 = 96 + Math.sin(a + 0.09) * 51;
            t += '<path d="M' + x1.toFixed(1) + ',' + y1.toFixed(1) + ' L' + x2.toFixed(1) + ',' + y2.toFixed(1) + '"/>';
          }
          return t + '</g>';
        })() +
        // the log carriage, with a log on it
        '<g class="hrcs-furn"><rect x="120" y="119" width="240" height="9"/>' +
          '<rect x="60" y="104" width="150" height="15" rx="7"/></g>' +
        '<g class="hrcs-iron"><circle cx="150" cy="134" r="8"/><circle cx="330" cy="134" r="8"/></g>' +
        // finished beams, stacked and squared
        '<g class="hrcs-furn"><rect x="430" y="128" width="150" height="13"/>' +
          '<rect x="430" y="113" width="150" height="13"/><rect x="446" y="98" width="118" height="13"/>' +
          '<rect x="446" y="83" width="118" height="13"/></g>' +
        '<g class="hrcs-mortar"><path d="M470,83 V141 M520,83 V141"/></g>' +
        // sawdust, and the one lit window
        '<g class="hrcs-sawdust"><path d="M196,' + RF + ' q22,-22 46,0 z"/></g>' +
        '<g class="hrcs-litglass"><rect x="392" y="48" width="42" height="34" rx="2"/></g>' +
        '<ellipse fill="url(#hrcsRoomFire)" cx="413" cy="66" rx="130" ry="72"/>';
      return roomSvg(art);
    },

    /* THE SMELTERY — the hottest room. Everything is arranged around the
       furnace mouth, and the light comes out of the wall rather than off it. */
    smeltery: function (lv) {
      var s = roomShell('stone');
      var art = s.wall +
        // the furnace: a stone mass with an arched, glowing mouth
        '<g class="hrcs-furn"><path d="M56,' + RF + ' v-124 h172 v124 z"/>' +
          '<path d="M44,32 h196 l-14,-16 h-168 z"/>' +
          '<rect x="126" y="0" width="32" height="16"/></g>' +
        courses(56, 32, 172, RF - 32, 19, 42) +
        '<g class="hrcs-hearthmouth"><path d="M104,' + RF + ' v-46 a38,38 0 0 1 76,0 v46 z"/></g>' +
        '<ellipse fill="url(#hrcsRoomHot)" cx="142" cy="128" rx="150" ry="88"/>' +
        '<g class="hrcs-lit"><path d="M122,' + RF + ' q12,-36 22,-10 q10,-38 20,4 q12,-18 7,6 z"/></g>' +
        // the bellows
        '<g class="hrcs-furn"><path d="M244,120 l52,-16 l0,44 l-52,-12 z"/><rect x="292" y="118" width="46" height="8"/></g>' +
        '<g class="hrcs-iron"><rect x="238" y="112" width="8" height="44"/></g>' +
        // the anvil on its stump
        '<g class="hrcs-iron"><path d="M352,120 h72 l-10,10 h-14 v12 h20 v8 h-64 v-8 h20 v-12 h-14 z"/></g>' +
        '<g class="hrcs-furn"><rect x="368" y="148" width="40" height="8"/></g>' +
        // a rack of finished bars
        '<g class="hrcs-furn"><rect x="470" y="60" width="120" height="6"/><rect x="470" y="104" width="120" height="6"/></g>' +
        '<g class="hrcs-gilt"><rect x="478" y="46" width="34" height="13" rx="2"/><rect x="518" y="46" width="34" height="13" rx="2"/>' +
          '<rect x="478" y="90" width="34" height="13" rx="2"/><rect x="518" y="90" width="34" height="13" rx="2"/></g>' +
        // the quench barrel
        '<g class="hrcs-furn"><rect x="470" y="120" width="54" height="36" rx="7"/></g>' +
        '<g class="hrcs-iron"><rect x="470" y="132" width="54" height="5"/></g>' +
        // sparks off the anvil
        '<g class="hrcs-spark"><circle cx="392" cy="106" r="2.2"/><circle cx="410" cy="96" r="1.6"/>' +
          '<circle cx="374" cy="98" r="1.8"/><circle cx="400" cy="86" r="1.3"/></g>';
      return roomSvg(art);
    },

    /* THE WAR ROOM — the coldest room, deliberately. One candle, a map table,
       and the rack of things the hold takes out with it. */
    war_room: function (lv) {
      var s = roomShell('stone');
      var art = s.wall +
        banner(78, 8, 84, 34) + banner(542, 8, 84, 34) +
        // the map table
        '<g class="hrcs-furn"><path d="M180,110 h260 l16,14 h-292 z"/>' +
          '<rect x="196" y="124" width="10" height="32"/><rect x="414" y="124" width="10" height="32"/>' +
          '<rect x="196" y="146" width="228" height="6"/></g>' +
        '<g class="hrcs-parch"><path d="M198,109 h224 l10,-9 h-244 z"/></g>' +
        '<g class="hrcs-mortar"><path d="M212,104 h196 M226,100 q60,-6 120,0 M240,96 h150"/></g>' +
        // markers on the map
        '<g class="hrcs-marker"><path d="M252,102 l0,-14 l14,4 l-14,4"/><path d="M318,100 l0,-14 l14,4 l-14,4"/>' +
          '<path d="M378,103 l0,-14 l14,4 l-14,4"/></g>' +
        // the weapon rack
        '<g class="hrcs-furn"><rect x="474" y="40" width="106" height="7"/><rect x="474" y="140" width="106" height="7"/></g>' +
        '<g class="hrcs-iron"><rect x="490" y="44" width="5" height="98"/><rect x="512" y="44" width="5" height="98"/>' +
          '<rect x="534" y="44" width="5" height="98"/><rect x="556" y="44" width="5" height="98"/>' +
          '<path d="M486,44 l6,-16 l6,16 z"/><path d="M508,44 l6,-16 l6,16 z"/>' +
          '<path d="M530,44 l6,-16 l6,16 z"/><path d="M552,44 l6,-16 l6,16 z"/></g>' +
        // shields on the left wall
        '<g class="hrcs-furn"><path d="M42,58 h44 v26 a22,26 0 0 1 -44,0 z"/>' +
          '<path d="M104,58 h44 v26 a22,26 0 0 1 -44,0 z"/></g>' +
        // one candle. The War Room is lit for work, not for company.
        '<g class="hrcs-furn"><rect x="146" y="132" width="16" height="6"/><rect x="151" y="112" width="6" height="20"/></g>' +
        '<g class="hrcs-lit"><ellipse cx="154" cy="108" rx="3.5" ry="6"/></g>' +
        '<ellipse fill="url(#hrcsRoomFire)" cx="154" cy="106" rx="150" ry="86"/>';
      return roomSvg(art);
    }
  };

  // ════════════════════════════════════════════════════════════
  // 10 · THE ROOM MODAL — a reusable seam, not a castle feature
  // ════════════════════════════════════════════════════════════
  // Published as window.HearthriseRoomModal.
  //
  // WHY THIS IS GENERIC AND NOT SIX HAND-WRITTEN MODALS
  //   The clan castle is one of the two ultimate progression surfaces; the
  //   personal homestead (`homestead.js` ROOMS) is the other, and it is the same
  //   interaction in every particular: a place you look at, structures you click,
  //   and a room that opens with its own flavour, its current state, its upgrade
  //   ladder and its actions. Writing that six times for the castle and then six
  //   more times for the homestead is how two screens that should feel like one
  //   game drift apart.
  //
  //   So the component takes a DESCRIPTOR and knows nothing about clans:
  //
  //     { id, title, subtitle, theme, scene, sections:[…], onAction }
  //
  //   `theme` is a class suffix (`hall`, `vault`, `tavern`, `mill`, `forge`,
  //   `warroom`) that picks the frame's light and accent in clan-seat.css.
  //   `scene` is any SVG string. `sections` are declarative:
  //
  //     {kind:'note',   html}
  //     {kind:'meter',  label, value, max, valueText, foot, tone}
  //     {kind:'rows',   title, rows:[{name, meta, right, bar, action}], empty}
  //     {kind:'ladder', title, current, cap, rows:[…], note}
  //     {kind:'actions',buttons:[{label, action, data, primary, danger, disabled, why, pin, costs}]}
  //     {kind:'field',  title, select:{name,options}, qty:{name,value}, button:{…}, preview}
  //
  //   ── `pin: true` — THE BUILD BAR (b354) ────────────────────────────────
  //   Tyler: the Build button sat under the flavour, the current bonuses and a
  //   five-rung ladder, so on a phone — and on a 90vh desktop card with a
  //   168px scene — the one control the screen exists for was BELOW THE FOLD.
  //   A player had to scroll a modal to find out they could act at all.
  //
  //   `pin` moves ONE control out of the scrolling body and into a bar between
  //   the header and the body, which never scrolls. It is a flag on the button
  //   (or on a ladder row's `action`) rather than a new section kind, because
  //   the descriptor builders already decide which control is the primary one
  //   and a second grammar for "the same button, higher up" would let a screen
  //   pin something that is not in its own section list.
  //
  //   Rules, deliberately narrow: the FIRST pinned control wins (a modal with
  //   two primary actions has a design problem, not a rendering one), it is
  //   REMOVED from its in-body position so the player never sees two buttons
  //   that do one thing, and `costs:[{have,need,label}]` rides with it — a
  //   Build button whose price is on the other side of a scroll is the same bug
  //   in a smaller font.
  //
  //   The LADDER is the piece that matters most for reuse: "what does level N+1
  //   cost and what does it give me" is the same question a stove upgrade asks
  //   and a Sawmill upgrade asks, and answering it in one place is why they will
  //   look and behave identically.
  //
  //   `open()` takes a BUILD FUNCTION rather than a built descriptor, so the
  //   modal can re-derive itself from live state after every action without the
  //   caller re-opening it.
  //
  // The scrim is the third copy of the `hr-rn-scrim` pattern (renown, daily
  // login, muster). Deliberately not a fourth shape: a player who has closed the
  // Renown ladder already knows how to close this.
  var RoomModal = (function () {
    var _build = null;

    function close() {
      var m = document.querySelector('.hr-room-scrim');
      if (m) m.remove();
      _build = null;
    }
    function isOpen() { return !!document.querySelector('.hr-room-scrim'); }

    function open(buildFn) {
      if (typeof buildFn !== 'function') return null;
      _build = buildFn;
      return paint();
    }
    function refresh() { if (_build && isOpen()) paint(); }

    /* b330 — A REPAINT MUST NOT SILENTLY UNDO WHAT THE PLAYER JUST CHOSE.
       paint() rebuilds the whole modal, and refresh() is called by a dozen
       things (an armed button, a finished RPC, a 30-second feast timer). Before
       this, every <select>, quantity and text box in the room was reset to its
       descriptor default on each of those. It was CAUGHT at runtime rather than
       reasoned about: choosing a 24-hour bar and then clicking Remove — which
       arms the button, which repaints — sent 168 hours, because the select had
       silently snapped back to its first option between the two clicks. A
       control that quietly reverts is worse than one that is missing.

       So the values are carried across, keyed by the control's name, and only
       when the new DOM still offers that value (an option list can legitimately
       change under it). Focus and caret come with them, or typing a display
       name would be interrupted by any background refresh. scrollTop was
       already preserved for exactly this reason; this is the same idea applied
       to the thing the player actually typed. */
    function snapshotFields(root) {
      var keep = { val: {}, focus: null, sel: null };
      if (!root) return keep;
      [].forEach.call(root.querySelectorAll('[data-cs-sel],[data-cs-qty],[data-cs-txt]'), function (el) {
        keep.val[fieldKey(el)] = el.value;
      });
      var a = document.activeElement;
      if (a && root.contains(a) && a.matches && a.matches('[data-cs-sel],[data-cs-qty],[data-cs-txt]')) {
        keep.focus = fieldKey(a);
        try { keep.sel = [a.selectionStart, a.selectionEnd]; } catch (e) { keep.sel = null; }
      }
      return keep;
    }
    function fieldKey(el) {
      return (el.getAttribute('data-cs-sel') ? 'sel:' : el.getAttribute('data-cs-qty') ? 'qty:' : 'txt:') +
        (el.getAttribute('data-cs-sel') || el.getAttribute('data-cs-qty') || el.getAttribute('data-cs-txt'));
    }
    function restoreFields(root, keep) {
      if (!root || !keep) return;
      [].forEach.call(root.querySelectorAll('[data-cs-sel],[data-cs-qty],[data-cs-txt]'), function (el) {
        var k = fieldKey(el);
        if (!(k in keep.val)) return;
        var v = keep.val[k];
        if (el.tagName === 'SELECT' && !([].some.call(el.options, function (o) { return o.value === v; }))) return;
        if (el.value === v) return;
        el.value = v;
        /* Anything DERIVED from a field (the Storehouse's payout preview) is
           rebuilt from the descriptor's defaults, so a restored value has to
           re-announce itself or the preview would describe a different choice
           than the one showing. Same event the player's own edit fires. */
        try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
      });
      if (!keep.focus) return;
      var back = null;
      [].forEach.call(root.querySelectorAll('[data-cs-sel],[data-cs-qty],[data-cs-txt]'), function (el) {
        if (fieldKey(el) === keep.focus) back = el;
      });
      if (!back) return;
      try {
        back.focus();
        if (keep.sel && back.setSelectionRange) back.setSelectionRange(keep.sel[0], keep.sel[1]);
      } catch (e) {}
    }

    /* ── THE PIN PASS ────────────────────────────────────────────────────
       Pure: takes the descriptor's section list and returns
       `{ pin, sections }` — the pinned control and a section list with that
       control removed. It never mutates the descriptor, because `_build()` is
       also what the smoke suite and the grid cards read, and a render that
       edited its input would make "what the descriptor says" depend on whether
       anything had painted it yet.

       Two shapes carry a pin, and they are the two shapes that already express
       "the thing you came here to press":
         · an `actions` button (the homestead's Build/Upgrade, which exists even
           when it is disabled — a named reason at the top of the modal is worth
           more than a button at the bottom);
         · a `ladder` row's `action` (the castle's Commission / Raise the hold,
           which only exists when it can actually be taken). The row's own
           `costs` come with it, so the bar states the price without any caller
           restating one. */
    function hoistPin(sections) {
      var list = sections || [], out = [], pin = null, i, j;
      for (i = 0; i < list.length; i++) {
        var s = list[i];
        if (!s) { out.push(s); continue; }
        if (!pin && s.kind === 'actions' && s.buttons) {
          var keep = [];
          for (j = 0; j < s.buttons.length; j++) {
            var b = s.buttons[j];
            if (!pin && b && b.pin) {
              pin = { label: b.label, action: b.action, data: b.data, disabled: !!b.disabled,
                      why: b.why || '', whyCovered: !!b.whyCovered,
                      costs: b.costs || null, gates: b.gates || null,
                      level: b.level || null,
                      primary: b.primary !== false };
            } else keep.push(b);
          }
          /* A section that held ONLY the pinned button must not leave an empty
             action row behind — an 8px gap where a button used to be reads as a
             rendering fault. */
          if (pin && !keep.length) continue;
          out.push(pin ? { kind: 'actions', buttons: keep } : s);
          continue;
        }
        if (!pin && s.kind === 'ladder' && s.rows) {
          var rows = s.rows.map(function (r) {
            if (pin || !r || !r.action || !r.action.pin) return r;
            var a = r.action;
            pin = { label: a.label, action: a.name, data: a.data, disabled: false,
                    why: '', costs: r.costs || null, gates: r.gates || null,
                    level: r.level == null ? null : r.level,
                    primary: true };
            var copy = {}; for (var k in r) if (Object.prototype.hasOwnProperty.call(r, k)) copy[k] = r[k];
            copy.action = null;
            return copy;
          });
          out.push(pin ? { kind: 'ladder', title: s.title, rows: rows, note: s.note } : s);
          continue;
        }
        out.push(s);
      }
      return { pin: pin, sections: out };
    }

    /* ── THE THIRD REQUIREMENT CLASS (b355) ──────────────────────────────
       Tyler, live, on the Kitchen: "this doesn't tell me anywhere it requires
       a blueprint or how to get a blueprint."

       A rung has three kinds of requirement and they are not the same kind of
       problem for a player:
         (a) an affordable cost           — a number, already met
         (b) a short cost                 — a number, go grind it
         (c) an ITEM GATE (blueprint, key) — a THING, and grinding will not get
             it; you have to go to a SPECIFIC place
       (a) and (b) are the same component with two states, which is correct.
       Rendering (c) as a third cost chip ("0/1 Kitchen Blueprint II") was the
       trap: it reads as one more plank when it is actually "you cannot start".
       So a gate is its OWN line, and — because "where do I get one" is the
       immediate next question and the toast used to answer it with hardcoded
       prose — the line carries the item's real source from the reverse index.

       `spent` is the owned-rung state: the requirement stays visible on a rung
       you already built, so a player scanning the ladder sees that rungs 2 and
       3 want blueprints BEFORE reaching one they cannot pay for. */
    /* ── ONE COST CHIP, TWO PLACES (b372) ─────────────────────────────────
       The pinned build bar and the upgrade ladder were rendering the same
       have/need chip from two nearly-identical expressions, and only one of
       them handled `known === false`. They are one function now, which is what
       lets the b372 inspect link land on BOTH without a second chance to get
       it half-done.

       The link itself: KD420 asked for the maple planks in his house upgrade
       to say where they come from, and a room rung is the same question one
       screen over. `c.id` rides on every cost line (homestead costTriples,
       castle wingLadder); where it is absent — the gold line — hrInspectAttrs
       returns '' and the chip stays inert text, which is correct because gold
       is not an item and its flyout would be empty.

       `.hr-si` on the label is the affordance hook: these chips are flex, and
       a flex container does not propagate text-decoration to its children, so
       the dotted underline has to sit on an inner inline span. */
    function costChip(c) {
      var insp = (typeof window.hrInspectAttrs === 'function') ? window.hrInspectAttrs(c.id) : '';
      var hint = (typeof window.hrInspectHint === 'function') ? window.hrInspectHint(c.id) : '';
      var label = '<span class="hr-si">' + esc(c.label) + '</span>';
      var title = insp ? ' title="' + esc(c.label + hint) + '"' : '';
      /* `known === false` is a balance the server has not sent yet. It is
         neither full nor short — it renders as the pending dash, the same
         glyph the rest of the game uses for that state. */
      if (c.known === false) {
        return '<span class="hr-cs-qty"' + insp + title + '><span class="bal-pending" role="status" '
          + 'title="Waiting for the server">—</span>/' + nfmt(c.need) + ' ' + label + '</span>';
      }
      return '<span class="hr-cs-qty' + (c.have != null && c.have >= c.need ? ' is-full' : '') + '"' + insp + title + '>' +
        (c.have != null ? nfmt(c.have) + '/' : '') + nfmt(c.need) + ' ' + label + '</span>';
    }

    function gateLines(list) {
      var g = (list || []).filter(Boolean);
      if (!g.length) return '';
      return '<div class="hr-room-gates">' + g.map(function (x) {
        var cls = x.spent ? 'is-spent' : x.ok ? 'is-met' : 'is-need';
        var state = x.spent ? 'Spent' : x.ok
          ? ('In your bags' + (x.have > 1 ? ' (' + nfmt(x.have) + ')' : ''))
          : 'You have none';
        /* b372: the gate is the requirement a player is MOST likely to tap —
           it is the one they cannot grind for. b355 already prints its source
           line underneath; the name now also opens the full flyout, where the
           value, the description and the complete source list live. */
        var gi = (typeof window.hrInspectAttrs === 'function') ? window.hrInspectAttrs(x.id) : '';
        var gh = (typeof window.hrInspectHint === 'function') ? window.hrInspectHint(x.id) : '';
        return '<div class="hr-room-gate ' + cls + '">' +
          '<span class="hr-room-gate-hd">' +
            '<span class="hr-room-gate-nm"' + gi + (gi ? ' title="' + esc((x.name || x.id) + gh) + '"' : '') +
              '>' + esc(x.name || x.id) + '</span>' +
            '<span class="hr-room-gate-st">' + esc(state) + '</span>' +
          '</span>' +
          /* No source line is better than an invented one — an item the index
             has no route for says nothing rather than guessing "dungeons". */
          (x.source ? '<span class="hr-room-gate-src">' + esc(x.source) + '</span>' : '') +
        '</div>';
      }).join('') + '</div>';
    }

    /* The bar itself. Everything in it is already-computed descriptor data —
       no price is derived here, and the cost chips are the SAME `hr-cs-qty`
       have/need component the ladder uses, so "met" reads identically in both
       places. */
    function buildBar(p) {
      if (!p) return '';
      var chips = (p.costs || []).map(costChip).join(' &middot; ');
      var btn = p.disabled
        ? '<button class="btn btn-sm" disabled title="' + esc(p.why || '') + '">' + esc(p.label) + '</button>'
        : '<button class="btn btn-sm ' + (p.primary ? 'btn-primary' : '') + '" data-cs="' + esc(p.action) + '"' +
          (p.data ? Object.keys(p.data).map(function (k) {
            return ' data-' + k + '="' + esc(p.data[k]) + '"';
          }).join('') : '') + '>' + esc(p.label) + '</button>';
      return '<div class="hr-room-build">' +
        '<div class="hr-cs-grow">' +
          (p.level != null ? '<span class="hr-room-build-lv">Lv ' + esc(p.level) + '</span>' : '') +
          (chips ? '<span class="hr-room-build-cost">' + chips + '</span>'
                 : '<span class="hr-room-build-cost is-free">Ready to build</span>') +
          (p.disabled && p.why && !p.whyCovered ? '<div class="hr-room-build-why">' + esc(p.why) + '</div>' : '') +
          /* The gate rides in the PINNED bar, never in a toast: the bar is the
             one strip of this modal that cannot be scrolled away from, so the
             reason a Build button is dead is on screen the moment it opens. */
          gateLines(p.gates) +
        '</div>' + btn +
      '</div>';
    }

    function paint() {
      var d = _build();
      if (!d) { close(); return null; }
      var prev = document.querySelector('.hr-room-scrim');
      var scrollTop = prev ? (prev.querySelector('.hr-room-body') || {}).scrollTop || 0 : 0;
      var keep = snapshotFields(prev);
      if (prev) prev.remove();

      var hoisted = hoistPin(d.sections);
      var sc = document.createElement('div');
      sc.className = 'hr-room-scrim hr-cs';
      sc.innerHTML =
        '<div class="hr-room-wrap" data-room-theme="' + esc(d.theme || 'hall') + '" role="dialog" aria-modal="true" ' +
            'aria-label="' + esc(d.title || '') + '">' +
          '<div class="hr-room-head">' +
            (d.scene ? '<div class="hr-room-scene">' + d.scene + '</div>' : '') +
            '<div class="hr-room-title"><h3>' + esc(d.title || '') + '</h3>' +
              (d.subtitle ? '<div class="hr-room-sub">' + d.subtitle + '</div>' : '') + '</div>' +
            '<button class="hr-room-x" data-close="1" aria-label="Close">' + (gly('uiClose', 13) || '&#10005;') + '</button>' +
          '</div>' +
          /* OUTSIDE `.hr-room-body`, which is the element that scrolls. That is
             the whole fix: no amount of body content can push this off screen. */
          buildBar(hoisted.pin) +
          '<div class="hr-room-body">' + hoisted.sections.map(section).join('') + '</div>' +
        '</div>';
      sc.addEventListener('click', function (e) {
        if (e.target === sc || (e.target.closest && e.target.closest('[data-close]'))) { close(); return; }
        var t = e.target.closest && e.target.closest('[data-cs]');
        if (t && d.onAction) d.onAction(t.getAttribute('data-cs'), t, sc);
      });
      var relay = function (e) { if (d.onInput) d.onInput(e, sc); };
      sc.addEventListener('change', relay);
      sc.addEventListener('input', relay);
      sc.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
      document.body.appendChild(sc);
      var body = sc.querySelector('.hr-room-body');
      if (body && scrollTop) body.scrollTop = scrollTop;
      restoreFields(sc, keep);
      return sc;
    }

    function section(s) {
      if (!s) return '';
      if (s.kind === 'note') return '<div class="hr-room-note">' + (s.html || '') + '</div>';
      if (s.kind === 'meter') {
        return (s.title ? eyebrow(s.title) : '') +
          '<div class="hr-cs-line"><span class="hr-cs-label">' + esc(s.label || '') + '</span>' +
          '<span class="hr-cs-val">' + (s.valueText || '') + '</span></div>' +
          bar(s.tone || '', s.value || 0, s.max || 1) +
          (s.foot ? '<div class="hr-cs-foot">' + s.foot + '</div>' : '');
      }
      if (s.kind === 'rows') {
        var body = (s.rows || []).map(function (r) {
          return '<div class="hr-cs-row"><div class="hr-cs-grow">' +
            '<div class="hr-cs-nm">' + (r.name || '') + '</div>' +
            (r.meta ? '<div class="hr-cs-meta">' + r.meta + '</div>' : '') +
            (r.bar ? bar(r.bar.tone || '', r.bar.value, r.bar.max) : '') +
            '</div>' + (r.right || '') + '</div>';
        }).join('');
        return (s.title ? eyebrow(s.title) : '') +
          (body || '<div class="hr-cs-empty">' + (s.empty || 'Nothing here yet.') + '</div>');
      }
      if (s.kind === 'ladder') return ladder(s);
      if (s.kind === 'actions') {
        return '<div class="hr-cs-acts">' + (s.buttons || []).map(function (b) {
          if (b.disabled) {
            return '<button class="btn btn-sm" disabled title="' + esc(b.why || '') + '">' +
              esc(b.label) + (b.why ? ' — ' + esc(b.why) : '') + '</button>';
          }
          return '<button class="btn btn-sm ' + (b.primary ? 'btn-primary' : b.danger ? 'btn-danger' : '') +
            '" data-cs="' + esc(b.action) + '"' +
            (b.data ? Object.keys(b.data).map(function (k) {
              return ' data-' + k + '="' + esc(b.data[k]) + '"';
            }).join('') : '') + '>' + esc(b.label) + '</button>';
        }).join('') + '</div>';
      }
      if (s.kind === 'field') {
        return (s.title ? eyebrow(s.title) : '') +
          (s.intro ? '<div class="hr-cs-foot">' + s.intro + '</div>' : '') +
          '<div class="hr-cs-field">' +
            /* `value` preselects. Without it a select that reflects live server
               state (the hold's door) would open showing the wrong answer and
               invite a leader to "change" it to what it already is. */
            (s.select ? '<select data-cs-sel="' + esc(s.select.name) + '"' +
              (s.select.label ? ' aria-label="' + esc(s.select.label) + '"' : '') + '>' +
              (s.select.options || []).map(function (o) {
                return '<option value="' + esc(o.value) + '"' +
                  (s.select.value != null && String(s.select.value) === String(o.value) ? ' selected' : '') +
                  '>' + esc(o.label) + '</option>';
              }).join('') + '</select>' : '') +
            /* A free-text field, for a descriptor that needs a name typed rather
               than picked from a list. Whatever is typed is a LOOKUP KEY the
               caller resolves server-side; this component never stores it. */
            (s.text ? '<input type="text" data-cs-txt="' + esc(s.text.name) + '" maxlength="' +
              (s.text.maxlength || 24) + '" value="' + esc(s.text.value || '') +
              '" placeholder="' + esc(s.text.placeholder || '') +
              '" aria-label="' + esc(s.text.placeholder || s.text.name) + '">' : '') +
            (s.qty ? '<input type="number" min="1" step="1" value="' + esc(s.qty.value == null ? 1 : s.qty.value) +
              '" data-cs-qty="' + esc(s.qty.name) + '" placeholder="' + esc(s.qty.placeholder || 'Quantity') +
              '" aria-label="' + esc(s.qty.placeholder || 'quantity') + '">' : '') +
            (s.button ? '<button class="btn btn-sm btn-primary" data-cs="' + esc(s.button.action) + '">' +
              esc(s.button.label) + '</button>' : '') +
          '</div>' +
          (s.previewId ? '<div class="hr-cs-preview" id="' + esc(s.previewId) + '">' + (s.preview || '') + '</div>' : '');
      }
      return '';
    }
    function eyebrow(t) { return '<div class="hr-cs-eyebrow">' + t + '</div>'; }

    /* THE UPGRADE LADDER. Three rungs, not ten: what it costs now, and enough
       of what comes after to make the decision a decision. A row is dimmed when
       the castle tier will not allow it yet, and it SAYS the reason rather than
       just going grey. */
    function ladder(s) {
      var rows = (s.rows || []).map(function (r) {
        return '<div class="hr-room-rung' + (r.locked ? ' is-locked' : '') + (r.next ? ' is-next' : '') + '">' +
          '<div class="hr-room-rung-lv">Lv ' + r.level + '</div>' +
          '<div class="hr-cs-grow">' +
            '<div class="hr-cs-nm">' + (r.effect || '') + '</div>' +
            (r.costs ? '<div class="hr-cs-meta">' + r.costs.map(costChip).join(' &middot; ') + '</div>' : '') +
            (r.why ? '<div class="hr-cs-meta">' + esc(r.why) + '</div>' : '') +
            gateLines(r.gates) +
          '</div>' +
          (r.action
            ? '<button class="btn btn-sm btn-primary" data-cs="' + esc(r.action.name) + '"' +
              (r.action.data ? Object.keys(r.action.data).map(function (k) {
                return ' data-' + k + '="' + esc(r.action.data[k]) + '"';
              }).join('') : '') + '>' + esc(r.action.label) + '</button>'
            : '') +
          '</div>';
      }).join('');
      return (s.title ? eyebrow(s.title) : '') +
        '<div class="hr-room-ladder">' + (rows || '<div class="hr-cs-empty">Nothing further to build here.</div>') + '</div>' +
        (s.note ? '<div class="hr-room-note">' + s.note + '</div>' : '');
    }

    return { open: open, close: close, refresh: refresh, isOpen: isOpen,
             _section: section, _hoistPin: hoistPin };
  })();
  window.HearthriseRoomModal = RoomModal;

  // ════════════════════════════════════════════════════════════
  // 11 · RENDER — the panel is a place, the rooms do the work
  // ════════════════════════════════════════════════════════════
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function nfmt(v) { return Math.max(0, Math.floor(+v || 0)).toLocaleString(); }
  var n = nfmt;
  function pct(a, b) { return b > 0 ? Math.max(0, Math.min(100, Math.round(100 * a / b))) : 0; }
  function itemName(id) {
    var d = (window.ITEMS || {})[id];
    return (d && d.n) || String(id || '').replace(/_/g, ' ');
  }
  function gly(key, px) {
    return (window.HR && window.HR.icon) ? (window.HR.icon(key, px || 16, 'currentColor') || '') : '';
  }
  function fmtLeft(ms) {
    ms = Math.max(0, ms | 0);
    var m = Math.floor(ms / 60000), h = Math.floor(m / 60);
    if (h >= 24) return Math.floor(h / 24) + 'd ' + (h % 24) + 'h';
    if (h > 0) return h + 'h ' + (m % 60) + 'm';
    return m + 'm';
  }
  function bar(cls, a, b) {
    return '<div class="hr-cs-bar ' + cls + '"><i style="width:' + pct(a, b) + '%"></i></div>';
  }
  function stored(id) { var s = seat(); return ((s && s.stores) || {})[id] || 0; }
  function storeCap() { return 2500 * Math.max(1, level('treasury')); }

  /* The SEAT's answer wins. `clans.myClan().myRole` is populated at sign-in and
     is a cache of an older read; `clan_seat_read` re-answers it on every panel
     open, so a member promoted to leader ten seconds ago sees the leader's
     buttons without a reload. readSeat() pushes the newer value back onto the
     clan row, which is what keeps the two from disagreeing anywhere else. */
  function myRole() {
    var s = seat();
    if (s && s.my_role) return s.my_role;
    var c = myClanObj();
    return (c && c.myRole) || 'member';
  }
  /* WHO MAY POST A WORK ORDER (Tyler, 2026-08-09): the Leader and the Vice
     Leaders, and nobody else. The rule itself lives in HearthriseClanSeat so
     the server's migration and this panel are reading one sentence; here we
     only supply the two facts it needs.

     The leader always qualifies implicitly, or a freshly founded clan could
     commission nothing at all. `my_charge` arrives with the clan-seat-2
     migration; before it, only the leader is recognised — which is a narrower
     answer than the server's, never a wider one. */
  function myCharge() { var s = seat(); return (s && s.my_charge) || null; }
  function isVice() { return C().mayPostOrder(myRole(), myCharge()); }
  function isLeader() { return myRole() === 'leader'; }
  /* WHO MAY WORK THE DOOR. This is not the vice-leader office — it is exactly
     the predicate the SERVER enforces (`hr_clan_may_admit` returns a row for
     role in ('leader','officer') and nothing else), restated here so the panel
     hides controls the server would refuse instead of drawing a button whose
     only outcome is "Only the hold's leadership can do that". A vice leader is
     a `charge`, not a role, and it does NOT admit — showing them a kick button
     would be the panel promising something the migration does not. */
  function isLeadership() { var r = myRole(); return r === 'leader' || r === 'officer'; }
  /* What the panel calls the office, in running text. */
  function VICE() { return 'vice leader'; }

  function ROOM_IDS() { return ['great_hall'].concat(BUILDINGS.map(function (b) { return b.id; })); }
  function roomName(id) {
    if (id === 'great_hall') return 'The Great Hall';
    var b = buildingDef(id);
    return (b && b.name) || id;
  }

  /* ════════════════════════════════════════════════════════════
     THE WORK ORDER BLOCK — the panel's lead story (Tyler, 2026-08-09)
     ════════════════════════════════════════════════════════════
     An active Work Order is what the whole hold is doing, and before this it
     was a 40-pixel bar in a three-column strip that said "supply 62%". A
     percentage is not an instruction. A member who reads "62%" cannot go and
     fix it; a member who reads "Iron Fittings 80 / 200" can.

     So every required material gets its OWN named row with its real have/need
     numbers, at cost-text size — named text, never an icon beside a bare
     number, and never below 14.5px. That is the cost-text law, and this block
     is the largest surface in the game that obeys it.

     The labour meter sits under the materials because it is the SECOND half of
     the same order, and the whole block ends in one button that goes straight
     to the place a player can act. */
  function orderPhaseWord(o) {
    return o.phase === 'supply' ? 'Gathering materials' : 'Under construction';
  }
  function workOrderLeadHtml() {
    var orders = openOrders();
    if (!orders.length) return '';
    return orders.map(function (o) {
      var b = buildingDef(o.building);
      var nm = (b && b.name) || o.building;
      var mats = Object.keys(o.materials || {});
      var rows = mats.map(function (k) {
        var need = Math.max(0, +o.materials[k] || 0);
        var got = Math.min(need, Math.max(0, +(o.supplied || {})[k] || 0));
        var full = got >= need;
        var inStore = stored(k);
        /* b372: "Iron Fittings 80 / 200" is an instruction only if the player
           knows where a fitting comes from. The name opens its flyout. */
        var wi = (typeof window.hrInspectAttrs === 'function') ? window.hrInspectAttrs(k) : '';
        var wh = (typeof window.hrInspectHint === 'function') ? window.hrInspectHint(k) : '';
        return '<div class="hr-cs-wo-mat' + (full ? ' is-full' : '') + '">' +
          '<div class="hr-cs-wo-mat-top">' +
            '<span class="hr-cs-wo-mat-nm"' + wi + (wi ? ' title="' + esc(itemName(k) + wh) + '"' : '') +
              '>' + esc(itemName(k)) + '</span>' +
            '<span class="hr-cs-wo-mat-qty">' + n(got) + ' / ' + n(need) + '</span>' +
          '</div>' +
          bar(full ? '' : 'is-supply', got, need) +
          '<div class="hr-cs-wo-mat-foot">' + (full
            ? 'Fully supplied.'
            : n(need - got) + ' still needed &middot; ' + n(inStore) + ' waiting in the Storehouse') +
          '</div></div>';
      }).join('');

      var done = Math.max(0, +o.labour_done || 0);
      var target = Math.max(1, +o.labour_target || 1);
      var mine = _labourToday + Math.floor(_labour);
      var floorLeft = o.floor_until ? Date.parse(o.floor_until) - Date.now() : 0;

      return '<div class="hr-cs-wo">' +
        '<div class="hr-cs-wo-head">' +
          '<div class="hr-cs-wo-eyebrow">The hold is building</div>' +
          '<div class="hr-cs-wo-title">' + esc(nm) + ' &rarr; Level ' + (o.to_level | 0) + '</div>' +
          '<div class="hr-cs-wo-phase" data-phase="' + esc(o.phase) + '">' + orderPhaseWord(o) + '</div>' +
        '</div>' +
        '<div class="hr-cs-wo-mats">' + rows + '</div>' +
        '<div class="hr-cs-wo-labour">' +
          '<div class="hr-cs-wo-mat-top">' +
            '<span class="hr-cs-wo-mat-nm">Labour</span>' +
            '<span class="hr-cs-wo-mat-qty">' + n(done) + ' / ' + n(target) + '</span>' +
          '</div>' +
          bar('', done, target) +
          '<div class="hr-cs-wo-mat-foot">' + (o.phase === 'supply'
            ? 'Labour starts once every material above is supplied. Then ordinary play builds it — no toggle, no sign-up.'
            : 'Every skill action you take feeds this. You have given ' + n(mine) + ' of your ' +
              C().DAILY_LABOUR_CAP + ' labour today' +
              (floorLeft > 0 ? ' &middot; ' + fmtLeft(floorLeft) + ' of its time floor left.' : '.')) +
          '</div>' +
        '</div>' +
        '<div class="hr-cs-wo-acts">' +
          '<button class="btn btn-sm btn-primary" data-cs="room" data-b="' + esc(o.building) + '">Contribute</button>' +
          '<span class="hr-cs-wo-hint">' + (o.phase === 'supply'
            ? 'Move goods out of the Storehouse onto this order.'
            : 'Open it to see the time floor and raise it when it is ready.') + '</span>' +
        '</div></div>';
    }).join('');
  }

  /* ════════════════════════════════════════════════════════════
     THE VOTE CARD — opt-in, and honestly absent when it cannot run
     ════════════════════════════════════════════════════════════
     Leadership MAY put the next Work Order to the hold. It is a choice per
     order, not mandatory governance, so this card has three jobs and no more:
     show a running vote to everybody, let leadership open one, and tell the
     hold what a closed vote decided when the answer was not simply "we built
     it" (a posted winner is already the block above).

     On a project that has not run 2026-08-09-clan-governance.sql this returns
     an empty string. Not a greyed button, not "coming soon" — nothing. */
  function voteCandidates() {
    var cap = C().buildingLevelCap(castleTier());
    return BUILDINGS.filter(function (b) {
      return level(b.id) + 1 <= Math.min(10, cap) && !orderFor(b.id);
    });
  }
  function voteCardHtml() {
    if (!voteSupported()) return '';
    var v = _vote;

    // 1 — a vote is running.
    if (v && !v.closed) {
      var left = v.deadline - Date.now();
      var total = v.votes;
      var rows = v.candidates.map(function (c) {
        var b = buildingDef(c.building);
        var count = v.tally[c.building] || 0;
        var mine = v.myVote === c.building;
        return '<div class="hr-cs-vote-row' + (mine ? ' is-mine' : '') + '">' +
          '<div class="hr-cs-wo-mat-top">' +
            '<span class="hr-cs-wo-mat-nm">' + esc((b && b.name) || c.building) +
              (c.to_level ? ' &rarr; Level ' + c.to_level : '') + '</span>' +
            '<span class="hr-cs-wo-mat-qty">' + n(count) + ' vote' + (count === 1 ? '' : 's') + '</span>' +
          '</div>' +
          bar('', count, Math.max(1, total)) +
          '<div class="hr-cs-vote-act">' + (mine
            ? '<span class="hr-cs-wo-hint">Your vote.</span>'
            : '<button class="btn btn-sm" data-cs="vote-cast" data-b="' + esc(c.building) + '">Vote for this</button>') +
          '</div></div>';
      }).join('');
      return '<div class="hr-cs-wo is-vote">' +
        '<div class="hr-cs-wo-head">' +
          '<div class="hr-cs-wo-eyebrow">The hold is deciding</div>' +
          '<div class="hr-cs-wo-title">What do we build next?</div>' +
          '<div class="hr-cs-wo-phase" data-phase="vote">' +
            (left > 0 ? fmtLeft(left) + ' left to vote' : 'Counting the votes') + '</div>' +
        '</div>' +
        '<div class="hr-cs-wo-mats">' + rows + '</div>' +
        '<div class="hr-cs-wo-acts">' +
          (isVice() ? '<button class="btn btn-sm" data-cs="vote-close">Close the vote now</button>' : '') +
          '<span class="hr-cs-wo-hint">' + n(v.voters) + ' of ' + n(v.members) + ' members have voted. ' +
          'One vote each, and you can change yours until the deadline. The winner is posted as the work order.' +
          '</span>' +
        '</div></div>';
    }

    // 2 — a closed vote that still needs a decision from somebody.
    if (v && v.closed && (v.outcome === 'tie' || v.outcome === 'void')) {
      var names = (v.outcome === 'tie' ? v.leaders : []).map(function (id) {
        var b = buildingDef(id); return (b && b.name) || id;
      });
      return '<div class="hr-cs-wo is-vote">' +
        '<div class="hr-cs-wo-head">' +
          '<div class="hr-cs-wo-eyebrow">The last vote</div>' +
          '<div class="hr-cs-wo-title">' + (v.outcome === 'tie'
            ? 'It tied &mdash; ' + esc(names.join(' and '))
            : 'Nothing was posted') + '</div>' +
        '</div>' +
        '<div class="hr-cs-wo-mat-foot">' + (v.outcome === 'tie'
          ? 'A tie is never broken by chance, so the hold built nothing. Leadership commissions one of them, or opens a fresh vote.'
          : (v.reason === 'no_ballots'
              ? 'Nobody voted before the deadline, so nothing was posted.'
              : 'The hold moved while the vote ran: ' + esc(C().errorText(v.reason)) + '.')) +
        '</div>' + voteOpenerHtml() + '</div>';
    }

    // 3 — no vote running. Leadership is offered one; everyone else is told
    //     plainly who posts the next order, with no dead button to press.
    var op = voteOpenerHtml();
    if (!op) return '';
    return '<div class="hr-cs-wo is-vote">' +
      '<div class="hr-cs-wo-head">' +
        '<div class="hr-cs-wo-eyebrow">Optional</div>' +
        '<div class="hr-cs-wo-title">Let the hold pick the next work order</div>' +
      '</div>' + op + '</div>';
  }

  /* The opener. Leadership ticks two to four things and sets a deadline. It is
     deliberately the same checkbox-and-button shape as the rest of the panel's
     fields rather than a bespoke wizard — governance is a two-minute act. */
  function voteOpenerHtml() {
    if (!voteSupported() || !isVice() || !_mayOpenVote) return '';
    var cands = voteCandidates();
    if (cands.length < C().VOTE_MIN_CANDIDATES) {
      return '<div class="hr-cs-wo-mat-foot">There are not enough things the hold could build right now to ' +
        'hold a vote &mdash; raise the hold, or finish what is open.</div>';
    }
    var picked = _votePick;
    var boxes = cands.map(function (b) {
      var to = level(b.id) + 1;
      var on = picked.indexOf(b.id) >= 0;
      return '<button class="hr-cs-vote-pick' + (on ? ' is-on' : '') +
        '" data-cs="vote-pick" data-b="' + esc(b.id) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
        '<span class="hr-cs-wo-mat-nm">' + esc(b.name) + '</span>' +
        '<span class="hr-cs-wo-mat-qty">Level ' + to + '</span></button>';
    }).join('');
    var ready = picked.length >= C().VOTE_MIN_CANDIDATES;
    return '<div class="hr-cs-vote-open">' +
      '<div class="hr-cs-wo-mat-foot">Pick ' + C().VOTE_MIN_CANDIDATES + ' to ' + C().VOTE_MAX_CANDIDATES +
        ' things for the hold to choose between. Every member gets one vote, and the winner is posted ' +
        'automatically when the deadline passes.</div>' +
      '<div class="hr-cs-vote-picks">' + boxes + '</div>' +
      '<div class="hr-cs-wo-acts">' +
        '<label class="hr-cs-wo-hint" for="hr-cs-vote-hrs">Deadline</label>' +
        '<select id="hr-cs-vote-hrs" data-cs-sel="votehrs">' +
          '<option value="12">12 hours</option>' +
          '<option value="24" selected>24 hours</option>' +
          '<option value="48">2 days</option>' +
          '<option value="72">3 days</option>' +
        '</select>' +
        '<button class="btn btn-sm btn-primary" data-cs="vote-open"' + (ready ? '' : ' disabled') + '>' +
          'Open the vote</button>' +
        '<span class="hr-cs-wo-hint">' + picked.length + ' picked.</span>' +
      '</div></div>';
  }

  /* THE MAIN PANEL. A picture you can click, six doors, three bars, and nothing
     you can misconfigure — every decision lives inside a room (§13). */
  function renderCastle(host) {
    var clan = myClanObj();
    if (!clan || !host) return;
    var s = seat();
    var dorm = upkeepState() === 'dormant';
    var tier = s ? castleTier() : 1;
    var lv = {};
    BUILDINGS.forEach(function (b) { lv[b.id] = level(b.id); });

    var tdef = C().tierDef(tier) || C().TIERS[0];
    var next = C().nextTier(tier);
    var standing = s ? Math.max(0, +s.standing || 0) : 0;

    var html = '<div class="hr-cs">';

    // ── the hold ──
    html += '<div class="hr-cs-hold">' + holdScene(tier, lv, dorm) +
      '<div class="hr-cs-plate"><div class="hr-cs-grow">' +
        '<div class="hr-cs-tier">' + esc(tdef.name) + '</div>' +
        '<div class="hr-cs-name">' + esc(clan.name) + '</div>' +
        '<div class="hr-cs-sub">' + esc(myRole()) + ' &middot; ' +
          (s ? n(standing) + ' Standing' +
               (s.members != null ? ' &middot; ' + n(s.members) + ' / ' + n(s.member_cap) + ' sworn' : '')
             : 'age of the hold: Lv ' + (clan.level | 0)) + '</div>' +
      '</div>' +
      (upkeepState() !== 'active'
        ? '<div class="hr-cs-state" data-state="' + esc(upkeepState()) + '">' + esc(upkeepState()) + '</div>'
        : '') +
      '</div></div>';

    // ── the doors. The picture is the navigation; this row is the same
    //    navigation for a keyboard, a screen reader and a narrow phone. ──
    html += '<div class="hr-cs-doors">' + ROOM_IDS().map(function (id) {
      var l = id === 'great_hall' ? tier : lv[id];
      var built = id === 'great_hall' ? true : l > 0;
      return '<button class="hr-cs-door' + (built ? (dorm ? ' is-dorm' : ' is-built') : '') +
        '" data-cs="room" data-b="' + id + '">' +
        '<span class="hr-cs-door-nm">' + esc(roomName(id)) + '</span>' +
        '<span class="hr-cs-door-lv">' + (id === 'great_hall' ? 'Tier ' + tier : (l > 0 ? 'Lv ' + l : 'not built')) +
        '</span></button>';
    }).join('') + '</div>';

    if (!s) {
      html += degradedHtml(clan) + '</div>';
      host.innerHTML = html;
      wire(host);
      return;
    }

    /* ── THE LEAD STORY ──────────────────────────────────────────────────
       What the hold is building, and what it needs from YOU, above everything
       else on the panel. When nothing is being built, the vote card takes the
       same slot — because "what do we build next" is the same question one
       step earlier. */
    ensureVote();
    html += workOrderLeadHtml();
    html += voteCardHtml();

    // ── Standing toward the next tier, with the contributor gate stated ──
    if (next) {
      /* THE TIER GATE, IN PLAYER LANGUAGE. This paragraph used to read "3
         different members must supply the bundle, each after 72 hours in the
         hold. Buildings are capped at level 4 until the hold rises." — three
         design-doc facts welded together, and Tyler could not parse it. It is
         now two sentences with the LIVE count in them, because "1 so far" is
         the number that tells a player whether to go and fetch a friend. */
      /* The count comes from the server (clan_seat_read.tier_contributors) —
         only it can see who has actually deposited past the 72h grace. A server
         that has not run the governance migration does not send it, and `null`
         must not become 0: the clause is dropped instead of being invented. */
      var soFar = s.tier_contributors;
      html += '<div class="hr-cs-line"><span class="hr-cs-label">Standing &rarr; ' + esc(next.name) + '</span>' +
        '<span class="hr-cs-val"><b>' + n(standing) + '</b> / ' + n(next.standing) + '</span></div>' +
        bar('', standing, next.standing) +
        '<div class="hr-cs-foot">Needs contributions from <b>' + esc(next.contributors) +
        ' different members</b>' + (soFar != null ? ' (<b>' + n(soFar) + '</b> so far)' : '') +
        '. New members count 3 days after joining &mdash; this keeps holds honest. ' +
        'Buildings can reach <b>level ' + (tier * 2) + '</b> now &mdash; raise the hold to unlock higher.</div>';
    } else {
      html += '<div class="hr-cs-line"><span class="hr-cs-label">Standing</span>' +
        '<span class="hr-cs-val"><b>' + n(standing) + '</b></span></div>' +
        '<div class="hr-cs-foot">The Fortified Keep is the summit of Phase A. Tiers 6 to 10 are not yet tuned &mdash; ' +
        'and will not be until a hold has stood here.</div>';
    }

    // ── the "this week" strip ──
    html += '<div class="hr-cs-week">' + weekStripHtml() + '</div>';

    var storeKinds = Object.keys(s.stores || {}).length;
    html += '<div class="hr-cs-line"><span class="hr-cs-label">Treasury</span>' +
      '<span class="hr-cs-val"><b>' + n(s.treasury) + '</b> gold &middot; ' +
      storeKinds + ' kind' + (storeKinds === 1 ? '' : 's') + ' in the Storehouse</span></div>';

    html += '<div class="hr-cs-acts"><button class="btn btn-sm btn-danger" data-cs="leave">Leave the hold</button></div>';

    if (upkeepState() !== 'active') {
      html += '<div class="hr-cs-note">Upkeep is settled every Sunday 00:00 UTC. ' +
        (dorm ? 'A <b>dormant</b> hold keeps every level it has earned &mdash; its perks are off and its Work Orders are frozen until one week of upkeep is paid.'
              : 'A <b>strained</b> hold runs its perks at 60% and its Feast cooldown 50% longer. Nothing is ever de-levelled.') +
        '</div>';
    }
    html += '</div>';
    host.innerHTML = html;
    wire(host);
  }

  /* What the panel says when the migration has not been run, or the server
     cannot be reached. It states what it knows and draws no meter it cannot
     fill — the same discipline muster/raids/leaderboards use. */
  function degradedHtml(clan) {
    if (_support === 'unsupported') {
      return '<div class="hr-cs-note">This hold is not chartered on the server yet &mdash; the Clan Seat tables ' +
        'have not been created. Everything above is real; the Standing, Storehouse, Work Orders and Tavern ' +
        'appear the moment the migration is run. Nothing is lost in the meantime.</div>' +
        '<div class="hr-cs-line" style="margin-top:10px"><span class="hr-cs-label">Treasury</span>' +
        '<span class="hr-cs-val"><b>' + n(clan.treasury) + '</b> gold</span></div>' +
        '<div class="hr-cs-acts"><button class="btn btn-sm btn-danger" data-cs="leave">Leave the hold</button></div>';
    }
    if (!signedIn()) {
      return '<div class="hr-cs-note">Sign in to see the hold\'s Standing, its Storehouse and its Work Orders.</div>';
    }
    return '<div class="hr-cs-note">Reading the hold&hellip;</div>';
  }

  function weekStripHtml() {
    var out = '';
    var s = seat();
    /* 1 — the Work Order, ONLY when there is none. An open order is the lead
       story at the top of the panel now, with every material named; repeating
       it here as a percentage would be the same news told twice, worse the
       second time. */
    if (!openOrders().length) {
      out += '<div><div class="hr-cs-line"><span class="hr-cs-label">Work Order</span>' +
        '<span class="hr-cs-val">none open</span></div>' + bar('is-supply', 0, 1) +
        '<div class="hr-cs-foot">' + (isVice()
          ? 'Open a room and commission one. ' + C().buildSlots(castleTier()) + ' slot' +
            (C().buildSlots(castleTier()) === 1 ? '' : 's') + ' at this tier.'
          : 'The leader and vice leaders post work orders. Yours has not posted one yet.') + '</div></div>';
    }

    // 2 — the Feast meter
    var tl = level('tavern');
    if (tl > 0) {
      var cap = C().feastMeterCap(tl);
      var meter = Math.max(0, +(s && s.feast_meter) || 0);
      var f = feastActive();
      out += '<div><div class="hr-cs-line"><span class="hr-cs-label">Feast meter</span>' +
        '<span class="hr-cs-val">' + (f
          ? '<b>running</b> &middot; ' + fmtLeft(f.left) + ' left'
          : '<b>' + n(meter) + '</b> / ' + n(cap)) + '</span></div>' +
        bar('is-feast', f ? 1 : meter, f ? 1 : cap) +
        '<div class="hr-cs-foot">' + (f
          ? '+' + Math.round(f.effect.allXP * 100) + '% all XP for the whole hold' +
            (f.effect.lastCall ? ' &mdash; <b>Last Call</b>, every effect doubled.' : '.')
          : 'Cooked food fills it, by how much it heals. Tavern ' + tl + ' pours a ' +
            C().feastEffect(tl).hours + 'h feast.') + '</div></div>';
    } else {
      out += '<div><div class="hr-cs-line"><span class="hr-cs-label">Feast meter</span>' +
        '<span class="hr-cs-val">no Tavern</span></div>' + bar('is-feast', 0, 1) +
        '<div class="hr-cs-foot">Build the Tavern and the hold can feast, rest and take the Board.</div></div>';
    }

    // 3 — the Hunt. The War Room sets the ceiling (§11.3) and that ceiling is a
    //     pure function this module owns. The Hunt's own HP meter is NOT drawn
    //     here: an empty meter is worse than an honest sentence.
    var wr = level('war_room');
    var ceiling = C().maxHuntTier(castleTier(), wr);
    var ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
    out += '<div><div class="hr-cs-line"><span class="hr-cs-label">The Hunt</span>' +
      '<span class="hr-cs-val">tier <b>' + (ROMAN[ceiling] || ceiling) + '</b> ceiling</span></div>' +
      bar('', ceiling, 5) +
      '<div class="hr-cs-foot">' + (wr > 0
        ? 'War Room ' + wr + ' and a tier-' + castleTier() + ' hold. '
        : 'No War Room: the hold is stuck on tier I. ') +
      'Castle tiers 4 and 5 each require a Hunt clear at the matching tier within four weeks.</div></div>';
    return out;
  }

  // ════════════════════════════════════════════════════════════
  // 12 · THE SIX ROOMS
  // ════════════════════════════════════════════════════════════
  // Each is a descriptor builder. They share the ladder, the meter and the row
  // vocabulary; they do NOT share a layout, because a vault and a tavern are
  // not the same room with different words in it.
  function perkLabel(k) {
    return { goldFind: 'gold find', craftSpeed: 'crafting speed', smithSpeed: 'smithing speed',
             raidPower: 'raid power', allXP: 'all XP', restedXp: 'rested XP' }[k] || k;
  }
  /* b228: the Tavern pays a flat XP quantum per Rested charge, not a potency;
     every other building pays whole percents at levels 4, 7 and 10, and the
     copy names the next rung so a level-5 wing reads as "on the way" rather
     than as a dead level. */
  function perkAt(b, lvl) {
    if (b.perk === 'restedXp') return n(C().restedQuantum(lvl)) + ' XP per rested charge';
    var v = perkAtLevel(lvl) * 100;
    var next = null;
    for (var i = 0; i < PERK_RUNGS.length; i++) if (Math.min(10, lvl | 0) < PERK_RUNGS[i]) { next = PERK_RUNGS[i]; break; }
    return '+' + Math.round(v) + '% ' + perkLabel(b.perk) +
      (next ? ' &middot; +1% more at level ' + next : '');
  }
  function orderFor(building) {
    return openOrders().filter(function (o) { return o.building === building; })[0] || null;
  }

  /* The shared upgrade ladder for a commissionable wing. Three rungs, each with
     its real bundle (scaled by the tested materialScale) and its real effect. */
  function wingLadder(b) {
    var cur = level(b.id);
    var cap = C().buildingLevelCap(castleTier());
    var slots = C().buildSlots(castleTier());
    var open = openOrders().length;
    var already = orderFor(b.id);
    var rows = [];
    for (var to = cur + 1; to <= Math.min(10, cur + 3); to++) {
      var scale = C().materialScale(to);
      var costs = Object.keys(b.bundle).map(function (k) {
        /* b372: `id` rides with every cost line so the renderer can turn the
           chip into a link to that item's flyout. The homestead half of this
           seam (costTriples) has always carried it; the castle half did not,
           which would have made one pillar inspectable and the other not. */
        return { id: k, label: itemName(k), need: Math.ceil(b.bundle[k] * scale),
                 have: to === cur + 1 ? stored(k) : null };
      });
      costs.push({ label: 'gold on completion', need: Math.ceil(b.gold * scale), have: null });
      var locked = to > cap;
      var why = locked ? 'The Great Hall must reach tier ' + Math.ceil(to / 2) + ' first.'
        : already ? 'Already commissioned — supply it below.'
        : open >= slots ? 'Every build slot is in use (' + open + ' / ' + slots + ').'
        : upkeepState() === 'dormant' ? 'The hold is dormant — settle its upkeep first.'
        : !isVice() ? 'Only the leader and vice leaders post work orders.'
        : '';
      rows.push({
        level: to, locked: locked, next: to === cur + 1,
        effect: perkAt(b, to) + (to === cur + 1 && cur > 0 ? ' (now ' + perkAt(b, cur) + ')' : ''),
        costs: costs,
        why: to === cur + 1 ? why : '',
        /* `pin` — the next rung's Commission is the control this room exists
           for, so it rides in the build bar above the scroll with this row's
           own costs. Only the next rung can carry it; hoistPin takes the first
           it finds, and a further rung is a plan rather than an action. */
        action: (to === cur + 1 && !why)
          ? { name: 'post', label: 'Commission', data: { b: b.id }, pin: true } : null
      });
    }
    return {
      kind: 'ladder', title: 'The upgrade ladder', rows: rows,
      note: 'Levels are capped at <b>' + cap + '</b> (castle tier &times; 2). ' +
        'Build slots in use: <b>' + open + ' / ' + slots + '</b>. ' +
        'A Work Order is commissioned, then supplied from the Storehouse, then built by ordinary play.'
    };
  }

  /* The order panel a wing shows when it has one open. Supply moves goods out
     of the Storehouse; Labour is fed by the skills you were training anyway. */
  function orderSections(b) {
    var o = orderFor(b.id);
    if (!o) return [];
    if (o.phase === 'supply') {
      var rows = Object.keys(o.materials || {}).map(function (k) {
        var need = +o.materials[k] || 0;
        var got = Math.min(need, +(o.supplied || {})[k] || 0);
        var have = stored(k);
        var move = Math.min(need - got, have);
        return {
          name: esc(itemName(k)),
          meta: n(got) + ' / ' + n(need) + ' supplied &middot; ' + n(have) + ' in the Storehouse',
          bar: { tone: 'is-supply', value: got, max: need },
          right: move > 0
            ? '<button class="btn btn-sm" data-cs="supply" data-o="' + esc(o.id) + '" data-i="' + esc(k) +
              '" data-q="' + move + '">Move ' + n(move) + '</button>'
            : '<span class="hr-cs-amt">' + (got >= need ? 'full' : 'none stored') + '</span>'
        };
      });
      return [
        { kind: 'rows', title: 'Work Order &middot; supply', rows: rows },
        { kind: 'note', html: 'Materials come out of the Storehouse, not your bag. Anything on this list pays ' +
            '<b>1.5&times;</b> Contribution when it is deposited.' }
      ];
    }
    var floorLeft = o.floor_until ? Date.parse(o.floor_until) - Date.now() : 0;
    var ready = o.labour_done >= o.labour_target && floorLeft <= 0;
    return [
      { kind: 'meter', title: 'Work Order &middot; labour', label: 'To level ' + (o.to_level | 0),
        value: o.labour_done, max: o.labour_target,
        valueText: '<b>' + n(o.labour_done) + '</b> / ' + n(o.labour_target),
        foot: (floorLeft > 0
          ? 'The work needs time as well as hands &mdash; ' + fmtLeft(floorLeft) + ' of its time floor left. '
          : 'The time floor has passed. ') +
          'Your labour today: <b>' + n(_labourToday + Math.floor(_labour)) + '</b> of ' + C().DAILY_LABOUR_CAP +
          (_labourCapped ? ' &mdash; you have given all the hold can take from you today.' : '.') },
      { kind: 'actions', buttons: [
        ready ? { label: 'Raise it', action: 'complete', data: { o: o.id }, primary: true }
              : { label: 'Not finished', disabled: true, why: floorLeft > 0 ? 'needs time' : 'needs labour' }
      ] }
    ];
  }

  var ROOMS = {
    great_hall: function () {
      var tier = castleTier();
      var next = C().nextTier(tier);
      var s = seat();
      var sections = [];
      sections.push({ kind: 'note', html:
        'The hall is the hold itself. It sets the member cap, the build slots and the level ceiling ' +
        'every other room lives under &mdash; and it is the only room that cannot be commissioned. ' +
        'It rises on <b>Standing</b>, which the whole hold earns together.' });
      sections.push({ kind: 'meter', title: 'The hold', label: C().tierName(tier),
        value: next ? (s ? s.standing : 0) : 1, max: next ? next.standing : 1,
        valueText: next ? '<b>' + n(s ? s.standing : 0) + '</b> / ' + n(next.standing) + ' Standing'
                        : '<b>' + n(s ? s.standing : 0) + '</b> Standing',
        foot: 'Grants <b>' + Math.round(GREAT_HALL_ALLXP_PER_TIER * tier * 100) + '% all XP</b> to every member. ' +
          'Building level cap <b>' + C().buildingLevelCap(tier) + '</b> &middot; build slots <b>' +
          C().buildSlots(tier) + '</b>' + (s && s.members != null
            ? ' &middot; <b>' + n(s.members) + ' / ' + n(s.member_cap) + '</b> sworn' : '') + '.' });

      if (next) {
        var bundle = C().TIER_BUNDLES[next.tier] || {};
        var costs = Object.keys(bundle).filter(function (k) { return k.charAt(0) !== '_'; }).map(function (k) {
          return { id: k, label: itemName(k), need: bundle[k], have: stored(k) };
        });
        var spoils = bundle._spoils;
        sections.push({ kind: 'ladder', title: 'Raise the hold', rows: [{
          level: next.tier, next: true,
          effect: next.name + ' — ' + Math.round(GREAT_HALL_ALLXP_PER_TIER * next.tier * 100) +
            '% all XP, level cap ' + C().buildingLevelCap(next.tier) + ', ' + next.members + ' members',
          costs: costs.concat([{ label: 'gold', need: next.gold, have: s ? s.treasury : 0 }]),
          /* Plain language, live numbers. The old sentence stacked three design
             rules into one clause and Tyler could not parse it. */
          why: 'Needs contributions from ' + next.contributors + ' different members' +
            (s && s.tier_contributors != null ? ' (' + n(s.tier_contributors) + ' so far)' : '') +
            '. New members count 3 days after joining.' +
            (next.huntClear ? ' The hold must also have cleared a tier-' + next.huntClear +
              ' Hunt in the last 28 days.' : '') +
            (spoils ? ' It also takes ' + n(spoils.qty) + ' combat spoils from tier ' +
              spoils.tiers.join(' or ') + ' monsters.' : ''),
          action: isLeader() ? { name: 'tier-up', label: 'Raise the hold', pin: true } : null
        }], note: isLeader() ? '' : 'Only the leader can raise the hold.' });
      } else {
        sections.push({ kind: 'note', html:
          'The Fortified Keep is the summit of Phase A. Tiers 6 to 10 are deliberately untuned &mdash; ' +
          'tuning a tier-9 bundle before a single hold has reached tier 2 would be fiction.' });
      }

      var orders = openOrders();
      sections.push({ kind: 'rows', title: 'Work under way', empty: 'No Work Order is open anywhere in the hold.',
        rows: orders.map(function (o) {
          var b = buildingDef(o.building);
          var supplyNeed = 0, supplyGot = 0;
          Object.keys(o.materials || {}).forEach(function (k) {
            supplyNeed += +o.materials[k] || 0;
            supplyGot += Math.min(+o.materials[k] || 0, +(o.supplied || {})[k] || 0);
          });
          return {
            name: esc((b && b.name) || o.building) + ' <span class="hr-cs-lv">to Lv ' + (o.to_level | 0) + '</span>',
            meta: o.phase === 'supply' ? 'Gathering materials' : 'Under construction',
            bar: o.phase === 'supply'
              ? { tone: 'is-supply', value: supplyGot, max: supplyNeed }
              : { tone: '', value: o.labour_done, max: o.labour_target },
            right: '<button class="btn btn-sm" data-cs="room" data-b="' + esc(o.building) + '">Open</button>'
          };
        }) });

      /* MEMBERSHIP sits directly above the roster, because the door, the
         invitations and the removals are all answers to the question a leader
         is holding while they read that list. */
      sections.push(doorSection());
      if (isLeadership()) {
        sections.push(inviteSection());
        sections.push(outstandingSection());
        sections.push(removalSection());
      }
      sections.push({ kind: 'rows', title: 'Those sworn to the hold',
        empty: _roster === null ? 'Reading the roster&hellip;' : 'No members yet.',
        rows: (_roster || []).map(rosterRow) });
      /* WHO DECIDES. Stated in the room that holds the roster, because this is
         where a leader is standing when the question occurs to them. */
      sections.push({ kind: 'note', html: isLeader()
        ? 'Work orders are posted by you and by your <b>vice leaders</b>. Make someone a vice leader from ' +
          'the roster above and they can commission work, call the Feast and open a vote &mdash; useful when ' +
          'you are asleep and the hold is not.'
        : 'Work orders are posted by the leader and the <b>vice leaders</b>. Everyone else builds them: ' +
          'supplying materials and simply playing both count.' });
      sections.push({ kind: 'note', html:
        'Contribution decays 12% a week, so the ladder shows who is helping <em>now</em> &mdash; not who ' +
        'no-lifed the hold eight months ago. Standing never decays, so the hold never loses its progress.' });
      return {
        id: 'great_hall', theme: 'hall', title: 'The Great Hall',
        subtitle: C().tierName(tier) + ' &middot; tier ' + tier,
        scene: ROOM_ART.great_hall(tier), sections: sections, onAction: onAction, onInput: onInput
      };
    },

    treasury: function () {
      var b = buildingDef('treasury');
      var lvl = level('treasury');
      var s = seat();
      var clan = myClanObj() || {};
      var cap = storeCap();
      var goal = window.HearthriseClans.nextTreasuryGoal
        ? window.HearthriseClans.nextTreasuryGoal(clan.level || 1) : 0;
      var stores = (s && s.stores) || {};
      var sections = [];
      sections.push({ kind: 'note', html:
        'The vault holds two different things and it is worth keeping them apart. The <b>coffer</b> is gold: ' +
        'an operating account that pays the weekly upkeep and the gold half of every Work Order, and it goes ' +
        'down when the hold builds something. The <b>Storehouse</b> is goods, pooled, and capped per kind by ' +
        'this room\'s level.' });
      sections.push({ kind: 'meter', title: 'The coffer', label: 'Treasury',
        value: (s ? s.treasury : clan.treasury) || 0, max: Math.max(1, goal),
        valueText: '<b>' + n(s ? s.treasury : clan.treasury) + '</b> gold',
        foot: 'Upkeep discount at this level: <b>' + Math.round((1 - C().upkeepDiscount(lvl)) * 100) + '%</b>. ' +
          'Banking ' + n(goal) + ' in total makes the hold Lv ' + ((clan.level | 0) + 1) +
          ' &mdash; the age of the hold, which is a badge and nothing more.' });
      sections.push({ kind: 'field', title: '', select: null,
        qty: { name: 'gold', value: '', placeholder: 'Gold to bank' },
        button: { action: 'bank', label: 'Bank gold' } });

      sections.push({ kind: 'rows', title: 'The Storehouse',
        empty: 'The Storehouse is empty. Refine something and bring it in.',
        rows: Object.keys(stores).sort().map(function (k) {
          var q = +stores[k] || 0;
          return {
            name: esc(itemName(k)),
            meta: n(q) + ' / ' + n(cap) + ' before the cap' +
              (q >= cap ? ' &mdash; full: further deposits of this pay 0.4&times;' : ''),
            bar: { tone: q >= cap ? 'is-supply' : '', value: q, max: cap }
          };
        }) });
      sections.push(depositField());
      sections.push({ kind: 'note', html:
        'The Storehouse <b>refuses raw gathered materials</b>. Logs, ore, fish and crops must be refined first ' +
        '&mdash; which means a gatherer needs a crafter, permanently. Combat spoils are the one exception: ' +
        'a kill is already a completed activity, and a hold takes tribute of trophies.' });
      sections = sections.concat(orderSections(b));
      sections.push(wingLadder(b));
      return {
        id: 'treasury', theme: 'vault', title: 'The Treasury',
        subtitle: (lvl > 0 ? 'Level ' + lvl + ' &middot; ' + perkAt(b, lvl) : 'Not built yet') +
          ' &middot; store cap ' + n(cap) + ' per kind',
        scene: ROOM_ART.treasury(lvl), sections: sections, onAction: onAction, onInput: onInput
      };
    },

    tavern: function () {
      var b = buildingDef('tavern');
      var tl = level('tavern');
      var s = seat();
      var sections = [];
      if (tl <= 0) {
        sections.push({ kind: 'note', html:
          'The hold has no Tavern yet. It is the room that pays a member for the time they were <em>not</em> ' +
          'playing, and it is the one worth building first.' });
      } else {
        var cap = C().feastMeterCap(tl);
        var meter = Math.max(0, +(s && s.feast_meter) || 0);
        var f = feastActive();
        var cd = s && s.feast_cd_until ? Date.parse(s.feast_cd_until) - Date.now() : 0;
        var eff = C().feastEffect(tl);
        sections.push({ kind: 'meter', title: 'The Hearth', label: 'Feast meter',
          value: f ? 1 : meter, max: f ? 1 : cap, tone: 'is-feast',
          valueText: f ? '<b>running</b> &middot; ' + fmtLeft(f.left) + ' left'
                       : '<b>' + n(meter) + '</b> / ' + n(cap),
          foot: 'At Tavern ' + tl + ': ' + eff.hours + 'h, +' + Math.round(eff.allXP * 100) + '% all XP' +
            (eff.yield ? ', +' + Math.round(eff.yield * 100) + '% gathering speed' : '') +
            (eff.artisan ? ', +' + Math.round(eff.artisan * 100) + '% artisan speed' : '') +
            (tl >= 7 ? '. During the final 30 minutes &mdash; <b>Last Call</b> &mdash; every effect doubles.' : '.') });
        sections.push({ kind: 'actions', buttons: [
          f ? { label: 'The feast is running — ' + fmtLeft(f.left) + ' left', disabled: true }
            : cd > 0 ? { label: 'Cooldown', disabled: true, why: fmtLeft(cd) }
            : meter < cap ? { label: 'Call the Feast', disabled: true, why: 'the meter is not full' }
            : isVice() ? { label: 'Call the Feast', action: 'feast-call', primary: true }
            : { label: 'Call the Feast', disabled: true, why: 'the leader or a vice leader calls it' }
        ] });
        sections.push(feastField());
        sections.push({ kind: 'note', html:
          'Cooked food fills the meter by how much it <em>heals</em>, so a Cooked Shark counts 42 and a ' +
          'Cooked Shrimp counts 8 &mdash; the meter is honest about effort. The cooldown is 20 hours, not 24, ' +
          'so Last Call drifts around the clock and no one time zone owns it.' });

        sections.push({ kind: 'meter', title: 'The Common Room', label: 'Rested charges banked',
          value: (typeof window.restedXpCharges === 'function' ? window.restedXpCharges() : 0),
          max: (typeof window.restedCap === 'function' ? window.restedCap() : C().RESTED_CAP),
          valueText: '<b>' + n(typeof window.restedXpCharges === 'function' ? window.restedXpCharges() : 0) +
            '</b> / ' + (typeof window.restedCap === 'function' ? window.restedCap() : C().RESTED_CAP),
          /* b228: Rested pays a flat XP quantum per charge, so the copy states
             XP rather than a percentage that was never felt. */
          foot: 'One charge for every six minutes away. Each one is worth <b>' +
            n(C().restedQuantum(tl)) + ' XP</b> at Tavern ' + tl +
            '. It pays you for the hours you were not here, which is the whole promise of an idle game.' });

        sections.push({ kind: 'rows', title: 'The Board',
          empty: _board === null
            ? 'The Barkeep has not posted yet &mdash; the Board is not running on this hold\'s server. ' +
              'Until it is there are no tasks, and inventing some would be a lie.'
            : 'No tasks posted for this period.',
          rows: (_board || []).map(function (t) {
            return {
              name: esc(t.label) + (t.weekly ? ' <span class="hr-cs-lv">weekly</span>' : ''),
              meta: n(t.progress) + ' / ' + n(t.target) + ' &middot; ' + n(t.cp) + ' Contribution, ' +
                n(t.standing) + ' Standing',
              bar: { tone: '', value: t.progress, max: t.target },
              right: t.claimed ? '<span class="hr-cs-amt">claimed</span>'
                : t.done ? '<button class="btn btn-sm btn-primary" data-cs="board-claim" data-t="' +
                    esc(t.task_id) + '">Claim</button>'
                : '<span class="hr-cs-amt">' + pct(t.progress, t.target) + '%</span>'
            };
          }) });
      }
      sections = sections.concat(orderSections(b));
      sections.push(wingLadder(b));
      return {
        id: 'tavern', theme: 'tavern', title: 'The Tavern',
        subtitle: tl > 0 ? 'Level ' + tl + ' &middot; feasts, rest and the Barkeep\'s work' : 'Not built yet',
        scene: ROOM_ART.tavern(tl), sections: sections, onAction: onAction, onInput: onInput
      };
    },

    sawmill: function () { return wingRoom('sawmill', 'mill',
      'Beams go in as planks and come out square. Every level takes 0.4% off what a Timber Beam costs to ' +
      'make &mdash; the mill is built out of Beams and it makes Beams cheaper, which is a real economic ' +
      'decision rather than a checkbox.'); },

    smeltery: function () { return wingRoom('smeltery', 'forge',
      'Bars become fittings. Every level takes 0.4% off what an Iron Fitting costs to make, and the same ' +
      'recursion applies: the Smeltery is built from Fittings.'); },

    war_room: function () {
      var d = wingRoom('war_room', 'warroom',
        'Where the hold decides what it is hunting. The War Room sets the Hunt\'s tier ceiling, and castle ' +
        'tiers 4 and 5 each require a Hunt clear at the matching tier &mdash; so a hold that never builds ' +
        'this room is stuck on tier I Hunts and therefore stuck at castle tier 3.');
      var wr = level('war_room');
      var ceiling = C().maxHuntTier(castleTier(), wr);
      var ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
      d.sections.splice(1, 0, { kind: 'meter', title: 'The Hunt', label: 'Tier ceiling',
        value: ceiling, max: 5, valueText: 'tier <b>' + (ROMAN[ceiling] || ceiling) + '</b>',
        foot: 'min(castle tier ' + castleTier() + ', 1 + War Room ' + wr + ' / 3). The Hunt itself is declared ' +
          'and fought from the Events screen &mdash; this room sets what the hold is allowed to declare.' });
      return d;
    }
  };

  /* The three plain wings share one shape, because they genuinely are the same
     shape: a function, a perk, a Work Order and a ladder. The Tavern, the
     Treasury and the Great Hall each earn their bespoke layout by carrying
     systems the others do not. */
  function wingRoom(id, theme, blurb) {
    var b = buildingDef(id);
    var lvl = level(id);
    var sections = [{ kind: 'note', html: blurb }];
    if (lvl > 0) {
      sections.push({ kind: 'meter', title: 'What it grants now', label: b.name + ' level ' + lvl,
        value: lvl, max: 10, valueText: '<b>' + perkAt(b, lvl) + '</b>',
        foot: esc(b.fn) + (perkScale() < 1
          ? ' The hold is ' + upkeepState() + ', so it is running at ' + Math.round(perkScale() * 100) + '%.'
          : '') });
    } else {
      sections.push({ kind: 'note', html:
        'Nothing stands here yet &mdash; the picture shows a dashed outline where it will. ' +
        'The first Work Order needs Timber Beams (crafting 25) and Iron Fittings (smithing 25), which is ' +
        'the point: two hands make one thing, so a gatherer needs a crafter.' });
    }
    sections = sections.concat(orderSections(b));
    sections.push(wingLadder(b));
    return {
      id: id, theme: theme, title: b.name,
      subtitle: lvl > 0 ? 'Level ' + lvl + ' &middot; ' + b.district : 'Not built &middot; ' + b.district,
      scene: ROOM_ART[id](lvl), sections: sections, onAction: onAction, onInput: onInput
    };
  }

  /* THE ROSTER ROW — and, for the leader, the vice-leader grant.
     The office is granted here rather than in a separate governance screen
     because this is the only list in the game that already holds every member's
     name; a second roster would be a second thing to keep in sync. */
  function rankWord(m) {
    if (m.role === 'leader') return 'Leader';
    if (C().mayPostOrder(m.role, m.charge)) return 'Vice leader';
    if (m.charge === 'marshal') return 'Marshal';
    return m.role === 'officer' ? 'Officer' : 'Member';
  }
  /* ══════════════════════════════════════════════════════════════════════
     MEMBERSHIP — the surface the S-KICK remedy was missing
     ══════════════════════════════════════════════════════════════════════
     `2026-08-11-clan-membership-authority.sql` shipped clan_kick, clan_invite,
     clan_invite_revoke and clan_join_policy_set, and `clans.js` wired the
     transport — but nothing drew a control, so a hold that had been joined
     uninvited still had no way to act. A kick RPC nobody can click is the same
     as no remedy. These four blocks are the click.

     Everything here is leadership-only IN THE PANEL and leadership-only ON THE
     SERVER; the panel's copy is the reason, never the enforcement. */
  var _invites = null;        // null = not read yet · [] = read, none pending
  var _inviteRead = 0;
  var _kickArm = null;        // the user_id whose Remove button is armed
  var BAN_CHOICES = [
    { value: 168, label: 'Barred 7 days (default)' },
    { value: 24,  label: 'Barred 24 hours' },
    { value: 720, label: 'Barred 30 days' },
    { value: 0,   label: 'No bar — they may come back' }
  ];
  function banHoursPicked(scope) {
    var el = (scope || document).querySelector('[data-cs-sel="ban"]');
    var v = el ? +el.value : 168;
    return isFinite(v) ? Math.max(0, Math.min(720, v)) : 168;
  }
  async function readInvites(force) {
    var Cl = window.HearthriseClans;
    if (!Cl || typeof Cl.outstandingInvites !== 'function') { _invites = []; return _invites; }
    if (!force && _invites !== null && (Date.now() - _inviteRead) < 30000) return _invites;
    try { _invites = await Cl.outstandingInvites(); } catch (e) { _invites = []; }
    _inviteRead = Date.now();
    return _invites;
  }
  async function refreshMembership() {
    var Cl = window.HearthriseClans;
    _roster = null; _kickArm = null;
    RoomModal.refresh();
    try { _roster = (Cl && await Cl.roster()) || []; } catch (e) { _roster = []; }
    await readInvites(true);
    RoomModal.refresh();
  }
  function doorSection() {
    var clan = myClanObj() || {};
    var policy = clan.join_policy === 'invite' ? 'invite' : 'open';
    if (!isLeadership()) {
      return { kind: 'note', html: 'The hold is <b>' + (policy === 'invite'
        ? 'invite only' : 'open to all') + '</b>. Only the leader and the hold\'s officers can change that.' };
    }
    /* The intro states the LIVE policy in words as well as in the select,
       because a repaint deliberately preserves a pending, uncommitted choice in
       the control (losing what a player half-picked is the worse failure) — so
       the sentence is what stays true when the dropdown is showing an intent. */
    return { kind: 'field', title: 'The door',
      intro: 'The hold is currently <b>' + (policy === 'invite' ? 'invite only' : 'open to all') + '</b>. ' +
        'An <b>open</b> hold may be joined by anyone who finds it. An <b>invite only</b> hold refuses ' +
        'every uninvited join outright — which is what stops an alt army walking in while you sleep.',
      select: { name: 'door', label: 'Who may join', value: policy, options: [
        { value: 'open', label: 'Open to all' },
        { value: 'invite', label: 'Invite only' }
      ] },
      button: { action: 'door-set', label: 'Set the door' } };
  }
  function inviteSection() {
    return { kind: 'field', title: 'Invite a player',
      intro: 'By the name they play under. The server resolves it &mdash; spelling counts, capitals do not. ' +
        'An invitation lasts 7 days, opens an invite-only door for that one player, and <b>lifts a bar</b> ' +
        'if you have one on them.',
      text: { name: 'invite', placeholder: 'Their display name', maxlength: 24 },
      button: { action: 'invite-send', label: 'Send it' } };
  }
  function outstandingSection() {
    var rows = (_invites || []).map(function (i) {
      return {
        name: esc(i.display_name || 'A player'),
        meta: 'Invited ' + esc(fmtAgo(i.at)) + ' &middot; lapses ' + esc(whenText(i.expires_at)),
        right: '<button class="btn btn-sm" data-cs="invite-revoke" data-u="' + esc(i.user_id) + '">Withdraw</button>'
      };
    });
    return { kind: 'rows', title: 'Invitations outstanding',
      empty: _invites === null ? 'Reading the hold\'s journal&hellip;' : 'Nobody is waiting on an invitation.',
      rows: rows };
  }
  function whenText(iso) {
    var Cl = window.HearthriseClans;
    return (Cl && Cl.fmtWhen) ? Cl.fmtWhen(iso) : 'in 7 days';
  }
  function fmtAgo(atMs) {
    var mins = Math.max(0, Math.round((Date.now() - atMs) / 60000));
    if (mins < 60) return mins + ' minute' + (mins === 1 ? '' : 's') + ' ago';
    if (mins < 1440) return Math.round(mins / 60) + ' hour' + (Math.round(mins / 60) === 1 ? '' : 's') + ' ago';
    return Math.round(mins / 1440) + ' day' + (Math.round(mins / 1440) === 1 ? '' : 's') + ' ago';
  }
  function removalSection() {
    return { kind: 'field', title: 'Removals',
      intro: 'Pick how long a removed member is barred, then use <b>Remove</b> beside their name. A bar is what ' +
        'makes a removal a remedy rather than a revolving door on an open hold &mdash; and an invitation lifts it. ' +
        'Their Contribution and Standing stay with the hold.',
      select: { name: 'ban', label: 'How long a removed member is barred',
        options: BAN_CHOICES.map(function (b) { return { value: b.value, label: b.label }; }) } };
  }

  function rosterRow(m) {
    var now = Date.now();
    var nm = (m.profiles && m.profiles.display_name) || 'Adventurer';
    var cp = (m.cp != null && m.cp_at) ? C().decayedCp(m.cp, Date.parse(m.cp_at), now) : null;
    var fresh = m.joined_at && (now - Date.parse(m.joined_at)) < C().MEMBERSHIP_GRACE_MS;
    var isVice_ = C().mayPostOrder(m.role, m.charge) && m.role !== 'leader';
    /* The button only exists for the leader, only on other people, and only
       while the governance RPC is not known to be missing — a grant button that
       always answers "not migrated" is worse than no button. */
    var grant = (isLeader() && m.role !== 'leader' && m.user_id && _viceSupport !== 'unsupported')
      ? '<button class="btn btn-sm' + (isVice_ ? '' : ' btn-primary') + '" data-cs="vice" data-u="' +
        esc(m.user_id) + '" data-g="' + (isVice_ ? '0' : '1') + '">' +
        (isVice_ ? 'Remove vice' : 'Make vice leader') + '</button>'
      : '';
    /* THE REMOVE CONTROL. Two clicks, never one: an eviction forfeits the
       member's Contribution and Standing and bars them, and there is no undo
       short of an invitation. The armed state says what it will do, so the
       confirmation carries the consequence instead of asking "are you sure?"
       about nothing. The leader can never be removed and neither can you —
       the server refuses both, so the panel does not offer them. */
    var armed = _kickArm && _kickArm === m.user_id;
    var meId = (session() && session().user && session().user.id) || null;
    var kickable = isLeadership() && m.user_id && m.role !== 'leader' && m.user_id !== meId;
    var kick = kickable
      ? '<button class="btn btn-sm' + (armed ? ' btn-danger' : '') + '" data-cs="kick" data-u="' +
        esc(m.user_id) + '">' + (armed ? 'Remove &mdash; confirm' : 'Remove') + '</button>'
      : '';
    return {
      name: esc(nm),
      meta: esc(rankWord(m)) +
        (fresh ? ' &middot; joined recently &mdash; counts toward tier gates in ' +
          fmtLeft(C().MEMBERSHIP_GRACE_MS - (now - Date.parse(m.joined_at))) : ''),
      right: '<span class="hr-cs-amt">' + (cp == null ? '&mdash;' : n(cp) + ' CP') + '</span>' +
        '<span class="hr-cs-amt">' + n(m.contributed) + 'g</span>' +
        (grant || kick ? '<span class="hr-cs-rowacts">' + grant + kick + '</span>' : '')
    };
  }

  /* THE DEPOSIT PICKER, with a live preview that matches the server's own
     formula exactly (both sides read the same stated rates). A prediction that
     disagrees with the server reads as a bug even when the server is right —
     and the 0.4x-at-cap warning is not decoration: a rule the player only
     discovers AFTER being paid 40% is a rule that feels like a bug. */
  function depositable() {
    var inv = G_().inventory || {};
    var routes = C().SPOILS_ROUTES;
    return Object.keys(inv).filter(function (id) {
      if (!(inv[id] > 0)) return false;
      var d = (window.ITEMS || {})[id];
      if (!d) return false;
      if (d.tag === 'castle') return true;
      var r = routes[id];
      // Recipe inputs are consumed at a workbench, so the Storehouse refuses
      // them exactly as it refuses a log — the server's catalogue agrees.
      return !!r && r.route !== 'recipe';
    }).sort();
  }
  function depositField() {
    var list = depositable();
    if (!list.length) {
      return { kind: 'note', html:
        'You hold nothing the castle accepts. Timber Beams, Iron Fittings, Field Rations, Keystones ' +
        '&mdash; and the trophies you take off the things you kill.' };
    }
    var inv = G_().inventory || {};
    return {
      kind: 'field', title: 'Supply the hold',
      select: { name: 'dep', options: list.map(function (id) {
        return { value: id, label: itemName(id) + ' (' + n(inv[id]) + ')' };
      }) },
      qty: { name: 'dep', value: 1 },
      button: { action: 'deposit', label: 'Deposit' },
      previewId: 'hr-cs-prev', preview: previewHtml(list[0], 1)
    };
  }
  function feastField() {
    var inv = G_().inventory || {};
    var foods = Object.keys(inv).filter(function (id) {
      var d = (window.ITEMS || {})[id];
      return d && d.heals > 0 && inv[id] > 0;
    }).sort(function (a, b) { return (window.ITEMS[b].heals || 0) - (window.ITEMS[a].heals || 0); }).slice(0, 12);
    if (!foods.length) return { kind: 'note', html: 'Cook something and the Tavern will take it.' };
    return {
      kind: 'field', title: '',
      select: { name: 'feast', options: foods.map(function (id) {
        return { value: id, label: itemName(id) + ' (' + n(inv[id]) + ') — ' + window.ITEMS[id].heals + ' each' };
      }) },
      qty: { name: 'feast', value: 1 },
      button: { action: 'feast-deposit', label: 'Lay it on the table' }
    };
  }
  function demandFor(itemId) {
    if (stored(itemId) >= storeCap()) return 'capped';
    var wanted = false;
    openOrders().forEach(function (o) { if ((o.materials || {})[itemId] != null) wanted = true; });
    var next = C().nextTier(castleTier());
    if (next && (C().TIER_BUNDLES[next.tier] || {})[itemId] != null) wanted = true;
    return wanted ? 'ordered' : 'normal';
  }
  function previewHtml(id, q) {
    var def = (window.ITEMS || {})[id];
    q = Math.max(0, Math.floor(+q || 0));
    if (!def || q <= 0) return '';
    var dm = demandFor(id);
    var cp = C().cpForDeposit(def.v, def.tier, dm, q);
    return '<span data-demand="' + dm + '">Pays <b>' + n(cp) + '</b> Contribution and <b>' +
      n(C().standingFor(cp)) + '</b> Standing' +
      (dm === 'ordered' ? ' &mdash; on demand, 1.5&times;.' : '.') + '</span>' +
      (dm === 'capped'
        ? '<div class="hr-cs-warn">The Storehouse is at its cap for this. It is paid at <b>0.4&times;</b> ' +
          'until the hold spends some or the Treasury is raised.</div>'
        : '');
  }
  function updatePreview(scope) {
    var el = (scope || document).querySelector('#hr-cs-prev');
    var sel = (scope || document).querySelector('[data-cs-sel="dep"]');
    var qty = (scope || document).querySelector('[data-cs-qty="dep"]');
    if (!el || !sel || !qty) return;
    el.innerHTML = previewHtml(sel.value, qty.value);
  }

  // ── opening a room ───────────────────────────────────────────
  var _roster = null;
  var _openRoom = null;
  function openRoom(id) {
    if (!ROOMS[id]) return;
    _openRoom = id;
    RoomModal.open(function () { return ROOMS[id](); });
    if (id === 'great_hall') {
      _kickArm = null;                       // a room re-opened is never pre-armed
      if (_roster === null) {
        window.HearthriseClans.roster().then(function (rows) {
          _roster = rows || [];
          if (_openRoom === 'great_hall') RoomModal.refresh();
        }).catch(function () { _roster = []; if (_openRoom === 'great_hall') RoomModal.refresh(); });
      }
      // Only leadership can see or act on invitations, so only leadership reads.
      if (isLeadership()) {
        readInvites().then(function () { if (_openRoom === 'great_hall') RoomModal.refresh(); })
          .catch(function () {});
      }
    }
    if (id === 'tavern') readBoard().then(function () { if (_openRoom === 'tavern') RoomModal.refresh(); })
      .catch(function () {});
  }
  /* Back-compatible entry point. The five spec modals became six rooms; these
     are the names the spec and the earlier build used, mapped to the room that
     absorbed each one. */
  var MODAL_ALIAS = { manage: 'great_hall', orders: 'great_hall', roster: 'great_hall',
                      stores: 'treasury', tavern: 'tavern' };
  function openModal(which) { openRoom(MODAL_ALIAS[which] || which); }
  function closeModal() { _openRoom = null; RoomModal.close(); }
  /* b225 (#18): HOSTING ONLY. The hold moved out of Social into its own
     top-level panel, so the "am I on screen?" check follows it. Nothing about
     what this module draws changed — only where it looks for its host. */
  function renderIfOpen() {
    var host = document.getElementById('clan-panel');
    var panel = document.getElementById('panel-clan');
    if (host && panel && panel.classList.contains('active')) {
      try { renderCastle(host); } catch (e) {}
    }
    RoomModal.refresh();
  }

  // ── event wiring ─────────────────────────────────────────────
  function wire(host) {
    if (host.__csWired) return;
    host.__csWired = true;
    host.addEventListener('click', onAction);
    // The hold is drawn as SVG, so a keyboard user needs the same door the
    // mouse gets. Enter/Space on a focused structure opens its room.
    host.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var t = e.target.closest && e.target.closest('[data-cs="room"]');
      if (!t) return;
      e.preventDefault();
      openRoom(t.getAttribute('data-b'));
    });
  }
  function onInput(e, scope) {
    if (e.target.matches && e.target.matches('[data-cs-sel="dep"],[data-cs-qty="dep"]')) {
      updatePreview(scope || document);
    }
  }
  function onAction(a, el, scope) {
    // Called two ways: as a DOM listener (one Event argument) from the panel,
    // and as the RoomModal's dispatcher (action, element, scope).
    if (a && a.target) {
      var ev = a;
      var t = ev.target.closest ? ev.target.closest('[data-cs]') : null;
      if (!t) { onInput(ev, document); return; }
      return onAction(t.getAttribute('data-cs'), t, ev.target.closest('.hr-room-scrim') || document);
    }
    el = el || document.createElement('div');
    scope = scope || document;
    if (a === 'room') { openRoom(el.getAttribute('data-b')); return; }
    if (a === 'leave') { closeModal(); window.HearthriseClans.leave(); return; }
    if (a === 'tier-up') { tierUp(); return; }
    if (a === 'post') { postOrder(el.getAttribute('data-b')); return; }
    if (a === 'complete') { completeOrder(el.getAttribute('data-o')); return; }
    if (a === 'supply') {
      var items = {};
      items[el.getAttribute('data-i')] = +el.getAttribute('data-q') || 0;
      supplyOrder(el.getAttribute('data-o'), items);
      return;
    }
    if (a === 'deposit') {
      var sel = scope.querySelector('[data-cs-sel="dep"]'), q = scope.querySelector('[data-cs-qty="dep"]');
      if (sel && q) deposit(sel.value, q.value);
      return;
    }
    if (a === 'bank') {
      var gq = scope.querySelector('[data-cs-qty="gold"]');
      if (gq) {
        window.HearthriseClans.contribute(gq.value).then(function (ok) {
          if (ok) readSeat(true).then(renderIfOpen).catch(function () {});
        }).catch(function () {});
      }
      return;
    }
    if (a === 'feast-deposit') {
      var fs = scope.querySelector('[data-cs-sel="feast"]'), fq = scope.querySelector('[data-cs-qty="feast"]');
      if (fs && fq) feastDeposit(fs.value, fq.value);
      return;
    }
    if (a === 'feast-call') { feastCall(); return; }
    if (a === 'board-claim') { boardClaim(el.getAttribute('data-t')); return; }
    // ── membership (2026-08-11 authority; the panel side) ──
    if (a === 'kick') {
      var ku = el.getAttribute('data-u');
      if (_kickArm !== ku) { _kickArm = ku; RoomModal.refresh(); return; }   // arm, then act
      _kickArm = null;
      var hrs = banHoursPicked(scope);
      window.HearthriseClans.kick(ku, hrs).then(function (ok) {
        if (ok) refreshMembership();
      }).catch(function () {});
      return;
    }
    if (a === 'invite-send') {
      var it = scope.querySelector('[data-cs-txt="invite"]');
      var nm = it ? String(it.value || '').trim() : '';
      if (!nm) { toast('Type the name they play under', 'info'); return; }
      window.HearthriseClans.invite(nm).then(function (ok) {
        if (ok) { if (it) it.value = ''; refreshMembership(); }
      }).catch(function () {});
      return;
    }
    if (a === 'invite-revoke') {
      window.HearthriseClans.inviteRevoke(el.getAttribute('data-u')).then(function (ok) {
        if (ok) refreshMembership();
      }).catch(function () {});
      return;
    }
    if (a === 'door-set') {
      var ds = scope.querySelector('[data-cs-sel="door"]');
      window.HearthriseClans.setJoinPolicy(ds ? ds.value : 'open').then(function (ok) {
        if (ok) RoomModal.refresh();
      }).catch(function () {});
      return;
    }
    // ── governance ──
    if (a === 'vice') { setVice(el.getAttribute('data-u'), el.getAttribute('data-g') === '1'); return; }
    if (a === 'vote-cast') { castVote(el.getAttribute('data-b')); return; }
    if (a === 'vote-close') { closeVote(); return; }
    if (a === 'vote-pick') {
      var pid = el.getAttribute('data-b');
      var at = _votePick.indexOf(pid);
      if (at >= 0) _votePick.splice(at, 1);
      else if (_votePick.length < C().VOTE_MAX_CANDIDATES) _votePick.push(pid);
      else toast('A vote holds at most ' + C().VOTE_MAX_CANDIDATES + ' choices', 'info');
      renderIfOpen();
      return;
    }
    if (a === 'vote-open') {
      var hs = scope.querySelector('[data-cs-sel="votehrs"]');
      openVote(_votePick.slice(), hs ? (+hs.value || C().VOTE_DEFAULT_HOURS) : C().VOTE_DEFAULT_HOURS);
      return;
    }
  }

  // ════════════════════════════════════════════════════════════
  // 11 · BOOT
  // ════════════════════════════════════════════════════════════
  function wireLabour() {
    if (window.__castleLabourHooked) return;
    if (typeof window.wrapUpdateDaily !== 'function' || typeof window.updateDaily !== 'function') {
      setTimeout(wireLabour, 200); return;
    }
    window.__castleLabourHooked = true;
    window.wrapUpdateDaily('castleLabour', function (type, amt) {
      addLabour(type, amt);
      addBoard(type, amt);
    });
  }

  /* Item glyphs for the four castle goods. itemGlyphKey's fallback would file a
     Timber Beam under uiChest; these are the shapes the atlas already has for
     what they actually are. Same additive pattern muster.js uses for the Seal —
     no emoji reaches the DOM either way, this just makes the icon correct. */
  var GOOD_GLYPHS = { timber_beam: 'uiLog', iron_fitting: 'uiAnvil', field_ration: 'uiFood', keystone: 'uiOre' };
  function wireGlyphs() {
    if (window.__castleGlyphHooked || typeof window.itemGlyphKey !== 'function') return;
    window.__castleGlyphHooked = true;
    var orig = window.itemGlyphKey;
    window.itemGlyphKey = function (id) {
      if (GOOD_GLYPHS[id]) return GOOD_GLYPHS[id];
      return orig.apply(this, arguments);
    };
  }

  function boot() {
    try {
      installBonusHook();
      wireLabour();
      wireGlyphs();
      setInterval(function () { flushLabour().catch(function () {}); }, C().LABOUR_FLUSH_MS);
      setInterval(function () { flushBoard().catch(function () {}); }, C().LABOUR_FLUSH_MS);
      // A running feast changes what every action is worth, so the panel and the
      // Last Call countdown have to stay honest without a reload.
      setInterval(function () { if (feastActive()) renderIfOpen(); }, 30000);
    } catch (e) { try { console.warn('[clan-seat] boot failed', e); } catch (e2) {} }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 500); });
  else setTimeout(boot, 500);

  window.HearthriseClanSeatUI = {
    BUILDINGS: BUILDINGS,
    GREAT_HALL_ALLXP_PER_TIER: GREAT_HALL_ALLXP_PER_TIER,
    greatHallAllXp: greatHallAllXp,
    /* b228: CASTLE_TOTAL_CAP and PERMANENT_ALLXP_CAP are gone — the chain-wide
       budget moved to HearthrisePowerBudget, which is the only place a cap can
       be enforced rather than merely declared. CASTLE_KEY_CAP stays: it is the
       castle's own SHARE, enforced where it is granted. */
    CASTLE_KEY_CAP: CASTLE_KEY_CAP,
    PERK_RUNGS: PERK_RUNGS, PERK_PER_RUNG: PERK_PER_RUNG, perkAtLevel: perkAtLevel,
    /* The castle road to Rested XP, in flat XP per charge. legacy.js takes the
       larger of this and the homestead Library's — two roads, one ceiling. */
    restedQuantum: function () { return seat() ? C().restedQuantum(level('tavern')) * perkScale() : 0; },
    // panel + rooms
    render: renderCastle, readSeat: readSeat,
    openRoom: openRoom, openModal: openModal, closeModal: closeModal,
    ROOM_IDS: ROOM_IDS, roomName: roomName, roomDescriptor: function (id) { return ROOMS[id] ? ROOMS[id]() : null; },
    supported: supported, seat: seat, buildingLevel: level, castleTier: castleTier,
    // perks
    castleBonus: castleBonus, castlePermanent: castlePermanent,
    permanentAllXp: permanentAllXp, budgetAudit: budgetAudit, perkScale: perkScale,
    feastActive: feastActive, feastBonus: feastBonus,
    // actions
    deposit: deposit, postOrder: postOrder, supplyOrder: supplyOrder,
    completeOrder: completeOrder, tierUp: tierUp,
    feastDeposit: feastDeposit, feastCall: feastCall, boardClaim: boardClaim,
    // labour
    addLabour: addLabour, flushLabour: flushLabour, activeOrder: activeOrder,
    // governance
    isVice: isVice, isLeader: isLeader, myCharge: myCharge,
    readVote: readVote, openVote: openVote, castVote: castVote, closeVote: closeVote,
    setVice: setVice, voteSupported: voteSupported,
    // Test seams — pure or state-only, no I/O.
    _holdScene: holdScene, _weekStrip: weekStripHtml, _roomArt: ROOM_ART,
    _demandFor: demandFor, _skillLevelFor: skillLevelFor, _depositable: depositable,
    _wingLadder: wingLadder, _previewHtml: previewHtml,
    _woBlock: workOrderLeadHtml, _voteCard: voteCardHtml, _rosterRow: rosterRow,
    /* The vote seam takes the RAW server shape and runs it through the same
       reducer the transport does, so a test can never pass against a shape the
       real read would have rejected. */
    _setVote: function (raw, mayOpen) {
      if (raw === null || raw === undefined) { _voteSupport = 'unsupported'; _vote = null; _mayOpenVote = false; return; }
      var r = C().reduceVoteRead(200, { ok: true, vote: raw, may_open: !!mayOpen });
      _voteSupport = 'live'; _vote = r.vote; _mayOpenVote = !!r.mayOpen; _voteAt = Date.now();
    },
    _setVotePick: function (list) { _votePick = (list || []).slice(); },
    _setRoster: function (rows) { _roster = rows || null; },
    // membership seams — state-only, no I/O, same shape the transport returns
    _setInvites: function (rows) { _invites = rows || null; _inviteRead = Date.now(); },
    _setKickArm: function (u) { _kickArm = u || null; },
    _kickArmed: function () { return _kickArm; },
    isLeadership: isLeadership,
    BAN_CHOICES: BAN_CHOICES,
    _setViceSupport: function (v) { _viceSupport = v; },
    _setClan: function (c) { _clanStub = c || null; },
    _setSeat: function (s, id) { _seat = s; _seatClan = id || (s ? clanId() : null); _support = s ? 'live' : 'unsupported'; },
    _setSupport: function (v) { _support = v; },
    _reset: function () {
      _clanStub = null; _seat = null; _seatClan = null; _support = 'unknown';
      _board = null; _boardPending = {}; _roster = null; _assignment = null;
      _labour = 0; _labourToday = 0; _labourCapped = false;
      _vote = null; _mayOpenVote = false; _voteSupport = 'unknown'; _voteAt = 0;
      _votePick = []; _viceSupport = 'unknown'; _voteChecking = false;
      _invites = null; _inviteRead = 0; _kickArm = null;
    },
    _setBoard: function (b) { _board = b; },
    _labour: function () { return { pending: _labour, today: _labourToday, capped: _labourCapped }; },
    _resetLabour: function () { _labour = 0; _labourToday = 0; _labourCapped = false; },
    _setLabourToday: function (v) { _labourToday = v | 0; }
  };
})();
