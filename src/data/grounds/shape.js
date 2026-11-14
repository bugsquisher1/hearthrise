// ════════════════════════════════════════════════════════════════════════
// src/data/grounds/shape.js — THE SHAPE OF A HUNTING GROUND, AND OF A GROUND PACK (lane/b-ground-pack; Tyler 2026-11-04: "a
// scalable way to build new hunting grounds"; the board's "2026-11-05 Ground Packs").
//
// No imports, so a pack (src/data/grounds/<id>/pack.js) can use these helpers without a cycle through monsters.js or hunts.js.
// src/data/hunt-grounds.js builds the six base grounds with the same helpers.
//
// A GROUND PACK is everything one new hunting ground adds, in one folder, and it only ADDS: its hunt row, its ground row, its
// map, its new monsters and their roles, its new items. The data files fold every pack in (src/data/grounds/index.js), so no
// reader changes: HUNTS, HUNT_GROUNDS, MONSTERS, WORLD_MAPS, ITEMS, ITEM_DESC and the balance sheet's roster read the union.
// A pack can't move another ground's row or a global rate: an id that is already taken is refused at load (foldRows below), and
// the server half ships as one additive file of the pack's own rows (tools/pack.mjs ship, tests/ground-pack.mjs).
//
// PURE ESM. Data and pure functions only.
// ════════════════════════════════════════════════════════════════════════

/* A BOX: every walked pocket can field a full box of 8, all 8 tiles round the tank (Tyler 10-18). Its `pull` tile is 3x3 clear, no wall or
   prop (tests/hunt-core/forest-cave.mjs), and its `pack` is 8 rows in join order on the ring round that tile (N, E, S, W, then the corners).
   `spawns` is the first `base` of them, the pocket as built. Read only through hunt-grounds.js pullRows. */
export const FULL_BOX = 8;
const RING = Object.freeze([[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]]);

/** A pocket: its pack area (inclusive) and the monsters standing in it, [monster, x, y] each. */
export const pocket = (room, ...spawns) => Object.freeze({ room: Object.freeze(room),
  spawns: Object.freeze(spawns.map(([monster, x, y]) => Object.freeze({ monster, x, y }))) });

/** A box pocket: the tank's `pull` tile, `base` monsters as built and `more` to a full box of 8, on the ring round it. */
export const box = (room, pull, base, more) => {
  const pack = base.concat(more).map((monster, i) => Object.freeze({ monster, x: pull[0] + RING[i][0], y: pull[1] + RING[i][1] }));
  return Object.freeze({ room: Object.freeze(room), pull: Object.freeze(pull), spawns: Object.freeze(pack.slice(0, base.length)), pack: Object.freeze(pack) });
};

/** A BOSS'S WAVE: a pocket's `adds` rows, [monster, x, y] each, the shape of its spawns (pull-cycle.js spawnAdds places them when his
    `phases` line is crossed, src/core/hunt/boss-phases.js). Only a pocket holding a boss with phases may carry them (hunt-grounds.js
    validateGround). On a ground they are monsters like any other and pay their kill; in a called room they are called rows. */
export const addRows = (...rows) => Object.freeze(rows.map(([monster, x, y]) => Object.freeze({ monster, x, y })));

/* THE GATHER SLIDER (Tyler 10-18): `shares` are the steps of the time between pulls a hero spends
   on a node, in permille of the hunt (0 = None, the default: REVIEW amendment). `refKillMs` is the
   reference hero's time to clear one pack here (spec §2): the engine sizes a gap from it, so a hero
   who out-levels the ground gathers more. Each node is placed in a pocket's room, on its route. */
const GATHER_SHARES = Object.freeze([0, 250, 500, 750]);
export const gather = (refKillMs, nodes) => Object.freeze({ refKillMs, shares: GATHER_SHARES,
  nodes: Object.freeze(nodes.map(([node, x, y, p]) => Object.freeze({ id: 'n' + x + '_' + y, node, x, y, pocket: p }))) });

