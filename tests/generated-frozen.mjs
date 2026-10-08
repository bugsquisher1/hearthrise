#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/generated-frozen.mjs — AN APPLIED GENERATED MIGRATION NEVER CHANGES BYTES.
//
// The class this closes (content-holes, 2026-10-08): every gen-* tool rewrote
// its applied migration in place, so a data row changed history and broke every
// later file that pinned a count at its own apply time. tools/generated-freeze.mjs
// now routes growth into append-only deltas; this guard is what makes the freeze
// real:
//   GF-1  every file in tests/generated-frozen.json has exactly its pinned sha256
//   GF-2  every generated file schema-apply-order.json records as APPLIED / LIVE
//         is pinned (so a newly applied file cannot stay rewritable)
//   GF-3  every pinned delta names a pinned base (`deltaOf`)
//
//   node tests/generated-frozen.mjs              gate
//   node tests/generated-frozen.mjs --selftest   mutation proof
//   node tests/generated-frozen.mjs --pin <file> [--delta-of <base>]
//        Coordinator, AFTER applying a generated file or delta: pin its bytes.
// No database, milliseconds. NO ?v= on imports (tests/**, b332).
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join, normalize } from 'node:path';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const REG = join(ROOT, 'tests', 'generated-frozen.json');
const MIG = join(ROOT, 'supabase', 'migrations');
const sha = (s) => createHash('sha256').update(s.replace(/\r\n/g, '\n')).digest('hex');

export function check({ reg, bytesOf, notes }) {
  const P = [];
  for (const [f, v] of Object.entries(reg.files)) {
    const b = bytesOf(f);
    if (b === null) { P.push(`GF-1 ${f} is pinned but missing from supabase/migrations`); continue; }
    if (sha(b) !== v.sha256) P.push(`GF-1 ${f} CHANGED BYTES — it is applied history. Revert it; the change belongs in a delta (run its gen-* tool).`);
    if (v.deltaOf && !reg.files[v.deltaOf]) P.push(`GF-3 ${f} is a delta of ${v.deltaOf}, which is not pinned`);
  }
  for (const [f, note] of Object.entries(notes)) {
    if (/\.generated\.sql$/.test(f) && /^(APPLIED|LIVE)/.test(String(note)) && !reg.files[f]) {
      P.push(`GF-2 ${f} is recorded APPLIED in schema-apply-order.json but not pinned — node tests/generated-frozen.mjs --pin ${f}`);
    }
  }
  return P;
}

const reg = JSON.parse(readFileSync(REG, 'utf8'));
const notes = JSON.parse(readFileSync(join(ROOT, 'tests', 'schema-apply-order.json'), 'utf8'))._order_notes || {};
const bytesOf = (f) => (existsSync(join(MIG, f)) ? readFileSync(join(MIG, f), 'utf8') : null);
const argv = process.argv.slice(2);

if (argv.includes('--pin')) {
  const f = argv[argv.indexOf('--pin') + 1];
  const b = bytesOf(f);
  if (!f || b === null) { console.error('--pin needs an existing migration file name'); process.exit(2); }
  const deltaOf = argv.includes('--delta-of') ? argv[argv.indexOf('--delta-of') + 1] : undefined;
  reg.files[f] = { sha256: sha(b), status: 'applied (pinned ' + new Date().toISOString().slice(0, 10) + ')', ...(deltaOf ? { deltaOf } : {}) };
  writeFileSync(REG, JSON.stringify(reg, null, 1) + '\n');
  console.log('pinned ' + f);
} else if (argv.includes('--selftest')) {
  const base = { reg, bytesOf, notes };
  if (check(base).length) { console.error('SELFTEST: the real tree is not green'); process.exit(1); }
  const first = Object.keys(reg.files)[0];
  const appliedNoted = Object.keys(notes).find((f) => /\.generated\.sql$/.test(f) && /^(APPLIED|LIVE)/.test(String(notes[f])));
  const M = [
    ['GF-1', `one byte of ${first} changes`, { bytesOf: (f) => (f === first ? bytesOf(f) + ' ' : bytesOf(f)) }],
    ['GF-1', 'the root catalogue gains a row', { bytesOf: (f) => (f === '2026-08-11-catalogue.generated.sql' ? bytesOf(f).replace("  ('abyssal_greaves'", "  ('x_new','X',true,null,1,null,null,null,false),\n  ('abyssal_greaves'") : bytesOf(f)) }],
    ['GF-1', `${first} is deleted`, { bytesOf: (f) => (f === first ? null : bytesOf(f)) }],
    ['GF-2', `${appliedNoted} is unpinned while recorded APPLIED`, { reg: { ...reg, files: Object.fromEntries(Object.entries(reg.files).filter(([f]) => f !== appliedNoted)) } }],
    ['GF-3', 'a delta names an unpinned base', { reg: { ...reg, files: { ...reg.files, 'x.delta.generated.sql': { sha256: sha(''), deltaOf: 'nope.generated.sql' } } }, bytesOf: (f) => (f === 'x.delta.generated.sql' ? '' : bytesOf(f)) }],
  ];
  let missed = 0;
  for (const [code, name, over] of M) {
    const hit = check({ ...base, ...over }).some((p) => p.startsWith(code + ' '));
    console.log(`  ${hit ? 'caught' : 'MISSED'}  ${code}  ${name}`);
    if (!hit) missed++;
  }
  if (missed) { console.error(`SELFTEST FAILED: ${missed} not caught`); process.exit(1); }
  console.log(`SELFTEST PASS generated-frozen: all ${M.length} mutations caught.`);
} else {
  const p = check({ reg, bytesOf, notes });
  if (p.length) { console.error('✗ generated-frozen: ' + p.length + ' problem(s)\n  ' + p.join('\n  ')); process.exit(1); }
  console.log(`✓ generated-frozen: ${Object.keys(reg.files).length} applied generated file(s) byte-identical to their pins`);
}
