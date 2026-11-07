// ════════════════════════════════════════════════════════════════════════
// src/data/balance-sheet.js — ONE TARGET SHEET, ONE STAT FORMULA, ONE TIER TABLE (Tyler 2026-11-07,
// "is there a formula you can start following?"; lane/b-ground-formula, game designer).
//
// Three things every hunting ground is built and graded by:
//   BALANCE_SHEET  what a ground must measure on the real engine (tools/balance-sim plays it).
//                  The grader (lane/b-ground-grader) and the balance lab (lane/b-balance-lab) read it.
//   STAT_FORMULA   a monster's hp, atk, baseAcc, def, xp and gp from its Level and its role, as
//                  per-Level curves and role multipliers (tools/gen-ground-stats.mjs writes the rows).
//   TIER_DIALS     Normal, Dangerous and Deadly as dials on the same stats: a bigger pull, % harder
//                  blows, % more HP, % more Level XP. Coin per kill never moves with a tier (Tyler
//                  2026-11-07: "BUT NOT GOLD because it doesn't cost gold to enter them"; "Dangerous
//                  and Deadly keep the bigger pulls").
//
// Every number says where it comes from: RULED (Tyler, dated: binding), or DESIGNER (the game
// designer's, provisional until the sample's measurement on the board, "2026-11-07 One formula for
// every hunt"). No rule here reads a hero's Level at fight time (Tyler 2026-11-04, NO LEVEL PENALTY):
// the formula runs when a ground is AUTHORED, and a monster's blow in a fight is its row against the
// hero's stats, as ever.
//
// PURE ESM. Data and pure functions only: no DOM, no clock, no randomness. Not read by the engine.
// ════════════════════════════════════════════════════════════════════════

import { LEVEL_PACE, VITALS } from './core-model.js?v=0.2.104';

/* ── THE TARGET SHEET ─────────────────────────────────────────────────────
   Judged per ground on the real engine, store supplies bought per use (the store bill is the whole
   supply cost), the reference bar, every combat skill at the hero's Level (tools/balance-sim cell.mjs).
   "Floor" = the ground's band floor (src/data/hunts.js), "middle" = the band's middle, rounded. */
