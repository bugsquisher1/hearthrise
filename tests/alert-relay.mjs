#!/usr/bin/env node
// ═════════════════════════════════════════════════════════════════════════════
// tests/alert-relay.mjs — A PERSON HEARS WHEN THE GAME IS BROKEN, AND ONLY THEN
//   (2027-02-22-alert-relay.sql, lane/r-alarm-relay).
//
//   node tests/alert-relay.mjs            the guard (the replayed chain, stub Vault, pg_net and pg_cron)
//   node tests/alert-relay.mjs --mutate   every planted defect must turn its arm red
//
// mutant-anchors: supabase/migrations/2027-02-22-alert-relay.sql
//
// PGlite has neither Vault, pg_net nor pg_cron's run history, so the replay exercises the relay dry. Here the three are
// stubbed with production's shape (read 2026-11-03): net.http_post records what would leave, Discord's answer is a row a
// test writes into net._http_response, and the file is applied again on top, its §10 included.
//
//   RL-NOHOOK    no webhook: nothing posted, no raise, one log row an hour, the alert still waiting.
//   RL-BADHOOK   a malformed webhook is never sent to.
//   RL-HELLO     the first run with a webhook posts one "connected" line, and only one.
//   RL-NEW       only critical rows filed after the cursor post; history and warn rows do not.
//   RL-SHAPE     the post carries the alert, empty allowed_mentions and no url from the alert's text.
//   RL-SECRET    the webhook reaches net.http_post and nothing else: no table, log row or return value holds it.
//   RL-REPEAT    a class repeats at most once an hour, and the repeat is counted.
//   RL-CAP       a flood reads 3 posts and one "and N more"; a later run in the hour adds nothing.
//   RL-RETRY     a 5xx or a timeout is tried again, 3 attempts in all; a 200 is done; a dead hook (404) is not hammered.
//   RL-CLEAR     a clear is told only if the alert was.
//   WT-TICK      the tick silent, past its sustain, files one critical; the fire returning clears it and acks.
//   WT-BROKEN    fires with no good outcome for 3 minutes file, after the sustain.
//   WT-UNANSWER  posts with no tick answer file; the same posts answered do not.
//   WT-REFUSE    refused with nothing settled files only after 30 minutes.
//   WT-STALL     a hunt past 240 s, sustained, files; an unwatched 100 s sawtooth never does.
//   WT-FREEZE    2+ watched hunts past 32 s and 30 %+ of the watched files; one hidden tab among many does not.
//   WT-CRON      a job failing 3+ times and failing still files; one that recovered does not.
//   WT-CONN      the 85 % seam fires (clamped: it can only fire sooner).
//   SL-IDLE      no slot with nobody online is OK and idle; with someone online it alarms, sustained; hr_slot_health_alert files no false row.
//   DM-PING      the dead-man pings the Vault URL only when set and well-formed, and not at all when a step broke.
//   FZ-FUSES     the detector holds the file's fuses; one failed run is warn; 851 MB is no longer critical.
//   TR-ACK       §8 acked what was open when the file first ran, and nothing filed since; a second apply moves nothing.
//   CL-REACH     no client or engine role can reach the relay; one job, exact schedule and command.
//
// Exit: 0 green · 1 red · 2 harness.
// ═════════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootReplay, ROOT } from './schema-replay.mjs';
import { isMain } from './_is-main.mjs';

const MUTATE = process.argv.includes('--mutate') || process.argv.includes('--selftest');
const MIG = '2027-02-22-alert-relay.sql';
const HOOK = 'https://discord.com/api/webhooks/1234567890/SECRETTOKEN_abc-123';
const PING = 'https://hc-ping.com/01234567-89ab-cdef-0123-456789abcdef';
const fileText = () => readFileSync(join(ROOT, 'supabase', 'migrations', MIG), 'utf8').replace(/\r\n/g, '\n');

const STUBS = `
  create schema if not exists vault;
  create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
  create schema if not exists net;
  create table net.sent (id bigserial primary key, method text, url text, body jsonb);
  create table net._http_response (id bigint primary key, status_code int, timed_out boolean default false, content text, created timestamptz default now());
  create function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) returns bigint language sql as $f$
    insert into net.sent (method, url, body) values ('POST', url, body) returning id $f$;
  create function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) returns bigint language sql as $f$
    insert into net.sent (method, url, body) values ('GET', url, null) returning id $f$;
  create schema if not exists cron;
  drop table if exists cron.job cascade;
  create table cron.job (jobid bigserial primary key, schedule text, command text, database text, username text, active boolean default true, jobname text unique);
  create table cron.job_run_details (runid bigserial primary key, jobid bigint, status text, return_message text, start_time timestamptz default now(), end_time timestamptz default now());
  drop function if exists cron.schedule(text, text, text);
  create function cron.schedule(p_name text, p_schedule text, p_command text) returns bigint language plpgsql as $f$
  declare v bigint;
  begin
    insert into cron.job (schedule, command, database, username, jobname)
      values (p_schedule, p_command, current_database(), current_user, p_name)
      on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
      returning jobid into v;
    return v;
  end $f$;
`;

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';

