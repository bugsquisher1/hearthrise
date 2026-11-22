// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/candidates.mjs — A CANDIDATE GAME IS DATA (Balance Lab phase 3; docs/design/redesign/07-balance-lab.md section 3.2).
//
// A VARIANT is a named delta at one of four depths, and a CANDIDATE is a set of them:
//   1 numbers    a knob or a line edit (the patch schema hearthrise.balance-patch/1, matrix-scratch.mjs), as before
//   2 rows       a whole data file replaced: `rows: [{ file, from }]`, a file overlay
//   3 formulas   a rule slot's family: `variants: [{ slot, family }]` (rule-slots.json), a file overlay on the slot's module
//   4 mechanics  an engine branch: `base: { ref }`, played through lane/bl-baseline's materialize (tools/balance-program/baseline/tree.mjs,
//                `baseline.mjs --materialize`): the ref's game with this checkout's harness laid over it
//
// THE MANIFEST, tools/balance-program/candidates/<id>.json (schema hearthrise.balance-candidate/1):
//   { id, why, kind?: 'identity', base: 'tree' | { ref }, variants: [{ slot, family }], rows: [{ file, from }], knobs: { id: x },
//     edits: [{ file, from, to }], assumptions: [words] }
// C0 is the tree with nothing laid over it. A candidate NEVER carries a runtime switch: everything it changes is a file on a scratch copy.
//
// THE REFUSALS (each says why, by name):
//   - two variants on one slot in one candidate, or two candidates on one slot when composed (`compose`): one slot, one family
//   - two overlays on one file (a rows overlay on a slot's module counts)
//   - a slot whose seam is not cut (status 'git-ref' in rule-slots.json): it is played only as a depth 4 ref
//   - an identity candidate naming a family that is not an identity copy
//   - a ref candidate with anything laid over it, or two refs: one base. Commit the overlay on the ref's branch (a known limit of phase 3)
//
//   readSlots(root)            the slot registry: { slots, byId, families: Map('slot/family' -> { slot, family }) }
//   readCandidate(idOrPath)    a manifest, checked
//   compose(list, reg)         one candidate from several, with the refusals above
//   candidatePatch(c, reg)     the balance patch a candidate plays (its overlays, knobs and edits), never touching the tree
//   treeOf(c, reg)             { root, done, patch, applied, ref }: the tree (C0), a scratch copy (depths 1 to 3) or a materialized ref (4)
//
// mutant-anchors: none — a library; tests/rule-slots.mjs --selftest plants the manifests that must be refused, in memory
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, existsSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve, dirname, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PATCH_SCHEMA, plantScratch, checkPatch } from './matrix-scratch.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
export const SLOTS_FILE = 'tools/balance-program/rule-slots.json';
export const SLOTS_SCHEMA = 'hearthrise.rule-slots/1';
export const CANDIDATE_DIR = 'tools/balance-program/candidates';
export const CANDIDATE_SCHEMA = 'hearthrise.balance-candidate/1';
export const SHELF = 'tools/balance-program/variants/';
/* the first line of every shelf file: tools/pack-edge.mjs refuses a bundle that carries it */
export const MARKER = 'balance-variant:';
export const markerLineOf = (slot, family) => '// ' + MARKER + ' ' + slot + '/' + family;
/* lane/bl-baseline's materialize (07 section 3.2 depth 4): the module a ref candidate is played through */
export const MATERIALIZE_MODULE = join(HERE, 'baseline', 'tree.mjs');

const repoPath = (p) => typeof p === 'string' && p.length > 0 && !isAbsolute(p) && !p.split(/[\\/]/).includes('..');

/**
 * A family's file on the shelf, DERIVED from its slot and id (never typed twice): tools/balance-program/variants/<slot>/<slot>.<family>.js.
 * The basename carries the slot so it is unique in the repository: the CI gate (tools/lib/guard-deps.mjs) matches a changed file to the
 * guards that name it by basename, and three `copy.js` files would be one name to it.
 */
export const shelfFileOf = (slot, family) => SHELF + slot + '/' + slot + '.' + family + '.js';
const WORDS = /^[a-z][a-z0-9-]*$/;

