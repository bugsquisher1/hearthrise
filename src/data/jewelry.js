// ============================================================================
// src/data/jewelry.js — CRAFTED JEWELRY, AS DATA: PERKS, ROLLS AND THE HALLMARK (the designer's spec, PRIORITY_BOARD
// "2026-11-04 Crafted jewelry"; Tyler 2026-11-05, "let start with your calls": two perks a piece at fixed strength, each
// combination its own item row; the Hallmark fee is the gold sink; no paid re-roll, ever, without his word; a roll moves no
// gold; plain pieces stay in the Shop; the odds are shown before the roll).
//
// A PIECE has three grades, each an item row of its own (items are stacks by id, so a grade can't live on one copy):
//   plain       the piece as it always was (slot-ladders.js), no perk
//   Fine        one perk, rolled at the bench
//   Hallmarked  two perks: rolled (rarely) at the bench, or made from a Fine piece at the Hallmark step, where the player
//               CHOOSES the second perk and pays the fee. Nothing is rolled there, nothing fails, nothing is refunded.
// Every grade keeps the plain piece's book value, so it sells to the Shop for the plain piece's bid and can't be a faucet.
//
// THE ROLL is the bench's own seeded stream (src/core/artisan.js rollJewel), drawn only on a recipe with `roll`: the
// browser never rolls, and a job without a roll draws exactly what it drew before. ONE draw picks the grade from
// ROLL_ODDS at the hero's server-held level in the recipe's skill; one more picks each perk, uniformly from the perks the
// piece's slot can carry AND the engine plays (PERKS_PLAYED). So a perk the engine can't play is never rolled.
//
// THE SAMPLE (CLAUDE.md §10, no mass generation): only the pieces in JEWEL_PIECES are crafted, and only the perks in
// PERKS_PLAYED roll. A new piece is one row here (its plain row must exist); a new perk is one engine hook and one name
// in PERKS_PLAYED. Rows, recipes, the Hallmark offers, the reforges and the market ceilings are all built from these tables,
// never typed, and tools/gen-jewelry.mjs copies the server's half (hr_hallmark_offers, hr_jewel_reforge_offers,
// hr_market_ceilings) with a --check.
//
// EACH PIECE NAMES ITS OWN BENCH (Tyler 2026-11-18: ALL jewelry is Smithing, rings, earrings and necklaces; Crafting makes
// cloaks and belts; docs/design/itemization-plan.md §4): `skill` on a JEWEL_PIECES row is the bench that makes it, rolls it,
// sets its gem, Hallmarks it and reforges it. A piece whose slot has no perk the engine plays ships PLAIN: one ordinary job,
// no roll, no gem job, no graded rows. It starts rolling the build its first perk lands in PERKS_PLAYED (and then needs its
// gem job), with no other change.
//
// PURE ESM. Imports data only. Node, Deno and the browser read it verbatim.
// ============================================================================

import { SLOT_ITEMS } from './slot-ladders.js?v=0.2.143';

/* ── THE PERKS. T3 numbers are the designer's measured sizes; T2 about two thirds (the spec). Permille. ──
   `what` is the player's sentence, with {pct} for the size. Each perk counts ONCE per hero, whatever it wears
   (src/core/combat.js jewelPerksOf: the largest worn, never a sum). */
