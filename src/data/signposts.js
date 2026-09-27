// src/data/signposts.js — the copy a dead end shows: what happened, and a door.
//
// Client-only display copy. No edge-reachable module may import it
// (tests/signposts.mjs SIGN-7), and it restates no server-owned number.
// `lines` are sentences (SIGN-3: 30-200 chars, no digits); `vars` names every
// {placeholder} a line fills (SIGN-5); a `door` opens a tab or a skill (SIGN-2).
// `labels` are chip and heading words (3-40 chars). Add a row, not code.

export const SIGNPOSTS = Object.freeze({
  lines: Object.freeze({
    'bag.all': { text: 'Your bag is empty. Everything you gather, cook, craft or win in a fight lands here.', door: { tab: 'skills', label: 'Start a skill' } },
    'bag.hidden': { text: 'Nothing here matches your search or bag filter. Clear them to see everything you hold.' },
    'bag.weapons': { text: 'No weapons in your bag; the one you wield sits on your character. Shops sell a starter blade, bow and staff, and Smithing and Crafting make better ones.', door: { tab: 'shops', label: 'Visit Shops' } },
    'bag.armor': { text: 'No armour in your bag; what you wear sits on your character. Shops sell boots, gloves and a first helm, and Smithing and Crafting make the rest.', door: { tab: 'shops', label: 'Visit Shops' } },
    'bag.jewelry': { text: 'No jewellery in your bag. Shops sell a ring and a necklace, and Crafting makes finer ones.', door: { tab: 'shops', label: 'Visit Shops' } },
    'bag.food': { text: 'No food in your bag, so Auto-Eat has nothing to reach for. Cook what you fish or farm, or buy a cooked meal under Supplies in Shops.', door: { skill: 'cooking', label: 'Go to Cooking' } },
    'bag.mats': { text: 'No materials in your bag. Chop, mine and fish on the Skills screen; monsters drop hides, fangs and stranger things.', door: { tab: 'skills', label: 'Start a skill' } },
    'bag.seeds': { text: 'No seeds in your bag. Supplies in Shops sells every seed the farm grows, and each crop opens at its own Farming level.', door: { tab: 'shops', label: 'Visit Shops' } },
    'bag.bones': { text: 'No bones in your bag. Many monsters leave bones behind, and burying them at the altar trains Prayer.', door: { tab: 'combat', label: 'Find a fight' } },
    'bag.tools': { text: 'No tools in your bag. Smithing and Crafting both make them, and the best one you own speeds up its skill on its own.', door: { skill: 'smithing', label: 'Go to Smithing' } },
    'bag.comp': { text: 'No companion items in your bag. Companions live in the Stable, with a note on where each one is found.', door: { tab: 'stable', label: 'Open the Stable' } },
    'stall.outOf': { text: 'Out of {item} — {skill} stopped. More from: {source}', vars: ['item', 'skill', 'source'] },
    'stall.outOfBare': { text: 'Out of {item} — {skill} stopped, nothing left to use.', vars: ['item', 'skill'] },
    'stall.locked': { text: 'Recipe not learned — {skill} stopped. Read its recipe scroll from your bag first.', vars: ['skill'] },
    'farm.noSeeds': { text: 'No seeds to plant. Supplies in Shops sells every seed the farm grows.' },
    'farm.seedsAboveLevel': { text: 'Your seeds need a higher Farming level. Supplies in Shops has seeds for every level.' },
    'war.locked': { text: 'You are combat level {have}; this opens at {need}.', vars: ['have', 'need'] },
    'bounty.notPosted': { text: 'Contract tier follows your combat level. {types} contracts are not on the board.', vars: ['types'] },
    'home.dailyDone': { text: 'All daily quests done. A new set arrives at midnight UTC.' },
    'chronicle.recentEmpty': { text: 'Nothing yet this session. Your recent toasts are kept here until you reload.' },
    'chronicle.milestonesNone': { text: 'No milestones yet. Rank-ups, first boss kills and new homes are kept here.' },
  }),
  labels: Object.freeze({
    'bounty.heading': 'On the board',
    'bounty.cull': 'Cull',
    'bounty.hard': 'Hard contracts',
    'war.clanClosed': 'Clans closed',
  }),
});
