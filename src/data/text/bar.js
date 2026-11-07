// ════════════════════════════════════════════════════════════════════════
// src/data/text/bar.js — THE ACTION BAR'S WORDS: what a slot is, what it costs,
// where its uses come from and why it waits (src/shell/action-facts.js, the
// store line of src/shell/bar-draft.js).
//
// One row per sentence, read by t('bar.<key>'). {weapons} is a weapon list
// ("Bow or Crossbow"), {store} the store's line (store_then / store_plain),
// {waiting} the waiting_* sentence about a stock the backpack holds.
// ════════════════════════════════════════════════════════════════════════

export const BAR_TEXT = Object.freeze({
  /* The Configure action window's tabs, and the loaded-ammo slot's name. */
  tab_spells: 'Spells',
  tab_runes: 'Runes',
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

  /* Where a slot's uses come from. */
  store_then: 'then the store’s {name}, {price} g each, paid as used',
  store_plain: 'the store’s {name}, {price} g each, paid as used',
  nothing_loaded: 'Nothing loaded: your weapon shoots the ammo on your bar, then waits.',
  loaded_endless: '{item} loaded. They never run out.',
  loaded_carry: 'You carry {n} {item}. When they run out, your other ammo fires.',
  loaded_carry_store: 'You carry {n} {item}. Own stock first, {store}.',
  loaded_none: 'You carry no {item}. Your other ammo fires first.',
  loaded_none_store: 'You carry no {item}. Your other ammo fires first, {store}.',
  runes_carry: 'You carry {n} {rune}. Carried runes only: once they are gone this slot waits.',
  runes_carry_store: 'You carry {n} {rune}. Own runes first, {store}.',
  bought_per_use: 'Bought from the store at {price} g each, paid as used.',
  stock_carry: 'You carry {n}. When they run out, this slot waits and the next slot fires.',
  stock_carry_store: 'You carry {n}. Own stock first, {store}.',
  stock_none: 'You carry none, so this slot waits and the next slot fires.',
  stock_none_store: 'You carry none: {store}.',
  store_stays_off: 'This hero is set to end the hunt when its own stock runs out, so the store stays off.',

  /* A slot's setup, and what another slot does to it. */
  setup_always: 'Always: whenever it is ready (no conditions).',
  setup_any: 'Any of: {conditions}.',
  setup_all: 'All of: {conditions}.',
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
});
