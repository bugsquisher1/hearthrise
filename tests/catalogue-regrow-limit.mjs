#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/catalogue-regrow-limit.mjs — A REGROWING CROP KEEPS ITS FINITE LIMIT THROUGH EVERY CATALOGUE REGEN.
//
//   node tests/catalogue-regrow-limit.mjs             the guard
//   node tests/catalogue-regrow-limit.mjs --list      the mutation catalogue
//   node tests/catalogue-regrow-limit.mjs --mutate    every mutation must be CAUGHT
//   node tests/catalogue-regrow-limit.mjs --mutate=<id>
//
// mutant-anchors: tools/gen-catalogues.mjs
//
// Ships with: supabase/migrations/2027-01-27-items-catalogue.generated.sql (lane a-regrow-harvest).
// Every full delete+insert replace of hr_crops between 2026-08-22 and 2027-01-14 re-inserted the rows
// WITHOUT regrow_limit, so tomato and emberfruit ended at 0 (the server's "no limit") against
// src/core/farm.js REGROW_LIMITS, and no guard noticed for two months.
//   RL-1 THE GENERATOR'S OWN OUTPUT: the hr_crops insert in the file tools/gen-catalogues.mjs writes
//        names regrow_limit, and every crop's value is REGROW_LIMITS[id] (> 0) for a regrowing crop, 0
//        otherwise. Run on a FRESH generation into a temp tree, so a mutated generator is judged by
//        what it would write, not by the committed file (which --check alone would ask to regenerate).
//   RL-2 THE CHAIN'S END: the whole replay lands every crop's regrow_limit at REGROW_LIMITS (a later
//        migration that resets hr_crops again is red here).
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile, mkdtemp, rm, cp, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { bootReplay, ROOT } from './schema-replay.mjs';

const GEN = 'tools/gen-catalogues.mjs';
const MUTANTS = {
  drops_column: {
    why: 'the regen re-inserts hr_crops without regrow_limit (the 2026-08-22..2027-01-14 defect)',
    edits: [
      ['insert into public.hr_crops (crop_id, seed_item, prod_item, base_hours, req_lv, yield_min, yield_max, xp, regrows, regrow_limit) values',
        'insert into public.hr_crops (crop_id, seed_item, prod_item, base_hours, req_lv, yield_min, yield_max, xp, regrows) values'],
      ['${b(r.regrows)},${n(r.regrow_limit)})`)};', '${b(r.regrows)})`)};'],
    ],
  },
  zero_limit: {
    why: 'the regen writes 0 (no limit) for every crop',
    edits: [['  regrow_limit: regrowLimitOf(id),\n', '  regrow_limit: 0,\n']],
  },
};
const ALL = Object.keys(MUTANTS);

