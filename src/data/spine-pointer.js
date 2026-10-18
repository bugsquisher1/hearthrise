// ════════════════════════════════════════════════════════════════════════
// src/data/spine-pointer.js — WHAT THE POINTER BAR SAYS AT EACH STEP.
//
// The one-spine design's pointer (lane L1): one bar on every tab and the top
// card on Home name the step the player is on, what it still needs, and the
// one button that takes them to the first thing missing. This file is the
// DISPLAY half of the spine. `step`, `id`, `need`, `via` and `whenDone` come
// from src/data/spine.js, row for row; this file adds, keyed by step id:
//   title · why            the bar's words and Home's reason line
//   parts                  what the bar counts, in the order Go walks them.
//                          The LAST part may be the act that finishes the
//                          step (Build, Hire, Wear), drawn as the button.
//   chain                  parts are a sequence: a later part done means the
//                          earlier ones are spent (boots worn need no pelts)
//   need                   only where the POINTER asks more than the reveal
//                          (step 7: the boots on your feet, not just made)
//   quest                  the existing QUEST_DEFS id for the step. Claim and
//                          a reward show only when the server pays it
//                          (QUEST_REWARDS); otherwise no reward is shown
//   opens                  the one-time unlock moment when the step finishes
//
// Every fact a part reads is the server's: lifetime counters, server skill
// XP, the property rung, the crew, the server bag, the record's gold and worn
// set. tests/spine.mjs walks this table for open doors, quest links and
// deadlocks. PURE ESM. No DOM, no window.
// ════════════════════════════════════════════════════════════════════════

import { SPINE_STEPS, count, combat, property, workers, item } from './spine.js?v=592';
import { SHOP_OFFERS } from './shops.js?v=592';

export const level = (skill, min) => Object.freeze({ fact: 'level', skill, min });
export const gold = (min) => Object.freeze({ fact: 'gold', min });
export const wears = (slot) => Object.freeze({ fact: 'wears', slot, min: 1 });

/* WHERE GO TAKES THE PLAYER. `tab` is a pane of src/nav-consolidation.js HUBS,
   `skill` opens that skill's screen on arrival. */
const route = (tab, verb, glyph, skill) => Object.freeze({ tab, verb, glyph, skill: skill || null });
export const ROUTES = Object.freeze({
  chop: route('skills', 'Go chop', 'woodcutting', 'woodcutting'),
  fish: route('skills', 'Go fish', 'fishing', 'fishing'),
  cook: route('skills', 'Go cook', 'cooking', 'cooking'),
  mine: route('skills', 'Go mine', 'mining', 'mining'),
  craft: route('skills', 'Go craft', 'crafting', 'crafting'),
  smith: route('skills', 'Go smith', 'smithing', 'smithing'),
  gather: route('skills', 'Go gather', 'totalLvl'),
  fight: route('combat', 'Go fight', 'navCombat'),
  plant: route('farming', 'Go plant', 'farming'),
  farm: route('farming', 'Go farm', 'farming'),
  sell: route('shop', 'Go sell', 'gold'),
  build: route('house', 'Build', 'uiHome'),
  hire: route('house', 'Hire', 'uiPeople'),
  wear: route('inventory', 'Wear', 'navInventory'),
});

/* The routes that FINISH a step rather than fetch for it: drawn as the button. */
export const ACTS = new Set(['build', 'hire', 'wear']);

/* Where each building material is made. tests/spine.mjs checks every one
   against the gathering, monster and recipe tables. */
export const ITEM_ROUTE = Object.freeze({
  normal_log: 'chop', oak_log: 'chop', copper_ore: 'mine', iron_ore: 'mine',
  wolf_pelt: 'fight', silk_thread: 'fight', big_bones: 'fight', bear_pelt: 'fight', dragon_scale: 'fight',
  cooked_shrimp: 'cook', willow_plank: 'craft', maple_plank: 'craft', yew_plank: 'craft',
  steel_bar: 'smith', mithril_bar: 'smith', rune_bar: 'smith',
  iron_fitting: 'smith', timber_beam: 'craft', keystone: 'craft',
});

const part = (need, go, label) => Object.freeze({ need, go, label: label || null, act: ACTS.has(go) });

