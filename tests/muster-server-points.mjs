#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/muster-server-points.mjs — WHAT A MUSTER COUNTS IS AUTHORED ONCE.
//
//   node tests/muster-server-points.mjs             the guard
//   node tests/muster-server-points.mjs --selftest  plant each drift, require RED
//
// 2026-10-10-muster-server-points.sql moved muster scoring to the server: the
// client sends no number and world_event_contribute derives the points from the
// caller's own counters. The weights it prices with (hr_muster_points /
// hr_muster_sources) and its per-player cap are typed into that SQL as
// ⟦DERIVED⟧ literals from src/data/muster.js. This binds them IN BOTH
// DIRECTIONS — a weight, an event, a multiplier or the cap that differs on
// either side is a red build — and it binds the client: src/features/muster.js
// may no longer send `p_points` or carry its own scorer.
//
// Behaviour (snapshot at join, tier-priced kills, credited kills discounted,
// off-event work 0, cap, idempotent repeat, closed window) is proven by the
// migration's own §6 self-check on every replay (tests/schema-drift.mjs).
// NO ?v= on the imports (tests/** — b332).
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MUSTER_POINTS, MUSTER_EVENT_SOURCES, MUSTER_POINT_CAP } from '../src/data/muster.js';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const MIG = join(ROOT, 'supabase', 'migrations', '2026-10-10-muster-server-points.sql');
const CLIENT = join(ROOT, 'src', 'features', 'muster.js');

const canon = (o) => JSON.stringify(Object.keys(o).sort().map((k) => [k, Number(o[k])]));

function musterDrift(sql, client) {
  const bad = [];
  const pts = sql.match(/hr_muster_points\(\)\s*returns jsonb[\s\S]*?select '(\{[^']*\})'::jsonb/);
  if (!pts) bad.push('CONTROL: hr_muster_points() literal not found');
  else if (canon(JSON.parse(pts[1])) !== canon(MUSTER_POINTS)) {
    bad.push(`hr_muster_points ${pts[1]} != MUSTER_POINTS ${JSON.stringify(MUSTER_POINTS)}`);
  }
  const sqlEvents = {};
  for (const m of sql.matchAll(/when '([a-z_]+)'\s+then '(\{[^']*\})'::jsonb/g)) sqlEvents[m[1]] = JSON.parse(m[2]);
  if (!Object.keys(sqlEvents).length) bad.push('CONTROL: hr_muster_sources() arms not found');
  for (const [id, src] of Object.entries(MUSTER_EVENT_SOURCES)) {
    if (!sqlEvents[id]) bad.push(`MUSTER_EVENT_SOURCES.${id} has no SQL arm`);
    else if (canon(sqlEvents[id]) !== canon(src)) bad.push(`event ${id}: SQL ${JSON.stringify(sqlEvents[id])} != data ${JSON.stringify(src)}`);
  }
  for (const id of Object.keys(sqlEvents)) if (!MUSTER_EVENT_SOURCES[id]) bad.push(`SQL prices event ${id} that src/data/muster.js does not know`);
  const cap = sql.match(/c_total_cap constant bigint := (\d+);/);
  if (!cap || Number(cap[1]) !== MUSTER_POINT_CAP) bad.push(`c_total_cap ${cap && cap[1]} != MUSTER_POINT_CAP ${MUSTER_POINT_CAP}`);
  // THE CLIENT SENDS NO NUMBER (comments stripped so prose cannot satisfy it).
  const code = client.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  if (/p_points/.test(code)) bad.push('src/features/muster.js sends p_points again — a client number on the shared bar');
  if (/function\s+(pointsFor|addPoints|rally)\s*\(/.test(code)) bad.push('src/features/muster.js carries its own scorer again');
  return bad;
}

const [sql, client] = await Promise.all([readFile(MIG, 'utf8'), readFile(CLIENT, 'utf8')]);
if (process.argv.includes('--selftest')) {
  const arms = [
    ['weight drift', sql.replace('"gather": 4,', '"gather": 40,'), client],
    ['event multiplier drift', sql.replace(`when 'deep_seam'     then '{"gather": 1}'`, `when 'deep_seam'     then '{"gather": 3}'`), client],
    ['unknown event priced', sql.replace(`else '{}'::jsonb end`, `when 'ghost' then '{"gather": 1}'::jsonb\n    else '{}'::jsonb end`), client],
    ['cap raised', sql.replace('c_total_cap constant bigint := 6000;', 'c_total_cap constant bigint := 60000;'), client],
    ['client sends p_points', sql, client.replace("{ p_event_key: st.eventKey }", "{ p_event_key: st.eventKey, p_points: 400 }")],
  ];
  let bad = 0;
  if (musterDrift(sql, client).length) { console.error('HARNESS: the clean tree is red'); process.exit(2); }
  for (const [name, s, c] of arms) {
    if (s === sql && c === client) { console.error(`HARNESS: arm "${name}" planted nothing`); process.exit(2); }
    const n = musterDrift(s, c).length;
    console.log(`${n ? 'ok  ' : 'MISS'} ${name} (${n})`);
    if (!n) bad++;
  }
  console.log(bad ? `muster-server-points --selftest: ${bad} UNCAUGHT` : 'muster-server-points --selftest: every drift caught');
  process.exit(bad ? 1 : 0);
}
const bad = musterDrift(sql, client);
for (const b of bad) console.error('  FAIL  ' + b);
console.log(bad.length ? `muster-server-points: ${bad.length} problem(s)` : 'muster-server-points: SQL catalogue == src/data/muster.js, and the client sends no number');
process.exit(bad.length ? 1 : 0);