/** The slot registry of the tree at `root`, checked for shape (the contracts themselves are tests/rule-slots.mjs's). */
export function readSlots(root = ROOT) {
  const doc = JSON.parse(readFileSync(join(root, SLOTS_FILE), 'utf8'));
  if (doc.schema !== SLOTS_SCHEMA) throw new Error('slots: ' + SLOTS_FILE + ' is ' + doc.schema + ', not ' + SLOTS_SCHEMA);
  return registryOf(doc);
}
/** The registry of one document (readSlots's, or a test's planted one): { doc, slots, byId, families: Map('slot/family' -> { slot, family }) }. */
export function registryOf(doc) {
  const byId = new Map(), families = new Map();
  for (const s of doc.slots || []) {
    if (!WORDS.test(s.id || '')) throw new Error('slots: a slot id ' + JSON.stringify(s.id) + ' is not lower-case words');
    if (byId.has(s.id)) throw new Error('slots: ' + s.id + ' is listed twice');
    if (!['cut', 'git-ref'].includes(s.status)) throw new Error('slots: ' + s.id + ' has status ' + s.status + ', not cut or git-ref');
    if (!repoPath(s.module)) throw new Error('slots: ' + s.id + ' names no module');
    byId.set(s.id, s);
    if (s.status !== 'cut') continue;
    if (!Array.isArray(s.rule) || !s.rule.length) throw new Error('slots: ' + s.id + ' is cut but names no rule exports');
    const kinds = (s.families || []).map((f) => f.kind);
    if (kinds.filter((k) => k === 'shipped').length !== 1) throw new Error('slots: ' + s.id + ' needs exactly one shipped family');
    for (const f0 of s.families || []) {
      if (!WORDS.test(f0.id || '')) throw new Error('slots: ' + s.id + ' has a family id ' + JSON.stringify(f0.id) + ' that is not lower-case words');
      if (!['shipped', 'identity', 'formula'].includes(f0.kind)) throw new Error('slots: ' + s.id + '/' + f0.id + ' has kind ' + f0.kind);
      if (f0.file !== undefined) throw new Error('slots: ' + s.id + '/' + f0.id + ' types a file; a family\'s file is derived (' + shelfFileOf(s.id, f0.id) + ')');
      const f = f0.kind === 'shipped' ? f0 : { ...f0, file: shelfFileOf(s.id, f0.id) };
      const key = s.id + '/' + f.id;
      if (families.has(key)) throw new Error('slots: ' + key + ' is listed twice');
      families.set(key, { slot: s, family: f });
    }
  }
  return { doc, slots: doc.slots || [], byId, families };
}

/** The family `slot/family`, refused when the slot is not cut or the family is unknown. */
export function familyOf(reg, slot, family) {
  const s = reg.byId.get(slot);
  if (!s) throw new Error('candidate: no slot ' + slot + ' (' + SLOTS_FILE + ': ' + [...reg.byId.keys()].join(', ') + ')');
  if (s.status !== 'cut') throw new Error('candidate: slot ' + slot + ' is not cut (' + s.why + '); play it as a depth 4 ref, `base: { ref }`');
  const f = reg.families.get(slot + '/' + family);
  if (!f) throw new Error('candidate: slot ' + slot + ' has no family ' + family + ' (' + s.families.map((x) => x.id).join(', ') + ')');
  return f;
}

