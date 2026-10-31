#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/db-retention.mjs — WHAT THE DATABASE STOPS KEEPING, AND WHAT IT MUST NOT TOUCH
//   (2027-02-11-db-retention.sql, lane/c-beta-capacity).
//
//   node tests/db-retention.mjs            the guard (the replayed chain, stub realtime + pg_cron schemas)
//   node tests/db-retention.mjs --mutate   every planted defect must turn its arm red
//
// mutant-anchors: supabase/migrations/2027-02-11-db-retention.sql
//
// PGlite has neither Realtime nor pg_cron, so the file's §1 and §4 skip themselves on the replay. Here the two are
// stubbed with their production shape (read 2026-10-31: realtime.messages partitioned by day on inserted_at, a
// timestamp WITHOUT time zone; cron.job / cron.schedule) and the file applied again, its §4 included, against them.
//
//   R-FRAME    a `frame` older than an hour goes; one younger than an hour stays.
//   R-CHAT     a chat line of any age stays (not this file's call); so does a public row.
//   R-LIMIT    p_limit bounds a run; limit 0 deletes nothing (§4 v6 leans on it).
//   R-ABSENT   with no realtime.messages the function answers 0 and raises nothing (a rebuilt database).
//   R-JOB      exactly one job, exact schedule and command; a second apply leaves it and every body byte-identical.
//   R-LOG      hr_tick_cron_log_prune takes rows past 3 days and leaves younger ones.
//   R-KEEP     hr_cron_health_ex keeps 3 days of cron history, not 7.
//   R-CLIENT   no client role can execute the prune.
//
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootReplay, ROOT, LAST_PATCHED } from './schema-replay.mjs';

const MUTATE = process.argv.includes('--mutate') || process.argv.includes('--selftest');
const MIG = '2027-02-11-db-retention.sql';
const one = async (db, sql, params) => { const r = (await db.query(sql, params)).rows[0]; return r ? Object.values(r)[0] : undefined; };

const STUBS = `
  create schema if not exists realtime;
  create table realtime.messages (
    topic text not null, extension text not null, payload jsonb, event text, private boolean default false,
    updated_at timestamp not null default now(), inserted_at timestamp not null default now(), id uuid not null default gen_random_uuid(),
    primary key (id, inserted_at)
  ) partition by range (inserted_at);
  create table realtime.messages_all partition of realtime.messages for values from ('2000-01-01') to ('2100-01-01');
  create index on realtime.messages (inserted_at desc, topic) where extension = 'broadcast' and private is true;
  create schema if not exists cron;
  create table if not exists cron.job (jobid bigserial primary key, schedule text, command text, database text, username text,
                                        active boolean default true, jobname text unique);
  create or replace function cron.schedule(p_name text, p_schedule text, p_command text) returns bigint language plpgsql as $f$
  declare v bigint;
  begin
    insert into cron.job (schedule, command, database, username, jobname)
      values (p_schedule, p_command, current_database(), current_user, p_name)
      on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
      returning jobid into v;
    return v;
  end $f$;
  grant usage on schema realtime, cron to public;
`;

const fileText = () => readFileSync(join(ROOT, 'supabase', 'migrations', MIG), 'utf8').replace(/\r\n/g, '\n');

