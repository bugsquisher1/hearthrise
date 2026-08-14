#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/leaderboard-lockdown-guard.mjs
//
// MUTATION PROOF for supabase/migrations/2026-08-14-leaderboard-view-lockdown.sql
// (F5's other half), on real PostgreSQL 18 in WASM — PGlite, in process, no
// Docker, no credentials, production untouched.
//
// It does NOT hand-build a fixture schema. It replays the WHOLE repo through
// tests/schema-replay.mjs (schema.sql + every file in the declared apply order)
// and then applies the staged file on top, because the thing under test is a
// narrowing of objects that only exist at the end of that chain: the A9
// __ungated wrapper over hr_leaderboard, hr_rate_ok's counter table,
// hr_assert_grant_hygiene's differential baseline, and the ten-column
// clan_leaderboard that 2026-08-11-clan-browser-door.sql leaves behind. A
// bespoke fixture would have tested a schema nobody runs.
//
// The shape every assertion obeys:
//   BEFORE   the exposure is REPRODUCED as role `anon` with no JWT. If it does
//            not reproduce, the run FAILS as a harness problem — a guard that
//            is never shown the hole it closes is decoration.
//   AFTER    the same read is REFUSED, with the specific SQLSTATE.
//   CONTROL  beside every refusal, the legitimate path that must still work. A
//            migration that revoked everything would otherwise pass the file.
//
//   node tests/leaderboard-lockdown-guard.mjs
//
// Exit codes: 0 = clean · 1 = an assertion failed · 2 = harness problem.
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, bootReplay } from './schema-replay.mjs';

const TARGET = join(ROOT, 'supabase', 'migrations', '2026-08-14-leaderboard-view-lockdown.sql');
const LF = (s) => s.replace(/\r\n/g, '\n');

let failures = 0;
const pass = (m) => process.stdout.write(`  ok    ${m}\n`);
const fail = (m) => { failures++; process.stderr.write(`  FAIL  ${m}\n`); };
const harness = (m) => { process.stderr.write(`HARNESS: ${m}\n`); process.exit(2); };

const target = LF(await readFile(TARGET, 'utf8'));

const UID   = '00000000-0000-4000-a000-000000000001';
const OTHER = '00000000-0000-4000-a000-000000000002';
const CLAN  = '00000000-0000-4000-b000-000000000001';

/**
 * A fully replayed database with two players, one clan and a refreshed board.
 * Everything here is DATA, not schema — the schema is whatever the repo builds.
 */
async function build() {
  const { db } = await bootReplay();
  await db.exec(`
    insert into auth.users (id) values ('${UID}'), ('${OTHER}') on conflict do nothing;
    insert into public.profiles (id, display_name) values ('${UID}','Aldric'), ('${OTHER}','Bryn')
      on conflict (id) do update set display_name = excluded.display_name;
    -- total_level is a GENERATED column off snapshot->>'totalLevel'; it cannot
    -- be supplied, and that is the shape production has.
    insert into public.game_saves (user_id, slot, snapshot, saved_at) values
      ('${UID}',   0, '{"gold": 123456, "combatLevel": 71, "totalLevel": 812, "renown": 40}'::jsonb, now()),
      ('${OTHER}', 0, '{"gold": 999,    "combatLevel": 12, "totalLevel": 130, "renown": 3}'::jsonb,  now())
      on conflict do nothing;
    insert into public.clans (id, name, created_by, level, treasury, castle_tier)
      values ('${CLAN}', 'Ashfell', '${UID}', 4, 50000, 2) on conflict do nothing;
    update public.profiles set clan_id = '${CLAN}' where id in ('${UID}','${OTHER}');
    insert into public.clan_members (clan_id, user_id, role)
      values ('${CLAN}','${UID}','leader'), ('${CLAN}','${OTHER}','member')
      on conflict do nothing;
    select public.hr_leaderboard_refresh(true);
  `);
  return db;
}

const attempt = async (db, sql) => {
  try { await db.exec(sql); return { ok: true }; }
  catch (e) {
    const code = e.code || (e.cause && e.cause.code)
      || String(e.message).match(/\b([0-9A-Z]{5})\b/)?.[1];
    return { ok: false, code, message: String(e.message) };
  }
};
const one = async (db, sql) => (await db.query(sql)).rows[0];

/* Run as a REAL client role, then always come back. The catalogue view of a
   grant and the answer a role actually gets are different questions, and only
   the second one is the finding — a privilege can be held through a role
   membership a role_table_grants query does not follow. PGlite's `query`
   refuses multiple statements, so the role change is its own `exec`. */
