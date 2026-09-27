// src/data/homestead-lore.js — a lore line for every room rung and farm plot tier.
// Client-only display text: never edge-imported, never a stat. Rendered as raw
// HTML, so tests/lore-notes.mjs guards it (LORE-4 charset, LORE-11 one line per
// ROOM_PERKS rung, LORE-12/13 plot tiers keyed to PLOT_TIERS and its unlocks).

export const ROOM_RUNG_LORE = Object.freeze({
  'kitchen.1': 'A flat stone by the fire, a blackened pot and a wooden spoon, and already the camp smells more like a home than a camp',
  'kitchen.2': 'Iron that holds its heat through the night means porridge is warm at dawn, and nobody has to sit up minding the flames',
  'kitchen.3': 'A proper range with an oven and a hob, and a cook who can finally turn away from the pan without smelling smoke a moment later',
  'kitchen.4': 'Two ranges back to back, one for the day’s bread and one for whatever the hunters drag home, and neither of them ever cold',
  'kitchen.5': 'A hearth wide enough to roast an ox and warm a hall, and the whole valley knows that nobody leaves this kitchen hungry',
  'forge.1': 'A clay pit, a hand bellows and an anvil on a stump, which is how every smith in the valley started out, whatever they claim',
  'forge.2': 'Stone walls hold the heat that clay let go, and for the first time the iron comes out of the fire the colour you wanted',
  'forge.3': 'Two bellows worked in turn keep the coals white, and the apprentice who works them has arms like a dock hand by summer',
  'forge.4': 'A bellows so large it is worked by a wheel, and its roar can be heard from the road long before the forge comes into sight',
  'forge.5': 'Dug down into the rock where the earth is already warm, it burns hot enough for metals the old smiths only ever read about',
  'library.1': 'A single plank on two brackets, holding a borrowed almanac and a ledger, and already the evenings pass more usefully',
  'library.2': 'A chair by the window, a good lamp and a door that shuts, and the first evening spent there is worth a week of guessing',
  'library.3': 'Real shelves from the floor to the beams, full of books bought, borrowed and not quite returned, and a ladder nobody trusts',
  'library.4': 'Scribes copy out everything the house has learned, so that no lesson paid for in sweat ever has to be paid for twice',
  'library.5': 'A hall of books with a reading table long enough for a council, and scholars from three valleys asking to be let in',
  'garden.1': 'A few rows by the back door for herbs and greens, close enough to reach from the kitchen with a wet hand and a knife',
  'garden.2': 'A wall keeps out the wind, the deer and the neighbour’s goats, and the rows inside stand straighter for it every season',
  'garden.3': 'Raised beds of good black soil, turned and fed each autumn, where even a careless planting seems to come up well',
  'garden.4': 'Panes of real glass catch the sun and keep off the frost, so the tender plants that never took in the valley take here',
  'garden.5': 'Trees planted by you and meant for your grandchildren, and the blossom in spring is the finest thing the homestead owns',
  'trophy.1': 'A single wall with a wolf pelt, a pair of antlers and one nail left bare for whatever you bring home next',
  'trophy.2': 'A proper hall for proper trophies, where guests stop in the doorway and ask, a little nervously, who did all of this',
  'trophy.3': 'Heads mounted in rows, each with a plaque and a date, and one space left empty at the end for the beast that got away',
  'trophy.4': 'Banners taken from warbands and war camps hang from the beams, and every one of them has a story you tell differently',
  'trophy.5': 'A gallery so long the far end is lost in shadow, lined with the proof of every hunt that ever mattered to the valley',
  'cellar.1': 'A hole under the floor, cool and dark, where turnips last through the winter and the cider does something interesting',
  'cellar.2': 'Stone walls and a proper stair, shelves of jars and crocks, and a cold that keeps a pie as good on the third day as the first',
  'cellar.3': 'An arched vault with a locked door, for the bottles too good to open and the preserves too precious to share',
  'cellar.4': 'Casks racked to the ceiling, each one chalked with a date and a name, and a tasting cup hung on a nail by the door',
  'cellar.5': 'Cut deep into the hill where the cold never changes, it keeps whatever is stored there exactly as it was the day it went down',
  'workshop.1': 'A bench, a vice and a rack of borrowed tools, and the first thing anyone ever makes on it is always a better bench',
  'workshop.2': 'A joiner’s bench with dogs and a tail vice, where a plank is cut true on the first try and the offcuts become pegs',
  'workshop.3': 'A pit with one sawyer above and one below, and the logs that came in as trees go out again as boards by the cartload',
  'workshop.4': 'A treadle lathe turns bowls, handles and spindles, and the shavings pile up so fast they have to be swept twice a day',
  'workshop.5': 'A shop the guild would envy, with a tool for every task and a master’s mark burned into every piece that leaves it',
  'shrine.1': 'A carved post by the path with a ledge for offerings, where travellers stop, bow their heads and walk on a little lighter',
  'shrine.2': 'An altar of dressed stone, worn smooth where hands have rested, and a bowl of water that never seems to go stale',
  'shrine.3': 'A small chapel with a bell, and on quiet evenings the whole homestead stops what it is doing when the bell is rung',
  'shrine.4': 'A locked case of old bones and older relics, and a keeper who knows the story of every one and tells it at length',
  'shrine.5': 'Bones of the valley’s honoured dead laid in patterns on the walls, and a silence so deep it can be heard from outside',
});

export const PLOT_TIER_NAMES = Object.freeze({
  1: 'The Turnip Patch',
  2: 'The Furrowed Field',
  3: 'The Market Rows',
  4: 'The Harvest Field',
  5: 'The Moonlit Acre',
});

export const PLOT_TIER_LORE = Object.freeze({
  1: 'A patch of dug earth behind the camp, fit for turnips and not much else, but it is yours and every farm starts somewhere',
  2: 'Furrows ploughed straight enough for carrots and wheat, and a scarecrow that fools the crows about half of the time',
  3: 'Rows long enough to sell from, with potatoes swelling below the ground and tomatoes climbing their canes above it',
  4: 'A field that fills a cart each harvest, with pumpkins in the low ground and goldenroot wherever the sun lies longest',
  5: 'The farthest acre, where emberfruit ripens warm to the touch and moonbloom opens only after the lamps are lit',
});

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

export function roomRungLore(id, n) {
  const k = id + '.' + n;
  return has(ROOM_RUNG_LORE, k) ? ROOM_RUNG_LORE[k] : '';
}

export function plotTier(n) {
  return has(PLOT_TIER_NAMES, n) ? { name: PLOT_TIER_NAMES[n], line: PLOT_TIER_LORE[n] } : null;
}
