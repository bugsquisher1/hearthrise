#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/migration-note.mjs — READ OR FLIP ONE MIGRATION'S APPLY NOTE (its sidecar).
//
//   node tools/migration-note.mjs show <file>
//   node tools/migration-note.mjs applied <file> "<evidence>" [--date YYYY-MM-DD]
//        the Coordinator's flip after an apply: the note becomes
//        "APPLIED <date> by the Coordinator (<evidence>). Was: <the old note>", in
//        supabase/migration-notes/<file>.json alone, so two releases' flips never meet in one file.
//        Refuses a note that already leads with APPLIED, a retired file, and an empty evidence.
//   node tools/migration-note.mjs staged             every chain or excluded file whose note leads with STAGED
//   node tools/migration-note.mjs --selftest
//
// tests/apply-order-honesty.mjs grades the leading claim against the live-hash baseline, so a flip
// is honest only after the apply it records (CLAUDE.md §3.3 lane C).
// ════════════════════════════════════════════════════════════════════════
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { isMain } from '../tests/_is-main.mjs';
import { ROOT, MIG_DIR, NOTES_DIR, CHAIN_FILE, readSidecar, markApplied, loadApplyOrder, noteFileOf, sidecarText } from './lib/apply-order.mjs';

const harness = (msg) => { const e = new Error(msg); e.harness = true; return e; };

function selftest() {
  let bad = 0;
  const ok = (c, m, x = '') => { console.log(`  ${c ? 'ok ' : 'x  '} ${m}${c ? '' : `\n     ${x}`}`); if (!c) bad += 1; };
  const d = mkdtempSync(join(tmpdir(), 'hr-migration-note-'));
  try {
    mkdirSync(join(d, MIG_DIR), { recursive: true });
    mkdirSync(join(d, NOTES_DIR), { recursive: true });
    writeFileSync(join(d, CHAIN_FILE), JSON.stringify({ history: { last_seq: 0 } }));
    writeFileSync(join(d, MIG_DIR, '1000-x.sql'), 'select 1;\n');
    writeFileSync(join(d, NOTES_DIR, noteFileOf('1000-x.sql')), sidecarText({ note: 'STAGED, NOT APPLIED (lane/x)' }));
    const n = markApplied(d, '1000-x.sql', 'the apply tool; self-check passed', '2026-11-20');
    ok(n === 'APPLIED 2026-11-20 by the Coordinator (the apply tool; self-check passed). Was: STAGED, NOT APPLIED (lane/x)'
      && loadApplyOrder(d)._order_notes['1000-x.sql'] === n, 'the flip leads with APPLIED and keeps the old note', n);
    const refuse = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
    ok(/already leads with APPLIED/.test(refuse(() => markApplied(d, '1000-x.sql', 'again', '2026-11-21')) || ''), 'a second flip is refused');
    writeFileSync(join(d, MIG_DIR, '1001-y.sql'), 'select 1;\n');
    writeFileSync(join(d, NOTES_DIR, noteFileOf('1001-y.sql')), sidecarText({ note: 'STAGED, NOT APPLIED (lane/y)' }));
    ok(/evidence/.test(refuse(() => markApplied(d, '1001-y.sql', '  ', '2026-11-20')) || ''), 'a flip with no evidence is refused');
    ok(/no sidecar/.test(refuse(() => markApplied(d, '1002-z.sql', 'e', '2026-11-20')) || ''), 'a file with no sidecar is refused');
  } finally { rmSync(d, { recursive: true, force: true }); }
  if (bad) { console.error(`\n${bad} case(s) failed.`); process.exit(1); }
  console.log('\nmigration-note --selftest: the flip writes one sidecar and refuses what it must');
}

function main(argv) {
  const [verb, file, evidence] = argv;
  if (argv.includes('--selftest')) return selftest();
  if (verb === 'show' && file) {
    const sc = readSidecar(ROOT, file);
    if (!sc) throw harness(`${file} has no sidecar`);
    console.log(JSON.stringify(sc, null, 2));
    return;
  }
  if (verb === 'applied' && file) {
    const i = argv.indexOf('--date');
    const note = markApplied(ROOT, file, evidence, i >= 0 ? argv[i + 1] : undefined);
    console.log(`${NOTES_DIR}/${noteFileOf(file)}: ${note.slice(0, 160)}${note.length > 160 ? '…' : ''}`);
    console.log('Then: node tests/apply-order-honesty.mjs (and live-hash-drift --live --write if a body moved).');
    return;
  }
  if (verb === 'staged') {
    const m = loadApplyOrder(ROOT);
    const all = { ...m._order_notes, ...m.excluded };
    for (const f of [...m.order, ...Object.keys(m.excluded)]) {
      if (/^\s*STAGED\b/i.test(String(all[f] || ''))) console.log(`${m.excluded[f] !== undefined ? 'excluded ' : 'chain    '} ${f}`);
    }
    return;
  }
  throw harness('usage: node tools/migration-note.mjs show <file> | applied <file> "<evidence>" [--date YYYY-MM-DD] | staged | --selftest');
}

if (isMain(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (e) { console.error(e.harness ? `migration-note: ${e.message}` : e); process.exit(2); }
}
