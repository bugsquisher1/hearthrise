// src/data/charm-lore.js — a hunter's line for every charm class and every charm rank.
// Client-only display text for the 'A charm is earned' sheet: never edge-imported,
// never a stat. Keyed by the src/core/bane.js taxonomy (extra_dimensional, with the
// underscore), which is the key the server's charm counters use. Guarded by
// tests/lore-notes.mjs (LORE-4 charset, LORE-8 class keys, LORE-9 rank ids).

export const CHARM_CLASS_LORE = Object.freeze({
  mammal: 'Fur, hoof and tooth: the beasts of the field keep to old paths, and a hunter who reads the grass reads where they will run',
  vermin: 'Rats and crawlers breed faster than any blade can thin them, so the patient hunter learns the nest and not the single tail',
  plant: 'Things that root and creep do not flee or plead; they wait, and the hunter who learns their seasons learns when they sleep',
  humanoid: 'Goblins and their kin keep grudges, banners and bad maps; know which chief they fear and you know which way the band will break',
  human: 'Bandits and brigands were farmers once, and the hunter who remembers it learns where they hide and what they will not leave behind',
  undead: 'The dead do not tire, but they do remember; every grave you close teaches you how the next one will try to climb back out',
  demon: 'Demons bargain even as they burn, and a hunter who has heard enough of their offers learns to hear the lie beneath the heat',
  dragon: 'A dragon is patient as a mountain and twice as proud, and those who study one learn that pride leaves its flank open at dusk',
  elemental: 'Storm, ember and stone given a will: an elemental has no heart to pierce, only a nature to learn and turn against itself',
  construct: 'Golems and clockwork do only what they were built to do; find the maker’s habit and every one of them walks into it again',
  extra_dimensional: 'They step in from somewhere the maps end, and what hurts them hides behind the folding air until a hunter learns to look',
});

export const CHARM_RANK_LORE = Object.freeze({
  studied: 'Your notes fill the first page now: how they move, where they rest, and the one thing their kind cannot abide',
  marked: 'They know your scent by now; the packs thin where you walk, and what they carry falls to you a little more often',
  hunter: 'The old hunters nod when you pass the lodge, for you have learned this kind well enough to teach it, and they can tell',
  banesworn: 'Your name is carved over the lodge door beside the oldest ones, and this kind will whisper it to their young for an age',
});