async function asRole(db, role, sql) {
  await db.exec(`set role ${role}`);
  const r = await attempt(db, sql);
  await db.exec('reset role').catch(() => {});
  return r;
}
async function oneAsRole(db, role, sql) {
  await db.exec(`set role ${role}`);
  try { return (await db.query(sql)).rows[0]; }
  finally { await db.exec('reset role').catch(() => {}); }
}

let db;
try { db = await build(); }
catch (e) {
  harness(`could not replay the repo: ${String(e && e.message || e).split('\n').slice(0, 3).join(' | ')}`);
}
pass('chain replayed: schema.sql + every migration in the declared apply order, then 2 players + 1 clan seeded');

// ════════════════════════════════════════════════════════════════════════
// BEFORE — F5 must REPRODUCE, or nothing below means anything
// ════════════════════════════════════════════════════════════════════════
process.stdout.write('── BEFORE: an unauthenticated caller reads the game\n');
{
  await db.exec(`select set_config('request.jwt.claim.sub','',false)`);

  // The control that proves the probe can see a refusal: RLS on game_saves DOES
  // hold for anon. Without this line, "the views leak" and "anon can read
  // everything anyway" would be indistinguishable.
  const direct = await asRole(db, 'anon', `select * from public.game_saves`);
  if (direct.ok) {
    const n = await oneAsRole(db, 'anon', `select count(*)::int n from public.game_saves`);
    if (Number(n.n) !== 0) harness(`anon read ${n.n} game_saves rows directly — RLS is not holding in the fixture, so the views prove nothing`);
    pass('CONTROL: anon reads 0 rows from game_saves directly — RLS holds');
  } else {
    pass(`CONTROL: anon cannot read game_saves at all (${direct.code}) — RLS holds`);
  }

  for (const [rel, why] of [
    ['leaderboard', 'every player uuid, name, gold and level'],
    ['clan_leaderboard', 'every hold, its treasury and its door policy'],
    ['leaderboard_ranked', 'the precomputed board, which makes hr_leaderboard\'s p_limit clamp decorative'],
  ]) {
    const r = await asRole(db, 'anon', `select 1 from public.${rel} limit 1`);
    if (!r.ok) harness(`F5 did not reproduce: anon could not read public.${rel} (${r.code}) — the fixture is wrong, not the finding`);
    const n = await oneAsRole(db, 'anon', `select count(*)::int n from public.${rel}`);
    if (Number(n.n) < 1) harness(`F5 did not reproduce: public.${rel} returned 0 rows to anon`);
    pass(`F5 reproduces: anon read ${n.n} row(s) from public.${rel} — ${why}`);
  }

  // …and the p_limit clamp really is decorative while that is true.
  const wide = await oneAsRole(db, 'anon',
    `select count(*)::int n from public.leaderboard_ranked where board='total_level'`);
  pass(`F5 reproduces: anon can page the whole matview (${wide.n} total_level rows) around hr_leaderboard's p_limit <= 100`);
}

// ════════════════════════════════════════════════════════════════════════
// APPLY
// ════════════════════════════════════════════════════════════════════════
{
  const r = await attempt(db, `begin;\n${target}\ncommit;`);
  if (!r.ok) {
    await db.exec('rollback').catch(() => {});
    fail(`the migration REFUSED TO APPLY: ${r.code || ''} ${r.message}`);
    process.stderr.write('\nleaderboard-lockdown-guard: FAILED at apply\n');
    process.exit(1);
  }
  pass('migration applied, §5 self-verification passed');
}

// ════════════════════════════════════════════════════════════════════════
// AFTER — refused, each with a control
// ════════════════════════════════════════════════════════════════════════
process.stdout.write('── AFTER: refused, with controls\n');

for (const rel of ['leaderboard', 'clan_leaderboard']) {
  const gone = await one(db, `select to_regclass('public.${rel}') is null as gone`);
  if (!gone.gone) fail(`F5 OPEN: public.${rel} still exists`);
  else pass(`F5 CLOSED: public.${rel} is gone`);
}

for (const role of ['anon', 'authenticated']) {
  const r = await asRole(db, role, `select 1 from public.leaderboard_ranked limit 1`);
  if (r.ok) fail(`F5 OPEN: role ${role} still reads leaderboard_ranked directly`);
  else if (r.code !== '42501') fail(`${role}'s matview read failed with ${r.code}, expected 42501 — a wrong error is not a guard`);
  else pass(`F5 CLOSED: role ${role} reading leaderboard_ranked is refused 42501`);
}

