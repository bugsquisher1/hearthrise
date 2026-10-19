#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/rpc-execute-surface.mjs — WHO CAN EXECUTE WHAT, PINNED.
//
//   node tests/rpc-execute-surface.mjs             the guard (credential-free, CI)
//   node tests/rpc-execute-surface.mjs --selftest  every planted defect must be caught
//   node tests/rpc-execute-surface.mjs --write     re-pin after a REVIEWED surface change
//
// mutant-anchors: supabase/migrations/2026-10-28-reopen-rpc-sweep.sql
//
// ── THE FAILURE THIS KILLS (Security review, 2026-10-19) ─────────────────────
// hr_claim_rank paid up to 1,000,000 gold per character by a direct update,
// outside hr_apply, to any `authenticated` caller — and the rebuilt client had
// never called it. Nine more claim RPCs sat in the same state. Grant hygiene was
// green throughout, because hr_assert_grant_hygiene asks "is every client RPC
// APPROVED?", and an approval row is one `insert` in the same file as the grant.
// It cannot tell a reviewed surface from a forgotten one. This guard can: after
// the WHOLE chain replays, the set of functions each outside role can execute
// must EQUAL a committed list, so every widening AND every loss is a reviewable
// diff in tests/rpc-execute-surface.baseline.json.
//
// ── THE ARMS ────────────────────────────────────────────────────────────────
//   S1 surface    per role (anon, authenticated, hr_engine, hr_tick), the live
//                 executable set == the pinned set. Extra and missing both red.
//   S2 baseline   anon + authenticated: the executable set == hr_client_rpc_baseline,
//                 both directions (an approval with no grant is a broken feature;
//                 a grant with no approval is grant hygiene's red, asked again).
//   S3 retired    no function named in RETIRED exists at all, whatever the pin
//                 says — `--write` cannot re-admit a retired money claim.
//   S4 re-apply   2026-10-28-reopen-rpc-sweep.sql applied a SECOND time leaves the
//                 surface and hr_rpc_gate's body byte-identical.
//
// Exit: 0 green · 1 red · 2 harness problem.
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, LAST_PATCHED, ROOT } from './schema-replay.mjs';
import { isMain } from './_is-main.mjs';

const FIX = '2026-10-28-reopen-rpc-sweep.sql';
const PIN = join(ROOT, 'tests', 'rpc-execute-surface.baseline.json');
const ROLES = ['anon', 'authenticated', 'hr_engine', 'hr_tick'];

/* Retired with 2026-10-28-reopen-rpc-sweep.sql (wrapper AND __ungated body).
   Bringing one back is a design decision that edits THIS list, in review. */
const RETIRED = [
  'hr_claim_rank', 'hr_claim_milestone', 'hr_claim_quest', 'hr_claim_daily',
  'raid_claim', 'world_event_claim', 'world_event_absence_claim',
  'world_event_pledge', 'world_event_pledge_settle', 'hr_buy_gem_unlock',
];

async function measure(db) {
  const q = async (s, p) => (await db.query(s, p)).rows;
  const surface = {};
  for (const role of ROLES) {
    surface[role] = (await q(
      `select p.oid::regprocedure::text as sig from pg_proc p
        where p.pronamespace = 'public'::regnamespace and p.prokind in ('f','p')
          and exists (select 1 from pg_roles where rolname = $1)
          and has_function_privilege($1, p.oid, 'execute')
        order by 1`, [role])).map((r) => r.sig);
  }
  const live = (await q(
    `select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') -> ' || g.r as k
       from pg_proc p cross join (values ('anon'), ('authenticated')) g(r)
      where p.pronamespace = 'public'::regnamespace and p.prokind in ('f','p')
        and has_function_privilege(g.r, p.oid, 'execute')`)).map((r) => r.k);
  const approved = (await q(
    `select proname || '(' || identity_args || ') -> ' || grantee as k from public.hr_client_rpc_baseline`)).map((r) => r.k);
  const retired = (await q(
    `select p.oid::regprocedure::text as sig from pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and regexp_replace(p.proname, '__ungated$', '') = any ($1::text[]) order by 1`, [RETIRED])).map((r) => r.sig);
  const gate = (await q(`select md5(prosrc) as m from pg_proc where oid = 'public.hr_rpc_gate(text)'::regprocedure`))[0]?.m;
  return { surface, live, approved, retired, gate };
}