/* ── THE PACK ─────────────────────────────────────────────────────────────
   { id, status, sql, hunt, ground, map, monsters, roster, items, itemText, xpFit, tierOverride }
     id        [a-z0-9_]: the hunt id AND the ground id (one ground a pack)
     status    'staged' (built, its art not done: never listed, never served, the hunt row says `staged`) | 'open'
     sql       the pack's additive server file (supabase/migrations/<date>-pack-<id>.generated.sql), written by
               `node tools/pack.mjs ship <id>`; null until then. The whole catalogue generators leave a pack out until a world
               move folds it (tools/pack/fold.mjs), so a pack never re-issues a whole catalogue.
     hunt      a src/data/hunts.js row without its id
     ground    a src/data/hunt-grounds.js row without its id and hunt
     map       the map row (src/data/world/maps' shape); ground.map names it
     monsters  { id: row }: the pack's NEW monsters, src/data/monsters.js rows (the numbers by `tools/pack.mjs propose --write`)
     roster    { monster: role }: each placed monster's role (src/data/balance-sheet.js GROUND_ROSTER's row)
     items     { id: row }: the pack's NEW items, src/data/items.js rows; itemText { id: 'its line' } (item-descriptions.js)
     xpFit, tierOverride   (optional) its GROUND_XP_FIT number and TIER_PULL_OVERRIDES row (balance-sheet.js), each with its reason
     partyClassXp, partyVsAlone   (optional) its party rows { 2: [...], 3: [...], 4: [...] } (party-class-xp.js): the pay cell when a
               same-class party would beat solo there, and the measured line the party window says (tests/party-class-xp-line.mjs)
     bagGuide  the hunt's suggested bag { tier, melee, ranged, magic } (src/data/supplies.js BAG_GUIDE_BY_HUNT's row shape)
     checks    (optional) the pack's own test facts, read only by the guards that loop over every ground: bridge [[x, y], ...]
               (its one-tile choke, tests/hunt-core/forest-cave.mjs), holders [monster, ...] (its room holders, no spawn weight), dropRef { roles, full } and valueToday (its measured value pin,
               tests/hunt-core/drop-tables.mjs). Measured once, then frozen here, so a guard never needs a row typed for a new ground
     hall      (optional, lane/b-krells-hold-pack) a KEYED BOSS ROOM on the ground's own map, behind a key that drops on the ground:
               { key, words { boss, Boss }, hunt, ground, monsters }. `key` is one of the pack's items and `opens` the pack; `hunt` a
               hunts.js HALL_HUNTS row less its id and `hall`; `ground` a hunt-grounds.js HALL_GROUNDS row less its id, hunt, map and `hall`
               (one pocket: the boss its ONE spawn, his adds in `adds`); `monsters` the room's own PAYING rows (a hall pays: never `called`,
               no id ending _called; the boss's prize is his own drops, xp and gp; an add is `add`, a named add `boss` and `add` both, piece 6).
               The keyed-hall contract of lane/b-barrow-boss-room (boss-halls.js, gen-hunt-sessions hallRows). CARRIED, NOT FOLDED: the fold
               into BOSS_HALLS / HALL_HUNTS / HALL_GROUNDS and MONSTERS lands with that lane (engine piece 5)
     fuel      (optional, lane/b-pack-fields: engine piece 10) the ground's NAMED FUEL, a src/data/hearth.js NAMED_FUELS row plus its item:
               { item, xp, req, flame, secs, chunk }. `item` is one of the pack's own items. CARRIED, NOT FOLDED: hr_hearth_named is a server
               catalogue (tools/gen-hearth-catalogue.mjs), so the fold into NAMED_FUELS lands with the pack's ship. tools/pack.mjs lintFields
               checks `flame` against FLAMES
     spells    (optional, lane/b-pack-fields) the pack's NEW monster spells, src/data/monster-spells.js MONSTER_SPELLS rows { id: row }, the
               one spell model: monster-spells.js folds them in (an id already taken is refused), validateSpell judges each row, and a row
               none of the pack's own monsters casts is refused (tools/pack.mjs lintFields) */
export const PACK_STATUS = Object.freeze(['staged', 'open']);
const ID = /^[a-z0-9_]{1,40}$/;
const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
const KEYS = Object.freeze(['id', 'status', 'sql', 'hunt', 'ground', 'map', 'monsters', 'roster', 'items', 'itemText', 'xpFit', 'tierOverride', 'partyClassXp', 'partyVsAlone', 'checks', 'bagGuide', 'hall', 'fuel', 'spells']);
const FUEL_KEYS = Object.freeze(['item', 'xp', 'req', 'flame', 'secs', 'chunk']);
const SPELL_ROW_KEYS = Object.freeze(['n', 'shape', 'r', 'len', 'range', 'windupMs', 'cdMs', 'hitPm', 'element']);
const posInt = (n) => Number.isInteger(n) && n > 0;

