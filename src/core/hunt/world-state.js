// ============================================================
// src/core/hunt/world-state.js — THE INSTANCE'S WORLD AT A SWING BOUNDARY
// (spec §1.1 engine contract #4)
//
// What `hunt_instances.world` holds between settles: every unit's tile and
// progress, HP, target, path; the trail; the packs. `encode` writes it as
// field-ordered arrays, `decode` reads it back, `validate` refuses a world
// that is malformed or over HUNT_TUNING.worldMaxBytes.
//
// THE FIELD LIST IS COMPOSED, never hand-kept: BASE below, then each core
// module's PERSISTED { unit, world, pack } in a fixed module order. A lane
// adds a persisted field in its own module; nothing here changes. The SHAPE
// fingerprint (a hash of the composed list) rides in every encoding, so a
// world written under another field list is refused, not misread (no
// migration: CLAUDE.md §1). A field missing from encode is a world that does
// not survive a settle cut — world-step#split-parity goes red.
//
// Kinds: int (safe integer), int? (or null), str, bool, tile ([x, y] or
// null), tiles ([[x, y], …]), json (null, integers, strings, booleans and
// arrays/objects of them — no floats).
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { HUNT_TUNING } from '../../data/hunt-tuning.js?v=0.2.11';
import { hashSeed } from '../rng.js?v=0.2.11';
import * as movement from './movement.js?v=0.2.11';
import * as targeting from './targeting.js?v=0.2.11';
import * as roles from './roles.js?v=0.2.11';
import * as pullCycle from './pull-cycle.js?v=0.2.11';
import * as damage from './damage.js?v=0.2.11';
import * as abilities from './abilities.js?v=0.2.11';
import * as status from './status.js?v=0.2.11';
import * as consumables from './consumables.js?v=0.2.11';
import * as xpShare from './xp-share.js?v=0.2.11';
import * as conditions from './conditions.js?v=0.2.11';

export const WORLD_VERSION = 1;

const BASE = Object.freeze({
  unit: [['id', 'int'], ['side', 'str'], ['kind', 'str'], ['pocket', 'int?'], ['alive', 'bool'],
    ['hp', 'int'], ['maxHp', 'int'], ['target', 'int?'], ['home', 'tile'], ['x', 'int'], ['y', 'int']],
  world: [['ground', 'str'], ['swing', 'int'], ['leader', 'int?']],
  pack: [['aggro', 'bool'], ['holder', 'int?']],
});
const MODULES = [BASE, movement.PERSISTED, targeting.PERSISTED, roles.PERSISTED, pullCycle.PERSISTED,
  damage.PERSISTED, abilities.PERSISTED, status.PERSISTED, consumables.PERSISTED, xpShare.PERSISTED, conditions.PERSISTED];

function compose(part) {
  const out = []; const seen = new Set();
  for (const m of MODULES) {
    for (const [name, kind] of m[part]) {
      if (seen.has(name)) throw new Error('world-state: ' + part + ' field ' + name + ' is persisted by two modules');
      if (!KINDS[kind]) throw new Error('world-state: ' + part + ' field ' + name + ' has unknown kind ' + kind);
      seen.add(name); out.push([name, kind]);
    }
  }
  return Object.freeze(out);
}

const isTile = (v) => Array.isArray(v) && v.length === 2 && Number.isSafeInteger(v[0]) && Number.isSafeInteger(v[1]);
const isJson = (v, depth) => depth < 8 && (v === null || typeof v === 'string' || typeof v === 'boolean' || Number.isSafeInteger(v)
  || (Array.isArray(v) && v.every((e) => isJson(e, depth + 1)))
  || (typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype && Object.values(v).every((e) => isJson(e, depth + 1))));
const KINDS = Object.freeze({
  int: { ok: Number.isSafeInteger, blank: () => 0 },
  'int?': { ok: (v) => v === null || Number.isSafeInteger(v), blank: () => null },
  str: { ok: (v) => typeof v === 'string' && v.length <= 64, blank: () => '' },
  bool: { ok: (v) => typeof v === 'boolean', blank: () => false },
  tile: { ok: (v) => v === null || isTile(v), blank: () => null },
  tiles: { ok: (v) => Array.isArray(v) && v.every(isTile), blank: () => [] },
  json: { ok: (v) => isJson(v, 0), blank: () => null },
});