// CONTROL for both of the above: the boards still answer through the RPC, and
// they answer with the seeded player. A revoke that broke the leaderboards
// would be indistinguishable from one that worked without this.
{
  await db.exec(`select set_config('request.jwt.claim.sub','${UID}',false)`);
  const r = await one(db, `select public.hr_leaderboard('total_level', 25, 1) as out`);
  const out = r.out;
  if (!out || out.ok !== true) fail(`CONTROL FAILED: hr_leaderboard no longer answers: ${JSON.stringify(out)}`);
  else if (!Array.isArray(out.top) || out.top.length < 2) {
    fail(`CONTROL FAILED: the board returned ${out.top && out.top.length} rows after the revoke — it must still see the players`);
  } else if (out.top[0].name !== 'Aldric' || Number(out.top[0].score) !== 812) {
    fail(`CONTROL FAILED: the board's top row is ${JSON.stringify(out.top[0])}, expected Aldric at 812`);
  } else if (out.rank !== 1) {
    fail(`CONTROL FAILED: the self block lost the caller's rank (got ${out.rank})`);
  } else {
    pass('CONTROL: hr_leaderboard still ranks both players and still answers "where am I?" — SECURITY DEFINER outlives the revoke');
  }
}

// The clan browser: the replacement serves, and it serves the same shape.
{
  await db.exec(`select set_config('request.jwt.claim.sub','${UID}',false)`);
  const r = await one(db, `select public.hr_clan_browser(25) as out`);
  const out = r.out;
  if (!out || out.ok !== true) fail(`CONTROL FAILED: hr_clan_browser refused a signed-in caller: ${JSON.stringify(out)}`);
  else if (!Array.isArray(out.clans) || out.clans.length !== 1) {
    fail(`hr_clan_browser returned ${out.clans && out.clans.length} clans, expected 1`);
  } else {
    const c = out.clans[0];
    const want = ['id', 'name', 'level', 'treasury', 'castle_tier', 'standing',
                  'upkeep_state', 'members', 'join_policy', 'member_cap'];
    const missing = want.filter((k) => !(k in c));
    if (missing.length) fail(`hr_clan_browser dropped column(s) the client reads: ${missing.join(', ')}`);
    else if (c.name !== 'Ashfell' || Number(c.members) !== 2) {
      fail(`hr_clan_browser row is wrong: ${JSON.stringify(c)} — expected Ashfell with 2 members`);
    } else if (Object.keys(c).length !== want.length) {
      fail(`hr_clan_browser returns ${Object.keys(c).length} keys, expected exactly ${want.length}`);
    } else {
      pass(`CONTROL: hr_clan_browser serves the browser — Ashfell, 2 members, all ${want.length} columns, and nothing extra`);
    }
  }
}

// …and it is not a new anon surface. Both directions.
{
  const r = await one(db, `select has_function_privilege('anon','public.hr_clan_browser(int)','execute') a,
                                  has_function_privilege('authenticated','public.hr_clan_browser(int)','execute') b`);
  if (r.a) fail('hr_clan_browser is anon-executable — it replaced an anon-readable view with an anon-callable RPC');
  else if (!r.b) fail('BROKE THE FEATURE: authenticated cannot execute hr_clan_browser');
  else pass('hr_clan_browser: anon EXECUTE false, authenticated EXECUTE true');

  await db.exec(`select set_config('request.jwt.claim.sub','',false)`);
  const out = (await one(db, `select public.hr_clan_browser(25) as out`)).out;
  if (!out || out.ok !== false || out.error !== 'not_signed_in') {
    fail(`hr_clan_browser served a caller with no identity: ${JSON.stringify(out)}`);
  } else pass('hr_clan_browser refuses a caller with no auth.uid() — not_signed_in');
}

// The server-owned limit. This is what the revoke was FOR: while the matview
// and the view were both selectable, a clamp on the RPC bounded nothing.
{
  await db.exec(`select set_config('request.jwt.claim.sub','${UID}',false)`);
  const out = (await one(db, `select public.hr_clan_browser(99999) as out`)).out;
  if (!out || out.ok !== true) fail(`the clamp probe was refused: ${JSON.stringify(out)}`);
  else if (out.clans.length > 50) fail(`p_limit=99999 returned ${out.clans.length} rows — the clamp did not bite`);
  else if (out.clans.length === 0) fail('CONTROL FAILED: the clamp returned nothing at all');
  else pass(`the p_limit clamp is server-owned: asked for 99999, got ${out.clans.length}`);
}