export const JEWEL_PERKS = Object.freeze({
  keen: Object.freeze({ name: 'Keen', pm: Object.freeze({ 2: 40, 3: 60 }), what: '{pct} more chance that a basic blow lands critical' }),
  surge: Object.freeze({ name: 'Surge', pm: Object.freeze({ 2: 67, 3: 100 }), what: '{pct} of your spells, abilities and heals land half again as hard' }),
  follow: Object.freeze({ name: 'Follow-through', pm: Object.freeze({ 2: 40, 3: 60 }), what: '{pct} of your basic blows also land on one more monster beside the target' }),
  thrift: Object.freeze({ name: 'Thrift', pm: Object.freeze({ 2: 53, 3: 80 }), what: '{pct} of your casts and shots cost nothing' }),
  deflect: Object.freeze({ name: 'Deflect', pm: Object.freeze({ 2: 27, 3: 40 }), what: '{pct} of the blows at you are turned aside' }),
  second_wind: Object.freeze({ name: 'Second Wind', pm: Object.freeze({ 2: 7, 3: 10 }), what: '{pct} of your max HP back on each kill' }),
  /* THE EARRINGS' PAIR (itemization plan §4, phase 2), sized on the real engine to the plan's budget (one perk in an ordinary hunt
     about 1% XP or 2% less damage, about three times that in the case it is built for). Measured 2026-11-18 at the Glade, Level 24, lone,
     3 seeds x 3 h, over plain Fang Studs (tools/balance-sim/itemization-table.mjs sample / built-for): Steady 15% gave +0.3 to +1.7% XP
     by way (20% gave up to +2.4%); Focus 2% gave a mage +3.2% and 6% less damage taken (its case: the mana basic) and a healer +0.4%,
     where 4% gave the mage +16% and 1% nothing, since a kill returns whole mana. T3 is half again, as Keen's is.
     STEADY RE-SIZED 15% -> 20% (lane/d-jewelry-2b, 2026-11-18: "weak in its intended case"). Measured on the real settle, Fang Studs (Steady)
     against plain Fang Studs, paired dice, 8 ways x the Glade (24) and the Sewer (18), 3 seeds x 3 h: XP gain, all ways / melee, at the
     Level and with the main skill 10 under: 15% 1.0 / 1.8 and 1.7 / 2.2; 20% 1.3 / 2.1 and 2.2 / 2.9; 25% 1.9 / 2.8 and 2.7 / 3.7; 30%
     2.1 / 3.2 and 3.2 / 4.4. The case it is built for is a melee hero under its Level (bows and casters barely miss: 0.2-0.5% at the Level
     at 15-20%), and 20% puts that case at about 3% while the all-ways hunt stays near the peers' 1% (Keen 1.0, Follow-through 1.1, Surge
     0.9, Focus 0.3 all ways / a Glade mage 3.1, same harness). No size reaches the plan's 3x over the ordinary hunt: the gain under the
     Level is 1.4 to 1.7 times the gain at it at every size measured (15 to 70%), because a miss only rises a point a skill level. */
  steady: Object.freeze({ name: 'Steady', pm: Object.freeze({ 2: 200, 3: 300 }), what: '{pct} of your basic blows that would miss land anyway' }),
  focus: Object.freeze({ name: 'Focus', pm: Object.freeze({ 2: 20, 3: 30 }), what: '{pct} of your max mana back on each kill' }),
});

/** How hard a Surge lands its cast, permille of the cast's own numbers (the spec's "1.5x"). */
export const SURGE_MULT_PM = 1500;

/** The perks the engine plays today (each has its hook: Keen combat.js critChance, Steady combat.js accuracy, Follow-through
    damage.js roll, Focus damage.js landHit's kill, Surge abilities.js fire). Only these roll; the rest wait for their hook. */
export const PERKS_PLAYED = Object.freeze(['keen', 'follow', 'surge', 'steady', 'focus']);

/** What each slot can carry, in the order a row's name lists them (itemization plan §4, the pools from tier 2; the tier 4 and 6
    perks join with their tiers). A cloak's Slip and Stride join `cape` with their hooks: until then a cloak ships plain. */
export const JEWEL_POOLS = Object.freeze({
  ring: Object.freeze(['keen', 'surge', 'follow', 'thrift']),
  necklace: Object.freeze(['deflect', 'second_wind']),
  earrings: Object.freeze(['steady', 'focus']),
});

/* ── WHAT EACH TIER TAKES. The gem (src/data/items.js), the tier's metal, the Hallmark step's gold and level (in the piece's own
   skill), and the market's per-row ceiling for each grade (the plain piece keeps 100x book: hr_market_items). The gold is Tyler's
   (11-05; tiers 4 to 7 ruled 11-18). `reforge`: what carrying a piece UP to this tier takes besides its gem and the fee difference
   (itemization plan §4 "Jewel reforging": the new tier's metal, gem and Hallmark level). ── */
