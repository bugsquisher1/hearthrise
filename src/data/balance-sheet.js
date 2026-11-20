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
// PURE ESM. Data and pure functions only: no DOM, no clock, no randomness. The engine reads only the tier rows (hunt-tiers.js builds GROUND_TIERS from tierRowFor, lane/b-tier-dials).
// ════════════════════════════════════════════════════════════════════════

import { LEVEL_PACE, VITALS } from './core-model.js?v=0.2.142';
import { GROUND_PACKS } from './grounds/index.js?v=0.2.142';
import { foldRows } from './grounds/shape.js?v=0.2.142';

/* ── THE TARGET SHEET ─────────────────────────────────────────────────────
   Judged per ground on the real engine, store supplies bought per use (the store bill is the whole
   supply cost), the reference bar, every combat skill at the hero's Level (tools/balance-sim cell.mjs).
   "Floor" = the ground's band floor (src/data/hunts.js), "middle" = the band's middle, rounded. */
export const BALANCE_SHEET = Object.freeze({
  /* NORMAL AT THE RIGHT LEVEL: a lone hero at the floor in that Level's gear (gear.mjs kitOf: the best
     piece its Level may wear and can get), each of the 8 ways to fight. RULED 10-25 §3 (Normal band:
     <= 1 death per 1,000 h, <= 1 dip under 25% per 12 h, a 12 h hunt almost always finishes). NO PROFIT MOLDS (Tyler 2026-11-13):
     no line on this sheet is a gold target. The +25% floor (10-18 / 10-20), the supplies share and "under the floor loses gold" are
     retired; a hunt's profit is whatever it is, printed per ground by the grader (GOLD BY GROUND), never graded. */
  normal: Object.freeze({
    deathsPer1000h: 1,
    closeCallPct: 25,
    /* pooled over the 8 ways (a sample's 4 h a way can't read one in 12 h: one dip reads 3) */
    closeCallsPer12h: 1,
    /* the median encounter's low point, every way (10-25: Normal 60-80%; over 80 reads Easy, allowed) */
    typicalMinHpPct: 60,
    /* XP: at the band's MIDDLE the median way's Level XP an hour within this share of the pace contract
       LEVEL_PACE.contract (a x L^b, the trend the Level curve is held to past the measured grounds; RULED
       10-25 §2 pace: L10 ~6 h, L25 ~36 h, L50 ~168 h at 12 h a day). The median LONE way on every ground, a party ground too:
       the contract is fitted on lone heroes, and a party's edge is its own line (party, below; Coordinator 2026-11-11). */
    xpVsContract: Object.freeze({ at: 'middle', min: 0.90, max: 1.10 }),
  }),
  /* THE FRESH HERO on a first-day ground (the grounds the Hunts window sends a LONE hero to at Levels 1-15):
     the style's practice set only (no armor), at the floor, every way. Mirrors tests/hunt-core/first-week-bands.mjs. */
  freshHero: Object.freeze({ upToLevel: 15, deaths: 0, closeCalls: 0, typicalMinHpPct: 60, xpVsPaceMin: 0.5 }),
  /* OUTSIDE YOUR WEIGHT CLASS (RULED 2026-11-06 20:20 UTC: "if you are fighting outside your weight class even
     in a party, you're gonna waste money but get more exp and possibly die a few times"; 11-04 the price is
     the monsters' own stats). A pair (tank + healer, hammer + bow) 2-3 Levels under the floor, and 5 under. */
  weightClass: Object.freeze({
    /* on Normal, 2-3 under: more Level XP a head than the pace of record at their OWN Level (what the ground that
       fits them pays; tools/balance-sim/level-pace.json). Their gold is not graded on Normal: Tyler 2026-11-07 took
       x1.2 knowing such a pair still nets about +2.6-3k an hour. */
    normalUnder: Object.freeze({ xpVsOwnPaceMin: 1.0 }),
    /* on Deadly, 2-3 under, and on Dangerous or Deadly 5 under: the median cell dies (a death in the sample). Its gold is printed,
       never graded: the "loses gold" lines on Dangerous and Deadly are retired (NO PROFIT MOLDS, Tyler 2026-11-13). */
    deadlyUnder: Object.freeze({ deathsMin: 1 }),
  }),
  /* THE HARDER TIERS AT THE RIGHT LEVEL (RULED 11-05 tier words: bigger pulls, harder hits, more XP a kill,
     same coin and drops, you can die). ONE DIFFICULTY FOR EVERY GROUP (RULED 2026-11-08: "a solo person gets a small exp
     boost BUT the difficulty should be unchanged. Either they are strong enough to do the harder content or they aren't";
     it SUPERSEDES 11-06's lone tuning): a tier is the same pull, the same blows and the same HP for one hero or four
     (TIER_DIALS; tests/hunt-core/hunt-tiers.mjs rows), so no line here asks a group size to fare a set way. Who holds a
     tier is power: the lines judge what it pays whoever holds it (no death in the sample, any group, at the floor), and
     the one ceiling, that a well-built four at the floor holds Deadly (Andy 11-06 "mostly balanced for 4-man squads"). */
  tiers: Object.freeze({
    /* held at the floor, any group: at least this much more Level XP an hour than the same way on Normal */
    dangerous: Object.freeze({ xpVsNormalMin: 1.10 }),
    /* held at the floor, any group: at least this much more; and a four at the floor dies no more than this in 16 hero-hours */
    deadly: Object.freeze({ xpVsNormalMin: 1.25, fourDeathsPer16hMax: 9 }),
  }),
  /* PARTIES (RULED 2026-11-16: "normal isn't meant for parties anyway"; replaces 10-25 §5's four at 1.15-1.25x solo on Normal,
     where a seat may now earn under solo). On Dangerous and Deadly a mix earns at least vsAloneMin of the same heroes alone a head
     (solo boost included); a mixed four on Deadly at most deadlyFourVsContractMax x the contract at its top Level, read from
     paceFromLevel (Tyler 2026-11-18). Same-class fours never out-earn solo (10-31). */
  party: Object.freeze({ vsAloneMin: 1.0, deadlyFourVsContractMax: 2.5, paceFromLevel: LEVEL_PACE.targets[0][0] }),
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
   floor + the shift: HP keeps its own curve, so a Level 60 can't one-shot a scaled Level 10 ground.
   MONSTERS A LITTLE HARDER (Tyler 2026-11-19: "I think we should raise HP and damage done by all monsters in the game slightly.
   Everything is a bit too easy it seems"; lane/d-harder-monsters): ONE STEP, x1.10 on the blow dials (lo, hi and the gentle cap)
   and on the HP line, read that way: every monster of every ground, the Burning Tower's floors and the Catacombs' rooms (they read
   this formula at Level F) and every boss (its blow is the regular's x its role) hits a tenth harder and has a tenth more HP.
   Its coin a kill follows its HP (per point, below), a tenth more; its Level XP a point is x0.96 (`xp`, below) so the pace of record
   holds, about 5% more a kill.
   The fitted values it steps from: blow 0.12 / 0.20, gentle cap 0.10, HP 4.5 + 1.6 a Level. Where a ruling holds a monster
   under the step, the row is a named exception (FORMULA_EXCEPTIONS, the Rat King), and where a spell would pass the 35% a floor
   hero may take (designer 2026-10-21), the spell's multiple holds it where it stood (the Ox Road's Hot Coal, the Catacombs' Bone
   Slide and Snuff the Candles). Measured on the real settle (the quick grade before and after, 719 cells each; the pace careers
   re-run): on Normal in range no lone hero or four dies on any open ground and a lone hero's low point (p10) falls 1-9 points; Level XP
   an hour moves -4% to +1% alone and -2% to +5% a four's head, coin -4% to +10%; the store bill rises (Normal alone +9% to +200%
   from small bills, a four on Deadly +29% to +59%); lone heroes on the harder tiers die 1.5-4x as often; the pace of record
   holds (Level 50 in 155.1 h, the median of eight careers; 155.4 before). The Cellar's XP fit moved with it (GROUND_XP_FIT). */
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
  /* gentleCap: on a gentle ground no blow passes this share of the FLOOR hero's HP (its deep monsters meet fresh heroes 8-10 Levels under them),
     climbing to no cap on a full ground. 0.10: the Thicket's fresh melee dipped under 25% 1-6 times in 4 h (1 at 0.10, 1-5 at 0.14;
     the sheet allows 0), lane/b-ground-formula-2. All three x1.10 since 2026-11-19 (MONSTERS A LITTLE HARDER, above). */
  blow: Object.freeze({ lo: 0.132, hi: 0.22, gentleCap: 0.11 }),
  /* A REGULAR's HP (the row's: a party of four's, the engine scales it 55-100% by party size): base + perLevel x
     its Level, a straight line like a hero's damage, so it grows by perLevel / HP a Level (13% at 5, 7% at 16, 3%
     at 50). Fitted on every open ground's rows (Cellar 9 at Level 2, Glade 30 at 16, Warrens 150 at 34 / 2.5) as 4.5 + 1.6 a Level;
     x1.10 since 2026-11-19 (MONSTERS A LITTLE HARDER, above). */
  hp: Object.freeze({ base: 4.95, perLevel: 1.76 }),
  /* A REGULAR's defense: perLevel x its Level (x the role), plus `past.perLevel` a Level past `past.from` for every role. A hero's
     to-hit is 0.55 + (skill + weapon accuracy - defense) x 0.01, held to 95%: at 0.08 a Level a Warrens goblin (def 2-17) left a
     Level 45 hero at the cap, so a better weapon's accuracy bought nothing (first-week-bands weapon-rungs: the hatchets' tier 3
     paid +1.9% over tier 2, the bar is +5%; with the term the Warrens read def 10-33, its hand rows' 10-28, and the rung passes). */
  def: Object.freeze({ perLevel: 0.08, past: Object.freeze({ from: 20, perLevel: 0.5 }) }),
  /* LEVEL XP a kill = a x L^b per HP point of the monster, never under `min` (today's grounds pay about
     1.8 x L^0.4 from the Thicket to the Warrens: the pace contract's L^1.365 rising over a hero's roughly linear
     damage; the Cellar's first kills pay about 3 a point, the floor).
     `floorFit` (Tyler 2026-11-08, "Same monsters, re-tune"; lane/b-one-difficulty): since a monster has its row's HP and pays its whole
     kill for any party size, a lone hero on the first grounds kills in a blow or two and walks between pulls, so the full kill paid
     1.37-1.53x the pace contract at the band middle (a lean grid, 8 ways, 1 seed x 2 h). A kill's XP is `lo` of the curve on a ground
     whose floor is `from` or under, rising straight to the whole curve at `to`: the Cellar, the Thicket, Wickstead and the Sewer 0.67,
     the Glade 0.78, the Warrens 1.
     THE PACE HOLDS THE 2026-11-19 STEP (MONSTERS A LITTLE HARDER, above): a and min are the fitted 1.70 and 3.0 x0.96. With the HP line
     x1.1 and XP a point as it was, a kill paid a tenth more but took less than a tenth longer (the walk and the rest between pulls don't
     grow), so the eight lone careers levelled 4-6% faster: Level 50 in 146.9 h on the curve (-12.5% of the 168 h, past LEVEL_PACE's 10%;
     the ladder 1-11% up, the Cellar most). x0.96 gives that back, so a kill pays about 5% more XP for its tenth more HP and the pace
     of record stands (tools/balance-sim/level-pace.json). Tyler's ask was harder monsters, not faster Levels.
     x0.88 MORE, 2026-11-19 (lane/d-142-rulings): Level 50 still read 146.5 h against Tyler's 168 (the bows' default Flame Volley). A cheaper
     kill holds the table without lowering a live Level, as a curve re-fit would. Were 1.632 and 2.88. */
  xp: Object.freeze({ a: 1.436, b: 0.4, min: 2.534, floorFit: Object.freeze({ from: 8, to: 32, lo: 0.67 }) }),
  /* COIN a kill: perHp gold per HP point times the ground's `line`, rolled lo..2 x mean - lo so the roll's mean IS the
     formula's (keepMean: a plain [0.5, 1.5] rounding paid a 3 g whelp 3.5). HARDER PAYS MORE ON ONE LINE (Tyler 11-03,
     11-04): coin per HP climbs straight with the ground's floor, x0.5 at the first ground to x1.4 from floor 16 (the Thicket x0.74,
     Wickstead and the Sewer x0.92). Why a line and not a flat rate (re-reasoned 2026-11-13 under NO PROFIT MOLDS): a kill of a
     harder monster is worth more of the hero's time, so its coin rises with where it lives, and from 16 on, where the monsters
     bite hard enough to cost real food (the Glade's x1.2 bite), a kill's coin stops climbing per HP and the rest of the climb is
     the monsters' own HP. The line starts at x0.5 since 2026-11-08 (was x0.75): a lone hero now takes the whole kill, and the first
     grounds' gold an hour read +39-54% over their pinned values (tests/hunt-core/drop-tables.mjs total-value, the faucet ceiling).
     What a hunt nets is printed per ground (tools/balance-sim/grade.mjs GOLD BY GROUND), never a target. */
  gp: Object.freeze({ perHp: 0.30, lo: 0.5, keepMean: true, line: Object.freeze({ from: 1, to: 16, lo: 0.5, hi: 1.4 }) }),
  /* WHO A GROUND IS BUILT FOR. A PARTY GROUND (hunt-grounds.js groupFit 'party', or a pocket that needs a party) is built
     for four heroes' damage on one tank: its rows carry `hp` times the HP (today's Sewer and Warrens stand 2.2-3x the solo
     grounds' at their Levels), each blow `blow` of a solo ground's (the tank takes every monster of the pull at once: on
     the solo blow a four at the Warrens' floor sat at a 69% typical low, today 85%), `xp` of the XP a point (the four
     earned 21-25% over today's pace at the Sewer and the Warrens), and its harder tiers lift nothing (`tierLift` false:
     a gentle party ground's Deadly lifted to full killed its four at the floor 195 times in 16 hero-hours). Plan formula.
     Its boss's blow takes `blow` too (`bossBlow`). Two dials run on the danger ramp, gentle to full (lane/b-ground-formula-2):
       to-hit  `hit` points on a gentle party ground, `hitFull` on a full one. -0.3 there (re-reasoned 2026-11-13, NO PROFIT
               MOLDS): the Warrens' heavy crowd lands every blow on one hero, so at the formula's to-hit a lone hero at its
               soloFrom (45) lived on its potions (3.9k g an hour of food) and the card's "alone from 45" read as a dare. At -0.3
               it holds the room on its armor, as the card says; a four at the floor still reads the Warrens' danger.
       coin    `gp` on a gentle party ground (1.17 since 2026-11-08, when the line's start fell to x0.5: the Sewer keeps its coin a kill,
               so a Sewer kill pays what it paid before the line moved), `gpFull` on a full one, on top of the line. Full 0.53
               (re-reasoned 2026-11-13, NO PROFIT MOLDS): the faucet. At x1 the Warrens paid 2.4x its 10-23 value a kill (a four at
               32 netted 8,759 g an hour, the Glade's floor 1,977), more gold into the world than the loot model was built for; 0.53
               is the least that still pays a kill there more than the Glade's (harder pays more, Tyler 11-03, a per-kill rule). */
  fit: Object.freeze({
    both: Object.freeze({ hp: 1, blow: 1, xp: 1, tierLift: true }),
    party: Object.freeze({ hp: 2.5, blow: 0.75, xp: 0.8, tierLift: false, bossBlow: true, hit: 0, hitFull: -0.3, gp: 1.17, gpFull: 0.53, blowShape: 1.6 }),
  }),
});

