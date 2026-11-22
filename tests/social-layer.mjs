#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/social-layer.mjs — THE CHEAP SOCIAL LAYER ON THE REPLAYED CHAIN (lane/c-social, FB-12; supabase/migrations/1036 to 1039).
//
//   node tests/social-layer.mjs            the arms
//   node tests/social-layer.mjs --mutate   every planted defect must turn its arm red
//
// mutant-anchors: none — every arm reads the real replayed chain; the migrations' own §4/§5 self-checks run on the same replay
//
// Each arm runs in its own transaction, rolled back, as the request role where a player acts (set role authenticated, the JWT's sub):
//   SL-RULES   the server's rules are tools/gen-social-catalogue.mjs catalogueOf(the data), row for row (the founding price 25-6, Global's
//              batch and slow mode 31-1, the friend link's window GR-72)
//   SL-LINK    THE FRIEND LINK FROM BOTH SIDES (GR-72): A's code, B (a new account) arrives by it; A's friends list B and B's list A, one
//              friendship row, nothing else written; a second use, an old account and a bad code are refused
//   SL-CLAN    FOUND, FIND, JOIN, TALK: A founds a clan for exactly the server's price (one ledger row kind clan); B finds it by its tag and
//              joins; the roster lists both, the leader first; B's clan line reaches A's history; C, no member, reads none of it from the
//              table and is refused the clan channel
//   SL-HIDDEN  THE CASTLE IS HIDDEN, NEVER DROPPED (X-04, T-12): every hidden call still exists, and the request role calling it is refused
//   SL-STRIP   THE PRESENCE STRIP answers a ground nobody hunts with a total of 0 and no party, and refuses a malformed ground
//
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';
import { CLAN_HIDDEN_CALLS } from './_clan-hidden.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const A = '000000c0-0000-4000-a000-00005c1a0001';
const B = '000000c0-0000-4000-a000-00005c1a0002';
const C = '000000c0-0000-4000-a000-00005c1a0003';

const one = async (db, sql, args) => { const r = await db.query(sql, args); const row = r.rows[0]; return row ? row[Object.keys(row)[0]] : null; };
/* act as a player: the request role and its JWT subject, for one statement; the owner again after */
async function as(db, uid, sql, args) {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid]);
  await db.query('set role authenticated');
  try { return await one(db, sql, args); } finally { await db.query('reset role'); await db.query(`select set_config('request.jwt.claim.sub', '', false)`); }
}
async function players(db, list) {
  for (const [uid, name, ageHours] of list) {
    await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [uid]);
    await db.query(`insert into public.profiles (id, display_name, created_at) values ($1, $2, now() - make_interval(hours => $3))
                    on conflict (id) do update set display_name = excluded.display_name, created_at = excluded.created_at`, [uid, name, ageHours]);
    await db.query(`insert into public.hr_access_allowlist (user_id, note) values ($1, 'social-layer') on conflict (user_id) do nothing`, [uid]);
    const v = await as(db, uid, 'select public.hr_create_character(0)');
    if (!v || v.ok !== true) throw Object.assign(new Error('hr_create_character refused: ' + JSON.stringify(v)), { harness: true });
  }
}

