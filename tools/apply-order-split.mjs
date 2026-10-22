#!/usr/bin/env node
// tools/apply-order-split.mjs — the apply order is one file per migration (tools/lib/apply-order.mjs).
//
//   node tools/apply-order-split.mjs --add <file.sql> [--note "STAGED — …"]
//        place a new migration at the end of the apply order (seq = last + 10)
//   node tools/apply-order-split.mjs --migrate [--onto origin/main]
//        for a LANE BRANCH that still edits the old tests/schema-apply-order.json: merges
//        <onto> into the lane and re-expresses the lane's own edits to the old file (new
//        entries, note changes, removals, manifest fields) as entry files. Commits the merge.
//        Refuses (and aborts the merge) on any other conflict, or when <onto> changed the same
//        note/field differently — those go back to the lane.
//   node tools/apply-order-split.mjs --verify <old.json>
//        deep-compare the directory with an old single-file JSON (order, every note, every
//        manifest field). Exit 0 identical · 1 different.
//   node tools/apply-order-split.mjs --split
//        the one-time conversion: tests/schema-apply-order.json → tests/schema-apply-order/
//        (seq = position × 10), verified, then the JSON is deleted.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REPO_ROOT, DIR_REL, readEntries, loadApplyOrder, writeApplyOrder, writeEntry, writeManifest,
  nextSeq, sortEntries, SEQ_STEP, dirOf, entryName,
} from './lib/apply-order.mjs';

export const OLD_REL = 'tests/schema-apply-order.json';
const MANIFEST_FIELDS = ['_readme', 'gucs', 'pre_schema', '_pre_schema_why', 'excluded'];

/* Canonical JSON (sorted keys) — deep equality that ignores object key ORDER, which
   no reader depends on (_order_notes is a lookup table), and nothing else. */
export const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map((key) => [key, x[key]])) : x));
const same = (a, b) => canon(a) === canon(b);

/** Old single-file object vs the loaded directory → list of differences (empty = identical). */
export function compare(oldObj, loaded) {
  const diffs = [];
  if (!same(oldObj.order, loaded.order)) {
    const i = oldObj.order.findIndex((f, k) => loaded.order[k] !== f);
    diffs.push(`order differs at index ${i}: old ${oldObj.order[i]} vs split ${loaded.order[i]} (lengths ${oldObj.order.length}/${loaded.order.length})`);
  }
  const keys = new Set([...Object.keys(oldObj._order_notes || {}), ...Object.keys(loaded._order_notes || {})]);
  for (const k of keys) if (!same((oldObj._order_notes || {})[k], (loaded._order_notes || {})[k])) diffs.push(`note differs: ${k}`);
  for (const f of MANIFEST_FIELDS) if (!same(oldObj[f] ?? null, loaded[f] ?? null)) diffs.push(`manifest field differs: ${f}`);
  const known = new Set(['order', '_order_notes', ...MANIFEST_FIELDS]);
  for (const k of Object.keys(oldObj)) if (!known.has(k)) diffs.push(`old file has a top-level key the split does not carry: ${k}`);
  return diffs;
}

/* ── --migrate ─────────────────────────────────────────────────────────────── */
const gitIn = (cwd) => (...a) => execFileSync('git', a, { cwd, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] });
const tryGit = (g, ...a) => { try { return g(...a); } catch { return null; } };

/** What the lane did to the old file, relative to the merge base. Pure. */
export function laneDelta(base, lane) {
  const baseSet = new Set(base.order);
  const laneSet = new Set(lane.order);
  const added = lane.order.filter((f) => !baseSet.has(f));
  const removed = base.order.filter((f) => !laneSet.has(f));
  const bn = base._order_notes || {}, ln = lane._order_notes || {};
  const notes = {};
  for (const k of new Set([...Object.keys(bn), ...Object.keys(ln)])) if (!same(bn[k], ln[k])) notes[k] = ln[k];   // undefined = deleted
  const fields = {};
  for (const f of MANIFEST_FIELDS) if (!same(base[f] ?? null, lane[f] ?? null)) fields[f] = lane[f];
  // tail: an added entry with nothing but added entries after it in the lane's order is an APPEND
  const tailFrom = (() => { let i = lane.order.length; while (i > 0 && !baseSet.has(lane.order[i - 1])) i--; return i; })();
  return { added, removed, notes, fields, tail: new Set(lane.order.slice(tailFrom)), laneOrder: lane.order };
}

