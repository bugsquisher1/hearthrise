#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/dead-doors.mjs — DOORS NOBODY WALKS THROUGH STAY CLOSED, AND THE LIST OF THE REST ONLY SHRINKS.
//
//   node tests/dead-doors.mjs            the rules, on the whole replayed chain (PGlite, real PostgreSQL)
//   node tests/dead-doors.mjs --mutate   every planted defect must be refused, each for its own reason
//
// mutant-anchors: supabase/migrations/2027-04-02-dead-doors.sql
//
// Architecture audit 2026-11-09 F8 + F9: 25 client-executable SECURITY DEFINER RPCs had no caller in the
// client, two value-writing engine RPCs had no edge caller, four tables kept client grants nothing used.
// supabase/migrations/2027-04-02-dead-doors.sql closes what nothing calls and proves it in one transaction.
// This reads the CHAIN'S END as each role, so a later file that opens one again is red here by name:
//   DD-1  THE DROPPED DOORS: hr_claim_discord_gift, hr_buy_gem_unlock, hr_trait_buy and their ungated bodies
//         do not exist; a signed-in client asking is told so; no baseline row names them
//   DD-2  THE ENGINE DOORS: hr_engine is refused hr_dungeon_settle and hr_quartermaster_buy (permission, by
//         PostgreSQL); the bodies stand (dungeons are paused); a re-grant is named by the detector
//   DD-3  NO UNGATED BODY PAST ITS WRAPPER: no `__ungated` definer function is executable by anon,
//         authenticated, service_role or hr_engine; the server key is refused clan_contribute__ungated
//   DD-4  THE TABLES: a signed-in client is refused an insert into clan_members, session_claims and
//         game_events and a read of game_saves and session_claims, an anonymous one a read of clan_members;
//         the one table a client role can write is bug_reports
//   DD-5  ★ THE RATCHET: every function a client role can execute is either one the client calls
//         (tests/client-intent-surface.mjs CLIENT_RPCS) or on UNCALLED below with its reason. A new door with
//         no caller is red; so is a listed door that is gone or has found a caller (delete its line): the
//         list only shrinks
//   DD-6  THE ENGINE'S LIST: the detector reports nothing (the engine holds no EXECUTE outside its allowlist, no
//         client door is unapproved), and no allowlist entry pre-approves a name that does not exist beyond the
//         ten STALE_ALLOW pins found here (a new one is red; a cleaned one must leave the list)
// ════════════════════════════════════════════════════════════════════════
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { bootReplay, ROOT } from './schema-replay.mjs';
import { isMain } from './_is-main.mjs';

const FILE = '2027-04-02-dead-doors.sql';
/* The client's whole RPC list, READ from tests/client-intent-surface.mjs (CLIENT_RPCS; that guard holds it to the client's code).
   Read as text: importing that file runs it. */
const SURFACE = readFileSync(join(ROOT, 'tests', 'client-intent-surface.mjs'), 'utf8').replace(/\r\n/g, '\n');
const CLIENT_BODY = (SURFACE.split('export const CLIENT_RPCS = Object.freeze({')[1] || '').split('\n});')[0];
const CLIENT_RPCS = Object.fromEntries([...CLIENT_BODY.matchAll(/^  ([a-z][a-z0-9_]*):/gm)].map((m) => [m[1], true]));
const U = (i) => '000000c0-0000-4000-a000-00402e' + String(i).padStart(6, '0');

/* CLIENT-EXECUTABLE, NO CLIENT CALLER (2026-11-10). Each is a door the audit named and 2027-04-02-dead-doors.sql did NOT
   close, with why; closing one means moving the guards that call it as a client first. Delete a line when its door is
   closed or the client starts calling it. Never add one without a reason a reviewer would accept. */
