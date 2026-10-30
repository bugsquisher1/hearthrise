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
//   SB-2  ONE hr_hunt_weapon_of a role read: hr_hunt_role_of and hr_role_view, called for every hero with index scans
//         OFF (the plan PostgreSQL 17 gives the 12-row hr_hunt_weapon_roles, and why a watched settle called it 414
//         times there), read the worn weapon once each, not once per row their filter scans. PGlite's planner probes the
//         primary key and hides the difference, so the plan is pinned rather than hoped for.
//   SB-3  no STABLE or IMMUTABLE LANGUAGE sql function in public, scalar or set-returning, is called by a watched settle
//         at all: PostgreSQL 17 (production) re-plans such a body on every statement that calls it (the replay is 18 and
//         never shows it). 2027-02-10-settle-plan-cache.generated.sql moved the stable scalar ones called 7+ times a
//         settle; 2027-02-11-settle-plan-cache-2.generated.sql the rest (lane/c-envelope-diff, 2026-10-30: they were
//         still ~32 % of a watched settle's DB time on the PostgreSQL 17 replay). ALLOW lists each exception and why.
//   SB-4  THE SAME BYTES (below): every read a client or the engine makes, AND one settle's every written row, under the
//         settle-cost lanes' files and under their pre-images, in one transaction.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isMain } from './_is-main.mjs';
import { ROOT } from './schema-replay.mjs';

const WINDOWS = 3;
export const BUDGET = Object.freeze({ stateOf: 16, frames: 9, asks: 4 });
/* The SQL helpers a watched settle may still call, each with its why (tools/gen-plan-cache.mjs's exclusions). A full-chain
   mutant patches each in its own file (tests/settle-hooks.mjs H-COVER in 2026-11-07-store-by-slot.sql; tests/alpha-server.mjs's
   shop arms in 2026-11-25-shop-seeds.sql), and a later restatement's pin would refuse the mutated pre-image before the
   guard's arm could name the defect. Nothing else may sit here without a why. */
export const ALLOW = Object.freeze({
  hr_hunt_member_read: 'one plan per instance read (row pattern); a full-chain mutant patches it in its own file',
  hr_shop_view: 'once an envelope; tests/alpha-server.mjs\'s full-chain shop mutants patch it in 2026-11-25-shop-seeds.sql',
});
/* Where a SQL copy comes back from, when a generator writes it (SB-3 names it). */
const SB3_HINT = Object.freeze({
  hr_char_xp_for_level: 'tools/gen-level-curve.mjs writes it: the next curve file must emit it as plpgsql'
    + ' (2027-02-11-settle-plan-cache-2.generated.sql\'s form)',
});

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
  /* every STABLE or IMMUTABLE SQL function, scalar or set-returning (pg_stat_user_functions lists only what ran) */
  const sqlHelpers = new Set(lang.filter((x) => x.lanname === 'sql' && (x.provolatile === 's' || x.provolatile === 'i')).map((x) => x.proname));
  const hot = r.functions.filter((f) => sqlHelpers.has(f.fn) && Number(f.calls_per_settle) > 0 && !ALLOW[f.fn])
    .map((f) => `${f.fn} ${f.calls_per_settle}/settle${SB3_HINT[f.fn] ? ' (' + SB3_HINT[f.fn] + ')' : ''}`);
  /* SB-2: every hero's role read, index scans off; the calls of each counted alone */
  /* every cached plan dropped (the settle's, made with index scans on: PostgreSQL 18 also caches SQL-function plans), so
     the role reads are planned now, under the pinned settings */
  await db.exec('reset role; set enable_indexscan = off; set enable_bitmapscan = off; set enable_indexonlyscan = off; discard plans');
  const flush = async () => { try { await db.query('select pg_stat_force_next_flush()'); } catch { /* PG < 15 */ } await db.query('select 1');
    try { await db.query('select pg_stat_clear_snapshot()'); } catch { /* none */ } };
  await flush(); await db.query('select pg_stat_reset()');
  await db.query('select count(public.hr_hunt_role_of(user_id, slot)) + count(public.hr_role_view(user_id, slot)) as n from public.player_state');
  await flush();
  const fc = async (fn) => Number(((await db.query(`select calls from pg_stat_user_functions where schemaname = 'public' and funcname = $1`, [fn])).rows[0] || { calls: 0 }).calls);
  const roleReads = (await fc('hr_hunt_role_of')) + (await fc('hr_role_view'));
  const weaponPerRole = roleReads ? (await fc('hr_hunt_weapon_of')) / roleReads : Infinity;
  await db.exec('reset enable_indexscan; reset enable_bitmapscan; reset enable_indexonlyscan; discard plans');
  return { db, m, r, stateOf: calls('hr_state_of'), weapon: calls('hr_hunt_weapon_of'), weaponPerRole, roleReads,
    frames: Math.round(r.frames_per_window * r.windows), asks: Math.round(r.early_asks_per_window * r.windows), hot };
}