/**
 * Apply a laneDelta to the directory at `root` (which holds <onto>'s split after the merge),
 * given the base object (to detect a same-note edit on both sides). Returns problems[].
 */
export function applyDelta(root, delta, base) {
  const problems = [];
  const { manifest, entries } = readEntries(root);
  const ontoObj = loadApplyOrder(root);
  const byFile = new Map(entries.map((e) => [e.file, e]));
  // manifest fields
  for (const [f, v] of Object.entries(delta.fields)) {
    if (!same(ontoObj[f] ?? null, base[f] ?? null) && !same(ontoObj[f] ?? null, v ?? null)) {
      problems.push(`manifest field "${f}" was changed on both sides differently`); continue;
    }
    manifest[f] = v;
  }
  // removals
  for (const f of delta.removed) {
    if (byFile.has(f)) { byFile.delete(f); try { unlinkSync(join(dirOf(root), entryName(f))); } catch { /* gone */ } }
  }
  // placement of added entries, in the lane's own order
  const live = () => sortEntries([...byFile.values()]);
  let prev = null;
  for (const f of delta.laneOrder) {
    if (!delta.added.includes(f)) { prev = f; continue; }
    if (byFile.has(f)) { problems.push(`${f} was added on both sides — place it once, by hand, in the lane`); prev = f; continue; }
    let seq;
    const cur = live();
    if (delta.tail.has(f) || !prev || !byFile.has(prev)) seq = nextSeq(cur);
    else {
      const a = byFile.get(prev).seq;
      const after = cur.find((e) => e.seq > a);
      seq = after ? (a + after.seq) / 2 : a + SEQ_STEP;
    }
    byFile.set(f, { file: f, seq });
    prev = f;
  }
  // notes
  const extra = { ...(manifest._extra_notes || {}) };
  for (const [k, v] of Object.entries(delta.notes)) {
    const ontoNote = ontoObj._order_notes[k];
    const baseNote = (base._order_notes || {})[k];
    if (!delta.added.includes(k) && !same(ontoNote, baseNote) && !same(ontoNote, v)) {
      problems.push(`the note for ${k} was changed on both sides differently`); continue;
    }
    if (byFile.has(k)) { const e = byFile.get(k); if (v === undefined) delete e.note; else e.note = v; }
    else if (v === undefined) delete extra[k];
    else extra[k] = v;
  }
  if (Object.keys(extra).length) manifest._extra_notes = extra; else delete manifest._extra_notes;
  if (problems.length) return problems;
  writeManifest(root, manifest);
  for (const e of byFile.values()) writeEntry(root, e.file, e.seq, e.note);
  return [];
}

