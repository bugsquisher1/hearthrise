// ════════════════════════════════════════════════════════════════════════
// src/session/danger-sections.js — THE DANGER SCALE AS THE SERVER PROJECTS IT (the `danger` section; 1056-danger-scale.sql hr_danger_view).
//
//   dangerOf(cs)          { risk, held: { hunt: step }, playing: null | { hunt, from, risk, start, step, cool } }, or null when the server
//                         sent none. `risk` is the plan's stance (null: none, the tier path); `playing.from` the stance the open hunt froze,
//                         `playing.risk` the stance it stands at now (a death settles it one notch safer).
//   onScale(hunt)         the ground plays the scale (src/data/danger.js DANGER_GROUNDS); everywhere else the tier path is unchanged
//   depthOf(hunt, step)   { depth, of }: the step as "Depth N of 20" on the ground's band (data/danger.js floorStep..topStep, 12-targets.md 3.1), never the raw step (Tyler 2026-11-22: "is it going
//                         to be easy for players to understand?"); null off the scale or for a step that is not a number
//
// A read of the envelope only, REPLACED by each envelope (CLAUDE.md §6): nothing here is a gate the server trusts, and a missing section
// reads as unknown (null), never a default.
// ════════════════════════════════════════════════════════════════════════
import { DANGER_GROUNDS, RISKS, DEPTHS } from '../data/danger.js';

const ID = /^[a-z0-9_]{1,64}$/;
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const step = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);
const stance = (v) => (typeof v === 'string' && Object.prototype.hasOwnProperty.call(RISKS, v) ? v : null);
const SEEN = new WeakMap();

/** The stances, safest first (the picker's order). */
export const STANCE_IDS = Object.freeze(Object.keys(RISKS));

/** Does this ground play the Danger scale? */
export function onScale(hunt) {
  return typeof hunt === 'string' && Object.prototype.hasOwnProperty.call(DANGER_GROUNDS, hunt);
}

/** A step as depth on its ground's band: { depth, of }, depth held to 1..of (a step under the floor reads Depth 1). */
export function depthOf(hunt, s) {
  if (!onScale(hunt) || step(s) === null) return null;
  const g = DANGER_GROUNDS[hunt], span = Math.max(1, g.topStep - g.floorStep);
  return { depth: Math.max(1, Math.min(DEPTHS, 1 + Math.round(((s - g.floorStep) / span) * (DEPTHS - 1)))), of: DEPTHS };
}

/** The `danger` section, bounded; null when the server sent none. */
export function dangerOf(cs) {
  const raw = cs && typeof cs.read === 'function' ? cs.read('danger') : undefined;
  return parseDanger(raw);
}

/** The same read over a raw section object. */
export function parseDanger(raw) {
  if (!isObj(raw)) return null;
  const had = SEEN.get(raw);
  if (had) return had;
  const held = {};
  if (isObj(raw.held)) for (const [k, v] of Object.entries(raw.held)) if (ID.test(k) && step(v) !== null) held[k] = v;
  const p = raw.playing;
  const playing = isObj(p) && ID.test(String(p.hunt)) && stance(p.from) && step(p.step) !== null
    ? Object.freeze({ hunt: p.hunt, from: p.from, risk: stance(p.risk) || p.from, start: step(p.start), step: p.step, cool: step(p.cool) || 0 })
    : null;
  const out = Object.freeze({ risk: stance(raw.risk), held: Object.freeze(held), playing });
  SEEN.set(raw, out);
  return out;
}