export const BALANCE_SHEET = Object.freeze({
  /* NORMAL AT THE RIGHT LEVEL: a lone hero at the floor in that Level's gear (gear.mjs kitOf: the best
     piece its Level may wear and can get), each of the 8 ways to fight. RULED 10-25 §3 (Normal band:
     <= 1 death per 1,000 h, <= 1 dip under 25% per 12 h, a 12 h hunt almost always finishes);
     RULED 10-18 / 10-20 (every way at least +25% over its store bill at the floor, a minimum). */
  normal: Object.freeze({
    deathsPer1000h: 1,
    closeCallPct: 25,
    /* pooled over the 8 ways (a sample's 4 h a way can't read one in 12 h: one dip reads 3) */
    closeCallsPer12h: 1,
    /* the median encounter's low point, every way (10-25: Normal 60-80%; over 80 reads Easy, allowed) */
    typicalMinHpPct: 60,
    /* coin + commons over the store bill, every way: >= +25% */
    marginMin: 0.25,
    /* the median way's store bill as a share of its income. DESIGNER: from Level 16 a ground costs real
       supplies (Tyler 2026-11-07 accepted 21% at the Glade's floor); under 16 only the ceiling holds
       (the first-day grounds feed fresh heroes). */
    supplyShare: Object.freeze({ fromLevel: 16, min: 0.10, max: 0.35 }),
    /* XP: at the band's MIDDLE the median way's Level XP an hour within this share of the pace contract
       LEVEL_PACE.contract (a x L^b, the trend the Level curve is held to past the measured grounds; RULED
       10-25 §2 pace: L10 ~6 h, L25 ~36 h, L50 ~168 h at 12 h a day). A party ground: the four's per head. */
    xpVsContract: Object.freeze({ at: 'middle', min: 0.90, max: 1.10 }),
  }),
  /* THE FRESH HERO on a first-day ground (the grounds the Hunts window sends a LONE hero to at Levels 1-15):
     the style's practice set only (no armor), at the floor, every way. Mirrors tests/hunt-core/first-week-bands.mjs. */
  freshHero: Object.freeze({ upToLevel: 15, deaths: 0, closeCalls: 0, typicalMinHpPct: 60, marginMin: 0.25, xpVsPaceMin: 0.5 }),
  /* OUTSIDE YOUR WEIGHT CLASS (RULED 2026-11-06 20:20 UTC: "if you are fighting outside your weight class even
     in a party, you're gonna waste money but get more exp and possibly die a few times"; 11-04 the price is
     the monsters' own stats). A pair (tank + healer, hammer + bow) 2-3 Levels under the floor, and 5 under. */
  weightClass: Object.freeze({
    /* on Normal, 2-3 under: more Level XP a head than the pace of record at their OWN Level (what the ground that
       fits them pays; tools/balance-sim/level-pace.json). Their gold is not graded on Normal: Tyler 2026-11-07 took
       x1.2 knowing such a pair still nets about +2.6-3k an hour. */
    normalUnder: Object.freeze({ xpVsOwnPaceMin: 1.0 }),
    /* on Dangerous, 2-3 under: the median pair nets below zero a head (they pay for it; a kiting way may slip by, named) */
    dangerousUnder: Object.freeze({ netMax: 0 }),
    /* on Deadly, 2-3 under, and on Dangerous or Deadly 5 under: the median cell dies (a death in the sample) and loses gold */
    deadlyUnder: Object.freeze({ deathsMin: 1, netMax: 0 }),
  }),
  /* THE HARDER TIERS AT THE RIGHT LEVEL (RULED 11-05 tier words: bigger pulls, harder hits, more XP a kill,
     same coin and drops, you can die; RULED 11-06 "Yes, make it risky": they must really threaten a LONE hero). */
  tiers: Object.freeze({
    /* lone, at the floor: the median way earns at least this much more Level XP than on Normal, and most ways hold */
    dangerous: Object.freeze({ xpVsNormalMin: 1.10, loneHeldMin: 6 }),
    /* lone, at the floor: a real threat (the median way dies or loses gold); a four at the floor holds it
       (Andy 11-06 "mostly balanced for 4-man squads") and earns at least this much more than its Normal a head */
    deadly: Object.freeze({ loneMustCost: true, fourXpVsNormalMin: 1.25, fourDeathsPer16hMax: 9 }),
  }),
  /* PARTIES (RULED 10-25 §5): a well-optimized four earns 15-25% more Level XP a head than an efficient solo
     (the median lone way at the same Level on the same ground). Same-class fours never out-earn solo (10-31). */
  party: Object.freeze({ fourVsSolo: Object.freeze([1.15, 1.25]) }),
  /* BLOWS: a regular's largest blow at most this share of a same-Level hero's base HP (combat.js per-tier scale
     note: "an in-band blow stays ~20-30% of max HP"); a boss's at most 35% of the floor hero's (designer 10-21). */
  blows: Object.freeze({ regularMaxShare: 0.30, bossMaxShareOfFloor: 0.35 }),
  /* the sample every number above is read from (the brief: 2+ seeds x 2 h a cell) */
  sample: Object.freeze({ seeds: 2, hours: 2 }),
});

/** The pace contract's Level XP an hour at Level L (LEVEL_PACE.contract, a x L^b). */
export const contractXpPerH = (L) => LEVEL_PACE.contract.a * Math.max(1, L) ** LEVEL_PACE.contract.b;

/* ── THE STAT FORMULA ─────────────────────────────────────────────────────
   Inputs a designer writes per monster: its Level (where in the ground it lives), its role, its art tier
   (the damage scale combat.js reads: 5.4 for tiers 1-2, 4.0 for 3-4), its class (weaknesses, unchanged);
   and per ground its floor (the band's low Level). Everything below is DESIGNER, fitted on today's Glade at
   x1.2 (Tyler 2026-11-07, "make it 20% harder", a target the formula must reach) and Wickstead.
   READ AS PER-LEVEL DIALS (Tyler 2026-11-07): each curve below is a share of a same-Level hero or a rate per
   Level, so "+x% damage, +x% HP, +x% XP, +x% gold" are multipliers on them, and a ground SCALED up to a
   party's Level (a future paid option) is the same formula read at every monster's Level + the shift and the
   floor + the shift: HP keeps its own curve, so a Level 60 can't one-shot a scaled Level 10 ground. */
