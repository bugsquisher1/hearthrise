#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// tests/readonly-rpc.mjs — A CLIENT RPC DECLARED STABLE MUST SURVIVE A
//                          READ ONLY TRANSACTION, BECAUSE THAT IS HOW
//                          POSTGREST RUNS IT.
//
//   node tests/readonly-rpc.mjs             the guard
//   node tests/readonly-rpc.mjs --selftest  plant a STABLE function that writes
//                                           (must go RED), one that writes past
//                                           a refusal (must go RED) and one that
//                                           only reads (must stay GREEN)
//   node tests/readonly-rpc.mjs --mutate    put hr_party_view back to STABLE:
//                                           the migration's own §4 must refuse
//                                           the apply, and with that neutered
//                                           THIS guard must go RED
//
// ── THE FAILURE THIS EXISTS TO KILL (2026-09-26, live b553) ────────────────
// hr_party_view was declared `stable security definer` and its first act is
// hr_rpc_gate('party'), which writes public.hr_rate_counters. PostgREST opens a
// READ ONLY transaction for any STABLE or IMMUTABLE function, whatever the HTTP
// verb, so every live roster read answered 405 / SQLSTATE 25006 and the party
// panel painted "0 of 4" under a leader it could not list. The migration's §4
// block called the view from a normal transaction and the in-page tests stub a
// server-shaped answer: nothing in the repo ever ran it the way PostgREST does.
//
// ── THE CLASS, AND HOW THIS FILE FINDS IT ───────────────────────────────────
// Every public function that is (a) recorded in public.hr_client_rpc_baseline
// or (b) EXECUTE-able by `anon` or `authenticated` on the full replay chain,
// AND is declared STABLE or IMMUTABLE. Derived from the catalogue on every run,
// never hand-listed: the function that falls off a hand list is the next one.
// Each member is called as a seeded, signed-in player, as `authenticated`,
// inside BEGIN; SET TRANSACTION READ ONLY; … ROLLBACK — and the guard is RED on
// 25006 (a write) or on any other error the same call does not raise in a
// normal transaction. A clean call in both is GREEN.
//
// Measured 2026-09-26 on next 10936397: the class had ONE member, hr_party_view,
// and it wrote. 2026-09-26-party-view-volatile.sql declares it VOLATILE, so
// the class is now empty and this guard's plain run proves it stays that way
// — or, when someone adds a genuinely read-only STABLE RPC, proves that it is.
//
// Also P-IDEM: 2026-09-26-party-view-volatile.sql re-applies as a no-op — the
// schema inventory AND every public function's provolatile are identical
// before and after a second apply (the inventory alone is signature-level and
// cannot see a volatility flip).
//
// Exit: 0 green · 1 a failed arm · 2 a harness problem.
// ════════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { bootReplay, inventory, ROOT } from './schema-replay.mjs';

const ARGS = process.argv.slice(2);
const SELFTEST = ARGS.includes('--selftest');
const MUTATE = ARGS.includes('--mutate');

const FILE = '2026-09-26-party-view-volatile.sql';
const UID = '00000000-0000-4000-8000-0000b8260101';

// The one-line regression, planted in a COPY of the chain text (patches), never
// in the tracked file.
const BACK_TO_STABLE = [
  'alter function public.hr_party_view(uuid) volatile;',
  'alter function public.hr_party_view(uuid) stable;',
];
// Stage 2 of --mutate: with only BACK_TO_STABLE planted the file's own §4
// GATE(a) refuses the apply. To show THIS guard bites on its own (and is not
// riding on an apply-time gate that nothing re-runs), the self-check is
// disabled at its first line so the mutant reaches the arms below.
const NEUTER_SELFCHECK = [
  'begin\n  -- (a) THE DECLARATION.',
  'begin\n  return;   -- tests/readonly-rpc.mjs --mutate stage 2\n  -- (a) THE DECLARATION.',
];

