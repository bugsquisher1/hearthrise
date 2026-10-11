// ════════════════════════════════════════════════════════════════════════
// src/data/spine-pointer.js — WHAT THE POINTER BAR SAYS AT EACH STEP.
//
// The one-spine design's pointer (lane L1): one bar on every tab and the top
// card on Home name the step the player is on, what it still needs, and the
// one button that takes them to the first thing missing. This file is the
// display half of the spine; src/data/spine.js keeps the ten steps' `need`,
// and the rows after step ten (the old Journeyman's Road, interleaved with the
// Manor, Keep and Castle) live here because the reveal does not gate on them.
//
// A ROW:
//   step · id · chapter    the order; `chapter` sets the "of N" the bar shows
//   need                   the facts that finish the step (server facts only)
//   title · why            the bar's words and Home's reason line
//   parts                  what the bar counts, in the order Go walks them.
//                          The LAST part is the act that finishes the step
//                          (Build, Hire, Wear) and is drawn as the button.
//   chain                  parts are a sequence: a later part done means the
//                          earlier ones are spent (boots worn need no pelts)
//   quest                  the existing hr_claim_quest id that pays the step,
//                          or absent (no server reward yet, none is shown)
//   opens                  the one-time unlock moment when the step finishes;
//                          `reveals` names the rows src/data/reveals.js shows
//                          next, so the words cannot promise a closed door
//
// Every fact a part reads is the server's: lifetime counters, server skill
// XP, the property rung, the crew, the server bag, the record's gold and worn
// set. tests/spine.mjs walks this table for open doors, catalogue links and
// deadlocks. PURE ESM. No DOM, no window.
// ════════════════════════════════════════════════════════════════════════

import { SPINE_STEPS, count, combat, property, workers } from './spine.js?v=567';
import { SHOP_OFFERS } from './shops.js?v=567';

export const level = (skill, min) => Object.freeze({ fact: 'level', skill, min });
export const item = (id, min) => Object.freeze({ fact: 'item', id, min });
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

function hireParts(offerId) {
  const offer = SHOP_OFFERS.find((o) => o.id === offerId);
  const coin = offer && offer.cost.find((c) => c.id === 'gold');
  if (!coin) throw new Error('spine-pointer: no gold price on ' + offerId);
  return [part(gold(coin.amount), 'sell'), part(workers(1), 'hire')];
}

const NEED = Object.fromEntries(SPINE_STEPS.map((s) => [s.id, s.need]));
const opens = (title, line, reveals) => Object.freeze({ title, line, reveals: Object.freeze(reveals || []) });
const row = (step, id, chapter, o) => Object.freeze(Object.assign({ step, id, chapter, chain: false, quest: null, need: NEED[id] }, o,
  { parts: Object.freeze(o.parts) }));