async function arms(db, src) {
  const red = new Map();
  const arm = (id, pass, good, bad) => {
    if (!MUTATE) console.log(pass ? `  ✓ ${id} — ${good}` : `  ✗ ${id} — ${bad}`);
    if (!pass) red.set(id, bad);
  };
  const seed = async (topic, event, ageMin, ext = 'broadcast', priv = true) => db.query(
    `insert into realtime.messages (topic, extension, event, private, payload, inserted_at)
     values ($1, $2, $3, $4, '{}', (now() at time zone 'utc') - make_interval(mins => $5))`, [topic, ext, event, priv, ageMin]);
  const count = async (topic) => Number(await one(db, 'select count(*) from realtime.messages where topic = $1', [topic]));

  await db.exec('delete from realtime.messages');
  await seed('hr:a:0', 'frame', 90); await seed('hr:a:0', 'frame', 90);
  await seed('hr:young:0', 'frame', 10);
  await seed('chat:system', 'line', 9000);
  await seed('hr:public:0', 'frame', 90, 'broadcast', false);

  // limit 0 first: nothing goes.
  const n0 = Number(await one(db, 'select public.hr_realtime_frame_prune(0)'));
  const c0 = await count('hr:a:0');
  // limit 1: exactly one goes.
  const n1 = Number(await one(db, 'select public.hr_realtime_frame_prune(1)'));
  const c1 = await count('hr:a:0');
  arm('R-LIMIT', n0 === 0 && c0 === 2 && n1 === 1 && c1 === 1,
    'limit 0 deletes nothing, limit 1 deletes one',
    `limit 0 deleted ${n0} (${c0} left of 2), limit 1 deleted ${n1} (${c1} left)`);
  const n2 = Number(await one(db, 'select public.hr_realtime_frame_prune(20000)'));
  arm('R-FRAME', n2 === 1 && (await count('hr:a:0')) === 0 && (await count('hr:young:0')) === 1,
    'a frame over an hour old goes, one younger stays',
    `the prune answered ${n2}: old ${await count('hr:a:0')}, young ${await count('hr:young:0')}`);
  arm('R-CHAT', (await count('chat:system')) === 1 && (await count('hr:public:0')) === 1,
    'a chat line (any age) and a row off the private broadcast index stay',
    `chat ${await count('chat:system')}, public ${await count('hr:public:0')}`);

  // R-JOB + a second apply byte-identical.
  const SNAP = `select jsonb_build_object(
      'job', (select jsonb_agg(jsonb_build_object('s', schedule, 'c', command, 'a', active)) from cron.job where jobname = 'hr-realtime-frame-prune'),
      'fn', (select jsonb_agg(md5(prosrc) order by proname) from pg_proc where proname in ('hr_realtime_frame_prune', 'hr_tick_cron_log_prune', 'hr_cron_health_ex')),
      'acl', (select jsonb_agg(coalesce(proacl::text, '') order by proname) from pg_proc where proname in ('hr_realtime_frame_prune', 'hr_tick_cron_log_prune', 'hr_cron_health_ex'))) v`;
  const s1 = await one(db, SNAP);
  let again = null;
  try { await db.exec(`begin;\n${src}\ncommit;`); } catch (e) { await db.exec('rollback').catch(() => {}); again = String(e.message).split('\n')[0]; }
  const s2 = await one(db, SNAP);
  const job = s1.job && s1.job[0];
  arm('R-JOB', again === null && s1.job?.length === 1 && job.s === '3-59/10 * * * *' && job.c === 'select public.hr_realtime_frame_prune(20000)' && JSON.stringify(s1) === JSON.stringify(s2),
    'one job, exact schedule and command; a second apply (§4 included, real tables stubbed) moves nothing',
    `job ${JSON.stringify(s1.job)}; second apply ${again ? 'refused: ' + again : JSON.stringify(s1) === JSON.stringify(s2) ? 'same' : 'moved state'}`);

  // R-LOG.
  await db.exec('delete from public.hr_tick_cron_log');
  await db.query(`insert into public.hr_tick_cron_log (at, outcome, rostered) values (now() - interval '4 days', 'posted', 1), (now() - interval '2 days', 'posted', 1), (now(), 'posted', 1)`);
  const nl = Number(await one(db, 'select public.hr_tick_cron_log_prune(20000)'));
  const left = Number(await one(db, 'select count(*) from public.hr_tick_cron_log'));
  arm('R-LOG', nl === 1 && left === 2, 'the fire log loses what is past 3 days and keeps the rest', `pruned ${nl}, left ${left} of 3`);

  // R-KEEP.
  const keep = await one(db, `select prosrc from pg_proc where oid = 'public.hr_cron_health_ex(interval,numeric)'::regprocedure`);
  arm('R-KEEP', /c_cron_keep\s+constant interval := interval '3 days'/.test(keep), 'the run history keeps 3 days', 'hr_cron_health_ex does not keep 3 days');

  // R-CLIENT.
  const cl = await one(db, `select has_function_privilege('authenticated', 'public.hr_realtime_frame_prune(integer)', 'execute')
                                or has_function_privilege('anon', 'public.hr_realtime_frame_prune(integer)', 'execute')`);
  arm('R-CLIENT', cl === false, 'no client role can execute the prune', 'a client role can execute hr_realtime_frame_prune');

  // R-ABSENT: last, it renames the stub away.
  await db.exec('alter table realtime.messages rename to messages_gone');
  let absent = null;
  try { absent = Number(await one(db, 'select public.hr_realtime_frame_prune(20000)')); } catch (e) { absent = String(e.message); }
  await db.exec('alter table realtime.messages_gone rename to messages');
  arm('R-ABSENT', absent === 0, 'with no realtime.messages the prune answers 0', `the prune answered ${absent}`);
  return red;
}

