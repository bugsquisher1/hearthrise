// ════════════════════════════════════════════════════════════════════════
// src/world/home-scene.js — YOUR HOME, FURNISHED BY WHAT THE SERVER SAYS YOU OWN.
//
// The map is the template your property rung picks (house-layouts.js
// HOUSE_TEMPLATES, read off the server's rung; unknown shows the first). The
// furniture is a PURE function of the room rungs in the account's `home`
// section (homeEnv over session/home-sections.js homeOf: the server's word,
// never a local guess and never a window global), so each envelope REPLACES
// it: Kitchen 2 → 3 → {} shows the rung-2 set, then the rung-3 set, then
// signposts — nothing is ever kept from before. A room at rung 0 shows a
// signpost to the House screen on the spot its first piece will stand. The
// trophy wall hangs one mount per claimed bestiary trophy, highest stage
// first, once the Trophy Room is built, up to the mounts its rung holds
// (perks.js trophyMounts). The rebuilt client has no projection of the claims
// yet (the caller passes null), so the Trophy Room's first piece carries a
// plain caption that the wall is empty. Tapping a piece opens
// that room's existing modal; tapping a signpost opens the House screen.
// PURE: no DOM, no window, no G — the caller passes rungs, rows and names.
// ════════════════════════════════════════════════════════════════════════
import { HOUSE_TEMPLATES, ROOM_LAYOUTS, TROPHY_MOUNT_SPRITES } from '../data/world/house-layouts.js?v=0.2.67';
import { lintMap } from './core/map-compile.js?v=0.2.67';
import { onEdge, isCorner } from './core/grid.js?v=0.2.67';
import { ROOM_PERKS } from '../data/perks.js?v=0.2.67';

/** The home map for a property rung (null = not stated yet → the first template). */
export function homeMapFor(tier) {
  const t = Number(tier);
  let pick = HOUSE_TEMPLATES[0];
  if (Number.isFinite(t)) for (const row of HOUSE_TEMPLATES) if (t >= row.fromTier) pick = row;
  return pick.map;
}

/**
 * What the home reads from the account's `home` section (homeOf's shape, or
 * null before the server sent it): the property rung (null = unknown → the
 * first template), { roomId: rung } and each room's server name. Fails safe:
 * no section is no rooms.
 * @param {{tier: number, rooms: {room: string, name: string, level: number}[]}|null} home
 */
export function homeEnv(home) {
  const rooms = {}, names = {};
  for (const r of (home && Array.isArray(home.rooms) ? home.rooms : [])) { rooms[r.room] = r.level; names[r.room] = r.name; }
  return { tier: home && Number.isFinite(home.tier) ? home.tier : null, rooms, roomName: (id) => names[id] || id };
}

/** The caption the Trophy Room's first piece carries while its wall has nothing to hang. */
export const EMPTY_WALL = 'Trophy wall: empty for now';

/** A rung as a whole number ≥ 0 (garbage reads as not built). */
const rungOf = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0; };

/**
 * Everything the rooms put in the home: [{ id, x, y, ref, plate? }] where ref
 * is { room } for a piece or a trophy mount and { sign } for a signpost.
 * @param {string} mapId
 * @param {object} rooms  { roomId: rung } as the server holds it
 * @param {{rows: {stage: number}[]}|null} trophies  the claimed wall, or null while unknown
 * @param {(id: string) => string} [nameOf]  a room's display name, for its signpost
 */