const ARMS = {
  'SL-RULES': async (db) => {
    const bad = [];
    const G = await import(pathToFileURL(join(ROOT, 'tools/gen-social-catalogue.mjs')).href);
    const c = G.catalogueOf(await G.loadData(ROOT));
    const clan = (await db.query('select found_gold::int, name_min, name_max, tag_min, tag_max, browser_max, invite_days from public.hr_clan_rules')).rows;
    if (clan.length !== 1 || JSON.stringify(Object.values(clan[0])) !== JSON.stringify([c.clan.found, c.clan.nameMin, c.clan.nameMax, c.clan.tagMin, c.clan.tagMax, c.clan.browser, c.clan.invite]))
      bad.push('hr_clan_rules reads ' + JSON.stringify(clan) + ', the data ' + JSON.stringify(c.clan));
    const batch = (await db.query('select every_s, settle_s, max_lines from public.hr_chat_global_rule')).rows;
    if (batch.length !== 1 || JSON.stringify(Object.values(batch[0])) !== JSON.stringify([c.batch.every, c.batch.settle, c.batch.max])) bad.push('hr_chat_global_rule reads ' + JSON.stringify(batch));
    const slow = (await db.query('select lines_per_min, gap_s from public.hr_chat_slow_mode order by lines_per_min')).rows.map((r) => [r.lines_per_min, r.gap_s]);
    if (JSON.stringify(slow) !== JSON.stringify(c.slow.map((s) => [s.rate, s.gap]))) bad.push('hr_chat_slow_mode reads ' + JSON.stringify(slow));
    const hours = await one(db, 'select new_hours from public.hr_friend_link_rule');
    if (hours !== c.link.hours) bad.push('hr_friend_link_rule reads ' + hours + ', the data ' + c.link.hours);
    return bad;
  },

  'SL-LINK': async (db) => {
    const bad = [];
    await players(db, [[A, 'Probe Sharer', 24 * 30], [B, 'Probe Newcomer', 1], [C, 'Probe Veteran', 24 * 30]]);
    const ledger0 = Number(await one(db, 'select count(*) from public.player_ledger where user_id in ($1, $2)', [A, B]));
    const code = (await as(db, A, 'select public.hr_friend_link()')).code;
    if (!/^[a-z0-9]{10}$/.test(String(code))) bad.push('A\'s code reads ' + code);
    const r = await as(db, B, 'select public.hr_friend_link_redeem($1)', [code]);
    if (!r || r.ok !== true || !r.person || r.person.id !== A) bad.push('B arriving by A\'s link answered ' + JSON.stringify(r));
    const listed = async (me, them) => ((await as(db, me, 'select public.hr_social_state(0)')).friends || []).some((f) => f.id === them);
    if (!await listed(A, B)) bad.push('A\'s friends do not list B');
    if (!await listed(B, A)) bad.push('B\'s friends do not list A');
    if (Number(await one(db, 'select count(*) from public.friend_links where user_lo = least($1::uuid, $2::uuid) and user_hi = greatest($1::uuid, $2::uuid)', [A, B])) !== 1)
      bad.push('not one friendship row');
    if (Number(await one(db, 'select count(*) from public.player_ledger where user_id in ($1, $2)', [A, B])) !== ledger0) bad.push('the link wrote to the ledger (a reward)');
    const again = await as(db, B, 'select public.hr_friend_link_redeem($1)', [code]);
    if (!again || again.error !== 'used') bad.push('a second use answered ' + JSON.stringify(again));
    const old = await as(db, C, 'select public.hr_friend_link_redeem($1)', [code]);
    if (!old || old.error !== 'not_new') bad.push('an old account answered ' + JSON.stringify(old));
    const wrong = await as(db, C, 'select public.hr_friend_link_redeem($1)', ['zzzzzzzzzz']);
    if (!wrong || wrong.error !== 'bad_code') bad.push('a bad code answered ' + JSON.stringify(wrong));
    return bad;
  },

  'SL-CLAN': async (db) => {
    const bad = [];
    await players(db, [[A, 'Probe Founder', 24 * 30], [B, 'Probe Joiner', 24 * 30], [C, 'Probe Outsider', 24 * 30]]);
    const price = Number(await one(db, 'select found_gold from public.hr_clan_rules'));
    await db.query('insert into public.account_wallet as w (user_id, gold) values ($1, $2) on conflict (user_id) do update set gold = excluded.gold', [A, price + 5]);
    const roster0 = await as(db, A, 'select public.hr_clan_roster()');
    if (!roster0 || roster0.clan !== null || Number(roster0.price) !== price) bad.push('the roster before quotes ' + JSON.stringify(roster0));
    const f = await as(db, A, 'select public.hr_clan_found(0, $1, $2, $3, $4, $5::uuid)', ['Sl Probe Hall', 'slp', 'open', price, crypto.randomUUID()]);
    if (!f || f.ok !== true || !f.clan || f.clan.tag !== 'SLP') bad.push('the founding answered ' + JSON.stringify(f));
    const id = f && f.clan && f.clan.id;
    if (Number(await one(db, 'select gold from public.account_wallet where user_id = $1', [A])) !== 5) bad.push('the purse did not fall by exactly the price');
    if (Number(await one(db, `select count(*) from public.player_ledger where user_id = $1 and kind = 'clan' and gold = $2`, [A, -price])) !== 1) bad.push('the charge is not one ledger row kind clan');
    const found = await as(db, B, 'select public.hr_clan_browser($1, 10)', ['sl']);
    if (!found || !(found.clans || []).some((c) => c.id === id)) bad.push('B\'s search by tag read ' + JSON.stringify(found));
    const j = await as(db, B, 'select public.clan_join($1::uuid)', [id]);
    if (!j || j.ok !== true) bad.push('B could not join: ' + JSON.stringify(j));
    const roster = await as(db, A, 'select public.hr_clan_roster()');
    const ids = ((roster && roster.members) || []).map((m) => m.id + ':' + m.role);
    if (ids.join(',') !== A + ':leader,' + B + ':member') bad.push('the roster reads ' + JSON.stringify(ids));
    await db.query('delete from public.hr_rate_counters where user_id in ($1, $2, $3)', [A, B, C]);
    const line = await as(db, B, `select public.hr_chat_send(0, 'clan', 'sl clan probe')`);
    if (!line || line.ok !== true || line.line.channel !== 'clan:' + id) bad.push('B\'s clan line answered ' + JSON.stringify(line));
    const hist = await as(db, A, 'select public.hr_chat_recent(0)');
    if (!hist || hist.clan !== 'clan:' + id || !(hist.lines || []).some((l) => l.body === 'sl clan probe')) bad.push('A does not read B\'s clan line: ' + JSON.stringify(hist && hist.clan));
    const seen = Number(await as(db, C, 'select count(*) from public.chat_messages where channel = $1', ['clan:' + id]));
    if (seen !== 0) bad.push('C, no member, reads ' + seen + ' clan lines from the table');
    const cs = await as(db, C, `select public.hr_chat_send(0, 'clan', 'x')`);
    if (!cs || cs.error !== 'not_in_clan') bad.push('C\'s clan line answered ' + JSON.stringify(cs));
    return bad;
  },

  'SL-HIDDEN': async (db) => {
    const bad = [];
    for (const name of CLAN_HIDDEN_CALLS) {
      const sigs = (await db.query(`select p.oid::regprocedure::text as sig, pg_get_function_identity_arguments(p.oid) as args, p.pronargs as n
                                      from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = $1`, [name])).rows;
      if (!sigs.length) { bad.push(name + ' was dropped'); continue; }
      for (const s of sigs) {
        await db.query('savepoint sl_hidden');
        let refused = false;
        try {
          await db.query('set role authenticated');
          await db.query(`select public.${name}(${Array.from({ length: s.n }, () => 'null').join(', ')})`);
        } catch (e) { refused = /permission denied/i.test(String(e.message)); }
        await db.query('rollback to savepoint sl_hidden');
        await db.query('reset role');
        if (!refused) bad.push('the request role ran ' + s.sig);
      }
    }
    return bad;
  },

  'SL-STRIP': async (db) => {
    const bad = [];
    await players(db, [[A, 'Probe Strip', 24 * 30]]);
    const ground = await one(db, 'select hunt_id from public.hr_hunt_grounds order by hunt_id limit 1');
    const v = await as(db, A, 'select public.hr_ground_presence(0, $1)', [ground]);
    if (!v || v.ok !== true || v.total !== 0 || (v.parties || []).length) bad.push('an empty ground reads ' + JSON.stringify(v));
    const badHunt = await as(db, A, 'select public.hr_ground_presence(0, $1)', ['Not A Ground']);
    if (!badHunt || badHunt.error !== 'bad_hunt') bad.push('a malformed ground answered ' + JSON.stringify(badHunt));
    return bad;
  },
};

