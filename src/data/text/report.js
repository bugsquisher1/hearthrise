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
  low: 'Lowest health {pct}% ({monster})',
  low_spell: 'Lowest health {pct}% ({monster}, {blow})',
  low_none: 'No damage taken',
  close: { one: '{count} close call under 25% health', other: '{count} close calls under 25% health' },
  close_none: 'No close calls',
  dry: 'Out of {item} at {time}',
  dry_some: 'Out of {item}',
  ran_gold_out: 'Hunt ended · Out of gold for supplies',
  ran_heals_out: 'Hunt ended · Out of food',
  ran_ammo_out: 'Hunt ended · Out of ammo',
  ran_runes_out: 'Hunt ended · Out of runes',
  death: 'Death cost {xp} Level XP',
  death_hours: 'Death cost {xp} Level XP (about {time} of hunting)',
  death_saved: 'Blessings saved {xp} Level XP',
  death_unblessed: 'No Blessing active',
  /* THE CAUSE LINE on the Danger scale (src/shell/hunt-report.js causeLine, lane R5): depth on the ground's band, never a step.
     {stance} Careful, Steady or Bold, {name} the hero, {pct} its health when the party fell back, {monster} what struck. */
  depth_held: 'Held Depth {depth} of {of} ({stance})',
  depth_held_top: 'Held Depth {depth} of {of} ({stance}), deepest reached',
  depth_deep: 'Deepest Depth {deep} of {of}',
  fell_none: 'Never fell back',
  fell_one: 'Fell back once · {name} at {pct}% ({monster})',
  fell_one_died: 'Fell back once · {name} killed by {monster}',
  fell_many: 'Fell back {count} times (last {name} at {pct}%, {monster})',
  fell_many_died: 'Fell back {count} times (last {name}, killed by {monster})',
  fell_many_more: 'Fell back {count}+ times (last {name} at {pct}%, {monster})',
  fell_many_more_died: 'Fell back {count}+ times (last {name}, killed by {monster})',
  fell_hero: 'Hero',
  fell_monster: 'unknown',
  /* THE EARNED LINE (src/shell/hunt-report.js earnedLine): the server's gold an hour and store supplies an hour, beside the Hunts window's estimate */
  earned: 'Gold/hr: {gold} · Supplies/hr: {supplies}',
  earned_only: 'Gold/hr: {gold}',
  /* THE LEDGER LINES (19-power-ledger L7; src/shell/hunt-report.js ledgerLines): the company's healing by source, damage taken by seat and
     the store's supplies an hour at each depth it held, from the server's report counters. {list} is parts joined by " · " */
  ledger_heal: 'Healing: {list}',
  ledger_took: 'Damage taken: {list}',
  ledger_part: '{what} {pct}%',
  ledger_seat: 'Seat {n}',
  ledger_sup: 'Supplies/hr at Depth {depth}: {gold}',

  /* THE RULES BLOCK */
  rules_head: 'What the bar did',
  fired: { one: '{what} used once', other: '{what} used {count} times' },
  fired_dealt: { one: '{what} used once · {pct}% of damage', other: '{what} used {count} times · {pct}% of damage' },
  fired_healed: { one: '{what} used once · {pct}% of healing', other: '{what} used {count} times · {pct}% of healing' },
  never: '{what} never used ({why})',
  why_never_true: 'condition never met',
  why_mana: 'not enough mana',
  why_cooldown: 'on cooldown',
  why_no_stock: 'none left',
  why_no_target: 'no target',
  why_out_of_range: 'out of range',
  why_gold_short: 'not enough gold',
  why_level: 'locked at this Level',
  changed: 'Slot {n} changed to {what} · {pct}% of {kind}',
  changed_was: 'Slot {n} changed to {what} · {pct}% of {kind} (was {was}%)',
  kind_d: 'damage',
  kind_h: 'healing',

  /* NEEDS YOU on the return card (designer D-2 section 2.3 rule 4: a new kind takes the band "costs progress", last in it) */
  needs_near: '{name} near death ({pct}% health, {monster})',
  needs_near_spell: '{name} near death ({pct}% health, {monster}, {blow})',
});