/** A manifest checked against the registry (throws, by name, on anything it cannot play). */
export function checkCandidate(c, reg = readSlots()) {
  if (!c || typeof c !== 'object') throw new Error('candidate: not an object');
  if (c.schema !== CANDIDATE_SCHEMA) throw new Error('candidate ' + c.id + ': schema ' + c.schema + ' is not ' + CANDIDATE_SCHEMA);
  if (!/^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(c.id || '')) throw new Error('candidate: id ' + JSON.stringify(c.id) + ' is not a file-safe name (a composed id joins ids with +)');
  if (c.kind !== undefined && c.kind !== 'identity') throw new Error('candidate ' + c.id + ': kind ' + c.kind + ' is not identity');
  const base = c.base === undefined ? 'tree' : c.base;
  if (base !== 'tree' && !(base && typeof base.ref === 'string' && base.ref.length)) throw new Error('candidate ' + c.id + ': base is \'tree\' or { ref }');
  for (const k of ['variants', 'rows', 'edits', 'assumptions']) if (c[k] !== undefined && !Array.isArray(c[k])) throw new Error('candidate ' + c.id + ': ' + k + ' must be a list');
  if (c.knobs !== undefined && (typeof c.knobs !== 'object' || Array.isArray(c.knobs))) throw new Error('candidate ' + c.id + ': knobs is { id: multiplier }');
  const slots = new Set(), files = new Map();
  const claim = (file, by) => { if (files.has(file)) throw new Error('candidate ' + c.id + ': ' + by + ' and ' + files.get(file) + ' both replace ' + file + ' (one file, one overlay)'); files.set(file, by); };
  for (const v of c.variants || []) {
    if (!v || typeof v.slot !== 'string' || typeof v.family !== 'string') throw new Error('candidate ' + c.id + ': a variant is { slot, family }');
    if (slots.has(v.slot)) throw new Error('candidate ' + c.id + ': two variants on slot ' + v.slot + ' (one slot, one family)');
    slots.add(v.slot);
    const { slot, family } = familyOf(reg, v.slot, v.family);
    if (c.kind === 'identity' && family.kind !== 'identity') throw new Error('candidate ' + c.id + ' is an identity candidate but ' + v.slot + '/' + v.family + ' is a ' + family.kind + ' family');
    if (family.kind !== 'shipped') claim(slot.module, 'variant ' + v.slot + '/' + v.family);
  }
  for (const r of c.rows || []) {
    if (!r || !repoPath(r.file) || !repoPath(r.from)) throw new Error('candidate ' + c.id + ': a rows overlay is { file, from }, repo paths');
    if (!r.from.startsWith(SHELF)) throw new Error('candidate ' + c.id + ': rows overlay ' + r.file + ' comes from ' + r.from + ', not the shelf ' + SHELF);
    if (c.kind === 'identity') throw new Error('candidate ' + c.id + ' is an identity candidate and lays rows (an identity candidate lays identity copies only)');
    claim(r.file, 'rows overlay ' + r.from);
  }
  if (c.kind === 'identity' && (Object.keys(c.knobs || {}).length || (c.edits || []).length)) throw new Error('candidate ' + c.id + ' is an identity candidate and moves numbers');
  if (base !== 'tree' && (files.size || Object.keys(c.knobs || {}).length || (c.edits || []).length)) {
    throw new Error('candidate ' + c.id + ' names the ref ' + base.ref + ' and lays something over it: a ref candidate plays the ref alone (commit the overlay on the ref\'s branch)');
  }
  return { ...c, base };
}

/** A manifest by id (tools/balance-program/candidates/<id>.json) or by path, checked. */
export function readCandidate(idOrPath, reg = readSlots(), root = ROOT) {
  const p = /\.json$/.test(idOrPath) ? resolve(root, idOrPath) : join(root, CANDIDATE_DIR, idOrPath + '.json');
  if (!existsSync(p)) throw new Error('candidate: no manifest ' + p + ' (' + listCandidates(root).join(', ') + ')');
  return checkCandidate(JSON.parse(readFileSync(p, 'utf8')), reg);
}
/** Every manifest id on the tree. */
export const listCandidates = (root = ROOT) => (existsSync(join(root, CANDIDATE_DIR)) ? readdirSync(join(root, CANDIDATE_DIR)).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort() : []);

/**
 * Several candidates as one (they compose): their variants, rows, edits and assumptions together and their knobs multiplied. REFUSED when
 * two lay a family on one slot or an overlay on one file, or name two bases. The answer is checked as one candidate.
 */