export const UNCALLED = Object.freeze({
  /* not a player's intent: the platform's own, or another Edge Function's */
  bug_report_submit: 'the bug-report-bridge Edge Function files a player\'s report with the player\'s own token',
  hr_access_check: 'the PostgREST pre-request hook (closed mode): every role\'s request passes through it',
  hr_admitted: 'the closed-mode row policies ask it as the querying role',
  hr_chat_history_floor: 'the chat tables\' row policies ask it as the querying role',
  /* a server body calls it, and about 70 guards create their heroes through it as a client */
  hr_create_character: 'hr_create_hero calls it; the guards\' hero fixture',
  /* fixtures of many guards */
  hr_character_name_set: 'the guards\' naming fixture (party, rename, boss-call, tally, settle); hr_create_hero names a hero in play',
  claim_display_name: 'the guards\' account-name fixture (14 suites)',
  /* kept hidden by ruling (Tyler 2026-10-22: keep the companion and the daily-login modules for a later design) */
  hr_companion_grant: 'the companion module, kept hidden by ruling',
  hr_companion_equip: 'the companion module, kept hidden by ruling',
  hr_login_claim: 'the premium daily login, kept hidden by ruling',
  /* a feature\'s server half with no window yet */
  hr_scaled_hunt_buy: 'scaled hunts: the server half shipped 2027-03-21, its window has not',
  hr_scaled_hunt_switch: 'scaled hunts: the server half shipped 2027-03-21, its window has not',
  hr_party_seek: 'the party finder\'s "list me" half (2026-12-07): no control sends it',
  hr_hunt_set_preset: 'switching the action set mid-hunt: no control sends it (the client applies presets in town)',
  hr_hunt_change: 'changing ground without going home: no control sends it',
  hr_hunt_analyzer: 'one session\'s analyzer by id: the envelope carries the open hunt\'s; the summary cards will want this read',
  hr_action_set_put: 'the whole-set write: the client edits a set through hr_action_set_options / _copy / _rename',
  hr_action_set_delete: 'the whole-set delete: the client deletes a preset through hr_hunt_preset_delete',
  hr_recipe_learn: 'learning a recipe scroll: the client half is not built',
  hr_mark_seen: 'the hunt event read cursor: the client keeps its own seen marks',
  /* the old client\'s reads, each the subject of a whole-chain guard */
  hr_town_of: 'the first town roster (tests/town-presence.mjs); hr_town_view replaced it in play',
  hr_heartbeat: 'the first presence stamp (tests/town-presence.mjs, world-tick-presence-signal); hr_social_poll replaced it in play',
  hr_set_presence_quiet: 'the first presence opt-out (tests/town-presence.mjs)',
  hr_town_walkers: 'the first walker read (tests/world-town-home.mjs); hr_town_view replaced it in play',
  hr_world_finds_of: 'the world-finds feed (tests/world-finds-projection.mjs, hearthfind-authority): no window reads it',
  hr_server_now: 'the server clock read (tests/closed-rebuild.mjs uses it as its gated probe)',
  hr_display_name_available: 'the account-name check (tests/anon-rate-gate.mjs)',
  beta_invite_check: 'the invite-code check before sign-up (tests/anon-rate-gate.mjs); the rebuilt sign-up does not ask it',
});

/* THE DETECTOR'S STALE PRE-APPROVALS, found by DD-6 on 2026-11-10 and NOT fixed here: ten c_engine_allow entries name a
   function (or a signature) that no longer exists. Harmless today (nothing holds the grant), but each would wave through a
   function re-created under that exact name and handed to hr_engine. Taking them out is a restatement of the detector with
   their claims declared removed: filed in .claude/coordination/DISCOVERIES.md for the Early Access Security review. This
   list only shrinks: a NEW stale entry is red, and so is a listed one that was cleaned or exists again. */
export const STALE_ALLOW = Object.freeze([
  'hr_hunt_engine_read(uuid,integer)',
  'hr_hunt_apply(uuid,integer,uuid,bigint,uuid,jsonb,jsonb,jsonb,jsonb,boolean)',
  'hr_party_tick_settle(text,uuid,timestamp with time zone,timestamp with time zone,uuid,jsonb)',
  'hr_hunt_analyzer(uuid,integer)',
  'hr_vigour_of(uuid,integer)',
  'hr_attended_kills(uuid,integer,timestamp with time zone)',
  'hr_market_list(uuid,integer,bigint,uuid,text,bigint,bigint)',
  'hr_market_cancel(uuid,integer,bigint,uuid,uuid)',
  'hr_market_buy(uuid,integer,bigint,uuid,uuid,bigint)',
  'hr_claim_lookup(uuid,integer,text,text)',
]);