export const STAT_FORMULA = Object.freeze({
  /* THE REFERENCE HERO a curve is anchored on: a hero of the monster's own Level, base HP 150 + 10 a Level
     (VITALS), Defense at its Level, no guard. */
  refHp: (L) => VITALS.hpBase + VITALS.hpPerLevel * L,
  /* A GROUND'S DANGER, BY ITS FLOOR: a first-day ground (floor 8 or under) is gentle, because fresh heroes in
     practice sets hunt it (tests/hunt-core/first-week-bands.mjs); from floor 16 a ground bites in full; between,
     a straight line. 0..1. Keyed on the GROUND's floor, not the monster's Level: the Glade's Carrion Crow and
     Wickstead's Turncoat are both Level 16, and only one of them meets fresh heroes. */
  ramp: Object.freeze({ from: 8, to: 16 }),
  /* A REGULAR's to-hit at the same-Level hero with no guard: `lo` on a gentle ground, `hi` on a full one.
     The engine's to-hit is baseAcc + (atk - Defense - guard) x 0.02, clamped 5-85%; baseAcc is derived, so it
     is an offset, not a chance (it can pass 1 at high Levels). */
  hit: Object.freeze({ lo: 0.40, hi: 0.70 }),
  /* A REGULAR's largest blow, a share of the same-Level hero's base HP; atk = blow / the tier's damage scale.
     A monster above its hero's Level hits a bigger share of that hero (10 HP a Level), and more often (2% a Level). */
  blow: Object.freeze({ lo: 0.12, hi: 0.20 }),
  /* A REGULAR's HP (the row's: a party of four's, the engine scales it 55-100% by party size): base + perLevel x
     its Level, a straight line like a hero's damage, so it grows by perLevel / HP a Level (13% at 5, 7% at 16, 3%
     at 50). Fitted on every open ground's rows (Cellar 9 at Level 2, Glade 30 at 16, Warrens 150 at 34 / 2.5). */
  hp: Object.freeze({ base: 4.5, perLevel: 1.6 }),
  /* A REGULAR's defense: perLevel x its Level. */
  def: Object.freeze({ perLevel: 0.08 }),
  /* LEVEL XP a kill = a x L^b per HP point of the monster, never under `min` (today's grounds pay about
     1.8 x L^0.4 from the Thicket to the Warrens: the pace contract's L^1.365 rising over a hero's roughly linear
     damage; the Cellar's first kills pay about 3 a point, the floor). */
  xp: Object.freeze({ a: 1.70, b: 0.4, min: 3.0 }),
  /* COIN a kill: the mean gold per HP point, and the spread of [lo, hi] around it (today's grounds pay about
     0.30 g per HP at every Level), plus `danger` more on a ground that bites in full (by the ramp): HARDER PAYS MORE
     (Tyler 2026-11-03 and 11-04, "harder mobs grant better loot"). Measured: at one coin rate the Glade's floor tank
     netted 1,234 g an hour against the Sewer party's 1,900, and a lone tank at 25 earned more on Wickstead
     (forest-cave glade-between, harder-pays-more): the food the danger costs has to come back in coin. */
  gp: Object.freeze({ perHp: 0.30, lo: 0.5, hi: 1.5, danger: 0.30 }),
  /* A PARTY GROUND (hunt-grounds.js groupFit 'party', or a pocket that needs a party) is built for four heroes'
     damage: its rows carry this much more HP, and so this much more XP and coin a kill (today's Sewer and Warrens
     stand 2.2-3x the solo grounds' HP at their Levels). */
  fit: Object.freeze({ solo: 1, both: 1, party: 2.5 }),
});

/* ROLES: a monster's shape at its Level, as multipliers on the regular (hit is points added, the rest x).
   DESIGNER, provisional. */
