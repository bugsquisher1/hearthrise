// src/data/mark-lore.js — the six named marks of a skill's climb and the one
// Mastery line per skill (src/features/climb-marks.js, its only importer).
// Client-only display text, never a stat and never packed for the edge:
// tests/lore-notes.mjs LORE-17 keys the marks by CLIMB_MARKS, LORE-18 the
// Mastery lines by SKILLS_DEF id, LORE-4/5/6 hold the charset, length and
// vocabulary, LORE-7 keeps it off the hr-accrue payload.

export const CLIMB_MARKS = Object.freeze([10, 25, 50, 75, 92, 99]);

export const MARK_NAMES = Object.freeze({
  '10': 'First Notch',
  '25': 'Steady Stride',
  '50': 'Old Hand',
  '75': "Master's Nod",
  '92': 'Halfway Stone',
  '99': 'Mastery',
});

export const MARK_LORE = Object.freeze({
  '10': 'The tools have stopped feeling borrowed and started feeling like yours, which is the first sign anyone gets that a chore has become a trade',
  '25': 'Folk on the road have started asking you how it is done, and the strange part is that you mostly know the answer without stopping to think',
  '50': 'Plenty in the valley do this for a living, and these days they stop to watch you work, though you would never be so rude as to notice',
  '75': 'The masters who taught the masters would nod at your work now, and a nod from any of them is worth more than a season of other praise',
  '92': "By the ledger's own count you have done half the work it takes to reach the summit, and the second half starts with whatever you do next",
  '99': 'There is nothing left in this craft that the valley can teach you, only whatever you decide to teach the next one who comes to you asking',
});

export const MASTERY_LORE = Object.freeze({
  attack: 'Every blade in the valley will answer to your hand now, and the old duelling masters would think twice before they crossed swords with you',
  strength: 'Your swing lands like a falling tree, and the smiths have started asking you to test their work because nothing else they own can break it',
  defense: 'Blows that once would have felled you now glance away like rain off a roof, and the heaviest plate in the realm sits on you like a coat',
  hitpoints: 'Your body has learned to carry a hard day and still walk home at the end of it, and the old soldiers greet you as one of their own',
  prayer: 'The old rites come to you as easily as breathing, and the shrine keepers step aside when you come to lay the dead to rest',
  magic: 'The runes answer before you have finished asking, and the archmages in their towers have started to wonder where you learned it',
  ranged: 'You can put an arrow through a knot in a fence post from the far side of the field, and the fletchers keep their finest shafts for you',
  woodcutting: 'There is no tree in the valley you cannot bring down clean, and the old foresters now send their apprentices to watch you work',
  mining: 'You read the hill like a letter from an old friend, and there is no seam so deep or so stubborn that it will not open for your pick',
  fishing: 'The fish know your shadow on the water by now and seem almost resigned to it, and every angler on the bank wants to know your secret',
  farming: 'Anything you plant comes up green and tidy, and the other farmers have taken to asking your opinion before they sow a single row',
  cooking: 'Folk ride in from the far villages to eat at your table, and even the tavern cooks have stopped pretending their stew is better',
  crafting: 'Needle, knife and awl sit easy in your hands now, and the stall keepers in town have taken to asking how you finish your seams',
  smithing: 'Your hammer rings a note the whole valley recognises, and the blades that leave your anvil will outlive the halls they are hung in',
  runecrafting: 'Blank stones seem to wait for your touch, and the old binders at the altar have started to leave the most stubborn stones for you',
  stonemason: 'Walls you raise will be standing when the names of the lords who paid for them are long forgotten, and every mason in the quarry knows it',
  bountyHunter: 'The hunt masters speak your name in the same breath as the old legends, and the notices on the board are read aloud in your hearing',
});
