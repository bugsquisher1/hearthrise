#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/clan-feast-catalogue-drift.mjs — the drift guard for hr_feast_foods.
//
// src/data/items.js is the single source of game content (CLAUDE.md: "Never
// duplicate game data into SQL — generate catalogues from it and add a drift
// guard"). The 2026-08-27 economy-sinks migration seeds public.hr_feast_foods
// (the server-authoritative feast heal values) by hand, because SQL cannot import
// JS. This guard is what keeps that hand-seed honest: it imports items.js,
// computes the feast-eligible set (foodClass in {healing,buff} AND heals > 0 —
// the cooked/prepared foods; raw fish/crops carry `heals` but no foodClass and
// are NOT feast food), and asserts the migration's INSERT matches it EXACTLY,
// item-for-item and heal-for-heal.
//
// If a designer adds/renames a cooked food or re-values one in items.js, this
// fails and forces a matching edit to the migration — the catalogue can never
// silently drift from the data.
//
// ── b544: THE SEED IS A CHAIN, NOT A FILE ──────────────────────────────────
// This guard used to read ONE path (2026-08-27-clan-economy-sinks.sql) and
// compare it to the whole of items.js. That made the guard itself the reason a
// new food could not be added honestly: the only way to satisfy it was to EDIT
// AN APPLIED MIGRATION, which `tests/patch-chain-guard.mjs` states plainly is
// forbidden — "an applied migration is history; editing it changes what a
// rebuild produces without changing production". A forward patch file (the
// correct shape) would have been invisible to it and the guard would have gone
// red on perfectly correct work, whose only available fixes were to rewrite
// history or to weaken the guard.
//
// So the seed is now read the way Postgres reads it: EVERY migration that
// inserts into hr_feast_foods, in `tests/schema-apply-order.json` order, each
// one's `on conflict … do update set heals` folding over the last — which is
// exactly the state the table is in after the chain replays. Strictly stronger
// than the old form (it still catches a drifted value, and now also catches a
// row seeded by a LATER file that items.js does not back), and it no longer
// forces history to be rewritten. `--selftest` is the mutation proof.
//
// Exit: 0 in sync · 1 drift · 2 harness problem.
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const MIG_DIR = join(ROOT, 'supabase', 'migrations');
const ORDER = join(ROOT, 'tests', 'schema-apply-order.json');

/** Every `insert into public.hr_feast_foods (item_id, heals) values (…)` block
 *  in one file's text, as [item_id, heals] pairs in source order. A file may
 *  hold more than one (none does today; the parse does not care). */
function seedRowsIn(sql) {
  const out = [];
  const blocks = sql.matchAll(
    /insert\s+into\s+public\.hr_feast_foods\s*\(\s*item_id\s*,\s*heals\s*\)\s*values([\s\S]*?);/gi);
  for (const b of blocks) {
    for (const m of b[1].matchAll(/\(\s*'([a-z0-9_]+)'\s*,\s*(\d+)\s*\)/gi)) {
      out.push([m[1], Number(m[2])]);
    }
  }
  return out;
}

export async function feastCatalogueDriftGuard(opts = {}) {
  // ── the DATA: the eligible set, straight from the source of truth ──
  let ITEMS;
  try { ({ ITEMS } = await import('../src/data/items.js')); }
  catch (e) { return [`cannot import src/data/items.js — ${e.message}`]; }

  const fromData = new Map();
  for (const [id, def] of Object.entries(ITEMS)) {
    if (!def) continue;
    const fc = def.foodClass;
    if ((fc === 'healing' || fc === 'buff') && Number(def.heals) > 0) {
      fromData.set(id, Number(def.heals));
    }
  }

  // ── the SEED: fold every seeding migration in APPLY ORDER ──
  // `opts.inject` is the --selftest seam: {file: sqlText} overrides/adds a
  // file's text without writing to the repo.
  let order;
  try { order = JSON.parse(await readFile(ORDER, 'utf8')).order; }
  catch (e) { return [`cannot read tests/schema-apply-order.json — ${e.message}`]; }
  if (!Array.isArray(order) || order.length === 0) return ['schema-apply-order.json has no `order` array'];

  const inject = opts.inject || {};
  const fromSql = new Map();          // item_id -> heals, after the fold
  const seededBy = new Map();         // item_id -> the file that last set it
  const files = [];
  for (const file of order) {
    let sql;
    if (Object.prototype.hasOwnProperty.call(inject, file)) sql = inject[file];
    else {
      try { sql = await readFile(join(MIG_DIR, file), 'utf8'); }
      catch { continue; }            // 'excluded'/missing files are not an error here
    }
    const rows = seedRowsIn(sql);
    if (rows.length === 0) continue;
    files.push(`${file} (${rows.length})`);
    for (const [id, heals] of rows) { fromSql.set(id, heals); seededBy.set(id, file); }
  }

  if (fromSql.size === 0) {
    return ['parsed 0 hr_feast_foods rows from the whole apply chain — the anchor moved, or the '
      + 'seed is no longer a literal `values` list (this guard can only read one)'];
  }

  // ── compare ──
  const problems = [];
  for (const [id, heals] of fromData) {
    if (!fromSql.has(id)) problems.push(`items.js has feast food "${id}" (heals ${heals}) — MISSING from every hr_feast_foods seed in the chain`);
    else if (fromSql.get(id) !== heals) problems.push(`"${id}": items.js heals=${heals} but the chain seeds heals=${fromSql.get(id)} (${seededBy.get(id)})`);
  }
  for (const [id, heals] of fromSql) {
    if (!fromData.has(id)) problems.push(`${seededBy.get(id)} seeds "${id}" (heals ${heals}) — NOT a feast-eligible food in items.js`);
  }

  if (opts.report) problems.unshift(`  note  seeds read, in apply order: ${files.join(' → ')}`);
  return problems;
}

