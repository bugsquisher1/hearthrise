// ════════════════════════════════════════════════════════════════════════
// src/data/time-blocks.js — BOUGHT TIME: HUNTING BLOCKS (Tyler 2026-11-22; 04-math-strategy.md section 11)
//
// Tyler's rulings of 2026-11-22: the hunting day is 10 h, 12 h with Premium (hunt-sessions.js STAMINA_MAX_MS),
// and more hunting is bought in 2 h blocks. Each block costs x1.5 the one before it that server day, and a hero
// buys at most 2 a day ("Actually yeah let's cap it"): the most anyone hunts at once is 14 h, 16 h with Premium.
// Bought town work (later, FB-10) is the same rule with its own row and a cap of 4. Blocks REPLACE the stamina
// refill (src/data/stamina-refill.js, 4 h, 6 a day), whose verb 1058-hunting-blocks.sql retires.
//
// THE RULE (src/core/wage.js blockPrice; the server computes it from the generated catalogue hr_time_blocks and its twin
// hr_time_block_price, tools/gen-time-blocks.mjs; the client only shows the server's quote):
//   n      = blocks of THIS kind the hero bought this server (UTC) day + 1     refused past perDay: `block_limit`
//   price  = ceil(blockMin / 60 x priceHourPm / 1000 x wage(L) x (growthNum / growthDen)^(n-1))
//   adds   = blockMin of stamina, whole, at the pool's own instant; refused when the pool would pass its cap plus
//            perDay blocks (`stamina_full`): bought time banks above the cap, never past one day's worth of it
// L is the hero's Level (hr_level_of) at the instant of the purchase; wage(L) is the gold one reference hunted hour pays at
// that Level (src/core/wage.js, its levers in src/data/wage.js).
//
// "PRETTY PRICEY" (Tyler 2026-11-22; 04 section 11): a hunted hour pays about one hour of wage, so a block hour priced at
// priceHourPm 2,000 (2.0 hours of wage) makes the day's first block cost about twice what its 2 h pay, and the second three
// times. A player buys XP, drops and remains with it, never more gold. Worked at the calibrated wage (src/data/wage.js): a
// Level 60 hero's first block costs 4 x wage(60) and its second 6 x wage(60).
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

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
});

/* The ruled numbers that are not levers (validate refuses a row that moves them). */
export const RULED = Object.freeze({ hunt: Object.freeze({ blockMin: 120, perDay: 2, growthNum: 3, growthDen: 2 }) });

/* THE KINDS THE SERVER SELLS. hr_time_buy (1058-hunting-blocks.sql) adds STAMINA for every row of hr_time_blocks, so a kind
   joins this table only with a verb that adds what it sells: a town-work row here before FB-10's own verb would sell hunting
   time at the work price. Work blocks are priced by the same rule today (src/core/wage.js blockPriceOf, the R12 hook). */
export const SOLD_KINDS = Object.freeze(['hunt']);

/** Every problem with the table (the shipped one by default), as strings. Empty = valid. */
export function validate(table = TIME_BLOCKS) {
  const out = [];
  for (const [kind, R] of Object.entries(table)) {
    if (!/^[a-z]{1,16}$/.test(kind)) out.push(kind + ': a kind is a lower-case word');
    if (!SOLD_KINDS.includes(kind)) out.push(kind + ': no verb sells this kind yet (hr_time_buy adds stamina for every row)');
    for (const k of ['blockMin', 'perDay', 'growthNum', 'growthDen', 'priceHourPm']) {
      if (!Number.isInteger(R[k]) || R[k] <= 0) out.push(kind + '.' + k + ' must be a positive integer, got ' + R[k]);
    }
    if (R.growthNum < R.growthDen) out.push(kind + ': a later block never costs less than the one before it');
    /* bought time never prints gold: a block hour costs more than the hour of wage a reference hunted hour pays (04 section 11) */
    if (Number.isInteger(R.priceHourPm) && R.priceHourPm <= 1000) out.push(kind + '.priceHourPm ' + R.priceHourPm + ' would sell an hour for no more than it pays');
    const ruled = RULED[kind];
    if (ruled) for (const [k, v] of Object.entries(ruled)) if (R[k] !== v) out.push(kind + '.' + k + ' is ruled at ' + v + ' (Tyler 2026-11-22), got ' + R[k]);
  }
  return out;
}
