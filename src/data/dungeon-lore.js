// src/data/dungeon-lore.js — one line per DUNGEONS id, the Spoils sheet's
// "what this clear means" line (src/render/spoils-sheet.js, its only importer).
// Client-only display text, never a stat and never packed for the edge:
// tests/lore-notes.mjs LORE-16 keys it by DUNGEONS id, LORE-4/5/6 hold the
// charset, length and vocabulary, LORE-7 keeps it off the hr-accrue payload.

export const DUNGEON_CLEAR_LORE = Object.freeze({
  crypt_of_bones: 'The Marrow King lies still at last, and the Crypt of Bones is quiet enough to hear your own heartbeat on the long climb out',
  goblin_warcamp: 'Grimtusk is down and the Goblin Warcamp scatters into the hills, every runaway goblin carrying the tale of your blade to the next camp',
  haunted_archive: 'The Pale Archivist has closed its final book, and the Haunted Archive now lets you walk its stacks as a reader, not a trespasser',
  obsidian_keep: 'The Obsidian Throne stands empty, and the black walls of the Keep will whisper your name to whoever dares to climb them after you',
  voidbringer: 'The Riftmaw is driven back through its own wound in the sky, and for a little while the stars over the valley hold still for you',
  ancient_wyrm: 'Elderscale has fallen to your hand, and every hearth in the valley will argue for a generation over who saw the Ancient Wyrm die',
});
