// ============================================================================
// tests/world-tick-stall-after-repoint.mjs — REGRESSION (2026-09-28)
//
//   node tests/world-tick-stall-after-repoint.mjs            green = the tick resumes
//   node tests/world-tick-stall-after-repoint.mjs --mutate   the fix reverted: must be RED
//
// THE PRODUCTION FINDING (read-only status pass, 2026-09-28 03:24Z). Two
// rostered characters, the cron posting every 10 s with HTTP 200, and ZERO
// hr_tick_shadow rows for 21.9 h (combat) and 14.7 h (gather). Both stalls
// began within a minute of a `set_activity` re-point on that slot and ended
// only at the next real accrue settle. Every clean resume that week had no
// re-point.
//
// ── THE CAUSE ───────────────────────────────────────────────────────────────
// A re-point is an activity change, and hr_apply CLOSES THE WINDOW on one:
// `v_accrued := now()` (2026-09-14-hr-apply-restatement.sql, "S5 (HALF)"), and
// the same UPDATE stamps `active_since = now()`. On production Postgres now()
// has MICROSECOND resolution, so the fence's mark becomes e.g.
// `17:47:45.123456+00:00`.
//
// tick.js `probeWatermark` reads that mark back as `markMs = Date.parse(...)`,
// which TRUNCATES to 17:47:45.123, and every window the drivers plan starts
// there — `p_window_from = new Date(markMs).toISOString()`. The fence then asks
// `p_window_from < v_mark` at microsecond precision: .123000 < .123456, so
// EVERY settle is refused `window_already_settled`, the mark never moves, and
// the next fire proposes the identical window. It ends only when something
// stamps a MILLISECOND-precise mark — a real accrue (`accrued_to` is the
// engine's `toISOString()`), which is exactly what production saw.
//
// The fire still answers 200 with `refused: 1, reasons: {window_already_settled:
// 1}`, but that body lives only in pg_net's response table (~6 h); the cron log
// carries none of it, so every cron-grain read stayed green.
//
// ── WHY NO GUARD SAW IT ─────────────────────────────────────────────────────
// PGlite's clock ticks in whole MILLISECONDS (R0a measures it), so on every
// replay the switch stamp has no sub-millisecond digits and truncation is the
// identity. This file restores the production clock for the one stamp that
// matters: after the REAL `runSetActivity` switch, R0b asserts that hr_apply
// stamped `accrued_to = active_since` (one now()), and the shim adds the 357 µs
// a microsecond clock would have carried to exactly those columns. R-*0 are the
// controls: the same re-point WITHOUT the shim resumes even on the defect, which
// names the sub-millisecond digits as the cause and nothing else.
//
// ── SCOPE ───────────────────────────────────────────────────────────────────
// Drives the SHIPPED `runTick` and the SHIPPED `runSetActivity` as hr_engine
// against a PGlite database rebuilt from supabase/migrations. Writes nothing to
// production. Time is advanced by shifting this character's stored instants
// back by whole milliseconds (the fence and the engine read only differences
// against now()).
//
// Exit: 0 green · 1 the tick stalls after a re-point · 2 harness.
// ============================================================================

import { readFile, writeFile, cp, mkdtemp } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { bootReplay } from './schema-replay.mjs';
import { runSetActivity } from '../supabase/functions/hr-accrue/set-activity.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MUTATE = process.argv.includes('--mutate');
const CADENCE_MS = 10000;
const FLUSH_MS = 90000;
const SUB_MS = 357;                         // µs a production now() carries past the ms

const problems = [];
const bad = (id, msg) => { problems.push(id); console.log(`  ✗ ${id} — ${msg}`); };
const good = (id, msg) => console.log(`  ✓ ${id} — ${msg}`);
const judge = (id, ok, okMsg, badMsg) => (ok ? good(id, okMsg) : bad(id, badMsg));

/* ── THE MUTATION ───────────────────────────────────────────────────────────
   Restores the DEFECT — the fence is handed the driver's truncated
   `p_window_from` — in a COPY of the function directory under the OS temp dir,
   never in the tracked file (Security S-UM-1). Same depth as the original,
   because accrual.js reaches `../../../src/core/**`. */
