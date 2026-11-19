#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/new-migration.mjs — NAME A NEW MIGRATION AND GIVE IT ITS APPLY NOTE (CLAUDE.md rule 12).
//
//   node tools/new-migration.mjs <slug> [--generated] [--note "<STAGED, NOT APPLIED (...) ...>"]
//        supabase/migrations/NNNN-<slug>.sql (a header stub; with --generated no .sql is written, the
//        generator writes it: set its OUT_NAME to the printed name) and its sidecar,
//        supabase/migration-notes/NNNN-<slug>.sql.json, holding the STAGED note.
//   node tools/new-migration.mjs --next                  print the next free sequence
//   node tools/new-migration.mjs --renumber <NNNN-x.sql> move a sequence-named file to the next free
//        sequence (tests/migration-names.mjs NAME-4: two lanes cut from one base wrote one function)
//   node tools/new-migration.mjs --adopt <YYYY-MM-DD-x.sql> [--note "..."]
//        a date-named file written before the sidecars (a lane in flight on 2026-11-19): renamed to
//        the next sequence with its sidecar
//   node tools/new-migration.mjs --selftest
//
// NNNN is one more than the highest sequence on this tree, so a lane names its file after every
// file on its base, and the name is the file's place in the replay: no shared file is edited.
// --renumber and --adopt rewrite the old name wherever the repo spells it (tests/, tools/, src/,
// supabase/, .github/), exactly, so a guard's upTo or patch keeps pointing at the file.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync, mkdtempSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { isMain } from '../tests/_is-main.mjs';
import {
  ROOT, MIG_DIR, NOTES_DIR, CHAIN_FILE, SLUG, nextSeq, nextMigrationName, registerNew, readSidecar, writeSidecar,
  noteFileOf, isSeqName, isHistoryName, sidecarText, loadApplyOrder, seqOfName,
} from './lib/apply-order.mjs';

const harness = (msg) => { const e = new Error(msg); e.harness = true; return e; };
const today = () => new Date().toISOString().slice(0, 10);
const TEMPLATE_NOTE = (file) => `STAGED, NOT APPLIED (<lane>, <role>, ${today()}). <What moves and why.> `
  + `ORDER: ${file.replace(/-.*/, '')} in its name (after every file on this lane's base). EDGE: <none, or which hr-accrue and when>.`;

const stub = (file) => [
  '-- ════════════════════════════════════════════════════════════════════════',
  `-- supabase/migrations/${file} — <one line: what this migration does>`,
  '--',
  `-- STATUS: supabase/migration-notes/${noteFileOf(file)} (STAGED until the Coordinator applies it).`,
  '-- ORDER: the sequence in this file\'s name (CLAUDE.md rule 12): it runs after every file on its base.',
  '-- Applied as ONE transaction by the apply tool; never begin/commit here. Ends with its §4 self-check.',
  '-- ════════════════════════════════════════════════════════════════════════',
  '',
].join('\n');

/** Every text file under the dirs that may spell a migration's name. */
function textFiles(root) {
  const out = [];
  const SKIP = new Set(['node_modules', '.git', '.pglite-cache', '.ci-local', '.scratch', 'assets', 'icons3']);
  const walk = (rel) => {
    const abs = join(root, rel);
    if (!existsSync(abs)) return;
    for (const n of readdirSync(abs)) {
      if (SKIP.has(n)) continue;
      const p = rel ? `${rel}/${n}` : n;
      const st = statSync(join(root, p));
      if (st.isDirectory()) walk(p);
      else if (/\.(mjs|js|ts|sql|json|yml|yaml|md|sh|toml)$/.test(n) && st.size < 8 << 20) out.push(p);
    }
  };
  for (const d of ['tests', 'tools', 'src', 'supabase', '.github']) walk(d);
  return out;
}

/** Rename a migration (and its sidecar) and rewrite every exact spelling of its old name. */
export function renameMigration(root, from, to, sc) {
  const migFrom = join(root, MIG_DIR, from);
  if (!existsSync(migFrom)) throw harness(`${MIG_DIR}/${from} does not exist`);
  if (existsSync(join(root, MIG_DIR, to))) throw harness(`${MIG_DIR}/${to} already exists`);
  renameSync(migFrom, join(root, MIG_DIR, to));
  const oldNote = join(root, NOTES_DIR, noteFileOf(from));
  if (existsSync(oldNote)) rmSync(oldNote);
  writeSidecar(root, to, sc);
  const touched = [];
  for (const p of textFiles(root)) {
    if (p.startsWith(`${NOTES_DIR}/`) && p !== CHAIN_FILE) continue;
    const abs = join(root, p);
    const text = readFileSync(abs, 'utf8');
    if (!text.includes(from)) continue;
    writeFileSync(abs, text.split(from).join(to));
    touched.push(p);
  }
  return touched;
}

export function renumber(root, file) {
  if (!isSeqName(file)) throw harness(`${file} is not sequence-named; --renumber moves a NNNN-<slug>.sql`);
  const sc = readSidecar(root, file) || {};
  const to = file.replace(/^\d+/, String(nextSeq(root)));
  return { to, touched: renameMigration(root, file, to, sc) };
}

export function adopt(root, file, note) {
  if (!isHistoryName(file)) throw harness(`${file} is not date-named; --adopt is for a pre-sidecar YYYY-MM-DD-*.sql`);
  if (readSidecar(root, file)) throw harness(`${file} already has a sidecar: it is history, not a straggler`);
  const slug = file.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/(\.generated)?\.sql$/, '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  const name = nextMigrationName(root, /^[a-z]/.test(slug) ? slug : `m-${slug}`, { generated: /\.generated\.sql$/.test(file) });
  return { to: name, touched: renameMigration(root, file, name, { note: note || TEMPLATE_NOTE(name) }) };
}