/* The generator into a temp copy of the tree (it writes its outputs next to itself): returns the main catalogue text. */
async function generate(edits) {
  const tmp = await mkdtemp(join(tmpdir(), 'hr-regrow-'));
  try {
    await cp(join(ROOT, 'src'), join(tmp, 'src'), { recursive: true, filter: (p) => !/[\\/]vendor([\\/]|$)/.test(p.slice(ROOT.length)) });
    await cp(join(ROOT, 'tools'), join(tmp, 'tools'), { recursive: true });
    await mkdir(join(tmp, 'supabase', 'migrations'), { recursive: true });
    let src = (await readFile(join(ROOT, GEN), 'utf8')).replace(/\r\n/g, '\n');
    for (const [find, repl] of edits || []) {
      const n = src.split(find).length - 1;
      if (n !== 1) { const e = new Error(`anchor matched ${n} times in ${GEN}: ${find.slice(0, 60)}`); e.harness = true; throw e; }
      src = src.replace(find, () => repl);
    }
    await writeFile(join(tmp, GEN), src);
    const r = spawnSync(process.execPath, [join(tmp, GEN)], { encoding: 'utf8', cwd: tmp });
    const out = src.match(/const OUT = join\(ROOT, 'supabase', 'migrations', '([^']+)'\);/);
    if (!out) { const e = new Error('cannot find OUT in ' + GEN); e.harness = true; throw e; }
    if (r.status !== 0) return { refused: ((r.stdout || '') + (r.stderr || '')).trim() };
    return { sql: await readFile(join(tmp, 'supabase', 'migrations', out[1]), 'utf8') };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

/* The hr_crops insert of a generated catalogue: { crop_id: regrow_limit | undefined }. */
function cropLimits(sql) {
  const m = sql.replace(/\r\n/g, '\n').match(/insert into public\.hr_crops \(([^)]*)\) values\n([\s\S]*?);\n/);
  if (!m) return null;
  const cols = m[1].split(',').map((c) => c.trim());
  const at = cols.indexOf('regrow_limit');
  const out = {};
  for (const line of m[2].split('\n')) {
    const vals = line.trim().replace(/^\(|\),?$/g, '').split(',');
    out[vals[0].replace(/'/g, '')] = at < 0 ? undefined : Number(vals[at]);
  }
  return out;
}

async function run(mutant, withReplay) {
  const problems = [];
  const ok = (c, msg) => { if (!c) problems.push(msg); };
  const { CROPS } = await import(pathToFileURL(join(ROOT, 'src/data/gathering.js')).href);
  const { REGROW_LIMITS } = await import(pathToFileURL(join(ROOT, 'src/core/farm.js')).href);
  const want = Object.fromEntries(Object.keys(CROPS).map((id) => [id, CROPS[id].regrows === true ? REGROW_LIMITS[id] : 0]));
  ok(Object.keys(CROPS).some((id) => CROPS[id].regrows === true && REGROW_LIMITS[id] > 0), 'RL-0 no regrowing crop with a limit to judge (non-vacuity)');

  // ── RL-1 ──
  const g = await generate(mutant ? MUTANTS[mutant].edits : null);
  if (g.refused) problems.push('RL-1 the generator refused: ' + g.refused.split('\n')[0]);
  else {
    const got = cropLimits(g.sql);
    ok(!!got, 'RL-1 the generated catalogue has no hr_crops insert');
    if (got) for (const id of Object.keys(want)) {
      ok(got[id] === want[id], `RL-1 the generated hr_crops row ${id} carries regrow_limit ${got[id]}, src/core/farm.js says ${want[id]}`);
    }
  }

  // ── RL-2 ── (the clean run: a generator mutant does not change the committed chain)
  if (withReplay) {
    const { db } = await bootReplay({});
    try {
      const rows = (await db.query('select crop_id, regrows, regrow_limit from public.hr_crops order by 1')).rows;
      ok(rows.length === Object.keys(want).length, `RL-2 the chain ends with ${rows.length} crops, the data has ${Object.keys(want).length}`);
      for (const r of rows) ok(r.regrow_limit === want[r.crop_id], `RL-2 the chain ends with ${r.crop_id} at regrow_limit ${r.regrow_limit}, src/core/farm.js says ${want[r.crop_id]}`);
    } finally { try { await db.close(); } catch { /* the replay owns it */ } }
  }
  return problems;
}

async function main() {
  const arg = process.argv.find((a) => a.startsWith('--mutate'));
  if (process.argv.includes('--list')) { for (const id of ALL) console.log('  ' + id + ' — ' + MUTANTS[id].why); return 0; }
  if (!arg) {
    const p = await run(null, true);
    for (const x of p) console.log('  ✗ ' + x);
    console.log(p.length ? `catalogue-regrow-limit: ${p.length} RED` : 'catalogue-regrow-limit: green — the generator writes every crop\'s REGROW_LIMITS into hr_crops and the chain ends with them');
    return p.length ? 1 : 0;
  }
  const only = arg.includes('=') ? arg.split('=')[1] : null;
  if (only && !ALL.includes(only)) { console.log('unknown mutation: ' + only); return 2; }
  const clean = await run(null, false);
  if (clean.length) { for (const x of clean) console.log('  ✗ clean control RED: ' + x); return 1; }
  let bad = 0;
  for (const id of (only ? [only] : ALL)) {
    const p = await run(id, false);
    if (p.length) console.log('  ✓ ' + id + ' — caught: ' + p[0].slice(0, 160));
    else { console.log('  ✗ ' + id + ' — NOT caught'); bad++; }
  }
  const n = only ? 1 : ALL.length;
  console.log(bad ? `catalogue-regrow-limit --mutate: ${bad} escaped` : `catalogue-regrow-limit --mutate: ${n}/${n} mutants caught`);
  return bad ? 1 : 0;
}

main().then((c) => process.exit(c), (e) => { console.error(e && e.harness ? 'HARNESS: ' + e.message : e); process.exit(2); });
