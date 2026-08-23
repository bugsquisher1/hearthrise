// ============================================================
// src/render/doll-layout.js — THE PAPER-DOLL LAYOUT (one table, every mount)
//
// WHY THIS FILE EXISTS. Hearthrise drew equipment TWICE and neither drawing
// was a paper-doll. `buildTibiaDoll` (Character > Equipment and the Inventory
// Equip column) laid fourteen slots out as a 4x4 TABLE — cape, helmet,
// necklace, ammo across the top; weapon, body, offhand, earrings under it —
// and the Fight screen's loadout rail (`renderDoll` in combat-screens.js) let
// twelve slots auto-flow into three columns in array order, which rendered as
// Weapon/Offhand/Ammo, Necklace/Helmet/Body, Pants/Cape/Gloves,
// Boots/Ring 1/Ring 2. Both are spreadsheets of gear. Neither tells you where
// on a body a thing is worn, and the two disagreed with each other, so the
// same slot sat in a different place depending on which screen you opened.
//
// THE SHAPE. The canonical idle/MMO doll every player already knows
// (RuneScape / Melvor Idle), three columns wide:
//
//        col 1        col 2        col 3
//   1      ·          HELMET         ·
//   2    CAPE        NECKLACE      AMMO
//   3    WEAPON       BODY        OFFHAND
//   4    GLOVES       PANTS        BELT
//   5    RING 1       BOOTS       RING 2
//   6      ·         EARRINGS       ·
//
// Rows 1-3 are the canonical arrangement, unchanged. Row 4 is the waist band
// (hands and belt beside the legs). Row 5 is Tyler's preferred ring
// treatment — the pair flanking the boots, so two identical ring glyphs read
// as a mirrored pair rather than as two unrelated tiles. Row 6 is the tail:
// Hearthrise has FOURTEEN gear slots against RuneScape's eleven, and a
// fourteen-slot doll cannot fit five rows without filling all but one cell —
// at which point the notch at the waist disappears and it is a table again.
// The two blank cells at the apex and the two at the tail are the silhouette;
// they are load-bearing, not wasted space.
//
// COMPACTION. `place()` renumbers rows so a mount that omits slots does not
// reserve empty tracks. The Fight rail carries no belt and no earrings, so
// row 6 is empty there and the rail draws FIVE rows, not six — while every
// slot it does draw keeps the same column and the same relative row as on
// Character. One shape, two slot sets.
//
// This is a LAYOUT table, not game content: it says where a slot is drawn,
// never what it does. It is a classic script (loaded from index.html before
// equipment-doll.js) so both the classic doll renderer and the ESM combat
// screen can read it off `window` at call time without an import edge.
// ============================================================
(function () {
  'use strict';

  var COLS = 3;

  /* slot id -> [column, row], 1-based, in the AUTHORED grid. Never read this
     directly for rendering — go through place(), which compacts. */
  var LAYOUT = {
    helmet:   [2, 1],
    cape:     [1, 2], necklace: [2, 2], ammo:   [3, 2],
    weapon:   [1, 3], body:     [2, 3], shield: [3, 3],
    gloves:   [1, 4], pants:    [2, 4], belt:   [3, 4],
    ring1:    [1, 5], boots:    [2, 5], ring2:  [3, 5],
    earrings: [2, 6],
  };

  /* `companion` is deliberately absent: b216 moved the pet out of the gear
     grid into its own pane, and a companion is not worn on a body. A slot with
     no entry here is APPENDED unplaced rather than dropped, so adding a slot to
     EQUIP_SLOTS can never make it vanish — it lands in auto-flow and the
     DOLL-LAYOUT smoke guard says so. */
  function has(slot) { return Object.prototype.hasOwnProperty.call(LAYOUT, slot); }

  /**
   * Place a mount's slot set into the doll.
   * @param  {string[]} slots  the slot ids this mount draws
   * @return {{pos:Object, order:string[], unplaced:string[], cols:number, rows:number}}
   *         pos[slot] = [column, row] with rows COMPACTED to the ones in use;
   *         order = the same slots sorted top-to-bottom, left-to-right, so DOM
   *         order matches reading order (tab order and screen readers follow
   *         the DOM, not the grid).
   */
  function place(slots) {
    var list = (slots || []).filter(has);
    var unplaced = (slots || []).filter(function (s) { return !has(s); });

    var usedRows = {};
    list.forEach(function (s) { usedRows[LAYOUT[s][1]] = true; });
    var rows = Object.keys(usedRows).map(Number).sort(function (a, b) { return a - b; });
    var rowIndex = {};
    rows.forEach(function (r, i) { rowIndex[r] = i + 1; });

    var pos = {};
    list.forEach(function (s) { pos[s] = [LAYOUT[s][0], rowIndex[LAYOUT[s][1]]]; });

    var order = list.slice().sort(function (a, b) {
      return (pos[a][1] - pos[b][1]) || (pos[a][0] - pos[b][0]);
    }).concat(unplaced);

    return { pos: pos, order: order, unplaced: unplaced, cols: COLS, rows: rows.length };
  }

  window.HearthriseDollLayout = { LAYOUT: LAYOUT, COLS: COLS, place: place, has: has };
})();
