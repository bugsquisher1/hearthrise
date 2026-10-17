// ============================================================
// src/data/glyphs-extra.js — HAND-AUTHORED glyph atlas appendix.
//
// `src/data/glyphs.js` is GENERATED (baked game-icons.net paths) and carries a
// "do not hand-edit" banner, so anything drawn by hand for Hearthrise lives
// here instead and merges into the same `window.HR_GLYPHS` map. Loads AFTER
// glyphs.js and BEFORE icon-set.js, which reads the merged map synchronously.
//
// WHY THIS FILE EXISTS: the atlas had no `runecrafting` and no `stonemason`
// key, so those two skills fell through to their data-file emoji (🔮 / 🧱) —
// and `stripChromeEmoji()` then removed the emoji and left a HOLE. Two skills
// in the skills rail and the character sheet rendered an EMPTY medallion for
// several builds (art-director log 2026-08-19, DISCOVERIES 2026-08-17).
// Stripping is strictly worse than drawing; this is the drawing.
//
// HOUSE RULES for anything added here:
//   • 512x512 viewBox, ONE `d` string, filled (no stroke) — icon-set.js renders
//     `<path fill="…" d="…"/>` and nothing else.
//   • NONZERO fill only. There is no fill-rule="evenodd" in the renderer, so a
//     glyph must be built from SOLID shapes wound the same way — never from an
//     outline that relies on a counter-wound hole, which would fill in solid.
//   • Read at 34px (the skill-rail medallion size) before accepting it. Bold
//     silhouette, no hairlines, no interior detail smaller than ~24 units.
//   • No colour. The medallion supplies the ring hue; the glyph is one fill.
// ============================================================
(function () {
  'use strict';
  var EXTRA = {

    /* runecrafting — a bind-rune (an Algiz stave with a lozenge crown).
       NOT a rune-STONE: a slab silhouette at 34px is a rounded rectangle and
       collides with uiBook/uiChest; the rune mark itself is the only part of
       the subject that survives the size. Reads distinct from `magic` (a
       swirl) and `uiSpark` (a star) because it is rigid and axial. */
    /* WEIGHT NOTE (revised after looking at it in the rail at 34px): the first
       cut used a 36-unit stave and 26-unit arms, which is ~7% of the 512 box.
       Beside game-icons' own glyphs — which fill 85-90% of the box with SOLID
       mass — it read as a thin antenna and disappeared inside its medallion.
       Every stroke here is now 48-56 units and the mark spans the full box. */
    runecrafting:
      'M256 4L312 56 256 108 200 56Z' +                          /* crown lozenge */
      'M232 100h48v386h-48z' +                                   /* stave */
      'M259 237L119 94 81 130l140 143z' +                        /* left arm */
      'M253 237L393 94l38 36-140 143z',                          /* right arm */
      /* (a base plinth was tried and cut: at 34px the horizontal bar turned the
         rune into a coat-stand, and none of its neighbours in the rail sit on a
         ground line. The mark floats, like `magic` and `crafting` do.) */
  };

  window.HR_GLYPHS = window.HR_GLYPHS || {};
  Object.keys(EXTRA).forEach(function (k) {
    /* never clobber a baked path — if the generator ever ships one of these
       keys for real, the generated art wins and this row becomes dead weight
       we can delete, rather than silently overriding shipped art. */
    if (!window.HR_GLYPHS[k]) window.HR_GLYPHS[k] = EXTRA[k];
  });
})();
