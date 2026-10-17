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
    'bag.food': { text: 'No food in your bag. Cook what you fish or farm, or buy a cooked meal under Supplies in Shops.', door: { skill: 'cooking', label: 'Go to Cooking' } },
    'bag.mats': { text: 'No materials in your bag. Chop, mine and fish on the Skills screen; monsters drop hides, fangs and stranger things.', door: { tab: 'skills', label: 'Start a skill' } },
    'bag.seeds': { text: 'No seeds in your bag. Supplies in Shops sells every seed the farm grows, and each crop opens at its own Farming level.', door: { tab: 'shops', label: 'Visit Shops' } },
    'bag.tools': { text: 'No tools in your bag. Smithing makes axes and pickaxes, and the best one you own speeds up its skill on its own.', door: { skill: 'smithing', label: 'Go to Smithing' } },
    'bag.bones': { text: 'No bones in your bag. Many monsters leave bones behind, and burying them at the altar trains Prayer.', door: { tab: 'combat', label: 'Find a fight' } },
    'foe.weak': { text: '{foe} is weak to {weapon} attacks: switch to them if you have trained that style, and every blow you land carries a bonus.', vars: ['foe', 'weapon'] },
    'foe.weakHeld': { text: 'Your {weapon} attacks are the kind {foe} is weak to, so every blow you land already carries the bonus.', vars: ['weapon', 'foe'] },
    'foe.outmatched': { text: 'You ate as you fought and still fell. {foe} out-fights you as you stand: switch to {weapon} attacks if you have trained them, carry better food, or take a softer target first.', vars: ['foe', 'weapon'] },
    'foe.outmatchedHeld': { text: 'You ate as you fought and still fell, even with the {weapon} attacks it is weak to. Carry better food, train up, or take a softer target first.', vars: ['weapon'] },
    'stall.outOf': { text: 'Out of {item} — {skill} stopped. More from: {source}', vars: ['item', 'skill', 'source'] },
    'stall.outOfBare': { text: 'Out of {item} — {skill} stopped, nothing left to use.', vars: ['item', 'skill'] },
    'stall.locked': { text: 'Recipe not learned — {skill} stopped. Read its recipe scroll from your bag first.', vars: ['skill'] },
    'farm.noSeeds': { text: 'No seeds to plant. Supplies in Shops sells every seed the farm grows.' },
    'farm.seedsAboveLevel': { text: 'Your seeds need a higher Farming level. Supplies in Shops has seeds for every level.' },
    'chronicle.recentEmpty': { text: 'Nothing yet this session. Your recent toasts are kept here until you reload.' },
    'standing.chase': { text: 'You stand {rank} on the {board} board, {gap} behind {rival}.', vars: ['rank', 'board', 'gap', 'rival'] },
    'standing.level': { text: 'You stand {rank} on the {board} board, dead level with {rival}; whoever gains next takes the place.', vars: ['rank', 'board', 'rival'] },
    'standing.crown': { text: 'You hold the {board} crown as {crown}, {gap} clear of {rival}.', vars: ['board', 'crown', 'gap', 'rival'] },
    'standing.crownAlone': { text: 'You hold the {board} crown as {crown}, and nobody else has a place on that board yet.', vars: ['board', 'crown'] },
    'standing.unranked': { text: 'You have no place on the {board} board yet; the boards are read again every few minutes.', vars: ['board'] },
    'standing.read': { text: 'The boards are read every few minutes, so what you did just now shows on the next reading.' },
    'night.statsFall': { text: 'After a fall you are knocked out and earn nothing, then fight on; a run of falls on an empty bag sends you back to camp.' },
  }),
  labels: Object.freeze({
    'standing.heading': 'Your standing',
    'standing.boards': 'Boards',
    'standing.pending': 'Reading the boards',
    'standing.podium': 'On the podium',
    'standing.ten': 'In the first ten',
    'standing.roll': 'On the honour roll',
    'foe.heading': 'Know your foe',
    'foe.notes': 'Field notes',
  }),
});
