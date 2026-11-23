// ════════════════════════════════════════════════════════════════════════
// src/data/town-works.js — WHAT THE WHOLE SERVER IS BUILDING TOGETHER (data; the source of truth).
//
// Tyler 2026-11-04: a server-wide donation project that changes the town, with a plaque. Designer's board section "2026-11-04 Gold sinks". Change a row here, then
// `node tools/gen-town-works.mjs` regenerates the server's copy (hr_town_works); its --check fails a stale one. The next project is one row. The Weighhouse is a town
// building the Market's window has always been named for, and no such building stood.
//
// VISUAL ONLY, NO BUFF: a gold-funded power effect is on Tyler's avoid list. No engine, XP, drop or price reads a project's total (tests/town-works.mjs TW-NO-BUFF).
//
// THE ROW (one per project, keyed by the server's project id):
//   name       how the town says it: the first words of its stage lines, and of its refusals
//   about      the Works tab's first words while it's being built; aboutDone  once it stands
//   map        the town it stands in
//   minGift    the smallest gift (a gift that exactly finishes the project may be smaller, or the last few coins could never be given)
//   perDay     how much one ACCOUNT may give in a UTC day, across all its heroes
//   perMinute  the verb's own rate bucket
//   perActive  THE GOAL SIZED TO THE SERVER (Tyler 2026-11-20, balance call 24-7; 24-economy.md Q9): the goal is perActive gold for each WEEKLY ACTIVE
//              ACCOUNT, and never under the last stage's `at` (the least goal), so a playtest of ten opens its market in about a week and a server of a
//              thousand in a day. The SERVER counts the accounts (hr_weekly_actives: an account that entered a hunt in the last 7 days on the server's
//              clock), once a UTC day; no client sends a count. 0 = the stages as written, a fixed goal.
//   stages     in order; the first starts at 0 and the last's `at` is the (least) goal. A sized goal moves every stage with it: stage k stands at
//              at_k / at_last of the goal. art: the sprite drawn on the lot (all one frame, stage 0's is the map's object);
//              line: the System line when the total crosses its stage, read after `name`
//   gifts      the amounts the window offers as buttons; the player may type any other
//   plaqueTop  how many accounts the plaque names
//
// GOLD IN HOURS OF WAGE (lane/prices-wage-hours, 2026-11-23; 27-formula-overhaul.md T-5): the smallest gift, an account's day, the goal a
// weekly active account and every stage's mark are milli-hours of wage at step 1, as list prices (src/data/wage.js wageListPrice, two
// significant figures: a server-wide project has no step of its own, so it reads the base wage), never typed. The hours give back the
// 2026-11-22 tags (100 / 25,000 / 20,000 / 25,000 / 75,000 / 150,000 / 250,000). `gifts` are the window's buttons, presets the player
// may type past (not a price, a clamp or a goal), so they stay plain numbers under perDay.
//
// PURE ESM DATA. Data and the wage's list price, no DOM. It reaches no edge import.
// ════════════════════════════════════════════════════════════════════════

import { wageListPrice } from './wage.js';

/* A server-wide project reads the base wage (the header). */
const WORKS_STEP = 1;
const gold = (hoursPm) => wageListPrice(hoursPm, WORKS_STEP);
const stage = (atHoursPm, art, label, line) => Object.freeze({ atHoursPm, at: gold(atHoursPm), art, label, line });

export const TOWN_WORKS = Object.freeze({
  weighhouse: Object.freeze({
    name: 'The Weighhouse', about: 'Havora is raising the Weighhouse on the east bank. Every gift goes toward the building, and the biggest givers go on its plaque.',
    aboutDone: 'Havora raised the Weighhouse on the east bank, and the biggest givers stand on its plaque.',
    map: 'town_common', hoursPm: Object.freeze({ minGift: 8, perDay: 1933, perActive: 1547 }), minGift: gold(8), perDay: gold(1933), perMinute: 20,
    gifts: Object.freeze([1000, 5000]), plaqueTop: 10,
    /* 1.547 hours of wage a weekly active account (20,000), 19.333 at least (250,000; was a fixed 1,000,000, which only a server of
       hundreds ever finished). */
    perActive: gold(1547),
    stages: Object.freeze([
      stage(0, 'havora_weighhouse_staked', 'Staked out', null),
      stage(1933, 'havora_weighhouse_footings', 'Footings', 'has its footings.'),
      stage(5800, 'havora_weighhouse_framed', 'Framed', 'has its frame.'),
      stage(11600, 'havora_weighhouse_walled', 'Walled', 'has its walls.'),
      stage(19333, 'havora_weighhouse_finished', 'Finished', 'is finished.'),
    ]),
  }),
});
