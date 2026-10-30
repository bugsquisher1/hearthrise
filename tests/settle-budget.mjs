#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/settle-budget.mjs — WHAT ONE WATCHED 4-HERO SETTLE MAY CALL (lane/c-settle-cost-2, 2026-10-30).
//
//   node tests/settle-budget.mjs            the guard
//   node tests/settle-budget.mjs --mutate   every mutant goes red on its named arm
//
// mutant-anchors: none — every mutant is DDL planted into the booted replay (or a forced hello statement), not an
// anchored patch of a file.
//
// THE MEASURE. tools/settle-cost.mjs's `viewed` door on the replayed chain (PGlite): four heroes in one party, every
// hero open in a client (frames on), the first one watched; per window one landed hello after the live view's asks
// (4 every 3 windows, live's measured ratio). 3 windows = 3 landed settles + 4 early asks. Counted through
// pg_stat_user_functions (track_functions = all): CALLS, never milliseconds — a call count is the same on any machine,
// on PGlite (PostgreSQL 18) and on production (17), so the budget cannot flake with the load.
//
// THE ARMS
//   SB-0  index.ts's accrue read takes its state from hr_accrue_read (2027-02-10-settle-reads.sql): the statement
//         tools/settle-cost.mjs restates and runs is the one index.ts sends.
//   SB-1  hr_state_of <= 16 calls over the 3 settles (5.33 a settle: the 1.33 live asks' early answers, the commit's
//         projection, one frame for each of the 3 other members). Was 23 (7.67) before the lane: every hello built the
//         hunter's whole envelope first and dropped it. CONTROL: 9 frames pushed and 4 early asks answered.
//   SB-2  hr_hunt_weapon_of <= 120 calls over the 3 settles (96 measured; was 1,242: hr_hunt_role_of and hr_role_view
//         called it once per hr_hunt_weapon_roles row their filter scanned).
//   SB-3  no STABLE, scalar, LANGUAGE sql function in public is called 7 or more times a settle: PostgreSQL 17
//         (production) re-plans such a body on every statement that calls it (2027-02-10-settle-plan-cache.generated.sql;
//         the replay is 18 and never shows it). ALLOW lists the one exception and why.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isMain } from './_is-main.mjs';
import { ROOT } from './schema-replay.mjs';

const WINDOWS = 3;
export const BUDGET = Object.freeze({ stateOf: 16, frames: 9, asks: 4, weapon: 120, sqlHot: 7 });
/* hr_char_xp_for_level is written by tools/gen-level-curve.mjs (every curve file restates it as SQL): its language
   moves in that generator, handed off by lane/c-settle-cost-2 (2026-10-30). Nothing else may sit here without a why. */
export const ALLOW = Object.freeze({ hr_char_xp_for_level: 'tools/gen-level-curve.mjs owns its body; the next curve file moves it' });

/** One measurement: the viewed door's counters over WINDOWS settles, and the hot SQL functions. */
export async function measure({ plant = null, helloState = null } = {}) {
  const { bootReplay } = await import('./schema-replay.mjs');
  const SC = await import('../tools/settle-cost.mjs');
  const { db } = await bootReplay();
  if (plant) await db.exec(plant);
  const m = await SC.prepare({ db, heroes: 4, windows: WINDOWS, door: 'viewed', helloState });
  await m.warm();
  for (let w = 2; w <= WINDOWS + 1; w++) await m.step(w);
  const r = await m.report();
  const calls = (fn) => Math.round(((r.functions.find((f) => f.fn === fn) || { calls_per_settle: 0 }).calls_per_settle) * r.windows);
  const lang = (await db.query(`select p.proname, l.lanname, p.provolatile, p.proretset from pg_proc p
      join pg_language l on l.oid = p.prolang join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`)).rows;
  const sqlStable = new Set(lang.filter((x) => x.lanname === 'sql' && x.provolatile === 's' && !x.proretset).map((x) => x.proname));
  const hot = r.functions.filter((f) => sqlStable.has(f.fn) && f.calls_per_settle >= BUDGET.sqlHot && !ALLOW[f.fn])
    .map((f) => `${f.fn} ${f.calls_per_settle}/settle`);
  return { r, stateOf: calls('hr_state_of'), weapon: calls('hr_hunt_weapon_of'), frames: Math.round(r.frames_per_window * r.windows),
    asks: Math.round(r.early_asks_per_window * r.windows), hot };
}

/* SB-4 — THE SAME BYTES. This lane's two files, applied INSIDE ONE TRANSACTION over a chain that has just hunted
   (the viewed door on the chain before them: four heroes mid-hunt, tallies, frames, a party), change no answer a
   client or the engine reads: every hero's envelope (hr_state_of, the frames' payload, and hr_load, the browser's own
   read), engine inputs (hr_hunt_member_state, hr_hunt_instance_read, hr_perks_of), vitals and the hunt view, compared
   as TEXT before and after. One transaction means one now(): nothing is masked. */
