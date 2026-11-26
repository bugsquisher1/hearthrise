// ============================================================
// src/core/plan-code.js — THE SHARE CODE: A COMPANY PLAN AND A ROADS BUILD AS ONE STRING TO PASTE (lane/wn-sh SH, 2026-11-26;
// docs/design/redesign/20-v030-the-roads.md section 4 band 5, 17-talent-tree.md section 11, 03-opportunities.md item 4).
//
// A CODE IS A CONVENIENCE, NEVER AUTHORITY (CLAUDE.md section 1). It carries only catalogue words a player could pick by hand: a ground
// id, a stance id, the two company lines and a set of Roads nodes. Decoding it writes nothing: it fills the pasting player's OWN plan
// editor (src/session/plan-share.js), and every change it leads to is one of that player's existing intents, each checked by the server
// against its own catalogue (hr_hero_plan_set, hr_hunt_risk_set, hr_company_line_set, hr_talent_build_save). No gold, count, price, name,
// timestamp or player id is ever in a code, so a forged one can reach nobody's economy or ranking: at worst it is refused.
//
// THE FORMAT (v1):  HR1-<payload, base64url>-<check, 7 base36>
//   payload  fields joined by ';', each key=value, every key at most once, in this order when made:
//              g  the plan's ground (a hunt id of OPEN_HUNTS)      r  the stance (RISKS)
//              w  "Wear upgrades" (COMPANY_LINES.wear_upgrades)     f  "If one falls" (COMPANY_LINES.if_one_falls)
//              b  the Roads build: groups joined by '/', each '<prefix>:<item>,<item>', a node id being '<prefix>.<item>' (a node
//                 with no dot has the empty prefix). An item is the node's last part, then '=<option>' at a pick node or '=<n>' on
//                 an open road; a rank stone, a waystone or a vow is the bare part
//   check    FNV-1a (32 bit) of the payload: a typo or a cut-off paste is refused as damaged. It is no seal (anyone can recompute it);
//            what stops a tampered code is the decode's own checks against the catalogue, and then the server's
// DECODE: whitespace dropped (a code wrapped by a chat line), the length bounded, every id looked up in the catalogue (an unknown one is
//   refused, never dropped silently), an open road's count clamped to CODE.openMax, and the build checked whole (core/talents.js
//   buildProblems, the twin of the server's hr_talent_build_problem). The refusal codes are words in src/data/text/share.js.
//
// PURE ESM, dual-runtime (the edge may one day make codes from the builds it holds). No DOM, no clock, no Math.random.
// ============================================================

import { NODE_INDEX, PICK_KINDS, TALENT_NODES } from '../data/talents.js';
import { OPEN_HUNTS } from '../data/hunts.js';
import { RISKS } from '../data/danger.js';
import { COMPANY_LINES } from '../data/company-lines.js';
import { normalize, optionOf, buildProblems } from './talents.js';

/** The code's bounds: a blast radius, not a balance number. `openMax` is far past any Level's points (one a Level). */
export const CODE = Object.freeze({ version: 1, prefix: 'HR', maxChars: 8192, openMax: 2000 });

/** Every refusal a decode can give (each worded in src/data/text/share.js). */
export const CODE_ERRORS = Object.freeze(['code_empty', 'code_long', 'code_bad', 'code_version', 'code_damaged', 'unknown_ground',
  'unknown_stance', 'unknown_talent', 'bad_build']);

const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const GROUNDS = new Set(OPEN_HUNTS.map((h) => h.id));
const KEYS = Object.freeze(['g', 'r', 'w', 'f', 'b']);
const PART = /^[a-z0-9_]{1,64}$/;
const PRINTABLE = /^[\x20-\x7e]*$/;
const SHAPE = /^HR(\d{1,3})-([A-Za-z0-9_-]+)-([0-9a-z]{7})$/;

/** FNV-1a 32 of an ASCII string, as 7 base36 digits. Pure. */
function check(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36).padStart(7, '0');
}
const toB64url = (s) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function fromB64url(s) {
  try { return atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)); } catch (e) { return null; }
}

/** A build as the code's text: nodes sorted by id, grouped by prefix. Pure. */
function buildText(nodes) {
  const groups = new Map();
  for (const id of Object.keys(nodes).sort()) {
    const dot = id.lastIndexOf('.');
    const prefix = dot < 0 ? '' : id.slice(0, dot), part = dot < 0 ? id : id.slice(dot + 1), v = nodes[id];
    if (!groups.has(prefix)) groups.set(prefix, []);
    groups.get(prefix).push(v === true ? part : part + '=' + v);
  }
  return [...groups].map(([p, items]) => p + ':' + items.join(',')).join('/');
}

/**
 * THE CODE FOR A PLAN: { ground?, risk?, lines?: { wear_upgrades?, if_one_falls? }, nodes? }, each part only when it is a catalogue word
 * (anything else is left out, so a code never carries what its own decode would refuse). Null when nothing is left to share.
 */