/* group: run one family of arms, so a mutant costs what it aims at. null runs them all. */
async function arms(db, src, group = null) {
  const want = (g) => group === null || group === g;
  const red = new Map();
  const arm = (id, pass, good, bad) => {
    if (!MUTATE) console.log(pass ? `  ✓ ${id} — ${good}` : `  ✗ ${id} — ${bad}`);
    if (!pass && !red.has(id)) red.set(id, bad);
  };
  const q = async (s, p) => (await db.query(s, p)).rows;
  const one = async (s, p) => { const r = (await db.query(s, p)).rows[0]; return r ? Object.values(r)[0] : undefined; };
  const n = async (s, p) => Number(await one(s, p));

  const reset = async () => {
    await db.exec(`
      delete from net.sent; delete from net._http_response; delete from vault.decrypted_secrets;
      delete from cron.job_run_details; delete from public.hr_tick_cron_log;
      set session_replication_role = replica;
      delete from public.hunt_sessions; delete from public.hunt_instances; delete from public.hr_rate_counters; delete from public.character_presence;
      set session_replication_role = origin;
      delete from public.maintenance_alerts; delete from public.maintenance_log where job = 'alert-relay';
      delete from hr_ops.alert_relay_posts; delete from hr_ops.watch_state;
      update hr_ops.alert_relay_state set cursor_id = 0, unsent = 0, unsent_since = null, hello_at = now(), noted_at = null where id;`);
  };
  const hook = (v) => db.query(`insert into vault.decrypted_secrets (name, decrypted_secret) values ('hr_alert_discord_webhook', $1)
                                on conflict (name) do update set decrypted_secret = excluded.decrypted_secret`, [v]);
  const alert = (ref, sev = 'critical', msg = 'it broke') => db.query('insert into public.maintenance_alerts (source, ref, severity, message) values ($1, $2, $3, $4)', ['watch', ref, sev, msg]);
  /* A raise is an answer the arm reads, not a crash of the harness: "no webhook is an error loop" must turn RL-NOHOOK red. */
  const relay = async () => { try { return await one('select hr_ops.alert_relay(false) r'); } catch (e) { return { raised: String(e.message).split('\n')[0] }; } };
  const sent = () => q(`select url, body from net.sent where method = 'POST' order by id`);
  const fires = (rows) => db.exec(`insert into public.hr_tick_cron_log (at, outcome, rostered, detail) values ${rows.join(',')}`);
  const fire = (ago, outcome = 'empty', edge = null) => `(now() - interval '${ago} seconds', '${outcome}', 1, '${JSON.stringify(edge ? { edge } : {})}'::jsonb)`;
  const age = (code, secs) => db.query(`update hr_ops.watch_state set since = now() - make_interval(secs => $2) where code = $1`, [code, secs]);
  const watch = (crit) => (crit === undefined ? one('select hr_ops.alert_watch() r') : one('select hr_ops.alert_watch($1) r', [crit]));
  const filed = (code) => q(`select severity, acked_at, message from public.maintenance_alerts where ref like $1 order by id`, [`watch:${code}:%`]);
  const healthyTick = () => fires([fire(5), fire(15)]);

  // ── THE RELAY ──────────────────────────────────────────────────────────
  if (want('RL')) {
  await reset();
  await alert('x:1');
  let r = await relay(); let r2 = await relay();
  arm('RL-NOHOOK', r.outcome === 'no_webhook' && r.waiting === 1 && (await sent()).length === 0
    && (await n(`select count(*) from public.maintenance_log where job = 'alert-relay'`)) === 1
    && (await n('select cursor_id from hr_ops.alert_relay_state')) === 0 && r2.outcome === 'no_webhook',
  'no webhook: no post, no raise, one log row, the alert still waiting',
  `answered ${JSON.stringify(r)}; ${(await sent()).length} posts; ${await n(`select count(*) from public.maintenance_log where job = 'alert-relay'`)} log rows`);

  await reset();
  await hook('https://evil.example/api/webhooks/1/abc'); await alert('x:1');
  r = await relay();
  arm('RL-BADHOOK', r.outcome === 'bad_webhook' && (await sent()).length === 0, 'a malformed webhook is never sent to', `answered ${JSON.stringify(r)}, ${(await sent()).length} posts`);

  await reset();
  await db.exec('update hr_ops.alert_relay_state set hello_at = null where id');
  await hook(HOOK);
  await relay(); await relay();
  const hellos = (await sent()).filter((s) => /connected/.test(s.body.content));
  arm('RL-HELLO', hellos.length === 1, 'the first run with a webhook says "connected", once', `${hellos.length} hello posts`);

  await reset();
  await hook(HOOK);
  await alert('old:1'); await alert('old:2');
  await db.exec(`update hr_ops.alert_relay_state set cursor_id = (select max(id) from public.maintenance_alerts) where id`);
  await alert('w:1', 'warn', 'a warn row'); await alert('i:1', 'info', 'an info row');
  await alert('new-one:2026-11-03', 'critical', 'tick is dead, see https://x.example/path?token=abc and eyJhbGciOiJIUzI1NiIsInR5 sb_secret_abcdef');
  r = await relay();
  const s1 = await sent();
  arm('RL-NEW', s1.length === 1 && /tick is dead/.test(s1[0].body.content), 'only the new critical row posts', `${s1.length} posts: ${JSON.stringify(s1.map((x) => x.body.content))}`);
  const c = s1[0]?.body.content || '';
  arm('RL-SHAPE', Array.isArray(s1[0]?.body.allowed_mentions?.parse) && s1[0].body.allowed_mentions.parse.length === 0 && !/x\.example|eyJhbG|sb_secret/.test(c) && /\*\*CRITICAL\*\*/.test(c) && /new-one:\*/.test(c),
    'the post names the alert, pings nobody and carries no url or token from its text', `body ${JSON.stringify(s1[0]?.body)}`);
  const dump = JSON.stringify([
    await q(`select * from hr_ops.alert_relay_posts`), await q(`select * from hr_ops.alert_relay_state`), await q(`select * from public.maintenance_log where job like 'alert%'`),
    await q(`select * from public.maintenance_alerts`), await q(`select * from hr_ops.watch_state`), r]);
  arm('RL-SECRET', !dump.includes('SECRETTOKEN') && s1[0]?.url === `${HOOK}?wait=true`, 'the webhook reaches net.http_post and no table, log row or answer', `url ${String(s1[0]?.url).replace('SECRETTOKEN', '***')}, a dump holds it: ${dump.includes('SECRETTOKEN')}`);

  await reset();
  await hook(HOOK);
  await alert('same:2026-11-03T01'); await alert('same:2026-11-03T02'); await alert('same:2026-11-03T03');
  await relay();
  const same = await sent();
  const held = await n('select unsent from hr_ops.alert_relay_state');
  arm('RL-REPEAT', same.length === 1 && held === 2, 'three of one class: one post, two counted', `${same.length} posts, ${held} counted`);

  await reset();
  await hook(HOOK);
  for (let i = 0; i < 12; i++) await alert(`flood-${i}:1`);
  await relay();
  const flood = await sent();
  for (let i = 12; i < 20; i++) await alert(`flood-${i}:1`);
  await relay(); await relay();
  const after = await sent();
  const more = flood.filter((s) => /^\.\.\.and 9 more/.test(s.body.content));
  arm('RL-CAP', flood.length === 4 && more.length === 1 && after.length === 4 && (await n('select unsent from hr_ops.alert_relay_state')) === 8,
    '12 classes read 3 posts and "and 9 more"; 8 more in the hour add no post and wait their count',
    `first run ${flood.length} posts (${more.length} "more"), later ${after.length}, counted ${await n('select unsent from hr_ops.alert_relay_state')}`);

  await reset();
  await hook(HOOK);
  await alert('flaky:1');
  await relay();
  let rid = await n('select request_id from hr_ops.alert_relay_posts');
  await db.query('insert into net._http_response (id, status_code) values ($1, 503) on conflict (id) do nothing', [rid]);
  await relay();
  const after503 = (await sent()).length;
  rid = await n('select request_id from hr_ops.alert_relay_posts');
  await db.query('insert into net._http_response (id, status_code, timed_out) values ($1, null, true) on conflict (id) do nothing', [rid]);
  await relay();
  const afterTimeout = (await sent()).length;
  rid = await n('select request_id from hr_ops.alert_relay_posts');
  await db.query('insert into net._http_response (id, status_code) values ($1, 503) on conflict (id) do nothing', [rid]);
  await relay();
  const gaveUp = await one('select done_at from hr_ops.alert_relay_posts');
  await alert('good:1');
  await relay();
  const goodId = await n(`select request_id from hr_ops.alert_relay_posts where class = 'good:#'`);
  await db.query('insert into net._http_response (id, status_code) values ($1, 200)', [goodId]);
  await relay();
  const goodDone = await one(`select done_at from hr_ops.alert_relay_posts where class = 'good:#'`);
  await alert('dead:1');
  await relay();
  const deadId = await n(`select request_id from hr_ops.alert_relay_posts where class = 'dead:#'`);
  await db.query('insert into net._http_response (id, status_code) values ($1, 404)', [deadId]);
  const beforeDead = (await sent()).length;
  await relay();
  const deadRow = (await q(`select done_at, status from hr_ops.alert_relay_posts where class = 'dead:#'`))[0];
  arm('RL-RETRY', after503 === 2 && afterTimeout === 3 && gaveUp !== null && goodDone !== null && deadRow.done_at !== null && deadRow.status === 404 && (await sent()).length === beforeDead,
    'a 503 and a timeout are retried, 3 attempts then done; a 200 is done; a 404 is said once, not hammered',
    `after503 ${after503}, afterTimeout ${afterTimeout}, gaveUp ${gaveUp}, good ${goodDone}, dead ${JSON.stringify(deadRow)}`);

  await reset();
  await hook(HOOK);
  await db.query(`insert into public.maintenance_alerts (source, ref, severity, message, acked_at) values ('watch', 'watch-clear:never-told:5', 'info', 'never-told: cleared', now())`);
  await relay();
  const untold = (await sent()).length;
  await alert('watch:hunts-stalled:7'); await relay();
  await db.query(`insert into public.maintenance_alerts (source, ref, severity, message, acked_at) values ('watch', 'watch-clear:hunts-stalled:7', 'info', 'hunts-stalled: cleared after 9 min', now())`);
  await relay();
  const told = (await sent()).filter((s) => /^Cleared\. hunts-stalled/.test(s.body.content)).length;
  arm('RL-CLEAR', untold === 0 && told === 1, 'a clear is told only of what the channel heard', `${untold} posts for an untold clear, ${told} for the told one`);

  }

  // ── THE WATCH ──────────────────────────────────────────────────────────
  if (want('WT')) {
  await reset();
  await fires([fire(200)]);
  await watch();
  const notYet = (await filed('tick-silent')).length;
  await age('tick-silent', 120);
  await watch(); await watch();
  const silent = await filed('tick-silent');
  await db.exec('delete from public.hr_tick_cron_log'); await healthyTick();
  await watch();
  const after2 = await filed('tick-silent');
  const clear = await q(`select severity, message from public.maintenance_alerts where ref like 'watch-clear:tick-silent:%'`);
  arm('WT-TICK', notYet === 0 && silent.length === 1 && silent[0].severity === 'critical' && after2[0].acked_at !== null && clear.length === 1 && clear[0].severity === 'info'
    && (await n(`select count(*) from hr_ops.watch_state where code = 'tick-silent'`)) === 0,
  'silent past the sustain files one critical; the fire returning acks it and says so',
  `first look ${notYet}, sustained ${silent.length}, cleared ${JSON.stringify(after2[0]?.acked_at)}, clear rows ${clear.length}`);

  await reset();
  await fires([fire(5, 'no_hmac'), fire(15, 'no_hmac'), fire(25, 'no_hmac')]);
  await watch(); await age('tick-broken', 120); await watch();
  const broken = await filed('tick-broken');
  await reset();
  await fires([fire(5, 'no_hmac'), fire(15, 'posted'), fire(25, 'no_hmac')]);
  await watch(); await age('tick-broken', 120); await watch();
  arm('WT-BROKEN', broken.length === 1 && /no_hmac/.test(broken[0].message) && (await filed('tick-broken')).length === 0,
    'fires with no good outcome file, one good fire does not', `${broken.length} filed; with a good fire ${(await filed('tick-broken')).length}`);

  await reset();
  const unanswered = [fire(5, 'posted'), fire(15, 'posted'), fire(25, 'posted')];
  await fires(unanswered);
  await watch(); await age('tick-unanswered', 120); await watch();
  const un = await filed('tick-unanswered');
  await reset();
  const answer = { responses: 1, non_tick: 0, settled: 1, refused: 0 };
  await fires([fire(5, 'posted', answer), fire(15, 'posted', answer), fire(25, 'posted', answer)]);
  await watch(); await age('tick-unanswered', 120); await watch();
  arm('WT-UNANSWER', un.length === 1 && (await filed('tick-unanswered')).length === 0, 'posts with no tick answer file; answered posts do not', `${un.length} filed unanswered; answered ${(await filed('tick-unanswered')).length}`);

  await reset();
  const refused = { responses: 1, non_tick: 0, settled: 0, refused: 3, top_reason: 'fenced_cap' };
  await fires([fire(5, 'posted', refused), fire(15, 'posted', refused), fire(25, 'posted', refused)]);
  await watch(); await age('tick-refusing', 29 * 60); await watch();
  const early = (await filed('tick-refusing')).length;
  await age('tick-refusing', 31 * 60); await watch();
  const ref = await filed('tick-refusing');
  arm('WT-REFUSE', early === 0 && ref.length === 1 && /fenced_cap/.test(ref[0].message), 'refused with nothing settled files after 30 minutes, not before', `at 29 min ${early}, at 31 min ${ref.length}`);

  const hunt = async (user, slot, lagS) => {
    const inst = (await q(`select gen_random_uuid() id`))[0].id;
    await db.query(`set session_replication_role = replica`);
    await db.query(`insert into public.hunt_instances (id, hunt_id, kind, settled_to) values ($1, 'wolves', 'solo', now() - make_interval(secs => $2))`, [inst, lagS]);
    await db.query(`insert into public.hunt_sessions (user_id, slot, hunt_id, instance_id, hunt_from, settled_to, next_swing_at) values ($1, $2, 'wolves', $3, now(), now(), now())`, [user, slot, inst]);
    await db.query(`set session_replication_role = origin`);
    return inst;
  };
  const viewing = (user, slot) => db.query(`insert into public.hr_rate_counters (user_id, bucket, window_start, n) values ($1, $2, now(), 1)`, [user, `accrue:${slot}`]);

  await reset(); await healthyTick();
  await hunt(U1, 0, 100);            // the sawtooth, by design
  await watch(); await age('hunts-stalled', 600); await watch();
  const saw = (await filed('hunts-stalled')).length;
  await reset(); await healthyTick();
  await hunt(U1, 0, 300);
  await watch();
  const stallFirst = (await filed('hunts-stalled')).length;
  await age('hunts-stalled', 150); await watch();
  const stall = await filed('hunts-stalled');
  arm('WT-STALL', saw === 0 && stallFirst === 0 && stall.length === 1 && /Hunts stopped settling/.test(stall[0].message),
    'a hunt past 240 s, sustained, files; a 100 s unwatched sawtooth never does', `sawtooth ${saw}, first look ${stallFirst}, sustained ${stall.length}`);

  await reset(); await healthyTick();
  await hunt(U1, 0, 50); await viewing(U1, 0);
  await hunt(U1, 1, 50); await viewing(U1, 1);
  for (let i = 2; i < 5; i++) await hunt(U2, i, 5);
  await viewing(U2, 2); await viewing(U2, 3); await viewing(U2, 4);
  await watch(); await age('hunts-freezing', 200); await watch();
  const freeze = await filed('hunts-freezing');
  await reset(); await healthyTick();
  await hunt(U1, 0, 50); await viewing(U1, 0);      // one viewer whose tab went hidden, among seven
  for (let i = 1; i < 7; i++) { await hunt(U2, i, 5); await viewing(U2, i); }
  await watch(); await age('hunts-freezing', 200); await watch();
  arm('WT-FREEZE', freeze.length === 1 && (await filed('hunts-freezing')).length === 0, '2 of 5 watched hunts past 32 s file; 1 of 7 does not', `${freeze.length} filed; one of seven ${(await filed('hunts-freezing')).length}`);

  await reset(); await healthyTick();
  await db.exec(`insert into cron.job (jobname, schedule, command) values ('hr-probe-a', '* * * * *', 'select 1'), ('hr-probe-b', '* * * * *', 'select 1') on conflict do nothing`);
  const jid = async (name) => n('select jobid from cron.job where jobname = $1', [name]);
  const run = (id, status, msg = 'boom') => db.query('insert into cron.job_run_details (jobid, status, return_message) values ($1, $2, $3)', [id, status, msg]);
  for (let i = 0; i < 3; i++) await run(await jid('hr-probe-a'), 'failed', 'ERROR: deadlock detected');
  for (let i = 0; i < 3; i++) await run(await jid('hr-probe-b'), 'failed');
  await run(await jid('hr-probe-b'), 'succeeded', '1 row');
  await watch();
  const cronRows = await filed('cron-failing');
  arm('WT-CRON', cronRows.length === 1 && /hr-probe-a/.test(cronRows[0].message) && !/hr-probe-b/.test(cronRows[0].message) && /deadlock/.test(cronRows[0].message),
    'a job failing still files; the one that recovered does not', `${JSON.stringify(cronRows.map((x) => x.message))}`);

  await reset(); await healthyTick();
  await watch();
  const quiet = (await filed('connections')).length;
  await watch(0.00001); await age('connections', 150); await watch(0.00001);
  const conn = (await filed('connections')).length;
  const watchSrc = await one(`select prosrc from pg_proc where oid = 'hr_ops.alert_watch(numeric)'::regprocedure`);
  arm('WT-CONN', quiet === 0 && conn === 1 && watchSrc.includes('least(0.85, greatest(0.000000001, coalesce(p_conn_crit, 0.85)))'),
    'the arm fires at the seam, is quiet at 85 %, and the seam is clamped so it can only fire sooner',
    `quiet ${quiet}, seam ${conn}, clamp ${watchSrc.includes('least(0.85')}`);

  }

  // ── THE SLOT ───────────────────────────────────────────────────────────
  if (want('SL')) {
  await reset(); await healthyTick();
  const idle = await one('select public.hr_slot_health() h');
  await watch(); await age('realtime-no-slot', 600); await watch();
  const idleRows = (await filed('realtime-no-slot')).length;
  const idleFile = await one('select public.hr_slot_health_alert() h');
  const idleAlerts = await n(`select count(*) from public.maintenance_alerts where ref like 'slot-health:%'`);
  await db.query('set session_replication_role = replica');
  await db.query('insert into public.character_presence (user_id, slot, seen_at) values ($1, 0, now())', [U1]);
  await db.query('set session_replication_role = origin');
  const busy = await one('select public.hr_slot_health() h');
  await watch();
  const firstLook = (await filed('realtime-no-slot')).length;
  await age('realtime-no-slot', 250); await watch();
  const busyRows = (await filed('realtime-no-slot')).length;
  await db.query('select public.hr_slot_health_alert()');
  const busyFile = await n(`select count(*) from public.maintenance_alerts where ref like 'slot-health:no_pgoutput%'`);
  arm('SL-IDLE', idle.ok === true && idle.idle === true && idleRows === 0 && idleFile.filed === 0 && idleAlerts === 0 && busy.ok === false && firstLook === 0 && busyRows === 1 && busyFile === 0,
    'no slot and nobody online is OK; someone online alarms only once sustained; the 5-minute job files no such row',
    `idle ${JSON.stringify({ ok: idle.ok, idle: idle.idle })}, idle rows ${idleRows}, busy ok ${busy.ok}, first look ${firstLook}, sustained ${busyRows}, job rows ${busyFile}`);

  }

  // ── THE DEAD-MAN ───────────────────────────────────────────────────────
  if (want('DM')) {
  await reset(); await healthyTick();
  await one('select hr_ops.alert_run() r');
  const noSecret = (await q(`select url from net.sent where method = 'GET'`)).length;
  await db.query(`insert into vault.decrypted_secrets (name, decrypted_secret) values ('hr_alert_deadman_url', 'https://evil.example/ping')`);
  await one('select hr_ops.alert_run() r');
  const badUrl = (await q(`select url from net.sent where method = 'GET'`)).length;
  await db.query(`update vault.decrypted_secrets set decrypted_secret = $1 where name = 'hr_alert_deadman_url'`, [PING]);
  const ok1 = await one('select hr_ops.alert_run() r');
  const pinged = await q(`select url from net.sent where method = 'GET'`);
  await db.exec(`alter table public.hr_tick_config rename to hr_tick_config_gone`);
  const okBroken = await one('select hr_ops.alert_run() r');
  await db.exec(`alter table public.hr_tick_config_gone rename to hr_tick_config`);
  const afterBroken = (await q(`select url from net.sent where method = 'GET'`)).length;
  const brokenRow = await q(`select severity from public.maintenance_alerts where ref like 'watch-broken:%'`);
  arm('DM-PING', noSecret === 0 && badUrl === 0 && ok1 === true && pinged.length === 1 && pinged[0].url === PING && okBroken === false && afterBroken === 1 && brokenRow.length === 1,
    'pings only a well-formed Vault URL, and a broken step means no ping and a critical row',
    `no secret ${noSecret}, bad url ${badUrl}, good ${pinged.length}, broken step ok=${okBroken} pings ${afterBroken} rows ${brokenRow.length}`);

  }

  // ── THE FUSES ──────────────────────────────────────────────────────────
  if (want('FZ')) {
  const det = await one(`select prosrc from pg_proc where oid = 'public.hr_cron_health_ex(interval,numeric)'::regprocedure`);
  const wants = ['c_db_crit        constant bigint := (6144::bigint', 'c_db_growth_crit constant bigint := (1536::bigint', 'c_tbl_crit       constant bigint := (4096::bigint',
    'c_tbl_growth     constant bigint := ( 100::bigint', 'c_rows_crit      constant bigint := (   1000000', 'c_conn_crit      constant numeric := 0.85 * c_scale'];
  await reset();
  await db.query(`insert into cron.job_run_details (jobid, status, return_message) values (1, 'failed', 'once')`);
  await db.query(`select public.hr_cron_health_ex(interval '25 hours', 1.0)`);
  const oneRun = await q(`select severity from public.maintenance_alerts where ref like 'cron-run:%'`);
  arm('FZ-FUSES', wants.every((w) => det.includes(w)) && oneRun.length === 1 && oneRun[0].severity === 'warn',
    "the detector holds the file's fuses, and one failed run is a warn", `missing ${wants.filter((w) => !det.includes(w)).join(' | ') || 'none'}; one run ${JSON.stringify(oneRun)}`);

  }

  // ── §8 AND A SECOND APPLY ──────────────────────────────────────────────
  if (want('TR')) {
  await reset();
  await alert('history:1'); await alert('history:2');
  const line = await n('select max(id) from public.maintenance_alerts');
  await alert('after:1');
  await db.query('update hr_ops.alert_relay_state set triage_id = $1 where id', [line]);
  const SNAP = `select jsonb_build_object(
      'job', (select jsonb_agg(jsonb_build_object('s', schedule, 'c', command, 'a', active)) from cron.job where jobname = 'hr-alert-relay'),
      'fn', (select jsonb_agg(md5(prosrc) order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'hr_ops' and p.proname like 'alert%'),
      'acl', (select jsonb_agg(coalesce(p.proacl::text, '') order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'hr_ops' and p.proname like 'alert%'),
      'det', (select md5(prosrc) from pg_proc where oid = 'public.hr_cron_health_ex(interval,numeric)'::regprocedure)) v`;
  const s0 = await one(SNAP);
  let again = null;
  try { await db.exec(`begin;\n${src}\ncommit;`); } catch (e) { await db.exec('rollback').catch(() => {}); again = String(e.message).split('\n')[0]; }
  const sAfter = await one(SNAP);
  const hist = await q(`select ref, acked_at from public.maintenance_alerts where ref like 'history:%' or ref = 'after:1' order by id`);
  const logged = await q(`select detail from public.maintenance_log where job = 'alert-triage' order by id desc limit 1`);
  let againLog = null;
  try { await db.exec(`begin;\n${src}\ncommit;`); againLog = await n(`select count(*) from public.maintenance_log where job = 'alert-triage'`); } catch (e) { await db.exec('rollback').catch(() => {}); again = again || String(e.message).split('\n')[0]; }
  const logCount1 = againLog;
  arm('TR-ACK', again === null && hist.length === 3 && hist[0].acked_at !== null && hist[1].acked_at !== null && hist[2].acked_at === null && logged[0]?.detail?.acked === 2 && JSON.stringify(s0) === JSON.stringify(sAfter) && logCount1 >= 1,
    'what was open at the line is acked and logged, what came after is not, and a re-apply moves no job, body or ACL',
    `second apply ${again || 'ok'}; rows ${JSON.stringify(hist.map((h) => [h.ref, !!h.acked_at]))}; log ${JSON.stringify(logged[0]?.detail)}; snapshots ${JSON.stringify(s0) === JSON.stringify(sAfter) ? 'same' : 'moved'}`);

  }

  // ── REACH ──────────────────────────────────────────────────────────────
  if (want('CL')) {
  const reach = await one(`select bool_or(has_schema_privilege(r, 'hr_ops', 'USAGE') or has_function_privilege(r, 'hr_ops.alert_run()', 'EXECUTE')
      or has_function_privilege(r, 'hr_ops.alert_secret(text)', 'EXECUTE') or has_table_privilege(r, 'hr_ops.alert_relay_posts', 'SELECT')
      or has_function_privilege(r, 'public.hr_slot_health_alert()', 'EXECUTE')) from unnest(array['anon', 'authenticated', 'service_role']) r`);
  const job = await q(`select schedule, command, active from cron.job where jobname = 'hr-alert-relay'`);
  arm('CL-REACH', reach === false && job.length === 1 && job[0].schedule === '* * * * *' && job[0].command === 'select hr_ops.alert_run()' && job[0].active === true,
    'no client role reaches the relay; one job, exact schedule and command', `reach ${reach}, job ${JSON.stringify(job)}`);
  }
  return red;
}