/** A pack's `fuel`, checked for shape: answers why it is malformed, or null. FLAMES is tools/pack.mjs lintFields. */
function fuelWhy(p) {
  const f = p.fuel;
  if (!isObj(f)) return 'fuel is not an object';
  for (const k of Object.keys(f)) if (!FUEL_KEYS.includes(k)) return 'fuel has an unknown field ' + k;
  if (typeof f.item !== 'string' || !(p.items && Object.prototype.hasOwnProperty.call(p.items, f.item))) return 'fuel.item is not one of the pack own items';
  for (const k of ['xp', 'req', 'secs']) if (!posInt(f[k])) return 'fuel.' + k + ' is not a whole number over 0';
  if (typeof f.flame !== 'string' || !f.flame) return 'fuel.flame is not a FLAMES key';
  if (f.chunk !== 'fuel_' + f.item) return 'fuel.chunk is not fuel_' + f.item + ' (its world sprite)';
  return null;
}

/** A pack's `spells`, checked for shape: answers why it is malformed, or null. The bounds are monster-spells.js validateSpell. */
function spellsWhy(p) {
  if (!isObj(p.spells) || !Object.keys(p.spells).length) return 'spells is not a map of spell ids to rows, with at least one';
  for (const [id, row] of Object.entries(p.spells)) {
    if (!/^[a-z0-9_]{1,32}$/.test(id)) return 'spell id ' + id + ' is not [a-z0-9_]';
    if (!isObj(row)) return 'spell ' + id + ' is not a row';
    for (const k of Object.keys(row)) if (!SPELL_ROW_KEYS.includes(k)) return 'spell ' + id + ' has an unknown field ' + k;
  }
  return null;
}
const HALL_KEYS = Object.freeze(['key', 'words', 'hunt', 'ground', 'monsters']);
const isSpot = (s) => isObj(s) && ID.test(String(s.monster)) && Number.isInteger(s.x) && Number.isInteger(s.y);

/** A pack's `hall`, checked for shape: answers why it is malformed, or null. The data half (the key item, the rows) is tools/pack.mjs lintHall. */
function hallWhy(p) {
  const h = p.hall;
  if (!isObj(h)) return 'hall is not an object';
  for (const k of Object.keys(h)) if (!HALL_KEYS.includes(k)) return 'hall has an unknown field ' + k;
  if (typeof h.key !== 'string' || !(p.items && h.key in p.items)) return 'hall.key is not one of the pack\'s own items';
  if (p.items[h.key].opens !== p.id) return 'hall.key ' + h.key + ' does not open ' + p.id + ' (its item\'s `opens`)';
  if (!isObj(h.words) || typeof h.words.boss !== 'string' || typeof h.words.Boss !== 'string') return 'hall.words is not { boss, Boss }';
  if (!isObj(h.hunt) || 'id' in h.hunt || 'called' in h.hunt || 'hall' in h.hunt || typeof h.hunt.name !== 'string') return 'hall.hunt is not a HALL_HUNTS row less its id and hall';
  const g = h.ground;
  if (!isObj(g) || ['id', 'hunt', 'map', 'call', 'hall'].some((k) => k in g)) return 'hall.ground is not a HALL_GROUNDS row less its id, hunt, map and hall';
  if (!Array.isArray(g.pockets) || g.pockets.length !== 1) return 'hall.ground has not exactly one pocket';
  const pk = g.pockets[0];
  if (!Array.isArray(pk.spawns) || pk.spawns.length !== 1 || !pk.spawns.every(isSpot)) return 'hall.ground\'s pocket stands not exactly one boss';
  if (!Array.isArray(pk.adds) || !pk.adds.length || !pk.adds.every(isSpot)) return 'hall.ground\'s pocket has no adds';
  if (!isObj(h.monsters) || !Object.keys(h.monsters).length) return 'hall.monsters is empty';
  for (const [id, m] of Object.entries(h.monsters)) {
    if (/_called$/.test(id) || !isObj(m) || 'called' in m) return 'hall row ' + id + ' is a called row, and a hall pays (no id ending _called, no called mark)';
    if (m.boss !== true && m.add !== true) return 'hall row ' + id + ' is neither the boss nor an add';
  }
  const boss = h.monsters[pk.spawns[0].monster];
  if (!boss || boss.boss !== true || boss.add === true) return 'hall.ground\'s one spawn is not the hall\'s boss row';
  if (!pk.adds.every((s) => h.monsters[s.monster] && h.monsters[s.monster].add === true)) return 'hall.ground\'s adds are not the hall\'s add rows';
  return null;
}