const diff = (a, b) => a.filter((x) => !b.includes(x));

async function run({ patches = null } = {}) {
  const problems = [];
  const add = (arm, msg) => problems.push({ arm, msg });
  let db;
  try {
    ({ db } = await bootReplay(patches ? { patches: new Map([[FIX, patches]]), upTo: LAST_PATCHED } : {}));
  } catch (e) {
    if (e.harness) throw e;
    return { chainError: String(e.message || e), problems, m: null };
  }
  const m = await measure(db);
  const pin = JSON.parse(await readFile(PIN, 'utf8'));

  for (const role of ROLES) {
    const want = pin.surface[role] || [];
    const extra = diff(m.surface[role], want);
    const missing = diff(want, m.surface[role]);
    if (extra.length) add('S1', `${role} can execute ${extra.length} UNPINNED function(s): ${extra.join(', ')}`);
    if (missing.length) add('S1', `${role} LOST ${missing.length} pinned function(s): ${missing.join(', ')}`);
  }
  const unapproved = diff(m.live, m.approved);
  const lost = diff(m.approved, m.live);
  if (unapproved.length) add('S2', `executable but not in hr_client_rpc_baseline: ${unapproved.join(', ')}`);
  if (lost.length) add('S2', `hr_client_rpc_baseline approves what nobody can execute: ${lost.join(', ')}`);
  if (m.retired.length) add('S3', `a retired money claim exists again: ${m.retired.join(', ')}`);

  if (!patches) {
    const src = (await readFile(join(ROOT, 'supabase', 'migrations', FIX), 'utf8')).replace(/\r\n/g, '\n');
    try {
      await db.exec(`begin;\n${src}\ncommit;`);
      const again = await measure(db);
      if (JSON.stringify(again) !== JSON.stringify(m)) add('S4', `${FIX} applied twice changes the surface or hr_rpc_gate`);
    } catch (e) {
      add('S4', `${FIX} refuses a second apply: ${String(e.message || e).split('\n')[0]}`);
    }
  }
  await db.close?.();
  return { chainError: null, problems, m };
}

// ── THE PLANTED DEFECTS ──────────────────────────────────────────────────────
// Each is appended AFTER the migration's own §4, i.e. it models a LATER file —
// the shape no self-check of 2026-10-28 can see. Every one keeps grant hygiene
// quiet (each grant comes with its approval row, or rides c_engine_allow), so a
// catch here is THIS guard's, not hygiene's.
const ANCHOR = "  raise notice 'reopen-rpc-sweep: 10 dormant claims dropped, 3 market writers unreachable, gate restated; all green';\nend $$;\n";
const after = (sql) => [[ANCHOR, `${ANCHOR}\n${sql}\n`]];
const MUTATIONS = [
  {
    name: 'regrant-dropped-claim',
    why: 'hr_claim_rank comes back, gated and approved, granted to authenticated — the BLOCKER this file closed.',
    patches: after(`create function public.hr_claim_rank(p_rank_id text, p_slot integer) returns jsonb
  language plpgsql security definer set search_path = public, pg_catalog as $f$
begin perform public.hr_rpc_gate('hr_claim_goal'); return '{}'::jsonb; end $f$;
revoke execute on function public.hr_claim_rank(text, integer) from public, anon;
grant execute on function public.hr_claim_rank(text, integer) to authenticated;
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note)
  values ('hr_claim_rank', 'p_rank_id text, p_slot integer', 'authenticated', 'mutant');`),
    expect: ['S1', 'S3'],
  },
  {
    name: 'engine-market-regrant',
    why: 'hr_market_buy is granted back to hr_engine; c_engine_allow still lists it, so hygiene is quiet.',
    patches: after('grant execute on function public.hr_market_buy(uuid, integer, bigint, uuid, uuid, bigint) to hr_engine;'),
    expect: ['S1'],
  },
  {
    name: 'anon-widened',
    why: 'an anon grant arrives with its approval row in the same file.',
    patches: after(`grant execute on function public.hr_server_now() to anon;
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values ('hr_server_now', '', 'anon', 'mutant');`),
    expect: ['S1'],
  },
  {
    name: 'client-rpc-lost',
    why: 'a live client verb loses its grant — a broken feature, not a hole, but still a surface change.',
    patches: after('revoke execute on function public.hr_stamina_refill(integer, bigint, uuid) from authenticated;'),
    expect: ['S1', 'S2'],
  },
];

