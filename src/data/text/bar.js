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

  /* What the worn weapon can shoot or cast. */
  shot_waits: '{need}. This slot waits until then, and your next ammo fires.',
  shot_whetstone: 'A whetstone is not a shot. It sharpens a Melee weapon worn in the ammo slot. No weapon shoots it, so this slot never fires.',
  shot_rune: 'A rune isn’t a shot. It fuels your spells. No weapon shoots it, so this slot never fires.',
  shot_nobody: 'No weapon shoots this, so this slot never fires.',
  shot_wrong_weapon: 'Your weapon can’t shoot this. The slot stays struck until you wield a {weapons}.',
  shot_no_weapon: 'No weapon worn. The slot stays struck until you wield a {weapons}.',
  cast_wrong_weapon: 'Your weapon can’t cast this. The slot stays struck until you wield a {weapons}.',

  /* What a spell does to whom (by the catalogue's target). */
  target_taunt: 'Taunt: pulls the monsters near you onto you.',
  target_mark: 'Mark: marks your current target.',
  target_enemy: 'Attack spell: casts on your current target.',
  target_area: 'Area spell: hits the monsters round your target.',
  target_cleave: 'Cleave: hits the monsters in front of you.',
  target_self: 'Self spell: casts on yourself.',
  target_ally: 'Heal: casts on the ally who needs it most.',
  target_party: 'Group heal: heals everyone near you.',
  target_ward: 'Ward: shields the ally who needs it most.',

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
  effect_heal: 'Heals {lo}–{hi}.',
  effect_shield: 'A {points}-point shield.',
  effect_status: 'Causes {status}.',
  cost_mana: '{mana} mana',
  cost_no_mana: 'No mana',
  cost_rune: '1 {rune}',
  cost_ammo: '{ammo} ammo',
  cooldown: '{secs} s cooldown',
  requires_any: 'Requires: any weapon.',
  requires: 'Requires: {weapons}.',

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
  runes_none: 'You carry no {family} runes.',
  runes_needs: 'Needs {needs}',
  runes_when: 'When your runes run out',
  runes_buy: 'Buy from the rune shop',
  runes_leave: 'Leave the hunt',
  runes_shop_only: 'Every cast buys from the rune shop.',
  shop_rune: '{name} · {price} g each · {out}',
  shop_rune_plain: '{name} · {price} g each',
  shop_rune_short: '{name} · {price} g each · needs {needs}',
  /* What one cast lands for this hero (cast-facts.js outputWords). */
  out_dmg: '{lo}–{hi} damage',
  out_heal: 'heals {lo}–{hi}',
  out_shield: 'shields {points}',

  /* A slot's setup, and what another slot does to it. */
  setup_any: 'Any of: {conditions}.',
  setup_when: 'When {conditions}.',
  heal_warning_eat: 'The {monster} can hit for {hit}. At {pct}% you have {hp} HP, so one hit can kill you before you eat.',
  heal_warning_heal: 'The {monster} can hit for {hit}. At {pct}% you have {hp} HP, so one hit can kill you before you heal.',
  blocked_by: 'Blocked by {action} (slot {slot}): the same action, and it fires first whenever this one could.',
  shared_cooldown: 'Shares a cooldown with {action} (slot {slot}), which fires first when both are ready.',
  holding: 'Holding the pack: nothing to Challenge.',

  /* Why a slot cannot fire now. */
  waiting: { one: '{n} waits in your backpack. Press this slot to carry it in.', other: '{n} wait in your backpack. Press this slot to carry them in.' },
  waiting_item: { one: '{n} {item} waits in your backpack. Press this slot to carry it in.', other: '{n} {item} wait in your backpack. Press this slot to carry them in.' },
  unknown_ability: 'The server does not know this ability.',
  inactive: 'Not in the game yet: {ability} waits on its rune.',
  no_weapon_any: 'No weapon worn: abilities come from the weapon you wield. Needs any weapon.',
  no_weapon: 'No weapon worn: abilities come from the weapon you wield. Needs {weapons}.',
  weapon_cant_use: 'Your weapon can’t use this. Needs {weapons}.',
  rune_needs_a: 'Needs a {rune} for each cast: you carry none. Pick the store’s rune for this slot to buy one as used.',
  rune_needs_an: 'Needs an {rune} for each cast: you carry none. Pick the store’s rune for this slot to buy one as used.',
  rune_needs_a_packed: 'Needs a {rune} for each cast: none in this hunt, and {waiting}',
  rune_needs_an_packed: 'Needs an {rune} for each cast: none in this hunt, and {waiting}',
  rune_leaves: 'You carry none of the runes ticked on this slot. When it comes to cast, your hero leaves the hunt.',
  rune_leaves_packed: 'None of the runes ticked on this slot is in this hunt, and {waiting}',
  no_shot: 'Nothing loaded to shoot. Put arrows or bolts on the bar (Ammo), and this spell casts them.',
  rune_level: 'Your {runes} are a higher tier than your level can cast. Carry a lower tier, or pick the store’s rune for this slot.',
  store_level: 'The store rune on this slot is a higher tier than your level can cast. This slot waits until then. Pick a lower rune for it, or carry your own.',
  store_level_named: '{name} needs {needs}. This slot waits until then. Pick a lower rune for it, or carry your own.',
  server_refused: 'The server says this cannot fire now.',
  mana_short: 'Needs {mana} mana, you have {have}.',
  none_in_hunt: 'None in this hunt: {waiting}',
  none_left: 'None left: you carry no {item}. The next food or drink slot fires instead.',
  store_off: 'This hero is set to end the hunt rather than buy from the store.',
  out_store_off: 'Out of stock, and this hero is set to end the hunt rather than buy from the store.',
  out_no_store: 'Out of stock, and the store does not sell it.',

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
  note_loaded: '(the ammo you wear shoots first, and the store sells a shot only once everything you carry is gone)',
  note_shot: '(after the ammo you wear, unless you give this slot conditions. The store sells a shot only once everything you carry is gone.)',
  cmp_hp_use: '{diff} HP a use',
  cmp_mana_use: '{diff} mana a use',
  cmp_gold_use: '{diff} gold a use',
  cmp_gold_per_hp: '{ratio}× the gold per HP',
  cmp_gold_per_mana: '{ratio}× the gold per mana',
  waste_hp: 'At {pct}% you are missing {missing} HP, so {lost} of its {amount} would be wasted.',
  waste_mana: 'At {pct}% you are missing {missing} mana, so {lost} of its {amount} would be wasted.',
  effect_food: 'Half heals at once, the rest over {secs} s. Food and drink share a {lane} s cooldown.',
  effect_drink: 'Half restores at once, the rest over {secs} s. Food and drink share a {lane} s cooldown.',
});
