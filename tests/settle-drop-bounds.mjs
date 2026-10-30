#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/settle-drop-bounds.mjs — EVERY ITEM THE ENGINE CAN DROP ON A GROUND, THE SETTLE MAY PAY.
//
//   node tests/settle-drop-bounds.mjs            the guard (credential-free, no database)
//   node tests/settle-drop-bounds.mjs --mutate   every planted defect must be CAUGHT
//
// mutant-anchors: tools/gen-hunt-sessions.mjs
//
// THE FAILURE (P1, 2026-10-30, account 0d959747, four heroes at mosslight_glade). The Brook Bear (v0.2.64)
// stands only in the Glade's boxes' FILL rows (a pocket's `pack` past its `spawns`): a pull past its base
// brings it, the engine kills it and rolls its table, but tools/gen-hunt-sessions.mjs wrote
// hr_hunt_ground_spawns from the as-built `spawns` only. The settle's item bound (hr_hunt_apply_instance
// (4c): kills x the most rows naming the item over the kill bounds of the ground's spawn rows) was 0 for
// raw_bear_meat, bear_claw and brook_bear_tooth, every window that dropped one was refused value_over
// (72 refusals in a day), and the sixth refusal forfeited the hunt: the server ended real players' hunts.
//
// THE RULE, on the OPEN grounds (the ones the catalogue serves):
//   reach        every monster the ENGINE can spawn on a ground (src/data/hunt-grounds.js pullRows, the rows
//                src/core/hunt/pull-cycle.js spawnPack spawns, at every density 0..DENSITY_PICK.max) has a
//                spawn row for that ground in the generated catalogue
//   item-bound   every item such a monster's table names (src/data/monsters.js drops, one unit a row:
//                src/core/drops.js rollDropTable) has, on that ground, the settle's own item bound computed
//                from the generated rows at least the rows one kill names it
//   value-bound  each reachable monster has a kill-bound row, and the settle's gold a kill over the ground's
//                spawn rows is at least its top coin roll (src/data/monsters.js gp, hunt-rewards.js payKill)
// The catalogue read is the GENERATED SQL itself (the file that applies: tools/gen-hunt-sessions.mjs OUT; a
// mutant's, its planted generator's render()), parsed here, never the generator's in-memory rows.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, plant } from './hunt-core/fixtures/h1.js';

const imp = (root, p) => import(pathToFileURL(join(root, p)).href);

/* The VALUES rows of one generated insert, as arrays of SQL literals. */
function valuesOf(sql, table) {
  const head = `insert into public.${table} (`;
  const at = sql.indexOf(head);
  if (at < 0) throw new Error(`the catalogue has no insert into ${table}`);
  const body = sql.slice(sql.indexOf(' values\n', at) + 8, sql.indexOf(';\n', at));
  const rows = [];
  for (const line of body.split('\n')) {
    const m = /^\s*\((.*)\),?$/.exec(line);
    if (!m) throw new Error(`${table}: unparsed row ${JSON.stringify(line.slice(0, 80))}`);
    const cells = [];
    const re = /'((?:[^']|'')*)'(?:::jsonb)?|(-?\d+(?:\.\d+)?)|(true|false|null)/g;
    let c;
    while ((c = re.exec(m[1]))) cells.push(c[1] !== undefined ? c[1].replace(/''/g, "'") : c[2] !== undefined ? Number(c[2]) : c[3]);
    rows.push(cells);
  }
  return rows;
}

/** The findings for the tree at `root` against `sql` (the generated catalogue's text). [] = green. */
async function check(root, sql) {
  const G = await imp(root, 'src/data/hunt-grounds.js');
  const { MONSTERS } = await imp(root, 'src/data/monsters.js');
  const bounds = {};
  for (const [id, gold, xp, drops] of valuesOf(sql, 'hr_hunt_kill_bounds')) bounds[id] = { gold, xp, drops: JSON.parse(drops) };
  const spawns = {};
  for (const [hunt, monster] of valuesOf(sql, 'hr_hunt_ground_spawns')) (spawns[hunt] = spawns[hunt] || new Set()).add(monster);
  const out = [];
  const grounds = Object.values(G.OPEN_GROUNDS);
  if (!grounds.length) out.push('no open ground: nothing proved');
  for (const g of grounds) {
    const rows = spawns[g.hunt] || new Set();
    const reach = new Set();
    for (let p = 0; p < g.pockets.length; p++) {
      for (let size = 0; size <= G.DENSITY_PICK.max; size++) for (const s of G.pullRows(g, p, size)) reach.add(s.monster);
    }
    const over = (f) => Math.max(0, ...[...rows].map((m) => (bounds[m] ? f(bounds[m]) : 0)));
    for (const m of [...reach].sort()) {
      if (!rows.has(m)) out.push(`reach: ${g.id}: the engine spawns ${m}, which has no hr_hunt_ground_spawns row for ${g.hunt}`);
      if (!bounds[m]) out.push(`value-bound: ${g.id}: ${m} has no hr_hunt_kill_bounds row`);
      const top = Math.ceil(Number((MONSTERS[m].gp || [0, 0])[1]) || 0);   // the engine's top coin roll (hunt-rewards.js payKill)
      if (over((b) => b.gold) < top) out.push(`value-bound: ${g.id}: the settle's gold a kill (${over((b) => b.gold)}) is under ${m}'s top roll (${top})`);
      const per = {};
      for (const d of (MONSTERS[m].drops || [])) if (d && d.id) per[d.id] = (per[d.id] || 0) + 1;
      for (const [item, need] of Object.entries(per).sort()) {
        const bound = over((b) => Number(b.drops[item]) || 0);
        if (bound < need) out.push(`item-bound: ${g.id}: ${m} drops ${item} (${need} a kill), the settle's bound is ${bound} a kill (refused value_over)`);
      }
    }
  }
  return out;
}