// The selftest's two planted functions. Both are granted to `authenticated`
// and neither is in the baseline, so they also prove arm (b) of the discovery.
// The writer writes TRANSITIVELY through a volatile helper, which is the live
// shape (hr_party_view → hr_rpc_gate): a direct INSERT in a STABLE plpgsql body
// is refused by Postgres everywhere (0A000) and is judged RED separately.
const PLANT_WRITER = 'hr_ro_probe_writer';
const PLANT_READER = 'hr_ro_probe_reader';
// RO-1: writes only past an argument check the synthesised 0 fails, the shape
// hr_party_view has (it refuses a caller before its gate). Must be judged RED.
const PLANT_GATED = 'hr_ro_probe_gated';
const PLANTS = `
  create function public.${PLANT_WRITER}__meter() returns void language sql volatile security definer
  set search_path = public, pg_catalog as $p$
    insert into public.hr_rate_counters (user_id, bucket, n) values (auth.uid(), 'ro_probe', 1)
      on conflict (user_id, bucket) do update set n = public.hr_rate_counters.n + 1
  $p$;
  revoke execute on function public.${PLANT_WRITER}__meter() from public;
  create function public.${PLANT_WRITER}() returns jsonb language plpgsql stable security definer
  set search_path = public, pg_catalog as $p$
  begin
    perform public.${PLANT_WRITER}__meter();
    return jsonb_build_object('ok', true);
  end $p$;
  create function public.${PLANT_READER}() returns jsonb language sql stable security definer
  set search_path = public, pg_catalog as $p$
    select jsonb_build_object('ok', true, 'slots', (select count(*) from public.player_state where user_id = auth.uid()))
  $p$;
  create function public.${PLANT_GATED}(p_n int) returns jsonb language plpgsql stable security definer
  set search_path = public, pg_catalog as $p$
  begin
    if p_n <= 0 then return jsonb_build_object('ok', false, 'error', 'bad_n'); end if;
    perform public.${PLANT_WRITER}__meter();
    return jsonb_build_object('ok', true);
  end $p$;
  revoke execute on function public.${PLANT_WRITER}(), public.${PLANT_READER}(), public.${PLANT_GATED}(int) from public;
  grant execute on function public.${PLANT_WRITER}(), public.${PLANT_READER}(), public.${PLANT_GATED}(int) to authenticated;`;

const problems = [];
const judge = (id, pass, good, bad) => {
  if (pass) console.log(`  ✓ ${id} — ${good}`);
  else { console.log(`  ✗ ${id} — ${bad}`); problems.push(id); }
};
const harness = (msg) => { const e = new Error(msg); e.harness = true; return e; };

// ── ONE CALL, TWO TRANSACTIONS ─────────────────────────────────────────────
// Returns { sqlstate, message, value } for the call made exactly as PostgREST
// makes it for a non-volatile function (readOnly) or for a volatile one.
async function callAs(db, sig, argSql, readOnly) {
  // The rate bucket would answer rate_limited on a busy seed; clear it so the
  // call reaches its whole body. hr_rate_counters is operational bookkeeping
  // in a throwaway in-process database.
  await db.exec('delete from public.hr_rate_counters;');
  await db.exec(`begin;${readOnly ? ' set transaction read only;' : ''}`);
  try {
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [UID]);
    await db.exec('set local role authenticated;');
    const r = await db.query(`select public.${sig}(${argSql}) as r`);
    return { sqlstate: null, value: r.rows[0]?.r };
  } catch (e) {
    return { sqlstate: e.code || 'XX000', message: String(e.message).split('\n')[0] };
  } finally {
    await db.exec('rollback;');
  }
}

// ── ARGUMENTS ──────────────────────────────────────────────────────────────
// A call that is refused on its arguments can return before the write it would
// make, so a member that needs meaningful arguments gets them here. Anything
// else is synthesised per type; a type with no synthetic value is a HARNESS
// error — silently skipping a member is the failure this file exists over.
const OVERRIDE = {
  hr_party_view: (seed) => `'${seed.party}'::uuid`,
};
const SYNTH = {
  uuid: (seed) => `'${seed.party}'::uuid`,
  integer: () => '0', smallint: () => '0::smallint', bigint: () => '0::bigint',
  numeric: () => '0::numeric', text: () => "''", boolean: () => 'false',
  jsonb: () => "'{}'::jsonb", json: () => "'{}'::json",
  'timestamp with time zone': () => 'now()', date: () => 'current_date',
};
async function argsFor(db, oid, name, seed) {
  if (OVERRIDE[name]) return OVERRIDE[name](seed);
  const t = (await db.query(
    'select coalesce(array(select format_type(x, null) from unnest(p.proargtypes::oid[]) x), \'{}\') as t '
    + 'from pg_proc p where p.oid = $1', [oid])).rows[0].t;
  return t.map((ty) => {
    if (!SYNTH[ty]) throw harness(`${name}: no synthetic value for an argument of type ${ty} — add an OVERRIDE`);
    return SYNTH[ty](seed);
  }).join(', ');
}

// ── THE CLASS ──────────────────────────────────────────────────────────────
async function theClass(db) {
  return (await db.query(`
    select p.oid, p.proname, p.oid::regprocedure::text as sig, p.provolatile::text as vol,
           exists (select 1 from public.hr_client_rpc_baseline b
                    where b.proname = p.proname
                      and b.identity_args = pg_get_function_identity_arguments(p.oid)) as baselined
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f' and p.provolatile in ('s','i')
       and (has_function_privilege('authenticated', p.oid, 'execute')
         or has_function_privilege('anon', p.oid, 'execute')
         or exists (select 1 from public.hr_client_rpc_baseline b
                     where b.proname = p.proname
                       and b.identity_args = pg_get_function_identity_arguments(p.oid)))
     order by p.proname`)).rows;
}