/** The whole --migrate, in the git checkout at `cwd`. Returns { ok, msg }. */
export function migrate(cwd, onto = 'origin/main') {
  const g = gitIn(cwd);
  if (g('status', '--porcelain', '--untracked-files=no').trim()) return { ok: false, msg: 'uncommitted changes — commit them first' };
  if (tryGit(g, 'cat-file', '-e', `${onto}:${DIR_REL}/_manifest.json`) === null) return { ok: false, msg: `${onto} has no ${DIR_REL}/ yet — nothing to convert onto` };
  if (tryGit(g, 'cat-file', '-e', `HEAD:${OLD_REL}`) === null) return { ok: false, msg: `this branch has no ${OLD_REL} — a plain \`git merge ${onto}\` is all it needs` };
  const mb = g('merge-base', 'HEAD', onto).trim();
  const baseText = tryGit(g, 'show', `${mb}:${OLD_REL}`);
  if (baseText === null) return { ok: false, msg: `the merge base ${mb.slice(0, 9)} has no ${OLD_REL}; this branch re-created it after the split — move its edits to entry files by hand (--add)` };
  const base = JSON.parse(baseText);
  const lane = JSON.parse(g('show', `HEAD:${OLD_REL}`));
  const delta = laneDelta(base, lane);

  try { g('merge', '--no-commit', '--no-ff', onto); } catch { /* conflicts are inspected below */ }
  const conflicted = g('diff', '--name-only', '--diff-filter=U').split('\n').filter(Boolean);
  const others = conflicted.filter((f) => f !== OLD_REL);
  if (others.length) { tryGit(g, 'merge', '--abort'); return { ok: false, msg: `the merge has other conflicts (merge aborted, the lane resolves them): ${others.join(', ')}` }; }
  tryGit(g, 'rm', '-q', '-f', '--', OLD_REL);
  if (existsSync(join(cwd, OLD_REL))) unlinkSync(join(cwd, OLD_REL));
  const problems = applyDelta(cwd, delta, base);
  if (problems.length) { tryGit(g, 'merge', '--abort'); return { ok: false, msg: 'merge aborted: ' + problems.join('; ') }; }
  g('add', '-A', '--', DIR_REL);
  g('commit', '-q', '-m', `merge ${onto}; apply-order edits re-expressed as entry files\n\n`
    + `node tools/apply-order-split.mjs --migrate: +${delta.added.length} entr${delta.added.length === 1 ? 'y' : 'ies'}`
    + ` (${delta.added.join(', ') || 'none'}), ${Object.keys(delta.notes).length} note(s), -${delta.removed.length}.`);
  return { ok: true, msg: `merged ${onto}; ${delta.added.length} added, ${Object.keys(delta.notes).length} note change(s), ${delta.removed.length} removed — committed` };
}

/* ── CLI ───────────────────────────────────────────────────────────────────── */
function cli() {
  const a = process.argv.slice(2);
  const val = (flag) => { const i = a.indexOf(flag); return i >= 0 ? a[i + 1] : undefined; };
  if (a.includes('--verify')) {
    const p = val('--verify');
    const diffs = compare(JSON.parse(readFileSync(p, 'utf8')), loadApplyOrder(REPO_ROOT));
    if (diffs.length) { console.error(`DIFFERENT (${diffs.length}):\n  ` + diffs.slice(0, 40).join('\n  ')); process.exit(1); }
    const l = loadApplyOrder(REPO_ROOT);
    console.log(`identical: ${l.order.length} entries in the same order, ${Object.keys(l._order_notes).length} notes, `
      + `${MANIFEST_FIELDS.length} manifest fields (canonical deep-equal)`);
    return;
  }
  if (a.includes('--split')) {
    const old = join(REPO_ROOT, ...OLD_REL.split('/'));
    const obj = JSON.parse(readFileSync(old, 'utf8'));
    writeApplyOrder(REPO_ROOT, obj);
    const diffs = compare(obj, loadApplyOrder(REPO_ROOT));
    if (diffs.length) { console.error('split is NOT faithful:\n  ' + diffs.join('\n  ')); process.exit(1); }
    unlinkSync(old);
    console.log(`split ${obj.order.length} entries into ${DIR_REL}/ (verified identical); ${OLD_REL} removed`);
    return;
  }
  if (a.includes('--add')) {
    const f = val('--add');
    if (!f || !/^[\w.-]+\.sql$/.test(f)) { console.error('usage: --add <YYYY-MM-DD-name>.sql [--note "…"]'); process.exit(2); }
    if (!existsSync(join(REPO_ROOT, 'supabase', 'migrations', f))) { console.error(`supabase/migrations/${f} does not exist`); process.exit(2); }
    const { entries } = readEntries(REPO_ROOT);
    if (entries.some((e) => e.file === f)) { console.error(`${f} is already placed`); process.exit(2); }
    const seq = nextSeq(entries);
    writeEntry(REPO_ROOT, f, seq, val('--note'));
    console.log(`placed ${f} at seq ${seq} (last in the apply order): ${DIR_REL}/${entryName(f)}`);
    return;
  }
  if (a.includes('--migrate')) {
    const r = migrate(process.cwd(), val('--onto') || 'origin/main');
    (r.ok ? console.log : console.error)(r.msg);
    process.exit(r.ok ? 0 : 1);
  }
  console.error('usage: --add <file.sql> [--note …] | --migrate [--onto REF] | --verify <old.json> | --split');
  process.exit(2);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) cli();