export function furnish(mapId, rooms, trophies, nameOf) {
  const layout = ROOM_LAYOUTS[mapId];
  if (!layout) return [];
  const have = rooms && typeof rooms === 'object' ? rooms : {};
  const out = [];
  for (const [room, def] of Object.entries(layout.rooms)) {
    const rung = rungOf(have[room]);
    if (!rung) {
      const first = def.rungs[0][0];
      out.push({ id: 'signpost', x: first.x, y: first.y, ref: { sign: room }, plate: { text: (nameOf && nameOf(room)) || room, kind: 'sign' } });
      continue;
    }
    for (const set of def.rungs.slice(0, rung)) for (const piece of set) out.push({ id: piece.id, x: piece.x, y: piece.y, ref: { room } });
  }
  const trophyRung = rungOf(have.trophy);
  const known = !!trophies && Array.isArray(trophies.rows);
  if (trophyRung && !(known && trophies.rows.length)) {
    const first = out.find((p) => p.ref && p.ref.room === 'trophy');
    if (first) first.plate = { text: EMPTY_WALL, kind: 'sign' };
  }
  if (trophyRung && known) {
    /* The Trophy Room's rung says how many mounts the wall has (src/data/perks.js trophyMounts). */
    const rung = ROOM_PERKS.trophy[Math.min(trophyRung, ROOM_PERKS.trophy.length) - 1] || {};
    trophies.rows.slice(0, Math.min(layout.trophyMounts.length, rung.trophyMounts | 0)).forEach((row, i) => {
      const [x, y] = layout.trophyMounts[i];
      out.push({ id: TROPHY_MOUNT_SPRITES[row.stage] || TROPHY_MOUNT_SPRITES[1], x, y, ref: { room: 'trophy' } });
    });
  }
  return out;
}

/** The map's mask with every solid prop's footprint blocked (what the hero walks around). */
export function maskWith(map, props, sprites, openClasses) {
  const m = Uint8Array.from(map.mask);
  for (const p of props) {
    const s = sprites[p.id];
    if (!s || openClasses.includes(s.class)) continue;
    const [fw, fh] = s.footprint;
    for (let y = p.y; y < p.y + fh; y++) for (let x = p.x; x < p.x + fw; x++) if (x >= 0 && y >= 0 && x < map.w && y < map.h) m[y * map.w + x] = 1;
  }
  return m;
}

/**
 * THE LAYOUT CONTRACT, for every template: the map row with EVERY rung of every
 * room placed at once (a superset of any real house, since a signpost stands
 * on its room's first tile) must pass the map lint — whole tiles, no shared
 * tile, nothing north of a south wall, every open tile reachable — no two hung
 * pieces may share a wall tile, and every trophy mount must hang on the
 * building's north wall, clear of other hung art.
 * Returns [{ code, msg }]; empty means the layout ships.
 * @param {object} row  the template's map row
 * @param {object} tables  as lintMap takes them
 */
export function lintLayout(row, tables) {
  const layout = ROOM_LAYOUTS[row.id];
  if (!layout) return [{ code: 'H-NONE', msg: row.id + ' has no room layout' }];
  const out = [];
  const pieces = [];
  for (const [room, def] of Object.entries(layout.rooms)) {
    if (!def.rungs.length || def.rungs.some((r) => !r.length)) out.push({ code: 'H-RUNG', msg: row.id + ': ' + room + ' has a rung that adds nothing' });
    for (const set of def.rungs) for (const piece of set) pieces.push({ id: piece.id, x: piece.x, y: piece.y });
  }
  const full = Object.assign({}, row, { objects: row.objects.concat(pieces) });
  for (const p of lintMap(full, tables)) if (p.code !== 'L-HASH') out.push({ code: 'H-' + p.code, msg: p.msg });
  const b = row.buildings.find((bd) => bd.id === layout.building);
  if (!b) return out.concat([{ code: 'H-BUILD', msg: row.id + ': layout building ' + layout.building + ' is not on the map' }]);
  const r = { x: b.rect[0], y: b.rect[1], w: b.rect[2], h: b.rect[3] };
  const hung = new Set();
  for (const p of full.objects) {
    if (!tables.sprites[p.id] || tables.sprites[p.id].class !== 'hanging') continue;
    if (hung.has(p.x + ',' + p.y)) out.push({ code: 'H-HUNG', msg: row.id + ': two hung pieces share wall tile ' + p.x + ',' + p.y });
    hung.add(p.x + ',' + p.y);
  }
  for (const [x, y] of layout.trophyMounts) {
    if (y !== r.y || !onEdge(r, x, y) || isCorner(r, x, y)) out.push({ code: 'H-MOUNT', msg: row.id + ': trophy mount ' + x + ',' + y + ' is not on ' + b.id + '\'s north wall' });
    if (hung.has(x + ',' + y)) out.push({ code: 'H-MOUNT', msg: row.id + ': trophy mount ' + x + ',' + y + ' shares its wall tile with a rung\'s hung piece' });
  }
  return out;
}