export const LANE_FILES = Object.freeze(['2027-02-10-settle-plan-cache.generated.sql', '2027-02-10-settle-reads.sql']);
export async function parity({ plantAfter = null } = {}) {
  const { bootReplay, manifest } = await import('./schema-replay.mjs');
  const SC = await import('../tools/settle-cost.mjs');
  const order = (await manifest()).order;
  const upTo = order[order.indexOf(LANE_FILES[0]) - 1];
  const { db } = await bootReplay({ upTo });
  const m = await SC.prepare({ db, heroes: 4, windows: 2, door: 'viewed', helloState: 'legacy' });
  await m.warm();
  await m.step(2);
  const heroes = (await db.query('select user_id::text as u from public.player_state order by user_id')).rows.map((x) => x.u);
  const sessions = (await db.query('select id::text as s from public.hunt_sessions order by id')).rows.map((x) => x.s);
  const snap = async () => {
    const out = [];
    for (const u of heroes) {
      for (const [k, sql] of [['state', 'select public.hr_state_of($1::uuid, 0)::text as v'], ['member', 'select public.hr_hunt_member_state($1::uuid, 0)::text as v'],
        ['instance', 'select public.hr_hunt_instance_read($1::uuid, 0)::text as v'], ['perks', 'select public.hr_perks_of($1::uuid, 0)::text as v'],
        ['vitals', 'select public.hr_vitals_of($1::uuid, 0)::text as v'], ['renown', 'select public.hr_renown_of($1::uuid, 0)::text as v']]) {
        out.push([`${k} ${u}`, (await db.query(sql, [u])).rows[0].v]);
      }
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [u]);
      out.push([`hr_load ${u}`, (await db.query('select public.hr_load(0)::text as v')).rows[0].v]);
      await db.query(`select set_config('request.jwt.claim.sub', '', true)`);
    }
    for (const s of sessions) out.push([`hunt_view ${s}`, (await db.query('select public.hr_hunt_view($1::uuid)::text as v', [s])).rows[0].v]);
    return out;
  };
  await db.query('begin');
  try {
    const before = await snap();
    for (const f of LANE_FILES) await db.exec(readFileSync(join(ROOT, 'supabase', 'migrations', f), 'utf8').replace(/\r\n/g, '\n'));
    if (plantAfter) await db.exec(plantAfter);
    const after = await snap();
    const lang = (await db.query(`select count(*)::int n from pg_proc p join pg_language l on l.oid = p.prolang
       where p.oid = 'public.hr_hunt_limit(text)'::regprocedure and l.lanname = 'plpgsql'`)).rows[0].n;
    const diffs = before.filter(([k, v], i) => after[i][0] !== k || after[i][1] !== v).map(([k]) => k);
    const bytes = before.reduce((n, [, v]) => n + (v ? v.length : 0), 0);
    return { compared: before.length, bytes, diffs, applied: lang === 1, heroes: heroes.length, sessions: sessions.length };
  } finally { await db.query('rollback'); }
}

