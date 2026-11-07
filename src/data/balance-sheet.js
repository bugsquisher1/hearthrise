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
    /* on Normal, 2-3 under: more Level XP a head than the floor hero (DESIGNER: the price is gold; 11-07 the
       board found Normal can't take gold off them without breaking the floor, so this is a report line) */
    normalUnder: Object.freeze({ xpVsFloorMin: 1.0 }),
    /* on Dangerous, 2-3 under: net gold a head below zero (they pay for it) */
    dangerousUnder: Object.freeze({ netMax: 0 }),
    /* on Deadly, 2-3 under, and on Dangerous or Deadly 5 under: they die (deaths > 0 in the sample) and lose gold */
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
   (the damage scale combat.js reads: 5.4 for tiers 1-2, 4.0 for 3-4), its class (weaknesses, unchanged).
   Everything below is DESIGNER, fitted on today's Glade at x1.2 (Tyler 2026-11-07, "make it 20% harder")
   and Wickstead, provisional until the sample's measurement.
   Each curve reads the monster's OWN Level, so a ground scaled up to a party's Level (a future paid
   option) is the same formula read at a higher Level: HP keeps its own curve, so a Level 60 can't
   one-shot a scaled Level 10 ground. */
export const STAT_FORMULA = Object.freeze({
  /* THE REFERENCE HERO a curve is anchored on: a hero of the monster's own Level, base HP 150 + 10 a Level
     (VITALS), Defense at its Level, no guard. */
  refHp: (L) => VITALS.hpBase + VITALS.hpPerLevel * L,
  /* DANGER RAMPS IN: the first-day grounds teach (fresh heroes in practice sets, first-week-bands), so a
     monster's to-hit and blow climb from Level `from` to full at Level `to`, then hold as a share of the
     same-Level hero. 0..1. */
  ramp: Object.freeze({ from: 8, to: 16 }),
  /* A REGULAR's to-hit at the same-Level hero with no guard: `lo` before the ramp, `hi` after it.
     The engine's to-hit is baseAcc + (atk - Defense - guard) x 0.02, clamped 5-85%; baseAcc is derived. */
  hit: Object.freeze({ lo: 0.40, hi: 0.70 }),
  /* A REGULAR's largest blow, a share of the same-Level hero's base HP; atk = blow / the tier's damage scale. */
  blow: Object.freeze({ lo: 0.10, hi: 0.20 }),
  /* A REGULAR's HP: perLevel x its Level (linear, so it grows by 1/L a Level: 10% at 10, 2% at 50, like a
     hero's damage). */
  hp: Object.freeze({ perLevel: 1.9 }),
  /* A REGULAR's defense: perLevel x its Level. */
  def: Object.freeze({ perLevel: 0.08 }),
  /* LEVEL XP a kill = a x L^b per HP point of the monster (fitted on today's Wickstead and Glade: both pay
     about 1.86 x L^0.4, which is how the pace contract's L^1.365 rises over a hero's roughly linear damage). */
  xp: Object.freeze({ a: 1.70, b: 0.4 }),
  /* COIN a kill: the mean gold per HP point, and the spread of [lo, hi] around it (today's grounds pay about
     0.30 g per HP at every Level). */
  gp: Object.freeze({ perHp: 0.30, lo: 0.5, hi: 1.5 }),
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
  elite: Object.freeze({ hp: 1.6, hit: 0, blow: 1.1, def: 4.0, xp: 1.15, gp: 1.0 }),
});
export const ROLE_IDS = Object.freeze(Object.keys(MONSTER_ROLES));

/* combat.js monsterDamageScaleByTier, restated: the formula divides the blow by it (a test pins the two equal). */
export const DAMAGE_SCALE_BY_TIER = Object.freeze({ 1: 5.4, 2: 5.4, 3: 4.0, 4: 4.0, 5: 3.0, 6: 2.2 });
/* combat.js COMBAT_BALANCE.monsterAccuracyPerPoint, restated (same test). */
export const ACC_PER_POINT = 0.02;

