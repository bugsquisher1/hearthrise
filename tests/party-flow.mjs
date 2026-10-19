#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/party-flow.mjs — THE ONE-WAY PARTY FLOW, EVERY STEP, ON THE REAL CHAIN.
//
//   node tests/party-flow.mjs            the guard (every arm)
//   node tests/party-flow.mjs --mutate   every planted defect must be CAUGHT by its arm
//
// mutant-anchors: supabase/migrations/2026-10-28-party-flow.sql
// mutant-writes-tree: no — each mutant is the migration text patched in memory and applied inside a rolled-back transaction
//
// Ships with supabase/migrations/2026-10-28-party-flow.sql (PARTY_SPEC.md,
// Tyler 2026-10-19). Its §7 runs once, at apply; this re-runs every step of the
// flow on each push, as `authenticated` (the real grants), one arm per step:
//   PF-INVITE   the first invite makes the party (the inviter leads, no ground);
//               oneself and an unknown name make nothing
//   PF-OWN      an own character joins at once, by slot (the strip) and by
//               name, with no invite row; again = already_member; a ground-less
//               member's own solo enter is refused (one way in: the start)
//   PF-ACCEPT   a stranger's accept takes the seat and uses the invite up
//   PF-LEAVE    leave frees the seat; the leader leaving hands the lead on
//   PF-KICK     only the leader kicks, by seat
//   PF-DISBAND  only the leader, only in town; then every seat goes
//   PF-START    start waits for everyone: an away member refuses it, nobody
//               enters and the ground stays; then all walk in on the leader's
//               ground; a new ground mid-hunt is refused
//   PF-KEEP     a member unseen 9 minutes keeps the seat, 11 loses it; the
//               leader dropped hands the lead on; a hunter is never dropped;
//               the last one swept closes the party
//   PF-IDEM     a second apply of the file is byte-identical
//   PF-GRANT    the four verbs are authenticated-only; the sweep and the
//               helpers are nobody's
// Exit: 0 green · 1 a red arm or a missed mutant · 2 a harness problem.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootReplay, inventory, ROOT } from './schema-replay.mjs';
import { isMain } from './_is-main.mjs';

const MUTATE = process.argv.includes('--mutate');
const FILE = '2026-10-28-party-flow.sql';
const SRC = () => readFileSync(join(ROOT, 'supabase', 'migrations', FILE), 'utf8').replace(/\r\n/g, '\n');
const U = ['000000c0-0000-4000-8000-0000000f1001', '000000c0-0000-4000-8000-0000000f1002', '000000c0-0000-4000-8000-0000000f1003'];
const [A, B, C] = U;
const idem = () => crypto.randomUUID();

/* As PostgREST calls it: the JWT subject set, `set role authenticated`. The first column of the first row. */
async function as(db, uid, sql, params) {
  await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
  await db.exec('set role authenticated');
  try { const r = (await db.query(sql, params)).rows[0]; return r ? Object.values(r)[0] : undefined; }
  finally { await db.exec('reset role'); }
}
const one = async (db, sql, params) => { const r = (await db.query(sql, params)).rows[0]; return r ? Object.values(r)[0] : undefined; };
const partyOf = (db, uid, slot = 0) => one(db, 'select public.hr_hunt_party_of($1, $2)', [uid, slot]);
const invite = (db, uid, name, slot = 0) => as(db, uid, 'select public.hr_hunt_party_invite($1, $2, $3::uuid)', [slot, name, idem()]);
const own = (db, uid, slot, other) => as(db, uid, 'select public.hr_hunt_party_invite_own($1, $2, $3::uuid)', [slot, other, idem()]);
const start = (db, uid, hunt) => as(db, uid, 'select public.hr_hunt_party_start(0, $1, $2::uuid)', [hunt, idem()]);
const disband = (db, uid) => as(db, uid, 'select public.hr_hunt_party_disband(0, $1::uuid)', [idem()]);
const leave = (db, uid, slot = 0) => as(db, uid, 'select public.hr_hunt_party_leave($1, $2::uuid)', [slot, idem()]);
const kick = (db, uid, seat) => as(db, uid, 'select public.hr_hunt_party_kick(0, $1, $2::uuid)', [seat, idem()]);
async function accept(db, uid) {
  const inv = await one(db, "select public.hr_state_of($1, 0)->'party_invites'", [uid]);
  return as(db, uid, 'select public.hr_hunt_party_accept(0, $1::uuid, $2::uuid)', [inv && inv[0] && inv[0].id, idem()]);
}
const seen = (db, uid, ago) => db.query(`update public.social_presence set seen_at = now() - $2::interval where user_id = $1`, [uid, ago]);
const joined = (db, uid, ago) => db.query(`update public.hunt_party_members set joined_at = now() - $2::interval where user_id = $1`, [uid, ago]);
const err = (r) => (r && r.ok === true ? 'ok' : r && r.error);

