// ============================================================
// src/render/article.js — "a Bone Key" / "an Arcane Tome" / "Bronze Gauntlets".
// Vowel-initial by letter; no exceptions list. A plural item name ("Apprentice
// Gloves", "Copper Studs") takes no article at all — "an Apprentice Gloves" is
// the slip tests/copy-lint.mjs exists to refuse. Pure ESM, no DOM.
// ============================================================

/* The nouns a catalogue name can END in that are plural-only. Adding a gear
   slot whose name is plural (sabatons, bracers…) is a row here. */
const PLURAL_HEADS = new Set(['Gloves', 'Boots', 'Studs', 'Gauntlets', 'Greaves', 'Chaps',
  'Vambraces', 'Slippers', 'Arrows', 'Platelegs', 'Earrings', 'Irons', 'Bones', 'Drops',
  'Chips', 'Shears', 'Tongs', 'Leggings', 'Bracers', 'Trousers', 'Sabatons']);

export function isPluralName(name) {
  const words = String(name == null ? '' : name).trim().split(/\s+/);
  return PLURAL_HEADS.has(words[words.length - 1]);
}

export function withArticle(name) {
  const s = String(name == null ? '' : name).trim();
  if (isPluralName(s)) return s;
  return (/^[aeiou]/i.test(s) ? 'an ' : 'a ') + s;
}

if (typeof window !== 'undefined') {
  window.withArticle = withArticle;
}
