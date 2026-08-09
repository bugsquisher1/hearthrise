// ============================================================
// src/features/clan-seat.js  (b222, Wave 3a — THE CLAN SEAT foundation)
//
// docs/design/clan-overhaul.md v2 ("The Clan Seat"), §16 build steps 1-3.
//
// WHAT THIS FILE IS
//   The pure half of the castle: every formula the spec states, and every
//   reducer that turns a Supabase RPC response into a decision. No fetch, no
//   DOM, no panel, no state mutation. There is deliberately NO castle UI in
//   this wave — the Storehouse / Work Orders / Tavern modals are a later step,
//   and shipping their maths first means those modals are assembled from
//   functions that are already under test rather than from arithmetic written
//   inline in a renderer at 2am.
//
// WHY THE MATHS LIVES ON THE CLIENT AT ALL
//   The server is authoritative for currency, gates, rewards and rate. The
//   client still has to PREDICT: the deposit picker shows a live CP preview
//   (§13), the Work Order card shows a labour bar, the roster shows decayed CP.
//   A prediction that disagrees with the server reads as a bug even when the
//   server is right — so both sides compute from the same stated formulas, and
//   these are the client's copy of them, in one place, tested.
//
//   The server ALWAYS wins on every response. Nothing here is ever the source
//   of a stored number.
//
// FEATURE DETECTION
//   Same contract as muster.js: an RPC that does not exist yet answers 404 /
//   PGRST202 / 42883 / 42P01, which every reducer maps to {action:'unsupported'}
//   so the client can ship BEFORE supabase/migrations/2026-08-08-clan-seat.sql
//   is run. Unsupported is not an error — it is "the castle isn't built yet".
// ============================================================
(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════════
     1. CONTRIBUTION — Standing, CP and the demand multiplier (§3.4)

       CP_per_unit = ceil(item_gold_value / 10) × tier_mult × demand_mult
       Standing    = floor(CP × 0.35)

     The /10 exists purely so CP reads as a human number. The 0.4× at
     Storehouse cap is the load-bearing rule: it stops one player dumping
     40,000 Normal Planks and owning the ladder while the hold starves for
     Fittings. It is also the rule the deposit picker must WARN about — a rule
     the player only discovers after being paid 40% feels like a bug.
     ══════════════════════════════════════════════════════════════ */
  var TIER_MULT = [1.0, 1.4, 2.0, 2.9, 4.2, 6.0, 8.6];   // material tiers 1→7
  var STANDING_RATIO = 0.35;
  var DEMAND = { ordered: 1.5, normal: 1.0, capped: 0.4 };

  function tierMult(tier) {
    var i = (tier | 0) - 1;
    if (i < 0) i = 0;
    if (i >= TIER_MULT.length) i = TIER_MULT.length - 1;
    return TIER_MULT[i];
  }
  function demandMult(kind) {
    return Object.prototype.hasOwnProperty.call(DEMAND, kind) ? DEMAND[kind] : DEMAND.normal;
  }
  // value = the item's gold value (ITEMS[id].v); tier = ITEMS[id].tier.
  function cpForUnit(value, tier, demand) {
    var v = Math.max(0, Number(value) || 0);
    if (v <= 0) return 0;
    return Math.floor(Math.ceil(v / 10) * tierMult(tier) * demandMult(demand));
  }
  function cpForDeposit(value, tier, demand, qty) {
    var n = Math.max(0, Math.floor(Number(qty) || 0));
    return cpForUnit(value, tier, demand) * n;
  }
  function standingFor(cp) {
    return Math.floor(Math.max(0, Number(cp) || 0) * STANDING_RATIO);
  }

  /* CP decays 12%/week, applied LAZILY on read — no cron, no drift, and a clan
     that goes quiet for three months comes back with its castle intact and its
     ladder honestly reset (§3.3). Standing never decays; that is the whole
     point of having two numbers. */
  var CP_DECAY_PER_WEEK = 0.88;
  var WEEK_MS = 7 * 24 * 3600 * 1000;
  function decayedCp(cp, cpAtMs, nowMs) {
    var c = Math.max(0, Number(cp) || 0);
    if (c <= 0) return 0;
    var at = Number(cpAtMs);
    var now = Number(nowMs);
    if (!isFinite(at) || !isFinite(now) || now <= at) return Math.floor(c);
    var weeks = (now - at) / WEEK_MS;
    return Math.floor(c * Math.pow(CP_DECAY_PER_WEEK, weeks));
  }

  /* ══════════════════════════════════════════════════════════════
     2. CASTLE TIERS (§5) — gated on Standing, never on gold.

     clan `level` (the ×4 gold ladder in clan_contribute, which puts level 10 at
     655,360,000 gold) is NOT the gate and cannot be: see §2.3 and CONFLICTS #1.
     ══════════════════════════════════════════════════════════════ */
  var TIERS = [
    { tier: 1, name: 'The Foundation', standing: 0,      gold: 0,       members: 10, buildingCap: 2,  contributors: 0,  huntClear: 0 },
    { tier: 2, name: 'Rising Walls',  standing: 12000,  gold: 40000,   members: 15, buildingCap: 4,  contributors: 3,  huntClear: 0 },
    { tier: 3, name: 'Timber Hold',   standing: 60000,  gold: 200000,  members: 25, buildingCap: 6,  contributors: 5,  huntClear: 0 },
    { tier: 4, name: 'Stone Bailey',  standing: 240000, gold: 800000,  members: 40, buildingCap: 8,  contributors: 8,  huntClear: 2 },
    { tier: 5, name: 'Fortified Keep',standing: 900000, gold: 3000000, members: 60, buildingCap: 10, contributors: 12, huntClear: 3 }
  ];
  // The material bundle each tier demands. Spoils lines accept RAW combat drops
  // — the one exception to "the castle refuses raw materials" (§4.2): a kill is
  // already a completed activity, and a hold takes tribute of trophies.
  var TIER_BUNDLES = {
    2: { timber_beam: 300,  iron_fitting: 120 },
    3: { timber_beam: 900,  iron_fitting: 500,  field_ration: 400,  _spoils: { tiers: [2, 3], qty: 60 } },
    4: { timber_beam: 2400, iron_fitting: 1500, field_ration: 1200, keystone: 40,  _spoils: { tiers: [4], qty: 150 } },
    5: { timber_beam: 6000, iron_fitting: 4000, field_ration: 3000, keystone: 200, _spoils: { tiers: [5], qty: 400 },
         war_crown: 1, ancient_claw: 1, dragon_gem: 1 }
  };
  function tierDef(t) {
    for (var i = 0; i < TIERS.length; i++) if (TIERS[i].tier === (t | 0)) return TIERS[i];
    return null;
  }
  function tierName(t) { var d = tierDef(t); return d ? d.name : 'The Foundation'; }
  function nextTier(t) { return tierDef((t | 0) + 1); }
  // No building may exceed castle_tier × 2 in level (§5).
  function buildingLevelCap(castleTier) { return Math.max(0, (castleTier | 0) * 2); }
  // 1 + floor(tier/3) → 1 slot at tiers 1-2, 2 slots at tiers 3-5 (§6.7).
  function buildSlots(castleTier) { return 1 + Math.floor(Math.max(1, castleTier | 0) / 3); }
  // The two-way interlock with the Hunt (§11.3).
  function maxHuntTier(castleTier, warRoomLevel) {
    return Math.min(Math.max(1, castleTier | 0), 1 + Math.floor(Math.max(0, warRoomLevel | 0) / 3));
  }
  /* A tier requires N DISTINCT contributors, and CP only counts toward a gate
     after 72h in the clan — the alt-farm mitigation, free because
     clan_members.joined_at already exists (§5.2). Mirrored here so the client
     can grey the button out and say WHY; the server re-checks it regardless. */
  var MEMBERSHIP_GRACE_MS = 72 * 3600 * 1000;
  function eligibleContributors(rows, nowMs) {
    var now = Number(nowMs) || Date.now();
    var seen = {};
    (rows || []).forEach(function (r) {
      if (!r || !r.user_id) return;
      var joined = Number(r.joined_at);
      if (!isFinite(joined) || now - joined < MEMBERSHIP_GRACE_MS) return;
      seen[r.user_id] = true;
    });
    return Object.keys(seen).length;
  }

  /* ══════════════════════════════════════════════════════════════
     3. WORK ORDERS (§6.2, §6.5, §6.6)

     The Labour factor is the best number in the source doc and it is kept
     verbatim: a level-20 player generates 0.70 Labour per action and a level-99
     player 1.5 — a 2× gap, not a 40× gap. The clan's value comes from
     attendance, not from gear, which is what lets a dozen casuals out-build one
     whale. The 400/day cap is the same idea enforced from the other end.
     ══════════════════════════════════════════════════════════════ */
  var DAILY_LABOUR_CAP = 400;
  var LABOUR_CALL_CLAMP = 200;      // per flush, mirroring the Muster's clamp
  var LABOUR_FLUSH_MS = 30000;
  function labourFactor(skillLevel) {
    var lv = Math.max(1, Math.min(99, Math.floor(Number(skillLevel) || 1)));
    return 0.5 + lv / 99;
  }
  function labourForAction(skillLevel, actions) {
    var n = Math.max(0, Math.floor(Number(actions) || 0));
    return labourFactor(skillLevel) * n;
  }
  /* §6.5's stated formula. Its own worked TABLE prints 18,776 at level 10;
     round(800 × 1.42^9) is 18,780. The formula wins — a table is a rendering
     of a formula, not a second source — and the 4-tick difference is pinned by
     the b222 suite so it is never rediscovered as a bug. Flagged to Design. */
  function labourTarget(level) {
    return Math.round(800 * Math.pow(1.42, Math.max(1, level | 0) - 1));
  }
  function materialScale(level) {
    return Math.pow(1.58, Math.max(1, level | 0) - 1);
  }
  function timeFloorMs(level) {
    var h = 2 * Math.pow(1.15, Math.max(1, level | 0) - 1);
    return Math.round(Math.min(48, h) * 3600000);       // capped at 48h
  }
  // What a member may still contribute today, given what they already have.
  function labourRemainingToday(ticksToday) {
    return Math.max(0, DAILY_LABOUR_CAP - Math.max(0, Math.floor(Number(ticksToday) || 0)));
  }

  /* ══════════════════════════════════════════════════════════════
     4. UPKEEP AND DORMANCY (§10)

     Settled every Sunday 00:00 UTC, LAZILY — the first RPC to touch the clan
     after the boundary computes the weeks elapsed and settles them. Same
     "derive, never store the schedule" discipline as the Muster migration.

     Nothing is ever destroyed or de-levelled. That is a retention decision, not
     a balance one: a clan that goes quiet for three months comes back and is
     running again inside a day.
     ══════════════════════════════════════════════════════════════ */
  function upkeepDiscount(treasuryLevel) {
    return 1 - Math.min(10, Math.max(0, treasuryLevel | 0)) * 0.01;   // max −10%
  }
  function totalBuildingLevels(upgrades) {
    var t = 0;
    if (upgrades && typeof upgrades === 'object') {
      Object.keys(upgrades).forEach(function (k) {
        var v = Number(upgrades[k]);
        if (isFinite(v) && v > 0) t += Math.floor(v);
      });
    }
    return t;
  }
  function upkeepDue(upgrades, treasuryLevel) {
    var lv = totalBuildingLevels(upgrades);
    var d = upkeepDiscount(treasuryLevel);
    return { gold: Math.ceil(lv * 250 * d), rations: Math.ceil(lv * 2 * d), levels: lv };
  }
  // Active ≥100% · Strained 50-99% · Dormant <50%. Perks at 60% while Strained.
  function upkeepStateFor(paidFraction) {
    var f = Number(paidFraction);
    if (!isFinite(f)) f = 0;
    if (f >= 1) return 'active';
    if (f >= 0.5) return 'strained';
    return 'dormant';
  }
  function perkScaleFor(state) {
    if (state === 'strained') return 0.6;
    if (state === 'dormant') return 0;
    return 1;
  }
  /* The Sunday 00:00 UTC boundary, derived. Returns the most recent boundary
     at or before `nowMs` — settling is "how many of these have I crossed since
     upkeep_settled_at", which is a subtraction, not a schedule table. */
  function lastUpkeepBoundary(nowMs) {
    var d = new Date(Number(nowMs) || Date.now());
    var b = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    b -= d.getUTCDay() * 86400000;                  // getUTCDay(): 0 = Sunday
    return b;
  }
  function nextUpkeepBoundary(nowMs) {
    return lastUpkeepBoundary(nowMs) + WEEK_MS;
  }
  function upkeepWeeksOwed(settledAtMs, nowMs) {
    var now = Number(nowMs) || Date.now();
    var at = Number(settledAtMs);
    if (!isFinite(at)) return 0;
    var boundary = lastUpkeepBoundary(now);
    if (at >= boundary) return 0;
    return Math.max(0, Math.floor((boundary - lastUpkeepBoundary(at)) / WEEK_MS));
  }

  /* ══════════════════════════════════════════════════════════════
     5. THE TAVERN (§9) — the numbers the engine seams will consume.

     None of this is wired yet: legacy.js b222 landed the two seams these feed
     (registerBuffScaler for the Hearth, G.restedXp for the Common Room) and
     they are inert until a real Tavern level exists to drive them. The formulas
     live here now so the wiring is a one-line hand-off rather than a second
     round of balance archaeology.
     ══════════════════════════════════════════════════════════════ */
  // The Hearth: +4% duration and +2% strength per Tavern level (§9.1).
  function hearthScale(tavernLevel) {
    var lv = Math.max(0, Math.min(10, tavernLevel | 0));
    return { duration: 1 + 0.04 * lv, magnitude: 1 + 0.02 * lv };
  }
  function leftoversChance(tavernLevel) {
    return Math.max(0, Math.min(10, tavernLevel | 0)) * 0.005;   // 0.5%/lvl → 5%
  }
  // The Common Room: each banked charge is worth +2% × Tavern level (§9.4).
  // This is the value the castle will publish as getBonus('restedXp').
  function restedPotency(tavernLevel) {
    return Math.max(0, Math.min(10, tavernLevel | 0)) * 0.02;
  }
  var RESTED_CHARGE_MS = 6 * 60 * 1000;
  var RESTED_CAP = 80;
  // Feasts (§9.3). Meter cap 600 + 120 × level; fill contribution is the food's
  // `heals` value, so the meter is honest about effort.
  function feastMeterCap(tavernLevel) {
    return 600 + 120 * Math.max(0, Math.min(10, tavernLevel | 0));
  }
  var FEAST_COOLDOWN_MS = 20 * 3600 * 1000;   // 20h, NOT 24 — it drifts round
  var LAST_CALL_MS = 30 * 60 * 1000;          // the final 30 min, Tavern 7+
  function feastEffect(tavernLevel) {
    var lv = Math.max(1, Math.min(10, tavernLevel | 0));
    if (lv >= 10) return { hours: 4, allXP: 0.18, yield: 0.12, artisan: 0.12 };
    if (lv >= 7)  return { hours: 3, allXP: 0.15, yield: 0.10, artisan: 0.10 };
    if (lv >= 4)  return { hours: 2, allXP: 0.12, yield: 0.08, artisan: 0 };
    return { hours: 1, allXP: 0.08, yield: 0, artisan: 0 };
  }
  // Last Call doubles every effect for the final 30 minutes (Tavern 7+).
  function feastEffectAt(tavernLevel, msRemaining) {
    var e = feastEffect(tavernLevel);
    if ((tavernLevel | 0) < 7 || !(msRemaining >= 0 && msRemaining <= LAST_CALL_MS)) return e;
    return { hours: e.hours, allXP: e.allXP * 2, yield: e.yield * 2, artisan: e.artisan * 2, lastCall: true };
  }

  /* ══════════════════════════════════════════════════════════════
     6. TREASURY AND SUCCESSION (§12.2)

     A withdrawal over 10% of the treasury takes 24 hours and announces itself
     in clan chat. A leader who has not been seen for 21 days can be succeeded
     by the highest-CP officer. Both kept verbatim; both are anti-grief rules
     whose value is that they are PREDICTABLE, so they are stated once here and
     enforced again server-side.
     ══════════════════════════════════════════════════════════════ */
  var WITHDRAW_THRESHOLD = 0.10;
  var WITHDRAW_DELAY_MS = 24 * 3600 * 1000;
  var LEADER_GHOST_MS = 21 * 24 * 3600 * 1000;
  function withdrawNeedsDelay(amount, treasury) {
    var a = Math.max(0, Number(amount) || 0);
    var t = Math.max(0, Number(treasury) || 0);
    if (a <= 0 || t <= 0) return false;
    return a > t * WITHDRAW_THRESHOLD;
  }
  /* An absent last_seen must NEVER open succession. A clan whose leader row
     predates the column would otherwise be claimable the instant the migration
     lands — `Number(null)` is 0, and 0 is a finite timestamp in 1970. Succession
     is a hostile-takeover path; it fails closed. */
  function canClaimLeadership(leaderLastSeenMs, nowMs) {
    if (leaderLastSeenMs == null || leaderLastSeenMs === '') return false;
    var seen = Number(leaderLastSeenMs);
    var now = Number(nowMs) || Date.now();
    if (!isFinite(seen) || seen <= 0) return false;
    return now - seen >= LEADER_GHOST_MS;
  }

  /* ══════════════════════════════════════════════════════════════
     7. THE 34 ROUTED SPOILS (§4.4)

     Every drop in this table was recipe-less vendor trash before the Clan Seat:
     the largest open item on the Designer's backlog, recounted against the live
     tables at 34 (not the ~25 previously logged). Four of them became real
     recipe inputs in b222 (items.js / recipes.js); the other thirty are routed
     into castle demand — Work Order spoils lines, tier bundles, Tavern Board
     tributes, and three trophies hung in the Great Hall.

     This table is the machine-readable form of that promise, and the b222
     regression suite asserts (a) all 34 ids exist in ITEMS, and (b) the four
     `recipe` routes really do appear as recipe inputs. A routing table nobody
     checks is how "every drop has a job" quietly becomes false again.
     ══════════════════════════════════════════════════════════════ */
  var SPOILS_ROUTES = {
    /* Recipe inputs — LIVE in b222. */
    slime_gel:          { route: 'recipe',      phase: 'A', via: 'craft_timber_beam' },
    bone_chips:         { route: 'recipe',      phase: 'A', via: 'smith_iron_fitting' },
    ancient_fragment:   { route: 'recipe',      phase: 'A', via: 'craft_keystone' },
    cracked_spellstone: { route: 'recipe',      phase: 'A', via: 'craft_keystone' },
    /* Tavern Board bulk tributes — the Barkeep pays for vermin. */
    rat_tail:           { route: 'board',       phase: 'A' },
    goblin_ear:         { route: 'board',       phase: 'A' },
    bat_wing:           { route: 'board',       phase: 'A' },
    small_fang:         { route: 'board',       phase: 'A' },
    night_fang:         { route: 'board',       phase: 'A' },
    dire_fang:          { route: 'board',       phase: 'A' },
    /* Work Order spoils lines. */
    rune_frag:          { route: 'work_order',  phase: 'A', tiers: [1, 2] },
    dark_sigil:         { route: 'work_order',  phase: 'A', tiers: [1, 2] },
    venom_sac:          { route: 'work_order',  phase: 'A', tiers: [2, 3] },
    spider_eye:         { route: 'work_order',  phase: 'A', tiers: [2, 3] },
    brute_plate:        { route: 'work_order',  phase: 'A', tiers: [2, 3] },
    grave_dust:         { route: 'work_order',  phase: 'A', tiers: [2, 3] },
    /* Castle tier bundles — the "spoils tithe" line. */
    plague_ichor:       { route: 'tier_bundle', phase: 'A', tiers: [3, 4] },
    swarm_heart:        { route: 'tier_bundle', phase: 'A', tiers: [3, 4] },
    wraith_veil:        { route: 'tier_bundle', phase: 'A', tiers: [3, 4] },
    demon_shard:        { route: 'tier_bundle', phase: 'A', tiers: [3, 4] },
    hell_ember:         { route: 'tier_bundle', phase: 'A', tiers: [3, 4] },
    shadow_thread:      { route: 'tier_bundle', phase: 'A', tiers: [4, 5] },
    void_chitin:        { route: 'tier_bundle', phase: 'A', tiers: [4, 5] },
    shadow_pelt:        { route: 'tier_bundle', phase: 'A', tiers: [4, 5] },
    razor_claw:         { route: 'tier_bundle', phase: 'A', tiers: [4, 5] },
    death_steel:        { route: 'tier_bundle', phase: 'A', tiers: [4, 5] },
    ruby:               { route: 'tier_bundle', phase: 'A', tiers: [4, 5] },
    hollow_sigil:       { route: 'tier_bundle', phase: 'A', tiers: [4, 5] },
    /* The Great Hall capstone — ONE each. Trophies, not a grind: they read on
       the panel as three objects on a wall. */
    war_crown:          { route: 'capstone',    phase: 'A', qty: 1 },
    ancient_claw:       { route: 'capstone',    phase: 'A', qty: 1 },
    dragon_gem:         { route: 'capstone',    phase: 'A', qty: 1 },
    /* Phase-B research reagents — specified now so nobody invents a second
       pattern for them later (§4.5). */
    sticky_core:        { route: 'archives',    phase: 'B' },
    goblin_totem:       { route: 'archives',    phase: 'B' },
    alpha_fang:         { route: 'armory',      phase: 'B' }
  };
  function spoilRoute(itemId) { return SPOILS_ROUTES[itemId] || null; }

  /* ══════════════════════════════════════════════════════════════
     8. REDUCERS — the server contract, pure and directly testable.

     Byte-identical feature-detection to muster.js: a missing RPC is
     'unsupported', never 'fail'. The distinction matters — 'fail' shows the
     player an error, 'unsupported' shows them the pre-migration state, and
     confusing the two turns "not built yet" into "your clan is broken".

     A response that is not the RPC's own {ok:boolean,…} envelope is a REFUSAL,
     never a success. A 401 body has no `ok` field, and treating one as
     acceptance would credit Standing that the server never granted.
     ══════════════════════════════════════════════════════════════ */
  function isMissingRpc(status, out) {
    return status === 404 || (out && (out.code === 'PGRST202' || out.code === '42883' || out.code === '42P01'));
  }
  var ERRORS = {
    not_member:        'You are not a member of this hold',
    not_signed_in:     'Sign in to supply the hold',
    not_castle_good:   'The Storehouse refuses raw materials — refine them first',
    bad_amount:        'That is not a quantity the Storehouse accepts',
    daily_cap:         'You have supplied all the hold can take from you today',
    no_slot:           'Every build slot is already in use',
    not_steward:       'Only the leader or a Steward may commission work',
    too_high:          'The Great Hall is not large enough for that level yet',
    materials_short:   'The Work Order still needs materials',
    labour_short:      'The Work Order still needs labour',
    too_soon:          'The work is not finished — it needs time as well as hands',
    standing_short:    'The hold has not earned enough Standing',
    bundle_short:      'The Storehouse does not hold the full bundle',
    contributors_short:'Not enough members have supplied this tier',
    hunt_required:     'A Hunt clear at the matching tier is required first',
    dormant:           'The hold is dormant — settle its upkeep first',
    network:           'Could not reach the server — try again in a moment'
  };
  function errorText(e) { return ERRORS[e] || 'The server refused that'; }

  /* The shared envelope reader. Every clan-seat RPC answers the same shape, so
     there is one implementation and the named reducers below only add the
     fields their caller needs. One reader = one place for the 401 rule. */
  function reduceEnvelope(status, out, pick) {
    if (isMissingRpc(status, out)) return { action: 'unsupported' };
    if (status >= 400 || !out || typeof out !== 'object' || typeof out.ok !== 'boolean') {
      return { action: 'fail', error: 'network', message: errorText('network') };
    }
    if (out.ok === false) {
      var err = out.error || '';
      return { action: 'fail', error: err, message: errorText(err) };
    }
    var res = { action: 'accept' };
    if (typeof pick === 'function') {
      var extra = pick(out) || {};
      for (var k in extra) res[k] = extra[k];
    }
    return res;
  }

  function reduceDeposit(status, out) {
    return reduceEnvelope(status, out, function (o) {
      return {
        cp: Math.max(0, +o.cp || 0),
        standing: Math.max(0, +o.standing || 0),
        clanStanding: Math.max(0, +o.clan_standing || 0),
        stored: o.stored && typeof o.stored === 'object' ? o.stored : {},
        // The server tells us which multiplier it actually applied. The picker
        // previewed one; if the Storehouse hit its cap mid-deposit the answer
        // is 0.4× and the player is owed that explanation, not a silent 60% cut.
        demand: o.demand === 'ordered' || o.demand === 'capped' ? o.demand : 'normal',
        capped: !!o.capped
      };
    });
  }
  function reduceWorkLabour(status, out) {
    return reduceEnvelope(status, out, function (o) {
      return {
        added: Math.max(0, +o.added || 0),
        // The server total ALWAYS wins — the local accumulator is a prediction.
        labourDone: Math.max(0, +o.labour_done || 0),
        labourTarget: Math.max(0, +o.labour_target || 0),
        ticksToday: Math.max(0, +o.ticks_today || 0),
        capped: !!o.capped,
        phase: o.phase || 'labour'
      };
    });
  }
  function reduceTierUp(status, out) {
    return reduceEnvelope(status, out, function (o) {
      return {
        tier: Math.max(1, +o.castle_tier || 1),
        name: tierName(+o.castle_tier || 1),
        standing: Math.max(0, +o.standing || 0),
        contributors: Math.max(0, +o.contributors || 0)
      };
    });
  }
  function reduceUpkeep(status, out) {
    return reduceEnvelope(status, out, function (o) {
      var st = o.upkeep_state;
      return {
        state: (st === 'strained' || st === 'dormant') ? st : 'active',
        perkScale: perkScaleFor(st),
        weeksSettled: Math.max(0, +o.weeks || 0),
        goldPaid: Math.max(0, +o.gold_paid || 0),
        rationsPaid: Math.max(0, +o.rations_paid || 0)
      };
    });
  }
  function reduceWithdraw(status, out) {
    return reduceEnvelope(status, out, function (o) {
      return {
        // A large withdrawal is not refused — it is DELAYED and announced. The
        // client must render "pending until <t>", not "done".
        pending: !!o.pending,
        readyAt: o.ready_at || null,
        amount: Math.max(0, +o.amount || 0),
        treasury: Math.max(0, +o.treasury || 0)
      };
    });
  }

  /* ══════════════════════════════════════════════════════════════ */
  window.HearthriseClanSeat = {
    // contribution
    TIER_MULT: TIER_MULT, DEMAND: DEMAND, STANDING_RATIO: STANDING_RATIO,
    CP_DECAY_PER_WEEK: CP_DECAY_PER_WEEK,
    tierMult: tierMult, demandMult: demandMult,
    cpForUnit: cpForUnit, cpForDeposit: cpForDeposit, standingFor: standingFor,
    decayedCp: decayedCp,
    // castle tiers
    TIERS: TIERS, TIER_BUNDLES: TIER_BUNDLES,
    tierDef: tierDef, tierName: tierName, nextTier: nextTier,
    buildingLevelCap: buildingLevelCap, buildSlots: buildSlots, maxHuntTier: maxHuntTier,
    MEMBERSHIP_GRACE_MS: MEMBERSHIP_GRACE_MS, eligibleContributors: eligibleContributors,
    // work orders
    DAILY_LABOUR_CAP: DAILY_LABOUR_CAP, LABOUR_CALL_CLAMP: LABOUR_CALL_CLAMP,
    LABOUR_FLUSH_MS: LABOUR_FLUSH_MS,
    labourFactor: labourFactor, labourForAction: labourForAction,
    labourTarget: labourTarget, materialScale: materialScale, timeFloorMs: timeFloorMs,
    labourRemainingToday: labourRemainingToday,
    // upkeep
    upkeepDiscount: upkeepDiscount, totalBuildingLevels: totalBuildingLevels,
    upkeepDue: upkeepDue, upkeepStateFor: upkeepStateFor, perkScaleFor: perkScaleFor,
    lastUpkeepBoundary: lastUpkeepBoundary, nextUpkeepBoundary: nextUpkeepBoundary,
    upkeepWeeksOwed: upkeepWeeksOwed,
    // tavern
    hearthScale: hearthScale, leftoversChance: leftoversChance,
    restedPotency: restedPotency, RESTED_CHARGE_MS: RESTED_CHARGE_MS, RESTED_CAP: RESTED_CAP,
    feastMeterCap: feastMeterCap, feastEffect: feastEffect, feastEffectAt: feastEffectAt,
    FEAST_COOLDOWN_MS: FEAST_COOLDOWN_MS, LAST_CALL_MS: LAST_CALL_MS,
    // treasury + succession
    WITHDRAW_THRESHOLD: WITHDRAW_THRESHOLD, WITHDRAW_DELAY_MS: WITHDRAW_DELAY_MS,
    LEADER_GHOST_MS: LEADER_GHOST_MS,
    withdrawNeedsDelay: withdrawNeedsDelay, canClaimLeadership: canClaimLeadership,
    // spoils
    SPOILS_ROUTES: SPOILS_ROUTES, spoilRoute: spoilRoute,
    // reducers
    isMissingRpc: isMissingRpc, errorText: errorText, reduceEnvelope: reduceEnvelope,
    reduceDeposit: reduceDeposit, reduceWorkLabour: reduceWorkLabour,
    reduceTierUp: reduceTierUp, reduceUpkeep: reduceUpkeep, reduceWithdraw: reduceWithdraw
  };
})();