const MUTANTS = [
  { name: 'the spawn rows back to the as-built spawns (the Brook Bear bug)', want: /^reach: mosslight_glade: the engine spawns brook_bear/,
    edits: [['tools/gen-hunt-sessions.mjs', '      for (const s of (p.pack || p.spawns || [])) {', '      for (const s of (p.spawns || [])) {']] },
  { name: 'a kill bound that forgets the Uncommon band', want: /^item-bound: .* \(1 a kill\), the settle's bound is 0/,
    edits: [['tools/gen-hunt-sessions.mjs', "for (const d of (m.drops || [])) if (d && d.id && ID.test(d.id)) drops[d.id]",
      "for (const d of (m.drops || [])) if (d && d.id && ID.test(d.id) && d.band !== 'uncommon') drops[d.id]"]] },
  { name: 'a kill bound of one unit whatever the rows', want: /^item-bound: .*\(2 a kill\), the settle's bound is 1/,
    edits: [['tools/gen-hunt-sessions.mjs', 'drops[d.id] = (drops[d.id] || 0) + 1;', 'drops[d.id] = 1;'],
      ['src/data/monsters.js', "{ id: 'raw_bear_meat', ch: .6, band: 'common' },", "{ id: 'raw_bear_meat', ch: .6, band: 'common' }, { id: 'raw_bear_meat', ch: .2, band: 'common' },"]] },
  { name: 'the gold bound read off the low roll', want: /^value-bound: /,
    edits: [['tools/gen-hunt-sessions.mjs', 'const gold = Math.max(0, Math.ceil(Number((m.gp || [0, 0])[1]) || 0));', 'const gold = Math.max(0, Math.ceil(Number((m.gp || [0, 0])[0]) || 0));']] },
];
/* What a planted generator needs beside src/core and src/data (its imports). */
const TREES = ['src/session', 'supabase/functions/hr-accrue', 'tools/gen-hunt-sessions.mjs', 'tests/_is-main.mjs'];

if (process.argv.includes('--mutate')) {
  const clean = await check(ROOT, readFileSync((await imp(ROOT, 'tools/gen-hunt-sessions.mjs')).OUT, 'utf8'));
  if (clean.length) { console.error('settle-drop-bounds --mutate: the clean tree is RED:\n  ' + clean.join('\n  ')); process.exit(1); }
  let missed = 0;
  for (const mu of MUTANTS) {
    const p = plant(mu.edits, TREES);
    let fails;
    try {
      const GEN = await imp(p.root, 'tools/gen-hunt-sessions.mjs');
      fails = await check(p.root, GEN.render());
    } catch (e) { fails = ['threw ' + (e && e.message)]; } finally { p.done(); }
    const caught = fails.some((f) => mu.want.test(f));
    console.log(`  ${caught ? 'caught' : 'MISSED'}: ${mu.name}${caught ? ' (' + fails.find((f) => mu.want.test(f)).slice(0, 110) + ')' : ' (fails: ' + (fails.join(' | ') || 'none') + ')'}`);
    if (!caught) missed++;
  }
  if (missed) { console.error(`settle-drop-bounds --mutate: ${missed} of ${MUTANTS.length} mutants NOT caught`); process.exit(1); }
  console.log(`settle-drop-bounds --mutate: all ${MUTANTS.length} mutants caught`);
} else {
  const GEN = await imp(ROOT, 'tools/gen-hunt-sessions.mjs');
  const fails = await check(ROOT, readFileSync(GEN.OUT, 'utf8'));
  if (fails.length) {
    console.error(`settle-drop-bounds: ${fails.length} finding(s) in ${GEN.OUT_NAME}:\n  ` + fails.join('\n  '));
    process.exit(1);
  }
  console.log(`settle-drop-bounds: every item the engine can drop on the ${Object.keys((await imp(ROOT, 'src/data/hunt-grounds.js')).OPEN_GROUNDS).length} open grounds is inside the settle's bound (${GEN.OUT_NAME})`);
}