/** SB-0: index.ts's own accrue-read statement (its text, `src` for a mutant). */
export function helloReadsLean(src) {
  return /select public\.hr_accrue_read\(\$\{user\}::uuid, \$\{slot\}::int\)\s+as state,\s+public\.hr_accrue_cap_ms\(/.test(src);
}

function judge(x, src, log = true) {
  const red = [];
  const ok = (id, cond, msg) => { if (!cond) red.push(id); if (log) console.log(`  ${cond ? '✓' : '✗'} ${id} — ${msg}`); };
  ok('SB-0', helloReadsLean(src), "index.ts's accrue read takes its state from hr_accrue_read");
  ok('CONTROL', x.frames >= BUDGET.frames && x.asks === BUDGET.asks, `${x.frames} frames pushed (>= ${BUDGET.frames}), ${x.asks} early asks (${BUDGET.asks}) over ${WINDOWS} settles`);
  ok('SB-1', x.stateOf <= BUDGET.stateOf, `hr_state_of ${x.stateOf} calls over ${WINDOWS} watched settles (<= ${BUDGET.stateOf})`);
  ok('SB-2', x.weapon <= BUDGET.weapon, `hr_hunt_weapon_of ${x.weapon} calls over ${WINDOWS} settles (<= ${BUDGET.weapon})`);
  ok('SB-3', x.hot.length === 0, x.hot.length ? `stable SQL functions re-planned per call on PostgreSQL 17: ${x.hot.join(', ')}`
    : `no stable scalar SQL function called ${BUDGET.sqlHot}+ times a settle`);
  return red;
}

/* THE MUTANTS: a defect each arm alone must name. SQL is planted into the booted replay after the chain. */
const PRE_ROLE_OF = `create or replace function public.hr_hunt_role_of(p_user uuid, p_slot integer) returns text language sql stable
  set search_path = public, pg_catalog as $m$
  select case when a.options->>'role' = any (w.roles) then a.options->>'role' else w.roles[1] end
    from public.hr_hunt_weapon_roles w
    left join public.player_action_sets a on a.user_id = p_user and a.slot = p_slot
     and a.preset = coalesce((select h.preset::int from public.hunt_sessions h where h.user_id = p_user and h.slot = p_slot and h.ended_at is null
                               order by h.entered_at desc limit 1), public.hr_hunt_active_set(p_user, p_slot))
   where w.weapon_type = public.hr_hunt_weapon_of(p_user, p_slot) $m$;`;
export const MUTANTS = [
  { name: 'helloLegacy', why: 'index.ts reads the hunter\'s whole envelope again (the bench runs the old statement)', expect: 'SB-1', helloState: 'legacy' },
  { name: 'accrueReadFull', why: 'hr_accrue_read hands a hunter the whole envelope', expect: 'SB-1',
    plant: `create or replace function public.hr_accrue_read(p_user uuid, p_slot integer) returns jsonb language plpgsql volatile security definer
      set search_path = public, pg_catalog as $m$ begin return public.hr_state_of(p_user, p_slot); end $m$;` },
  { name: 'roleOfPerRow', why: 'hr_hunt_role_of reads the weapon once per weapon-role row again (and as SQL)', expect: 'SB-2', plant: PRE_ROLE_OF },
  { name: 'limitBackToSql', why: 'hr_hunt_limit is a SET-clause SQL function again (re-planned per call on PostgreSQL 17)', expect: 'SB-3',
    plant: `create or replace function public.hr_hunt_limit(p_key text) returns integer language sql stable set search_path = public, pg_catalog
      as $m$ select value from public.hr_hunt_limits where key = p_key $m$;` },
];

async function main() {
  const src = readFileSync(join(ROOT, 'supabase', 'functions', 'hr-accrue', 'index.ts'), 'utf8');
  if (process.argv.includes('--mutate')) {
    console.log('\nsettle-budget --mutate: every mutant must go RED on its named arm');
    let bad = 0;
    /* SB-0's own mutant: index.ts's statement back to hr_state_of, judged on the text alone. */
    const legacySrc = src.replace(/select public\.hr_accrue_read\(\$\{user\}::uuid, \$\{slot\}::int\)/, 'select public.hr_state_of(${user}::uuid, ${slot}::int)');
    const sb0 = legacySrc !== src && !helloReadsLean(legacySrc);
    console.log(`  ${sb0 ? '✓' : '✗'} indexReadsEnvelope — SB-0 ${sb0 ? 'red' : 'SURVIVED'} (index.ts reads hr_state_of for every hello)`);
    if (!sb0) bad++;
    /* SB-4's mutant: a converted helper that answers one key differently (the hero's base HP), planted after the files. */
    const p = await parity({ plantAfter: `create or replace function public.hr_hunt_limit(p_key text) returns integer language plpgsql stable
      set search_path = public, pg_catalog as $m$ begin return (select value from public.hr_hunt_limits where key = p_key)
        + case when p_key = 'hp_base' then 1 else 0 end; end $m$;` });
    const sb4 = p.diffs.length > 0;
    console.log(`  ${sb4 ? '✓' : '✗'} helperAnswersMoved — SB-4 ${sb4 ? 'red' : 'SURVIVED'} (a restated helper answers base HP + 1): ${p.diffs.length} answers moved`);
    if (!sb4) bad++;
    for (const mu of MUTANTS) {
      const x = await measure({ plant: mu.plant || null, helloState: mu.helloState || null });
      const red = judge(x, src, false);
      const caught = red.includes(mu.expect) && !red.includes('CONTROL');
      console.log(`  ${caught ? '✓' : '✗'} ${mu.name} — ${mu.expect} ${caught ? 'red' : 'SURVIVED'} (${mu.why}); red: ${red.join(', ') || 'none'}`
        + ` [state_of ${x.stateOf}, weapon ${x.weapon}, hot ${x.hot.length}]`);
      if (!caught) bad++;
    }
    console.log(bad ? `\n✗ ${bad} mutant(s) survived` : `\n✓ ${MUTANTS.length + 2}/${MUTANTS.length + 2} mutants caught`);
    process.exit(bad ? 1 : 0);
  }
  console.log('\nsettle-budget: one watched 4-hero party, ' + WINDOWS + ' settles (tools/settle-cost.mjs --door=viewed, PGlite)');
  const x = await measure();
  const red = judge(x, src);
  const p = await parity();
  const same = p.applied && p.diffs.length === 0 && p.heroes === 4 && p.sessions >= 4;
  if (!same) red.push('SB-4');
  console.log(`  ${same ? '✓' : '✗'} SB-4 — ${p.compared} answers (${p.bytes.toLocaleString('en-US')} bytes: envelopes, hr_load, engine inputs, `
    + `vitals, renown, hunt views of ${p.heroes} hunting heroes) byte-identical before and after this lane's files`
    + (p.diffs.length ? `; MOVED: ${p.diffs.slice(0, 6).join(', ')}` : '') + (p.applied ? '' : '; the files did not land'));
  console.log(red.length ? `\n✗ settle-budget: ${red.join(', ')}` : '\n✓ settle-budget: every call budget holds');
  process.exit(red.length ? 1 : 0);
}
if (isMain(import.meta.url)) main().catch((e) => { console.error('settle-budget: ' + (e && e.stack || e)); process.exit(2); });