export const JEWEL_TIERS = Object.freeze({
  2: Object.freeze({ gem: 'road_carnelian', metal: 'bronze_bar', hallmark: Object.freeze({ gold: 25000, level: 30 }), ceiling: Object.freeze({ fine: 100000, hallmarked: 300000 }) }),
  3: Object.freeze({ gem: 'seam_jasper', metal: 'steel_bar', hallmark: Object.freeze({ gold: 100000, level: 45 }), ceiling: Object.freeze({ fine: 300000, hallmarked: 1000000 }),
    reforge: Object.freeze({ bars: 6 }) }),
});

/** THE SHOP'S PRICE for a plain crafted jewel (Tyler 2026-11-05, call 5: plain jewelry stays in the Shop at a premium; the designer's
    3,000 g at T2 and 12,000 g at T3). At least JEWEL_SHOP_PREMIUM times the piece's book, so the Shop never undercuts a crafter
    (tests/catalogue-coherence.mjs C6). A cloak is not jewelry: the Shop sells none past the Traveler Cape. */
export const JEWEL_SHOP_PRICE = Object.freeze({ banded_signet: 3000, fang_studs: 3000, wolfbone_torc: 3000, seam_jasper_band: 12000 });
export const JEWEL_SHOP_PREMIUM = 10;
/** The slots the Shop's premium covers: jewelry (the ruling's words), never a cloak. */
export const JEWEL_SHOP_SLOTS = Object.freeze(['ring', 'necklace', 'earrings']);

/* ── THE ODDS, per 10,000, at each Crafting level named (straight lines between, flat past the ends). The designer's
   table: a base recipe (metal only) rolls Fine, and Hallmarked at the extra-rare band; a gem roll (a plain piece and a
   gem) is never plain: Hallmarked at `hallmarked`, else Fine. ── */
export const ROLL_ODDS = Object.freeze({
  base: Object.freeze({ at: Object.freeze([15, 30, 60, 99]), fine: Object.freeze([500, 650, 950, 1200]), hallmarked: Object.freeze([0, 4, 7, 10]) }),
  gem: Object.freeze({ at: Object.freeze([15, 30, 60, 99]), hallmarked: Object.freeze([1000, 1300, 1900, 2500]) }),
  /* A MINIMUM QUALITY (the board's "Master's Seal", PRIORITY_BOARD 2026-11-15 (d)): always Hallmarked, at every level. Its perks still roll. */
  seal: Object.freeze({ at: Object.freeze([15, 30, 60, 99]), hallmarked: Object.freeze([10000, 10000, 10000, 10000]) }),
});
export const ODDS_SCALE = 10000;

/* ── THE GUARANTEE LAYER (Tyler 2026-11-14: "with some items that can guarantee some things"; the designer's board section
   "2026-11-15 Special-attribute gear" (d), "Boss gems: the guarantee layer on crafted jewelry"). A boss drop set in a plain piece IN
   PLACE of its tier's gem fixes ONE thing about the roll and leaves the rest to the same shown odds:
     perk    the piece ALWAYS carries that perk; the grade rolls at the gem roll's odds and, on a Hallmarked roll, the second perk
             rolls from the others the piece can carry.
     grade   the roll is ALWAYS Hallmarked (a minimum quality); its perks roll, or only the second when a perk gem is set with it.
   Both are found, never bought, and neither moves a price: no gold on the roll. Each row names the pieces it sets in; its jobs sit on
   each piece's own bench (JEWEL_PIECES `skill`: the Banded Signet is Smithing). A piece whose slot has no played perk ships plain and
   takes no guarantee, and a perk gem names a perk its piece can roll (a named piece, a perk its slot lacks, is a later phase's): the
   module throws on either. The sample is the Rat King's: his Crown Shard (Rare) fixes Follow-through, and his Crown (his Trophy, the
   board's "Master's Seal" role) fixes Hallmarked. The Crown Shard KEEPS both its uses (designer 2026-11-18): the itemization plan's cut
   into its tier's gem (§4 "Old Rare prizes", built with the gem chips) and this guarantee, which takes the shard IN PLACE of that gem with
   the gem job's own time, XP and level, so it costs exactly what cutting it would make (tests/jewelry-rolls.mjs J10). Its card names the
   guarantee as a label where the switch is on (src/shell/item-lore.js usesOf, J17). ── */