/* Three players with the game open; A and C play a second character (C's is named). Grounds from the chain. */
async function world(db) {
  const hunt = await one(db, `select g.hunt_id from public.hr_hunt_grounds g left join public.hr_hunts h on h.hunt_id = g.hunt_id
                              order by coalesce(h.band_min, 0), g.hunt_id limit 1`);
  const other = await one(db, 'select hunt_id from public.hr_hunt_grounds where hunt_id <> $1 order by hunt_id limit 1', [hunt]);
  if (!hunt) throw new Error('HARNESS: the chain has no hunt ground');
  await db.query('update public.hr_hunt_config set enabled = true where id');
  for (const [i, uid] of U.entries()) {
    await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [uid]);
    await db.query('insert into public.profiles (id, display_name) values ($1, $2) on conflict (id) do update set display_name = excluded.display_name', [uid, 'Flow ' + 'ABC'[i]]);
    await db.query("insert into public.hr_access_allowlist (user_id, note) values ($1, 'party-flow') on conflict (user_id) do nothing", [uid]);
    for (const slot of uid === B ? [0] : [0, 1]) {
      const c = await as(db, uid, 'select public.hr_create_character($1)', [slot]);
      if (!c || c.ok !== true) throw new Error('HARNESS: hr_create_character refused: ' + JSON.stringify(c));
      await db.query("update public.player_state set active_kind = 'idle', active_id = null where user_id = $1 and slot = $2", [uid, slot]);
    }
    await db.query('insert into public.social_presence (user_id, slot, seen_at) values ($1, 0, now()) on conflict (user_id) do update set seen_at = now()', [uid]);
  }
  const n = await as(db, C, 'select public.hr_character_name_set(1, $1, $2::uuid)', ['Flow Calt', idem()]);
  if (!n || n.ok !== true) throw new Error('HARNESS: naming C/1 refused: ' + JSON.stringify(n));
  await db.query('delete from public.hr_rate_counters');
  return { hunt, other };
}

/* A and its own second character, then B by invite + accept: a party of three, A leading. */
async function threeOf(db) {
  const p = [];
  if (err(await invite(db, A, 'Flow B')) !== 'ok') p.push('the first invite was refused');
  if (err(await own(db, A, 0, 1)) !== 'ok') p.push('the own invite was refused');
  if (err(await accept(db, B)) !== 'ok') p.push('the accept was refused');
  return p;
}

