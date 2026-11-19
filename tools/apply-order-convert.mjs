#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/apply-order-convert.mjs — tests/schema-apply-order.json -> one sidecar per migration.
//
//   node tools/apply-order-convert.mjs             convert (deletes the JSON once the round trip holds)
//   node tools/apply-order-convert.mjs --check     dry run: exit 1 when a convert would change anything
//   node tools/apply-order-convert.mjs --selftest  planted trees: converts, round-trips, refuses the broken ones
//
// The layout it writes is tools/lib/apply-order.mjs's (read its header). RE-RUNNABLE, for the
// Coordinator: after a commit that still edits the JSON (an APPLIED flip on a branch cut before the
// sidecars), take that branch's JSON and run this again. The JSON wins for every file it lists, a
// RETIRED file keeps its retirement (and takes the JSON's note), a sequence-named file (made after
// the conversion, not in any JSON) keeps its own sidecar, and the output is byte-identical for the
// same input. Run twice, the second run says "already converted" and writes nothing.
//
// THE TWO MERGES THIS IS FOR (in the lane that merges, never by hand in the Coordinator's tree):
//   · this conversion meets a branch that still EDITED the JSON (the 0.2.142 apply commit's flips):
//     `git merge` stops on tests/schema-apply-order.json (modified there, deleted here). Take
//     theirs (`git checkout --theirs -- tests/schema-apply-order.json`), run this, then
//     node tests/migration-names.mjs and node tests/apply-order-honesty.mjs, and commit.
//   · a lane cut before the conversion ADDED a date-named migration: take the deletion
//     (`git rm tests/schema-apply-order.json`), then node tools/new-migration.mjs --adopt <its file>
//     --note "<its note>" names it at the next sequence and rewrites every spelling of the old name.
//
// It REFUSES (exit 2, nothing written) a tree it cannot convert faithfully:
//   · no JSON and the sidecars do not place every file (a half-converted or hand-merged tree);
//   · a JSON that names a sequence-named file (that file postdates the conversion; a JSON naming it
//     was hand-made);
//   · a date-named migration in neither the JSON nor a sidecar of its own, or a sidecar for a
//     date-named file the JSON does not list (the sidecars came from a different JSON);
//   · any round-trip difference: the sidecars must derive EXACTLY the JSON's pre_schema, order,
//     excluded, notes, GUCs and pre-schema reasons, or nothing is written.
// Exit: 0 converted / already converted · 1 --check found work · 2 refused.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { isDeepStrictEqual } from 'node:util';
import { isMain } from '../tests/_is-main.mjs';
import {
  ROOT, MIG_DIR, NOTES_DIR, RETIRED_DIR, CHAIN_FILE, LEGACY_JSON, SEQ_FLOOR,
  readTree, deriveApplyOrder, loadApplyOrder, sidecarText, noteFileOf, isSeqName,
} from './lib/apply-order.mjs';

export const README = [
  'THE APPLY ORDER OF supabase/migrations/** lives in the files themselves (tools/lib/apply-order.mjs).',
  'Each migration has a sidecar here, <file>.sql.json, holding its placement and its apply note.',
  'This file holds what belongs to the whole chain: the replay GUCs, why a file runs before',
  'supabase/schema.sql, and history.last_seq.',
  '',
  'ORDER. The replay applies pre_schema, then supabase/schema.sql, then the chain:',
  '  history  every date-named file (YYYY-MM-DD-*.sql), at the "seq" its sidecar carries',
  '           (1..history.last_seq, frozen from tests/schema-apply-order.json on 2026-11-19).',
  '           Filename order does NOT replay: measured 2026-08-14, 23 of 41 files applied in name',
  "           order ('2026-08-08-clan-seat-2.sql' sorts before '2026-08-08-clan-seat.sql', and five",
  "           2026-08-11 files sort before the player-state foundation they depend on).",
  '  new      every later file is NNNN-<slug>.sql, NNNN >= 1000: one more than the highest sequence',
  '           on the lane\'s base (node tools/new-migration.mjs <slug>). The name is the position.',
  '',
  'RULES:',
  '  · Every .sql in supabase/migrations/ is placed: a history sidecar, or a sequence name.',
  '    A file that is neither fails every replay, so a migration cannot be silently left out.',
  '  · "excluded": true is a claim that a rebuilt database is CORRECT without the file.',
  '    Never add one to make the chain go green.',
  '  · "retired": the file moved to supabase/migrations-retired/ because a later full-replace',
  '    catalogue of the same tables makes it dead; its record says which file and how that was',
  '    proven (tools/chain-retire.mjs). Production ran it; the replay no longer needs to.',
  '  · The apply note leads with its claim: STAGED / NOT APPLIED, or APPLIED <date> (flipped by',
  '    node tools/migration-note.mjs applied <file> "<evidence>"). tests/apply-order-honesty.mjs',
  '    grades it against tests/live-hash-drift.baseline.json.',
];