export function compose(list, reg = readSlots()) {
  if (!list.length) throw new Error('compose: no candidates');
  const cs = list.map((c) => checkCandidate(c, reg));
  if (cs.length === 1) return cs[0];
  const bySlot = new Map();
  for (const c of cs) for (const v of c.variants || []) {
    if (bySlot.has(v.slot)) throw new Error('compose: candidates ' + bySlot.get(v.slot) + ' and ' + c.id + ' both lay a family on slot ' + v.slot + ' (one slot, one family)');
    bySlot.set(v.slot, c.id);
  }
  const refs = [...new Set(cs.map((c) => (c.base === 'tree' ? 'tree' : 'ref:' + c.base.ref)))];
  if (refs.length > 1) throw new Error('compose: ' + cs.map((c) => c.id).join(' + ') + ' name two bases (' + refs.join(', ') + '): one base');
  const knobs = {};
  for (const c of cs) for (const [k, m] of Object.entries(c.knobs || {})) knobs[k] = (knobs[k] || 1) * m;
  const out = { schema: CANDIDATE_SCHEMA, id: cs.map((c) => c.id).join('+'), why: cs.map((c) => c.id + ': ' + (c.why || '')).join(' | '), base: cs[0].base,
    ...(cs.every((c) => c.kind === 'identity') ? { kind: 'identity' } : {}),
    variants: cs.flatMap((c) => c.variants || []), rows: cs.flatMap((c) => c.rows || []), knobs, edits: cs.flatMap((c) => c.edits || []),
    assumptions: cs.flatMap((c) => c.assumptions || []) };
  return checkCandidate(out, reg);
}

/** The balance patch a candidate plays on a scratch copy: its overlays (slot families, then rows), knobs and edits. The tree is never written. */
export function candidatePatch(c, reg = readSlots()) {
  checkCandidate(c, reg);
  const overlays = [];
  for (const v of c.variants || []) {
    const { slot, family } = familyOf(reg, v.slot, v.family);
    if (family.kind !== 'shipped') overlays.push({ file: slot.module, from: family.file, slot: slot.id, family: family.id });
  }
  for (const r of c.rows || []) overlays.push({ file: r.file, from: r.from });
  const patch = { schema: PATCH_SCHEMA, name: 'candidate ' + c.id, why: c.why || '', ...(c.kind === 'identity' ? { kind: 'identity' } : {}),
    knobs: { ...(c.knobs || {}) }, edits: [...(c.edits || [])], overlays, targets: [] };
  return checkPatch(patch);
}
/** Does the candidate lay nothing on the tree (C0)? */
export const isBare = (patch) => !patch.overlays.length && !patch.edits.length && !Object.values(patch.knobs).some((m) => m !== 1);

/**
 * The tree a candidate plays: { root, done(), patch, applied, ref }. C0 plays the tree itself; depths 1 to 3 a scratch copy (plantScratch);
 * depth 4 the ref, materialized by lane/bl-baseline's tree.mjs into a temporary folder with this checkout's harness over it. `o.module`
 * stands in for that module (the selftest's planted materialize); `o.scratch` plays even C0 on a scratch copy.
 */
export async function treeOf(c, reg = readSlots(), o = {}) {
  const patch = candidatePatch(c, reg);
  if (c.base !== 'tree') {
    const mod = o.module || MATERIALIZE_MODULE;
    if (!existsSync(mod)) throw new Error('candidate ' + c.id + ' names the ref ' + c.base.ref + ': depth 4 plays through tools/balance-program/baseline/tree.mjs materialize (lane/bl-baseline, `baseline.mjs --materialize`), which is not on this tree');
    const T = await import(pathToFileURL(mod).href);
    if (typeof T.materialize !== 'function') throw new Error('candidate ' + c.id + ': ' + mod + ' exports no materialize({ game, into, harnessRoot })');
    const into = mkdtempSync(join(tmpdir(), 'candidate-ref-'));
    try {
      const rec = T.materialize({ game: c.base.ref, into: join(into, 'tree'), label: 'candidate ' + c.id, harnessRoot: ROOT });
      return { root: join(into, 'tree'), done: () => rmSync(into, { recursive: true, force: true }), patch, applied: [], ref: { ref: c.base.ref, sha: rec && rec.game ? rec.game.sha : null } };
    } catch (e) { rmSync(into, { recursive: true, force: true }); throw e; }
  }
  if (isBare(patch) && !o.scratch) return { root: ROOT, done: () => {}, patch, applied: [], ref: null };
  const s = await plantScratch(patch);
  return { root: s.root, done: s.done, patch, applied: s.applied, ref: null };
}