// ═══════════════════════════════════════════════════════════════════════
const ARMS = {
  'PF-INVITE': async (db) => {
    const p = [];
    await world(db);
    if (err(await invite(db, A, 'Flow A')) !== 'self' || await partyOf(db, A)) p.push('inviting oneself was not refused `self`, or made a party');
    if (err(await invite(db, A, 'Nobody Of That Name')) !== 'no_such_name' || await partyOf(db, A)) p.push('an unknown name was not refused, or made a party');
    const r = await invite(db, A, 'flow b');
    const pid = await partyOf(db, A);
    if (err(r) !== 'ok' || !pid) return [...p, 'the first invite did not make a party: ' + JSON.stringify(r)];
    const row = (await db.query('select hunt_id, leader_user, leader_slot from public.hunt_parties where id = $1', [pid])).rows[0];
    if (row.hunt_id !== null || row.leader_user !== A || row.leader_slot !== 0) p.push('the new party is ' + JSON.stringify(row) + ', want no ground and A leading');
    const inv = await one(db, "select public.hr_state_of($1, 0)->'party_invites'", [B]);
    if (!Array.isArray(inv) || inv.length !== 1 || inv[0].party !== pid || inv[0].hunt !== null || inv[0].from !== 'Flow A') p.push('B sees ' + JSON.stringify(inv));
    return p;
  },

  'PF-OWN': async (db) => {
    const p = [];
    const { hunt } = await world(db);
    if (err(await own(db, A, 0, 0)) !== 'self') p.push('an own invite to the same slot was not refused `self`');
    const r = await own(db, A, 0, 1);
    const pid = await partyOf(db, A);
    if (err(r) !== 'ok' || !pid || await partyOf(db, A, 1) !== pid) p.push('the own invite by slot did not seat A/1: ' + JSON.stringify(r));
    if (Number(await one(db, 'select count(*) from public.hunt_party_invites where to_user = $1', [A])) !== 0) p.push('the own invite wrote an invite row (an accept step)');
    if (err(await own(db, A, 0, 1)) !== 'already_member') p.push('a second own invite was not refused `already_member`');
    const c = await invite(db, C, 'Flow Calt');
    const cp = await partyOf(db, C);
    if (err(c) !== 'ok' || !cp || await partyOf(db, C, 1) !== cp) p.push('an own character invited by NAME was not seated at once: ' + JSON.stringify(c));
    const e = await as(db, C, 'select public.hr_hunt_enter(1, $1, $2::jsonb, 0, null, $3::uuid)', [hunt, '[]', idem()]);
    if (err(e) !== 'party_hunt_mismatch') p.push('a ground-less member entered on its own: ' + JSON.stringify(e));
    return p;
  },

  'PF-ACCEPT': async (db) => {
    await world(db);
    await invite(db, A, 'Flow B');
    const pid = await partyOf(db, A);
    const r = await accept(db, B);
    const p = [];
    if (err(r) !== 'ok' || await partyOf(db, B) !== pid) p.push('the accept did not seat B: ' + JSON.stringify(r));
    if (Number(await one(db, 'select count(*) from public.hunt_party_invites where to_user = $1', [B])) !== 0) p.push('the accept left the invite');
    return p;
  },

  'PF-LEAVE': async (db) => {
    await world(db);
    const p = await threeOf(db);
    const pid = await partyOf(db, A);
    if (err(await leave(db, B)) !== 'ok' || await partyOf(db, B)) p.push('B could not leave');
    if (err(await leave(db, A)) !== 'ok' || await partyOf(db, A)) p.push('the leader could not leave');
    const lead = (await db.query('select leader_user, leader_slot, closed_at from public.hunt_parties where id = $1', [pid])).rows[0];
    if (lead.leader_user !== A || lead.leader_slot !== 1 || lead.closed_at !== null) p.push('the lead did not pass to the next seat: ' + JSON.stringify(lead));
    return p;
  },

  'PF-KICK': async (db) => {
    await world(db);
    const p = await threeOf(db);
    const seat = Number(await one(db, 'select seat from public.hunt_party_members where user_id = $1', [B]));
    if (err(await kick(db, B, 1)) !== 'not_leader') p.push('a member kicked');
    if (err(await kick(db, A, seat)) !== 'ok' || await partyOf(db, B)) p.push('the leader could not kick B');
    return p;
  },

  'PF-DISBAND': async (db) => {
    const { hunt } = await world(db);
    const p = await threeOf(db);
    const pid = await partyOf(db, A);
    if (err(await disband(db, B)) !== 'not_leader') p.push('a member disbanded the party');
    const s = await start(db, A, hunt);
    if (err(s) !== 'ok') return [...p, 'HARNESS: the start was refused: ' + JSON.stringify(s)];
    if (err(await disband(db, A)) !== 'party_hunting') p.push('the party was disbanded mid-hunt');
    await db.query("select public.hr_hunt_close(h.id, 'left', now(), true) from public.hunt_sessions h where h.instance_id = $1 and h.ended_at is null", [pid]);
    if (err(await disband(db, A)) !== 'ok') p.push('the leader could not disband in town');
    const left = Number(await one(db, 'select count(*) from public.hunt_party_members where party_id = $1', [pid]));
    if (left || !(await one(db, 'select closed_at from public.hunt_parties where id = $1', [pid]))) p.push('the disbanded party kept ' + left + ' seats or stayed open');
    return p;
  },

  'PF-START': async (db) => {
    const { hunt, other } = await world(db);
    const p = await threeOf(db);
    const pid = await partyOf(db, A);
    if (err(await start(db, B, hunt)) !== 'not_leader') p.push('a member started the hunt');
    await seen(db, B, '2 minutes');
    await joined(db, B, '2 minutes');
    const view = await one(db, 'select public.hr_hunt_party_view($1, 0)', [A]);
    const mb = (view.members || []).find((m) => m.name === 'Flow B');
    if (!mb || mb.away !== true || !(mb.seat_ms > 470000 && mb.seat_ms <= 480000)) p.push('the party section says B is ' + JSON.stringify(mb));
    if (err(await start(db, A, 'no_such_ground')) !== 'no_ground') p.push('an unknown ground was not refused');
    const r = await start(db, A, hunt);
    const open = Number(await one(db, 'select count(*) from public.hunt_sessions where user_id = any ($1::uuid[]) and ended_at is null', [U]));
    if (err(r) !== 'not_ready' || !(r.seats || []).some((x) => x.name === 'Flow B' && x.error === 'away') || open) {
      p.push('an away member did not hold the start back (answer ' + JSON.stringify(r) + ', ' + open + ' entered)');
    }
    if (await one(db, 'select hunt_id from public.hunt_parties where id = $1', [pid]) !== null) p.push('a refused start kept its ground');
    await seen(db, B, '0 seconds');
    const s = await start(db, A, hunt);
    const n = Number(await one(db, 'select count(*) from public.hunt_sessions where instance_id = $1 and ended_at is null', [pid]));
    if (err(s) !== 'ok' || s.entered !== 3 || n !== 3) p.push('the start did not walk all three in: ' + JSON.stringify(s));
    if (await one(db, 'select hunt_id from public.hunt_parties where id = $1', [pid]) !== hunt) p.push('the start did not set the leader\'s ground');
    if (other && err(await start(db, A, other)) !== 'party_hunting') p.push('a new ground was taken mid-hunt');
    return p;
  },

  'PF-KEEP': async (db) => {
    const { hunt } = await world(db);
    const p = [];
    await invite(db, A, 'Flow B');
    await accept(db, B);
    const pid = await partyOf(db, A);
    await joined(db, A, '1 hour');
    await joined(db, B, '1 hour');
    await seen(db, A, '9 minutes');
    await db.query('select public.hr_hunt_party_sweep(200)');
    if (await partyOf(db, A) !== pid) p.push('a seat unseen for 9 minutes was dropped');
    await seen(db, A, '11 minutes');
    await db.query('select public.hr_hunt_party_sweep(200)');
    const lead = await one(db, 'select leader_user from public.hunt_parties where id = $1', [pid]);
    if (await partyOf(db, A) || await partyOf(db, B) !== pid || lead !== B) p.push('the 11-minute sweep left A seated or the lead with ' + lead);
    /* A hunter keeps its seat however long unseen (it hunts on, server-side). */
    await seen(db, A, '0 seconds');
    await invite(db, B, 'Flow A');
    await accept(db, A);
    const s = await start(db, B, hunt);
    if (err(s) !== 'ok') return [...p, 'HARNESS: the start was refused: ' + JSON.stringify(s)];
    await seen(db, A, '1 hour');
    await joined(db, A, '1 hour');
    await db.query('select public.hr_hunt_party_sweep(200)');
    if (await partyOf(db, A) !== pid) p.push('the sweep dropped a hunter');
    await db.query("select public.hr_hunt_close(h.id, 'left', now(), true) from public.hunt_sessions h where h.instance_id = $1 and h.ended_at is null", [pid]);
    await seen(db, B, '1 hour');
    await joined(db, B, '1 hour');
    await db.query('select public.hr_hunt_party_sweep(200)');
    if (!(await one(db, 'select closed_at from public.hunt_parties where id = $1', [pid]))) p.push('the last seats swept did not close the party');
    return p;
  },

  'PF-IDEM': async (db) => {
    const snap = async () => JSON.stringify([await inventory(db),
      (await db.query(`select p.oid::regprocedure::text f, md5(p.prosrc) h, coalesce(p.proacl::text, '') a from pg_proc p
                       where p.pronamespace = 'public'::regnamespace order by 1`)).rows,
      (await db.query('select proname, identity_args, grantee, note from public.hr_client_rpc_baseline order by 1, 2, 3')).rows]);
    const before = await snap();
    try { await db.exec(SRC()); } catch (e) { return ['the second apply RAISED: ' + String(e.message).split('\n')[0]]; }
    return before === await snap() ? [] : ['a second apply moved the schema, a body, an ACL or a baseline row'];
  },

  'PF-GRANT': async (db) => {
    const p = [];
    const can = (role, fn) => one(db, 'select has_function_privilege($1, $2, \'execute\')', [role, fn]);
    for (const fn of ['public.hr_hunt_party_invite(integer,text,uuid)', 'public.hr_hunt_party_invite_own(integer,integer,uuid)',
      'public.hr_hunt_party_disband(integer,uuid)', 'public.hr_hunt_party_start(integer,text,uuid)']) {
      if (!(await can('authenticated', fn))) p.push('authenticated cannot call ' + fn);
      if (await can('anon', fn)) p.push('anon can call ' + fn);
    }
    for (const fn of ['public.hr_hunt_party_sweep(integer)', 'public.hr_party_seat_own(uuid,integer,integer)', 'public.hr_party_drop(uuid,uuid,integer)',
      'public.hr_party_open(uuid,integer)', 'public.hr_party_seat_into(uuid,uuid,integer)', 'public.hr_party_away(uuid,integer,timestamp with time zone)']) {
      if (await can('authenticated', fn) || await can('anon', fn)) p.push('a client role can call ' + fn);
    }
    if (await one(db, "select to_regprocedure('public.hr_hunt_party_start(integer,uuid)') is not null")) p.push('the ground-less start (int, uuid) is still installed');
    return p;
  },
};