/** @typedef {{ perk?: string, grade?: string, words: string, pieces: readonly string[] }} JewelGuarantee */
/** @type {Readonly<Record<string, JewelGuarantee>>} */
export const JEWEL_GUARANTEES = Object.freeze({
  /* `words` is how a job's name says the item: its article and its catalogue name (tests/jewelry-rolls.mjs J14 holds the name). */
  crown_shard: Object.freeze({ perk: 'follow', words: 'a Crown Shard', pieces: Object.freeze(['banded_signet']) }),
  rat_kings_crown: Object.freeze({ grade: 'hallmarked', words: 'the Rat King\'s Crown', pieces: Object.freeze(['banded_signet']) }),
});

/** THE SWITCH the guarantee jobs sit behind until they are played (hr_feature_switches, 2027-03-21-feature-switches.sql: off, accounts,
    testers, everyone). A job row naming it is in no catalogue a client reads without asking the server (src/data/recipes.js
    ARTISAN_RECIPES leaves it out), hr-accrue's set_activity refuses it for an account the switch is off for, and the server's
    `jewel_jobs` section leaves it out there, so the bench never shows it. */
export const JEWEL_SWITCH = 'jewel_guarantees';

/** The most Hallmark steps one ACCOUNT takes in a UTC day: a blast-radius bound on a money surface, not a pace (a gem is
    about 11 hours of hunting). hr_hallmark reads its generated copy. */
export const HALLMARK_DAY_LIMIT = 10;

/* ── THE PIECES THE SAMPLE CRAFTS (itemization plan §4 "Samples for the first build"). A row: its plain item (slot-ladders.js), the
   `skill` whose bench makes it, its job, its gem job once it rolls, and `next`, the piece of the tier above it reforges into. A rolled
   job's `inputs` are raised 15% because it pays no bench tax (decision 5: 12 -> 14 Bars); a rolled job's XP is its bars' own XP x 1.5
   (the Banded Signet's 14 x 20 x 1.5 = 420), a gem job's the tier's gem job (200 at T2) x the bar's XP step. A plain job (the necklace
   and cloak until their hooks land) pays the bench tax like any job. Plan's chain and clasp parts are left to the belt phase's buckles:
   the bar itself carries the Smithing half. ── */
export const JEWEL_PIECES = Object.freeze({
  banded_signet: Object.freeze({
    skill: 'smithing', next: 'seam_jasper_band',
    recipe: Object.freeze({ id: 'craft_banded_signet', name: 'Make Banded Signet', icon: '💍', inputs: Object.freeze({ bronze_bar: 14 }), xp: 420, req: 15, ms: 4000 }),
    gem: Object.freeze({ id: 'set_banded_signet', name: 'Set a Road Carnelian in a Banded Signet', icon: '💍', xp: 200, req: 15, ms: 3000 }),
  }),
  seam_jasper_band: Object.freeze({
    skill: 'smithing',
    recipe: Object.freeze({ id: 'craft_seam_jasper_band', name: 'Make Seam Jasper Band', icon: '💍', inputs: Object.freeze({ steel_bar: 14 }), xp: 1470, req: 30, ms: 4400 }),
    gem: Object.freeze({ id: 'set_seam_jasper_band', name: 'Set a Seam Jasper in a Seam Jasper Band', icon: '💍', xp: 700, req: 30, ms: 3400 }),
  }),
  fang_studs: Object.freeze({
    skill: 'smithing',
    recipe: Object.freeze({ id: 'craft_fang_studs', name: 'Make Fang Studs', icon: '💎', inputs: Object.freeze({ bronze_bar: 7, small_fang: 7 }), xp: 240, req: 15, ms: 3600 }),
    gem: Object.freeze({ id: 'set_fang_studs', name: 'Set a Road Carnelian in Fang Studs', icon: '💎', xp: 200, req: 15, ms: 3000 }),
  }),
  wolfbone_torc: Object.freeze({
    skill: 'smithing',
    recipe: Object.freeze({ id: 'craft_wolfbone_torc', name: 'Make Wolfbone Necklace', icon: '📿', inputs: Object.freeze({ bronze_bar: 6, small_fang: 8, silk_thread: 4 }), xp: 300, req: 15, ms: 3600 }),
  }),
  warband_bulwark: Object.freeze({
    skill: 'crafting',
    recipe: Object.freeze({ id: 'stitch_warband_bulwark', name: 'Stitch Warband Bulwark', icon: '🦸', inputs: Object.freeze({ bear_pelt: 8, steel_bar: 4 }), xp: 640, req: 30, ms: 4000 }),
  }),
});