async function tickEntry() {
  const here = join(ROOT, 'supabase', 'functions', 'hr-accrue');
  if (!MUTATE) return import(pathToFileURL(join(here, 'tick.js')).href);
  const base = await mkdtemp(join(tmpdir(), 'hr-wtsr-'));
  const dir = join(base, 'supabase', 'functions', 'hr-accrue');
  await cp(here, dir, { recursive: true });
  await cp(join(ROOT, 'src'), join(base, 'src'), { recursive: true });
  const src = await readFile(join(dir, 'tick.js'), 'utf8');
  const marker = 'windowFrom: fenceWindowFrom(a.p_window_from, markMs, probe.markText),';
  if (!src.includes(marker)) {
    console.error('--mutate: tick.js no longer binds the settle window through fenceWindowFrom — '
      + 'the mutation cannot be applied, so a green run would prove nothing.');
    process.exit(2);
  }
  await writeFile(join(dir, 'tick.js'), src.replace(marker, 'windowFrom: a.p_window_from,'), 'utf8');
  return import(pathToFileURL(join(dir, 'tick.js')).href);
}

let db;
try {
  ({ db } = await bootReplay({}));
} catch (e) {
  console.error(`harness: the migration chain did not replay — ${e.message}`);
  process.exit(2);
}
const { runTick } = await tickEntry();

/** The one-statement seam index.ts hands both modules, as the real role. */
const exec = async (text, params) => {
  await db.exec('set role hr_engine');
  try { return (await db.query(text, params)).rows; } finally { await db.exec('reset role'); }
};
const one = async (sql, p) => (await db.query(sql, p)).rows[0];

const holder = (await one("select left('cron:' || coalesce(current_database(), 'db'), 64) as h")).h;
await db.exec("update public.hr_tick_config set channels = array['combat','gather']::text[],"
  + ' enabled = true, shadow = true where id;');

const TS_COLS = (await db.query(
  "select column_name from information_schema.columns where table_schema = 'public'"
  + " and table_name = 'player_state' and data_type like 'timestamp%'"
  + " and column_name not in ('created_at', 'updated_at')")).rows.map((r) => r.column_name);

/* Advance this character's world by `ms` WHOLE milliseconds: every instant it
   owns moves back, so `now() - x` grows by exactly `ms` and no sub-ms digit is
   created or destroyed. The lease is left alone — it is the roster's, not the
   character's, and it is set well past the run. */
async function travel(u, ms) {
  const iv = `interval '${Math.floor(ms)} milliseconds'`;
  await db.exec(`update public.player_state set ${TS_COLS.map((c) => `${c} = ${c} - ${iv}`).join(', ')}
                  where user_id = '${u}'`);
  await db.exec(`update public.hr_tick_ownership set shadow_accrued_to = shadow_accrued_to - ${iv}
                  where user_id = '${u}'`);
  await db.exec(`update public.hr_tick_shadow set window_from = window_from - ${iv},
                  window_to = window_to - ${iv} where user_id = '${u}'`);
}
const rowsOf = async (u) => Number((await one(
  `select count(*) as n from public.hr_tick_shadow where user_id = '${u}'`)).n);
const fire = async (u) => (await runTick({
  exec, body: { op: 'tick', roster: [{ user_id: u, slot: 0 }], cadence_ms: CADENCE_MS, flush_ms: FLUSH_MS },
})).body;