/* Each mutant: [find, replace] in the migration, the arm that must go red. Its §7 is made an uncalled function. */
const MUTANTS = [
  { arm: 'PF-INVITE', why: 'the first invite needs a party made first',
    find: '      v_pid := public.hr_party_open(v_uid, p_slot);\n    end if;\n    select * into v_p',
    repl: "      return public.hr_note_rejection('hunt_party_invite', p_slot, jsonb_build_object('ok', false, 'error', 'no_party'));\n    end if;\n    select * into v_p" },
  { arm: 'PF-OWN', why: 'an own character is not seated',
    find: '  perform public.hr_party_seat_into(v_pid, p_user, p_other);', repl: '  perform 1;' },
  { arm: 'PF-OWN', why: 'a ground-less party matches any hunt',
    find: '    if v_p.hunt_id is distinct from p_hunt then\n      return jsonb_build_object(\'ok\', false, \'error\', \'party_hunt_mismatch\'',
    repl: '    if v_p.hunt_id <> p_hunt then\n      return jsonb_build_object(\'ok\', false, \'error\', \'party_hunt_mismatch\'' },
  { arm: 'PF-DISBAND', why: 'the party is disbanded mid-hunt',
    find: "  if exists (select 1 from public.hunt_sessions h where h.instance_id = v_pid and h.ended_at is null) then\n    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'party_hunting')); end if;\n  delete from public.hunt_party_invites where party_id = v_pid;",
    repl: '  delete from public.hunt_party_invites where party_id = v_pid;' },
  { arm: 'PF-START', why: 'the start marches an away member in',
    find: '      if v_m.user_id <> v_uid and public.hr_party_away(v_m.user_id, v_m.slot, v_m.joined_at) then',
    repl: '      if false then' },
  { arm: 'PF-START', why: 'the start never writes the leader\'s ground',
    find: '    update public.hunt_parties set hunt_id = p_hunt where id = v_pid and hunt_id is distinct from p_hunt;', repl: '    perform 1;' },
  { arm: 'PF-KEEP', why: 'the sweep drops a seat the moment it is away',
    find: "returns interval language sql immutable set search_path = public, pg_catalog as $$ select interval '10 minutes' $$;",
    repl: "returns interval language sql immutable set search_path = public, pg_catalog as $$ select interval '75 seconds' $$;" },
  /* (the sweep proves "not hunting" twice, in its scan and again under the party lock: the mutant drops both) */
  { arm: 'PF-KEEP', why: 'the sweep drops a hunter',
    find: '     where not exists (select 1 from public.hunt_sessions h where h.user_id = m.user_id and h.slot = m.slot and h.ended_at is null)\n       and public.hr_party_last_seen',
    repl: '     where true\n       and public.hr_party_last_seen',
    also: ['               or exists (select 1 from public.hunt_sessions h where h.user_id = v_m.user_id and h.slot = v_m.slot and h.ended_at is null);',
      '               or false;'] },
  { arm: 'PF-GRANT', why: 'the sweep is granted to authenticated',
    find: 'revoke execute on function public.hr_hunt_party_sweep(int) from public, anon, authenticated, service_role;',
    repl: 'revoke execute on function public.hr_hunt_party_sweep(int) from public, anon, service_role;\ngrant execute on function public.hr_hunt_party_sweep(int) to authenticated;' },
];

