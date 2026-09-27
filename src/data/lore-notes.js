// src/data/lore-notes.js — companion notes, rank lore and trophy-stage lore.
// Client-only display text: never imported by an edge-reachable module, never
// a stat. Rendered as raw HTML, so tests/lore-notes.mjs (LORE-4 charset) is the
// injection guard as well as the coverage guard (LORE-1..3 pin one line per
// COMPANIONS id, per renown rank, per TROPHY_STAGES id).

export const COMPANION_NOTES = Object.freeze({
  fox: 'The fox was there before you pitched the first tent, and has decided, for reasons of its own, that the camp is now partly its responsibility',
  wolf_pup: 'A pup that lost its pack follows whoever feeds it, and grows up believing every fight you pick was its own idea',
  sparrow: 'A sparrow on the shoulder asks for crumbs and pays in song, and it always spots the next good tree before you do',
  bunny: 'Nobody who has kept a bunny near a vegetable patch believes it is there to help, and yet the rows somehow come up fuller',
  honeybee: 'One honeybee is a curiosity; the hive it came from is the reason every cook in the valley leaves the kitchen window open',
  badger: 'A badger does not start fights, finish them politely or leave before they are over, which makes it the ideal second in a brawl',
  hawk: 'A hawk circling overhead sees the glint of something worth having long before anyone on the ground thinks to look down',
  whelp: 'Hatched warm and hungry, a dragon whelp is small enough to carry for about a week, and after that it is carrying you',
  scorpion: 'It rides in a boot or a pocket without complaint, and nobody who has watched it strike has ever asked to hold it',
  raccoon: 'A raccoon cannot be trained, only bribed, and it pays its keep in coins it swears it found lying about',
  owl: 'The owl keeps the late watch over the shrine, and seems to know the old prayers better than whoever is saying them',
  tortoise: 'Slow to start and slower to stop, the tortoise has outlived three owners and considers you a promising fourth',
  beaver: 'A beaver judges a woodcutter by the stump, and follows the one whose cuts are clean enough to be worth finishing',
  rock_golem: 'Stone that walked out of the quarry one morning and never went back, it breaks rock the way a baker breaks bread',
  heron: 'A heron stands so still in the shallows that the fish forget it is there, which is the whole of its advice to anglers',
  squirrel: 'A squirrel buries far more than it will ever remember, and the garden is always greener wherever it forgot',
  phoenix_chick: 'A phoenix chick sleeps in the embers of the cooking fire, and that fire has not once gone out since it moved in',
  forge_imp: 'An imp that fell in love with the forge and would not leave it, now the only apprentice who works the bellows unasked',
  silkling: 'A silkling spins thread as fine as anything from the southern looms, and takes offence at any seam it did not sew',
  grave_wisp: 'A small cold light that drifts over the graves on quiet nights, drawn to anyone who lays the dead to rest with care',
  lichling: 'What is left of a lich once it has been beaten down far enough to follow you, and it has not forgiven anyone for it',
  dragonling: 'Hatched from the hoard of a slain dragon, it inherited the fire, the temper and a deep interest in anything that glitters',
});

export const RANK_LORE = Object.freeze({
  peasant: 'You own a bedroll, a borrowed axe and a good deal of ambition, which is more than most people in the valley can say',
  serf: 'The steward has learned your name and writes it in the ledger beside the work you did, which is how every name in history began',
  squire: 'A knight of the valley has noticed you, mostly because you keep turning up wherever the work is hardest',
  knight: 'You kneel in the mud and stand up with a title, and from now on people expect you to act as though you meant it',
  baron: 'The valley swears you its fealty now, and asks in return only that you keep the roads clear and the wolves hungry',
  viscount: 'Your banner hangs in halls you have never visited, and people you have never met argue over what you would do',
  count: 'You keep a seat at the market now, and merchants lower their voices whenever your steward walks past',
  marquis: 'You hold the border marches, so every trouble from beyond the hills reaches your gate before it reaches anyone else',
  duke: 'Your word settles quarrels three valleys away, and even your enemies have started writing to you politely',
  prince: 'The old families bow when you enter and whisper when you leave, and both of those are a kind of respect',
  king: 'The crown is heavier than it looks, and the realm expects you to wear it to every harvest, siege and wedding',
  highking: 'Kings kneel to you now, and the valley that once lent you a bedroll tells stories about the night you first slept in it',
});

export const TROPHY_LORE = Object.freeze({
  quarry: 'You have hunted this one long enough to know its tracks from any other, and the first trophy goes up on the wall',
  stalker: 'It knows you now as well as you know it, and it no longer runs in quite the same direction when you come',
  slayer: 'Hunters speak of this beast and of you in the same breath, and the wall is running out of room for heads',
  nemesis: 'Somewhere its kind tells stories about you to frighten their young, and you have earned every word of them',
});

const pick = (map, key) => (Object.prototype.hasOwnProperty.call(map, key) ? map[key] : '');
export const companionLore = (id) => pick(COMPANION_NOTES, id);
export const rankLore = (id) => pick(RANK_LORE, id);
export const trophyLore = (stageId) => pick(TROPHY_LORE, stageId);