/* SB-4 — THE SAME BYTES. On the chain that has just hunted (measure's database: four heroes mid-hunt, tallies, frames, a
   party), inside ONE transaction: every answer a client or the engine reads is taken with the settle-cost lanes' functions,
   then with their PRE-IMAGES restored (the exact bodies the files carry for their self-checks, put back under their public
   names), and compared as TEXT: every hero's envelope (hr_state_of, the frames' payload, and hr_load, the browser's own
   read), engine inputs (hr_hunt_member_state, hr_hunt_instance_read, hr_perks_of, the hello's bestiary / trophy /
   collection / open-hunt reads), vitals, renown and the hunt views. THE WRITES TOO (lane/c-envelope-diff: pass 2 moves
   helpers the commit itself runs, hr_jsonb_add / hr_hunt_tally_add / hr_hunt_tally_ok / hr_gold_kind): the next window is
   settled through the three pieces under each image, from one savepoint, and every row of every table the settle wrote
   (pg_stat_xact_user_tables), the pushed frames among them, is compared, sequence and random ids aside. A CONTROL settles
   it twice under the same image first: the window must be deterministic for the comparison to mean anything. One
   transaction means one now(): nothing is masked. */
export const LANE_FILES = Object.freeze(['2027-02-10-settle-plan-cache.generated.sql', '2027-02-10-settle-reads.sql',
  '2027-02-11-settle-plan-cache-2.generated.sql']);
