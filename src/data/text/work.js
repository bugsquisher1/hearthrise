// ════════════════════════════════════════════════════════════════════════
// src/data/text/work.js — THE GATHERING AND CRAFTING WINDOW'S WORDS (src/shell/windows/work.js).
//
// One row per sentence or label, read by t('work.<key>'). The rest of the
// window's words still sit in its code (tests/text-home.mjs ratchets them down);
// what is here moved first: the Sort menu over a crafting station's recipes
// (src/shell/station-sort.js; Andy, Discord 2026-11-11).
// ════════════════════════════════════════════════════════════════════════

export const WORK_TEXT = Object.freeze({
  /* The menu's label, and its three orders: what the bag can make first (the default), the required level low to high, the name A to Z. */
  sort_can: 'Can make',
  sort_level: 'Level',
  sort_name: 'Name',
  /* The bag's line for a counted bench run (src/shell/town-work.js runParts byRun): what the run has to go, never the stock behind it
     ("Fueling the Great Hearth with Bones: 1 to go" for one Bone fed, live v0.2.135 read "2,529 Bones left"). */
  run_to_go: '{n} to go',
  /* THE WORK LINE OVER THE ROWS (src/shell/town-work.js nowParts): a counted run says its own count, never the stock behind it (Andy
     2026-11-18: a run of 300 read "8,300 Blank Rune left. Stops when materials run out"). The server's count left, of the run's whole
     count when the server sends its tally; the stop sentence only where the bag and Storage stop it, or the job runs until stopped. */
  now_left_of: '{n} of {count} left',
  now_left: '{n} left',
  now_stops_out: 'Stops when materials run out',
  now_gather: 'Runs offline until a hunt starts',
  /* THE LINE WHEN A BENCH RUN FINISHES IN VIEW (src/shell/town-news.js; QA audit 2026-11-18 A17: "Fuel all" ended with no word): what it
     made or burned, the server's count, then the skill's level as a label. */
  done_made: '{name} made {count} {item}.',
  /* ...a run whose crafts can burn or roll grades (Cooking, jewelry): the run's tally counts crafts, so no number is said */
  done_run: '{name} finished making {item}.',
  done_fuel: '{name} fueled the Great Hearth with {count} {item}.',
  done_level: '{skill} {level}.',
  /* A skill ledger's unlock line (src/shell/windows/skills.js unlockLine, the Character sheet's combat skills too): the first thing
     the next level opens, and how many more it opens (all of them, with their kinds, are the line's tooltip). */
  skill_next: 'Lv {level}: {name}',
  skill_more: '+{count} more',
  /* A recipe or node row (src/shell/windows/work.js): the Level it needs by Start, one line of numbers, and how many the bag and Storage
     cover. Who won't buy what it makes is a short tag on the numbers line, its sentence (text/item.js) on the pointer. */
  row_level: 'Lv {level}',
  row_time_xp: '{secs} s · {xp} XP',
  row_per_hour: 'about {n} an hour',
  row_burn: 'burns up to {pct}%',
  row_makes: 'Makes up to {n}',
  row_makes_of: 'Makes {n} of up to {max}',
  sale_shop: 'Shop only',
  sale_none: 'Can\'t be sold',
  /* What a row makes against what the hero wears (src/shell/bench-output.js; itemization audit 2026-11-18 #1): its stats, each with its
     change against the piece in its slot, then which piece that is, or that it changes nothing, the slot is bare, or it is worn now. */
  is_vs: 'vs {worn}',
  is_same: 'Same as {worn}',
  is_worn: 'Worn now',
  is_empty: 'Empty {slot} slot',
  /* The station's whole ladder past the rows in full: one rung a Level, what it opens. */
  ladder_head: 'Unlocks',
  /* The bench fee the picked count takes before Start (src/shell/bench-fee.js feeLineWords), with its share of the purse from 10% up. */
  fee_all: '{gold} gold for all {n}',
  fee_n: '{gold} gold for {n}',
  fee_share: '({pct}% of your gold)',
});