/* ROLES: a monster's shape at its Level, as multipliers on the regular (hit is points added, the rest x).
   DESIGNER, provisional. `gentleHp`: the role's HP on a gentle ground (ramp 0), climbing to `hp` on a full one. Fresh heroes
   kill a gentle ground's monsters in one or two blows, so extra HP there only inflated the kill's XP and coin (the Thicket's
   middle paid 1.20x the pace contract at heavy 1.2 / elite 1.6, 1.05x at 1.0 / 1.2; lane/b-ground-formula-2). */
export const MONSTER_ROLES = Object.freeze({
  /* many and weak: the common majority (rats, whelps) */
  swarm: Object.freeze({ hp: 0.8, hit: -0.04, blow: 0.85, def: 0.5, xp: 1.0, gp: 1.0 }),
  regular: Object.freeze({ hp: 1.0, hit: 0, blow: 1.0, def: 1.0, xp: 1.0, gp: 1.0 }),
  /* fragile, quick to land: fliers, archers, deserters, casters */
  glass: Object.freeze({ hp: 0.75, hit: 0.05, blow: 1.1, def: 0.5, xp: 1.2, gp: 1.0 }),
  /* the tank: slow, thick, a softer blow */
  heavy: Object.freeze({ hp: 1.2, gentleHp: 1.0, hit: -0.10, blow: 0.8, def: 3.0, xp: 1.1, gp: 1.0 }),
  /* the bruiser or the rare carrier: much more HP and defense, a full blow */
  elite: Object.freeze({ hp: 1.6, gentleHp: 1.2, hit: 0, blow: 1.0, def: 4.0, xp: 1.15, gp: 1.0 }),
  /* a ground's boss: a long fight, and a blow held to `floorCap` of the FLOOR hero's base HP (designer 10-21: at most
     35%; Andy's Sewer death), whatever its own Level */
  boss: Object.freeze({ hp: 5, hit: 0, blow: 1.1, def: 4.0, xp: 1.2, gp: 1.0, floorCap: 0.33 }),
});
export const ROLE_IDS = Object.freeze(Object.keys(MONSTER_ROLES));

