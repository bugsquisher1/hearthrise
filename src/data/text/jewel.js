// ════════════════════════════════════════════════════════════════════════
// src/data/text/jewel.js — THE JEWELER'S WORDS: the Hallmark step and the jewel reforge in the Work window
// (src/shell/windows/hallmark-pane.js) and the job a piece or gem is used in (src/shell/item-lore.js).
//
// One row per line, read by t('jewel.<key>'). Labels, not sentences (Tyler 2026-11-14). Every number in them is the server's,
// passed in: the gold, the level, the bars held, the day's counts. What the Hallmark rows said before the reforge still sits in
// the pane's code (tests/text-home.mjs ratchets it down); the reforge's words started here (lane/d-jewelry-sample, 2026-11-18).
// ════════════════════════════════════════════════════════════════════════

export const JEWEL_TEXT = Object.freeze({
  /* The job an input names in item lore ("Used in Smithing: the Hallmark"). */
  job_hallmark: 'the Hallmark',
  job_reforge: 'the reforge',
  /* A boss drop's use on its card (src/shell/item-lore.js usesOf): what it fixes when set in a crafted piece in place of the gem. */
  guarantees: 'Guarantees {what} ({pieces})',
  grade_hallmarked: 'Hallmarked',
  /* What stops a row, the first thing missing, in the server's order. */
  requires: 'Requires {skill} {need}, have {have}',
  limit_hallmark: 'Daily limit: {limit} Hallmarks, resets at midnight UTC',
  limit_reforge: 'Daily limit: {limit} reforges, resets at midnight UTC',
  bars_short: 'Needs {bar} x{need}, have {have}',
  gem_short: 'Needs a {gem}. {where}Or buy one at the Weighhouse.',
  gold_short: 'Need {gold} more',
  /* What the hero holds of an input, bag and Storage together. */
  held: 'held {n}',
  held_storage: 'held {n}, {storage} in Storage',
  /* The section's lines. */
  day: 'Today: Hallmarks {hallmarks}/{limit}, reforges {reforges}/{limit}',
  reforge_head: 'Reforge',
  reforge_how: 'Hallmarked piece + next tier\'s bars and gem: both perks kept, no roll, no fail. Worn pieces: unequip first',
  /* One reforge row: what it becomes, the perks it keeps at the new size, what it takes. */
  reforge_name: '{from} → {to}',
  reforge_kept: 'Perks kept: {perks}',
  reforge_kept_worn: 'Perks kept: {perks}. Worn from Level {level}',
  reforge_uses: 'Uses it, {bar} x{bars} ({barHeld}), 1 {gem} ({gemHeld}).',
  reforge_go: 'Reforge for {gold}',
  /* The confirmation. */
  reforge_ask: 'Reforge {from}?\nCost: {gold}, {bar} x{bars}, 1 {gem}\nResult: {to}, permanent',
  reforge_note: 'Perks kept: {perks}\nUses the piece, the bars and the gem\nResult: tradeable',
  hallmark_note: 'Uses the Fine piece and the gem\nResult: tradeable',
  /* THE LUCKY JOB (src/data/luck.js; itemization plan §15 "On screen"): a plain ring + Lucky Rivets + the fee -> Fine, Lucky. */
  lucky_head: 'Lucky ring',
  lucky_how: 'Plain ring + Lucky Rivets: Fine with Lucky, no roll, no fail',
  lucky_name: 'Lucky ring, tier {tier}',
  lucky_what: '{rivets} Lucky Rivets, {gold}. Magic Find +{pct}%',
  lucky_uses: 'Uses your {ring} ({ringHeld}) and the rivets ({rivetHeld}).',
  rivets_short: 'Needs Lucky Rivets x{need}, have {have}',
  limit_lucky: 'Daily limit: {limit} Lucky rings, resets at midnight UTC',
  lucky_go: 'Make for {gold}',
  lucky_ask: 'Make {ring} Lucky?\nCost: {gold}, Lucky Rivets x{rivets}\nResult: {to}, permanent',
  lucky_note: 'Uses the ring and the rivets\nResult: tradeable. Magic Find +{pct}% for the hero who wears it',
});