/** A pack, checked for shape and frozen at its top. Throws on a malformed one, naming the pack and the field. */
export function definePack(p) {
  const id = p && p.id;
  const no = (why) => { throw new Error('ground pack ' + (id || '?') + ': ' + why); };
  if (!isObj(p) || typeof id !== 'string' || !ID.test(id)) no('id is not [a-z0-9_]{1,40}');
  for (const k of Object.keys(p)) if (!KEYS.includes(k)) no('unknown field ' + k);
  if (!PACK_STATUS.includes(p.status)) no('status is not ' + PACK_STATUS.join(' | '));
  /* a re-ship (the pack's rows moved before a world move folded it) is a new forward file, -2, -3 ...: an applied file is history */
  if (p.sql != null && !new RegExp('^\\d{4}-\\d{2}-\\d{2}-pack-' + id + '(-\\d+)?\\.generated\\.sql$').test(p.sql)) no('sql is not <date>-pack-' + id + '[-N].generated.sql');
  if (p.status === 'open' && p.sql == null) no('an open pack is served, so it names its file (node tools/pack.mjs ship ' + id + ')');
  if (!isObj(p.hunt) || 'id' in p.hunt || 'staged' in p.hunt) no('hunt is not a hunts.js row without id and staged (status says staged)');
  if (!isObj(p.ground) || 'id' in p.ground || 'hunt' in p.ground) no('ground is not a hunt-grounds.js row without id and hunt');
  if (!isObj(p.map) || p.map.id !== p.ground.map) no('map is not the row ground.map names');
  for (const k of ['monsters', 'roster', 'items', 'itemText']) if (p[k] !== undefined && !isObj(p[k])) no(k + ' is not an object');
  for (const k of ['monsters', 'items']) for (const x of Object.keys(p[k] || {})) if (!ID.test(x)) no(k + ' id ' + x + ' is not [a-z0-9_]');
  for (const x of Object.keys(p.itemText || {})) if (!(p.items && x in p.items)) no('itemText names ' + x + ', which is not one of its items');
  if (p.xpFit !== undefined && !(isObj(p.xpFit) && Number.isFinite(p.xpFit.k) && typeof p.xpFit.why === 'string' && p.xpFit.why)) no('xpFit is not { k, why }');
  if (p.tierOverride !== undefined && !(isObj(p.tierOverride) && typeof p.tierOverride.why === 'string' && p.tierOverride.why)) no('tierOverride has no why');
  if (p.checks !== undefined && !isObj(p.checks)) no('checks is not an object');
  if (p.bagGuide !== undefined && !(isObj(p.bagGuide) && Number.isInteger(p.bagGuide.tier))) no('bagGuide is not { tier, melee, ranged, magic }');
  for (const k of ['partyClassXp', 'partyVsAlone']) if (p[k] !== undefined && !(isObj(p[k]) && [2, 3, 4].every((n) => Array.isArray(p[k][n]) && p[k][n].length === n))) no(k + ' is not { 2: [2], 3: [3], 4: [4] }');
  if (p.hall !== undefined) { const why = hallWhy(p); if (why) no(why); }
  if (p.fuel !== undefined) { const why = fuelWhy(p); if (why) no(why); }
  if (p.spells !== undefined) { const why = spellsWhy(p); if (why) no(why); }
  return Object.freeze({ monsters: {}, roster: {}, items: {}, itemText: {}, spells: {}, sql: null, ...p });
}

/**
 * FOLD a pack-owned table into a base one: base's entries, then every pack's `pick(pack)` entries ({ id: row }). An id that is
 * already taken, by the base or an earlier pack, throws: a pack adds, it never replaces. Answers a plain object (the caller freezes).
 */
export function foldRows(label, base, packs, pick) {
  const out = { ...base };
  for (const p of packs) for (const [k, v] of Object.entries(pick(p) || {})) {
    if (Object.prototype.hasOwnProperty.call(out, k)) throw new Error('ground pack ' + p.id + ': ' + label + ' ' + k + ' is already taken; a pack only adds');
    out[k] = v;
  }
  return out;
}
