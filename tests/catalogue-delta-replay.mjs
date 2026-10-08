#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/catalogue-delta-replay.mjs — THE OPEN DELTAS RE-APPLY AS A NO-OP.
//
// tools/generated-freeze.mjs writes catalogue growth as append-only delta
// migrations (upserts + keyed deletes). A delta the Coordinator applies must be
// safe to apply again: this replays the whole chain, fingerprints every
// catalogue table the deltas touch (and the full schema inventory), re-applies
// every OPEN delta (and every staged migration after the last applied file
// whose name is a delta), and asserts the fingerprint is BYTE-IDENTICAL.
//
//   node tests/catalogue-delta-replay.mjs             gate
//   node tests/catalogue-delta-replay.mjs --selftest  a non-idempotent delta (an
//        insert with no conflict clause) must go red
// One chain replay (~1-3 min). NO ?v= on imports (tests/**, b332).
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { bootReplay, inventory, ROOT } from './schema-replay.mjs';

const MIG = join(ROOT, 'supabase', 'migrations');
const reg = JSON.parse(readFileSync(join(ROOT, 'tests', 'generated-frozen.json'), 'utf8'));
const deltas = readdirSync(MIG).filter((f) => /\.delta\.generated\.sql$/.test(f) && !reg.files[f]).sort();

async function fingerprint(db) {
  const inv = JSON.stringify(await inventory(db));
  const tables = new Set();
  for (const f of deltas) for (const m of readFileSync(join(MIG, f), 'utf8').matchAll(/public\.(hr_\w+)/g)) tables.add(m[1]);
  let rows = '';
  for (const t of [...tables].sort()) {
    const r = await db.query(`select coalesce(json_agg(x order by x::text), '[]')::text as j from (select * from public.${t}) x`);
    rows += t + ':' + r.rows[0].j.replace(/"generated_at":"[^"]*"/g, '') + '\n';
  }
  return createHash('sha256').update(inv + rows).digest('hex');
}

async function run(extraSql) {
  const { db } = await bootReplay();   // a plain replay is the full chain
  const a = await fingerprint(db);
  for (const f of deltas) await db.exec(readFileSync(join(MIG, f), 'utf8'));
  if (extraSql) await db.exec(extraSql);
  const b = await fingerprint(db);
  await db.close?.();
  return { a, b };
}

if (!deltas.length) { console.log('catalogue-delta-replay: no open deltas — nothing to prove'); process.exit(0); }
if (process.argv.includes('--selftest')) {
  const { a, b } = await run("insert into public.hr_qm_offers (offer_id, item_id, scrip_cost) values ('qm.x_selftest', 'bone_key', 1);");
  if (a === b) { console.error('SELFTEST FAILED: a second apply that ADDS a row read as identical'); process.exit(1); }
  console.log('SELFTEST PASS catalogue-delta-replay: a non-idempotent second apply is caught (fingerprint moved).');
} else {
  const { a, b } = await run('');
  if (a !== b) { console.error(`✗ catalogue-delta-replay: a second apply of ${deltas.join(', ')} moved the fingerprint ${a.slice(0, 12)} → ${b.slice(0, 12)}`); process.exit(1); }
  console.log(`✓ catalogue-delta-replay: ${deltas.length} open delta(s) applied on the full chain, and a second apply is byte-identical (${a.slice(0, 12)}…)`);
}