/** The skills a crafted piece's bench can be (a guard reads it: a piece names one of these). */
export const JEWEL_SKILLS = Object.freeze(['smithing', 'crafting']);

/** The bench a piece (plain or graded) is made, Hallmarked and reforged at, or null for a piece no row here crafts. */
export function jewelSkillOf(id) {
  const plain = own(JEWEL_PIECES, id) ? id : own(JEWELRY_ITEMS, id) ? JEWELRY_ITEMS[id].jewelBase : null;
  return plain && own(JEWEL_PIECES, plain) ? JEWEL_PIECES[plain].skill : null;
}

const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
const fmtPct = (pm) => (Math.round(pm) / 10) + '%';
const plainOf = (id) => (own(SLOT_ITEMS, id) ? SLOT_ITEMS[id] : null);

/** A grade's row id: the plain id, then its perks in the slot's own order (keen, then follow). */
export function jewelId(plain, perks) {
  const pool = JEWEL_POOLS[(plainOf(plain) || {}).slot] || [];
  return [plain].concat([...perks].sort((a, b) => pool.indexOf(a) - pool.indexOf(b))).join('_');
}

/** The perks a piece can roll: its slot's pool that the engine plays, in pool order. */
export function perksFor(plain) {
  const it = plainOf(plain);
  const pool = it ? JEWEL_POOLS[it.slot] || [] : [];
  return pool.filter((p) => PERKS_PLAYED.includes(p));
}

/** A perk's size on a piece of `tier`, permille (0 for a tier the table has no number for). */
export const perkPm = (perk, tier) => (JEWEL_PERKS[perk] && JEWEL_PERKS[perk].pm[tier]) || 0;

/** The player's sentence for a perk at a size: "4% more chance that a basic blow lands critical". */
export const perkWords = (perk, pm) => (JEWEL_PERKS[perk] ? JEWEL_PERKS[perk].what.replace('{pct}', fmtPct(pm)) : '');

const pairsOf = (list) => list.flatMap((a, i) => list.slice(i + 1).map((b) => [a, b]));

/* The rows of one piece: each Fine (one perk) and each Hallmarked (two) the engine plays. */
function rowsOfPiece(plain) {
  const base = plainOf(plain);
  if (!base) throw new Error('jewelry.js: ' + plain + ' has no plain row in slot-ladders.js');
  const perks = perksFor(plain);
  const out = {};
  const put = (set, grade) => {
    const id = jewelId(plain, set);
    const names = set.map((p) => JEWEL_PERKS[p].name);
    out[id] = Object.assign({}, base, {
      n: (grade === 'hallmarked' ? 'Hallmarked ' : '') + base.n + ' (' + names.join(', ') + ')',
      rarity: grade === 'hallmarked' ? 'epic' : 'rare',
      jewelGrade: grade, jewelBase: plain,
      jewelPerks: Object.freeze(Object.fromEntries(set.map((p) => [p, perkPm(p, base.tier)]))),
    });
  };
  for (const p of perks) put([p], 'fine');
  for (const pair of pairsOf(perks)) put(pair, 'hallmarked');
  return out;
}