const harness = (msg) => { const e = new Error(msg); e.harness = true; return e; };

/**
 * The target tree for a JSON over the current one. Pure over its inputs.
 * @param {object} j        the parsed JSON
 * @param {object} tree     readTree() of the current files (sidecars, onDisk, retiredDisk)
 * @returns {{chain:object, sidecars:Map<string,object>}}
 */
export function plan(j, tree) {
  const refuse = [];
  for (const k of ['order', 'pre_schema']) if (!Array.isArray(j[k])) refuse.push(`the JSON has no "${k}" array`);
  if (refuse.length) throw harness(refuse.join('\n  - '));
  const excluded = j.excluded && !Array.isArray(j.excluded) ? j.excluded : {};
  const notes = j._order_notes || {};
  const listed = [...j.pre_schema, ...j.order, ...Object.keys(excluded)];
  const seen = new Set();
  for (const f of listed) {
    if (seen.has(f)) refuse.push(`the JSON lists ${f} twice`);
    seen.add(f);
    if (isSeqName(f)) refuse.push(`the JSON names ${f}, a sequence-named file: it postdates the conversion, so this JSON was hand-made`);
  }
  const onDisk = new Set(tree.onDisk);
  const retiredDisk = new Set(tree.retiredDisk);
  const sidecars = new Map();
  const retiredNow = (f) => retiredDisk.has(f) && tree.sidecars.get(f) && tree.sidecars.get(f).retired;

  for (const f of listed) {
    if (!onDisk.has(f) && !retiredNow(f)) refuse.push(`the JSON lists ${f}, which is not on disk (nor retired)`);
  }
  for (const f of tree.onDisk) {
    if (seen.has(f)) continue;
    if (isSeqName(f)) continue;
    refuse.push(`${f} is on disk and in no list of the JSON (an unplaced migration)`);
  }
  for (const [f, sc] of tree.sidecars) {
    if (seen.has(f) || isSeqName(f)) continue;
    refuse.push(`${NOTES_DIR}/${noteFileOf(f)} is for a date-named file this JSON does not list: the sidecars came from a different JSON`);
  }
  for (const f of tree.retiredDisk) if (!seen.has(f) && !isSeqName(f)) refuse.push(`${RETIRED_DIR}/${f} is in no list of the JSON`);
  const legacy = {};
  for (const k of Object.keys(notes)) {
    if (seen.has(k)) continue;
    if (onDisk.has(k) || retiredDisk.has(k)) refuse.push(`the JSON has a note for ${k}, which is on disk but in no list`);
    else legacy[k] = notes[k];
  }
  if (j.order.length >= SEQ_FLOOR) refuse.push(`the JSON's order has ${j.order.length} files, past SEQ_FLOOR ${SEQ_FLOOR}`);
  if (refuse.length) throw harness(`refusing to convert:\n  - ${refuse.join('\n  - ')}`);

  const withNote = (sc, f) => (notes[f] !== undefined ? { ...sc, note: notes[f] } : sc);
  j.pre_schema.forEach((f, i) => sidecars.set(f, withNote({ pre_schema: i + 1 }, f)));
  j.order.forEach((f, i) => {
    if (retiredNow(f)) sidecars.set(f, withNote({ retired: { ...tree.sidecars.get(f).retired, seq: i + 1 } }, f));
    else sidecars.set(f, withNote({ seq: i + 1 }, f));
  });
  for (const [f, note] of Object.entries(excluded)) sidecars.set(f, { excluded: true, note });
  /* sequence-named files keep their own sidecars: the JSON never knew them */
  for (const [f, sc] of tree.sidecars) if (isSeqName(f)) sidecars.set(f, sc);

  const chain = {
    _readme: README,
    gucs: j.gucs || {},
    _pre_schema_why: j._pre_schema_why || [],
    history: { last_seq: j.order.length },
    ...(Object.keys(legacy).length ? { _legacy_notes: legacy } : {}),
  };
  return { chain, sidecars };
}