export const POINTER_STEPS = Object.freeze([
  row(1, 'chop_logs', 1, {
    title: 'Chop 15 logs', why: 'Logs build everything here, starting with your first fire.',
    parts: [part(count('chopped', 15), 'chop', 'Logs chopped')], quest: 'gatherer',
    opens: opens('Fishing and Cooking open', 'Catch a fish and cook it over your fire.', ['skill:fishing', 'skill:cooking']),
  }),
  row(2, 'fish_and_cook', 1, {
    title: 'Catch and cook 5 fish', why: 'Cooked food heals you in a fight, and a fight comes next.',
    parts: [part(count('fished', 5), 'fish', 'Fish caught'), part(count('cooked', 5), 'cook', 'Dishes cooked')], quest: 'first_cook',
    opens: opens('The Field opens', 'Take your food along and fight your first monsters.', ['pane:combat']),
  }),
  row(3, 'first_kills', 1, {
    title: 'Defeat 5 monsters', why: 'Monsters drop the hides, bones and seeds the rest of the road needs.',
    parts: [part(count('kills', 5), 'fight', 'Monsters defeated')], quest: 'first_blood',
    opens: opens('The Farm opens', 'Plant your seeds and they grow while you do other things.', ['pane:farming']),
  }),
  row(4, 'plant_seeds', 1, {
    title: 'Plant your first seeds', why: 'Crops keep growing while you are away, so plant before you go.',
    parts: [part(count('ev:planted', 1), 'plant', 'Seeds planted')],
    opens: opens('Mining and the House open', 'Mine copper and save up for your first real home.', ['skill:mining', 'pane:house']),
  }),
  row(5, 'homestead', 1, {
    title: 'Build the Homestead', why: 'A Homestead gives you more farm plots and room for a hired hand.',
    parts: buildParts('property.homestead', 1),
    opens: opens('You can hire a hand', 'A hired hand gathers for you, even while you are offline.', ['card:workers']),
  }),
  row(6, 'first_hand', 1, {
    title: 'Hire your first hand', why: 'Your hand keeps gathering while you are offline.',
    parts: hireParts('worker.1'),
    opens: opens('Crafting and Smithing open', 'Turn hides and ore into gear you can wear.', ['skill:crafting', 'skill:smithing']),
  }),
  /* The reveal counts the first craft; the pointer asks for the boots on the
     player's feet (the server's worn set), because gear worn is the payoff. */
  row(7, 'first_craft', 1, {
    title: 'Craft and wear Leather Boots', why: 'Gear you make yourself is the surest way to hit harder.',
    need: [count('crafted', 1), wears('boots')], chain: true,
    parts: [part(level('crafting', 8), 'craft'), part(item('wolf_pelt', 2), 'fight'),
      part(item('leather_boots', 1), 'craft'), part(wears('boots'), 'wear')],
    opens: opens('The Market opens', 'Sell your surplus to other players.', ['pane:market']),
  }),
  row(8, 'first_harvest', 1, {
    title: 'Harvest 6 crops', why: 'A full harvest feeds you and sells well.',
    parts: [part(count('ev:harvest', 6), 'farm', 'Crops harvested')], quest: 'farmhand',
    opens: opens('The Bounty Board opens', 'Take paid hunting contracts from the board.', ['pane:bounty']),
  }),
  row(9, 'seasoned', 1, {
    title: 'Become a seasoned fighter', why: 'A seasoned fighter can take on the wider realm.',
    parts: [part(count('kills', 100), 'fight', 'Monsters defeated'), part(combat(10), 'fight', 'Combat level')],
    opens: opens('The wider realm opens', 'Join parties and realm events with other players.', ['pane:party', 'pane:events']),
  }),
  row(10, 'farmstead', 1, {
    title: 'Build the Fieldworth Farmstead', why: 'The Farmstead adds plots, a second hand and the Workshop, Cellar and Forge.',
    parts: buildParts('property.farmstead', 2),
    opens: opens('The road to the Castle', 'Your next goals lead to the Manor, the Keep and the Castle.'),
  }),

  row(11, 'road_cook', 2, {
    title: 'Cook 60 dishes', why: 'A full larder keeps you fighting longer.',
    need: [count('ev:cooked', 60)], parts: [part(count('ev:cooked', 60), 'cook', 'Dishes cooked')], quest: 'road_cook',
    opens: opens('A better rod', 'Your new rod brings in more fish for the pan.'),
  }),
  row(12, 'road_gather', 2, {
    title: 'Gather 500 resources', why: 'Every building from here on needs loads of wood and ore.',
    need: [count('ev:gather', 500)], parts: [part(count('ev:gather', 500), 'gather', 'Resources gathered')], quest: 'road_gather',
    opens: opens('Five hundred loads hauled', 'The Manor is built on work like this.'),
  }),
  row(13, 'road_harvest', 2, {
    title: 'Harvest 40 crops', why: 'Potatoes grow at Farming 30, and the reward brings the seed.',
    need: [count('ev:harvest', 40)], parts: [part(count('ev:harvest', 40), 'farm', 'Crops harvested')], quest: 'road_harvest',
    opens: opens('Potato seed in hand', 'Plant them once your Farming reaches 30.'),
  }),
  row(14, 'road_forge', 2, {
    title: 'Smith 60 items', why: 'Bars and tools from the Forge carry you into iron.',
    need: [count('ev:smithed', 60)], parts: [part(count('ev:smithed', 60), 'smith', 'Items smithed')], quest: 'road_forge',
    opens: opens('An iron pickaxe', 'Iron ore waits at Mining 15.'),
  }),
  row(15, 'road_craft', 2, {
    title: 'Craft 60 items', why: 'Planks and leather are what the Manor is made of.',
    need: [count('ev:crafted', 60)], parts: [part(count('ev:crafted', 60), 'craft', 'Items crafted')], quest: 'road_craft',
    opens: opens('An iron axe', 'It keeps the sawmill fed with oak and willow.'),
  }),
  row(16, 'manor', 2, {
    title: 'Build Stonecross Manor', why: 'The Manor opens the next rung of every room.',
    need: [property(3)], parts: buildParts('property.manor', 3),
    opens: opens('Stonecross Manor stands', 'Your rooms can climb higher now.'),
  }),
  row(17, 'road_hunt', 2, {
    title: 'Defeat 500 monsters', why: 'The reward is a key to the Crypt of Bones.',
    need: [count('ev:kill_any', 500)], parts: [part(count('ev:kill_any', 500), 'fight', 'Monsters defeated')], quest: 'road_hunt',
    opens: opens('A key to the Crypt', 'The Crypt of Bones opens at combat level 25.'),
  }),
  row(18, 'keep', 2, {
    title: 'Build Ironvale Keep', why: 'The Keep is the last stop before the Castle.',
    need: [property(4)], parts: buildParts('property.keep', 4),
    opens: opens('Ironvale Keep stands', 'One rung left: the Castle.'),
  }),
  row(19, 'castle', 2, {
    title: 'Build Hearthrise Castle', why: 'The top of the ladder, and a home for your whole crew.',
    need: [property(5)], parts: buildParts('property.castle', 5),
    opens: opens('Hearthrise Castle is yours', 'You have climbed the whole road.'),
  }),
]);

/* The "of N" the bar prints: the last step of the row's chapter. */
export const CHAPTER_END = Object.freeze(POINTER_STEPS.reduce((m, r) => Object.assign(m, { [r.chapter]: Math.max(m[r.chapter] || 0, r.step) }), {}));