export const MONSTER_ROLES = Object.freeze({
  /* many and weak: the common majority (rats, whelps) */
  swarm: Object.freeze({ hp: 0.8, hit: -0.04, blow: 0.85, def: 0.5, xp: 1.0, gp: 1.0 }),
  regular: Object.freeze({ hp: 1.0, hit: 0, blow: 1.0, def: 1.0, xp: 1.0, gp: 1.0 }),
  /* fragile, quick to land: fliers, archers, deserters, casters */
  glass: Object.freeze({ hp: 0.75, hit: 0.05, blow: 1.1, def: 0.5, xp: 1.2, gp: 1.0 }),
  /* the tank: slow, thick, a softer blow */
  heavy: Object.freeze({ hp: 1.2, hit: -0.10, blow: 0.8, def: 3.0, xp: 1.1, gp: 1.0 }),
  /* the bruiser or the rare carrier: much more HP and defense, a full blow */
  elite: Object.freeze({ hp: 1.6, hit: 0, blow: 1.0, def: 4.0, xp: 1.15, gp: 1.0 }),
  /* a ground's boss: a long fight, and a blow held to `floorCap` of the FLOOR hero's base HP (designer 10-21: at most
     35%; Andy's Sewer death), whatever its own Level */
  boss: Object.freeze({ hp: 5, hit: 0, blow: 1.1, def: 4.0, xp: 1.2, gp: 1.0, floorCap: 0.33 }),
});
export const ROLE_IDS = Object.freeze(Object.keys(MONSTER_ROLES));

/* THE ROSTER: each monster's role on its ground (designer input; the reason is the row's own comment in
   monsters.js). Its Level, art tier and class are on the row; its ground gives the floor and the fit. A monster
   on two grounds keeps one role. tools/gen-ground-stats.mjs writes the numbers from these. */
export const GROUND_ROSTER = Object.freeze({
  mill_cellar: Object.freeze({
    rat: 'swarm',             // the tutorial's first kills
    slime: 'heavy',           // slow (2400), a blob
    hive_wasp: 'glass',       // a flier
  }),
  meadowbrook_thicket: Object.freeze({
    gray_whelp: 'swarm',      // the common majority
    gray_wolf: 'regular',
    briarcoat_wolf: 'heavy',  // slow (2800), the briar coat
    dire_gray: 'elite',       // the uncommon bruiser
    grayjaw: 'elite',         // the pack leader, the rare carrier
  }),
  wickstead: Object.freeze({
    granary_rat: 'swarm',     // "the swarm: fat on the farm's grain, many and quick"
    barn_wasp: 'glass',       // a flier: quick, fragile
    barn_spider: 'heavy',     // "the tank: slow and webbed in"
    orchard_boar: 'heavy',    // "the orchard's tank"
    turncoat: 'glass',        // "glass that hits hard"; the rare carrier
  }),
  millrace_sewer: Object.freeze({
    drain_rat: 'swarm',
    sump_slime: 'heavy',      // slow (2400)
    culvert_bat: 'glass',     // a flier (4400)
    kobold_tosher: 'regular',
    cistern_spider: 'elite',
    rat_king: 'boss',
  }),
  mosslight_glade: Object.freeze({
    carrion_crow: 'regular',  // the common majority
    glade_poacher: 'glass',   // "glass that hits like a cart"
    walking_vine: 'heavy',    // "the tank: slow and woody"
    goblin_sluicer: 'elite',  // the tier-3 body carrier
    brook_bear: 'elite',      // "the Meadowbrook's bruiser"
    rook_poacher: 'elite',    // "the poachers' chief", the rare carrier
  }),
  coppercap_warrens: Object.freeze({
    goblin_scavenger: 'regular', // the common majority
    goblin_skulker: 'glass',     // quick (4400)
    goblin_digger: 'heavy',      // slow (2600), dug in
    hobgoblin_foreman: 'elite',
    chief_coppercap: 'boss',
  }),
});
/* NAMED EXCEPTIONS: { monster: { field: 'the reason' } }, a field a row keeps by hand. Empty: none has earned one. */
export const FORMULA_EXCEPTIONS = Object.freeze({});

/* combat.js monsterDamageScaleByTier, restated: the formula divides the blow by it (a test pins the two equal). */
export const DAMAGE_SCALE_BY_TIER = Object.freeze({ 1: 5.4, 2: 5.4, 3: 4.0, 4: 4.0, 5: 3.0, 6: 2.2 });
/* combat.js COMBAT_BALANCE.monsterAccuracyPerPoint, restated (same test). */
export const ACC_PER_POINT = 0.02;

