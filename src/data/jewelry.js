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
// in PERKS_PLAYED. Rows, recipes, the Hallmark offers and the market ceilings are all built from these tables, never typed,
// and tools/gen-jewelry.mjs copies the server's half (hr_hallmark_offers, hr_market_ceilings) with a --check.
//
// PURE ESM. Imports data only. Node, Deno and the browser read it verbatim.
// ============================================================================

import { SLOT_ITEMS } from './slot-ladders.js?v=0.2.114';

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
});

/** How hard a Surge lands its cast, permille of the cast's own numbers (the spec's "1.5x"). */
export const SURGE_MULT_PM = 1500;

/** The perks the engine plays today (each has its hook: Keen combat.js critChance, Follow-through damage.js roll, Surge
    abilities.js fire). Only these roll; the rest wait for their hook (the spec's next batches). */
export const PERKS_PLAYED = Object.freeze(['keen', 'follow', 'surge']);

/** What each slot can carry, in the order a row's name lists them (the spec's pools). */
export const JEWEL_POOLS = Object.freeze({
  ring: Object.freeze(['keen', 'surge', 'follow', 'thrift']),
  necklace: Object.freeze(['surge', 'thrift', 'second_wind', 'deflect']),
  earrings: Object.freeze(['keen', 'follow', 'second_wind', 'deflect']),
});

/* ── WHAT EACH TIER TAKES. The gem (src/data/items.js), the Hallmark step's gold and Crafting level, and the market's
   per-row ceiling for each grade (the plain piece keeps 100x book: hr_market_items). The gold is Tyler's call (11-05). ── */
export const JEWEL_TIERS = Object.freeze({
  2: Object.freeze({ gem: 'road_carnelian', hallmark: Object.freeze({ gold: 25000, level: 30 }), ceiling: Object.freeze({ fine: 100000, hallmarked: 300000 }) }),
  3: Object.freeze({ gem: 'seam_jasper', hallmark: Object.freeze({ gold: 100000, level: 45 }), ceiling: Object.freeze({ fine: 300000, hallmarked: 1000000 }) }),
});

/** THE SHOP'S PRICE for a plain crafted piece (Tyler 2026-11-05, call 5: plain jewelry stays in the Shop at a premium; the designer's
    3,000 g at T2 and 12,000 g at T3). At least JEWEL_SHOP_PREMIUM times the piece's book, so the Shop never undercuts a crafter
    (tests/catalogue-coherence.mjs C6). */
export const JEWEL_SHOP_PRICE = Object.freeze({ banded_signet: 3000 });
export const JEWEL_SHOP_PREMIUM = 10;

/** The skill every jewel roll and the Hallmark step read (designer: Crafting, no new skill). */
export const JEWEL_SKILL = 'crafting';

/* ── THE ODDS, per 10,000, at each Crafting level named (straight lines between, flat past the ends). The designer's
   table: a base recipe (metal only) rolls Fine, and Hallmarked at the extra-rare band; a gem roll (a plain piece and a
   gem) is never plain: Hallmarked at `hallmarked`, else Fine. ── */
export const ROLL_ODDS = Object.freeze({
  base: Object.freeze({ at: Object.freeze([15, 30, 60, 99]), fine: Object.freeze([500, 650, 950, 1200]), hallmarked: Object.freeze([0, 4, 7, 10]) }),
  gem: Object.freeze({ at: Object.freeze([15, 30, 60, 99]), hallmarked: Object.freeze([1000, 1300, 1900, 2500]) }),
});
export const ODDS_SCALE = 10000;

/** The most Hallmark steps one ACCOUNT takes in a UTC day: a blast-radius bound on a money surface, not a pace (a gem is
    about 11 hours of hunting). hr_hallmark reads its generated copy. */
export const HALLMARK_DAY_LIMIT = 10;

/* ── THE PIECES THE SAMPLE CRAFTS. A row: its plain item (slot-ladders.js) and its two jobs. `inputs` are the designer's
   recipe, raised 15% because a rolled job pays no bench tax (decision 5): 12 -> 14 Bronze Bars, no coal, no steel. ── */
export const JEWEL_PIECES = Object.freeze({
  banded_signet: Object.freeze({
    recipe: Object.freeze({ id: 'craft_banded_signet', name: 'Make Banded Signet', icon: '💍', inputs: Object.freeze({ bronze_bar: 14 }), xp: 420, req: 15, ms: 4000 }),
    gem: Object.freeze({ id: 'set_banded_signet', name: 'Set a Road Carnelian in a Banded Signet', icon: '💍', xp: 200, req: 15, ms: 3000 }),
  }),
});

const fmtPct = (pm) => (Math.round(pm) / 10) + '%';
const plainOf = (id) => SLOT_ITEMS[id] || null;

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

/* ── THE JOBS, as Crafting recipe rows (src/data/recipes.js joins them to the bench). `output` is the PIECE the job
   works on, its plain id, so a job keeps one product for the bench's tax, icon and category; `roll` is how the grade is
   picked and `outcomes` every id it can make (recipeOutcomes). A gem roll spends a plain piece and never makes one. ── */
export const JEWELRY_RECIPES = Object.freeze(Object.entries(JEWEL_PIECES).flatMap(([plain, p]) => {
  const tier = plainOf(plain).tier;
  const fine = gradeRows(plain, 'fine'), hall = gradeRows(plain, 'hallmarked');
  return [
    Object.freeze(Object.assign({}, p.recipe, { inputs: Object.assign({}, p.recipe.inputs), output: plain, roll: 'base',
      outcomes: Object.freeze([plain].concat(fine, hall)) })),
    Object.freeze(Object.assign({}, p.gem, { inputs: { [plain]: 1, [JEWEL_TIERS[tier].gem]: 1 }, output: plain, roll: 'gem',
      outcomes: Object.freeze(fine.concat(hall)) })),
  ];
}));

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
  const fine = kind === 'gem' ? ODDS_SCALE - hallmarked : at('fine');
  return { fine, hallmarked, plain: ODDS_SCALE - fine - hallmarked };
}

/* ── THE HALLMARK STEP: one row per (Fine piece, second perk). The server's copy is hr_hallmark_offers. ── */
export const HALLMARK_OFFERS = Object.freeze(Object.keys(JEWEL_PIECES).flatMap((plain) => {
  const tier = plainOf(plain).tier, t = JEWEL_TIERS[tier];
  return gradeRows(plain, 'fine').flatMap((from) => {
    const first = Object.keys(JEWELRY_ITEMS[from].jewelPerks)[0];
    return perksFor(plain).filter((p) => p !== first).map((second) => Object.freeze({
      from, to: jewelId(plain, [first, second]), perk: second, gem: t.gem, gold: t.hallmark.gold, skill: JEWEL_SKILL, level: t.hallmark.level, tier,
    }));
  });
}));

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