// Sweep the class; returns the list of members that are NOT read-only.
async function sweep(db, seed, label) {
  const members = await theClass(db);
  console.log(`  ${label}: ${members.length} client-callable STABLE/IMMUTABLE function(s)`
    + (members.length ? '' : ' — the class is empty'));
  const bad = [];
  for (const m of members) {
    const a = await argsFor(db, m.oid, m.proname, seed);
    const rw = await callAs(db, m.proname, a, false);
    const ro = await callAs(db, m.proname, a, true);
    const tag = `${m.sig} [${m.vol === 's' ? 'STABLE' : 'IMMUTABLE'}${m.baselined ? ', baselined' : ', granted'}]`;
    if (rw.sqlstate === '0A000') {
      console.log(`      ✗ ${tag} writes DIRECTLY — refused 0A000 even read-write: "${rw.message}"`);
      bad.push(m.proname);
    } else if (ro.sqlstate === '25006') {
      console.log(`      ✗ ${tag} WRITES — read only it raised 25006 "${ro.message}"`);
      bad.push(m.proname);
    } else if (ro.sqlstate && rw.sqlstate === ro.sqlstate) {
      throw harness(`${tag} raises ${ro.sqlstate} in BOTH transactions ("${ro.message}") — the synthesised call is `
        + 'refused on its arguments and proves nothing; add an OVERRIDE');
    } else if (ro.sqlstate) {
      console.log(`      ✗ ${tag} raised ${ro.sqlstate} read only and not read-write — "${ro.message}"`);
      bad.push(m.proname);
    } else if (rw.value && typeof rw.value === 'object' && rw.value.ok === false) {
      // A REFUSAL IS NOT A PASS (Security 2026-09-26, RO-1): a body that answers
      // {ok:false} on the synthesised arguments may return before the write it
      // would make for a real caller, so a clean read-only call proves nothing.
      console.log(`      ✗ ${tag} REFUSED the synthesised call (${JSON.stringify(rw.value).slice(0, 60)}) — `
        + 'it never reached its body; add an OVERRIDE that it accepts');
      bad.push(m.proname);
    } else {
      console.log(`      ✓ ${tag} read-only clean → ${JSON.stringify(ro.value).slice(0, 80)}`);
    }
  }
  return { members, bad };
}

async function seedPlayer(db) {
  await db.exec(`insert into auth.users (id) values ('${UID}') on conflict do nothing;`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [UID]);
  const made = (await db.query('select public.hr_create_character(0) as r')).rows[0].r;
  if (String(made?.created ?? made?.ok) !== 'true') throw harness(`no seeded character: ${JSON.stringify(made)}`);
  await db.exec('delete from public.hr_rate_counters;');
  const p = (await db.query('select public.hr_party_create(0, gen_random_uuid()) as r')).rows[0].r;
  if (p?.ok !== true) throw harness(`hr_party_create refused the seed: ${JSON.stringify(p)}`);
  await db.query("select set_config('request.jwt.claim.sub', '', false)");
  return { party: p.party_id };
}

async function boot(patches) {
  const r = await bootReplay({ patches });
  if (r.failures.length) {
    await r.db.close();
    return { failure: r.failures[0] };
  }
  return { db: r.db };
}

const volatility = async (db) => (await db.query(
  "select string_agg(p.oid::regprocedure::text || '=' || p.provolatile::text, ',' order by 1) as v "
  + "from pg_proc p where p.pronamespace = 'public'::regnamespace")).rows[0].v;

console.log('readonly-rpc: every client-callable STABLE/IMMUTABLE function, called READ ONLY as PostgREST does'
  + (SELFTEST ? '  [--selftest]' : '') + (MUTATE ? '  [--mutate]' : ''));