async function seed(u, kind) {
  await db.exec(`insert into auth.users (id) values ('${u}') on conflict do nothing;`);
  if (kind === 'gather') {
    await db.exec(`insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version,
                     accrued_to, active_kind, active_id, active_since)
                   values ('${u}', 0, 0, 0, 10, 10, 1, now() - interval '95 seconds',
                     'gather', 'normal_tree', now() - interval '2 hours')`);
    await db.exec(`insert into public.player_skills (user_id, slot, skill_id, xp)
                   values ('${u}', 0, 'woodcutting', 302288)`);
  } else {
    await db.exec(`insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version,
                     accrued_to, active_kind, active_id, active_since, auto_eat_enabled, auto_eat_food,
                     auto_eat_pct, consec_falls, combat_style, tool_carry, combat_xp_accrued_to,
                     recovering_until, fight, buffs, enchant)
                   values ('${u}', 0, 1234, 0, 99, 99, 7, now() - interval '95 seconds',
                     'combat', 'goblin', now() - interval '2 hours', true, 'cooked_trout', 70, 0,
                     '{"sword":"aggressive"}'::jsonb, '{}'::jsonb, now() - interval '3 hours',
                     now() - interval '3 hours', '{"id":"goblin","hp":11}'::jsonb, '[]'::jsonb,
                     '{"weapon":"fire"}'::jsonb)`);
    await db.exec(`insert into public.player_skills (user_id, slot, skill_id, xp) values
                     ('${u}', 0, 'attack', 302288), ('${u}', 0, 'strength', 302288),
                     ('${u}', 0, 'defence', 150000), ('${u}', 0, 'hitpoints', 302288)`);
    await db.exec(`insert into public.player_inventory (user_id, slot, item_id, qty)
                   values ('${u}', 0, 'cooked_trout', 40)`);
    await db.exec(`insert into public.player_equipment (user_id, slot, equip_slot, item_id)
                   values ('${u}', 0, 'weapon', 'mithril_sword')`);
  }
  await db.exec(`insert into public.hr_tick_ownership (user_id, slot, channel, owned, lease_holder, lease_until)
                 values ('${u}', 0, '${kind}', true, '${holder}', now() + interval '10 hours')`);
}

/* ── R0a ── THE HARNESS CLOCK. The whole reason no replay has seen this. */
{
  let subMs = 0;
  for (let i = 0; i < 8; i++) {
    subMs += Number((await one(
      'select (extract(microseconds from clock_timestamp())::bigint % 1000) as s')).s);
  }
  console.log('\nR0  the clock the replay runs on');
  good('R0a', subMs === 0
    ? 'PGlite\'s clock is millisecond-resolution (8 reads, 0 µs past the ms) — a switch stamp here '
      + 'never carries the sub-ms digits production\'s now() does, so the shim below restores them'
    : `PGlite's clock carries ${subMs} µs over 8 reads — the shim is a no-op in spirit, applied anyway`);
}

/**
 * One arm: a rostered character chains in shadow, is re-pointed through the
 * REAL set_activity, and must be ticking the new activity within one cadence of
 * its first eligible window.
 */