export const FIELDS = Object.freeze({ unit: compose('unit'), world: compose('world'), pack: compose('pack') });
/* The fingerprint of the composed field list: an encoding under any other list is refused. */
export const SHAPE = hashSeed('world', WORLD_VERSION, JSON.stringify(FIELDS));

const copy = (v) => (v === null || typeof v !== 'object' ? v : JSON.parse(JSON.stringify(v)));
function blank(part, o) {
  const out = {};
  for (const [name, kind] of FIELDS[part]) out[name] = o && o[name] !== undefined ? copy(o[name]) : KINDS[kind].blank();
  return out;
}
/** A unit / pack / world with every persisted field present (absent ones blank). */
export const makeUnit = (o) => blank('unit', o);
export const makePack = (o) => blank('pack', o);
export function makeWorld(o) {
  const w = blank('world', o);
  w.units = ((o && o.units) || []).map(makeUnit);
  w.packs = ((o && o.packs) || []).map(makePack);
  return w;
}

const row = (part, obj) => FIELDS[part].map(([name]) => copy(obj[name]));
const unrow = (part, arr) => {
  const out = {};
  FIELDS[part].forEach(([name], i) => { out[name] = copy(arr[i]); });
  return out;
};

/** The persisted form of a world (what hunt_instances.world stores). */
export function encode(world) {
  return { v: WORLD_VERSION, s: SHAPE, w: row('world', world), u: world.units.map((u) => row('unit', u)), p: world.packs.map((p) => row('pack', p)) };
}

/** A world from its persisted form; throws on another version, shape or a short row. */
export function decode(enc) {
  if (!enc || enc.v !== WORLD_VERSION || enc.s !== SHAPE) throw new Error('world-state: not a v' + WORLD_VERSION + ' world of this shape');
  const fits = (part, arr) => Array.isArray(arr) && arr.length === FIELDS[part].length;
  if (!fits('world', enc.w) || !Array.isArray(enc.u) || !Array.isArray(enc.p)
    || !enc.u.every((r) => fits('unit', r)) || !enc.p.every((r) => fits('pack', r))) throw new Error('world-state: a row does not match the field list');
  const w = unrow('world', enc.w);
  w.units = enc.u.map((r) => unrow('unit', r));
  w.packs = enc.p.map((r) => unrow('pack', r));
  return w;
}

/** UTF-8 bytes of the encoded world as JSON text. */
export function encodedBytes(world) {
  return new TextEncoder().encode(JSON.stringify(encode(world))).length;
}

/** Every problem with a world, as strings. Empty = valid. */
export function validate(world) {
  if (!world || typeof world !== 'object' || !Array.isArray(world.units) || !Array.isArray(world.packs)) return ['world is not a world'];
  const out = [];
  const check = (part, obj, label) => {
    for (const [name, kind] of FIELDS[part]) if (!KINDS[kind].ok(obj[name])) out.push(label + '.' + name + ' is not a valid ' + kind);
  };
  check('world', world, 'world');
  world.packs.forEach((p, i) => check('pack', p, 'pack ' + i));
  let prev = -Infinity;
  for (const u of world.units) {
    check('unit', u, 'unit ' + u.id);
    if (!(u.id > prev)) out.push('unit ids must be unique and ascending (' + u.id + ' after ' + prev + ')');
    prev = u.id;
    if (u.side !== 'hero' && u.side !== 'mon') out.push('unit ' + u.id + ' side must be hero or mon');
  }
  if (!out.length) {
    const bytes = encodedBytes(world);
    if (bytes > HUNT_TUNING.worldMaxBytes) out.push('world is ' + bytes + ' bytes, over the ' + HUNT_TUNING.worldMaxBytes + ' bound');
  }
  return out;
}
