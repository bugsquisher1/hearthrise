// ════════════════════════════════════════════════════════════════════════
// src/data/text/bar.js — THE ACTION BAR'S WORDS: what a slot is, what it costs
// and why it waits (src/shell/action-facts.js, src/shell/cast-facts.js).
//
// One row per sentence, read by t('bar.<key>'). {weapons} is a weapon list
// ("Bow or Crossbow"), {waiting} the waiting_* sentence about a stock the
// backpack holds.
// ════════════════════════════════════════════════════════════════════════

export const BAR_TEXT = Object.freeze({
  /* The Configure action window's tabs (a rune spell is a spell: Tyler 2026-11-08), and the loaded-ammo slot's name. */
  tab_spells: 'Spells',
  tab_food: 'Food & drink',
  tab_ammo: 'Ammo',
  loaded_ammo: 'The loaded ammo',
  /* The fight settings' door to Settings > Effects (playtest v0.2.127: the effect sliders were found only in Settings). */
  effects_door: 'Effects',
  effects_door_label: 'Effect settings: how strongly spells, hits and danger marks show',
  /* The First target (src/shell/widgets/first-target.js; the Krell's Hold design's piece 4): the monster a hero goes for first on
     one ground, remembered per ground, so the line under it names the ground. Labels, not sentences (Tyler 2026-11-14). */
  first_target: 'First target',
  first_target_none: 'None',
  first_target_on: 'First target on {ground}',
  first_target_note_on: '{ground}: {monster} first',
  first_target_note_off: '{ground}: none set',
  /* the select is off until the server sends this hero's picks (say-why SW-2) */
  first_target_unknown: 'Waiting for server',

  /* What the worn weapon can shoot or cast. */
  shot_waits: '{need}, next ammo fires meanwhile',
  shot_whetstone: 'Whetstone, never fires',
  shot_rune: 'Rune, never fires',
  shot_nobody: 'No weapon shoots this, never fires',
  shot_wrong_weapon: 'Requires a {weapons}',
  shot_no_weapon: 'No weapon equipped',
  cast_wrong_weapon: 'Requires a {weapons}',

  /* What a spell does to whom (by the catalogue's target). */
  target_taunt: 'Taunts nearby monsters',
  target_mark: 'Marks the target',
  target_enemy: 'Hits the target',
  target_area: 'Hits monsters around the target',
  /* a line says how long it is, a ring how far it reaches and how many it can hit (the area abilities: Raking Shot, Turning Cut) */
  target_line: 'Hits every monster on a {len}-tile line',
  target_ring: 'Hits adjacent monsters',
  target_ring_max: 'Hits up to {max} adjacent monsters',
  target_ring_far: 'Hits monsters within {tiles} tiles',
  target_ring_far_max: 'Hits up to {max} monsters within {tiles} tiles',
  target_self: 'Self only',
  target_ally: 'Goes to the ally who needs it most.',
  target_party: 'Hero and nearby allies',
  target_ward: 'Shields the ally who needs it most.',
  /* a party shield (Shelter), and a ring that lands only its status (Frost Slam: the status's own words, one row a status) */
  target_party_shield: 'Shields every hero near you',
  target_status_ring_chill: 'Chills monsters next to you',

  /* A spell's effect lines. */
  effect_mark: 'Target takes {pct}% more damage for {secs} s',
  /* a spell hits for a share of your own blow (THE SPELL RULE, abilities.js hitPm, blowShare): half the share to the share, at its rune */
  effect_blow: 'Each monster hit: {lo}% to {hi}% of Max Hit',
  effect_blow_el: 'Each monster hit: {lo}% to {hi}% of Max Hit as {element}',
  effect_blow_line: 'On the line: {lo}% to {hi}% of Max Hit',
  effect_blow_line_el: 'On the line: {lo}% to {hi}% of Max Hit as {element}',
  effect_blow_ring: 'Each monster reached: {lo}% to {hi}% of Max Hit',
  effect_blow_ring_el: 'Each monster reached: {lo}% to {hi}% of Max Hit as {element}',
  effect_blow_enemy: 'Target: {lo}% to {hi}% of Max Hit',
  effect_blow_enemy_el: 'Target: {lo}% to {hi}% of Max Hit as {element}',
  effect_blow_enemy_hits: 'Target, {hits} times: {lo}% to {hi}% of Max Hit',
  effect_blow_enemy_hits_el: 'Target, {hits} times: {lo}% to {hi}% of Max Hit as {element}',
  /* a heal or a shell is a share of your own blow too; Mend heals a share of your max HP (abilities.js healPm, shieldPm, healHpPm) */
  effect_heal_blow: 'Heals {pct}% of Max Hit',
  effect_heal_hp: 'Heals {pct}% of your max HP',
  effect_shield_blow: 'Blocks damage up to {pct}% of Max Hit',
  /* what a status does to the monster it lands on, from its row (statuses.js durationMs, slowPm, takenPm) */
  effect_status: 'Causes {status}.',
  effect_status_for: 'Causes {status} for {secs} s.',
  effect_status_for_slow: 'Causes {status} for {secs} s, {pct}% slower attacks and casts',
  effect_status_for_taken: 'Causes {status} for {secs} s, {pct}% more damage taken',
  /* a spell that waits for a level in its own skill (abilities.js unlock), and its slot while the hero is under it */
  unlock: 'Unlocks at {skill} {level}.',
  unlock_wait: 'Requires {skill} {level}, now {have}',
  /* The new spell prompt (src/shell/spell-news.js, Tyler 2026-11-16): a level-up unlocked these moves for the weapon {hero} wears. A label,
     never a sentence: the hero as its prefix (up to four play at once and the line's Add acts on that hero's bar), then the names. */
  new_spell: { one: '{hero}: New spell {names}', other: '{hero}: New spells {names}' },
  cost_mana: '{mana} mana',
  cost_no_mana: 'No mana',
  cost_rune: '1 {rune}',
  cost_ammo: '{ammo} ammo',
  cooldown: '{secs} s cooldown',
  requires_any: 'Works with any weapon.',
  requires: 'Works with {weapons}.',
  /* {weapons} for a move every melee weapon holds (Power Strike), and one every melee weapon but the tank's holds (Turning Cut,
     Tyler 2026-11-16: "all melee that doesn't have a shield on") */
  weapons_melee: 'Melee weapon',
  weapons_melee_no_shield: 'Melee weapon (no shield)',

  /* Food, drink and ammo. */
  spread: 'Half lands at once, the rest over {secs} s.',
  type_drink: 'Drink: restores mana.',
  type_food: 'Food: restores health.',
  restores_mana: 'Restores {amount} mana.',
  restores_health: 'Restores {amount} health.',
  type_loaded: 'Ammo: uses the loaded ammo',
  type_ammo: 'Ammo: one used each shot',

  /* WHAT ONE USE COSTS, its one line (Tyler 2026-11-08, "Yes, cost line only"; src/shell/cast-facts.js costLine): the mana, then
     the rune, food, drink or shot the next use spends, at the store's price, as many as you have, or none left. */
  cost_line: 'Cost: {parts}',
  cost_price: '1 {item} ({price} g)',
  cost_have: '1 {item}, {n} left',
  cost_none: '1 {item}, none left',
  cost_shot_price: '1 shot of {item} ({price} g)',
  cost_shot_have: '1 shot of {item}, {n} left',
  cost_shot_none: '1 shot of {item}, none left',
  cost_shot_free: '1 shot of {item}, never runs out',
  /* a spell's rune when no tier of it can be had: the family's ("1 Earth Rune (none left)") */
  family_rune: '{family} Rune',
  /* A rune spell's supply in Configure action (src/shell/rune-supply.js; Tyler 2026-11-08, RUNE SUPPLY PER SLOT). */
  runes_use: 'Use carried runes',
  runes_none: 'No {family} runes',
  runes_needs: 'Needs {needs}',
  runes_when: 'When runes run out',
  runes_buy: 'Buy from the rune shop',
  runes_leave: 'Leave the hunt',
  runes_shop_only: 'Buys a shop rune every cast',
  shop_rune: '{name}, {price} g each, {out}',
  shop_rune_plain: '{name}, {price} g each',
  shop_rune_short: '{name}, {price} g each, needs {needs}',
  /* What one cast lands for this hero (cast-facts.js outputWords). */
  out_blow: '{lo}–{hi}% of Max Hit',
  out_heal_blow: 'heals {pct}% of Max Hit',
  out_heal_hp: 'heals {pct}% of max HP',
  out_shield_blow: 'shields {pct}% of Max Hit',

  /* A slot's setup, and what another slot does to it. */
  setup_any: 'Any of: {conditions}.',
  setup_when: 'When {conditions}.',
  /* A monster's biggest hit is called Max Hit wherever the game shows it, as on its page (Tyler 2026-11-11). */
  heal_warning_hit: 'Max Hit {hit}',
  heal_warning_hp: 'HP {hp}',
  heal_warning_eat: 'Eat earlier',
  heal_warning_heal: 'Heal earlier',
  blocked_by: 'Never fires: {action} in slot {slot} does the same and goes first',
  shared_cooldown: 'Waits for {action} in slot {slot} when both are ready',
  holding: 'Holding the pack, nothing to Challenge',
  /* A spell that casts only while its hero hunts alone (abilities.js `alone`, Undertow): its card, its tooltip, its greyed slot in a
     party, and Configure action's line in a party (Tyler 2026-11-09: "Make that callout clear to the player"). */
  alone: 'Solo only',
  alone_party: 'Solo only, does nothing in a party',
  /* Its mirror (abilities.js `party`, the tank's rune spells, Tyler 2026-11-19: "Tank spells should be party only"): the card, the tooltip,
     the greyed slot while the hero hunts alone, and Configure action's line for a hero with no party. */
  party_only: 'Party only',
  party_only_alone: 'Party only, does nothing alone',

  /* Why a slot cannot fire now. */
  waiting: { one: '{n} in backpack, press to carry it in', other: '{n} in backpack, press to carry them in' },
  waiting_item: { one: '{n} {item} in backpack, press to carry it in', other: '{n} {item} in backpack, press to carry them in' },
  unknown_ability: 'This ability isn’t in the game.',
  inactive: 'Not in the game yet: {ability} waits on its rune.',
  no_weapon_any: 'No weapon equipped',
  no_weapon: 'No weapon equipped',
  weapon_cant_use: 'Requires {weapons}',
  rune_needs_a: 'No {rune}: pick the store rune',
  rune_needs_an: 'No {rune}: pick the store rune',
  rune_needs_a_packed: 'No {rune} in this hunt, {waiting}',
  rune_needs_an_packed: 'No {rune} in this hunt, {waiting}',
  rune_leaves: 'No runes selected: hero leaves the hunt on cast',
  rune_leaves_packed: 'No selected runes in this hunt, {waiting}',
  no_shot: 'No ammo: put arrows or bolts on the bar',
  rune_level: 'Can\'t cast {runes} yet: carry a lower tier',
  store_level: 'Store rune too high, pick a lower one',
  store_level_named: '{name} requires {needs}, pick a lower rune',
  server_refused: 'This can’t fire right now.',
  mana_short: 'Needs {mana} mana, have {have}',
  none_in_hunt: 'None in this hunt, {waiting}',
  none_left: 'Out of {item}: next food or drink slot takes over',
  store_off: 'Set to leave the hunt instead of buying',
  /* A store food under what this ground is measured safe on (supplies.js storeFloorFor), while the hero hunts there: the slot still fires.
     The prep page's shape (prep.food_weak); {heal} what one {food} heals, {hp} the hero's full HP. */
  food_weak: '{food} heals too little here. Pick {want}',
  food_weak_hp: '{food} heals {heal} of {hp} HP. Pick {want}',
  out_store_off: 'Out, set to leave instead of buying',
  out_no_store: 'Out, store doesn\'t sell it',

  /* Configure action's table (src/shell/action-table.js): its columns and runs, a row's cells, the slot's sentence, a
     row against the picked one, what a big heal wastes, where a row's uses come from. */
  col_heals: 'Heals',
  col_gold: 'Gold',
  /* (one line each, UI audit 2026-11-18: "g per HP, cheapest first" stood four lines tall over a phone's list; the column's
     bold numbers show the order) */
  col_per_hp: 'g per HP',
  col_carry: 'Carried',
  col_mana: 'Mana',
  col_per_mana: 'g per mana',
  col_damage: 'Damage',
  col_per_shot: 'g per shot',
  col_cooldown: 'Cooldown',
  col_rune: 'Rune',
  /* the name column's head where its run has no name of its own (Spells; a run's name heads it: Food, Drink) */
  col_name: 'Name',
  /* a locked row's skill wait, after its lock (action-facts.js rowNeed): "Melee 10" */
  row_need_level: '{skill} {level}',
  /* the details pane of an empty slot, by tab, until a row is pointed at or picked (action-table.js pickHint) */
  pick_spells: 'Pick a spell to see what it does',
  pick_food: 'Pick a food or drink to see what it does',
  pick_ammo: 'Pick ammo to see what it does',
  run_food: 'Food',
  run_drink: 'Drink',
  run_ammo: 'Arrows and bolts',
  secs: '{secs} s',
  no_spells: 'No spells in the game yet.',
  no_food: 'No food or drink in the game yet.',
  cell_store: 'store',
  cell_none: 'none',
  verb_cast: 'Cast',
  verb_shoot: 'Shoot with',
  verb_drink: 'Drink',
  verb_eat: 'Eat',
  the_loaded_ammo: 'the loaded ammo',
  note_loaded: 'Worn ammo first, then the store',
  note_shot: 'After worn ammo, then the store',
  cmp_hp_use: '{diff} HP a use',
  cmp_mana_use: '{diff} mana a use',
  cmp_gold_use: '{diff} gold a use',
  cmp_gold_per_hp: '{ratio}× the gold per HP',
  cmp_gold_per_mana: '{ratio}× the gold per mana',
  waste_hp: 'At {pct}%: only {missing} HP missing, {lost} of {amount} wasted',
  waste_mana: 'At {pct}%: only {missing} mana missing, {lost} of {amount} wasted',
  effect_food: 'Half now, rest over {secs} s. Food and drink cooldown: {lane} s',
  effect_drink: 'Half now, rest over {secs} s. Food and drink cooldown: {lane} s',
});
