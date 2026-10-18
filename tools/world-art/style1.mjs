// tools/world-art/style1.mjs — ONE STYLE IN THE WORLD (Tyler 2026-10-18: never mix the old
// art with the style-1 art). Read by tests/world-assets.mjs.
//
// Style 1 is the PixelLab "classic MMORPG readability" kit (docs/design/PIXELLAB_STYLE1_KIT.md).
// A world asset is style 1 when its sidecar says `style: 's1'` AND names where it came from:
// a PixelLab object, image, map or tileset id (tools/world-art/port-pixellab.mjs), or the hunt
// sim's style-1 assets (tools/world-art/port-hunt-sim.mjs). Everything else is old art.
//
//   [s1-retired]  a retired pre-style-1 set (hero, cellar, town, home) is loaded, or its art or
//                 atlas is still in the tree
//   [s1-orphan]   an art/world/<set> or assets/world atlas the renderer does not load (old art
//                 parked where a later row could load it again)
//   [s1-source]   a sidecar of a loaded set that is not style 1, or names no style-1 source
//   [s1-ref]      something a player can reach names a sprite or terrain no loaded set carries
//                 (it would draw as a stub, or as whatever old art is put back under that id)
//   [s1-code]     client code names an atlas set the renderer does not load (`atlasPaths('hero')`,
//                 a literal `atlas-hero.json`): a screen of its own drawing old art (the Gear doll did)
//
// What a player can reach (reachableRefs): every map row's ground, objects, faces and the wall
// kit, floor and roof of every building that is not painted; every house-layout piece, trophy
// mount and room signpost; the town's peer looks and crier; every hero outfit; every monster of
// every hunt a map renders (the sprite id is the monster id) and of its ground's pockets; and the
// sprite ids the scenes name in code (the loot bag).
// PURE: data in, findings out; the test does the reading.

export const RETIRED_SETS = Object.freeze(['hero', 'cellar', 'town', 'home']);
/* sprite ids the world scenes name in code rather than in data (src/world/hunt-scene.js, home-scene.js) */
const CODE_SPRITES = Object.freeze(['loot_bag', 'signpost']);

/** Is this sidecar style 1, with a style-1 source? */
function isStyle1(sc) {
  if (!sc || sc.style !== 's1') return false;
  const pl = sc.pixellab || {};
  const fromLab = !!(pl.object || pl.image || pl.map || pl.tileset || pl.id);
  const fromSim = typeof sc.notes === 'string' && sc.notes.includes('prototypes/hunt-sim-assets');
  return fromLab || fromSim;
}

/**
 * @param {{maps: object[], layouts: object, trophySprites: object, peerLooks: string[], crier: string,
 *          outfits: string[], huntIndex: object, grounds: object}} d
 * @returns {{what: string, id: string, kind: 'sprite'|'terrain'}[]}
 */