export function encodePlanCode(plan) {
  const p = plan && typeof plan === 'object' ? plan : {};
  const lines = p.lines && typeof p.lines === 'object' ? p.lines : {};
  const f = [];
  if (GROUNDS.has(p.ground)) f.push('g=' + p.ground);
  if (typeof p.risk === 'string' && own(RISKS, p.risk)) f.push('r=' + p.risk);
  if (COMPANY_LINES.wear_upgrades.includes(lines.wear_upgrades)) f.push('w=' + lines.wear_upgrades);
  if (COMPANY_LINES.if_one_falls.includes(lines.if_one_falls)) f.push('f=' + lines.if_one_falls);
  const nodes = p.nodes ? normalize(p.nodes) : {};
  for (const id of Object.keys(nodes)) if (Number.isInteger(nodes[id])) nodes[id] = Math.min(CODE.openMax, nodes[id]);
  if (Object.keys(nodes).length && !buildProblems(nodes).length) f.push('b=' + buildText(nodes));
  if (!f.length) return null;
  const payload = f.join(';');
  return CODE.prefix + CODE.version + '-' + toB64url(payload) + '-' + check(payload);
}

/* The build part, read strictly: every id a node, every value the node's kind takes; an open road clamped to 1..openMax. */
function readBuild(text) {
  const out = {};
  let n = 0;
  for (const group of text.split('/')) {
    const colon = group.indexOf(':');
    if (colon < 0) return { error: 'code_bad' };
    const prefix = group.slice(0, colon);
    if (prefix && !prefix.split('.').every((x) => PART.test(x))) return { error: 'unknown_talent' };
    for (const item of group.slice(colon + 1).split(',')) {
      const eq = item.indexOf('=');
      const part = eq < 0 ? item : item.slice(0, eq), val = eq < 0 ? null : item.slice(eq + 1);
      if (!PART.test(part)) return { error: 'unknown_talent' };
      const id = prefix ? prefix + '.' + part : part;
      const node = own(NODE_INDEX, id) ? NODE_INDEX[id] : null;
      if (!node || node.kind === 'start') return { error: 'unknown_talent' };
      if (own(out, id) || ++n > TALENT_NODES.length) return { error: 'code_bad' };
      if (node.kind === 'open') {
        if (val === null || !/^\d{1,6}$/.test(val) || Number(val) < 1) return { error: 'code_bad' };
        out[id] = Math.min(CODE.openMax, Number(val));
      } else if (PICK_KINDS.includes(node.kind)) {
        if (val === null || !optionOf(node, val)) return { error: 'unknown_talent' };
        out[id] = val;
      } else {
        if (val !== null) return { error: 'code_bad' };
        out[id] = true;
      }
    }
  }
  return buildProblems(out).length ? { error: 'bad_build' } : { nodes: out };
}

/**
 * READ A PASTED CODE: { ok: true, plan: { ground, risk, lines: { wear_upgrades, if_one_falls }, nodes } } (each part null when the code
 * has none), or { ok: false, error } with `error` one of CODE_ERRORS. Pure: it writes nothing and trusts nothing.
 */
export function decodePlanCode(input) {
  const raw = typeof input === 'string' ? input.replace(/\s+/g, '') : '';
  if (!raw) return { ok: false, error: 'code_empty' };
  if (raw.length > CODE.maxChars) return { ok: false, error: 'code_long' };
  const m = SHAPE.exec(raw);
  if (!m) return { ok: false, error: 'code_bad' };
  if (Number(m[1]) !== CODE.version) return { ok: false, error: 'code_version' };
  const payload = fromB64url(m[2]);
  if (payload === null || !PRINTABLE.test(payload)) return { ok: false, error: 'code_bad' };
  if (check(payload) !== m[3]) return { ok: false, error: 'code_damaged' };
  const plan = { ground: null, risk: null, lines: { wear_upgrades: null, if_one_falls: null }, nodes: null };
  const seen = new Set();
  for (const field of payload.split(';')) {
    const eq = field.indexOf('=');
    const k = eq < 0 ? field : field.slice(0, eq), v = eq < 0 ? '' : field.slice(eq + 1);
    if (!KEYS.includes(k) || seen.has(k) || !v) return { ok: false, error: 'code_bad' };
    seen.add(k);
    if (k === 'g') { if (!GROUNDS.has(v)) return { ok: false, error: 'unknown_ground' }; plan.ground = v; }
    else if (k === 'r') { if (!own(RISKS, v)) return { ok: false, error: 'unknown_stance' }; plan.risk = v; }
    else if (k === 'w') { if (!COMPANY_LINES.wear_upgrades.includes(v)) return { ok: false, error: 'code_bad' }; plan.lines.wear_upgrades = v; }
    else if (k === 'f') { if (!COMPANY_LINES.if_one_falls.includes(v)) return { ok: false, error: 'code_bad' }; plan.lines.if_one_falls = v; }
    else {
      const b = readBuild(v);
      if (b.error) return { ok: false, error: b.error };
      plan.nodes = b.nodes;
    }
  }
  return { ok: true, plan };
}
