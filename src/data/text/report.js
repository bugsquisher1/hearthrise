// ════════════════════════════════════════════════════════════════════════
// src/data/text/report.js — THE HUNT REPORT'S WORDS (GR-66, free to every player; src/shell/hunt-report.js, the Needs you row
// src/shell/needs-you/near-death.js).
//
// One row per sentence or label, read by t('report.<key>'). The report prints what happened on this hunt, from the server's
// counters: how close it came to a death, then what each rule on the bar did. It never predicts a death rate from one hunt.
// {pct} is a whole percent, {monster} a monster's name, {blow} the spell that struck (a swing has its own line), {what} a bar slot's
// ability or item, {time} a span ("1 h 12 min"), {n} a bar slot's number counted from 1.
// ════════════════════════════════════════════════════════════════════════

export const REPORT_TEXT = Object.freeze({
  /* THE RISK BLOCK: its head carries the one word */
  risk_head: 'How close it came',
  word_safe: 'Safe',
  word_close: 'Close',
  word_near: 'Near death',
  /* the house's own voice for a blow (src/hunt-view/death-explain.js: "came from a Rat", "from Barn Spider's Venom Spray") */
  low: 'Lowest health {pct}%, from a {monster}.',
  low_spell: 'Lowest health {pct}%, from {monster}\'s {blow}.',
  low_none: 'Nothing landed a blow.',
  close: { one: '{count} close call under a quarter of health.', other: '{count} close calls under a quarter of health.' },
  close_none: 'No close calls.',
  dry: 'Ran out of {item} {time} in.',
  dry_some: 'Ran out of {item}.',
  ran_gold_out: 'Ran out of gold to buy supplies, and the hunt ended.',
  ran_heals_out: 'Ran out of food, and the hunt ended.',
  ran_ammo_out: 'Ran out of ammo, and the hunt ended.',
  ran_runes_out: 'Ran out of runes, and the hunt ended.',
  death: 'Died and lost {xp} Level XP.',
  death_hours: 'Died and lost {xp} Level XP, about {time} of hunting.',
  death_saved: 'Blessings saved {xp} Level XP.',
  death_unblessed: 'No Blessing was on.',

  /* THE RULES BLOCK */
  rules_head: 'What the bar did',
  fired: { one: '{what} fired once.', other: '{what} fired {count} times.' },
  fired_dealt: { one: '{what} fired once and did {pct}% of the damage.', other: '{what} fired {count} times and did {pct}% of the damage.' },
  fired_healed: { one: '{what} fired once and did {pct}% of the healing.', other: '{what} fired {count} times and did {pct}% of the healing.' },
  never: '{what} never fired because {why}.',
  why_never_true: 'its condition was never true',
  why_mana: 'there was not enough mana',
  why_cooldown: 'it was still cooling down',
  why_no_stock: 'there was none left to use',
  why_no_target: 'there was no target',
  why_out_of_range: 'the target was out of reach',
  why_gold_short: 'there was not enough gold',
  why_level: 'it is still locked at this Level',
  changed: 'You changed slot {n}. {what} did {pct}% of the {kind}.',
  changed_was: 'You changed slot {n}. {what} did {pct}% of the {kind}. It was {was}%.',
  kind_d: 'damage',
  kind_h: 'healing',

  /* NEEDS YOU on the return card (designer D-2 section 2.3 rule 4: a new kind takes the band "costs progress", last in it) */
  needs_near: '{name} nearly died, down to {pct}% health from a {monster}.',
  needs_near_spell: '{name} nearly died, down to {pct}% health from {monster}\'s {blow}.',
});
