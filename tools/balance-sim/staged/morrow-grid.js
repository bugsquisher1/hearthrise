// ============================================================================
// tools/balance-sim/staged/morrow-grid.js — THE MORROW HILLS' UNIQUE GRID: WHICH PLACE DROPS WHICH WEAPON FAMILY AND WHICH ARMOR CELL
// (docs/design/itemization-plan.md Appendix A, Finding 1; the designer's ruling 2026-11-18 row 1b, PRIORITY_BOARD "2026-11-18 Designer
// rulings": "The grid wins").
//
// The grid is the region's template filled in: every weapon family appears twice by Level 165, and the 15 armor cells (helmet, body,
// legs, boots, gloves in plate, leather and cloth) plus the shield and the spellbook are each covered by Level 142. A staged unique whose
// home is a Morrow place sits on one of that place's cells (tests/weapon-line.mjs WL7, tests/armor-line.mjs AL7), so a sample can't be
// dropped wherever its numbers happen to read best, which is what the Roost's four were (a sword and three plate pieces on the bow's ground).
//
// A PLACE is a ground (`ground`: its HUNT_GROUNDS id) or a boss fought from one (`boss: true`, `at`: the ground its room is called from).
// A place not built yet carries `planned: { band }` (its band from the region plan, docs/design/itemization-plan.md §2 and the board's
// "2026-11-14 The Morrow Hills"); a planned boss reads its ground's band. A sample on a planned place says so (`source.planned: true`): it
// drops nowhere yet, so the grader never wears it (gear.mjs) and its home, its element and its own-ground win wait for the place. The day
// the place is built, its row here loses `planned` and names its ground, and the guards hold every sample on it to a real monster
// (WL7/AL7: a built place with a planned sample is red).
//
// Keys: a weapon family is the weapon line's (staged/weapon-line.js WEAPON_LINE_BASE) plus `fists`; an armor cell is `<slot>:<weight>`
// with the item slots (`pants` is legs) and the line's weights (plate, leather, cloth); an off-hand is `shield` or `spellbook`.
//
// HIDDEN. The grid and `homeOf`, the one reading of a sample's source against it, used by the two line guards; nothing in src/ reads it.
// PURE ESM. Imports nothing.
// ============================================================================

export const MORROW_GRID = Object.freeze({
  carters_rest: Object.freeze({ ground: 'carters_rest', weapons: Object.freeze(['warhammer', 'sword']),
    armor: Object.freeze(['pants:plate', 'gloves:leather', 'boots:cloth']), offhands: Object.freeze(['shield']) }),
  ox_road: Object.freeze({ ground: 'ox_road', weapons: Object.freeze(['hatchets', 'crossbow']),
    armor: Object.freeze(['helmet:plate', 'body:leather', 'pants:cloth']), offhands: Object.freeze(['spellbook']) }),
  night_shift: Object.freeze({ ground: null, planned: Object.freeze({ band: Object.freeze([122, 140]) }), weapons: Object.freeze(['fists', 'wand']),
    armor: Object.freeze(['body:plate', 'boots:leather', 'gloves:cloth', 'gloves:plate']), offhands: Object.freeze([]) }),
  wyvern_roost: Object.freeze({ ground: 'wyvern_roost', weapons: Object.freeze(['bow', 'staff']),
    armor: Object.freeze(['boots:plate', 'pants:leather', 'helmet:cloth']), offhands: Object.freeze([]) }),
  /* the call-out boss, the oldest Brood Wyvern (src/data/grounds/wyvern_roost/pack.js); her room is called from the Roost */
  roost_mother: Object.freeze({ ground: null, boss: true, at: 'wyvern_roost', planned: Object.freeze({}), weapons: Object.freeze(['bow', 'fists']),
    armor: Object.freeze(['helmet:leather', 'pants:plate', 'body:cloth']), offhands: Object.freeze([]) }),
  old_guard: Object.freeze({ ground: null, planned: Object.freeze({ band: Object.freeze([138, 155]) }), weapons: Object.freeze(['wand', 'staff', 'crossbow']),
    armor: Object.freeze(['helmet:plate', 'boots:leather', 'body:cloth']), offhands: Object.freeze(['spellbook']) }),
  the_bellows: Object.freeze({ ground: null, planned: Object.freeze({ band: Object.freeze([145, 165]) }), weapons: Object.freeze(['sword', 'warhammer', 'hatchets']),
    armor: Object.freeze(['body:plate', 'helmet:leather', 'pants:cloth']), offhands: Object.freeze(['shield']) }),
  /* the final boss, fought at the Bellows; his pieces never count as a family's first appearance (Appendix A) */
  father_gault: Object.freeze({ ground: null, boss: true, at: 'the_bellows', planned: Object.freeze({}), weapons: Object.freeze([]),
    armor: Object.freeze(['gloves:cloth', 'boots:plate', 'body:leather', 'pants:leather']), offhands: Object.freeze([]) }),
});