/** The fields whose values every reader's verdict depends on, compared exactly. */
export function roundTripDiff(j, m) {
  const out = [];
  const retired = new Set(Object.keys(m.retired || {}));
  const want = {
    pre_schema: j.pre_schema,
    order: j.order.filter((f) => !retired.has(f)),
    excluded: j.excluded || {},
    _order_notes: j._order_notes || {},
    gucs: j.gucs || {},
    _pre_schema_why: j._pre_schema_why || [],
  };
  /* a sequence-named file postdates every JSON: it is not part of the round trip */
  const fromJson = (o) => Object.fromEntries(Object.entries(o || {}).filter(([f]) => !isSeqName(f)));
  for (const [k, v] of Object.entries(want)) {
    const got = k === 'order' ? m.order.filter((f) => !isSeqName(f))
      : (k === '_order_notes' || k === 'excluded') ? fromJson(m[k]) : m[k];
    if (!isDeepStrictEqual(got, v)) {
      let where = '';
      if (Array.isArray(v) && Array.isArray(got)) {
        const i = v.findIndex((x, n) => got[n] !== x);
        where = ` (first difference at ${i}: want ${v[i]}, got ${got[i]}; ${v.length} vs ${got.length})`;
      } else if (v && typeof v === 'object') {
        const keys = new Set([...Object.keys(v), ...Object.keys(got || {})]);
        const k1 = [...keys].find((x) => !isDeepStrictEqual(v[x], (got || {})[x]));
        where = ` (first difference: ${k1})`;
      }
      out.push(`${k}${where}`);
    }
  }
  return out;
}

const chainText = (c) => `${JSON.stringify(c, null, 2)}\n`;

/**
 * Convert the tree at `root`. Returns {status, written, removed}. Throws a harness error on a refusal.
 * @param {string} root
 * @param {{check?: boolean, log?: (s:string)=>void}} [o]
 */
export function convert(root, { check = false, log = () => {} } = {}) {
  const tree = readTree(root);
  const jsonPath = join(root, LEGACY_JSON);
  if (!tree.legacy) {
    const { problems } = deriveApplyOrder(tree);
    if (problems.length) {
      throw harness(`no ${LEGACY_JSON} to convert from, and the sidecars do not place every file (a half-converted tree):\n  - `
        + problems.join('\n  - '));
    }
    log(`already converted: ${LEGACY_JSON} is gone and the sidecars place every file.`);
    return { status: 'converted', written: [], removed: [] };
  }
  let j;
  try { j = JSON.parse(readFileSync(jsonPath, 'utf8')); } catch (e) { throw harness(`${LEGACY_JSON} is not JSON: ${e.message}`); }
  const target = plan(j, tree);

  /* the round trip, IN MEMORY, before one byte is written */
  const virtual = { ...tree, legacy: false, bad: [], chain: target.chain, sidecars: target.sidecars };
  const { manifest, problems } = deriveApplyOrder(virtual);
  if (problems.length) throw harness(`the planned sidecars would not place every file:\n  - ${problems.join('\n  - ')}`);
  const diff = roundTripDiff(j, manifest);
  if (diff.length) throw harness(`the planned sidecars do not reproduce the JSON: ${diff.join('; ')}`);

  const notesDir = join(root, NOTES_DIR);
  const written = [];
  const removed = [];
  const want = new Map([...target.sidecars].map(([f, sc]) => [noteFileOf(f), sidecarText(sc)]));
  want.set('_chain.json', chainText(target.chain));
  const have = existsSync(notesDir) ? readdirSync(notesDir) : [];
  /* compared without CR: a Windows checkout (core.autocrlf) hands back CRLF for the LF this writes */
  const same = (p, text) => existsSync(p) && readFileSync(p, 'utf8').replace(/\r\n/g, '\n') === text;
  for (const [n, text] of want) if (!same(join(notesDir, n), text)) written.push(n);
  for (const n of have) if (!want.has(n)) removed.push(n);
  if (check) return { status: 'pending', written, removed };

  mkdirSync(notesDir, { recursive: true });
  for (const n of written) writeFileSync(join(notesDir, n), want.get(n));
  for (const n of removed) rmSync(join(notesDir, n));
  const jsonText = readFileSync(jsonPath, 'utf8');
  rmSync(jsonPath);

  /* and again FROM DISK: the files as written must derive the JSON. If they do not, the JSON goes back
     (the tree is then half-converted, which every reader refuses, and git restores the sidecars). */
  let m2;
  try {
    m2 = loadApplyOrder(root);
    const diff2 = roundTripDiff(j, m2);
    if (diff2.length) throw harness(`the written sidecars do not reproduce the JSON: ${diff2.join('; ')}`);
  } catch (e) {
    writeFileSync(jsonPath, jsonText);
    throw e;
  }
  log(`converted: ${want.size - 1} sidecar(s) (${written.length} written, ${removed.length} removed), `
    + `${m2.order.length} in the chain, ${m2.pre_schema.length} pre-schema, ${Object.keys(m2.excluded).length} excluded, `
    + `${Object.keys(m2.retired).length} retired; ${LEGACY_JSON} deleted.`);
  return { status: 'converted', written, removed };
}

