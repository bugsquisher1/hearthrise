// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/matrix-scratch.mjs — A PATCH, PLAYED ON A SCRATCH COPY (the balance matrix's --diff and --sweep; 40-formula-brief
// section 6, lane/c-balance-matrix).
//
//   locateKnob(root, knob)           -> every site of a knobs.mjs knob: { file, line (1-based), text, picks [{ prefix, value }] }; throws when a
//                                       site matches another number of lines or numbers than it names (a knob that moves nothing proves nothing)
//   patchEdits(root, patch)          -> the [file, from, to] line edits a patch makes, and what each knob moved (file:line, before, after)
//   plantScratch(patch)              -> { root, applied, regen, done() }: the engine's trees copied to the OS temp folder, the edits written
//                                       there, the monster rows re-written from the formula when the patch moves it; never the real tree
//
// A PATCH (schema hearthrise.balance-patch/1): { name, why, knobs: { id: multiplier }, edits: [{ file, from, to }], targets: [band id,
// band id prefix, band group ('pace', 'survival', 'gold', 'gear', ...) or 'metric:<name>'] }. `knobs` scale the numbers knobs.mjs names;
// `edits` replace one exact text in one planted file (exactly one occurrence, or the plant throws). `targets` is what the patch means to
// move: the diff calls any other band it moves UNINTENDED.
//
// THE COPY is tests/hunt-core/fixtures/h1.js plant (src/core, src/data, src/build-info.js) with the trees the engine and the advice read
// beside it (the hr-accrue settle, the play fixture, src/shell and src/render for the advice), plus the formula's writer and a package.json.
// The matrix forks tools/balance-sim/worker.mjs with the copy as its root, so every module the engine loads is the copy's.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, cpSync, existsSync } from 'node:fs';
import { join, resolve, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { KNOBS, knobById } from './knobs.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
export const PATCH_SCHEMA = 'hearthrise.balance-patch/1';
/* the trees a planted run reads beside src/core and src/data (play-ground.mjs PLAY_TREES and what the worker's advice imports) */
export const SCRATCH_TREES = Object.freeze(['supabase/functions/hr-accrue', 'tests/hunt-core/fixtures', 'src/shell', 'src/render']);
/* the single files: the formula's writer (regen), the helper it imports, and the package that makes src/**.js ES modules */
const SCRATCH_FILES = Object.freeze(['tools/gen-ground-stats.mjs', 'tests/_is-main.mjs', 'package.json']);
/* the files whose numbers the monster rows are written from: an edit there re-writes the rows, as a designer's change would */
const FORMULA_SOURCES = Object.freeze(['src/data/balance-sheet.js', 'src/data/core-model.js']);

const NUM = '(-?\\d+(?:\\.\\d+)?)';
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A number scaled by `m`, written as the source writes it: whole stays whole unless `float`; a decimal keeps 6 places at most. */
export function scaled(text, m, float = false) {
  const v = Number(text) * m;
  if (!text.includes('.') && !float) return String(Math.round(v));
  return String(Math.round(v * 1e6) / 1e6);
}

/** The sites of one knob in the tree at `root`. */
export function locateKnob(root, knob) {
  const out = [];
  for (const s of knob.sites) {
    const lines = readFileSync(join(root, s.file), 'utf8').split('\n');
    const hits = [];
    lines.forEach((text, i) => { if (text.includes(s.line)) hits.push(i); });
    if (hits.length !== s.count) throw new Error('knob ' + knob.id + ': ' + s.file + ' has ' + hits.length + ' lines with ' + JSON.stringify(s.line) + ', the knob names ' + s.count);
    for (const i of hits) {
      const text = lines[i], picks = [];
      for (const n of s.nums) {
        if (n && n.all) {
          for (const m of text.matchAll(/(?<![\w.])(-?\d+(?:\.\d+)?)(?![\w.])/g)) picks.push({ prefix: null, index: m.index, value: m[1], float: false });
          continue;
        }
        const src = typeof n === 'string' ? n : n.at;
        const re = new RegExp('(' + src + ')' + NUM, 'g');
        const ms = [...text.matchAll(re)];
        if (ms.length !== 1) throw new Error('knob ' + knob.id + ': ' + s.file + ':' + (i + 1) + ' has ' + ms.length + ' numbers after /' + src + '/, the knob names 1');
        picks.push({ prefix: src, index: ms[0].index + ms[0][1].length, value: ms[0][2], float: !!(n && n.float) });
      }
      if (!picks.length) throw new Error('knob ' + knob.id + ': ' + s.file + ':' + (i + 1) + ' picks no number');
      out.push({ file: s.file, line: i + 1, text, picks });
    }
  }
  return out;
}

/** A line with each pick's number scaled by `m` (right to left, so the indexes hold). */
function scaleLine(site, m) {
  let text = site.text;
  const to = [];
  for (const p of [...site.picks].sort((a, b) => b.index - a.index)) {
    const v = scaled(p.value, m, p.float);
    text = text.slice(0, p.index) + v + text.slice(p.index + p.value.length);
    to.unshift(v);
  }
  return { text, to };
}

/** A patch checked against the schema and today's knobs (throws on anything it cannot play). */
export function checkPatch(patch) {
  if (!patch || typeof patch !== 'object') throw new Error('patch: not an object');
  if (patch.schema && patch.schema !== PATCH_SCHEMA) throw new Error('patch: schema ' + patch.schema + ' is not ' + PATCH_SCHEMA);
  for (const [id, m] of Object.entries(patch.knobs || {})) {
    if (!knobById(id)) throw new Error('patch: no knob ' + id + ' (knobs.mjs: ' + KNOBS.map((k) => k.id).join(', ') + ')');
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

/** The line edits a patch makes on the tree at `root`: { edits: [[file, from, to]], applied: [{ knob, file, line, from, to }] }. */
export function patchEdits(root, patch) {
  checkPatch(patch);
  const edits = [], applied = [];
  for (const [id, m] of Object.entries(patch.knobs || {})) {
    if (m === 1) continue;
    for (const site of locateKnob(root, knobById(id))) {
      const { text, to } = scaleLine(site, m);
      edits.push([site.file, site.text, text]);
      applied.push({ knob: id, multiplier: m, file: site.file, line: site.line, from: site.picks.map((p) => p.value), to });
    }
  }
  for (const e of patch.edits || []) { edits.push([e.file, e.from, e.to]); applied.push({ edit: true, file: e.file, from: e.from.slice(0, 80), to: e.to.slice(0, 80) }); }
  return { edits, applied };
}

/** Does this patch move the numbers the monster rows are written from? */
export function needsRegen(patch) {
  return Object.entries(patch.knobs || {}).some(([id, m]) => m !== 1 && knobById(id).regen) || (patch.edits || []).some((e) => FORMULA_SOURCES.includes(e.file));
}

/**
 * The patch played on a SCRATCH COPY: answers { root, applied, regen, done() }. The copy lives in the OS temp folder; the real tree is
 * read, never written (a copy that resolves inside the repo is refused).
 */
export async function plantScratch(patch, o = {}) {
  const { edits, applied } = patchEdits(ROOT, patch);
  const { plant } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/h1.js')).href);
  const p = plant(edits, [...SCRATCH_TREES]);
  const inRepo = !relative(ROOT, p.root).startsWith('..') && !isAbsolute(relative(ROOT, p.root));
  if (inRepo) { p.done(); throw new Error('matrix-scratch: the copy ' + p.root + ' is inside the repo; refused'); }
  try {
    for (const f of SCRATCH_FILES) if (existsSync(join(ROOT, f))) cpSync(join(ROOT, f), join(p.root, f));
    let regen = null;
    if (needsRegen(patch) && o.regen !== false) {
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

/** Every knob located on the tree at `root` (the --knobs listing and the selftest). */
export function knobTable(root = ROOT) {
  return KNOBS.map((k) => ({ id: k.id, label: k.label, group: k.group, regen: !!k.regen, steps: k.steps, what: k.what, sites: locateKnob(root, k).map((s) => ({ at: s.file + ':' + s.line, values: s.picks.map((p) => p.value) })) }));
}

export const _test = { scaleLine, esc, ROOT };
