// ============================================================================
// src/data/luck.js — LUCK AND MAGIC FIND, AS DATA (docs/design/itemization-plan.md §15, Luck v3.1; Tyler 2026-11-20: "Yes, designer's
// numbers"). Every number here is a row the designer may move; the formulas that read them are src/core/luck.js, and the server's
// copies are GENERATED from this file (tools/gen-luck.mjs: hr_luck_rules, hr_luck_salvage, hr_luck_stages, hr_luck_ring_pct,
// hr_lucky_offers), never typed.
//
// WHAT IT IS. One Luck total per ACCOUNT that only goes up, and a whole-percent Magic Find read off it:
//   Luck         Lucky Rivets used on the bar + the Bestiary's stage lumps. Raise-only. One rivet is one Luck.
//   rank n       held once Luck >= RANK_STEP x (1^2 + 2^2 + ... + n^2), so percent n alone costs RANK_STEP x n^2. Far stop RANK_MAX.
//   Magic Find   a hero's: the account's rank + the Lucky ring perk that hero wears (counts once, the largest worn).
//   on a row     Rare and Very Rare: chance x (1 + MF / 100). Trophy: chance x (1 + 0.25 x MF / (MF + 25)), approached and never
//                reached. Every other band (and every guaranteed row) never moves. One draw a row, as today.
//   a party      rolls at ONE number for the heroes at the kill, whoever landed it: LUCK_RULES.party picks it ('highest', the
//                designer's 2026-11-20 whole-game audit §5, superseding §15's average: a new friend never dilutes a veteran's roll,
//                or friends are a cost again). Each member's number is the server's, frozen per settle.
//
// THE TWO FEEDS. Salvage: a piece the account's OWN hunts dropped (found minus already salvaged, per account and item, server-held),
// salvaged at Dispatch, pays Lucky Rivets (account-bound: no trade, listing, shop price or mail; Storage moves them between the
// account's own heroes). Bestiary: one kill count a creature for the whole account; each stage reached pays a lump onto the bar.
//
// DARK UNTIL ARMED. LUCK_SWITCH names the hr_feature_switches row (2027-03-21-feature-switches.sql) every server door asks: off, no
// account reads a Magic Find above 0, no plan takes Salvage or Use, the Lucky job and the luck section are absent, nothing counts.
// The engine reads only the server's own number (hr_hunt_instance_read `magic_find`), so a switch that is off plays today's game,
// draw for draw. Nothing in the Crowns store sells Luck (Tyler 2026-11-20); no food, lining, unique property or event moves a drop.
//
// PURE ESM. Data only.
// ============================================================================

/** The feature switch every Luck door asks (hr_feature_on). Off = dark. */
export const LUCK_SWITCH = 'luck';

/** The item salvage pays Luck in: one is one Luck (src/data/items.js row, bop and worth 0: never sold, listed or traded). */
export const LUCK_ITEM = 'lucky_rivet';

/* ── THE BAR ──────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
export const LUCK_RULES = Object.freeze({
  /** percent n costs this x n^2 Luck: rank 10 at 38,500, rank 16 at 149,600, rank 100 at 33.84M */
  rankStep: 100,
  /** the far stop: +100% on a Rare row (a guard needs a finite top; no measured life comes near it) */
  rankMax: 100,
  /** a Trophy row closes on this bonus (permille) and never reaches it; at trophyHalf percent it holds half (+25% x MF / (MF + 25)) */
  trophyMaxPm: 250,
  trophyHalf: 25,
  /** a party's one number from its members' at the kill: 'highest' (whole-game audit 2026-11-20 §5) or 'average' (its floor; §15 v3.1) */
  party: 'highest',
  /** the most rivets one Dispatch press pays or puts on the bar (hr_apply's c_max_item_delta) */
  pressMax: 1000000,
});

/** The bands Magic Find moves IN FULL (a Rare or Very Rare row's chance x (1 + MF / 100)). */
export const LUCK_FULL_BANDS = Object.freeze(['rare', 'very_rare']);
/** The bands Magic Find moves on the Trophy curve. */
export const LUCK_TROPHY_BANDS = Object.freeze(['trophy']);

