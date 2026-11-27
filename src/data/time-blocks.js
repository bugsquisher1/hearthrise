// ════════════════════════════════════════════════════════════════════════
// src/data/time-blocks.js — BOUGHT TIME: HUNTING BLOCKS AND TOWN-WORK BLOCKS (Tyler 2026-11-22; 04-math-strategy.md section 11)
//
// Tyler's rulings of 2026-11-22: the hunting day is 10 h, 12 h with Premium (hunt-sessions.js STAMINA_MAX_MS),
// and more hunting is bought in 2 h blocks. Each block costs x1.5 the one before it that server day, and a hero
// buys at most 2 a day ("Actually yeah let's cap it"): the most anyone hunts at once is 14 h, 16 h with Premium.
// Bought town work is the same rule with its own row and a cap of 4 ("Bought town work stays at 4 blocks"). Hunting
// blocks REPLACE the stamina refill (src/data/stamina-refill.js, 4 h, 6 a day), whose verb 1058-hunting-blocks.sql retires.
//
// THE RULE (src/core/wage.js blockPrice; the server computes it from the generated catalogue hr_time_blocks and its twin
// hr_time_block_price, tools/gen-time-blocks.mjs; the client only shows the server's quote):
//   n      = blocks of THIS kind the hero bought this server (UTC) day + 1     refused past perDay: `block_limit`
//   price  = ceil(blockMin / 60 x priceHourPm / 1000 x wage(L) x (growthNum / growthDen)^(n-1))
// L is the hero's Level (hr_level_of) at the instant of the purchase; wage(L) is the gold one reference hunted hour pays at
// that Level (src/core/wage.js, its levers in src/data/wage.js).
// WHAT A BLOCK ADDS, BY KIND (each kind is sold by its own branch of hr_time_buy: SOLD_KINDS):
//   hunt   blockMin of stamina, whole, at the pool's own instant; refused when the pool would pass its cap plus perDay blocks
//          (`stamina_full`): bought time banks above the cap, never past one day's worth of it (1058-hunting-blocks.sql)
//   work   blockMin more town work TODAY (the hero's work day, src/core/work-day.js `extraMs`); refused when the block could not be
//          worked whole before the server's midnight, counted from now with the work the day still has (`day_ending`): a block is
//          today's, so it is sold only while today has room to use it (1071-work-blocks.sql)
//
// "PRETTY PRICEY" (Tyler 2026-11-22; 04 section 11): every block costs about twice what its hours earn back, so the first block of
// either kind already costs more coin than it returns. A player buys XP, drops, remains, trade XP or a full stock, never more gold.
//   hunt   a hunted hour pays about one hour of wage (EARNS_PM 1000): priceHourPm 2,000 (2.0 hours of wage a block hour) makes the
//          day's first block 4 hours of wage, the second 6. At Level 60: 65,460 then 98,190 gold, where a Steady hour pays ~16,300.
//   work   a work-hour makes goods worth townWageShare x wage(L), at most storeCeiling x that at the store's top (store-kit.js; EARNS_PM
//          375): priceHourPm 500 (0.5 hours of wage) makes the day's four 1.0, 1.5, 2.25 and 3.375 hours of wage (8.1 in all).
// The price reads the hero's LEVEL, never its depth (Tyler 2026-11-22: "some things, like stamina, should be based off of level").
//
// THE STANDING RULE (20-v030-the-roads.md section 3.3, lane B1; 04 section 11: "A plan may hold a standing limit for each kind, in
// blocks and in price, and the same call honors it, so nobody buys by hand every day"): a hero's plan may say "buy up to N blocks of
// this kind a day, at most P gold each". The SERVER buys each block as it comes due (1071-work-blocks.sql, the sweep), inside the
// press's own rules (the cap, the ceiling, day_ending), never past N or P and never under the reserve (STANDING below). It is never on
// by default: it is offered once by the coach card when the purse fills (the designer, 12-targets.md section 9.3).
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════
import { STORE_KIT } from './store-kit.js';

export const TIME_BLOCKS = Object.freeze({
  hunt: Object.freeze({
    /* Minutes of stamina one block adds (Tyler: 2 h). */
    blockMin: 120,
    /* Blocks a hero may buy a server day (Tyler: 2, not a lever). */
    perDay: 2,
    /* Each block of the day costs growthNum / growthDen of the one before it (Tyler: x1.5). */
    growthNum: 3,
    growthDen: 2,
    /* LEVER (econ.hunt-block): one block hour's price in permille of an hour of wage (04 section 11: 2.0, band 1.5 to 2.5). */
    priceHourPm: 2000,
  }),
  /* Town work: 2 h more of the hero's day a block (Tyler), at most 4 a server day (Tyler: "Bought town work stays at 4 blocks"), each
     x1.5 the one before it (the hunting block's rule). LEVER (econ.work-block): priceHourPm, one block hour's price in permille of an
     hour of wage (04 section 11: 0.5, band 0.4 to 0.6). One line, so each lever's anchor names one row. */
  work: Object.freeze({ blockMin: 120, perDay: 4, growthNum: 3, growthDen: 2, priceHourPm: 500 }),
});

/* The ruled numbers that are not levers (validate refuses a row that moves them). */
export const RULED = Object.freeze({
  hunt: Object.freeze({ blockMin: 120, perDay: 2, growthNum: 3, growthDen: 2 }),
  work: Object.freeze({ blockMin: 120, perDay: 4, growthNum: 3, growthDen: 2 }),
});

/* THE KINDS THE SERVER SELLS. hr_time_buy (1071-work-blocks.sql) has one branch a kind and refuses `bad_kind` for any other, so a
   kind joins this list only with the branch that adds what it sells. */