const clamp01 = (x) => Math.max(0, Math.min(1, x));
/** The danger ramp at Level L: 0 before STAT_FORMULA.ramp.from, 1 from .to. */
export const rampAt = (L) => clamp01((L - STAT_FORMULA.ramp.from) / (STAT_FORMULA.ramp.to - STAT_FORMULA.ramp.from));

/**
 * A monster's stats from the formula. spec { level, role, tier }; opts { formula, roles } (the lab moves the dials).
 * Answers { hp, atk, baseAcc, def, xp, gp: [lo, hi], hitVsSameLevel, blowShare } — whole numbers where the row
 * stores them, baseAcc to two places.
 */
export function formulaStats(spec, opts = {}) {
  const F = opts.formula || STAT_FORMULA;
  const R = (opts.roles || MONSTER_ROLES)[spec.role];
  if (!R) throw new Error('balance-sheet: unknown role ' + spec.role);
  const L = Math.max(1, Math.floor(Number(spec.level) || 1));
  const scale = DAMAGE_SCALE_BY_TIER[spec.tier] || DAMAGE_SCALE_BY_TIER[1];
  const r = clamp01((L - F.ramp.from) / (F.ramp.to - F.ramp.from));
  const hit = F.hit.lo + (F.hit.hi - F.hit.lo) * r + R.hit;
  const blowShare = (F.blow.lo + (F.blow.hi - F.blow.lo) * r) * R.blow;
  const atk = Math.max(1, Math.round((blowShare * F.refHp(L)) / scale));
  /* to-hit at the same-Level hero = baseAcc + (atk - L) x 0.02, so: */
  const baseAcc = Math.round((hit - (atk - L) * ACC_PER_POINT) * 100) / 100;
  const hp = Math.max(1, Math.round(F.hp.perLevel * L * R.hp));
  const def = Math.max(0, Math.round(F.def.perLevel * L * R.def));
  const xp = Math.max(1, Math.round(F.xp.a * L ** F.xp.b * hp * R.xp));
  const mean = F.gp.perHp * hp * R.gp;
  const gp = [Math.max(1, Math.round(mean * F.gp.lo)), Math.max(1, Math.round(mean * F.gp.hi))];
  return { hp, atk, baseAcc, def, xp, gp, hitVsSameLevel: Math.round(hit * 100) / 100, blowShare: Math.round(blowShare * 1000) / 1000 };
}

/* ── THE TIER TABLE ───────────────────────────────────────────────────────
   One row per tier for every ground (lane/b-tier-dials reads it into hunt-tiers.js's shape
   { pull[4], dmgPm, hpPm, xpPm }). pull: monsters a pull for 1..4 heroes, 0 = the ground as it stands.
   dmgPm: a monster's atk, permille (its accuracy and its blow, as powerPm today); hpPm: its HP;
   xpPm: Level XP a kill. Coin and drops never move (RULED 2026-11-07). The pulls are RULED (11-05,
   "Dangerous and Deadly keep the bigger pulls", 11-07); the permilles are DESIGNER, starting from the
   Glade's rows (lane/b-tier-risk, measured with Andy's live Deadly), provisional until the sample. */
export const TIER_DIALS = Object.freeze({
  normal: Object.freeze({ pull: Object.freeze([0, 0, 0, 0]), dmgPm: 1000, hpPm: 1000, xpPm: 1000 }),
  dangerous: Object.freeze({ pull: Object.freeze([3, 5, 5, 6]), dmgPm: 1400, hpPm: 1000, xpPm: 1100 }),
  deadly: Object.freeze({ pull: Object.freeze([8, 8, 8, 8]), dmgPm: 1600, hpPm: 1000, xpPm: 1200 }),
});
/* Per-ground pull rows, only where a ground's shape demands one, each with its reason. Grounds not listed
   take TIER_DIALS whole; the Mill Cellar offers Normal only (Coordinator 2026-11-05: a choice adds nothing
   to the first minutes). */
export const TIER_PULL_OVERRIDES = Object.freeze({
  mill_cellar: Object.freeze({ normalOnly: true, why: 'the first ground: a choice adds nothing to the first minutes' }),
});