/* Each mutant edits this file's text; only the statements it changed are run again on one booted database, then restored
   (the chain takes minutes; a mutant takes milliseconds). HR_MUTANT_CONTROL plants nothing, so a "caught" there would be a false proof. */
const MUTANTS = [
  { id: 'hook_shape_gone', arm: 'RL-BADHOOK', why: 'any url in Vault is posted to', edits: [["v_outcome := case when v_url is null then 'no_webhook' when v_url !~ c_shape then 'bad_webhook' end;", "v_outcome := case when v_url is null then 'no_webhook' end;"]] },
  { id: 'nohook_raises', arm: 'RL-NOHOOK', why: 'a missing webhook is an error loop', edits: [["      return jsonb_build_object('ok', false, 'outcome', v_outcome, 'waiting', v_pending);", "      raise exception 'no webhook';"]] },
  { id: 'nohook_logs_every_run', arm: 'RL-NOHOOK', why: 'the no-op writes a row a minute', edits: [["      if v_state.noted_at is null or v_state.noted_at < now() - interval '1 hour' then", '      if true then']] },
  { id: 'hello_every_run', arm: 'RL-HELLO', why: 'the connected line repeats', edits: [["    if v_state.hello_at is null then\n", '    if true then\n']] },
  { id: 'warn_rows_post', arm: 'RL-NEW', why: 'warn rows reach the channel', edits: [["              and ((a.severity = 'critical' and a.acked_at is null) or a.ref like 'watch-clear:%')", "              and ((a.severity in ('critical', 'warn') and a.acked_at is null) or a.ref like 'watch-clear:%')"]] },
  { id: 'history_posts', arm: 'RL-NEW', why: 'the cursor is ignored: the backlog blasts the channel', edits: [['            where a.id > v_state.cursor_id\n              and ((a.severity', '            where a.id > 0\n              and ((a.severity']] },
  { id: 'scrub_gone', arm: 'RL-SHAPE', why: 'a url in an error text is posted', edits: [["'**CRITICAL** ' || hr_ops.alert_scrub(r.message) ||", "'**CRITICAL** ' || r.message ||"]] },
  { id: 'mentions_open', arm: 'RL-SHAPE', why: 'text in an alert can ping people', edits: [["'allowed_mentions', jsonb_build_object('parse', '[]'::jsonb));", "'allowed_mentions', jsonb_build_object('parse', '[\"everyone\"]'::jsonb));"]] },
  { id: 'url_in_answer', arm: 'RL-SECRET', why: 'the webhook is returned, so it lands in whatever reads the answer', edits: [["  return jsonb_build_object('ok', true, 'outcome', case when v_new_posts > 0 then 'posted' else 'idle' end,", "  return jsonb_build_object('ok', true, 'u', hr_ops.alert_secret('hr_alert_discord_webhook'), 'outcome', case when v_new_posts > 0 then 'posted' else 'idle' end,"]] },
  { id: 'no_cooldown', arm: 'RL-REPEAT', why: 'a repeating class posts every hour-row', edits: [["       or (v_kind = 'alert' and exists (select 1 from hr_ops.alert_relay_posts x\n             where x.kind = 'alert' and x.class = v_class and x.at > now() - c_cooldown)) then", '       then']] },
  { id: 'no_cap', arm: 'RL-CAP', why: 'a flood posts every row', edits: [['    if v_recent >= c_per_hour\n       or (v_kind', '    if false\n       or (v_kind']] },
  { id: 'more_every_run', arm: 'RL-CAP', why: '"and N more" repeats every minute', edits: [["     and not exists (select 1 from hr_ops.alert_relay_posts x where x.kind = 'more' and x.at > now() - interval '1 hour') then", '     then']] },
  { id: 'never_retries', arm: 'RL-RETRY', why: 'a Discord 503 loses the alert', edits: [["        if p.attempts >= c_attempts then\n", '        if true then\n']] },
  { id: 'dead_hook_hammered', arm: 'RL-RETRY', why: 'a 404 is retried like a 503', edits: [['      elsif v_found and v_status in (401, 403, 404) then', '      elsif v_found and v_status in (999) then']] },
  { id: 'clear_always_told', arm: 'RL-CLEAR', why: 'the channel hears of clears for alerts it never saw', edits: [["    if v_kind = 'clear' and not exists (select 1 from hr_ops.alert_relay_posts x", "    if false and not exists (select 1 from hr_ops.alert_relay_posts x"]] },
  { id: 'no_sustain', arm: 'WT-TICK', why: 'one bad look files, whatever the sustain', edits: [['    if v_row.alert_ref is null and now() - v_row.since >= p_after then', '    if v_row.alert_ref is null then']] },
  { id: 'files_every_look', arm: 'WT-TICK', why: 'an episode files a row every minute', edits: [['    if v_row.alert_ref is null and now() - v_row.since >= p_after then', '    if now() - v_row.since >= p_after then'], ["      v_ref := 'watch:' || p_code || ':' || floor(extract(epoch from v_row.since))::bigint;", "      v_ref := 'watch:' || p_code || ':' || floor(extract(epoch from v_row.since))::bigint || random();"]] },
  { id: 'clear_keeps_open', arm: 'WT-TICK', why: 'a cleared alert stays open', edits: [['    update public.maintenance_alerts set acked_at = now() where ref = v_row.alert_ref and acked_at is null;\n', '']] },
  { id: 'tick_silent_blind', arm: 'WT-TICK', why: 'a silent tick is not read', edits: [['  v_on := v_last is null or v_silent > 60;', '  v_on := false;']] },
  { id: 'broken_counts_any_fire', arm: 'WT-BROKEN', why: 'any fire reads as healthy', edits: [["         count(*) filter (where l.at > now() - interval '3 minutes' and l.outcome in ('empty', 'posted', 'locked')),", "         count(*) filter (where l.at > now() - interval '3 minutes'),"]] },
  { id: 'answers_ignored', arm: 'WT-UNANSWER', why: 'posts that nobody answers read as fine', edits: [['  v_on := v_posted >= 3 and v_answers <= 0;', '  v_on := false;']] },
  { id: 'unanswered_fires_always', arm: 'WT-UNANSWER', why: 'every post reads as unanswered', edits: [['  v_on := v_posted >= 3 and v_answers <= 0;', '  v_on := v_posted >= 3;']] },
  { id: 'refusing_at_once', arm: 'WT-REFUSE', why: 'a refusal pages at once', edits: [["perform hr_ops.alert_note('tick-refusing', v_on, interval '30 minutes',", "perform hr_ops.alert_note('tick-refusing', v_on, interval '1 minute',"]] },
  { id: 'stall_at_sawtooth', arm: 'WT-STALL', why: 'the by-design 100 s sawtooth pages', edits: [['  c_worst      constant numeric := 240;', '  c_worst      constant numeric := 60;']] },
  { id: 'stall_blind', arm: 'WT-STALL', why: 'stopped hunts are not read', edits: [['  v_on := coalesce(v_worst, 0) > c_worst or v_stalled > greatest(1, 0.1 * v_open);', '  v_on := false;']] },
  { id: 'freeze_one_tab', arm: 'WT-FREEZE', why: 'one hidden tab pages', edits: [['  v_on := v_freezing >= 2 and v_freezing >= 0.3 * v_watched;', '  v_on := v_freezing >= 1;']] },
  { id: 'freeze_blind', arm: 'WT-FREEZE', why: 'freezing viewers are not read', edits: [['  v_on := v_freezing >= 2 and v_freezing >= 0.3 * v_watched;', '  v_on := false;']] },
  { id: 'cron_recovered_fires', arm: 'WT-CRON', why: 'a job that recovered still pages', edits: [["       where x.fails >= 3 and x.latest = 'failed'", '       where x.fails >= 3']] },
  { id: 'conn_unclamped', arm: 'WT-CONN', why: 'the seam can raise the fuse: an off switch', edits: [['  c_conn       constant numeric := least(0.85, greatest(0.000000001, coalesce(p_conn_crit, 0.85)));', '  c_conn       constant numeric := greatest(0.000000001, coalesce(p_conn_crit, 0.85));']] },
  { id: 'conn_blind', arm: 'WT-CONN', why: 'a full pool is not read', edits: [['  v_on := v_max > 0 and v_conns::numeric / v_max::numeric > c_conn;', '  v_on := false;']] },
  { id: 'idle_alarms_again', arm: 'SL-IDLE', why: 'the false alarm is back: no slot with nobody online', edits: [['    if coalesce(p_present, true) then\n', '    if true then\n']] },
  { id: 'dead_never_alarms', arm: 'SL-IDLE', why: 'no slot with someone online is read as idle', edits: [['    if coalesce(p_present, true) then\n', '    if false then\n']] },
  { id: 'alert_files_no_slot', arm: 'SL-IDLE', why: 'the 5-minute job files the unsustained row', edits: [["              where e->>'code' <> 'no_pgoutput_slot' loop", '              where true loop']] },
  { id: 'ping_any_url', arm: 'DM-PING', why: 'the ping goes wherever Vault says', edits: [["  if v_url is null or v_url !~ '^https://hc-ping\\.com/[0-9a-fA-F-]{36}$' then return false; end if;", '  if v_url is null then return false; end if;']] },
  { id: 'ping_when_broken', arm: 'DM-PING', why: 'a broken relay still says it is alive', edits: [['  if v_ok then perform hr_ops.alert_deadman(); end if;', '  perform hr_ops.alert_deadman();']] },
  { id: 'cron_run_critical', arm: 'FZ-FUSES', why: 'one failed run pages again', edits: [["values ('cron', 'cron-run:' || r.runid, 'warn',   --", "values ('cron', 'cron-run:' || r.runid, 'critical',   --"]] },
  { id: 'fuse_back_to_free_tier', arm: 'FZ-FUSES', why: 'the database critical line is the 500 MB tier again', edits: [['c_db_crit        constant bigint := (6144::bigint', 'c_db_crit        constant bigint := (800::bigint']] },
  { id: 'ack_past_line', arm: 'TR-ACK', why: 'a re-apply acks what was filed since', edits: [['    update public.maintenance_alerts set acked_at = now() where acked_at is null and id <= v_line;', '    update public.maintenance_alerts set acked_at = now() where acked_at is null;']], whole: true },
  { id: 'open_to_clients', arm: 'CL-REACH', why: 'a signed-in player can run the relay', sql: 'grant usage on schema hr_ops to authenticated', undo: 'revoke usage on schema hr_ops from authenticated' },
];