// Volatility. One word, whole feature — see the migration header.
{
  const r = await one(db, `select p.provolatile v from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                            where n.nspname='public' and p.proname='hr_clan_browser'`);
  if (r.v !== 'v') fail(`hr_clan_browser is provolatile=${r.v} — it calls hr_rate_ok, which WRITES; PostgREST would run it read-only and answer 25006 on every call`);
  else pass('hr_clan_browser is VOLATILE — PostgREST will not run it in a read-only transaction');
}

// Re-runnable, as the header claims.
{
  const r = await attempt(db, `begin;\n${target}\ncommit;`);
  if (!r.ok) { await db.exec('rollback').catch(() => {}); fail(`the migration is NOT re-runnable: ${r.code || ''} ${r.message}`); }
  else pass('idempotent: a second apply succeeds');
}

await db.close();

// ════════════════════════════════════════════════════════════════════════
// MUTATION — §5 must REFUSE a broken migration
//
// Everything above proves the migration works. This proves its own self-check
// would have STOPPED it shipping broken, which is the only thing that makes §5
// a commit gate rather than a comment — and the only way to know its
// behavioural half is not silently skipping (it skips when auth.users is empty;
// this fixture seeds two, and a skip would show up here as a mutation that
// applies cleanly).
// ════════════════════════════════════════════════════════════════════════
process.stdout.write('── MUTATION: §5 must refuse a broken migration\n');
const MUTATIONS = [
  {
    id: 'matview_left_readable',
    what: 'the revoke on leaderboard_ranked is dropped — hr_leaderboard\'s clamp and gate stay decorative',
    find: 'revoke select on public.leaderboard_ranked from anon, authenticated;',
    replace: '-- MUTATED: the matview stays client-selectable',
    expect: /leaderboard_ranked is still client-selectable/i,
  },
  {
    id: 'browser_open_to_anon',
    what: 'hr_clan_browser is granted to anon — the anon-readable view comes back as an anon-callable RPC',
    find: 'revoke execute on function public.hr_clan_browser(int) from anon, service_role;',
    replace: 'grant execute on function public.hr_clan_browser(int) to anon;',
    expect: /hr_clan_browser is anon-executable/i,
  },
  {
    id: 'browser_serves_signed_out',
    what: 'the not_signed_in check is removed — the RPC answers a caller with no identity',
    find: `  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;`,
    replace: '  v_uid := coalesce(v_uid, \'00000000-0000-4000-0000-000000000000\'::uuid);',
    expect: /served an UNAUTHENTICATED caller/i,
  },
  {
    id: 'stable_volatility',
    what: 'hr_clan_browser is declared STABLE — the exact shape that killed sign-up on 2026-08-13',
    find: 'returns jsonb language plpgsql volatile security definer',
    replace: 'returns jsonb language plpgsql stable security definer',
    expect: /provolatile=|read-only transaction|25006/i,
  },
  {
    id: 'member_count_fans_out',
    what: 'the aggregate loses its GROUP BY key, so every member count doubles — the browser-door fan-out defect',
    find: '           count(m.user_id) as members,',
    replace: '           count(m.user_id) * 2 as members,',
    expect: /disagrees with clan_members/i,
  },
];

for (const m of MUTATIONS) {
  const n = target.split(m.find).length - 1;
  if (n !== 1) {
    fail(`mutation "${m.id}" anchor matched ${n} times (need exactly 1) — the migration text moved. `
       + 'A planted bug that is not planted is decoration; fix the anchor.');
    continue;
  }
  const broken = target.replace(m.find, m.replace);
  if (broken === target) { fail(`mutation "${m.id}" produced identical SQL`); continue; }

  let d;
  try { d = await build(); } catch (e) { harness(`mutation "${m.id}": fixture failed to build`); }
  const r = await attempt(d, `begin;\n${broken}\ncommit;`);
  await d.exec('rollback').catch(() => {});
  await d.close();

  if (r.ok) fail(`MUTATION SLIPPED: "${m.id}" (${m.what}) applied CLEANLY. §5 does not detect it.`);
  else if (!m.expect.test(r.message)) {
    fail(`mutation "${m.id}" was refused, but by the wrong assertion — expected ${m.expect}, got: ${r.message.slice(0, 240)}`);
  } else pass(`§5 caught "${m.id}": ${m.what}`);
}

process.stdout.write(failures
  ? `\nleaderboard-lockdown-guard: ${failures} FAILURE(S)\n`
  : '\nleaderboard-lockdown-guard: clean\n');
process.exit(failures ? 1 : 0);
