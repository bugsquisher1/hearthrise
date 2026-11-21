// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/matrix-scratch.mjs — A PATCH, PLAYED ON A SCRATCH COPY (the balance matrix's --diff and --sweep; 40-formula-brief
// section 6, lane/c-balance-matrix).
//
//   readKnobs(root)                  -> the knob list, tools/balance-program/formulas/knobs.json (the ONE list: 44-formula-architecture.md
//                                       section 5): { knobs (live), planned, notKnobs, byId }
//   locateKnob(root, knob)           -> every site of a knob: { file, line (1-based), text, picks [{ prefix, index, value, float }] }; throws when
//                                       a site matches another number of lines or numbers than it names (a knob that moves nothing proves nothing)
//   patchEdits(root, patch, list)    -> the [file, from, to] line edits a patch makes, ONE EDIT A LINE: knobs that pick numbers on the same line
//                                       (knobs.json `sharesLineWith`) are composed into it, and two knobs on one number multiply; and what each
//                                       knob moved (file:line, before, after)
//   plantScratch(patch)              -> { root, applied, regen, done() }: the engine's trees copied to the OS temp folder, the edits written
//                                       there, the monster rows re-written from the formula when the patch moves it; never the real tree
//
// A PATCH (schema hearthrise.balance-patch/1): { name, why, kind, knobs: { id: multiplier }, edits: [{ file, from, to }], targets: [band id,
// band id prefix, band group ('pace', 'survival', 'gold', 'gear', ...) or 'metric:<name>'] }. `knobs` scale the numbers knobs.json names;
// `edits` replace one exact text in one planted file (exactly one occurrence, or the plant throws). `targets` is what the patch means to
// move: the diff calls any other band it moves UNTARGETED. `kind` (44 section 6.2): 'identity' (no number may move), 'coefficient' (no
// band outside the targets may move) or 'derivation' (no targeted band may end worse than it started); balance-matrix.mjs --diff exits 1
// when the patch's own kind fails.
//
// THE COPY is tests/hunt-core/fixtures/h1.js plant (src/core, src/data, src/build-info.js) with the trees the engine and the advice read
// beside it (the hr-accrue settle, the play fixture, src/shell and src/render for the advice), plus the formula's writer and a package.json.
// The matrix forks tools/balance-sim/worker.mjs with the copy as its root, so every module the engine loads is the copy's.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, cpSync, existsSync } from 'node:fs';
import { join, resolve, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { KNOB_SCHEMA, KNOB_FILE, knobValue, composeMultipliers } from './knob-rules.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
export const PATCH_SCHEMA = 'hearthrise.balance-patch/1';
export const PATCH_KINDS = Object.freeze(['identity', 'coefficient', 'derivation']);
/* the trees a planted run reads beside src/core and src/data (play-ground.mjs PLAY_TREES and what the worker's advice imports) */
export const SCRATCH_TREES = Object.freeze(['supabase/functions/hr-accrue', 'tests/hunt-core/fixtures', 'src/shell', 'src/render']);
/* the single files: the formula's writer (regen), the helper it imports, and the package that makes src/**.js ES modules */
const SCRATCH_FILES = Object.freeze(['tools/gen-ground-stats.mjs', 'tests/_is-main.mjs', 'package.json']);
/* the files whose numbers the monster rows are written from: an edit there re-writes the rows, as a designer's change would */
const FORMULA_SOURCES = Object.freeze(['src/data/balance-sheet.js', 'src/data/core-model.js', 'src/data/to-hit.js']);

const NUM = '(-?\\d+(?:\\.\\d+)?)';
/** knobValue under its old name (the selftest and callers that scale one number) */
export const scaled = knobValue;

/** The knob list of the tree at `root` (knobs.json). */
export function readKnobs(root = ROOT) {
  const doc = JSON.parse(readFileSync(join(root, KNOB_FILE), 'utf8'));
  if (doc.schema !== KNOB_SCHEMA) throw new Error('knobs: ' + KNOB_FILE + ' is ' + doc.schema + ', not ' + KNOB_SCHEMA);
  const knobs = doc.knobs || [];
  const byId = new Map(knobs.map((k) => [k.id, k]));
  if (byId.size !== knobs.length) throw new Error('knobs: an id is listed twice in ' + KNOB_FILE);
  return { knobs, planned: doc.planned || [], notKnobs: doc.notKnobs || [], byId, from: doc.from || null };
}

/** The sites of one knob in the tree at `root` (`read(file)`: the file's text, when it is not the one on disk: a patch's edits applied). */
export function locateKnob(root, knob, read = null) {
  const out = [];
  for (const s of knob.sites) {
    const lines = (read ? read(s.file) : readFileSync(join(root, s.file), 'utf8')).split('\n');
    const count = s.count === undefined ? 1 : s.count;
    const hits = [];
    lines.forEach((text, i) => { if (text.includes(s.line)) hits.push(i); });
    if (hits.length !== count) throw new Error('knob ' + knob.id + ': ' + s.file + ' has ' + hits.length + ' lines with ' + JSON.stringify(s.line) + ', the knob names ' + count);
    for (const i of hits) {
      const text = lines[i].replace(/\r$/, ''), picks = [];
      for (const n of s.nums) {
        if (n && n.all) {
          for (const m of text.matchAll(/(?<![\w.])(-?\d+(?:\.\d+)?)(?![\w.])/g)) picks.push({ prefix: null, index: m.index, value: m[1], float: false });
          continue;
        }
        const src = typeof n === 'string' ? n : n.at;
        const ms = [...text.matchAll(new RegExp('(' + src + ')' + NUM, 'g'))];
        if (ms.length !== 1) throw new Error('knob ' + knob.id + ': ' + s.file + ':' + (i + 1) + ' has ' + ms.length + ' numbers after /' + src + '/, the knob names 1');
        picks.push({ prefix: src, index: ms[0].index + ms[0][1].length, value: ms[0][2], float: !!(n && n.float) });
      }
      if (!picks.length) throw new Error('knob ' + knob.id + ': ' + s.file + ':' + (i + 1) + ' picks no number');
      out.push({ file: s.file, line: i + 1, text, picks });
    }
  }
  return out;
}

/** A patch checked against the schema and the knob list (throws on anything it cannot play). */
export function checkPatch(patch, list = readKnobs()) {
  if (!patch || typeof patch !== 'object') throw new Error('patch: not an object');
  if (patch.schema && patch.schema !== PATCH_SCHEMA) throw new Error('patch: schema ' + patch.schema + ' is not ' + PATCH_SCHEMA);
  if (patch.kind !== undefined && !PATCH_KINDS.includes(patch.kind)) throw new Error('patch: kind ' + patch.kind + ' is not one of ' + PATCH_KINDS.join(', '));
  for (const [id, m] of Object.entries(patch.knobs || {})) {
    if (!list.byId.has(id)) {
      const planned = list.planned.find((p) => p.id === id);
      throw new Error('patch: no live knob ' + id + (planned ? ' (planned: it arrives with roadmap step ' + planned.arrivesWith + ')' : ' (' + KNOB_FILE + ': ' + [...list.byId.keys()].join(', ') + ')'));
    }
    if (!(Number.isFinite(m) && m > 0)) throw new Error('patch: knob ' + id + ' needs a positive multiplier, got ' + m);
  }
  for (const e of patch.edits || []) {
    if (!e || typeof e.file !== 'string' || typeof e.from !== 'string' || typeof e.to !== 'string') throw new Error('patch: an edit needs { file, from, to }');
    if (isAbsolute(e.file) || e.file.split(/[\\/]/).includes('..')) throw new Error('patch: edit ' + e.file + ' must be a repo path');
    const inTree = ['src/core/', 'src/data/', ...SCRATCH_TREES.map((t) => t + '/')].some((t) => e.file.startsWith(t));
    if (!inTree) throw new Error('patch: edit ' + e.file + ' is outside the planted trees (src/core, src/data, ' + SCRATCH_TREES.join(', ') + ')');
  }
  if (patch.targets !== undefined && !Array.isArray(patch.targets)) throw new Error('patch: targets must be a list');
  return patch;
}

/**
 * The line edits a patch makes on the tree at `root`: { edits: [[file, from, to]], applied: [{ knob, multiplier, file, line, from, to }] }.
 * Every knob's picks are gathered by line first, so knobs that share a line write ONE edit from the untouched line (each pick scaled by the
 * product of the knobs on it), and the plant's exactly-once anchor holds. The patch's own edits come FIRST and the knobs are found on the
 * text they leave (phase 3: a knob turned on the proposed game moves the proposed game's line, never today's line under it); a knob whose
 * line an edit rewrote away is refused by name (`KnobGone`).
 */
export class KnobGone extends Error {}
export function patchEdits(root, patch, list = readKnobs(root)) {
  checkPatch(patch, list);
  const texts = new Map();
  const read = (f) => (texts.has(f) ? texts.get(f) : readFileSync(join(root, f), 'utf8'));
  for (const x of patch.edits || []) {
    const s = read(x.file), n = s.split(x.from).length - 1;
    if (n !== 1) throw new Error('patch: ' + x.file + ' has ' + n + ' copies of the anchor ' + JSON.stringify(x.from.slice(0, 60)) + (x.proposal ? ' (proposal ' + x.proposal + ')' : ''));
    texts.set(x.file, s.replace(x.from, () => x.to));
  }
  const byLine = new Map();
  for (const [id, m] of Object.entries(patch.knobs || {})) {
    if (m === 1) continue;
    let sites;
    try { sites = locateKnob(root, list.byId.get(id), read); }
    catch (e) { if ((patch.edits || []).length) throw new KnobGone('knob ' + id + ' is not on this game: ' + e.message); throw e; }
    for (const site of sites) {
      const key = site.file + ':' + site.line;
      const e = byLine.get(key) || byLine.set(key, { file: site.file, line: site.line, text: site.text, picks: new Map() }).get(key);
      for (const p of site.picks) {
        const q = e.picks.get(p.index) || e.picks.set(p.index, { ...p, knobs: [] }).get(p.index);
        q.knobs.push([id, m]);
        q.float = q.float || p.float;
      }
    }
  }
  const edits = [], applied = [];
  for (const x of patch.edits || []) { edits.push([x.file, x.from, x.to]); applied.push({ edit: true, file: x.file, from: [x.from.slice(0, 80)], to: [x.to.slice(0, 80)] }); }
  for (const e of byLine.values()) {
    let text = e.text;
    const to = new Map();
    for (const p of [...e.picks.values()].sort((a, b) => b.index - a.index)) {
      const v = knobValue(p.value, composeMultipliers(p.knobs.map(([, m]) => m)), p.float);
      text = text.slice(0, p.index) + v + text.slice(p.index + p.value.length);
      to.set(p.index, v);
    }
    edits.push([e.file, e.text, text]);
    const knobs = [...new Set([...e.picks.values()].flatMap((p) => p.knobs.map(([id]) => id)))];
    for (const id of knobs) {
      const mine = [...e.picks.values()].filter((p) => p.knobs.some(([k]) => k === id)).sort((a, b) => a.index - b.index);
      applied.push({ knob: id, multiplier: patch.knobs[id], file: e.file, line: e.line, from: mine.map((p) => p.value), to: mine.map((p) => to.get(p.index)),
        ...(knobs.length > 1 ? { sharedWith: knobs.filter((k) => k !== id) } : {}) });
    }
  }
  return { edits, applied };
}

/** Does this patch move the numbers the monster rows are written from? */
export function needsRegen(patch, list = readKnobs()) {
  return Object.entries(patch.knobs || {}).some(([id, m]) => m !== 1 && list.byId.get(id).regen) || (patch.edits || []).some((e) => FORMULA_SOURCES.includes(e.file));
}

/**
 * The patch played on a SCRATCH COPY: answers { root, applied, regen, done() }. The copy lives in the OS temp folder; the real tree is
 * read, never written (a copy that resolves inside the repo is refused).
 */
export async function plantScratch(patch, o = {}) {
  const list = readKnobs(ROOT);
  const { edits, applied } = patchEdits(ROOT, patch, list);
  const { plant } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/h1.js')).href);
  const p = plant(edits, [...SCRATCH_TREES]);
  const rel = relative(ROOT, p.root);
  if (!rel.startsWith('..') && !isAbsolute(rel)) { p.done(); throw new Error('matrix-scratch: the copy ' + p.root + ' is inside the repo; refused'); }
  try {
    for (const f of SCRATCH_FILES) if (existsSync(join(ROOT, f))) cpSync(join(ROOT, f), join(p.root, f));
    let regen = null;
    if (needsRegen(patch, list) && o.regen !== false) {
      /* matrix-regen.mjs in its own process (every row in the file that holds it), then the copy's own --check must read green */
      const wrote = execFileSync(process.execPath, [join(HERE, 'matrix-regen.mjs'), p.root], { cwd: p.root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
      let check;
      try { check = execFileSync(process.execPath, [join(p.root, 'tools', 'gen-ground-stats.mjs'), '--check'], { cwd: p.root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
      catch (e) { throw new Error('matrix-scratch: the re-written rows are not the formula\'s: ' + String(e.stderr || e.message).trim().split('\n').pop()); }
      regen = { wrote, check: (check.trim().split('\n').pop() || '').trim() };
    }
    return { root: p.root, applied, regen, done: p.done };
  } catch (e) { p.done(); throw e; }
}

/** Every live knob located on the tree at `root` (the --knobs listing and the selftest), with today's numbers against the list's `value`. */
export function knobTable(root = ROOT) {
  const list = readKnobs(root);
  return list.knobs.map((k) => {
    const sites = locateKnob(root, k);
    const now = sites.flatMap((s) => s.picks.map((p) => Number(p.value)));
    const stale = Array.isArray(k.value) && JSON.stringify(k.value.map(Number)) !== JSON.stringify(now);
    return { id: k.id, label: k.label, group: k.group, regen: !!k.regen, ruled: k.ruled || null, formula: k.formula || null, sharesLineWith: k.sharesLineWith || [], steps: k.steps, what: k.what,
      stale, sites: sites.map((s) => ({ at: s.file + ':' + s.line, values: s.picks.map((p) => p.value) })) };
  });
}
