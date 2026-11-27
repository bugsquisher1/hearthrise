// ════════════════════════════════════════════════════════════════════════
// src/data/work-day.js — THE COMPANY'S TRADES AND EACH HERO'S WORK DAY (FB-10 slice 1; Tyler's rulings of 2026-11-22,
//   CR-Q1 a and CR-Q3 b; 09-crafting.md sections 2.6 and 5.3; 02-architecture.md package 5).
//
// Tyler 2026-11-22: "Trade Levels are owned by the company, not by each hero" (CR-Q1 a). "Each hero's town work has a
// daily cap, longer with Premium" (CR-Q3 b). More town work is bought in 2 h blocks, x1.5 each, at most 4 a day: the row is
// src/data/time-blocks.js TIME_BLOCKS.work, sold by hr_time_buy and bought by a hero's standing rule (1071-work-blocks.sql),
// and the cap counts it (src/core/work-day.js `extraMs`).
//
// TRADES     a skill is a company trade when its catalogue category is one of TRADE_CATS (src/data/skills.js `cat`):
//            Woodcutting, Mining, Fishing, Farming, Cooking, Crafting, Smithing and Runecrafting today. One XP total for
//            the account (supabase company_trades); every hero reads it. Combat skills stay each hero's own.
// THE DAY    a hero's town work (a pointer of a WORK_KINDS kind: a gathering job or a bench run) is capped each server
//            (UTC) day at freeMin, or freeMin + premiumExtraMin with Premium. The hero stops when the day's work runs
//            out and waits in town; the next UTC day opens a fresh cap. Time a hero is not working costs nothing.
//
// THE NUMBERS ARE LEVERS (tools/balance-program/levers/gear-economy.mjs econ.work-day, econ.work-premium): 09 section 4.7
// `workDay` 8 h (search 6 to 12) and `premiumWorkExtra` 2 h (1 to 2, at most a quarter of the day). The server reads them
// from the generated catalogue hr_work_day (tools/gen-work-day.mjs); nothing types them twice.
//
// PURE ESM. Data only (the rule is src/core/work-day.js).
// ════════════════════════════════════════════════════════════════════════
import { TIME_BLOCKS } from './time-blocks.js';

export const WORK_DAY = Object.freeze({
  /* LEVER (09 `workDay`): minutes of town work a hero may do each UTC day. */
  freeMin: 480,
  /* LEVER (09 `premiumWorkExtra`): minutes Premium adds to that day. */
  premiumExtraMin: 120,
});

/* The skill categories that are company trades (src/data/skills.js `cat`). */
export const TRADE_CATS = Object.freeze(['gather', 'artisan']);

/* The pointer kinds that are town work (player_state.active_kind): a gathering job and a bench run. */
export const WORK_KINDS = Object.freeze(['gather', 'artisan']);

/** Every problem with the table (the shipped one by default), as strings. Empty = valid. */
export function validate(day = WORK_DAY, cats = TRADE_CATS, kinds = WORK_KINDS) {
  const out = [];
  for (const k of ['freeMin', 'premiumExtraMin']) {
    if (!Number.isInteger(day[k]) || day[k] < 0) out.push(k + ' must be a whole number of minutes, got ' + day[k]);
  }
  if (!(day.freeMin >= 60)) out.push('freeMin is under an hour');
  /* 09 section 5.3: Premium's extra never more than a quarter of the free day */
  if (day.premiumExtraMin * 4 > day.freeMin) out.push('premiumExtraMin is more than a quarter of freeMin');
  /* the longest day (Premium and every block) stays under 24 h: src/core/work-day.js crosses at most one midnight a stop */
  /* a bought work block (src/data/time-blocks.js TIME_BLOCKS.work: Tyler's 2 h, at most 4 a day) */
  const W = TIME_BLOCKS.work;
  const longest = day.freeMin + day.premiumExtraMin + W.blockMin * W.perDay;
  if (!(longest < 1440)) out.push('the longest work day (' + longest + ' min) is not under 24 h');
  if (!cats.length || cats.some((c) => !/^[a-z]{1,16}$/.test(c))) out.push('a trade category is not a lower-case word');
  if (cats.includes('combat')) out.push('combat skills are each hero\'s own, never a company trade');
  if (!kinds.length || kinds.some((c) => !/^[a-z]{1,16}$/.test(c))) out.push('a work kind is not a lower-case word');
  if (kinds.includes('combat')) out.push('a hunt is not town work');
  return out;
}
