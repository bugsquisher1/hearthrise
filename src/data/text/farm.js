// ════════════════════════════════════════════════════════════════════════
// src/data/text/farm.js — THE FARM WINDOW'S WORDS (src/shell/windows/farm.js).
//
// One row per sentence, read by t('farm.<key>') (src/render/player-text.js).
// {name} is filled by the window; a row of { one, other } forms is picked by
// {count}. Rows that run on as one line are joined by a space, or by ". " for
// the plot's notes, which carry no final period.
// ════════════════════════════════════════════════════════════════════════

export const FARM_TEXT = Object.freeze({
  /* The farm's own refusals, by the server's code (some codes mean something else elsewhere: `not_ready` is the party's too). */
  refused_not_ready: 'Not ready yet',
  refused_empty_plot: 'That plot is empty now.',
  refused_plot_occupied: 'Something is already growing there.',
  refused_plot_cap: 'No room for another plot',
  refused_insufficient_seed: 'No seed, the Shop sells them',
  refused_level_too_low: 'Farming level too low',
  refused_plot_tier_locked: 'Requires a higher plot tier',
  refused_still_watered: 'Still watered',
  refused_water_capped: 'That plot cannot take more water.',
  refused_already_ready: 'It\'s ready to harvest.',
  refused_day_budget: 'Daily farming limit reached',
  refused_farm_level_too_low: 'Farming level too low for the next tier',
  refused_cannot_afford: 'Not enough gold for that.',
  refused_stale_level: 'Plots changed, check the price and try again',
  refused_max_plot_level: 'Plots at top tier',
  refused_no_seed_for_sale: 'The Shop does not sell that seed.',

  /* The window's frame. */
  shared: 'Shared land: each hero keeps their own crop and Farming XP',
  plots_aria: 'Plots',
  loading: 'Loading the farm…',
  open_shop: 'Open Shop',
  tier_head: 'Plot tier',
  purse: 'Gold: {gold}',
  land_room: { one: 'Room for {count} plot', other: 'Room for {count} plots' },
  land_extra: { one: '{count} extra plot goes once harvested.', other: '{count} extra plots go once harvested.' },

  /* One plot. */
  plot_aria_ready: '{crop}, ready',
  plot_aria_growing: '{crop}, growing',
  plot_aria_empty: 'Empty plot {n}: plant a seed',
  plot_empty: 'Empty',
  plot_ready: 'Ready',
  plot_left: '{time} left',
  plot_checking: 'Checking…',
  time_under_minute: 'under a minute',
  planted_by: 'Planted by {name}',
  planted_by_hero: 'Planted by another hero',
  note_extra: 'Extra plot: gone once harvested',
  note_regrows: 'Grows back after every harvest',
  note_last_harvest: 'Last harvest: the plant withers after it',
  note_regrows_n: { one: 'Grows back {count} more time after this harvest', other: 'Grows back {count} more times after this harvest' },
  harvest: 'Harvest',
  harvest_regrows: 'Harvest, grows back',
  harvest_regrows_n: { one: 'Harvest, grows back {count} more time', other: 'Harvest, grows back {count} more times' },
  harvest_replant: 'Harvest and replant',
  harvest_clear: 'Harvest and clear',
  harvest_only: 'Harvest only',
  plant: 'Plant',
  water: 'Water',
  watered: 'Watered',

  /* The seed picker. */
  sow_head: 'Plant in plot {n}',
  why_reading: 'Loading Farming level…',
  why_farming: 'Needs Farming {level}',
  why_tier: 'Needs plot tier {tier}',
  why_no_seeds: 'No seeds',
  /* No seed and the Shop sells it: the second sentence is the link to the Shop's row for that seed (src/shell/goto.js). */
  why_no_seeds_head: 'No seeds.',
  shop_sells_seeds: 'The Shop sells them for {price}.',
  seed_line: 'Grows in {hours} h. {status}',
  seeds_in_bag: { one: '{held} seed in bag', other: '{held} seeds in bag' },
  seeds_in_bag_storage: { one: '{held} seed in bag and Storage', other: '{held} seeds in bag and Storage' },
  sow_all: 'Plant {n} empty plots',
  no_seed_to_plant: 'No seed, buy one in the Shop',

  /* The plot tier. */
  tier_grows: 'Tier {tier} grows {crops}.',
  tier_next: 'Tier {tier} adds {crops}: {price}, at Farming {level}.',
  tier_top: 'Plots at top tier',
  tier_crop_needs: '{crop}, Farming {level}',
  improve: 'Improve the soil for {price}',
  improve_top: 'Top tier',

  /* What a press says, from the server's answer. */
  planting: 'Planting…',
  planting_in: 'Planting {crop} in plot {n}…',
  planted_in: 'Planted {crop} in plot {n}.',
  planted_many: { one: 'Planted {crop} in {count} plot.', other: 'Planted {crop} in {count} plots.' },
  planted_stopped: 'Stopped at plot {n}: {why}',
  watering: 'Watering…',
  watered_done: 'Watered: grows twice as fast for 2 hours',
  harvesting: 'Harvesting…',
  harvested: 'Harvested {qty} {item}, +{xp} Farming XP',
  harvested_extra_gone: 'That extra plot is gone now.',
  harvested_withered: 'The plant has withered.',
  harvested_regrows: 'It grows back.',
  harvested_regrows_n: { one: 'It grows back, then {count} more time.', other: 'It grows back, then {count} more times.' },
  harvested_regrows_last: 'It grows back one last time.',
  harvested_cleared: 'The plot is clear.',
  replanted_bought: 'Bought a seed for {price} and planted it again.',
  replanted: 'Planted it again.',
  not_replanted_price: 'Not planted again: a seed costs {price}.',
  not_replanted: 'Not planted again: {why}',
  improving: 'Improving the soil…',
  improved: 'Plots now tier {tier}',
});
