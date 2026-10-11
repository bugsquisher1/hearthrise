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

/* "Defeat 3 Wolves", "Collect 5 Wolf Pelts", "Collect 5 Grave Dust". Only the
   LAST word moves; a name that is already plural, or a mass noun, stays put. */
const IRREGULAR = { Wolf: 'Wolves', Cyclops: 'Cyclopes', Colossus: 'Colossi', Thief: 'Thieves', Elf: 'Elves' };
const MASS = new Set(['Dust', 'Gel', 'Ichor', 'Ore', 'Essence', 'Meat', 'Coal', 'Silk', 'Steel', 'Scrip', 'Chitin', 'Gilding']);
export function pluralName(name, n) {
  const s = String(name == null ? '' : name).trim();
  if (n === 1 || !s || isPluralName(s)) return s;
  const words = s.split(/\s+/);
  const last = words.pop();
  let p;
  if (MASS.has(last)) p = last;
  else if (IRREGULAR[last]) p = IRREGULAR[last];
  else if (/(s|x|z|ch|sh)$/i.test(last)) p = last + 'es';
  else if (/[^aeiou]y$/i.test(last)) p = last.slice(0, -1) + 'ies';
  else p = last + 's';
  return words.concat(p).join(' ');
}

export function withArticle(name) {
  const s = String(name == null ? '' : name).trim();
  if (isPluralName(s)) return s;
  return (/^[aeiou]/i.test(s) ? 'an ' : 'a ') + s;
}

if (typeof window !== 'undefined') {
  window.withArticle = withArticle;
  window.pluralName = pluralName;
}
