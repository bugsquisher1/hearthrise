// ════════════════════════════════════════════════════════════════════════
// src/data/time-blocks.js — BOUGHT TIME: HUNTING BLOCKS (Tyler 2026-11-22; 04-math-strategy.md section 11)
//
// Tyler's rulings of 2026-11-22: the hunting day is 10 h, 12 h with Premium (hunt-sessions.js STAMINA_MAX_MS),
// and more hunting is bought in 2 h blocks. Each block costs x1.5 the one before it that server day, and a hero
// buys at most 2 a day ("Actually yeah let's cap it"): the most anyone hunts at once is 14 h, 16 h with Premium.
// Bought town work (later, FB-10) is the same rule with its own row and a cap of 4. Blocks REPLACE the stamina
// refill (src/data/stamina-refill.js, 4 h, 6 a day), whose verb 1058-hunting-blocks.sql retires.
//
// THE RULE (the server computes it from the generated catalogue hr_time_blocks, tools/gen-time-blocks.mjs; the
// client only shows the server's quote):
//   n      = blocks of THIS kind the hero bought this server (UTC) day + 1     refused past perDay: `block_limit`
//   price  = ceil((base + perLevel x Level) x growthNum^(n-1) / growthDen^(n-1))
//   adds   = blockMin of stamina, whole, at the pool's own instant; refused when the pool would pass its cap plus
//            perDay blocks (`stamina_full`): bought time banks above the cap, never past one day's worth of it
// Level is the hero's Level (hr_level_of) at the instant of the purchase.
//
// THE PRICE IS A LEVER (tools/balance-program/levers/gear-economy.mjs econ.hunt-block) UNTIL wage(L) EXISTS. The
// target (04 section 11) is block hours x 2.0 hours of wage x wage(L) x 1.5^n, "pretty pricey": the first block
// costs more coin than its hours earn back. There is no wage(L) in src/ yet, so `base` and `perLevel` price a block
// on TODAY's base gold: the stamina refill's (1,000 + 250 a Level for 4 h), pro rata to 2 h. Worked: a Level 10
// hero's first block costs 500 + 1,250 = 1,750 gold and its second 2,625; a Level 50 hero's 6,750 and 10,125.
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
    /* LEVER until wage(L): gold of the day's first block, before the Level term (today's refill base, pro rata to 2 h). */
    base: 500,
    /* LEVER until wage(L): gold per Level on that price. */
    perLevel: 125,
  }),
});

/* The ruled numbers that are not levers (validate refuses a row that moves them). */
export const RULED = Object.freeze({ hunt: Object.freeze({ blockMin: 120, perDay: 2, growthNum: 3, growthDen: 2 }) });

/** The gold block n (1 for the day's first) of `kind` costs a hero of Level `level`, or null past the day's cap. Integers in, integer out. */
export function blockPrice({ kind, level, n }) {
  const R = TIME_BLOCKS[kind];
  const k = Math.floor(n);
  if (!R || !(k >= 1) || k > R.perDay) return null;
  const lv = Math.max(1, Math.floor(level));
  const num = BigInt(R.base + R.perLevel * lv) * BigInt(R.growthNum) ** BigInt(k - 1);
  const den = BigInt(R.growthDen) ** BigInt(k - 1);
  return Number((num + den - 1n) / den);
}

/** Every problem with the table (the shipped one by default), as strings. Empty = valid. */
export function validate(table = TIME_BLOCKS) {
  const out = [];
  for (const [kind, R] of Object.entries(table)) {
    if (!/^[a-z]{1,16}$/.test(kind)) out.push(kind + ': a kind is a lower-case word');
    for (const k of ['blockMin', 'perDay', 'growthNum', 'growthDen', 'base', 'perLevel']) {
      if (!Number.isInteger(R[k]) || R[k] <= 0) out.push(kind + '.' + k + ' must be a positive integer, got ' + R[k]);
    }
    if (R.growthNum < R.growthDen) out.push(kind + ': a later block never costs less than the one before it');
    const ruled = RULED[kind];
    if (ruled) for (const [k, v] of Object.entries(ruled)) if (R[k] !== v) out.push(kind + '.' + k + ' is ruled at ' + v + ' (Tyler 2026-11-22), got ' + R[k]);
  }
  return out;
}
