// tools/lib/apply-order.mjs — THE APPLY ORDER OF supabase/migrations/**, read from
// tests/schema-apply-order/ (one file per migration) and handed to every reader in the
// shape the old single JSON had: { _readme, gucs, pre_schema, _pre_schema_why, order,
// _order_notes, excluded }.
//
// WHY THE SPLIT (2026-10-21, r36). tests/schema-apply-order.json was one 758 KB file whose
// `order` array and `_order_notes` object every migration lane appended to — 244 commits in
// three weeks, and two lanes that each added one migration ALWAYS conflicted, at the same
// array tail. Now a lane adds ONE NEW FILE, `tests/schema-apply-order/<migration>.json`:
//
//   { "seq": 3780, "note": "STAGED — …" }        note: a string or an array of lines; optional
//
// and two lanes adding different migrations touch different paths, so git merges them with
// zero conflict hunks. The Coordinator's STAGED → APPLIED flip edits only that one file.
//
// ORDER = sort by (seq numerically, then file name). The date is NOT the position (filename
// order does not replay — see _manifest.json's _readme), seq is. History was numbered 10, 20,
// … 3770 so an insertion fits between two neighbours (a fraction is fine: 2345.5). Two lanes
// that both took max+10 tie on seq after the merge; the tie breaks by name, deterministically,
// exactly as a hand-resolved array conflict would have had to pick one.
//
// Everything that is not per-migration (gucs, pre_schema, excluded, the readme) lives in
// _manifest.json, which lanes almost never touch.
//
//   node tools/apply-order-split.mjs --add <file.sql> [--note "…"]   place a new migration
//   node tools/apply-order-split.mjs --migrate                         convert a lane that still edits the old JSON
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..', '..'));
export const DIR_REL = 'tests/schema-apply-order';
export const MANIFEST_NAME = '_manifest.json';
export const ENTRY_SUFFIX = '.json';
export const SEQ_STEP = 10;

export const dirOf = (root = REPO_ROOT) => join(root, ...DIR_REL.split('/'));
export const entryName = (migration) => migration + ENTRY_SUFFIX;
const isEntry = (f) => f.endsWith('.sql' + ENTRY_SUFFIX);

const harness = (msg) => Object.assign(new Error(msg), { harness: true });

/**
 * The raw split: { manifest, entries: [{ file, seq, note? }] in apply order, problems: [] }.
 * Never throws on a bad entry — it reports it, so a guard can name the defect.
 */
export function readEntries(root = REPO_ROOT) {
  const dir = dirOf(root);
  if (!existsSync(dir)) throw harness(`${DIR_REL}/ does not exist (the apply order lives there since 2026-10-21)`);
  const problems = [];
  let manifest;
  try { manifest = JSON.parse(readFileSync(join(dir, MANIFEST_NAME), 'utf8')); }
  catch (e) { throw harness(`cannot read ${DIR_REL}/${MANIFEST_NAME}: ${String(e.message).split('\n')[0]}`); }
  const entries = [];
  for (const f of readdirSync(dir)) {
    if (f === MANIFEST_NAME) continue;
    if (!isEntry(f)) { problems.push({ kind: 'bad-entry', file: f, why: `not <migration>.sql${ENTRY_SUFFIX} — every file in ${DIR_REL}/ except ${MANIFEST_NAME} is one migration's entry` }); continue; }
    const file = f.slice(0, -ENTRY_SUFFIX.length);
    let body;
    try { body = JSON.parse(readFileSync(join(dir, f), 'utf8')); }
    catch (e) { problems.push({ kind: 'bad-entry', file, why: 'unreadable JSON: ' + String(e.message).split('\n')[0] }); continue; }
    if (!body || typeof body !== 'object' || Array.isArray(body)) { problems.push({ kind: 'bad-entry', file, why: 'not a JSON object' }); continue; }
    if (typeof body.seq !== 'number' || !Number.isFinite(body.seq)) { problems.push({ kind: 'bad-entry', file, why: `"seq" must be a finite number, got ${JSON.stringify(body.seq)}` }); continue; }
    const extra = Object.keys(body).filter((k) => k !== 'seq' && k !== 'note');
    if (extra.length) problems.push({ kind: 'bad-entry', file, why: `unknown key(s) ${extra.join(', ')} — an entry holds only "seq" and "note"` });
    entries.push({ file, seq: body.seq, ...(body.note !== undefined ? { note: body.note } : {}) });
  }
  sortEntries(entries);
  return { manifest, entries, problems };
}

/** Apply order: seq ascending, then name. In place; returns the array. */
export function sortEntries(entries) {
  return entries.sort((a, b) => (a.seq - b.seq) || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
}

/** Entries + manifest → the single-object shape every reader always had. Pure. */
export function assemble(manifest, entries) {
  const { _extra_notes, ...rest } = manifest;
  const notes = {};
  for (const e of entries) if (e.note !== undefined) notes[e.file] = e.note;
  Object.assign(notes, _extra_notes || {});
  return {
    _readme: rest._readme,
    gucs: rest.gucs,
    pre_schema: rest.pre_schema || [],
    _pre_schema_why: rest._pre_schema_why,
    order: entries.map((e) => e.file),
    _order_notes: notes,
    excluded: rest.excluded || {},
  };
}

/** THE READER. Throws (harness) if any entry is malformed — a reader must not guess. */
export function loadApplyOrder(root = REPO_ROOT) {
  const { manifest, entries, problems } = readEntries(root);
  if (problems.length) {
    throw harness(`${DIR_REL}/ has ${problems.length} malformed entr${problems.length === 1 ? 'y' : 'ies'}: `
      + problems.map((p) => `${p.file} (${p.why})`).join('; '));
  }
  return assemble(manifest, entries);
}

/* ── writers (tools and fixtures only; never a guard's normal run) ─────────── */
const pretty = (o) => JSON.stringify(o, null, 2) + '\n';

export function writeEntry(root, file, seq, note) {
  mkdirSync(dirOf(root), { recursive: true });
  writeFileSync(join(dirOf(root), entryName(file)), pretty({ seq, ...(note !== undefined ? { note } : {}) }));
}

export function writeManifest(root, manifest) {
  mkdirSync(dirOf(root), { recursive: true });
  writeFileSync(join(dirOf(root), MANIFEST_NAME), pretty(manifest));
}

/** The whole object (old single-JSON shape) → the directory, seq = (index+1)*10. For
    fixtures and the one-time split. Removes entry files the object no longer names. */
export function writeApplyOrder(root, obj) {
  const inOrder = new Set(obj.order);
  const extra = {};
  for (const [k, v] of Object.entries(obj._order_notes || {})) if (!inOrder.has(k)) extra[k] = v;
  const manifest = {
    _readme: obj._readme, gucs: obj.gucs, pre_schema: obj.pre_schema, _pre_schema_why: obj._pre_schema_why,
    excluded: obj.excluded, ...(Object.keys(extra).length ? { _extra_notes: extra } : {}),
  };
  writeManifest(root, manifest);
  const dir = dirOf(root);
  for (const f of readdirSync(dir)) if (isEntry(f) && !inOrder.has(f.slice(0, -ENTRY_SUFFIX.length))) unlinkSync(join(dir, f));
  obj.order.forEach((file, i) => writeEntry(root, file, (i + 1) * SEQ_STEP, (obj._order_notes || {})[file]));
}

/** The seq a migration appended at the end takes. */
export function nextSeq(entries) {
  const max = entries.reduce((m, e) => Math.max(m, e.seq), 0);
  return (Math.floor(max / SEQ_STEP) + 1) * SEQ_STEP;
}