async function arm(id, u, kind, target, { microClock }) {
  console.log(`\n${id}  ${kind}: re-point to ${target}${microClock ? ' (production clock)' : ' (control: ms clock)'}`);
  await seed(u, kind);

  // (1) The chain is healthy before anything happens.
  for (let i = 0; i < 20 && (await rowsOf(u)) < 2; i++) { await fire(u); await travel(u, CADENCE_MS); }
  const before = await rowsOf(u);
  if (before < 2) { bad(`${id}-pre`, `the chain never started: ${before} shadow rows in 20 fires`); return; }

  // (2) THE RE-POINT, through the shipped intent, as hr_engine.
  const r = await runSetActivity({
    exec, user: u, slot: 0, intentId: crypto.randomUUID(), activity: { kind, id: target },
  });
  if (r.status !== 200) { bad(`${id}-repoint`, `set_activity answered ${r.status} ${JSON.stringify(r.body)}`); return; }
  const st = await one(`select accrued_to = active_since as same, active_id from public.player_state
                         where user_id = '${u}'`);
  judge(`${id}-R0b`, st.same === true && st.active_id === target,
    `hr_apply closed the window on the switch: accrued_to = active_since (one now()), pointer ${st.active_id}`,
    `the switch did not stamp both watermarks from one now() (same=${st.same}, id=${st.active_id}) — `
    + 'the premise of this file has moved; read hr_apply before trusting any arm below');
  if (microClock) {
    const iv = `interval '${SUB_MS} microseconds'`;
    await db.exec(`update public.player_state set
                     combat_xp_accrued_to = case when combat_xp_accrued_to = accrued_to
                                                 then combat_xp_accrued_to + ${iv}
                                                 else combat_xp_accrued_to end,
                     accrued_to = accrued_to + ${iv}, active_since = active_since + ${iv}
                   where user_id = '${u}'`);
  }
  const repoint = (await one(`select accrued_to::text as t from public.player_state where user_id = '${u}'`)).t;

  // (3) Fire on the cadence. The first window after the re-point is eligible
  //     one flush after it; it must journal on the first fire that sees it.
  const reasons = {};
  let resumedAt = -1;
  const eligibleStep = Math.ceil(FLUSH_MS / CADENCE_MS);
  for (let step = 0; step <= eligibleStep + 1; step++) {
    await travel(u, CADENCE_MS);
    const f = await fire(u);
    for (const [k, v] of Object.entries(f.reasons || {})) {
      if (k !== 'below_flush') reasons[k] = (reasons[k] || 0) + v;
    }
    if (resumedAt < 0 && (await rowsOf(u)) > before) resumedAt = step;
  }
  const resumed = resumedAt >= 0 && resumedAt <= eligibleStep;
  judge(`${id}-a`, resumed,
    `the tick resumed on fire ${resumedAt + 1} after the re-point — the first fire whose window `
    + `reaches one flush (${FLUSH_MS / 1000} s) past it`,
    `THE TICK STALLED AFTER THE RE-POINT: ${eligibleStep + 2} fires, 0 new shadow rows, `
    + `every non-flush verdict ${JSON.stringify(reasons)} — the fence refuses the driver's `
    + `truncated window start against the microsecond mark ${repoint}`);
  if (!resumed) return;

  // (4) It prices the RE-POINTED activity, from the re-point instant.
  //     In shadow nothing pays, so `player_state.accrued_to` still IS the
  //     re-point instant (moved by `travel` exactly as the shadow row was).
  const row = await one(`select s.window_from = ps.accrued_to as from_mark,
                                s.delta#>>'{journal,meta,node}' as node, s.delta->'items' as items
                           from public.hr_tick_shadow s
                           join public.player_state ps on ps.user_id = s.user_id and ps.slot = s.slot
                          where s.user_id = '${u}'
                          order by s.window_to asc offset ${before} limit 1`);
  const onTarget = kind === 'gather'
    ? row.node === target
    : Object.keys(row.items || {}).some((k) => k.startsWith(target));
  judge(`${id}-b`, row.from_mark === true && onTarget,
    `the first window after it starts AT the re-point instant (${repoint}) and prices ${target}`,
    `the resumed window starts at the re-point: ${row.from_mark}; prices the new target: ${onTarget} `
    + `(node=${row.node}, items=${JSON.stringify(row.items)})`);

  // (5) And it keeps chaining — the next flush lands too.
  const n1 = await rowsOf(u);
  for (let i = 0; i < eligibleStep + 1; i++) { await travel(u, CADENCE_MS); await fire(u); }
  const n2 = await rowsOf(u);
  judge(`${id}-c`, n2 > n1, `the chain continues: ${n1} -> ${n2} rows over the next flush`,
    `one window landed and the chain stopped again: ${n1} -> ${n2}`);
}

const U = (n) => `00000000-0000-4000-8000-00000000d${String(n).padStart(3, '0')}`;
await arm('R-G0', U(1), 'gather', 'oak_tree', { microClock: false });
await arm('R-G', U(2), 'gather', 'oak_tree', { microClock: true });
await arm('R-C0', U(3), 'combat', 'slime', { microClock: false });
await arm('R-C', U(4), 'combat', 'slime', { microClock: true });

const tag = MUTATE ? ' [--mutate: fix reverted]' : '';
if (problems.length) {
  console.log(`\nworld-tick-stall-after-repoint: RED${tag} — ${problems.length} arm(s): ${problems.join(', ')}`);
  process.exit(1);
}
console.log(`\nworld-tick-stall-after-repoint: green${tag} — a re-point's microsecond mark no longer stalls the tick.`);
