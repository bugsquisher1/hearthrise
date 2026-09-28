// ============================================================
// src/render/foe-family.js — the family word printed beside a foe's name.
//
// The ruling (b561): a name never repeats its own family. "Fire Elemental" is
// already an Elemental, so its meta line reads "Tier 1", not "Elemental ·
// Tier 1". The data keeps the family (the Bestiary and charms group by it);
// only the words beside the name drop it.
//
// Pure ESM, no DOM.
// ============================================================

/** The family word to print beside `m.name`, or '' when the name ends with it. */
export function foeFamily(m, fallback = '') {
  const fam = (m && m.family) || fallback;
  const name = String((m && m.name) || '').trim().toLowerCase();
  const f = String(fam).trim().toLowerCase();
  if (f && (name === f || name.endsWith(' ' + f))) return '';
  return fam;
}