/** Every Fine and Hallmarked row, by id (src/data/items.js spreads them after the plain pieces). The rows are plain objects,
    like every ITEMS row: items.js marks rows after the spread. */
export const JEWELRY_ITEMS = Object.freeze(Object.assign({}, ...Object.keys(JEWEL_PIECES).map(rowsOfPiece)));

/** The rows of one grade of one piece, by id, in name order. */
export function gradeRows(plain, grade) {
  return Object.keys(JEWELRY_ITEMS).filter((id) => JEWELRY_ITEMS[id].jewelBase === plain && JEWELRY_ITEMS[id].jewelGrade === grade);
}

/* ── THE JOBS, as recipe rows on each piece's own bench (src/data/recipes.js joins them by skill). `output` is the PIECE the
   job works on, its plain id, so a job keeps one product for the bench's tax, icon and category; `roll` is how the grade is
   picked and `outcomes` every id it can make (recipeOutcomes). A gem roll spends a plain piece and never makes one. A piece
   with no perk the engine plays has one plain job: no roll, no gem job. ── */
function jobsOfPiece(plain, p) {
  const tier = plainOf(plain).tier;
  if (!JEWEL_SKILLS.includes(p.skill)) throw new Error('jewelry.js: ' + plain + "'s bench " + p.skill + ' is not one of ' + JEWEL_SKILLS.join(', '));
  if (!perksFor(plain).length) return [Object.freeze(Object.assign({}, p.recipe, { inputs: Object.assign({}, p.recipe.inputs), output: plain }))];
  if (!p.gem) throw new Error('jewelry.js: ' + plain + ' rolls perks and has no gem job');
  const fine = gradeRows(plain, 'fine'), hall = gradeRows(plain, 'hallmarked');
  return [
    Object.freeze(Object.assign({}, p.recipe, { inputs: Object.assign({}, p.recipe.inputs), output: plain, roll: 'base',
      outcomes: Object.freeze([plain].concat(fine, hall)) })),
    Object.freeze(Object.assign({}, p.gem, { inputs: { [plain]: 1, [JEWEL_TIERS[tier].gem]: 1 }, output: plain, roll: 'gem',
      outcomes: Object.freeze(fine.concat(hall)) })),
  ];
}

/* THE GUARANTEE JOBS of one piece (JEWEL_GUARANTEES), on the piece's own bench: each perk gem alone, each grade item alone, and each
   perk gem with each grade item, set in the plain piece IN PLACE of its tier's gem. Behind JEWEL_SWITCH. Its XP, time and level are
   the piece's gem job's, and its name says the piece as the gem job does ("in a Banded Signet", "in Fang Studs"). PROVISIONAL. */
function guaranteeJobs(plain, p) {
  const mine = Object.entries(JEWEL_GUARANTEES).filter(([, g]) => g.pieces.includes(plain));
  if (!mine.length) return [];
  const rolls = perksFor(plain);
  const bad = (why) => { throw new Error('jewelry.js: ' + mine.map(([id]) => id).join(', ') + ' on ' + plain + ': ' + why); };
  /* a guarantee needs a piece that rolls two perks (a Hallmarked outcome draws a second), and its gem job to set in place of */
  if (rolls.length < 2 || !p.gem) bad('the piece ships plain or rolls fewer than two perks, so nothing is left to guarantee');
  for (const [, g] of mine) {
    if (!!g.perk === !!g.grade || (g.grade && g.grade !== 'hallmarked')) bad('a guarantee fixes one perk or the Hallmarked grade, never both or another');
    if (g.perk && !rolls.includes(g.perk)) bad(g.perk + ' is not a perk the piece rolls (a named piece is a later phase\'s)');
  }
  const into = p.gem.name.slice(p.gem.name.lastIndexOf(' in ') + 4);
  const perkGems = mine.filter(([, g]) => g.perk), seals = mine.filter(([, g]) => g.grade);
  const sets = perkGems.map((x) => [x]).concat(seals.map((x) => [x]), perkGems.flatMap((x) => seals.map((y) => [x, y])));
  return sets.map((set) => {
    const withPerk = set.find(([, g]) => g.perk);
    const perk = withPerk ? withPerk[1].perk : null;
    const seal = set.some(([, g]) => g.grade);
    const rest = rolls.filter((k) => k !== perk);
    const outcomes = (seal ? [] : [jewelId(plain, [perk])])
      .concat(perk ? rest.map((k) => jewelId(plain, [perk, k])) : pairsOf(rest).map((pair) => jewelId(plain, pair)));
    return Object.freeze({
      id: 'set_' + set.map(([id]) => id).join('_') + '_' + plain,
      name: 'Set ' + set.map(([, g]) => g.words).join(' and ') + ' in ' + into,
      icon: p.gem.icon, xp: p.gem.xp, req: p.gem.req, ms: p.gem.ms,
      inputs: Object.freeze(Object.assign({ [plain]: 1 }, ...set.map(([id]) => ({ [id]: 1 })))),
      output: plain, roll: seal ? 'seal' : 'gem', ...(perk ? { perk } : {}), switch: JEWEL_SWITCH,
      outcomes: Object.freeze(outcomes),
    });
  });
}

