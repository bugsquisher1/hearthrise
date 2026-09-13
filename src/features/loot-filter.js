/* ============================================================================
   src/features/loot-filter.js — THE BAG'S STANDING KEPT-CLASSES FILTER.

   Priority board §10 row 1, the sell-lock's other half. The inventory strip's
   category is a MOMENTARY lens (`window._invFilter.category`, scratch, reset on
   every reload); this is the player's STANDING set of classes the bag keeps in
   view, persisted as the `lootFilter` residue field — whose full contract, bounds
   and fail-safes are written once at src/net/client-state.js §THE LOOT FILTER.

   IT HIDES; IT NEVER DISCARDS. The server owns the inventory (CLAUDE.md §1), so
   nothing here removes, sells or refuses an item: `keeps()` only decides what
   `renderInvFancy` PAINTS, and a filtered view claims no bag capacity either.

   THE CLASS SET IS DERIVED, NEVER TYPED — `window.CATEGORIES` minus the 'all'
   pseudo-row, read at CALL time, the same predicates over the same `src/data`
   item fields the strip uses. A new item class is ONE row there and this filter
   gains it for free; a second hand-typed list is how a class ends up filterable
   on one surface and invisible on the other.

   A CLASSIC SCRIPT, like inv-context-menu.js: it is UI glue over legacy globals
   (`CATEGORIES`, `G`, `saveLocal`, `_renderInvFancy`), all read at call time, so
   load order cannot break it and legacy.js keeps zero new top-level functions
   (tests/monolith-ratchet.mjs — new logic does not go in the monolith).
   ============================================================================ */
(function () {
  'use strict';

  /** Every filterable class: the bag's category table minus the 'all' row. */
  function classes() {
    var C = window.CATEGORIES;
    return Array.isArray(C) ? C.filter(function (c) { return c && c.id !== 'all'; }) : [];
  }

  /** The player's stored selection, always an array. */
  function want() {
    var G = window.G;
    return (G && Array.isArray(G.lootFilter)) ? G.lootFilter : [];
  }

  /** The kept classes as category objects, or null for KEEP ALL.
   *  FAIL-SAFE: a stored class this build no longer knows is ignored, and a
   *  selection with nothing recognisable in it reads as KEEP ALL rather than as
   *  an empty bag — "my items are gone" is the worst thing a display preference
   *  can be able to say, and a strict intersection would say it after a rename. */
  function kept() {
    var w = want();
    if (!w.length) return null;
    var cats = classes().filter(function (c) { return w.indexOf(c.id) !== -1; });
    return cats.length ? cats : null;
  }

  /** Does the bag paint this item definition under the standing filter? */
  function keeps(def) {
    var cats = kept();
    if (!cats) return true;
    return cats.some(function (c) { return c.test(def); });
  }

  function repaint() {
    try { if (typeof window.saveLocal === 'function') window.saveLocal(); } catch (e) {}
    if (typeof window._renderInvFancy === 'function') window._renderInvFancy();
  }

  /** Add/remove one class. An id this build cannot read is never stored. */
  function toggle(id) {
    var G = window.G;
    if (!G) return;
    if (!classes().some(function (c) { return c.id === id; })) return;
    var next = want().slice();
    var at = next.indexOf(id);
    if (at === -1) next.push(id); else next.splice(at, 1);
    G.lootFilter = next;
    repaint();
  }

  function clear() {
    var G = window.G;
    if (!G) return;
    G.lootFilter = [];
    repaint();
  }

  /** The control. Chips borrow `.invc-cat-btn`'s palette through their own class
   *  rather than declaring a colour (CLAUDE.md §7: no hardcoded colours).
   *
   *  EVERY CHIP CARRIES BOTH A GLYPH AND ITS WORD, and the word is wrapped so a
   *  short viewport can drop it (art-direction.css @media (max-height:540px)).
   *  That is load-bearing, not decoration: eleven word-labelled chips are ~770px
   *  of row, which on a 423px-tall landscape phone WRAPPED into three ranks and
   *  took them out of the item grid's window (b327, paione bug #24), and which on
   *  an 820px-wide landscape phone could not be rescued by a sideways scroller
   *  either — a scroller's content genuinely sits past the right edge, which is
   *  what the landscape overflow guard measures. Glyph-only, the same rank is
   *  ~440px and simply fits. The glyph is the bag's OWN category glyph
   *  (`CATEGORIES[].glyph`), so a new item class brings its icon for free.
   *
   *  The word is hidden by `:has(.hr-glyph)`, so if the atlas is not up yet the
   *  chip keeps its label rather than rendering as an empty box — the failure
   *  mode is a wrapped row that b327 names, never an unreadable control. */
  function rowHTML() {
    var w = want();
    var icon = function (glyph) {
      return (window.HR && typeof window.HR.icon === 'function')
        ? (window.HR.icon(glyph, 17, 'currentColor') || '') : '';
    };
    var chip = function (id, label, glyph, on) {
      return '<button class="invc-lf-chip' + (on ? ' active' : '') + '" title="Keep ' + label + '" onclick="'
        + (id ? "window.HearthriseLootFilter.toggle('" + id + "')" : 'window.HearthriseLootFilter.clear()')
        + '">' + icon(glyph) + '<span class="invc-lf-txt">' + label + '</span></button>';
    };
    return '<div class="invc-lootfilter" title="The classes your bag keeps in view. '
      + 'Remembered between sessions — your items stay in your bag either way.">'
      + '<span class="invc-lf-label">Keep</span>'
      + chip(null, 'Everything', 'uiChest', !w.length)
      + classes().map(function (c) { return chip(c.id, c.name, c.glyph, w.indexOf(c.id) !== -1); }).join('')
      + '</div>';
  }

  window.HearthriseLootFilter = {
    classes: classes, kept: kept, keeps: keeps, toggle: toggle, clear: clear, rowHTML: rowHTML,
  };
})();
