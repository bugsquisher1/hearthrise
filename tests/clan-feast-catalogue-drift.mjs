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
// ── THE COOKBOOK CUT: A DELETE IS PART OF THE FOLD (2026-11-18) ──────────
// Every generated catalogue only UPSERTED this table, so cutting a food from
// items.js left its row priced for the clan feast forever (the cut's three
// feasts: Hunter's Feast, Dragon Stew, Lich Soul Soup — still 34 rows at chain
// end against 31 foods). This guard named that correctly. The generator now
// opens the table with an unscoped `delete from public.hr_feast_foods;`, and the
// fold reads it the way Postgres does: a top-level unscoped delete empties the
// fold at its place in the file. A delete or truncate it cannot model (scoped,
// or any other shape) is a problem, never skipped: a guard that ignored it
// would fold rows the database no longer holds.
//
// Exit: 0 in sync · 1 drift · 2 harness problem.
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './_is-main.mjs';
import { loadApplyOrder } from '../tools/lib/apply-order.mjs';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const MIG_DIR = join(ROOT, 'supabase', 'migrations');

/** Every `insert into public.hr_feast_foods (item_id, heals) values (…)` block
 *  in one file's text, as [item_id, heals] pairs in source order. A file may
 *  hold more than one (none does today; the parse does not care). */
function seedRowsIn(sql) {
  return feastWritesIn(sql).flatMap((w) => w.rows || []);
}

/** One file's hr_feast_foods writes, in file order: {rows} for an insert block,
 *  {reset:true} for a top-level unscoped `delete from public.hr_feast_foods;`, and
 *  {unreadable} for any other top-level delete/truncate of the table. A statement
 *  starts a line (after indentation), so a `--   delete from …` comment is not one. */
function feastWritesIn(sql) {
  const out = [];
  for (const b of sql.matchAll(
    /insert\s+into\s+public\.hr_feast_foods\s*\(\s*item_id\s*,\s*heals\s*\)\s*values([\s\S]*?);/gi)) {
    const rows = [];
    for (const m of b[1].matchAll(/\(\s*'([a-z0-9_]+)'\s*,\s*(\d+)\s*\)/gi)) rows.push([m[1], Number(m[2])]);
    out.push({ at: b.index, rows });
  }
  for (const d of sql.matchAll(/^[ \t]*(?:delete\s+from|truncate(?:\s+table)?)\s+(?:only\s+)?(?:public\.)?hr_feast_foods\b[^;]*;/gim)) {
    if (/^[ \t]*delete\s+from\s+public\.hr_feast_foods\s*;$/i.test(d[0])) out.push({ at: d.index, reset: true });
    else out.push({ at: d.index, unreadable: d[0].trim().replace(/\s+/g, ' ').slice(0, 120) });
  }
  return out.sort((a, b) => a.at - b.at);
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
  try { order = loadApplyOrder(ROOT).order; }
  catch (e) { return [`cannot derive the apply order — ${e.message}`]; }
  if (!Array.isArray(order) || order.length === 0) return ['the apply order has no chain'];

  const inject = opts.inject || {};
  const fromSql = new Map();          // item_id -> heals, after the fold
  const seededBy = new Map();         // item_id -> the file that last set it
  const files = [];
  const problems = [];
  let seededRows = 0;
  for (const file of order) {
    let sql;
    if (Object.prototype.hasOwnProperty.call(inject, file)) sql = inject[file];
    else {
      try { sql = await readFile(join(MIG_DIR, file), 'utf8'); }
      catch { continue; }            // 'excluded'/missing files are not an error here
    }
    const writes = feastWritesIn(sql);
    if (writes.length === 0) continue;
    const n = writes.reduce((s, w) => s + (w.rows ? w.rows.length : 0), 0);
    files.push(`${file} (${writes.some((w) => w.reset) ? 'emptied, ' : ''}${n})`);
    for (const w of writes) {
      if (w.unreadable) { problems.push(`${file} writes hr_feast_foods with a statement this guard cannot fold: "${w.unreadable}"`); continue; }
      if (w.reset) { fromSql.clear(); seededBy.clear(); continue; }
      for (const [id, heals] of w.rows) { fromSql.set(id, heals); seededBy.set(id, file); seededRows++; }
    }
  }

  if (seededRows === 0) {
    return ['parsed 0 hr_feast_foods rows from the whole apply chain — the anchor moved, or the '
      + 'seed is no longer a literal `values` list (this guard can only read one)'];
  }

  // ── compare ──
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
      guard). Seven defects, each injected as migration TEXT so nothing is
      written to the repo, and each must be CAUGHT. The ABSENT arm is the one
      that matters for b544: it is the shape this guard used to be blind to.
      The upsert-only arm is the 2027-05-22 cookbook cut as first generated. */