/* The `create or replace function ... $tag$;` statements of a text, by name, so a mutant re-runs only what it changed. */
function functionsOf(text) {
  const out = new Map();
  const re = /create or replace function\s+([a-z_.]+)\s*\([\s\S]*?\$(fn|function)\$[\s\S]*?\$\2\$;/g;
  for (const m of text.matchAll(re)) out.set(m[1], m[0]);
  return out;
}

/* The stubs are the seed BEFORE this file: its first apply, §10 included, runs against them, and the chain up to it
   comes from the shared snapshot (the prefix ends just before a seeded file), so editing this file costs no 25-minute replay. */
async function boot() {
  const { db } = await bootReplay({ seedBefore: new Map([[MIG, STUBS]]) });
  return { db, src: fileText() };
}

async function main() {
  let b;
  try { b = await boot(); } catch (e) { console.error(`alert-relay: HARNESS — ${String(e.message).split('\n').slice(0, 2).join(' ')}`); process.exit(2); }
  if (!MUTATE) {
    console.log('\nalert-relay — the watch, the relay and the dead-man, against stub Vault, pg_net and pg_cron\n');
    const red = await arms(b.db, b.src);
    console.log(red.size ? `\nalert-relay: RED (${red.size})` : '\nalert-relay: green');
    process.exitCode = red.size ? 1 : 0;
    await b.db.close().catch(() => {});
    return;
  }
  console.log('\nalert-relay --mutate\n');
  const clean = await arms(b.db, b.src);
  if (clean.size) { console.error(`alert-relay --mutate: HARNESS — the unmutated run is red: ${[...clean.keys()].join(', ')}`); process.exit(2); }
  const original = functionsOf(b.src);
  const plant = process.env.HR_MUTANT_CONTROL ? false : true;
  let survived = 0;
  for (const mu of MUTANTS) {
    let text = b.src;
    for (const [from, to] of mu.edits || []) {
      if (text.split(from).length !== 2) { console.error(`alert-relay: HARNESS — mutant ${mu.id}: anchor not found once: ${from.slice(0, 70)}`); process.exit(2); }
      text = text.split(from).join(to);
    }
    const changed = [...functionsOf(text)].filter(([name, stmt]) => original.get(name) !== stmt);
    if (plant) {
      if (mu.sql) await b.db.exec(mu.sql);
      for (const [, stmt] of changed) await b.db.exec(stmt);
    }
    /* A mutant that lives outside a function (§8) is planted by running its statement from a re-apply of the whole mutated text. */
    const red = await arms(b.db, plant && mu.whole ? text : b.src, mu.arm.split('-')[0]);
    const caught = red.has(mu.arm);
    console.log(caught ? `  ✓ ${mu.id} — caught by ${mu.arm} (${mu.why})` : `  ✗ ${mu.id} — SURVIVED (${mu.why}); red: ${[...red.keys()].join(', ') || 'none'}`);
    if (!caught) survived++;
    if (plant) {
      if (mu.undo) await b.db.exec(mu.undo);
      for (const [name] of changed) await b.db.exec(original.get(name));
    }
  }
  console.log(survived ? `\nalert-relay --mutate: ${survived} survived` : `\nalert-relay --mutate: ${MUTANTS.length}/${MUTANTS.length} caught`);
  process.exitCode = survived ? 1 : 0;
  await b.db.close().catch(() => {});
}

if (isMain(import.meta.url)) await main();