export function reachableRefs(d) {
  const out = [];
  const spr = (what, id) => out.push({ what, id, kind: 'sprite' });
  const ter = (what, id) => out.push({ what, id, kind: 'terrain' });
  for (const m of d.maps) {
    ter(m.id + ' ground', m.ground);
    for (const o of m.objects || []) spr(m.id + ' object at ' + o.x + ',' + o.y, o.id);
    for (const f of m.faces || []) spr(m.id + ' face at ' + f.x + ',' + f.y, f.id);
    for (const b of m.buildings || []) {
      if (b.painted) continue;
      for (const k of ['_wall', '_wall_door'].concat(b.windows && b.windows.length ? ['_wall_window'] : [], b.closed ? [] : ['_cap', '_cap_h', '_cap_w', '_stub', '_end'])) spr(m.id + ' building ' + b.id, b.wall + k);
      spr(m.id + ' building ' + b.id + ' roof', b.roof && b.roof.kind);
      spr(m.id + ' building ' + b.id + ' door', 'door');
      if (b.chimney != null) spr(m.id + ' building ' + b.id + ' chimney', 'chimney');
      if (!b.closed) ter(m.id + ' building ' + b.id + ' floor', b.floor);
    }
    for (const h of m.hunts || []) {
      const hunt = d.huntIndex[h];
      for (const s of (hunt && hunt.spawns) || []) spr(m.id + ' hunt ' + h + ' monster', s.monster);
      const g = d.grounds[h];
      for (const p of (g && g.pockets) || []) for (const s of p.spawns) spr(m.id + ' ground ' + h + ' pocket monster', s.monster);
    }
  }
  for (const [map, L] of Object.entries(d.layouts)) {
    for (const [room, def] of Object.entries(L.rooms)) for (const rung of def.rungs) for (const p of rung) spr(map + ' room ' + room, p.id);
  }
  for (const id of Object.values(d.trophySprites)) spr('trophy mount', id);
  for (const id of d.peerLooks) spr('town peer look', id);
  spr('town crier', d.crier);
  for (const id of d.outfits) spr('hero outfit', id);
  for (const id of CODE_SPRITES) spr('a scene names it in code', id);
  return out;
}

/** Atlas sets a source file names: atlasPaths('<set>') and literal atlas-<set>.json/.png paths. */
export function codeSets(src) {
  const out = new Set();
  for (const m of src.matchAll(/atlasPaths\(\s*['"]([a-z0-9_]+)['"]\s*\)/g)) out.add(m[1]);
  for (const m of src.matchAll(/atlas-([a-z0-9_]+)\.(?:json|png)/g)) out.add(m[1]);
  return [...out];
}

/**
 * @param {{atlasSets: string[], artSets: string[], builtSets: string[],
 *          sidecars: {[set: string]: object[]}, refs: object[], code?: {file: string, sets: string[]}[]}} d
 *   atlasSets: ATLAS_SETS (what the renderer loads); artSets: art/world/* dirs; builtSets: assets/world atlas names
 * @returns {{rule: string, detail: string}[]}
 */
export function style1Findings(d) {
  const out = [];
  const bad = (rule, detail) => out.push({ rule, detail });
  for (const s of RETIRED_SETS) {
    if (d.atlasSets.includes(s)) bad('s1-retired', 'the renderer loads the retired pre-style-1 set "' + s + '"');
    if (d.artSets.includes(s)) bad('s1-retired', 'art/world/' + s + ' (retired pre-style-1 art) is still in the tree');
    if (d.builtSets.includes(s)) bad('s1-retired', 'assets/world/atlas-' + s + ' (retired pre-style-1 atlas) is still in the tree');
  }
  for (const s of d.artSets) if (!d.atlasSets.includes(s) && !RETIRED_SETS.includes(s)) bad('s1-orphan', 'art/world/' + s + ' is not a set the renderer loads (src/data/world/atlas-sets.js)');
  for (const s of d.builtSets) if (!d.atlasSets.includes(s) && !RETIRED_SETS.includes(s)) bad('s1-orphan', 'assets/world/atlas-' + s + ' is not a set the renderer loads');
  const sprites = new Map(), terrains = new Map();
  for (const set of d.atlasSets) {
    for (const sc of d.sidecars[set] || []) {
      if (!isStyle1(sc)) bad('s1-source', set + '/' + sc.id + ' is not style-1 art (no `style: "s1"` with a PixelLab or hunt-sim source)');
      (sc.class === 'terrain' ? terrains : sprites).set(sc.id, set);
    }
  }
  for (const c of d.code || []) for (const s of c.sets) if (!d.atlasSets.includes(s)) bad('s1-code', c.file + ' names atlas set "' + s + '", which the renderer does not load');
  for (const r of d.refs) {
    const have = r.kind === 'terrain' ? terrains : sprites;
    if (!r.id || !have.has(r.id)) bad('s1-ref', r.what + ' names ' + r.kind + ' "' + r.id + '", which no loaded style-1 set carries');
  }
  return out;
}
