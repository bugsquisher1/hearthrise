// ============================================================
// src/render/article.js — "a Bone Key" / "an Arcane Tome".
// Vowel-initial by letter; no exceptions list. Pure ESM, no DOM.
// ============================================================

export function withArticle(name) {
  const s = String(name == null ? '' : name).trim();
  return (/^[aeiou]/i.test(s) ? 'an ' : 'a ') + s;
}

if (typeof window !== 'undefined') {
  window.withArticle = withArticle;
}