const clamp01 = (x) => Math.max(0, Math.min(1, x));
/** A ground's danger at its floor: 0 (gentle) to 1 (full). */
export const rampAt = (floor, F = STAT_FORMULA) => clamp01((floor - F.ramp.from) / (F.ramp.to - F.ramp.from));
/** A regular's blow share and to-hit on a ground of this floor, with `lift` of its way to full taken back (a tier's). */
export function dangerAt(floor, lift = 0, F = STAT_FORMULA) {
  const r = rampAt(floor, F), d = r + (1 - r) * clamp01(lift);
  return { ramp: r, hit: F.hit.lo + (F.hit.hi - F.hit.lo) * d, blow: F.blow.lo + (F.blow.hi - F.blow.lo) * d };
}

/**
 * A monster's stats from the formula. spec { level, role, tier, floor, fit } (floor: its ground's band floor;
 * fit: 'solo' | 'both' | 'party', default solo); opts { formula, roles } (the lab moves the dials). Answers
 * { hp, atk, baseAcc, def, xp, gp: [lo, hi], hitVsSameLevel, blowShare }: whole numbers where the row stores
 * them, baseAcc to two places.
 */
export function formulaStats(spec, opts = {}) {
  const F = opts.formula || STAT_FORMULA;
  const R = (opts.roles || MONSTER_ROLES)[spec.role];
  if (!R) throw new Error('balance-sheet: unknown role ' + spec.role);
  if (!Number.isFinite(Number(spec.floor))) throw new Error('balance-sheet: no ground floor for a ' + spec.role);
  const L = Math.max(1, Math.floor(Number(spec.level) || 1));
  const scale = DAMAGE_SCALE_BY_TIER[spec.tier] || DAMAGE_SCALE_BY_TIER[1];
  const fit = (F.fit && F.fit[spec.fit || 'solo']) || 1;
  const dz = dangerAt(Number(spec.floor), 0, F);
  const hit = dz.hit + R.hit;
  /* a boss's blow is held under its cap of the FLOOR hero, however deep it lives */
  const blowShare = R.floorCap ? Math.min(dz.blow * R.blow, (R.floorCap * F.refHp(Number(spec.floor))) / F.refHp(L)) : dz.blow * R.blow;
  const atk = Math.max(1, Math.round((blowShare * F.refHp(L)) / scale));
  /* to-hit at the same-Level hero = baseAcc + (atk - L) x 0.02, so: */
  const baseAcc = Math.round((hit - (atk - L) * ACC_PER_POINT) * 100) / 100;
  const hp = Math.max(1, Math.round(((F.hp.base || 0) + F.hp.perLevel * L) * R.hp * fit));
  const def = Math.max(0, Math.round(F.def.perLevel * L * R.def));
  const xp = Math.max(1, Math.round(Math.max(F.xp.min || 0, F.xp.a * L ** F.xp.b) * hp * R.xp));
  const mean = F.gp.perHp * (1 + (F.gp.danger || 0) * dz.ramp) * hp * R.gp;
  const gp = [Math.max(1, Math.round(mean * F.gp.lo)), Math.max(1, Math.round(mean * F.gp.hi))];
  return { hp, atk, baseAcc, def, xp, gp, hitVsSameLevel: Math.round(hit * 100) / 100, blowShare: Math.round(blowShare * 1000) / 1000 };
}

/* ── THE TIER TABLE ───────────────────────────────────────────────────────
   One rule for every ground (Tyler 2026-11-07: "a scaling % of exp and difficulty BUT NOT GOLD", "Dangerous and
   Deadly keep the bigger pulls"): a bigger pull, a % harder monster, a % more HP, a % more Level XP a kill; coin
   and drops never move (RULED). The pulls are RULED (11-05, 11-07); the permilles are DESIGNER, measured on the
   sample (board, "2026-11-07 One formula for every hunt").
     dmgPm  how much harder a monster is, permille, against a FULL ground's Normal (the engine scales its atk: its
            blow and its to-hit). A gentle ground's Normal is softer than full, and a tier means the same danger on
            every ground, so on a gentle ground the tier first takes back `lift` of that kindness, measured in what a
            swing is worth (to-hit x blow at a same-Level hero), then adds dmgPm: tierRowFor answers the engine's
            permille per ground (Wickstead 1840 and 2845; the Glade the table's own).
     hpPm   its HP, permille (Tyler: HP is part of a tier's difficulty): a pile that stays on you longer.
     xpPm   Level XP a kill, permille: above hpPm, so a tier pays more an hour for the risk.
   RE-ANCHORED on the formula's Normal: the Glade's 1400 and 1600 were measured (lane/b-tier-risk, Andy's live Deadly)
   on monsters a fifth softer than Tyler's x1.2 Normal, so a tier keeps its measured total over the old Normal:
   1400 / 1.2 = 1170, 1600 / 1.2 = 1330 (at 1600 on the formula's Normal a four at the Glade's floor died 31 times in
   16 hero-hours, plan formula). The HP dial (x1.1, x1.2, paid by x1.2 and x1.4 XP a kill) was played beside none
   (plan formulaH): a little more food and about the same XP an hour, so a tier costs what Tyler asked. */