/** Each bench's crafted-piece jobs, by skill: { smithing: [...], crafting: [...] }, the guarantee jobs (a row with `switch`) included:
    src/data/recipes.js keeps those out of ARTISAN_RECIPES and joins them only in ARTISAN_RECIPES_EVERY. */
export const JEWELRY_RECIPES_BY_SKILL = Object.freeze(Object.fromEntries(JEWEL_SKILLS.map((skill) => [skill,
  Object.freeze(Object.entries(JEWEL_PIECES).filter(([, p]) => p.skill === skill).flatMap(([plain, p]) => jobsOfPiece(plain, p).concat(guaranteeJobs(plain, p))))])));

/** The perks a job's roll may still draw (its guarantee left out), in the order the bench names them. */
export function jobRolls(r) {
  return r && r.roll ? perksFor(r.output).filter((k) => k !== r.perk) : [];
}

/** Every id a recipe row can make: its rolled outcomes, else its one output. */
export function recipeOutcomes(r) {
  if (!r) return [];
  if (r.roll && Array.isArray(r.outcomes)) return r.outcomes.slice();
  return r.output ? [r.output] : [];
}

/** A level's odds for a roll kind, per ODDS_SCALE: { fine, hallmarked, plain }. Straight lines between the table's levels. */
export function rollOdds(kind, level) {
  const t = ROLL_ODDS[kind];
  if (!t) return { fine: 0, hallmarked: 0, plain: ODDS_SCALE };
  const lv = Number.isFinite(level) ? level : 1;
  const at = (col) => {
    const xs = t.at, ys = t[col];
    if (!ys) return 0;
    if (lv <= xs[0]) return ys[0];
    for (let i = 1; i < xs.length; i++) {
      if (lv <= xs[i]) return Math.floor(ys[i - 1] + ((ys[i] - ys[i - 1]) * (lv - xs[i - 1])) / (xs[i] - xs[i - 1]));
    }
    return ys[ys.length - 1];
  };
  const hallmarked = at('hallmarked');
  /* a kind with no Fine column (a gem roll, a minimum quality) is never plain: what isn't Hallmarked is Fine */
  const fine = !t.fine ? ODDS_SCALE - hallmarked : at('fine');
  return { fine, hallmarked, plain: ODDS_SCALE - fine - hallmarked };
}

/* ── THE HALLMARK STEP: one row per (Fine piece, second perk). The server's copy is hr_hallmark_offers. ── */
export const HALLMARK_OFFERS = Object.freeze(Object.keys(JEWEL_PIECES).flatMap((plain) => {
  const tier = plainOf(plain).tier, t = JEWEL_TIERS[tier];
  return gradeRows(plain, 'fine').flatMap((from) => {
    const first = Object.keys(JEWELRY_ITEMS[from].jewelPerks)[0];
    return perksFor(plain).filter((p) => p !== first).map((second) => Object.freeze({
      from, to: jewelId(plain, [first, second]), perk: second, gem: t.gem, gold: t.hallmark.gold, skill: JEWEL_PIECES[plain].skill, level: t.hallmark.level, tier,
    }));
  });
}));