/* 50 + 3 pre-images in the 2027-02-10 files, 18 in 2027-02-11's (tools/gen-plan-cache.mjs FNS2) */
const PRE_IMAGES = 71;
/* the window SB-4 settles: the one after measure()'s last (warm is window 1, the steps 2..WINDOWS+1) */
const SB4_WINDOW = WINDOWS + 2;
const PRE_NAMES = Object.freeze({ hrsr_role_of: 'hr_hunt_role_of', hrsr_role_view: 'hr_role_view', hrsr_sections: 'hr_state_sections_of' });
/** The pre-image DDL the lane's files carry (their pg_temp copies), renamed back to the public functions they were. */
export function preImages() {
  const out = [];
  for (const f of LANE_FILES) {
    const text = readFileSync(join(ROOT, 'supabase', 'migrations', f), 'utf8').replace(/\r\n/g, '\n');
    for (const m of text.matchAll(/execute (\$pre\d*\$)create (?:or replace )?function pg_temp\.(hrpc_|hrsr_)([a-z0-9_]+)\(([\s\S]*?)\1;/g)) {
      const name = m[2] === 'hrpc_' ? m[3] : PRE_NAMES['hrsr_' + m[3]];
      if (!name) throw new Error(`settle-budget: ${f} carries a pre-image pg_temp.${m[2]}${m[3]} this guard cannot name`);
      out.push({ name, ddl: `create or replace function public.${name}(${m[4]}` });
    }
  }
  return out;
}
export async function parity(db, m, { plantAfter = null } = {}) {
  const heroes = (await db.query('select user_id::text as u from public.player_state order by user_id')).rows.map((x) => x.u);
  const sessions = (await db.query('select id::text as s from public.hunt_sessions order by id')).rows.map((x) => x.s);
  const snap = async () => {
    const out = [];
    for (const u of heroes) {
      for (const [k, sql] of [['state', 'select public.hr_state_of($1::uuid, 0)::text as v'], ['member', 'select public.hr_hunt_member_state($1::uuid, 0)::text as v'],
        ['instance', 'select public.hr_hunt_instance_read($1::uuid, 0)::text as v'], ['perks', 'select public.hr_perks_of($1::uuid, 0)::text as v'],
        ['vitals', 'select public.hr_vitals_of($1::uuid, 0)::text as v'], ['renown', 'select public.hr_renown_of($1::uuid, 0)::text as v'],
        ['open', 'select public.hr_hunt_open_of($1::uuid, 0)::text as v'],
        ...['hr_bestiary_of', 'hr_trophy_of', 'hr_collection_of', 'hr_unlock_levels'].map((f) => [f,
          `select coalesce(array_agg(t::text order by t::text), '{}')::text as v from public.${f}($1::uuid, 0) t`])]) {
        out.push([`${k} ${u}`, (await db.query(sql, [u])).rows[0].v]);
      }
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [u]);
      out.push([`hr_load ${u}`, (await db.query('select public.hr_load(0)::text as v')).rows[0].v]);
      await db.query(`select set_config('request.jwt.claim.sub', '', true)`);
    }
    for (const s of sessions) out.push([`hunt_view ${s}`, (await db.query('select public.hr_hunt_view($1::uuid)::text as v', [s])).rows[0].v]);
    return out;
  };
  /* THE WRITES: one window settled, then every row of every table this transaction has written so far (the list fixed on
     the first call), minus the columns a sequence or a random uuid fills (a rolled-back savepoint does not rewind them). */
  let tables = null;
  const written = async () => {
    const res = await m.commitWindow(SB4_WINDOW);
    await db.exec('reset role');
    if (!tables) {
      tables = (await db.query(`select schemaname || '.' || relname as t from pg_stat_xact_user_tables
                                 where n_tup_ins + n_tup_upd + n_tup_del > 0 order by 1`)).rows.map((x) => x.t);
    }
    const out = [['commit', JSON.stringify(res)]];
    for (const t of tables) {
      const [schema, name] = t.split('.');
      const drop = (await db.query(`select coalesce(array_agg(column_name::text), '{}') as c from information_schema.columns
                                     where table_schema = $1 and table_name = $2
                                       and (column_default like 'nextval(%' or column_default like '%gen_random_uuid()%')`, [schema, name])).rows[0].c;
      out.push([`rows ${t}`, (await db.query(`select coalesce(string_agg(x, E'\\n' order by x), '') as v
                                                 from (select (to_jsonb(r) - $1::text[])::text as x from ${schema}.${name} r) s`, [drop])).rows[0].v]);
    }
    return out;
  };
  const diffOf = (a, b) => a.filter(([k, v], i) => !b[i] || b[i][0] !== k || b[i][1] !== v).map(([k]) => k);
  const pre = preImages();
  await db.exec('reset role');
  await db.query('begin');
  try {
    if (plantAfter) await db.exec(plantAfter);
    /* every hero open in a client now (the frames' gate reads the stamp against this transaction's now()) */
    await db.query(`insert into public.character_presence (user_id, slot, seen_at) select user_id, slot, now() from public.player_state
                    on conflict (user_id, slot) do update set seen_at = excluded.seen_at`);
    const after = await snap();
    await db.query('savepoint sb4_w');
    const wroteAfter = await written();
    await db.query('rollback to savepoint sb4_w');
    const wroteAgain = await written();
    await db.query('rollback to savepoint sb4_w');
    for (const x of pre) await db.exec(x.ddl);
    const restored = (await db.query(`select count(*)::int n from pg_proc p join pg_language l on l.oid = p.prolang
       where p.oid in ('public.hr_hunt_limit(text)'::regprocedure, 'public.hr_jsonb_add(jsonb,jsonb)'::regprocedure) and l.lanname = 'sql'`)).rows[0].n === 2;
    const before = await snap();
    const wroteBefore = await written();
    const diffs = [...diffOf(before, after), ...diffOf(wroteBefore, wroteAfter)];
    const bytes = [...before, ...wroteBefore].reduce((n, [, v]) => n + (v ? v.length : 0), 0);
    const paid = (() => { try { const c = JSON.parse(wroteAfter[0][1]); return !!c && c.ok === true; } catch { return false; } })();
    return { compared: before.length + wroteBefore.length, bytes, diffs, restored, preImages: pre.length, heroes: heroes.length,
      sessions: sessions.length, tables: tables.length, paid, deterministic: diffOf(wroteAgain, wroteAfter).length === 0 };
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
  ok('SB-2', x.roleReads >= 8 && x.weaponPerRole <= 1, `${x.weaponPerRole} hr_hunt_weapon_of a role read over ${x.roleReads} role reads, index scans off (<= 1;`
    + ` ${x.weapon} a ${WINDOWS}-settle run)`);
  ok('SB-3', x.hot.length === 0, x.hot.length ? `SQL functions re-planned per call on PostgreSQL 17 (restate as plpgsql: tools/gen-plan-cache.mjs): ${x.hot.join(', ')}`
    : `no stable or immutable SQL function called by a watched settle (allowed: ${Object.keys(ALLOW).join(', ')})`);
  return red;
}

/** SB-4's verdict over parity()'s answer. */
function sameBytes(p) {
  return p.restored && p.preImages === PRE_IMAGES && p.diffs.length === 0 && p.heroes === 4 && p.sessions >= 4
    && p.paid && p.deterministic && p.tables >= 6;
}

/* The pre-image (a SQL copy) of one function the settle-cost files restate, under its public name: a mutant's plant. */
const backToSql = (name) => () => {
  const x = preImages().find((y) => y.name === name);
  if (!x) throw new Error(`settle-budget: no pre-image of ${name} in ${LANE_FILES.join(', ')}`);
  return x.ddl;
};

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
  /* the class pass 2 added: an IMMUTABLE helper, a SET-RETURNING one, and a section called once an envelope (5 a settle,
     under the old 7-call floor) */
  { name: 'immutableBackToSql', why: 'hr_jsonb_add (IMMUTABLE, 300 calls a settle) is SQL again', expect: 'SB-3', plant: backToSql('hr_jsonb_add') },
  { name: 'setofBackToSql', why: 'hr_unlock_levels (RETURNS TABLE) is SQL again', expect: 'SB-3', plant: backToSql('hr_unlock_levels') },
  { name: 'sectionBackToSql', why: 'hr_premium_view (once an envelope) is SQL again', expect: 'SB-3', plant: backToSql('hr_premium_view') },
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
    /* SB-4's mutants, planted after the files: a converted helper that answers one key differently (the hero's base HP:
       the reads move), and one the COMMIT runs that stamps a hunt's gold under another kind (only the written rows move). */
    const sb4Mutants = [
      ['helperAnswersMoved', 'a restated helper answers base HP + 1', `create or replace function public.hr_hunt_limit(p_key text) returns integer language plpgsql stable
      set search_path = public, pg_catalog as $m$ begin return (select value from public.hr_hunt_limits where key = p_key)
        + case when p_key = 'hp_base' then 1 else 0 end; end $m$;`, (d) => d.some((k) => !k.startsWith('rows ') && k !== 'commit')],
      /* the trigger stamps every gold row's kind with it: an allowed kind, so the commit lands and only its rows move */
      ['commitHelperMoved', 'the commit\'s gold-kind helper files hunt loot as a sale', () => {
        const ddl = backToSql('hr_gold_kind')();
        const moved = ddl.replace("when p_session is not null then 'hunt_loot'", "when p_session is not null then 'hunt_sale'");
        if (moved === ddl) throw new Error('settle-budget: the hr_gold_kind pre-image no longer files a session\'s gold as hunt_loot');
        return moved;
      }, (d) => d.length > 0 && d.every((k) => k.startsWith('rows ') || k === 'commit')],
    ];
    for (const [name, why, plant, named] of sb4Mutants) {
      const mx = await measure();
      const p = await parity(mx.db, mx.m, { plantAfter: typeof plant === 'function' ? plant() : plant });
      const sb4 = !sameBytes(p) && named(p.diffs);
      console.log(`  ${sb4 ? '✓' : '✗'} ${name} — SB-4 ${sb4 ? 'red' : 'SURVIVED'} (${why}): ${p.diffs.length} answers moved (${p.diffs.slice(0, 4).join(', ')})`);
      if (!sb4) bad++;
    }
    for (const mu of MUTANTS) {
      const x = await measure({ plant: typeof mu.plant === 'function' ? mu.plant() : (mu.plant || null), helloState: mu.helloState || null });
      const red = judge(x, src, false);
      const caught = red.includes(mu.expect) && !red.includes('CONTROL');
      console.log(`  ${caught ? '✓' : '✗'} ${mu.name} — ${mu.expect} ${caught ? 'red' : 'SURVIVED'} (${mu.why}); red: ${red.join(', ') || 'none'}`
        + ` [state_of ${x.stateOf}, weapon ${x.weapon}, hot ${x.hot.length}]`);
      if (!caught) bad++;
    }
    console.log(bad ? `\n✗ ${bad} mutant(s) survived` : `\n✓ ${MUTANTS.length + 3}/${MUTANTS.length + 3} mutants caught`);
    process.exit(bad ? 1 : 0);
  }
  console.log('\nsettle-budget: one watched 4-hero party, ' + WINDOWS + ' settles (tools/settle-cost.mjs --door=viewed, PGlite)');
  const x = await measure();
  const red = judge(x, src);
  const p = await parity(x.db, x.m);
  const same = sameBytes(p);
  if (!same) red.push('SB-4');
  console.log(`  ${same ? '✓' : '✗'} SB-4 — ${p.compared} answers (${p.bytes.toLocaleString('en-US')} bytes: envelopes, hr_load, engine inputs, `
    + `vitals, renown, hunt views of ${p.heroes} hunting heroes, and window ${SB4_WINDOW}'s commit with every row of the ${p.tables} tables it wrote)`
    + ` byte-identical before and after the settle-cost files (${p.preImages} pre-images restored)`
    + (p.paid ? '' : '; the window did not land') + (p.deterministic ? '' : '; CONTROL: the same window settled twice wrote different rows')
    + (p.diffs.length ? `; MOVED: ${p.diffs.slice(0, 6).join(', ')}` : '') + (p.restored ? '' : '; the pre-images did not land'));
  console.log(red.length ? `\n✗ settle-budget: ${red.join(', ')}` : '\n✓ settle-budget: every call budget holds');
  process.exit(red.length ? 1 : 0);
}
if (isMain(import.meta.url)) main().catch((e) => { console.error('settle-budget: ' + (e && e.stack || e)); process.exit(2); });