export const TIER_DIALS = Object.freeze({
  normal: Object.freeze({ pull: Object.freeze([0, 0, 0, 0]), lift: 0, dmgPm: 1000, hpPm: 1000, xpPm: 1000 }),
  dangerous: Object.freeze({ pull: Object.freeze([3, 5, 5, 6]), lift: 0.8, dmgPm: 1170, hpPm: 1100, xpPm: 1200 }),
  deadly: Object.freeze({ pull: Object.freeze([8, 8, 8, 8]), lift: 1, dmgPm: 1330, hpPm: 1200, xpPm: 1400 }),
});
/* Per-ground pull rows, only where a ground's shape demands one, each with its reason: { tier: pull[4] }, or
   normalOnly. Grounds not listed take TIER_DIALS whole. */
export const TIER_PULL_OVERRIDES = Object.freeze({
  mill_cellar: Object.freeze({ normalOnly: true, why: 'the first ground: a choice adds nothing to the first minutes (Coordinator 2026-11-05)' }),
  /* THE LADDER RULE (tests/hunt-core/hunt-tiers.mjs: a ground's top tier never beats the next ground's Normal at the Level that fits it):
     Wickstead's monsters are soft in absolute terms, so a bigger LONE pull is free XP: on the formula's rows a lone hammer at 18 earned
     97k on Deadly's pull of 8 (+8.6k gold, no death) against the Glade's Normal at 16-18 (72-79k), and Dangerous's pull of 3 paid every way
     at the floor 1.3-1.6x with no death (plan formula). Alone it keeps the ground as it stands, as lane/b-tier-risk found; parties keep the table's. */
  wickstead: Object.freeze({ dangerous: Object.freeze([0, 5, 5, 6]), deadly: Object.freeze([0, 8, 8, 8]), why: 'the ladder rule: a lone extra pull on soft monsters is free XP past the Glade' }),
});

/* What one swing is worth at a same-Level hero: its to-hit times its blow share, a tier's atk scaling `k` applied the engine's way
   (atk x k: the blow x k, the to-hit up 2% a point of atk added). The reference monster is a regular at the floor, tier-1 damage scale. */
function swingWorth(floor, lift, k, F) {
  const d = dangerAt(floor, lift, F), atk = (d.blow * F.refHp(floor)) / DAMAGE_SCALE_BY_TIER[1];
  return (d.hit + atk * (k - 1) * ACC_PER_POINT) * d.blow * k;
}

/**
 * The engine's tier row on a ground of this floor and id ({ pull, dmgPm, hpPm, xpPm }, hunt-tiers.js's shape after
 * lane/b-tier-dials): dmgPm is the atk scaling that makes a swing on this ground worth what the tier's is on a full
 * ground lifted as written; the pull is the ground's override, else the table's. opts { formula, tiers, overrides, ground }.
 */
export function tierRowFor(floor, tierId, opts = {}) {
  const T = (opts.tiers || TIER_DIALS)[tierId];
  if (!T) throw new Error('balance-sheet: no tier ' + tierId);
  const F = opts.formula || STAT_FORMULA;
  const want = swingWorth(floor, T.lift, T.dmgPm / 1000, F);
  /* the scaling of this ground's Normal regular that reaches `want` (it only grows with k): bisection */
  let lo = 1, hi = 10;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (swingWorth(floor, 0, mid, F) < want) lo = mid; else hi = mid; }
  const o = opts.ground ? (opts.overrides || TIER_PULL_OVERRIDES)[opts.ground] : null;
  const pull = (o && o[tierId]) || T.pull;
  return { pull: pull.slice(), dmgPm: Math.round(hi * 1000), hpPm: T.hpPm, xpPm: T.xpPm };
}

