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
});
