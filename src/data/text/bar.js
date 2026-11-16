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
  shot_waits: '{need}. This slot waits until then, and your next ammo fires.',
  shot_whetstone: 'Not a shot (sharpens a Melee weapon worn as ammo), never fires',
  shot_rune: 'Not a shot (runes fuel spells), never fires',
  shot_nobody: 'No weapon shoots this, so this slot never fires.',
  shot_wrong_weapon: 'Your weapon can’t shoot this. It works once you hold a {weapons}.',
  shot_no_weapon: 'You have no weapon on. This works once you hold a {weapons}.',
  cast_wrong_weapon: 'Your weapon can’t cast this. It works once you hold a {weapons}.',

  /* What a spell does to whom (by the catalogue's target). */
  target_taunt: 'Makes the monsters near you attack you.',
  target_mark: 'Marks your target.',
  target_enemy: 'Hits your target.',
  target_area: 'Hits the monsters around your target.',
  /* a line says how long it is, a ring how far it reaches and how many it can hit (the area abilities: Raking Shot, Turning Cut) */
  target_line: 'Hits every monster on a {len}-tile line through your target',
  target_ring: 'Hits the monsters beside you.',
  target_ring_max: 'Hits up to {max} monsters beside you.',
  target_ring_far: 'Hits the monsters within {tiles} tiles of you.',
  target_ring_far_max: 'Hits up to {max} monsters within {tiles} tiles of you.',
  target_cleave: 'Hits the monsters in front of you.',
  target_self: 'Works on you only.',
  target_ally: 'Goes to the ally who needs it most.',
  target_party: 'You and everyone near you get it.',
  target_ward: 'Shields the ally who needs it most.',

  /* A spell's effect lines. */
  effect_mark: 'Your target takes {pct}% more damage for {secs} s.',
  effect_dmg: 'Deals {lo}–{hi} damage.',
  effect_dmg_el: 'Deals {lo}–{hi} {element} damage.',
  effect_dmg_area: 'Deals {lo}–{hi} damage to each monster hit.',
  effect_dmg_area_el: 'Deals {lo}–{hi} {element} damage to each monster hit.',
  effect_dmg_max: 'Deals {lo}–{hi} damage to up to {max} monsters.',
  effect_dmg_max_el: 'Deals {lo}–{hi} {element} damage to up to {max} monsters.',
  effect_dmg_hits: 'Deals {lo}–{hi} damage, {hits} times.',
  effect_dmg_hits_el: 'Deals {lo}–{hi} {element} damage, {hits} times.',
  /* a spell that hits for a share of your own blow (abilities.js hitPm, blowShare): half the share to the share */
  effect_blow: 'Each monster hit: {lo}% to {hi}% of your Max Hit',
  effect_blow_el: 'Each monster hit: {lo}% to {hi}% of your Max Hit as {element}',
  effect_blow_line: 'On the line: {lo}% to {hi}% of your Max Hit',
  effect_blow_line_el: 'On the line: {lo}% to {hi}% of your Max Hit as {element}',
  effect_blow_ring: 'Each monster reached: {lo}% to {hi}% of your Max Hit',
  effect_blow_ring_el: 'Each monster reached: {lo}% to {hi}% of your Max Hit as {element}',
  effect_blow_enemy: 'Target: {lo}% to {hi}% of your Max Hit',
  effect_blow_enemy_el: 'Target: {lo}% to {hi}% of your Max Hit as {element}',
  effect_heal: 'Heals {lo}–{hi}.',
  effect_shield: 'Blocks the next {points} damage.',
  /* what a status does to the monster it lands on, from its row (statuses.js durationMs, slowPm, takenPm) */
  effect_status: 'Causes {status}.',
  effect_status_for: 'Causes {status} for {secs} s.',
  effect_status_for_slow: 'Causes {status} for {secs} s ({pct}% slower swings and windups)',
  effect_status_for_taken: 'Causes {status} for {secs} s (takes {pct}% more damage)',
  /* a spell that waits for a level in its own skill (abilities.js unlock), and its slot while the hero is under it */
  unlock: 'Unlocks at {skill} {level}.',
  unlock_wait: 'Requires {skill} {level} (you: {have}), waits until then',
  cost_mana: '{mana} mana',
  cost_no_mana: 'No mana',
  cost_rune: '1 {rune}',
  cost_ammo: '{ammo} ammo',
  cooldown: '{secs} s cooldown',
  requires_any: 'Works with any weapon.',
  requires: 'Works with {weapons}.',

  /* Food, drink and ammo. */
  spread: 'Half lands at once, the rest over {secs} s.',
  type_drink: 'Drink: restores mana.',
  type_food: 'Food: restores health.',
  restores_mana: 'Restores {amount} mana.',
  restores_health: 'Restores {amount} health.',
  type_loaded: 'Ammo: your attacks use whatever you have loaded.',
  type_ammo: 'Ammo: your attacks use it, one per shot.',

  /* WHAT ONE USE COSTS, its one line (Tyler 2026-11-08, "Yes, cost line only"; src/shell/cast-facts.js costLine): the mana, then
     the rune, food, drink or shot the next use spends, at the store's price, as many as you have, or none left. */
  cost_line: 'Cost: {parts}',
  cost_price: '1 {item} ({price} g)',
  cost_have: '1 {item} (you have {n})',
  cost_none: '1 {item} (none left)',
  cost_shot_price: '1 shot of {item} ({price} g)',
  cost_shot_have: '1 shot of {item} (you have {n})',
  cost_shot_none: '1 shot of {item} (none left)',
  cost_shot_free: '1 shot of {item} (they never run out)',
  /* a spell's rune when no tier of it can be had: the family's ("1 Earth Rune (none left)") */
  family_rune: '{family} Rune',
  /* A rune spell's supply in Configure action (src/shell/rune-supply.js; Tyler 2026-11-08, RUNE SUPPLY PER SLOT). */
  runes_use: 'Use carried runes',
  runes_none: 'You don’t have any {family} runes.',
  runes_needs: 'Needs {needs}',
  runes_when: 'When your runes run out',
  runes_buy: 'Buy from the rune shop',
  runes_leave: 'Leave the hunt',
  runes_shop_only: 'You buy a rune from the shop for every cast.',
  shop_rune: '{name}, {price} g each, {out}',
  shop_rune_plain: '{name}, {price} g each',
  shop_rune_short: '{name}, {price} g each, needs {needs}',
  /* What one cast lands for this hero (cast-facts.js outputWords). */
  out_dmg: '{lo}–{hi} damage',
  out_heal: 'heals {lo}–{hi}',
  out_shield: 'shields {points}',

  /* A slot's setup, and what another slot does to it. */
  setup_any: 'Any of: {conditions}.',
  setup_when: 'When {conditions}.',
  /* A monster's biggest hit is called Max Hit wherever the game shows it, as on its page (Tyler 2026-11-11). */
  heal_warning_hit: 'Max Hit {hit}',
  heal_warning_hp: 'Your HP {hp}',
  heal_warning_eat: 'Eat earlier',
  heal_warning_heal: 'Heal earlier',
  blocked_by: 'Never fires: {action} in slot {slot} does the same and goes first',
  shared_cooldown: 'Waits for {action} (slot {slot}) when both are ready.',
  holding: 'You’re holding the pack, so there’s nothing to Challenge.',
  /* A spell that casts only while its hero hunts alone (abilities.js `alone`, Undertow): its card, its tooltip, its greyed slot in a
     party, and Configure action's line in a party (Tyler 2026-11-09: "Make that callout clear to the player"). */
  alone: 'Only when you hunt alone.',
  alone_party: 'Only when you hunt alone. It does nothing in a party.',

  /* Why a slot cannot fire now. */
  waiting: { one: '{n} in your backpack (press this slot to carry it in)', other: '{n} in your backpack (press this slot to carry them in)' },
  waiting_item: { one: '{n} {item} in your backpack (press this slot to carry it in)', other: '{n} {item} in your backpack (press this slot to carry them in)' },
  unknown_ability: 'This ability isn’t in the game.',
  inactive: 'Not in the game yet: {ability} waits on its rune.',
  no_weapon_any: 'You have no weapon on. Put on any weapon to use this.',
  no_weapon: 'Requires {weapons} (spells come from your weapon)',
  weapon_cant_use: 'Your weapon can’t use this. Needs {weapons}.',
  rune_needs_a: 'No {rune} (one each cast). Pick the store\'s rune to buy them',
  rune_needs_an: 'No {rune} (one each cast). Pick the store\'s rune to buy them',
  rune_needs_a_packed: 'No {rune} in this hunt (one each cast). {waiting}',
  rune_needs_an_packed: 'No {rune} in this hunt (one each cast). {waiting}',
  rune_leaves: 'No ticked runes (your hero leaves the hunt when it casts)',
  rune_leaves_packed: 'No ticked runes in this hunt. {waiting}',
  no_shot: 'Nothing to shoot. Put arrows or bolts on the bar (Ammo)',
  rune_level: 'Can\'t cast {runes} yet (carry a lower tier or the store\'s rune)',
  store_level: 'Store rune too high (pick a lower one or carry your own)',
  store_level_named: '{name} requires {needs}. Pick a lower rune or carry your own',
  server_refused: 'This can’t fire right now.',
  mana_short: 'Needs {mana} mana, you have {have}.',
  none_in_hunt: 'None in this hunt. {waiting}',
  none_left: 'You’re out of {item}. Your next food or drink slot takes over.',
  store_off: 'You chose to leave the hunt instead of buying from the store.',
  out_store_off: 'Out (you chose to leave instead of buying)',
  out_no_store: 'You’re out, and the store doesn’t sell it.',

  /* Configure action's table (src/shell/action-table.js): its columns and runs, a row's cells, the slot's sentence, a
     row against the picked one, what a big heal wastes, where a row's uses come from. */
  col_heals: 'Heals',
  col_gold: 'Gold',
  col_per_hp: 'g per HP, cheapest first',
  col_carry: 'You carry',
  col_mana: 'Mana',
  col_per_mana: 'g per mana, cheapest first',
  col_damage: 'Damage',
  col_per_shot: 'g per shot, cheapest first',
  col_cooldown: 'Cooldown',
  col_rune: 'Rune',
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
  note_loaded: '(worn ammo first, the store sells only once you run out)',
  note_shot: '(after worn ammo unless conditioned, the store only once you run out)',
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