export const SOLD_KINDS = Object.freeze(['hunt', 'work']);

/* THE KINDS A STANDING "BUY UP TO N A DAY" RULE MAY BUY (hr_time_auto_set; the server's sweep buys them, hr_time_auto_sweep). */
export const STANDING_KINDS = Object.freeze(['hunt', 'work']);

/* THE STANDING RULE (1071-work-blocks.sql; the designer's ruling, 12-targets.md section 9.3, lane/sn-sinks 2026-11-26). Never on by
   default: no rule row is off. The server's sweep (every minute) buys a hero's next block only while it can use it:
     leadMin       a hunting hero's pool, or today's bought town work left, is under this many minutes (hunting: one block, so the
                   pool never runs dry while the rule has blocks; bought stamina banks, so nothing is wasted. Town work: a few minutes,
                   because a work block is today's and a job may be stopped by hand)
     reserveHours  LEVER (econ.block-rule-reserve): it never takes the purse under this many hours of the hero's wage (the gold
                   ledger's reference company buys "while the purse keeps 20 hours of wage", 12-targets 9.2)
     offerDays     LEVER (econ.block-rule-offer): the coach card offers the rule once, when the company's purse first holds this many
                   days of its pay (a day of pay: the free hunting day x the wage at each hero's Level, summed)
     offerKind / offerChoices  the card: [Up to 1 a day] [Up to 2 a day] [Not now] for hunting blocks */
export const STANDING = Object.freeze({
  leadMin: Object.freeze({ hunt: 120, work: 10 }),
  reserveHours: 20,
  offerDays: 3,
  offerKind: 'hunt',
  offerChoices: Object.freeze([1, 2]),
});

/* WHAT ONE HOUR OF EACH KIND EARNS BACK AT MOST, in permille of an hour of wage (04 section 11, "why the bands' floors sit where they
   do"): a hunted hour pays one hour of wage (the wage's definition); a work-hour's goods fetch townWageShare x the wage, at most
   storeCeiling times that at the store's top. A block hour must cost more (bought time never prints gold), here and in the server's
   table (hr_time_blocks.earns_pm, its check). */
export const EARNS_PM = Object.freeze({
  hunt: 1000,
  work: Math.round(STORE_KIT.townWageShare * STORE_KIT.storeCeiling * 1000),
});

/** Every problem with the table (the shipped one by default), as strings. Empty = valid. */
export function validate(table = TIME_BLOCKS) {
  const out = [];
  for (const [kind, R] of Object.entries(table)) {
    if (!/^[a-z]{1,16}$/.test(kind)) out.push(kind + ': a kind is a lower-case word');
    if (!SOLD_KINDS.includes(kind)) out.push(kind + ': no branch of hr_time_buy sells this kind (it would be refused bad_kind)');
    for (const k of ['blockMin', 'perDay', 'growthNum', 'growthDen', 'priceHourPm']) {
      if (!Number.isInteger(R[k]) || R[k] <= 0) out.push(kind + '.' + k + ' must be a positive integer, got ' + R[k]);
    }
    if (R.growthNum < R.growthDen) out.push(kind + ': a later block never costs less than the one before it');
    /* bought time never prints gold: a block hour costs more than the most an hour of its kind earns back (04 section 11) */
    const earns = Object.prototype.hasOwnProperty.call(EARNS_PM, kind) ? EARNS_PM[kind] : null;
    if (!Number.isInteger(earns) || earns <= 0) out.push(kind + ': no EARNS_PM row says what its hour earns back');
    else if (Number.isInteger(R.priceHourPm) && R.priceHourPm <= earns) {
      out.push(kind + '.priceHourPm ' + R.priceHourPm + ' would sell an hour for no more than it earns back (' + earns + ')');
    }
    const ruled = RULED[kind];
    if (!ruled) out.push(kind + ': no RULED row (its block, cap and growth are Tyler\'s)');
    else for (const [k, v] of Object.entries(ruled)) if (R[k] !== v) out.push(kind + '.' + k + ' is ruled at ' + v + ' (Tyler 2026-11-22), got ' + R[k]);
  }
  for (const k of STANDING_KINDS) {
    if (!Object.prototype.hasOwnProperty.call(table, k)) out.push(k + ': a standing kind with no row');
    const lead = STANDING.leadMin[k];
    if (!Number.isInteger(lead) || lead < 1) out.push(k + ': the standing rule\'s lead must be a whole number of minutes, got ' + lead);
    /* hunting buys when the pool is under the lead: a lead past one block would buy into a full pool (stamina_full) */
    else if (table[k] && lead > table[k].blockMin) out.push(k + ': a lead of ' + lead + ' min is past one block (' + table[k].blockMin + ' min)');
  }
  if (!(Number.isFinite(STANDING.reserveHours) && STANDING.reserveHours >= 0)) out.push('STANDING.reserveHours must be hours of wage, 0 or more');
  if (!(Number.isFinite(STANDING.offerDays) && STANDING.offerDays > 0)) out.push('STANDING.offerDays must be days of pay, more than 0');
  if (!STANDING_KINDS.includes(STANDING.offerKind)) out.push('STANDING.offerKind ' + STANDING.offerKind + ' has no standing rule');
  const per = table[STANDING.offerKind] ? table[STANDING.offerKind].perDay : 0;
  if (!STANDING.offerChoices.length || STANDING.offerChoices.some((n) => !Number.isInteger(n) || n < 1 || n > per)) {
    out.push('STANDING.offerChoices must be block counts from 1 to the kind\'s cap (' + per + ')');
  }
  return out;
}