/* ── JEWEL REFORGING (itemization plan §4; Tyler 2026-11-18: keep Hallmark fees per piece and ADD reforging up a tier): a
   Hallmarked piece becomes the Hallmarked piece of the tier above it (its row's `next`), KEEPING BOTH PERKS at the new tier's
   size. It takes the new tier's metal, its gem, its Hallmark level in the new piece's skill, and the FEE DIFFERENCE (the new
   tier's Hallmark fee less the old's: what the piece already paid stays paid). Nothing rolls, nothing fails. The server's copy is
   hr_jewel_reforge_offers. A swap of one perk for the new tier's pool and a Fine piece's reforge are the next jewelry lane's. ── */
export const REFORGE_OFFERS = Object.freeze(Object.keys(JEWEL_PIECES).flatMap((plain) => {
  const next = JEWEL_PIECES[plain].next;
  if (!next) return [];
  const a = plainOf(plain), b = plainOf(next);
  if (!b || !own(JEWEL_PIECES, next) || b.slot !== a.slot || b.tier !== a.tier + 1) throw new Error('jewelry.js: ' + plain + "'s next " + next + ' is not a crafted ' + a.slot + ' of tier ' + (a.tier + 1));
  const from = JEWEL_TIERS[a.tier], to = JEWEL_TIERS[b.tier];
  if (!to || !to.reforge || !to.metal) throw new Error('jewelry.js: tier ' + b.tier + ' has no reforge row');
  return gradeRows(plain, 'hallmarked').flatMap((id) => {
    const perks = Object.keys(JEWELRY_ITEMS[id].jewelPerks);
    if (!perks.every((p) => perksFor(next).includes(p))) return [];
    return [Object.freeze({ from: id, to: jewelId(next, perks), metal: to.metal, bars: to.reforge.bars, gem: to.gem,
      gold: to.hallmark.gold - from.hallmark.gold, skill: JEWEL_PIECES[next].skill, level: to.hallmark.level, tier: b.tier })];
  });
}));

/** The benches with a Hallmark step or a reforge to offer (the Work window shows its jeweler section on these only): a bench whose
    pieces all ship plain has none. */
export const JEWEL_STEP_BENCHES = Object.freeze(JEWEL_SKILLS.filter((s) => HALLMARK_OFFERS.some((o) => o.skill === s) || REFORGE_OFFERS.some((o) => o.skill === s)));

/**
 * WHAT A GRADED PIECE COST IN FIXED GOLD, the Weighhouse's Suggested for it (designer 2026-11-05: "Suggested 260" invited a crafter to sell a
 * 25,000 g piece for 260): a Fine piece, its plain piece's Shop price; a Hallmarked one, that plus its tier's Hallmark fee and its gem's book.
 * Catalogue numbers only, so no account can steer it. `items` is the ITEMS table (passed in: items.js imports this file). Null for any other row.
 */
export function jewelSuggestedAsk(id, items) {
  const it = items && items[id];
  if (!it || !it.jewelGrade || !Number.isSafeInteger(JEWEL_SHOP_PRICE[it.jewelBase])) return null;
  const shop = JEWEL_SHOP_PRICE[it.jewelBase];
  if (it.jewelGrade !== 'hallmarked') return shop;
  const t = JEWEL_TIERS[it.tier], gem = t && items[t.gem];
  return t && gem ? shop + t.hallmark.gold + Math.floor(Number(gem.v) || 0) : null;
}

/** The market's per-row ceiling for each graded row (hr_market_ceilings): the tier's number for its grade. */
export const JEWEL_CEILINGS = Object.freeze(Object.fromEntries(Object.keys(JEWELRY_ITEMS).map((id) => {
  const it = JEWELRY_ITEMS[id];
  return [id, JEWEL_TIERS[it.tier].ceiling[it.jewelGrade]];
})));