async function selftest() {
  /* The newest seed is DERIVED (the last file in apply order that seeds hr_feast_foods), never typed: it was
     2026-09-13-reed-and-tide.sql until the core rebuild's catalogue (2026-10-27-core-catalogue.generated.sql)
     re-seeded every heal, and a typed name kept mutating a file the fold had already overridden. */
  const order = JSON.parse(await readFile(ORDER, 'utf8')).order;
  const seeders = [];
  for (const f of order) {
    let t; try { t = await readFile(join(MIG_DIR, f), 'utf8'); } catch { continue; }
    if (seedRowsIn(t).length) seeders.push([f, t]);
  }
  if (!seeders.length) { process.stdout.write('  FAIL  no seeding file in the apply order\n'); return 1; }
  const [LAST, real] = seeders[seeders.length - 1];
  /* THE NEWEST SEED may be re-stated verbatim by several trailing files (each generated catalogue re-seeds
     every heal): a food dropped from only the last of them is still seeded by the one before, harmlessly.
     So "dropped" and "absent" are planted in EVERY trailing file that seeds the same rows (TAIL). */
  const rowsKey = (t) => JSON.stringify(seedRowsIn(t).slice().sort());
  const TAIL = [];
  for (let i = seeders.length - 1; i >= 0 && rowsKey(seeders[i][1]) === rowsKey(real); i--) TAIL.push(seeders[i]);
  const [[id0, heals0], [id1]] = seedRowsIn(real);
  const drifted = real.replace(new RegExp(`\\(\\s*'${id0}'\\s*,\\s*\\d+\\s*\\)`), `('${id0}', ${heals0 + 1})`);
  const drop = (t) => t.replace(new RegExp(`\\(\\s*'${id1}'\\s*,\\s*\\d+\\s*\\)\\s*,`), '');
  if (drifted === real || drop(real) === real) { process.stdout.write(`  FAIL  selftest anchors missed in ${LAST}\n`); return 1; }
  const inTail = (fn) => Object.fromEntries(TAIL.map(([f, t]) => [f, fn(t)]));
  /* THE COOKBOOK CUT, PLANTED: the newest seed without its unscoped delete is the upsert-only file the 2027-05-22 cut first
     shipped, and the cut feasts an older seed still carries must come back red. */
  const RESET = /^[ \t]*delete\s+from\s+public\.hr_feast_foods\s*;[ \t]*\r?\n/im;
  const upsertOnly = real.replace(RESET, '');
  if (upsertOnly === real) { process.stdout.write(`  FAIL  selftest anchor missed: no unscoped hr_feast_foods delete in ${LAST}\n`); return 1; }
  const arms = [
    ['control (unmutated chain)', {}, false],
    [`a heal value drifts in the newest seed (${LAST})`, { [LAST]: drifted }, true],
    [`a food is dropped from the newest seed (${TAIL.map(([f]) => f).join(', ')})`, inTail(drop), true],
    ['a LATER file seeds a food items.js does not back',
      { [LAST]: real + "\ninsert into public.hr_feast_foods (item_id, heals) values ('not_a_food', 9)"
                     + '\n  on conflict (item_id) do update set heals = excluded.heals;\n' }, true],
    ['the newest seed is ABSENT (the pre-b544 blind spot)', inTail(() => '-- nothing\n'), true],
    [`the newest seed only upserts, so a cut food stays priced (the 2027-05-22 cookbook cut, ${LAST})`, { [LAST]: upsertOnly }, true],
    ['a LATER file empties the table and seeds nothing', { [LAST]: `${real}\ndelete from public.hr_feast_foods;\n` }, true],
    ['a LATER file deletes with a shape the fold cannot model',
      { [LAST]: `${real}\ndelete from public.hr_feast_foods where item_id = 'not_a_food';\n` }, true],
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
if (isMain(import.meta.url)) {
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