function selfCheckOff(src) {
  const m = src.match(/\n(-- (?:── )?§\d+ SELF-CHECK[^\n]*(?:\n--[^\n]*)*)\n(do \$(\w*)\$)/);
  if (!m) throw new Error('no self-check heading in ' + FILE);
  /* (a function replacer: a replacement STRING would read $$ as one $) */
  return src.replace(m[1] + '\n' + m[2], () => m[1] + '\ncreate or replace function pg_temp.pf_selfcheck_off() returns void language plpgsql as $' + m[3] + '$');
}

async function runArm(db, name, prelude) {
  await db.query('begin');
  try {
    if (prelude) await db.exec(prelude);
    return await ARMS[name](db);
  } catch (e) { return ['HARNESS: ' + String(e.message).slice(0, 300)]; }
  finally { await db.query('rollback'); }
}

async function main() {
  let db;
  try { ({ db } = await bootReplay()); } catch (e) { console.error('✗ the chain would not replay: ' + String(e.message).slice(0, 400)); process.exit(2); }
  if (!MUTATE) {
    let bad = 0;
    for (const name of Object.keys(ARMS)) {
      const p = await runArm(db, name);
      if (p.length) { bad++; for (const x of p) console.error(`✗ ${name}: ${x}`); } else console.log(`✓ ${name}`);
    }
    console.log(bad ? `party-flow: ${bad} of ${Object.keys(ARMS).length} arms red` : `party-flow: green — ${Object.keys(ARMS).length} arms`);
    await db.close().catch(() => {});
    process.exit(bad ? 1 : 0);
  }
  /* The control: the file re-applied with its self-check off and nothing planted keeps every mutant's arm green. */
  const base = selfCheckOff(SRC());
  let missed = 0;
  for (const arm of new Set(MUTANTS.map((m) => m.arm))) {
    const p = await runArm(db, arm, base);
    if (p.length) { console.error(`✗ CONTROL ${arm} is red with nothing planted: ${p[0]}`); missed++; }
  }
  for (const mu of MUTANTS) {
    const edits = [[mu.find, mu.repl], ...(mu.also ? [mu.also] : [])];
    if (edits.some(([f]) => !base.includes(f))) { console.error(`✗ ${mu.arm} (${mu.why}): anchor not found`); missed++; continue; }
    const planted = edits.reduce((s, [f, r]) => s.replace(f, () => r), base);
    const p = (await runArm(db, mu.arm, planted)).filter((x) => !x.startsWith('HARNESS'));
    if (p.length) console.log(`✓ ${mu.arm} catches: ${mu.why} — ${p[0].slice(0, 120)}`);
    else { console.error(`✗ ${mu.arm} MISSED: ${mu.why}`); missed++; }
  }
  await db.close().catch(() => {});
  console.log(missed ? `party-flow --mutate: ${missed} missed or red` : `party-flow --mutate: all ${MUTANTS.length} mutants caught`);
  process.exit(missed ? 1 : 0);
}

if (isMain(import.meta.url)) main();
