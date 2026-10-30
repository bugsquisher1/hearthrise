// ════════════════════════════════════════════════════════════════════════
// src/world/scene-sets.js — WHICH ATLAS SETS A SCENE DRAWS FROM.
//
// The World pane loads a set's image only when a scene that draws from it is
// about to show (src/world/atlas.js createSceneImages): the town never pulls a
// hunting ground's sheet, and a ground pulls its own on entry (10-23 measure:
// every set on Play was 2.32 MB of PNG and ~45 MB decoded). What a scene needs
// is DERIVED, never authored, so a new map, ground, monster or effect is one
// data row and nothing here changes:
//   placed   what the renderer itself places on the map: compose.js's own
//            ground (groundOf, shared with the renderer) + composeFrame over the WHOLE map, once with no hero
//            and once with the hero inside each walk-in building (its inside
//            walls), every frame lookup recorded. No second copy of the
//            placement rules.
//   actors   what walks or plays over it (actorIds): every hero outfit (yours
//            and everyone else's); on a hunt map every monster its grounds and
//            hunts spawn, their gather nodes and every hunt effect; at home
//            every piece of furniture, its signposts and the trophy mounts; in
//            the Common the sandbox's entry sign.
// tests/world-core.mjs (family A) proves it covers what each shipped scene draws, and no more.
// PURE: no DOM, no window, no G.
// ════════════════════════════════════════════════════════════════════════
import { groundOf, groundOfSliced, composeFrame, sliced } from './core/compose.js?v=0.2.71';
import { HUNT_INDEX } from '../data/hunts.js?v=0.2.71';
import { HUNT_GROUNDS, gatherNodesOf } from '../data/hunt-grounds.js?v=0.2.71';
import { OUTFITS } from '../data/hunt-outfits.js?v=0.2.71';
import { effectIds } from '../data/hunt-vfx.js?v=0.2.71';
import { ROOM_LAYOUTS, TROPHY_MOUNT_SPRITES } from '../data/world/house-layouts.js?v=0.2.71';
import { SANDBOX } from '../data/world/sandbox.js?v=0.2.71';
import { furnish } from './home-scene.js?v=0.2.71';

/** The monsters (and gather-node art) of every ground drawn on map `row` and every hunt it renders. */
function groundIds(row, ids) {
  const hunts = new Set(row.hunts || []);
  for (const h of hunts) for (const s of (HUNT_INDEX[h] || {}).spawns || []) ids.add(s.monster);
  for (const g of Object.values(HUNT_GROUNDS)) {
    if (g.map !== row.id && !hunts.has(g.hunt)) continue;
    for (const p of g.pockets) for (const s of [...p.spawns, ...(p.pack || [])]) ids.add(s.monster);
    for (const n of gatherNodesOf(g)) { if (n.sprite) ids.add(n.sprite); if (n.spent) ids.add(n.spent); }
  }
}

/** Every sprite id a scene on map row `row` may draw that the map itself does not place. */
function actorIds(row) {
  const ids = new Set(Object.values(OUTFITS));
  if (row.kind === 'hunt') {
    groundIds(row, ids);
    for (const id of effectIds()) ids.add(id);
  }
  const layout = ROOM_LAYOUTS[row.id];
  if (layout) {
    for (const def of Object.values(layout.rooms)) for (const rung of def.rungs) for (const piece of rung) ids.add(piece.id);
    for (const sign of furnish(row.id, {}, null)) ids.add(sign.id);
    for (const id of Object.values(TROPHY_MOUNT_SPRITES)) ids.add(id);
  }
  if (SANDBOX.open && SANDBOX.entry.map === row.id) ids.add(SANDBOX.entry.sprite);
  return ids;
}

/**
 * The sets a scene on `map` (compileMap output of row `row`, base grid) draws from: a sorted array.
 * @param {object} map
 * @param {object} row  the map's row (src/data/world/maps)
 * @param {object} book  createBook() over every manifest (the sprite → set index)
 * @param {{materials: object}} tables
 */
export function sceneSets(map, row, book, tables) {
  const it = sceneSetsSteps(map, row, book, tables);
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}

/** sceneSets in slices (compose.js sliced): the town's whole-map passes were one 12-28 ms task (perf lane 10-28). */
export function sceneSetsSliced(map, row, book, tables, o) {
  return groundOfSliced(map, book, tables, map.T || 32, o).then(() => sliced(sceneSetsSteps(map, row, book, tables), o));
}

/* sceneSets as STEPS: the ground's tiles, each whole-map compose, the actors; the same sets whichever way it runs */
function* sceneSetsSteps(map, row, book, tables) {
  const sets = new Set();
  const note = (s) => { if (s) sets.add(s); return s; };
  const rec = Object.assign({}, book, {
    frame: (...a) => { const f = book.frame(...a); note(f.set); return f; },
    tile: (...a) => { const t = book.tile(...a); if (t) note(t.set); return t; },
  });
  const T = map.T || 32;
  const whole = { ox: 0, oy: 0, w: map.w * T, h: map.h * T };
  /* the ground's sheets are its tiles' (every terrain lookup that draws is a tile): the one shared ground, not a second pass */
  for (const t of groundOf(map, book, tables, T).tiles) note(t.set);
  yield;
  composeFrame(map, rec, { hero: null }, whole, tables, T);
  yield;
  /* inside a walk-in building its inside walls show (compose.js: the hero's own building) */
  for (const b of map.buildings) {
    if (b.closed || b.painted) continue;
    composeFrame(map, rec, { hero: { x: b.rect.x + 1, y: b.rect.y + 1 } }, whole, tables, T);
    yield;
  }
  for (const id of actorIds(row)) note(book.frame(id).set);
  return Array.from(sets).sort();
}