export function create(root, slug, { generated = false, note } = {}) {
  if (!SLUG.test(slug)) throw harness(`slug "${slug}": lower-case words ([a-z0-9_]) joined by single hyphens, starting with a letter`);
  const file = nextMigrationName(root, slug, { generated });
  mkdirSync(join(root, NOTES_DIR), { recursive: true });
  if (!generated) writeFileSync(join(root, MIG_DIR, file), stub(file));
  registerNew(root, file, note || TEMPLATE_NOTE(file));
  return file;
}

// ── --selftest: a planted tree ──────────────────────────────────────────────
function selftest() {
  let bad = 0;
  const ok = (c, m, x = '') => { console.log(`  ${c ? 'ok ' : 'x  '} ${m}${c ? '' : `\n     ${x}`}`); if (!c) bad += 1; };
  const d = mkdtempSync(join(tmpdir(), 'hr-new-migration-'));
  try {
    mkdirSync(join(d, MIG_DIR), { recursive: true });
    mkdirSync(join(d, NOTES_DIR), { recursive: true });
    mkdirSync(join(d, 'tests'), { recursive: true });
    writeFileSync(join(d, CHAIN_FILE), JSON.stringify({ history: { last_seq: 1 } }));
    writeFileSync(join(d, MIG_DIR, '2026-08-08-a.sql'), 'select 1;\n');
    writeFileSync(join(d, NOTES_DIR, noteFileOf('2026-08-08-a.sql')), sidecarText({ seq: 1, note: 'APPLIED 2026-08-08' }));
    ok(nextSeq(d) === 1000, 'an empty new range starts at 1000', String(nextSeq(d)));
    const a = create(d, 'first-thing');
    const b = create(d, 'second-thing', { generated: true });
    ok(a === '1000-first-thing.sql' && b === '1001-second-thing.generated.sql', 'consecutive names, the generated one without a .sql', `${a} ${b}`);
    writeFileSync(join(d, MIG_DIR, b), '-- Generated by tools/gen-x.mjs\n');
    const m = loadApplyOrder(d);
    ok(m.order.join(',') === '2026-08-08-a.sql,1000-first-thing.sql,1001-second-thing.generated.sql', 'history first, then the sequences', m.order.join(','));
    ok(/^STAGED, NOT APPLIED/.test(m._order_notes[a]), 'the new sidecar carries a STAGED note');
    writeFileSync(join(d, 'tests', 'probe.mjs'), `bootReplay({ upTo: '${a}' });\n`);
    const r = renumber(d, a);
    ok(r.to === '1002-first-thing.sql' && readFileSync(join(d, 'tests', 'probe.mjs'), 'utf8').includes(r.to)
      && !existsSync(join(d, MIG_DIR, a)) && existsSync(join(d, NOTES_DIR, noteFileOf(r.to))) && !existsSync(join(d, NOTES_DIR, noteFileOf(a))),
    '--renumber moves the file, its sidecar and every spelling of its name', JSON.stringify(r));
    writeFileSync(join(d, MIG_DIR, '2027-06-06-straggler.sql'), 'select 2;\n');
    const s = adopt(d, '2027-06-06-straggler.sql', 'STAGED, NOT APPLIED (lane/y)');
    const m2 = loadApplyOrder(d);
    ok(s.to === '1003-straggler.sql' && m2.order.at(-1) === s.to && m2._order_notes[s.to] === 'STAGED, NOT APPLIED (lane/y)', '--adopt names a straggler at the next sequence', JSON.stringify(s));
    let refused = null;
    try { create(d, '2027-bad'); } catch (e) { refused = e.message; }
    ok(refused && /slug/.test(refused), 'a date-looking slug is refused', refused || 'accepted');
  } finally { rmSync(d, { recursive: true, force: true }); }
  if (bad) { console.error(`\n${bad} case(s) failed.`); process.exit(1); }
  console.log('\nnew-migration --selftest: names, sidecars, renumber and adopt behave');
}

function main(argv) {
  const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  if (argv.includes('--selftest')) return selftest();
  if (argv.includes('--next')) { console.log(nextSeq(ROOT)); return; }
  if (argv.includes('--renumber')) {
    const { to, touched } = renumber(ROOT, opt('--renumber'));
    console.log(`renumbered to ${to}; rewrote its name in ${touched.length} file(s)${touched.length ? `: ${touched.join(', ')}` : ''}`);
    return;
  }
  if (argv.includes('--adopt')) {
    const { to, touched } = adopt(ROOT, opt('--adopt'), opt('--note'));
    console.log(`adopted as ${to}; rewrote its name in ${touched.length} file(s)${touched.length ? `: ${touched.join(', ')}` : ''}`);
    return;
  }
  const slug = argv.find((a) => !a.startsWith('--') && a !== opt('--note'));
  if (!slug) throw harness('usage: node tools/new-migration.mjs <slug> [--generated] [--note "..."] | --next | --renumber <file> | --adopt <file>');
  const file = create(ROOT, slug, { generated: argv.includes('--generated'), note: opt('--note') });
  console.log(`${file}  (sidecar: ${NOTES_DIR}/${noteFileOf(file)}${argv.includes('--generated') ? '; set the generator\'s OUT_NAME to this name' : ''})`);
  console.log(`sequence ${seqOfName(file)}: it runs after every migration on this tree. Complete its note before the lane is done.`);
}

if (isMain(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (e) { console.error(e.harness ? `new-migration: ${e.message}` : e); process.exit(2); }
}