try {
  if (MUTATE) {
    // ── STAGE 1: the regression alone is refused by the APPLY ────────────
    console.log('\nM1  hr_party_view back to STABLE is refused by the migration\'s own §4');
    let failed = null;
    try {
      const b = await boot(new Map([[FILE, [BACK_TO_STABLE]]]));
      failed = b.failure ? { file: b.failure.file,
        error: String(b.failure.error).split('\n').find((l) => l.includes('GATE(')) || String(b.failure.error) } : null;
      if (b.db) await b.db.close();
    } catch (e) {
      if (e.harness) throw e;
      const m = String(e.message);
      failed = { file: m.includes(FILE) ? FILE : '?', error: m.split('\n').find((l) => l.includes('GATE(')) || m };
    }
    judge('M1', !!failed && failed.file === FILE && /GATE\(a\)/.test(failed.error || ''),
      `the apply refused — "${String(failed?.error || '').slice(0, 90)}…"`,
      `the STABLE mutant applied, or failed elsewhere: ${JSON.stringify(failed)}`);

    // ── STAGE 2: with the §4 neutered, THIS guard must be what catches it ──
    console.log('\nM2  …and with that self-check disabled, the sweep goes RED on hr_party_view');
    const b = await boot(new Map([[FILE, [BACK_TO_STABLE, NEUTER_SELFCHECK]]]));
    if (b.failure) throw harness(`stage-2 replay did not complete: ${JSON.stringify(b.failure)}`);
    const seed = await seedPlayer(b.db);
    const { bad } = await sweep(b.db, seed, 'mutant chain');
    await b.db.close();
    judge('M2', bad.includes('hr_party_view'),
      'the sweep caught hr_party_view writing under READ ONLY (25006) — the live b553 failure, reproduced',
      `the sweep did not flag hr_party_view: ${JSON.stringify(bad)}`);
  } else {
    const b = await boot(undefined);
    if (b.failure) throw harness(`the schema replay did not complete: ${JSON.stringify(b.failure)}`);
    const db = b.db;
    const seed = await seedPlayer(db);

    // ── A FLOOR: the real chain is green (run before any plant) ────────────
    console.log('\nRO  the real chain');
    const clean = await sweep(db, seed, 'real chain');
    judge('RO', clean.bad.length === 0,
      `no client-callable STABLE/IMMUTABLE function writes (${clean.members.length} member(s))`,
      `these are declared read-only and are NOT: ${clean.bad.join(', ')} — declare them VOLATILE`);
    const pv = (await db.query(
      "select provolatile::text v from pg_proc where oid = to_regprocedure('public.hr_party_view(uuid)')")).rows[0]?.v;
    judge('PV', pv === 'v', 'hr_party_view is VOLATILE — PostgREST gives it a writable transaction',
      `hr_party_view is provolatile=${pv}`);

    if (SELFTEST) {
      console.log('\nS1-S3  plant two STABLE writers and a STABLE reader, all granted to authenticated');
      await db.exec(PLANTS);
      const planted = await sweep(db, seed, 'planted chain');
      const names = planted.members.map((m) => m.proname);
      judge('S0', [PLANT_WRITER, PLANT_READER, PLANT_GATED].every((n) => names.includes(n)),
        'discovery found all three plants by GRANT alone (none is baselined)',
        `discovery missed a plant: ${JSON.stringify(names)}`);
      judge('S1', planted.bad.includes(PLANT_WRITER),
        `the STABLE writer went RED — ${PLANT_WRITER} caught on 25006`,
        `the STABLE writer was NOT caught: ${JSON.stringify(planted.bad)}`);
      judge('S2', !planted.bad.includes(PLANT_READER),
        'the STABLE reader stayed GREEN — the guard does not accuse a function that only reads',
        `the STABLE reader was accused: ${JSON.stringify(planted.bad)}`);
      judge('S3', planted.bad.includes(PLANT_GATED),
        `a STABLE writer that REFUSED the synthesised call went RED — ${PLANT_GATED} was not passed on its refusal`,
        `a refused call was judged read-only clean: ${JSON.stringify(planted.bad)}`);
    } else {
      // ── P-IDEM: the file re-applies as a byte-identical no-op ────────────
      console.log('\nP-IDEM  ' + FILE + ' re-applied onto the full chain');
      const before = JSON.stringify(await inventory(db)) + (await volatility(db));
      const sql = (await readFile(join(ROOT, 'supabase', 'migrations', FILE), 'utf8')).replace(/\r\n/g, '\n');
      let err = null;
      try { await db.exec(sql); } catch (e) { err = String(e.message).split('\n')[0]; }
      const after = err ? null : JSON.stringify(await inventory(db)) + (await volatility(db));
      judge('P-IDEM', !err && before === after,
        'second apply passed its §4 again and left the inventory and every provolatile byte-identical',
        err ? `the second apply FAILED: ${err}` : 'the second apply changed the schema or a volatility');
    }
    await db.close();
  }
} catch (e) {
  console.error(`\nreadonly-rpc: HARNESS — ${e.message}`);
  process.exit(2);
}

if (problems.length) {
  console.log(`\nreadonly-rpc: RED — ${problems.join(', ')}`);
  process.exit(1);
}
console.log(`\nreadonly-rpc: GREEN${MUTATE ? ' — every mutation caught' : SELFTEST ? ' — every plant judged correctly' : ''}`);
