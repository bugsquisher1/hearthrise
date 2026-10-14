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

import { SPINE_STEPS, count, combat, property, workers, item, cleared } from './spine.js?v=582';
import { SHOP_OFFERS } from './shops.js?v=582';
import { ARTISAN_RECIPES } from './recipes.js?v=582';

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
  stone: route('skills', 'Go cut stone', 'stonemason', 'stonemason'),
  gather: route('skills', 'Go gather', 'totalLvl'),
  fight: route('combat', 'Go fight', 'navCombat'),
  crypt: route('dungeons', 'Go to the Crypt', 'navDungeons'),
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
  cooked_shrimp: 'cook', leather_boots: 'craft', willow_plank: 'craft', maple_plank: 'craft', yew_plank: 'craft',
  steel_bar: 'smith', mithril_bar: 'smith', rune_bar: 'smith', ashlar: 'stone',
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

/* A craft step's parts, read from the recipe the server checks (src/data/
   recipes.js, generated into hr_activities), so the bar can never quote a
   level or an input count the bench does not ask for. Inputs first (each
   from where it is made), then the item, then the act that finishes the
   step. */
function craftParts(skill, recipeId, finish) {
  const r = (ARTISAN_RECIPES[skill] || []).find((x) => x.id === recipeId);
  if (!r || !r.output) throw new Error('spine-pointer: no recipe ' + recipeId);
  const inputs = Object.entries(r.inputs || (r.input ? { [r.input]: 1 } : {}))
    .map(([id, n]) => part(item(id, n), ITEM_ROUTE[id] || null));
  return [part(level(skill, r.req || 1), 'craft')].concat(inputs, [part(item(r.output, 1), 'craft'), finish]);
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
    opens: opens('Crafting and Smithing open', 'Turn hides and ore into gear you can wear.'),
  },
  /* The reveal counts the first craft; the pointer asks for the boots on the
     player's feet (the server's worn set), because gear worn is the payoff. */
  first_craft: {
    title: 'Craft and wear Leather Boots', why: 'Gear you make yourself is the surest way to hit harder.',
    need: [count('crafted', 1), wears('boots')], chain: true,
    parts: craftParts('crafting', 'tailor_leather_boots', part(wears('boots'), 'wear')),
    opens: opens('Sell your surplus on the Player Market', 'Other players buy what you do not need.'),
  },
  first_harvest: {
    title: 'Harvest 6 crops', why: 'A full harvest feeds you and sells well.',
    parts: [part(count('ev:harvest', 6), 'farm', 'Crops harvested')], quest: 'farmhand',
    opens: opens('The Bounty Board opens', 'Take paid hunting contracts from the board.'),
  },
  seasoned: {
    title: 'Become a seasoned fighter', why: 'A seasoned fighter can take on the wider realm.',
    parts: [part(count('ev:kill_any', 100), 'fight', 'Monsters defeated'), part(combat(10), 'fight', 'Combat level')], quest: 'hundred_kills',
    opens: opens('The wider realm opens', 'Join parties and realm events with other players.'),
  },
  farmstead: {
    title: 'Build the Fieldworth Farmstead', why: 'The Farmstead adds plots, a second hand and the Workshop, Cellar and Forge.',
    parts: buildParts('property.farmstead', 2),
    opens: opens('The road to the Castle', 'Your next goals lead to the Manor, the Keep and the Castle.'),
  },
  road_forge: {
    title: 'Smith 60 items', why: 'The reward is an iron pickaxe, and iron ore waits at Mining 15.',
    parts: [part(count('ev:smithed', 60), 'smith', 'Items smithed')], quest: 'road_forge',
    opens: opens('An iron pickaxe', 'Iron ore waits at Mining 15.'),
  },
  road_craft: {
    title: 'Craft 60 items', why: 'The reward is an iron axe that cuts willow.',
    parts: [part(count('ev:crafted', 60), 'craft', 'Items crafted')], quest: 'road_craft',
    opens: opens('Stonemason opens', 'Cut stone into ashlar, the blocks the Manor is built from.'),
  },
  cut_ashlar: {
    title: 'Cut 6 blocks of ashlar', why: 'The Manor is built of ashlar, and only a stonemason can cut it.',
    parts: [part(level('stonemason', 45), 'stone'), part(item('ashlar', 6), 'stone')], chain: true,
    opens: opens('Ashlar in hand', 'You have the stone for Stonecross Manor.'),
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
    title: 'Defeat 500 monsters', why: 'The reward is the key to the Crypt of Bones.',
    parts: [part(count('ev:kill_any', 500), 'fight', 'Monsters defeated')], quest: 'road_hunt',
    opens: opens('A key to the Crypt', 'The Crypt of Bones opens at combat level 25.'),
  },
  /* No server fact counts a dungeon clear yet, so the clear part reads the
     pending dash and the step is forgiven once the Keep is built. */
  crypt: {
    title: 'Clear the Crypt of Bones', why: 'The Marrow King waits at its heart with a deed for the taking.',
    parts: [part(combat(25), 'fight', 'Combat level'), part(cleared('crypt_of_bones'), 'crypt', 'Crypt cleared')],
    opens: opens('The Crypt is cleared', 'One more home to build before the Castle.'),
  },
  keep: {
    title: 'Build Ironvale Keep', why: 'The Keep is the last stop before the Castle.',
    parts: buildParts('property.keep', 4),
    opens: opens('Ironvale Keep stands', 'Two goals and one rung left: the Castle.'),
  },
  road_cook: {
    title: 'Cook 60 dishes', why: 'A full larder keeps you fighting longer.',
    parts: [part(count('ev:cooked', 60), 'cook', 'Dishes cooked')], quest: 'road_cook',
    opens: opens('A better rod', 'Your new rod brings in more fish for the pan.'),
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