/* THE ROSTER: each monster's role on its ground (designer input; the reason is the row's own comment in
   monsters.js). Its Level, art tier and class are on the row; its ground gives the floor and the fit. A monster
   on two grounds keeps one role. tools/gen-ground-stats.mjs writes the numbers from these. */
const BASE_ROSTER = Object.freeze({
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
    brook_bear: 'heavy',      // "the Meadowbrook's bruiser": a slow, thick-hided brawler that wades in and leans on you, not a quick elite (designer 2026-11-12,
                              // re-reasoned 2026-11-13 under NO PROFIT MOLDS): as an elite in Vine Hollow it out-hit the Glade's own elite for a plate hero at the floor; a
                              // heavy hits softer and lasts (hp 1.2 and blow 0.8 of a regular, def 3.0), the bruiser it reads as. One role word, the formula does the rest.
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
/* A ground pack's roster is its own (src/data/grounds/<id>/pack.js `roster`). */
export const GROUND_ROSTER = Object.freeze(foldRows('roster', BASE_ROSTER, GROUND_PACKS, (p) => ({ [p.id]: Object.freeze({ ...p.roster }) })));
/* A GROUND'S XP FIT: Level XP a kill on one ground, x this, where its layout (pockets, walks) kills faster than its Levels
   pay for. Measured, each with its reason (lane/b-ground-formula-2): the Meadowbrook Thicket x0.9: at Wickstead's floor (8) its
   Normal paid within 0-12% of Wickstead's for every way to fight (a four 33.3k against 33.6k), so no harder tier fitted under
   the next ground (hunt-tiers ladder), and its middle (10) paid 1.05x the pace contract on three ways (1.27x on the sheet's eight
   before the gentle roles). The Mill Cellar x1.25 and Wickstead x1.1: the pace re-measure's ladder read them at 0.75x and 0.89x the
   contract in band (the Cellar 5,960 at 4.5, Wickstead 30,088 at 13), so the ladder's fit ran steeper than the contract (718 x L^1.472:
   level-curve C5 -13% at 100) and the careers reached Level 10 in 6.7 h (C3, +12%); the Cellar is the tutorial, paced to Level 5 in
   LEVEL_PACE.early (0.32 h against its 0.25 aim). */
/* The Sewer x0.9 (lane/b-one-difficulty, 2026-11-08): its party-built monsters die to area blows in packs, so with one pack for every
   group a lone hammer at the Glade's floor earned 131k on its Deadly against the Glade's Normal 108k (the ladder rule); the floor fit alone
   leaves it about 4% over. */
/* THE CELLAR x1.28 (was 1.25; lane/d-solo-fifteen, 2026-11-11): the contract re-pinned to the flatter measured ladder (core-model.js LEVEL_PACE.contract 1378 x L^1.298)
   reads the Cellar's lone median 0.895x at its middle (5), half a point under the band; x1.28 lands it about 0.92x. Level 5 still inside LEVEL_PACE.early.
   KEPT at x1.28 (designer 2026-11-13, lane/d-no-profit-molds): the FULL grade (8 ways, 6 seeds) reads it 0.888x, and the next step a row can take
   (x1.32, the Giant Rat 15 -> 16 XP) made Level 4 -> 5 so quick that Level 5 -> 6 read 2.04x it, a wall (level-curve C6, at most 2x). The Cellar's
   middle is Level 5, LEVEL_PACE.early's Level, where the tutorial's promise rules (Level 5 in 0.15-0.35 h, measured 0.24 h: level-curve C3), so the
   grader reads the contract there as a report line, not a bar (tools/balance-sim/grade-sheet.mjs). A felt wall loses to an unfelt 1%.
   x1.22 SINCE THE 2026-11-19 STEP (MONSTERS A LITTLE HARDER, STAT_FORMULA): a Cellar monster dies in a blow or two, so its tenth more HP cost a
   fresh hero no extra swing while its XP rose with it (the Rat 15 -> 17 XP at x1.28): the Cellar paid 6% more an hour (the ladder 10,528-10,608
   against 9,913-9,992) and Level 5 -> 6 read 2.04x Level 4 -> 5 again, the same wall. x1.22 puts the Cellar back where it was (9,876-9,951, the Rat
   16 XP on 7 HP), the wall gone. */
/* THE GLADE x0.90 UNDER SOLO +15% (lane/d-solo-fifteen, 2026-11-11). The +15% put the Glade's lone median at 1.12x the pace contract at its middle (24),
   1.07x at +5% (grade quick, Normal; the band is 0.90-1.10), and the Glade is a solo ground, so its lone median is the way the contract reads: x0.90
   lands it at 1.01x. Ratios between heroes on one ground never move (a fit scales alone and party alike).
   THE PARTY GROUNDS ARE NOT RE-DIALED, on purpose. The grader reads a party ground's pace on the four a head (the Sewer 1.19x, the Warrens 1.52x
   at their middles under +15%), while the contract itself is fitted on LONE heroes (tools/balance-sim/pace.mjs, the ladder plan; the Sewer's lone
   median reads 1.04x, the Warrens' 1.27x) and a four was then ruled 1.15-1.25x a lone hero (10-25, retired 11-16). The two readings differ by the
   party bonus, so both can't sit in 0.90-1.10 of one contract. Measured on the real settle: the Sewer x0.81 and the Warrens x0.70 held the grader's
   line (1.07x, 1.06x) and broke three others, the ladder (hunt-tiers: the Glade's Deadly out-paid the Warrens' Normal, nobody moves on), the
   contract's fit (level-curve C5: +21% against the measured ladder) and the scaled hunts (tests/scaled-hunts fee-guard: a scaled Thicket or Glade four at
   41-50 out-earned the Warrens' four 1.19-1.41x). RULED (Coordinator 2026-11-11): the pace is the LONE hero's on every ground; the grader now reads the lone
   median there (the Sewer 1.04x, in band). THE WARRENS' LONE 1.27x STAYS, a bind: a scaled Thicket four at Level 50 already reads 0.99x the Warrens' four
   (tests/scaled-hunts fee-guard, the best grind must stay the real ground), so the Warrens' XP can come down about 1% at most; a cut that lands its lone hero in
   band (x0.87 or less) broke that guard. THE LEVER, built (scaled-hunts.js partyPm 720: a party on a scaled hunt keeps 72% of its ground's party cell), put a
   scaled four at 0.54-0.71x the Warrens' four, so THE WARRENS x0.76: the Warrens is the ladder's last rung, so a cut there flattens the measured ladder and the contract follows it (level-curve C5):
   x0.84 left its lone median 1.12x the re-measured contract, x0.76 lands it in band. Measured below (the grade) and in level-curve (C5). */
export const GROUND_XP_FIT = Object.freeze(foldRows('xp fit', { mill_cellar: 1.22, meadowbrook_thicket: 0.9, wickstead: 1.1, mosslight_glade: 0.90, millrace_sewer: 0.9, coppercap_warrens: 0.76 }, GROUND_PACKS, (p) => (p.xpFit ? { [p.id]: p.xpFit.k } : {})));

/* A GROUND'S INCOME DIAL (designer 2026-11-16, lane/d-supply-prices; Tyler 2026-11-16 chose "cut income instead" over dearer supplies): one
   number a ground, x the coin each of its kills pays (the formula's mean below) and x what the loot it drops sells for (loot-sale.js, the
   shop's bid, which the Weighhouse floors on). A ground with no row is x1. Why income and not supplies: a hero on Normal in its range buys
   almost nothing (the career tank 0 g an hour from 30 to 39 and 60 to 69), so only what a kill pays reaches the hero the audit found
   banking 1.57M by Level 50 (F12). Why per ground: the gold piles up from the Glade on, and a new hero under Level 16 isn't gold-rich.
   The Glade carries one too, though its band starts at 16, because a lone hero hunts it to Level 44 (recommendedHunt: the Warrens is a
   party ground) and earns 80% of its first 1.57M there. A pack carries its own (`gpFit`). Measured on the real settle, the board's
   "2026-11-16 Income dial". */
export const GROUND_GP_FIT = Object.freeze(foldRows('gp fit', { mosslight_glade: 0.7, coppercap_warrens: 0.7 }, GROUND_PACKS, (p) => (p.gpFit ? { [p.id]: p.gpFit.k } : {})));

/* NAMED EXCEPTIONS: { monster: { field: 'the reason' } }, a field a row keeps by hand. Empty: none has earned one. */
export const FORMULA_EXCEPTIONS = Object.freeze({
  /* (the Brook Bear's [13, 40] purse, kept by hand to clear the Glade's +10% floor, went back to the formula's [11, 32] when that floor was
     retired: NO PROFIT MOLDS, Tyler 2026-11-13) */
  /* KRELL'S LOOKOUT, A DANGER EXCEPTION (lane/b-barrow-packs 2026-11-13, after NO PROFIT MOLDS): on the glass role's 0.22 blow a lone hero at the
     Hold's floor on Normal read 2.81 close calls in 12 h on the full grade (the sheet allows 1). While engine piece 2 is unbuilt he swings in melee,
     and he is the floor's top damage. His blow is the Farmhands' 0.17 (designer Q3 measured close calls 3.2 to 0.63); his to-hit stays the role's 0.75.
     Since 2026-11-19 (MONSTERS A LITTLE HARDER) the Farmhands' blow is 0.187, so his is too: the rule (the Farmhands' blow) is kept and takes the step. */
  /* THE RAT KING, A DANGER EXCEPTION (lane/d-party-pace; Tyler 2026-11-18 "Yes, open at 5"): his Tail Lash lands twice his blow, and with the Sewer's floor at 5
     the formula's attack 7 lands it for 74, 39% of the floor hero's 190 HP, over the 35% a boss may take of the floor hero (tests/hunt-core/hunt-data.mjs
     blow-share; Andy died to 108). Attack 6 lands 64 (34%); his to-hit at a same-Level hero is the formula's, restated for the lower blow.
     So he is the one monster the 2026-11-19 step (MONSTERS A LITTLE HARDER) can't reach with damage: the formula's attack is 8 since then (Tail Lash 86,
     45%), and the 35% boss rule holds him at 6. His HP takes the step. */
  rat_king: Object.freeze({ atk: "his Tail Lash, twice his blow, held at 35% of the floor hero's HP since the Sewer opens at 5: 64 of 190 at attack 6, where the formula's 8 lands 86",
    baseAcc: "the formula's to-hit at a same-Level hero, restated for the lower blow: 0.76 + 1 x 0.02" }),
  hasks_lookout: Object.freeze({ atk: "a blow of the Farmhands' share of a same-Level hero (0.187 since the 11-19 step, was 0.17), not the glass role's, so a lone hero at the floor on Normal is safe (close calls, not gold)",
    baseAcc: "the glass role's 0.75 to-hit at a same-Level hero, restated for his blow: 0.75 + (88 - 88) x 0.02" }),
});

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
 * fit: 'both' | 'party', default both); opts { formula, roles } (the lab moves the dials). Answers
 * { hp, atk, baseAcc, def, xp, gp: [lo, hi], hitVsSameLevel, blowShare }: whole numbers where the row stores
 * them, baseAcc to two places.
 * @param {any} spec
 * @param {{ formula?: any, roles?: any, groundXp?: any, groundGp?: any }} [opts]
 */
export function formulaStats(spec, opts = {}) {
  const F = opts.formula || STAT_FORMULA;
  const R = (opts.roles || MONSTER_ROLES)[spec.role];
  if (!R) throw new Error('balance-sheet: unknown role ' + spec.role);
  if (!Number.isFinite(Number(spec.floor))) throw new Error('balance-sheet: no ground floor for a ' + spec.role);
  const L = Math.max(1, Math.floor(Number(spec.level) || 1));
  const scale = DAMAGE_SCALE_BY_TIER[spec.tier] || DAMAGE_SCALE_BY_TIER[1];
  const fit = (F.fit && F.fit[spec.fit || 'both']) || { hp: 1, blow: 1, xp: 1 };
  const dz = dangerAt(Number(spec.floor), 0, F);
  const h0 = fit.hit || 0, fitHit = fit.hitFull === undefined ? h0 : h0 + (fit.hitFull - h0) * dz.ramp;
  const shape0 = R.floorCap ? 1 : 1 + ((fit.blowShape || 1) - 1) * (1 - dz.ramp);
  const hit = (dz.hit + R.hit + fitHit) / shape0;
  /* a boss's blow is held under its cap of the FLOOR hero, however deep it lives */
  const gentleCap = F.blow.gentleCap ? F.blow.gentleCap + (1 - F.blow.gentleCap) * dz.ramp : Infinity;
  const blowShare = R.floorCap ? Math.min(dz.blow * R.blow * (fit.bossBlow ? fit.blow : 1), (R.floorCap * F.refHp(Number(spec.floor))) / F.refHp(L))
    : Math.min(dz.blow * R.blow * fit.blow, (gentleCap * F.refHp(Number(spec.floor))) / F.refHp(L));
  /* THE BLOW'S SHAPE on a gentle party ground (fit.blowShape, 1 on a full one): the same swing worth as fewer, bigger blows, so a blow clears the
     ward of cheap armor and an armor rung is felt (temper-play armor-below-the-next-set). The engine swings every 2 s (Tyler 10-15), so the
     to-hit falls as the blow grows. */
  const shape = R.floorCap ? 1 : 1 + ((fit.blowShape || 1) - 1) * (1 - dz.ramp);
  const atk = Math.max(1, Math.round((blowShare * shape * F.refHp(L)) / scale));
  /* to-hit at the same-Level hero = baseAcc + (atk - L) x 0.02, so: */
  const baseAcc = Math.round((hit - (atk - L) * ACC_PER_POINT) * 100) / 100;
  const rHp = R.gentleHp === undefined ? R.hp : R.gentleHp + (R.hp - R.gentleHp) * dz.ramp;
  const hp = Math.max(1, Math.round(((F.hp.base || 0) + F.hp.perLevel * L) * rHp * fit.hp));
  const def = Math.max(0, Math.round(F.def.perLevel * L * R.def + (F.def.past ? F.def.past.perLevel * Math.max(0, L - F.def.past.from) : 0)));
  const gx = (opts.groundXp || GROUND_XP_FIT)[spec.ground] || 1;
  const ff = F.xp.floorFit, xFloor = ff ? ff.lo + (1 - ff.lo) * clamp01((Number(spec.floor) - ff.from) / (ff.to - ff.from)) : 1;
  const xp = Math.max(1, Math.round(Math.max(F.xp.min || 0, F.xp.a * L ** F.xp.b) * hp * R.xp * fit.xp * gx * xFloor));
  const g0 = fit.gp === undefined ? 1 : fit.gp, fitGp = fit.gpFull === undefined ? g0 : g0 + (fit.gpFull - g0) * dz.ramp;
  const line = F.gp.line ? F.gp.line.lo + (F.gp.line.hi - F.gp.line.lo) * clamp01((Number(spec.floor) - F.gp.line.from) / (F.gp.line.to - F.gp.line.from)) : 1 + (F.gp.danger || 0) * dz.ramp;
  const gk = (opts.groundGp || GROUND_GP_FIT)[spec.ground] || 1;
  const mean = F.gp.perHp * line * hp * R.gp * fitGp * gk;
  const lo = Math.max(1, Math.round(mean * F.gp.lo));
  const gp = F.gp.keepMean ? [lo, Math.max(lo, Math.round(2 * mean - lo))] : [lo, Math.max(1, Math.round(mean * F.gp.hi))];
  return { hp, atk, baseAcc, def, xp, gp, hitVsSameLevel: Math.round(hit * 100) / 100, blowShare: Math.round(blowShare * 1000) / 1000 };
}

/* ── THE TIER TABLE ───────────────────────────────────────────────────────
   One rule for every ground (Tyler 2026-11-07: "a scaling % of exp and difficulty BUT NOT GOLD", "Dangerous and
   Deadly keep the bigger pulls"): a bigger pull, a % harder monster, a % more HP, a % more Level XP a kill; coin
   and drops never move (RULED). The pulls are RULED (11-05, 11-07); the permilles are DESIGNER, measured on the
   sample (board, "2026-11-07 One formula for every hunt").
   ONE DIFFICULTY FOR EVERY GROUP (Tyler 2026-11-08: "a solo person gets a small exp boost BUT the difficulty should be
   unchanged"): a tier's pull is ONE number, the monsters a pull for one hero or four, and its damage and HP are the
   same for every group. The engine's row still carries one entry per party size (the server's catalogue reads it by
   size), every entry this number. 0 = no more monsters than Normal brings that group. Dangerous 5 (before 11-08 a lone
   hero 3, a pair or three 5, a four 6): halfway from Normal's built packs (2-3) to Deadly's full box, never under a party's
   Normal pull on a ground that takes it (the Glade's 4), and the Glade's Bear Claw stays a 10-20 h rare for a lone hero
   (tests/hunt-core/drop-tables.mjs big-pull: the bear is 1 of the pull, so at 5 a lone tank at 16 met 32 an hour, a Claw
   every 17.2 h, at 6 27 and 20.4 h). Deadly 8: the full box, as before.
   THE BIGGER PULLS START AT THE GLADE (TIER_PULL_FROM_FLOOR): on a ground whose floor is under 16 (the Thicket, Wickstead,
   the Sewer) the harder tiers bring no more monsters, for anyone; the monsters only hit harder and pay more. Those grounds
   sit close under the next one, so with one pull for everyone a lone area hero out-earned the next ground's Normal at the
   Level it opens (the ladder rule, tests/hunt-core/hunt-tiers.mjs; real settle, 2 seeds x 1 h, lane/b-one-difficulty):
     the Thicket at 8 against Wickstead's Normal 34.9k (hammer) / 34.5k (wand): pull 6 44.9k / 45.5k, pull 8 52.0k / 52.0k
     Wickstead at 16 against the Glade's Normal 78.6k / 85.3k: pull 6 79.8k / 79.2k, pull 8 98.1k / 93.9k
     the Sewer at 16 against the Glade's Normal 78.6k (hammer): pull 8 112.9k
   and the XP dial can't take it back: Wickstead's Deadly would need about x1.00 a kill (no more than Normal) to bring the
   hammer under the Glade, and a harder tier pays more a kill (Tyler 11-05). The Glade's 8 holds against the Warrens' Normal
   at 32 for every way (hammer 183.8k against 199.0k, wand 185.7k against 221.8k, a four 169.5k against 211.2k). */
export const TIER_PULL_FROM_FLOOR = 16;
/* A TIER'S DIALS:
     dmgPm  how much harder a monster is, permille, against a FULL ground's Normal (the engine scales its atk: its
            blow and its to-hit). A gentle ground's Normal is softer than full, and a tier means the same danger on
            every ground, so on a gentle ground the tier first takes back `lift` of that kindness, measured in what a
            swing is worth (to-hit x blow at a same-Level hero), then adds dmgPm: tierRowFor answers the engine's
            permille per ground (Wickstead 1840 and 2845; the Glade the table's own).
     hpPm   its HP, permille (Tyler: HP is part of a tier's difficulty): a pile that stays on you longer.
     xpPm   Level XP a kill, permille: above hpPm, so a tier pays more an hour for the risk. AT MOST 1250 (Tyler 11-05:
            tiers "pay slightly more Level XP"; tests/hunt-core/hunt-tiers.mjs rows): Deadly's 1400 came down to 1250 and
            its HP to 1100 with it, so a Deadly HP point still pays more than a Dangerous one (1.14 against 1.09).
   RE-ANCHORED on the formula's Normal: the Glade's 1400 and 1600 were measured (lane/b-tier-risk, Andy's live Deadly)
   on monsters a fifth softer than Tyler's x1.2 Normal, so a tier keeps its measured total over the old Normal:
   1400 / 1.2 = 1170, 1600 / 1.2 = 1330 (at 1600 on the formula's Normal a four at the Glade's floor died 31 times in
   16 hero-hours, plan formula). The HP dial (then x1.1, x1.2, paid by x1.2 and x1.4 XP a kill) was played beside none
   (plan formulaH): a little more food and about the same XP an hour, so a tier costs what Tyler asked. */
export const TIER_DIALS = Object.freeze({
  normal: Object.freeze({ pull: 0, lift: 0, dmgPm: 1000, hpPm: 1000, xpPm: 1000 }),
  /* Dangerous brings Deadly's 8 (was 5; lane/d-flat-party-xp, 2026-11-16, with ONE party table for every ground): on 5 a four read 0.91-0.95 of
     its heroes alone on the Glade and Hask's Ford, on 7 0.93-0.94, on 8 1.04-1.06 (party-tier-xp), where Tyler 2026-11-16 asks every Dangerous party to
     stand at or over them. A bigger pull is where a party's hands count; the two harder tiers now differ by their blows, their HP and their pay, as the
     Muster's always did. */
  dangerous: Object.freeze({ pull: 8, lift: 0.8, dmgPm: 1170, hpPm: 1100, xpPm: 1100 }),
  /* Deadly's HP 1300 (was 1100; lane/d-flat-party-xp, 2026-11-16, with ONE party table for every ground, Tyler's "just balance the hunting grounds
     xp vs having a unique formula everywhere"): on the full box a mixed four at a ground's floor kills far faster than its heroes alone, and on
     1100 Andy's four (axe, bow, wand, a Healer 5 under) read 2.40-2.61x the pace contract on the Glade and Hask's Ford where a four on Dangerous
     needs the same table to stand over its heroes alone. 1300 (a pile that stays on you longer: more food, more risk) took the Glade's floor
     four to 2.20x and Hask's to 2.19x at the same table (party-tier-xp, 2 seeds x 0.5 h). A Deadly kill still pays the most XP; an HP point
     of it pays a little less than Dangerous's (0.96 against 1.09): the tier's price is the longer fight. */
  deadly: Object.freeze({ pull: 8, lift: 1, dmgPm: 1330, hpPm: 1150, xpPm: 1250 }),
});
/** The party sizes a tier row answers for (the server's catalogue reads its pull by size, 1..4). */
export const TIER_SIZES = 4;
/* A GROUND'S OWN TIER RULE, only where its place in the world demands one, each with a reason a player could read in the wiki:
   normalOnly, a tier's own pull ({ tier: ONE number for every group }), or its own XP, HP and damage dials ({ dials: { tier: { hpPm, xpPm, dmgPm } } }).
   No ground carries a pull of its own since 2026-11-08 (TIER_PULL_FROM_FLOOR says it for all); grounds not listed take TIER_DIALS whole. */
const BASE_TIER_OVERRIDES = Object.freeze({
  /* The Glade's Dangerous brings 6, two under the table's 8 (lane/d-flat-party-xp, 2026-11-16): on 8 a lone tank at the floor never met the Brook Bear in
     a played hour and on 7 the Keep's five pelts took 2.7 h (tests/hunt-core/drop-tables.mjs big-pull, bar 2 h).
     On 6 the pelts take 1.63 h and a four at the floor stands at 1.04 of its heroes alone (party-tier-xp; 1.01 at the middle). */
  /* THE GLADE'S HARDER TIERS CARRY MORE HP: Dangerous 1400, Deadly 1450 (the table's 1100 and 1150; lane/d-flat-party-xp, 2026-11-17). Its Dangerous brings 6
     and its Deadly the full box, so a four with Turning Cut on the box read 2.82x the pace contract at the floor (party-tier-xp, 2 seeds x 0.5 h), past
     Tyler's ~2.5x, and on 1350 a lone hammer at the Warrens' floor (32) out-levelled the Warrens' Normal (209,368 against 202,863, hunt-tiers ladder). Both
     tiers move together: a hero alone is slowed by HP about as much on each, so Deadly still pays it more an hour than Dangerous. */
  mosslight_glade: Object.freeze({ dangerous: 6, dials: Object.freeze({ dangerous: Object.freeze({ hpPm: 1400 }), deadly: Object.freeze({ hpPm: 1450 }) }),
    why: 'Dangerous brings 6 here, two under Deadly: on a bigger pull a hero alone at the floor reaches the Brook Bear too seldom. Monsters on both harder tiers have more health here than elsewhere. Groups of four were killing them too fast for the XP they give' }),
  /* The Warrens' harder tiers carry Dangerous 1150 and Deadly 1250 (lane/d-flat-party-xp, 2026-11-17): Andy's four read 2.52x the contract on Deadly at the floor. */
  coppercap_warrens: Object.freeze({ dials: Object.freeze({ dangerous: Object.freeze({ hpPm: 1150 }), deadly: Object.freeze({ hpPm: 1250 }) }),
    why: 'Monsters on both harder tiers have more health here than elsewhere. Groups of four were killing them too fast for the XP they give' }),
  mill_cellar: Object.freeze({ normalOnly: true, why: 'the first ground: a choice adds nothing to the first minutes (Coordinator 2026-11-05)' }),
  /* The Thicket sits just under Wickstead: its Normal at Wickstead's floor (8) pays 6-12% under Wickstead's, so the table's x1.2 and x1.25 a kill on its
     harder tiers beat Wickstead's Normal for every way to fight (tests/hunt-core/hunt-tiers.mjs ladder; lane/b-ground-formula-2: a lone tank 25.8k against
     24.3k, a four 38.1k against 33.6k). Its tiers pay +5% and +8% a kill on no extra HP, as live. */
  meadowbrook_thicket: Object.freeze({
    dials: Object.freeze({ dangerous: Object.freeze({ hpPm: 1000, xpPm: 1050 }), deadly: Object.freeze({ hpPm: 1000, xpPm: 1080 }) }),
    why: 'the Thicket sits just under Wickstead. At the table\'s +20% and +25% a kill its harder tiers out-earned Wickstead, so they pay +5% and +8%' }),
  /* The Sewer's Deadly pays x1.22 Level XP, not the table's x1.25: since the gentle party blow shape (STAT_FORMULA.fit.party.blowShape) a lone hammer on
     it at the Glade's floor (16) read 78,980 XP an hour against the Glade's Normal 78,779 (tests/hunt-core/hunt-tiers.mjs ladder, v0.2.106 run
     42394831391). Still above its Dangerous (now x1.1), so Deadly stays the better paid.
     ITS HARDER TIERS CARRY 1150 AND 1250 HP (the table's 1100 and 1150; lane/d-flat-party-xp, 2026-11-17): on the table's 1150 the same lone hammer read
     91,101 on Deadly against the Glade's Normal 87,181 (the ladder); moving both tiers keeps Deadly ahead of Dangerous for a hero alone. */
  millrace_sewer: Object.freeze({ dials: Object.freeze({ dangerous: Object.freeze({ hpPm: 1150 }), deadly: Object.freeze({ hpPm: 1250, xpPm: 1220 }) }),
    why: 'at +25% a kill the Sewer\'s Deadly out-earned the Glade for a hammer at Level 16, so it pays +22%, and both harder tiers carry a little more health' }),
});
/* A ground pack's own tier row, when its shape demands one (src/data/grounds/<id>/pack.js `tierOverride`, with its why). */
export const TIER_PULL_OVERRIDES = Object.freeze(foldRows('tier override', BASE_TIER_OVERRIDES, GROUND_PACKS, (p) => (p.tierOverride ? { [p.id]: p.tierOverride } : {})));

/* What one swing is worth at a same-Level hero: its to-hit times its blow share, a tier's atk scaling `k` applied the engine's way
   (atk x k: the blow x k, the to-hit up 2% a point of atk added). The reference monster is a regular at the floor, tier-1 damage scale. */
function swingWorth(floor, lift, k, F) {
  /* the gentle blow cap is a Normal kindness too: a tier takes it back with the rest (at full lift there is none) */
  const d = dangerAt(floor, lift, F), dl = d.ramp + (1 - d.ramp) * clamp01(lift);
  const cap = F.blow.gentleCap ? F.blow.gentleCap + (1 - F.blow.gentleCap) * dl : Infinity;
  const atk = (Math.min(d.blow, cap) * F.refHp(floor)) / DAMAGE_SCALE_BY_TIER[1];
  return (d.hit + atk * (k - 1) * ACC_PER_POINT) * Math.min(d.blow, cap) * k;
}

/**
 * The engine's tier row on a ground of this floor and id ({ pull, dmgPm, hpPm, xpPm }, hunt-tiers.js's shape after
 * lane/b-tier-dials): dmgPm is the atk scaling that makes a swing on this ground worth what the tier's is on a full
 * ground lifted as written; the pull is ONE number for every group (the ground's own, else the table's from TIER_PULL_FROM_FLOOR,
 * else 0), answered once per party size. opts { formula, tiers, overrides, ground, fit, pullFromFloor }.
 * @param {number} floor
 * @param {string} tierId
 * @param {{ formula?: any, tiers?: any, overrides?: any, ground?: string, fit?: string, pullFromFloor?: number }} [opts]
 */
export function tierRowFor(floor, tierId, opts = {}) {
  const T = (opts.tiers || TIER_DIALS)[tierId];
  if (!T) throw new Error('balance-sheet: no tier ' + tierId);
  const F = opts.formula || STAT_FORMULA;
  /* a party ground's tiers lift nothing (STAT_FORMULA.fit): the table's own scaling on its own Normal */
  const fit = F.fit && F.fit[opts.fit || 'both'];
  const o0 = opts.ground ? (opts.overrides || TIER_PULL_OVERRIDES)[opts.ground] : null, d0 = (o0 && o0.dials && o0.dials[tierId]) || {};
  const want = swingWorth(floor, fit && fit.tierLift === false ? 0 : T.lift, (d0.dmgPm || T.dmgPm) / 1000, F);
  /* the scaling of this ground's Normal regular that reaches `want` (it only grows with k): bisection */
  let lo = 1, hi = 10;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (swingWorth(floor, 0, mid, F) < want) lo = mid; else hi = mid; }
  const o = opts.ground ? (opts.overrides || TIER_PULL_OVERRIDES)[opts.ground] : null;
  const own = o && Object.prototype.hasOwnProperty.call(o, tierId) ? o[tierId] : undefined;
  if (own !== undefined && !Number.isInteger(own)) throw new Error('balance-sheet: ' + opts.ground + ' ' + tierId + ' pull is ONE number for every group, got ' + JSON.stringify(own));
  /* the bigger pulls start at the Glade's floor (TIER_PULL_FROM_FLOOR): under it, no more monsters than Normal, for every group */
  const from = opts.pullFromFloor === undefined ? TIER_PULL_FROM_FLOOR : opts.pullFromFloor;
  const pull = own !== undefined ? own : floor >= from ? T.pull : 0, d = (o && o.dials && o.dials[tierId]) || {};
  if (!Number.isInteger(pull) || pull < 0) throw new Error('balance-sheet: ' + tierId + ' pull is ONE number for every group, got ' + JSON.stringify(pull));
  /* the engine's shape: one entry per party size (the server's catalogue reads it by size), every entry the one pull */
  return { pull: Array(TIER_SIZES).fill(pull), dmgPm: Math.round(hi * 1000), hpPm: d.hpPm || T.hpPm, xpPm: d.xpPm || T.xpPm };
}