async function selftest() {
  const clean = await run();
  if (clean.chainError || clean.problems.length) {
    console.error('rpc-execute-surface --selftest: the CLEAN arm is not green, so no catch below would mean anything');
    for (const p of clean.problems) console.error(`  x ${p.arm}: ${p.msg}`);
    if (clean.chainError) console.error(`  x chain: ${clean.chainError.split('\n')[0]}`);
    return 1;
  }
  console.log('CLEAN   the unpatched chain is green on S1-S4');
  let missed = 0;
  for (const mu of MUTATIONS) {
    const r = await run({ patches: mu.patches });
    const arms = [...new Set(r.problems.map((p) => p.arm))];
    const ok = !r.chainError && mu.expect.every((a) => arms.includes(a));
    if (ok) console.log(`CAUGHT  ${mu.name} by ${arms.join('+')}\n          ${r.problems[0].msg.slice(0, 160)}`);
    else {
      missed += 1;
      console.error(`MISSED  ${mu.name} (expected ${mu.expect.join('+')}; got ${r.chainError ? `chain refusal: ${r.chainError.split('\n')[0]}` : arms.join('+') || 'nothing'})\n          ${mu.why}`);
    }
  }
  if (missed) { console.error(`\n${missed} of ${MUTATIONS.length} planted defects were NOT caught.`); return 1; }
  console.log(`\nall ${MUTATIONS.length} planted defects caught by the arm meant to see each.`);
  return 0;
}

async function write() {
  const { db } = await bootReplay({});
  const m = await measure(db);
  await db.close?.();
  if (m.retired.length) { console.error(`refusing to pin: retired claims exist (${m.retired.join(', ')})`); return 1; }
  const out = {
    _readme: 'The reviewed EXECUTE surface of every outside role after the full replay. tests/rpc-execute-surface.mjs '
      + 'requires the live set to EQUAL this list. Re-pin with --write ONLY after the change is reviewed (CLAUDE.md §2); '
      + 'the diff of this file IS the review artefact.',
    surface: m.surface,
  };
  await writeFile(PIN, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`pinned ${ROLES.map((r) => `${r} ${m.surface[r].length}`).join(', ')}`);
  return 0;
}

export async function rpcExecuteSurfaceGuard() {
  const r = await run();
  if (r.chainError) return [`chain: ${r.chainError.split('\n')[0]}`];
  return r.problems.map((p) => `${p.arm}: ${p.msg}`);
}

if (isMain(import.meta.url)) {
  try {
    if (process.argv.includes('--selftest')) process.exit(await selftest());
    if (process.argv.includes('--write')) process.exit(await write());
    const found = await rpcExecuteSurfaceGuard();
    if (found.length) {
      console.error(`rpc-execute-surface: ${found.length} problem(s)`);
      for (const f of found) console.error(`  x ${f}`);
      process.exit(1);
    }
    console.log(`rpc-execute-surface: green — ${ROLES.join(', ')} execute exactly the pinned set; `
      + 'hr_client_rpc_baseline matches both ways; no retired claim exists; the sweep re-applies byte-identically.');
  } catch (e) {
    console.error(`rpc-execute-surface: harness problem — ${e.stack || e}`);
    process.exit(2);
  }
}