/* --mutate: each plant, made in the arm's own transaction before it runs, must turn that arm red (a throw is a harness, never a catch). */
const MUTANTS = [
  { arm: 'SL-RULES', name: 'the server\'s slow mode drifts from the data', sql: 'update public.hr_chat_slow_mode set gap_s = gap_s + 1' },
  { arm: 'SL-LINK', name: 'an old account counts as new', sql: 'update public.hr_friend_link_rule set new_hours = 720' },
  { arm: 'SL-CLAN', name: 'every signed-in player reads every clan\'s lines', sql: `drop policy if exists "clan channel readable by members" on public.chat_messages;
      create policy "clan channel readable by members" on public.chat_messages for select using (channel like 'clan:%')` },
  { arm: 'SL-HIDDEN', name: 'a castle call is granted to the client', sql: 'grant execute on function public.clan_contribute(uuid, bigint, integer) to authenticated' },
  { arm: 'SL-STRIP', name: 'the strip lists the caller\'s own party', sql: `create or replace function public.hr_ground_presence(p_slot int, p_hunt text) returns jsonb language sql as $f$
      select jsonb_build_object('ok', true, 'hunt', p_hunt, 'total', 1, 'parties', '[]'::jsonb) $f$` },
];

async function runArm(db, name, plant) {
  let problems;
  await db.query('begin');
  try {
    if (plant) await db.exec(plant);
    problems = await ARMS[name](db);
  } catch (e) { problems = [(e.harness ? 'harness: ' : 'threw: ') + String(e.message).slice(0, 400)]; }
  await db.query('rollback');
  await db.query('reset role');
  return problems;
}

async function main() {
  const { bootReplay } = await import('./schema-replay.mjs');
  let db;
  try { ({ db } = await bootReplay()); } catch (e) { console.error('✗ the chain would not replay: ' + String(e.message).slice(0, 600)); process.exit(2); }
  if (process.argv.includes('--mutate')) {
    let bad = 0;
    for (const m of MUTANTS) {
      const p = await runArm(db, m.arm, m.sql);
      const caught = p.length && !/^(harness|threw)/.test(p[0]);
      if (!caught) bad++;
      console.log((caught ? '✓ ' + m.arm + ' goes red on: ' : '✗ ' + m.arm + ' stayed green (or threw) on: ') + m.name + (p[0] ? '  (' + p[0].slice(0, 110) + ')' : ''));
    }
    console.log(bad ? 'social-layer --mutate: ' + bad + ' mutant(s) survived' : 'social-layer --mutate: all ' + MUTANTS.length + ' mutants killed');
    process.exit(bad ? 1 : 0);
  }
  let red = 0;
  for (const name of Object.keys(ARMS)) {
    const problems = await runArm(db, name, null);
    if (problems.length) { red++; for (const p of problems) console.error('✗ ' + name + ': ' + p); } else console.log('✓ ' + name);
  }
  console.log(red ? 'social-layer: ' + red + ' arm(s) red' : 'social-layer: all ' + Object.keys(ARMS).length + ' arms green');
  process.exit(red ? 1 : 0);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