/* ── THE SALVAGE FEED: Lucky Rivets a piece pays. Two a tier keeps the price of Luck flat (a point costs 13 to 15 g of shop money at
   every tier, measured); a Rare is worth five standard pieces of its tier; a unique past tier 7, 50 x its band. A piece that drops in
   no band (bought, crafted, store, chest) pays nothing; a Very Rare piece pays nothing (it is worn or sold). ── */
export const SALVAGE_RIVETS = Object.freeze({
  perTier: 2,
  /** a piece whose every drop row is Rare or Trophy pays this many times a standard one of its tier */
  rareMult: 5,
  /** a unique past tier 7 (tier = its band) */
  uniquePerBand: 50,
  /** the bands whose pieces pay nothing */
  never: Object.freeze(['very_rare']),
  /** the item types salvage takes (worn gear; src/data/loot-bands.js VENDOR_GEAR_TYPES) */
  types: Object.freeze(['weapon', 'armor', 'offhand', 'jewelry']),
});

/* ── THE BESTIARY FEED: an account's kills of ONE creature that each pay a lump of Luck, once. Each stage four to five times the
   last, so four heroes sit about one stage ahead; the lumps climb with them. ── */
export const LUCK_STAGES = Object.freeze([
  Object.freeze({ kills: 100, luck: 50 }),
  Object.freeze({ kills: 500, luck: 150 }),
  Object.freeze({ kills: 2500, luck: 500 }),
  Object.freeze({ kills: 10000, luck: 1500 }),
  Object.freeze({ kills: 40000, luck: 5000 }),
  Object.freeze({ kills: 160000, luck: 15000 }),
]);

/* ── THE LUCKY RING (the seventh ring perk; all jewelry is Smithing, ruled 11-18). +1 / +2 / +2 / +3 / +3 / +4% Magic Find at tiers 2
   to 7 for the ONE hero wearing it, counted once (the largest worn). It rolls by chance like the other ring perks where the switch is
   on, and the Lucky job makes it for sure: a Plain ring of the tier + LUCKY_RIVET_STEP x tier^2 rivets + the tier's Hallmark fee ->
   the Fine ring with Lucky. Nothing fails. The ring trades like all jewelry; salvaging one pays no rivets. ── */
/** Magic Find percent by ring tier (index = tier). */
export const LUCKY_PERK_PCT = Object.freeze([0, 0, 1, 2, 2, 3, 3, 4]);
/** The Lucky job burns this x tier^2 rivets: 2,000 / 4,500 / 8,000 / 12,500 / 18,000 / 24,500. */
export const LUCKY_RIVET_STEP = 500;
/** The most Lucky jobs one ACCOUNT takes in a UTC day: a blast-radius bound on a gold sink, not a pace (src/data/jewelry.js's own). */
export const LUCKY_DAY_LIMIT = 10;

/* ── HARDER PAST KRELL (Tyler 2026-11-20). Nothing changes through Krell's Hold. From the Morrow door (a ground whose Level floor is
   cutFloor or more, band 8) every RARE row drops `pm` permille less often at Magic Find 0, then stepPm more a band, to maxPm. Trophy,
   Very Rare and every other band, the hourly drop, keys, coin and XP are never cut. `bands`: [band, the Level floor it starts at]
   (itemization plan §2: two bands a region past 110, the Catacombs one). ── */
export const RARE_CUT = Object.freeze({
  cutFloor: 110,
  pm: 150,
  stepPm: 10,
  maxPm: 250,
  bands: Object.freeze([[8, 110], [9, 137], [10, 165], [11, 185], [12, 212], [13, 240], [14, 267], [15, 295], [16, 322], [17, 350], [18, 375]]
    .map((r) => Object.freeze(r))),
});

/** The Very Rare band (src/data/loot-bands.js): one of a ground's seven uniques past tier 7, every 60 to 90 hours a hero at MF 0. */
export const VERY_RARE_HOURS = Object.freeze([60, 90]);
