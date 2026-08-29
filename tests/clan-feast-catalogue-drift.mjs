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
// Exit: 0 in sync · 1 drift · 2 harness problem.
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const MIG = join(ROOT, 'supabase', 'migrations', '2026-08-27-clan-economy-sinks.sql');

export async function feastCatalogueDriftGuard() {
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

  // ── the SEED: parse the VALUES rows out of the migration text ──
  const sql = await readFile(MIG, 'utf8');
  const block = sql.match(/insert into public\.hr_feast_foods \(item_id, heals\) values([\s\S]*?)on conflict/i);
  if (!block) return ['could not find the hr_feast_foods INSERT in the migration'];
  const fromSql = new Map();
  const re = /\('([a-z0-9_]+)'\s*,\s*(\d+)\)/gi;
  let m;
  while ((m = re.exec(block[1])) !== null) fromSql.set(m[1], Number(m[2]));

  if (fromSql.size === 0) return ['parsed 0 rows from the seed — the anchor moved'];

  // ── compare ──
  const problems = [];
  for (const [id, heals] of fromData) {
    if (!fromSql.has(id)) problems.push(`items.js has feast food "${id}" (heals ${heals}) — MISSING from the migration seed`);
    else if (fromSql.get(id) !== heals) problems.push(`"${id}": items.js heals=${heals} but seed heals=${fromSql.get(id)}`);
  }
  for (const [id, heals] of fromSql) {
    if (!fromData.has(id)) problems.push(`migration seeds "${id}" (heals ${heals}) — NOT a feast-eligible food in items.js`);
  }

  return problems;
}

// CLI: node tests/clan-feast-catalogue-drift.mjs
if (process.argv[1]?.endsWith('clan-feast-catalogue-drift.mjs')) {
  feastCatalogueDriftGuard().then((problems) => {
    if (problems.length) {
      for (const p of problems) process.stdout.write(`  FAIL  ${p}\n`);
      process.stdout.write(`\n${problems.length} drift(s). Re-sync the hr_feast_foods seed in 2026-08-27-clan-economy-sinks.sql.\n`);
      process.exit(1);
    }
    process.stdout.write('  ok    the feast catalogue seed matches items.js exactly.\n\nin sync.\n');
    process.exit(0);
  }).catch((e) => { process.stderr.write(`ERROR: ${e.message}\n`); process.exit(2); });
}