/* ── MUTATION PROOF (CLAUDE.md §4: a guard that has never been red is not a
      guard). Four defects, each injected as migration TEXT so nothing is
      written to the repo, and each must be CAUGHT. Arm 4 is the one that
      matters for b544: it is the shape this guard used to be blind to — a
      correct forward patch in a NEW file — and it must now be ACCEPTED. */
async function selftest() {
  const LAST = '2026-09-13-reed-and-tide.sql';
  const real = await readFile(join(MIG_DIR, LAST), 'utf8');
  const arms = [
    ['control (unmutated chain)', {}, false],
    ['a heal value drifts in the newest seed',
      { [LAST]: real.replace("('cooked_goldgill', 23)", "('cooked_goldgill', 24)") }, true],
    ['a food is dropped from the newest seed',
      { [LAST]: real.replace("('river_chowder', 30),", '') }, true],
    ['a LATER file seeds a food items.js does not back',
      { [LAST]: real + "\ninsert into public.hr_feast_foods (item_id, heals) values ('not_a_food', 9)"
                     + '\n  on conflict (item_id) do update set heals = excluded.heals;\n' }, true],
    ['the newest seed is ABSENT (the pre-b544 blind spot)',
      { [LAST]: '-- nothing\n' }, true],
  ];
  let bad = 0;
  for (const [name, inject, mustFail] of arms) {
    const problems = await feastCatalogueDriftGuard({ inject });
    const red = problems.length > 0;
    const ok = red === mustFail;
    if (!ok) bad++;
    process.stdout.write(`  ${ok ? 'ok  ' : 'FAIL'}  ${mustFail ? 'caught' : 'clean'}: ${name}`
      + `${red ? ` → ${problems[0]}` : ''}\n`);
  }
  return bad;
}

// CLI: node tests/clan-feast-catalogue-drift.mjs [--report|--selftest]
if (process.argv[1]?.endsWith('clan-feast-catalogue-drift.mjs')) {
  const argv = process.argv.slice(2);
  if (argv.includes('--selftest')) {
    selftest().then((bad) => {
      process.stdout.write(bad === 0
        ? '\nself-test green: every injected defect is caught and a correct forward patch is accepted.\n'
        : `\n${bad} arm(s) wrong — this guard does not bite as advertised.\n`);
      process.exit(bad === 0 ? 0 : 1);
    }).catch((e) => { process.stderr.write(`ERROR: ${e.message}\n`); process.exit(2); });
  } else {
  feastCatalogueDriftGuard({ report: argv.includes('--report') }).then((problems) => {
    const notes = problems.filter((p) => p.startsWith('  note  '));
    const fails = problems.filter((p) => !p.startsWith('  note  '));
    for (const n of notes) process.stdout.write(`${n}\n`);
    if (fails.length) {
      for (const p of fails) process.stdout.write(`  FAIL  ${p}\n`);
      process.stdout.write(`\n${fails.length} drift(s). Re-sync hr_feast_foods by adding a NEW migration that seeds the missing rows — never by editing an applied one.\n`);
      process.exit(1);
    }
    process.stdout.write('  ok    the feast catalogue seed chain matches items.js exactly.\n\nin sync.\n');
    process.exit(0);
  }).catch((e) => { process.stderr.write(`ERROR: ${e.message}\n`); process.exit(2); });
  }
}
