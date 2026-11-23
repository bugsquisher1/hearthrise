// ════════════════════════════════════════════════════════════════════════
// src/data/text/factions.js — THE FIRST FLAME AND THE LAST EMBER, IN WORDS (the join prompt src/shell/windows/faction-join.js, the
// Character window's Faction tab src/shell/windows/character/faction.js, src/shell/faction-words.js).
//
// One row per sentence, read by t('factions.<key>'). Labels read as labels (Tyler 2026-11-14: "Standing: 12 h", "Swap: 4 h 10 m
// left", "Next swap: in 3 days"). The only lore lines are Holly's and Venn's own spoken words (the `said_` rows), and every name in
// them is a placeholder filled from src/data/text/people.js. Every number is the server's (the `factions` section, a refusal's figures).
// ════════════════════════════════════════════════════════════════════════

export const FACTIONS_TEXT = Object.freeze({
  /* The two sides, by the server's ids (src/data/grounds/shape.js STANDING_SIDES). */
  side_first_flame: 'First Flame',
  side_last_ember: 'Last Ember',
  side_unknown: 'Another side',
  card_title: 'The {side}',
  motto_first_flame: 'Preserve what was',
  motto_last_ember: 'Forge what comes next',

  /* The join prompt's opening line (@sentence: the March's story, lore). */
  join_lead: 'Two sides are heading up the road to Morrow. Neither one is evil, and Havora belongs to neither.',

  /* The join prompt. Its terms are labels, above the Join presses, in the order they happen (the faction QA 2026-11-19 #2, #7): the
     side lock starts the moment a hero joins, and a swap is hunting time on the new side's grounds. A Join press asks first. */
  term_cost: 'Cost: free',
  term_limits: 'Grounds and parties: open to both sides',
  term_rewards: 'Standing unlocks: outfits',
  term_lock: 'Side lock: {days} from joining',
  term_swap: 'Swap cost: {time} on the new side\'s grounds',
  join_press: 'Join the {side}',
  confirm_join: 'Join the {side}?',
  confirm_lock: 'Side lock: {days} from now',
  press_confirm: 'Confirm',
  press_back: 'Back',
  not_now: 'Not now',
  close: 'Close',
  later: 'Pick later: Character → Faction (C)',
  busy_join: 'Joining…',
  joined: 'Joined the {side}',

  /* What Holly and Venn say. Their words only (@sentence: NPC talk is lore). */
  said_holly_join: '{rowe} is too old for the road now, so it\'s me. I\'m going up to Morrow to put that coal out and give those people a proper rest. Walk with me if you want to help.',
  said_venn_join: 'The old way is what got my company killed. I\'m not putting it back. We\'re taking Morrow for the people who dig it and fight for it. {harry} has the cart loaded.',
  said_holly_swap: 'You want in? Then keep a vigil with us first, on our ground. After that you\'re one of us.',
  said_venn_swap: 'You\'ll have to prove it on our ground first. Then we\'ll talk.',

  /* The Faction tab. */
  tab: 'Faction',
  side: 'Side: {side}',
  side_none: 'Side: none',
  neutral_locked: 'Unlocks after: Lord Krell',
  neutral_open: 'Joining: open',
  press_choose: 'Choose a side',
  standing_head: 'Standing',
  standing: 'Standing: {time}',
  standing_note: 'Earned on: your side\'s grounds',
  standing_kept: 'Kept after a swap',
  swap_head: 'Swap',
  /* during a swap the hero is still on its side: its own grounds pay its standing, the new side's grounds pay swap time only (the
     board's 2026-11-14 Morrow Hills §6, hr_faction_credit; the faction QA 2026-11-19 #3) */
  swap_to: 'Swapping to: {side}',
  swap_earns: 'Swap time from: {side} grounds',
  swap_left: 'Swap: {time} left',
  swap_done: 'Swap: ready to finish',
  swap_cost: 'Swap cost: {time} on {side} grounds',
  confirm_swap: 'Swap to the {side}?',
  confirm_swap_lock: 'Side lock: {days} after the swap',
  press_cancel_swap: 'Cancel swap',
  confirm_cancel: 'Cancel the swap?',
  cancel_loses: 'Swap time lost: {time}',
  busy_cancel: 'Canceling the swap…',
  swap_cancelled: 'Swap canceled',
  next_swap_days: { one: 'Next swap: in {count} day', other: 'Next swap: in {count} days' },
  next_swap_soon: 'Next swap: in {time}',
  next_swap_ready: 'Next swap: ready',
  press_swap: 'Swap to the {side}',
  press_finish: 'Finish swap',
  busy_swap: 'Starting the swap…',
  busy_finish: 'Finishing the swap…',
  swap_started: 'Swap to the {side} started',
  swapped: 'Now with the {side}',
  pieces_head: 'Outfit pieces',
  piece_flamebearer: 'Flamebearer',
  piece_flamebearer_shield: 'Hearth Shield',
  piece_flamebearer_light: '{holly}\'s Light',
  piece_emberkeeper: 'Emberkeeper',
  piece_emberkeeper_lantern: '{harry}\'s Lantern',
  piece_emberkeeper_coal: 'Kept Coal',
  piece_unknown: 'Outfit piece',
  piece_needs: 'Unlocks at: {time} {side} standing',
  /* The Outfit tab's faction looks (the designer 2026-11-18): a locked outfit's or add-on's requirement, from the server's own number;
     the outfit's one card picks its add-on, each by a short name. */
  look_requires: 'Requires {side} standing: {time}',
  addon_head: 'Add-on',
  addon_none: 'None',
  addon_flamebearer_shield: 'Shield',
  addon_flamebearer_light: 'Light',
  addon_emberkeeper_lantern: 'Lantern',
  addon_emberkeeper_coal: 'Coal',
  addon_unknown: 'Add-on',
  /* the side a ground pays standing to, on its Hunts page (a hunt row's standingFor), and what a hunt earned, on its summary */
  ground_side: 'Standing: {side}',
  summary_standing: '{side} standing +{time}',
  /* the Outfit tab's title for a worn look this client has no row for */
  look_unknown: 'Outfit',
  piece_held: 'Claimed',
  press_claim: 'Claim',
  busy_claim: 'Claiming…',
  claimed: '{piece} claimed',

  /* Refusals that carry the server's numbers. */
  short_standing: '{piece}: requires {need} {side} standing (have {have})',
  short_swap: 'Swap: requires {need} on their grounds (done {have})',
  cooldown: 'Recently swapped · Next swap: {time}',
  /* a span under a minute, as the labels read it ("Standing: 0 h") */
  no_time: '0 h',
  days: { one: '{count} day', other: '{count} days' },
});