const MUTANTS = [
  { id: 'chat_too', arm: 'R-CHAT', why: 'chat lines are pruned as well', edits: [["       and m.event = 'frame'\n", '']] },
  { id: 'keeps_a_day', arm: 'R-FRAME', why: 'frames are kept a day, not an hour', edits: [["(now() at time zone 'utc') - interval '1 hour'", "(now() at time zone 'utc') - interval '1 day'"]] },
  { id: 'no_limit', arm: 'R-LIMIT', why: 'a run is not bounded', edits: [['     limit greatest(0, least(coalesce(p_limit, 20000), 100000))\n', '']] },
  { id: 'absent_raises', arm: 'R-ABSENT', why: 'a database without Realtime raises', edits: [["  if to_regclass('realtime.messages') is null then return 0; end if;\n", '']] },
  { id: 'log_keeps_week', arm: 'R-LOG', why: 'the fire log still keeps 7 days',
    edits: [["     where at < now() - interval '3 days'\n", "     where at < now() - interval '7 days'\n"], ["position($q$interval '3 days'$q$ in (select prosrc from pg_proc where oid = 'public.hr_tick_cron_log_prune(integer)'::regprocedure)) = 0", 'false']] },
  { id: 'open_to_clients', arm: 'R-CLIENT', why: 'the prune is left executable by PUBLIC',
    edits: [["revoke execute on function public.hr_realtime_frame_prune(int)\n  from public, anon, authenticated, service_role, hr_engine, hr_tick;\n", ''],
            ["  if has_function_privilege('authenticated', 'public.hr_realtime_frame_prune(integer)', 'execute')\n     or has_function_privilege('anon', 'public.hr_realtime_frame_prune(integer)', 'execute') then", '  if false then']] },
];

async function bootStubbed(edits) {
  const patches = edits ? new Map([[MIG, edits]]) : null;
  const { db } = await bootReplay(patches ? { patches, upTo: LAST_PATCHED } : undefined);
  await db.exec(STUBS);
  let src = fileText();
  for (const [from, to] of edits || []) src = src.split(from).join(to);
  await db.exec(`begin;\n${src}\ncommit;`);
  return { db, src };
}

async function main() {
  if (!MUTATE) {
    let b;
    try { b = await bootStubbed(null); } catch (e) { console.error(`db-retention: HARNESS — ${String(e.message).split('\n').slice(0, 2).join(' ')}`); process.exit(2); }
    console.log('\ndb-retention — frames, the fire log and the run history, against stub Realtime and pg_cron\n');
    const red = await arms(b.db, b.src);
    console.log(red.size ? `\ndb-retention: RED (${red.size})` : '\ndb-retention: green');
    process.exitCode = red.size ? 1 : 0;
    await b.db.close().catch(() => {});
    return;
  }
  console.log('\ndb-retention --mutate\n');
  let survived = 0;
  for (const mu of MUTANTS) {
    let b;
    const planted = fileText();
    for (const [from] of mu.edits) if (planted.split(from).length !== 2) { console.error(`db-retention: HARNESS — mutant ${mu.id}: anchor not found once: ${from.slice(0, 60)}`); process.exit(2); }
    try { b = await bootStubbed(process.env.HR_MUTANT_CONTROL ? null : mu.edits); } catch (e) {
      const msg = String(e.message);
      const refused = /db-retention §4/.test(msg);
      console.log(refused ? `  ✓ ${mu.id} — refused by the file's own §4 (${mu.why})` : `  ✗ ${mu.id} — the chain failed for another reason: ${msg.split('\n').slice(0, 2).join(' ').slice(0, 200)}`);
      if (!refused) survived++;
      continue;
    }
    const red = await arms(b.db, b.src);
    const caught = red.has(mu.arm);
    console.log(caught ? `  ✓ ${mu.id} — caught by ${mu.arm} (${mu.why})` : `  ✗ ${mu.id} — SURVIVED (${mu.why}); red: ${[...red.keys()].join(', ') || 'none'}`);
    if (!caught) survived++;
    await b.db.close().catch(() => {});
  }
  console.log(survived ? `\ndb-retention --mutate: ${survived} survived` : `\ndb-retention --mutate: ${MUTANTS.length}/${MUTANTS.length} caught`);
  process.exitCode = survived ? 1 : 0;
}

await main();