/* A property rung's parts, read from the price catalogue the server charges
   from (src/data/shops.js), so the bar can never quote a stale price. Gold is
   last among the costs: it is the one the Local Shop turns surplus into. */
function buildParts(offerId, rung) {
  const offer = SHOP_OFFERS.find((o) => o.id === offerId);
  if (!offer) throw new Error('spine-pointer: no offer ' + offerId);
  const items = offer.cost.filter((c) => c.kind === 'item').map((c) => part(item(c.id, c.amount), ITEM_ROUTE[c.id] || null));
  const coins = offer.cost.filter((c) => c.kind === 'currency' && c.id === 'gold').map((c) => part(gold(c.amount), 'sell'));
  return items.concat(coins, [part(property(rung), 'build')]);
}

function hireParts(offerId) {
  const offer = SHOP_OFFERS.find((o) => o.id === offerId);
  const coin = offer && offer.cost.find((c) => c.id === 'gold');
  if (!coin) throw new Error('spine-pointer: no gold price on ' + offerId);
  return [part(gold(coin.amount), 'sell'), part(workers(1), 'hire')];
}

const opens = (title, line) => Object.freeze({ title, line });

const DISPLAY = {
  chop_logs: {
    title: 'Chop 15 logs', why: 'Logs build everything here, starting with your first fire.',
    parts: [part(count('chopped', 15), 'chop', 'Logs chopped')], quest: 'gatherer',
    opens: opens('Fishing and Cooking open', 'Catch a fish and cook it over your fire.'),
  },
  fish_and_cook: {
    title: 'Catch and cook 5 fish', why: 'Cooked food heals you in a fight, and a fight comes next.',
    parts: [part(count('fished', 5), 'fish', 'Fish caught'), part(count('ev:cooked', 5), 'cook', 'Dishes cooked')], quest: 'first_cook',
    opens: opens('The Field opens', 'Take your food along and fight your first monsters.'),
  },
  first_kills: {
    title: 'Defeat 5 monsters', why: 'Monsters drop the hides, bones and seeds the rest of the road needs.',
    parts: [part(count('ev:kill_any', 5), 'fight', 'Monsters defeated')], quest: 'first_blood',
    opens: opens('The Farm opens', 'Plant your seeds and they grow while you do other things.'),
  },
  plant_seeds: {
    title: 'Plant your first seeds', why: 'Crops keep growing while you are away, so plant before you go.',
    parts: [part(count('ev:planted', 1), 'plant', 'Seeds planted')],
    opens: opens('Mining and the House open', 'Mine copper and save up for your first real home.'),
  },
  homestead: {
    title: 'Build the Homestead', why: 'A Homestead gives you more farm plots and room for a hired hand.',
    parts: buildParts('property.homestead', 1), quest: 'homestead',
    opens: opens('You can hire a hand', 'A hired hand gathers for you, even while you are offline.'),
  },
  first_hand: {
    title: 'Hire your first hand', why: 'Your hand keeps gathering while you are offline.',
    parts: hireParts('worker.1'),
    opens: opens('Crafting and Smithing open', 'Saw planks and smelt bars for everything you build.'),
  },
  first_craft: {
    title: 'Craft your first item', why: 'Planks and arrows start at the crafting bench, and so does every building stock.',
    parts: [part(count('crafted', 1), 'craft', 'Items crafted')],
    opens: opens('Sell your surplus on the Player Market', 'Other players buy what you do not need.'),
  },
  first_harvest: {
    title: 'Harvest 6 crops', why: 'A full harvest feeds you and sells well.',
    parts: [part(count('ev:harvest', 6), 'farm', 'Crops harvested')], quest: 'farmhand',
    opens: opens('Time to toughen up', 'A hundred fights and Combat 10 make you a seasoned fighter.'),
  },
  seasoned: {
    title: 'Become a seasoned fighter', why: 'A seasoned fighter can take on the wider realm.',
    parts: [part(count('ev:kill_any', 100), 'fight', 'Monsters defeated'), part(combat(10), 'fight', 'Combat level')], quest: 'hundred_kills',
    opens: opens('Runecrafting opens', 'Bind runes for a staff, and save up for the Farmstead.'),
  },
  farmstead: {
    title: 'Build the Fieldworth Farmstead', why: 'The Farmstead adds plots, a second hand and the Workshop, Cellar and Forge.',
    parts: buildParts('property.farmstead', 2),
    opens: opens('The road to the Castle', 'Your next goals lead to the Manor, the Keep and the Castle.'),
  },
  road_forge: {
    title: 'Smith 60 items', why: 'The reward is three iron bars, enough for your first iron fitting.',
    parts: [part(count('ev:smithed', 60), 'smith', 'Items smithed')], quest: 'road_forge',
    opens: opens('Three iron bars', 'Enough for your first iron fitting.'),
  },
  road_craft: {
    title: 'Craft 60 items', why: 'The reward is five oak planks for your first timber beams.',
    parts: [part(count('ev:crafted', 60), 'craft', 'Items crafted')], quest: 'road_craft',
    opens: opens('Five oak planks', 'Enough for your first timber beams.'),
  },
  building_stock: {
    title: 'Make 6 iron fittings and 6 timber beams', why: 'Stonecross Manor is framed in timber and bound in iron.',
    parts: [part(level('smithing', 25), 'smith'), part(level('crafting', 25), 'craft'),
      part(item('iron_fitting', 6), 'smith'), part(item('timber_beam', 6), 'craft')], chain: true,
    opens: opens('Building stock in hand', 'You have the iron and timber for Stonecross Manor.'),
  },
  road_gather: {
    title: 'Gather 500 resources', why: 'Every building from here on needs loads of wood and ore.',
    parts: [part(count('ev:gather', 500), 'gather', 'Resources gathered')], quest: 'road_gather',
    opens: opens('Five hundred loads hauled', 'The Manor is built on work like this.'),
  },
  manor: {
    title: 'Build Stonecross Manor', why: 'The Manor opens the next rung of every room.',
    parts: buildParts('property.manor', 3),
    opens: opens('Stonecross Manor stands', 'Your rooms can climb higher now.'),
  },
  road_hunt: {
    title: 'Defeat 500 monsters', why: 'The reward is two cooked lobsters for the climb to Combat 45.',
    parts: [part(count('ev:kill_any', 500), 'fight', 'Monsters defeated')], quest: 'road_hunt',
    opens: opens('Two cooked lobsters', 'Food for the climb to Combat 45.'),
  },
  bear_hunt: {
    title: 'Bring home 5 bear pelts', why: 'Ironvale Keep needs bear pelts, and bears only face fighters of Combat 45.',
    parts: [part(combat(45), 'fight', 'Combat level'), part(item('bear_pelt', 5), 'fight')],
    opens: opens('Pelts in hand', 'One more home to build before the Castle.'),
  },
  keep: {
    title: 'Build Ironvale Keep', why: 'The Keep is the last stop before the Castle.',
    parts: buildParts('property.keep', 4),
    opens: opens('Ironvale Keep stands', 'Two goals and one rung left: the Castle.'),
  },
  road_cook: {
    title: 'Cook 60 dishes', why: 'A full larder keeps you fighting longer.',
    parts: [part(count('ev:cooked', 60), 'cook', 'Dishes cooked')], quest: 'road_cook',
    opens: opens('Three raw lobsters', 'They cook at Cooking 30.'),
  },
  road_harvest: {
    title: 'Harvest 40 crops', why: 'The reward is potato seed, which grows at Farming 30.',
    parts: [part(count('ev:harvest', 40), 'farm', 'Crops harvested')], quest: 'road_harvest',
    opens: opens('Potato seed in hand', 'Plant them once your Farming reaches 30.'),
  },
  castle: {
    title: 'Build Hearthrise Castle', why: 'The top of the ladder, and a home for your whole crew.',
    parts: buildParts('property.castle', 5),
    opens: opens('Hearthrise Castle is yours', 'You have climbed the whole road.'),
  },
};

export const POINTER_STEPS = Object.freeze(SPINE_STEPS.map((s) => {
  const d = DISPLAY[s.id];
  if (!d) throw new Error('spine-pointer: no display row for spine step ' + s.id);
  return Object.freeze(Object.assign({ chain: false, quest: null }, s, d, {
    need: d.need || s.need, parts: Object.freeze(d.parts),
  }));
}));