async function as(db, role, uid, sql, params) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid || '']);
  await db.query("select set_config('request.jwt.claims', $1, false)", [uid ? JSON.stringify({ sub: uid, role }) : '']);
  await db.exec('set role ' + role);
  try { const r = (await db.query(sql, params)).rows[0]; return { ok: true, value: r ? Object.values(r)[0] : undefined }; }
  catch (e) { return { ok: false, error: String(e && e.message || e).split('\n')[0] }; }
  finally { await db.exec('reset role'); }
}
const rows = async (db, sql, params) => (await db.query(sql, params)).rows;
const one = async (db, sql, params) => { const r = (await db.query(sql, params)).rows[0]; return r ? Object.values(r)[0] : undefined; };

export async function rules(db) {
  const fails = [];
  const no = (m) => fails.push(m);
  const uid = U(1);
  await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [uid]);
  await db.query("insert into public.hr_access_allowlist (user_id, note) values ($1, 'dead-doors test') on conflict (user_id) do nothing", [uid]);

  // DD-1 ─ the dropped doors
  const gone = ['hr_claim_discord_gift', 'hr_claim_discord_gift__ungated', 'hr_buy_gem_unlock', 'hr_buy_gem_unlock__ungated', 'hr_trait_buy', 'hr_trait_buy__ungated'];
  const still = await rows(db, "select p.proname::text as n from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any ($1::text[])", [gone]);
  if (still.length) no('DD-1: still in the database: ' + still.map((r) => r.n).join(', '));
  for (const [call, params] of [['select public.hr_trait_buy($1, 0, $2::uuid)', ['auto_eat_1', U(9)]], ['select public.hr_buy_gem_unlock($1, 0, $2::uuid)', ['theme:x', U(9)]],
    ['select public.hr_claim_discord_gift(0, $1)', ['CODE']]]) {
    const r = await as(db, 'authenticated', uid, call, params);
    if (r.ok || !/does not exist/.test(r.error)) no('DD-1: a signed-in client asking ' + call.slice(14, 40) + ' was answered ' + JSON.stringify(r).slice(0, 160));
  }
  if (await one(db, "select count(*)::int from public.hr_client_rpc_baseline where proname = any ($1::text[])", [gone])) no('DD-1: a baseline row still names a dropped door');
  if (await one(db, "select to_regclass('public.hr_traits') is not null")) no('DD-1: hr_traits still stands');
  for (const n of gone) if (n in CLIENT_RPCS) no('DD-1: the client still names ' + n);

  // DD-2 ─ the engine doors
  for (const sig of ['public.hr_dungeon_settle(uuid,integer,bigint,uuid,text,text,numeric)', 'public.hr_quartermaster_buy(uuid,integer,bigint,uuid,text)']) {
    if (!(await one(db, 'select to_regprocedure($1) is not null', [sig]))) { no('DD-2: ' + sig + ' was dropped (dungeons are paused, not cut)'); continue; }
    if (await one(db, "select has_function_privilege('hr_engine', $1, 'execute')", [sig])) no('DD-2: hr_engine may still execute ' + sig);
  }
  let r = await as(db, 'hr_engine', null, "select public.hr_dungeon_settle($1::uuid, 0, 1, $2::uuid, 'x', 'auto', 1)", [uid, U(8)]);
  if (r.ok || !/permission denied/.test(r.error)) no('DD-2: the engine asking hr_dungeon_settle was answered ' + JSON.stringify(r).slice(0, 160));
  r = await as(db, 'hr_engine', null, "select public.hr_quartermaster_buy($1::uuid, 0, 1, $2::uuid, 'x')", [uid, U(8)]);
  if (r.ok || !/permission denied/.test(r.error)) no('DD-2: the engine asking hr_quartermaster_buy was answered ' + JSON.stringify(r).slice(0, 160));
  await db.exec('begin');
  try {
    await db.exec('grant execute on function public.hr_quartermaster_buy(uuid, integer, bigint, uuid, text) to hr_engine');
    const rep = await one(db, 'select public.hr_assert_grant_hygiene(false)');
    if (!rep || !Array.isArray(rep.engine_execute_outside_allowlist) || !rep.engine_execute_outside_allowlist.some((s) => /^hr_quartermaster_buy\(/.test(s))) {
      no('DD-2: hr_engine was granted hr_quartermaster_buy again and the detector did not name it: ' + JSON.stringify(rep && rep.engine_execute_outside_allowlist));
    }
  } finally { await db.exec('rollback'); }

  // DD-3 ─ no ungated body past its wrapper
  const open = await rows(db, `select p.proname::text as n, x.role from pg_proc p cross join (values ('anon'), ('authenticated'), ('service_role'), ('hr_engine')) x(role)
                                where p.pronamespace = 'public'::regnamespace and p.proname like '%\\_\\_ungated' and p.prosecdef and has_function_privilege(x.role, p.oid, 'execute')`);
  if (open.length) no('DD-3: an ungated body is executable past its wrapper: ' + open.map((o) => o.n + ' <- ' + o.role).join(', '));
  const ungated = await one(db, "select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like '%\\_\\_ungated' and p.prosecdef");
  if (!(ungated > 10)) no('DD-3: only ' + ungated + ' ungated bodies were read: the class check is reading nothing');
  r = await as(db, 'service_role', null, 'select public.clan_contribute__ungated($1::uuid, 1, 0)', [uid]);
  if (r.ok || !/permission denied/.test(r.error)) no('DD-3: the server key asking clan_contribute__ungated was answered ' + JSON.stringify(r).slice(0, 160));

  // DD-4 ─ the tables
  const refused = async (role, who, sql, what) => {
    const x = await as(db, role, who, sql);
    if (x.ok || !/permission denied/.test(x.error)) no('DD-4: ' + what + ' was answered ' + JSON.stringify(x).slice(0, 160));
  };
  await refused('authenticated', uid, `insert into public.clan_members (clan_id, user_id) values ('${U(7)}', '${uid}')`, 'a signed-in client joining a clan by a table write');
  await refused('authenticated', uid, `delete from public.clan_members where user_id = '${uid}'`, 'a signed-in client leaving a clan by a table write');
  await refused('anon', null, 'select count(*) from public.clan_members', 'an anonymous read of clan memberships');
  await refused('authenticated', uid, `insert into public.session_claims (user_id) values ('${uid}')`, 'a signed-in client claiming a session by a table write');
  await refused('authenticated', uid, 'select count(*) from public.session_claims', 'a signed-in client reading session claims');
  await refused('authenticated', uid, 'insert into public.game_events default values', 'a signed-in client writing a game event');
  await refused('authenticated', uid, 'select count(*) from public.game_saves', 'a signed-in client reading the old save archive');
  const writable = await rows(db, `select distinct c.relname::text as t from pg_class c cross join (values ('anon'), ('authenticated')) x(role)
                                    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm') and has_table_privilege(x.role, c.oid, 'insert,update,delete,truncate') order by 1`);
  if (JSON.stringify(writable.map((w) => w.t)) !== '["bug_reports"]') no('DD-4: the tables a client role can write are ' + JSON.stringify(writable.map((w) => w.t)) + ', wanted bug_reports alone');

  // DD-5 ─ the ratchet
  const doors = await rows(db, `select distinct p.proname::text as n from pg_proc p
                                 where p.pronamespace = 'public'::regnamespace and p.prokind in ('f', 'p')
                                   and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')) order by 1`);
  const names = new Set(doors.map((d) => d.n));
  if (names.size < 80 || Object.keys(CLIENT_RPCS).length < 80) no('DD-5: only ' + names.size + ' client-executable functions and ' + Object.keys(CLIENT_RPCS).length + ' client RPC names were read: the ratchet is reading nothing');
  for (const n of names) if (!(n in CLIENT_RPCS) && !(n in UNCALLED)) no('DD-5: ' + n + '() is executable by a client role, the client never calls it, and it is not on UNCALLED: close it, call it, or list it with its reason');
  for (const n of Object.keys(UNCALLED)) {
    if (!names.has(n)) no('DD-5: UNCALLED lists ' + n + ', which no client role can execute any more: delete its line');
    if (n in CLIENT_RPCS) no('DD-5: UNCALLED lists ' + n + ', which the client now calls: delete its line');
  }
  for (const n of Object.keys(CLIENT_RPCS)) if (!names.has(n) && n !== 'hr_bestiary_activate') no('DD-5: the client calls ' + n + ', which no client role can execute');

  // DD-6 ─ the engine's list
  const rep = await one(db, 'select public.hr_assert_grant_hygiene(false)');
  for (const k of ['engine_execute_outside_allowlist', 'unapproved_client_rpcs', 'ungated_client_rpcs', 'baseline_rows_no_longer_live', 'public_execute_functions']) {
    if (!rep || !Array.isArray(rep[k]) || rep[k].length) no('DD-6: the detector reports ' + k + ': ' + JSON.stringify(rep && rep[k]));
  }
  const src = String(await one(db, "select prosrc from pg_proc where oid = 'public.hr_assert_grant_hygiene(boolean)'::regprocedure"));
  const allow = (src.split('c_engine_allow constant text[] := array[')[1] || '').split('];')[0];
  const entries = [...allow.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n').matchAll(/'([a-z0-9_]+\([^']*\))'/g)].map((m) => m[1]);
  if (entries.length < 20) no('DD-6: only ' + entries.length + ' allowlist entries were read');
  const missing = [];
  for (const e of entries) if (!(await one(db, 'select to_regprocedure($1) is not null', ['public.' + e]))) missing.push(e);
  for (const e of missing) if (!STALE_ALLOW.includes(e)) no('DD-6: the engine allowlist pre-approves ' + e + ', which does not exist (a new stale entry: take it out in the file that restates the detector)');
  for (const e of STALE_ALLOW) if (!missing.includes(e)) no('DD-6: STALE_ALLOW lists ' + e + ', which is no longer a stale allowlist entry: delete its line');
  return fails;
}

/* ── THE MUTANTS: each plants one defect in the migration; the replay (its §0 / §5) or a rule must refuse it FOR ITS REASON. ── */
export const MUTANTS = [
  { name: 'a dead door is left standing', file: 'supabase/migrations/' + FILE,
    from: 'drop function if exists public.hr_trait_buy(text, integer, uuid);\n', to: '',
    expect: '§5(a): public.hr_trait_buy(text,integer,uuid) still stands' },
  { name: 'a dropped door keeps its baseline row', file: 'supabase/migrations/' + FILE,
    from: "delete from public.hr_client_rpc_baseline where proname in ('hr_claim_discord_gift', 'hr_buy_gem_unlock', 'hr_trait_buy');",
    to: "delete from public.hr_client_rpc_baseline where proname in ('hr_claim_discord_gift', 'hr_buy_gem_unlock');",
    expect: '§5(a): a baseline or Game Master wall row still names a dropped door' },
  { name: 'the engine keeps the quartermaster', file: 'supabase/migrations/' + FILE,
    from: 'revoke all on function public.hr_quartermaster_buy(uuid, integer, bigint, uuid, text) from public, anon, authenticated, service_role, hr_engine;',
    to: 'revoke all on function public.hr_quartermaster_buy(uuid, integer, bigint, uuid, text) from public, anon, authenticated, service_role;',
    expect: '§5(b): hr_engine can still execute public.hr_quartermaster_buy' },
  { name: 'the detector still pre-approves a closed engine door', file: 'supabase/migrations/' + FILE,
    from: '  c_engine_allow constant text[] := array[\n', to: "  c_engine_allow constant text[] := array[\n    'hr_dungeon_settle(uuid,integer,bigint,uuid,text,text,numeric)',\n",
    expect: '§5(b): the detector\'s allowlist still names a closed engine door' },
  { name: 'the server key keeps an ungated body', file: 'supabase/migrations/' + FILE,
    from: 'revoke all on function public.clan_feast_deposit__ungated(uuid, text, integer, integer) from public, anon, authenticated, service_role;', to: '',
    expect: '§5(c): an ungated body is executable past its wrapper: clan_feast_deposit__ungated <- service_role' },
  { name: 'clan memberships stay world-readable', file: 'supabase/migrations/' + FILE,
    from: 'drop policy if exists "memberships readable" on public.clan_members;\n', to: '',
    expect: '§5(d): a permissive policy still stands on clan_members: memberships readable' },
  { name: 'a client can still write game events', file: 'supabase/migrations/' + FILE,
    from: 'revoke all on table public.game_events from anon, authenticated;', to: 'revoke all on table public.game_events from anon;',
    expect: '§5(d): authenticated still holds a privilege on game_events' },
  { name: 'the proof skips a body that reads what is dropped', file: 'supabase/migrations/' + FILE,
    from: "'hr_trait_buy', 'hr_trait_buy__ungated', 'hr_dungeon_settle', 'hr_quartermaster_buy'];\n  v_md5 text;", to: "'hr_trait_buy', 'hr_dungeon_settle', 'hr_quartermaster_buy'];\n  v_md5 text;",
    expect: 'NOT DEAD: public.hr_trait_buy__ungated() reads hr_traits' },
];

async function main() {
  process.on('beforeExit', () => { console.log('  ✗ dead-doors stopped before its verdict (a query never settled)'); process.exit(1); });
  const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
  /* ONE MUTANT, IN ITS OWN PROCESS: exit 0 caught, 10 escaped, 20 a harness fault, 30 the wrong reason */
  if (process.argv.includes('--mutant')) {
    const mu = MUTANTS[Number(process.argv[process.argv.indexOf('--mutant') + 1])];
    const mig = mu.file.split('/').pop();
    let fails;
    try { fails = await rules((await bootReplay({ patches: new Map([[mig, [[mu.from, mu.to]]]]), upTo: FILE })).db); }
    catch (e) {
      if (e && e.harness) { console.log('harness: ' + String(e.message).split('\n')[0]); process.exit(20); }
      fails = ['replay refused it: ' + String(e.message).split('\n')[1]];
    }
    if (!fails.length) { console.log('NOT caught: ' + mu.name); process.exit(10); }
    if (!fails.some((f) => f.includes(mu.expect))) { console.log('refused for ANOTHER reason (wanted "' + mu.expect + '"): ' + fails[0].slice(0, 200)); process.exit(30); }
    console.log(fails.find((f) => f.includes(mu.expect)).slice(0, 150));
    process.exit(0);
  }
  if (process.argv.includes('--mutate')) {
    const clean = await rules((await bootReplay({ upTo: FILE })).db);
    if (clean.length) { console.log('  ✗ clean control RED: ' + clean.join('; ')); process.exit(1); }
    console.log('  ✓ clean control green');
    let bad = 0, ran = 0;
    for (const [i, mu] of MUTANTS.entries()) {
      if (only && !mu.name.includes(only)) continue;
      ran++;
      const r = spawnSync(process.execPath, [join(ROOT, 'tests', 'dead-doors.mjs'), '--mutant', String(i)], { encoding: 'utf8', timeout: 900000 });
      const said = String(r.stdout || '').trim().split('\n').pop() || String(r.stderr || '').trim().split('\n').pop() || '';
      if (r.status === 0) console.log('  ✓ ' + mu.name + ' — caught (' + said + ')');
      else { console.log('  ✗ ' + mu.name + ' — ' + (r.status === 10 ? 'NOT caught' : r.status === 30 ? said : 'harness (exit ' + r.status + '): ' + said)); bad++; }
    }
    console.log(bad || !ran ? 'dead-doors --mutate: ' + bad + ' escaped of ' + ran : 'dead-doors --mutate: ' + ran + '/' + ran + ' mutants caught');
    if (!ran) bad = 1;
    process.exit(bad ? 1 : 0);
  }
  const { db } = await bootReplay();
  const fails = await rules(db);
  for (const f of fails) console.log('  ✗ ' + f);
  console.log(fails.length ? 'dead-doors: ' + fails.length + ' rule(s) RED'
    : 'dead-doors: three dropped doors are gone, the engine is refused the two paused ones and a re-grant is named, no ungated body is past its wrapper, four tables are out of client reach, and every client door without a caller is listed with its reason (' + Object.keys(UNCALLED).length + ')');
  process.exit(fails.length ? 1 : 0);
}

if (isMain(import.meta.url)) main();