// ════════════════════════════════════════════════════════════════════════
// --selftest: planted trees in the OS temp dir. The real tree is never written.
// ════════════════════════════════════════════════════════════════════════
function selftest() {
  let bad = 0;
  const ok = (c, msg, extra = '') => { console.log(`  ${c ? 'ok ' : 'x  '} ${msg}${c ? '' : `\n     ${extra}`}`); if (!c) bad += 1; };
  const tree = (files, json, extra = (d) => d) => {
    const d = mkdtempSync(join(tmpdir(), 'hr-apply-convert-'));
    mkdirSync(join(d, MIG_DIR), { recursive: true });
    mkdirSync(join(d, 'tests'), { recursive: true });
    for (const f of files) writeFileSync(join(d, MIG_DIR, f), `-- ${f}\n`);
    if (json) writeFileSync(join(d, LEGACY_JSON), JSON.stringify(json, null, 2));
    return extra(d);
  };
  const refused = (fn) => { try { fn(); return null; } catch (e) { return e.harness ? e.message : `NOT A HARNESS ERROR: ${e.message}`; } };
  /* THE CASE THAT MADE THE ORDER A FILE: '-' (0x2D) sorts before '.' (0x2E), so filename order puts
     clan-seat-2 first; and the foundation is dated AFTER a file that depends on it. */
  const files = ['2026-08-08-clan-seat.sql', '2026-08-08-clan-seat-2.sql', '2026-08-11-accrual.sql',
    '2026-08-11-player-state.sql', '2026-08-10-pre.sql', '2027-02-14-market-off.sql'];
  const J = {
    _readme: ['old'],
    gucs: { 'hearthrise.x': 'yes', _why: ['because'] },
    pre_schema: ['2026-08-10-pre.sql'],
    _pre_schema_why: ['runs first'],
    order: ['2026-08-08-clan-seat.sql', '2026-08-08-clan-seat-2.sql', '2026-08-11-player-state.sql', '2026-08-11-accrual.sql'],
    _order_notes: {
      '2026-08-11-player-state.sql': 'APPLIED 2026-08-11 (the foundation)',
      '2026-08-11-accrual.sql': ['STAGED, NOT APPLIED', 'a two-line note'],
      '_old-file.sql-original': 'a note about a file that is gone',
    },
    excluded: { '2027-02-14-market-off.sql': 'STAGED - KILL SWITCH; a rebuilt database is already off' },
  };

  const d1 = tree(files, J);
  try {
    const r = convert(d1);
    const m = loadApplyOrder(d1);
    ok(r.status === 'converted' && !existsSync(join(d1, LEGACY_JSON)), 'converts and deletes the JSON');
    ok(isDeepStrictEqual(m.order, J.order), 'the derived order is the JSON\'s, not filename order', JSON.stringify(m.order));
    ok(roundTripDiff(J, m).length === 0, 'pre_schema, excluded, notes (string, array, legacy), GUCs round-trip exactly', roundTripDiff(J, m).join('; '));
    const snap = () => readdirSync(join(d1, NOTES_DIR)).sort().map((n) => n + '\n' + readFileSync(join(d1, NOTES_DIR, n), 'utf8')).join('\n');
    const before = snap();
    const r2 = convert(d1);
    ok(r2.status === 'converted' && r2.written.length === 0 && snap() === before, 're-run on a converted tree: "already converted", nothing written');
    writeFileSync(join(d1, LEGACY_JSON), JSON.stringify(J, null, 2));
    const r3 = convert(d1);
    ok(r3.written.length === 0 && snap() === before, 're-run with the same JSON back: byte-identical sidecars (idempotent)');
    /* the Coordinator's re-run: an APPLIED flip in the JSON reaches the sidecar, nothing else moves */
    const J2 = JSON.parse(JSON.stringify(J));
    J2._order_notes['2026-08-11-accrual.sql'] = 'APPLIED 2026-11-20 by the Coordinator (read back). Was: STAGED';
    writeFileSync(join(d1, LEGACY_JSON), JSON.stringify(J2, null, 2));
    const r4 = convert(d1);
    ok(r4.written.length === 1 && r4.written[0] === '2026-08-11-accrual.sql.json', 'a re-run after a flip rewrites that one sidecar', JSON.stringify(r4.written));
    /* a sequence-named file made after the conversion survives a re-run */
    writeFileSync(join(d1, MIG_DIR, '1000-new-thing.sql'), '-- new\n');
    writeFileSync(join(d1, NOTES_DIR, '1000-new-thing.sql.json'), sidecarText({ note: 'STAGED, NOT APPLIED (lane/x)' }));
    writeFileSync(join(d1, LEGACY_JSON), JSON.stringify(J2, null, 2));
    convert(d1);
    const m5 = loadApplyOrder(d1);
    ok(m5.order[m5.order.length - 1] === '1000-new-thing.sql' && m5._order_notes['1000-new-thing.sql'], 'a sequence-named file keeps its sidecar and runs after history');
  } finally { rmSync(d1, { recursive: true, force: true }); }

  const cases = {
    'no JSON, a date-named file with no sidecar (half-converted)': () => {
      const d = tree(files, J); convert(d); writeFileSync(join(d, MIG_DIR, '2027-06-06-late.sql'), '-- late\n'); return d;
    },
    'JSON + a sidecar for a date-named file the JSON does not list': () => {
      const d = tree(files, J); convert(d);
      writeFileSync(join(d, MIG_DIR, '2027-06-06-late.sql'), '-- late\n');
      writeFileSync(join(d, NOTES_DIR, '2027-06-06-late.sql.json'), sidecarText({ seq: 5 }));
      writeFileSync(join(d, LEGACY_JSON), JSON.stringify(J, null, 2)); return d;
    },
    'a JSON naming a sequence-named file': () => {
      const J3 = JSON.parse(JSON.stringify(J)); J3.order.push('1000-new-thing.sql');
      return tree([...files, '1000-new-thing.sql'], J3);
    },
    'a migration on disk in no list': () => tree([...files, '2026-09-01-forgot.sql'], J),
    'a JSON listing a file twice': () => { const J4 = JSON.parse(JSON.stringify(J)); J4.order.push(J4.order[0]); return tree(files, J4); },
  };
  for (const [name, make] of Object.entries(cases)) {
    const d = make();
    try {
      const msg = refused(() => convert(d));
      ok(msg && !msg.startsWith('NOT A HARNESS'), `refuses: ${name}`, msg || 'it converted');
    } finally { rmSync(d, { recursive: true, force: true }); }
  }

  /* THE MUTANT: a sidecar whose seq is planted wrong must fail the round trip (or placement), never pass */
  const d6 = tree(files, J);
  try {
    convert(d6);
    const p = join(d6, NOTES_DIR, '2026-08-11-accrual.sql.json');
    const sc = JSON.parse(readFileSync(p, 'utf8')); sc.seq = 1; writeFileSync(p, sidecarText(sc));
    const msg = refused(() => loadApplyOrder(d6));
    ok(msg && /claimed twice/.test(msg), 'a planted duplicate seq is refused by the loader', msg || 'loaded');
    sc.seq = 3; const p2 = join(d6, NOTES_DIR, '2026-08-11-player-state.sql.json');
    const sc2 = JSON.parse(readFileSync(p2, 'utf8')); sc2.seq = 4;
    writeFileSync(p, sidecarText(sc)); writeFileSync(p2, sidecarText(sc2));
    const m = loadApplyOrder(d6);
    ok(roundTripDiff(J, m).some((x) => x.startsWith('order')), 'a planted swap of two seqs is a round-trip difference in order', roundTripDiff(J, m).join('; '));
  } finally { rmSync(d6, { recursive: true, force: true }); }

  if (bad) { console.error(`\n${bad} case(s) failed.`); process.exit(1); }
  console.log('\nconverter selftest: every planted tree behaved as its case requires');
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--selftest')) return selftest();
  const check = argv.includes('--check');
  const r = convert(ROOT, { check, log: (s) => console.log(s) });
  if (check) {
    if (!r.written.length && !r.removed.length && !existsSync(join(ROOT, LEGACY_JSON))) { console.log('apply-order-convert --check: converted, nothing to do'); return; }
    console.log(`apply-order-convert --check: a convert would write ${r.written.length} and remove ${r.removed.length} sidecar(s)`
      + `${existsSync(join(ROOT, LEGACY_JSON)) ? ` and delete ${LEGACY_JSON}` : ''}`);
    process.exitCode = 1;
  }
}

if (isMain(import.meta.url)) {
  try { main(); } catch (e) { console.error(e.harness ? `REFUSED: ${e.message}` : e); process.exit(2); }
}
