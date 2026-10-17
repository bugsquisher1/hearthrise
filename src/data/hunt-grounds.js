// ════════════════════════════════════════════════════════════════════════
// src/data/hunt-grounds.js — WHERE A HUNT IS FOUGHT (HUNT_SCREEN_SPEC §1.2)
//
// One row per hunt ground, extending the src/data/hunts.js row of the same
// hunt. The pure engine (src/core/hunt/*) reads a resolved row; it never
// reaches into this table by itself.
//
// ROW SHAPE
//   { id, hunt, map, start, pockets, route, respawnMs, pullDist, leashMargin? }
//     id          [a-z0-9_], the key below
//     hunt        a src/data/hunts.js id
//     map         a src/data/world/maps id (the walkable grid is built from it)
//     start       [[x, y], …] entrance tiles, one per party seat (max 5)
//     pockets     [{ room: [x0, y0, x1, y1], spawns: [{ monster, x, y }] }]
//                 `room` is the PACK AREA, inclusive; every spawn stands in it
//     route       pocket indexes in walking order (each pocket at most once)
//     respawnMs   a cleared pack is back this long after it was cleared
//     pullDist    tiles from the pack centre at which the leader pulls
//     leashMargin tiles a pack may step past its room (LE-05/08); absent =
//                 HUNT_TUNING.leashMarginDefault. Read ONLY via leashMarginOf.
//
// The table is empty until the sewer content lane (week plan item 17) adds
// the first ground; the core is proven on tests/hunt-core/fixtures/h1.js.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

import { HUNT_TUNING } from './hunt-tuning.js?v=591';
import { HUNT_INDEX } from './hunts.js?v=591';
import { MONSTERS } from './monsters.js?v=591';

export const HUNT_GROUNDS = Object.freeze({});

const ID = /^[a-z0-9_]{1,40}$/;
const MAX_SEATS = 5;
const isTile = (t) => Array.isArray(t) && t.length === 2 && Number.isInteger(t[0]) && Number.isInteger(t[1]) && t[0] >= 0 && t[1] >= 0;
const inRect = (r, x, y) => x >= r[0] && y >= r[1] && x <= r[2] && y <= r[3];

/** The leash margin of a ground: its own, else the tuning default. The one reader. */
export function leashMarginOf(ground) {
  const m = ground && ground.leashMargin;
  return m === undefined ? HUNT_TUNING.leashMarginDefault : m;
}

/**
 * Every problem with one ground row, as strings. Empty = valid.
 * `refs` lets a fixture be checked without the real catalogues:
 * { hunts: { id: row }, monsters: { id: row } }.
 */
export function validateGround(row, refs) {
  const hunts = (refs && refs.hunts) || HUNT_INDEX;
  const monsters = (refs && refs.monsters) || MONSTERS;
  const out = [];
  const bad = (why) => out.push(String(row && row.id) + ': ' + why);
  if (!row || typeof row !== 'object') return ['ground row is not an object'];
  if (!ID.test(String(row.id))) bad('bad id');
  if (!hunts[row.hunt]) bad('hunt ' + row.hunt + ' is not in hunts.js');
  if (typeof row.map !== 'string' || !row.map) bad('map must name a world map');
  if (!Array.isArray(row.start) || !row.start.length || row.start.length > MAX_SEATS || !row.start.every(isTile)) {
    bad('start must be 1..' + MAX_SEATS + ' tiles');
  }
  if (!Array.isArray(row.pockets) || !row.pockets.length) bad('needs at least one pocket');
  (row.pockets || []).forEach((p, i) => {
    const r = p && p.room;
    if (!Array.isArray(r) || r.length !== 4 || !r.every((v) => Number.isInteger(v) && v >= 0) || r[0] > r[2] || r[1] > r[3]) {
      bad('pocket ' + i + ' room must be [x0, y0, x1, y1] with x0 <= x1, y0 <= y1');
      return;
    }
    if (!Array.isArray(p.spawns) || !p.spawns.length) bad('pocket ' + i + ' has no spawns');
    for (const s of p.spawns || []) {
      if (!s || !monsters[s.monster]) bad('pocket ' + i + ' spawns unknown monster ' + (s && s.monster));
      else if (!isTile([s.x, s.y]) || !inRect(r, s.x, s.y)) bad('pocket ' + i + ' spawn ' + s.monster + ' stands outside its room');
    }
  });
  const n = (row.pockets || []).length;
  if (!Array.isArray(row.route) || !row.route.length || new Set(row.route).size !== row.route.length
    || !row.route.every((i) => Number.isInteger(i) && i >= 0 && i < n)) bad('route must list distinct pocket indexes');
  if (!Number.isInteger(row.respawnMs) || row.respawnMs <= 0 || row.respawnMs % HUNT_TUNING.stepMs !== 0) {
    bad('respawnMs must be a positive whole number of ' + HUNT_TUNING.stepMs + ' ms sub-steps');
  }
  if (!(typeof row.pullDist === 'number' && row.pullDist > 0 && row.pullDist <= 8)) bad('pullDist must be in (0, 8]');
  if (row.leashMargin !== undefined && !(Number.isInteger(row.leashMargin) && row.leashMargin >= 0 && row.leashMargin <= 8)) {
    bad('leashMargin must be an integer 0..8');
  }
  return out;
}

/** Every problem with the table, as strings. Empty = valid. */
export function validate() {
  const out = [];
  for (const [key, row] of Object.entries(HUNT_GROUNDS)) {
    if (row.id !== key) out.push(key + ': row id ' + row.id + ' does not match its key');
    out.push(...validateGround(row));
  }
  return out;
}