/**
 * Where a staged sample's `source` drops, read against the game's tables (the line guards' one reading of it).
 * tables: { HUNT_GROUNDS, HUNT_INDEX, MONSTERS }. Answers { place (its grid row, or null off the grid), ground (the BUILT ground whose
 * monsters and spells the measures read: the place's own, or the ground a boss is called from; null when not built), floor (the Level it
 * opens at, or null), planned (the place is not built), problems (strings, each a reason the source and the grid disagree) }.
 */
export function homeOf(source, tables, grid = MORROW_GRID) {
  const { HUNT_GROUNDS, HUNT_INDEX, MONSTERS } = tables;
  const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  const src = source || {}, out = { place: null, ground: null, floor: null, planned: false, problems: [] };
  const built = (gid) => !!gid && own(HUNT_GROUNDS, gid);
  const bandOf = (gid) => (built(gid) && own(HUNT_INDEX, HUNT_GROUNDS[gid].hunt) ? HUNT_INDEX[HUNT_GROUNDS[gid].hunt].band || null : null);
  /* a place's floor: a built ground's band, a planned ground's planned band, a boss's ground's */
  const floorOf = (key, seen = new Set()) => {
    const p = own(grid, key) ? grid[key] : null;
    if (!p || seen.has(key)) return null;
    seen.add(key);
    if (p.boss) return floorOf(p.at, seen);
    if (p.ground) return bandOf(p.ground) ? bandOf(p.ground)[0] : null;
    return p.planned && p.planned.band ? p.planned.band[0] : null;
  };
  if (src.place === undefined) {
    /* off the grid (the Catacombs, the March): the ground it names */
    if (src.planned !== undefined) out.problems.push('planned names no grid place');
    out.ground = built(src.ground) ? src.ground : null;
    out.floor = bandOf(out.ground) ? bandOf(out.ground)[0] : null;
    return out;
  }
  const p = own(grid, src.place) ? grid[src.place] : null;
  if (!p) { out.problems.push(src.place + ' is no place on the Morrow grid'); return out; }
  out.place = p;
  out.planned = !!p.planned;
  out.floor = floorOf(src.place);
  /* the ground its monsters and spells are read on: its own, or the one a boss is called from (when that one is built) */
  const at = p.boss ? (own(grid, p.at) ? grid[p.at].ground : null) : p.ground;
  out.ground = built(at) ? at : null;
  /* the grid keeps up with the game: a place built since is named, and loses `planned` */
  if (p.planned && !p.boss && built(src.place)) out.problems.push(src.place + ' is a built ground now: its grid row names it and loses planned');
  if (p.planned && p.boss && own(MONSTERS, src.place)) out.problems.push(src.place + ' is a monster now: its grid row loses planned and the sample names it');
  if (!p.planned && !p.boss && !built(p.ground)) out.problems.push(src.place + '\'s grid row names ' + p.ground + ', which is no ground');
  if (out.floor === null) out.problems.push(src.place + ' has no Level it opens at');
  /* the sample agrees with its place */
  if (out.planned) {
    if (src.planned !== true) out.problems.push(src.place + ' is not built, and the sample does not say planned');
    if (src.monster || src.ground) out.problems.push(src.place + ' is not built, and the sample names ' + (src.monster || src.ground) + ' as if it were');
  } else {
    if (src.planned !== undefined) out.problems.push(src.place + ' is built, and the sample still says planned');
    if (src.ground !== out.ground) out.problems.push('the sample drops on ' + src.ground + ', its place ' + src.place + ' is ' + out.ground);
  }
  return out;
}
