#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/char-wipe.mjs — THE DECLARED WIPE, THE WHOLE PROCEDURE IN ORDER, ON THE REPLAYED CHAIN: A PLAYED ACCOUNT COMES OUT WITH NOTHING BUT
//   ITSELF, OWNS THE TWO STARTING SLOTS, AND CAN PLAY AGAIN (supabase/migrations/2027-02-25-character-wipe.sql).
//
//   node tests/char-wipe.mjs            the guard
//   node tests/char-wipe.mjs --mutate   every planted defect must turn its arm red
//   node tests/char-wipe.mjs --preflight-sql   read-only SQL for the Coordinator to run on live before step 1 of the procedure
//
// mutant-anchors: supabase/migrations/2027-02-25-character-wipe.sql
//
// The file is STAGED in `excluded`, so this replays the chain CLOSED, as production is, and runs each file of the procedure itself,
// inside one transaction that rolls back. The page half (a real browser reloading after it, the real engine) is tests/char-wipe-world.mjs.
//
//   CW-ORDER    in `excluded` with a STAGED note, never in `order`; the note names the whole order
//   CW-LISTS    every table in tests/restore-census.baseline.json is on the list its class says
//   CW-REFUSE   refused with the market on, its tables full, the sweep scheduled, or the game open; nothing moved
//   CW-UNKNOWN  a table added since (user_id or none at all), or a person column on a no-player table, refuses by name
//   CW-SINKS    every table the gold sink lanes add is on the list the design says, in one edit; a name with no table yet is skipped
//   CW-APPLY    the procedure in order: 39+ relations named the account before; after, only the rows meant to stay do, read as text from
//               every row of every relation in every schema; every wiped table is empty, for everyone
//   CW-WORKS    the Town Works' totals and plaque are cleared and the Weighhouse reads stage 0, with its project row still there to fund
//   CW-KEPT     auth, the allowlist, friends, blocks, bug reports, signup log, catalogues and config all stand; the profile is a fresh signup's
//   CW-SLOTS    a bought slot goes: the account owns the catalogue's starters and no more
//   CW-STALE    a settle computed before the wipe, a stale tab's residue and verbs: refused, no ghost row
//   CW-JOBS     every scheduled job's own command answers on the empty world and brings nothing back
//   CW-PLAY     the same account makes a Level 1 hero and goes hunting; its old name is free for anyone, a moderated one still isn't
//   CW-CLOSED   an account on no list is still refused hr_closed, and the allowlist decides as before
//   CW-BOARDS   the boards rank nobody
//   CW-RESUME   the sweep comes back as it was and the market opens
//   CW-ONCE     a second apply is a no-op: the new hero is untouched
//
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, manifest, ROOT } from './schema-replay.mjs';

const MUTATE = process.argv.includes('--mutate') || process.argv.includes('--selftest');
const CONTROL = Boolean(process.env.HR_MUTANT_CONTROL);
const FILE = '2027-02-25-character-wipe.sql';
const read = async (f) => (await readFile(join(ROOT, 'supabase', 'migrations', f), 'utf8')).replace(/\r\n/g, '\n');
const SRC = { wipe: await read(FILE), mWipe: await read('2027-02-20-market-wipe.sql'), resume: await read('2027-02-20-market-wipe-resume.sql'), on: await read('2027-02-14-market-on.sql'), off: await read('2027-02-14-market-off.sql') };
const js = (v) => String(JSON.stringify(v === undefined ? null : v));
const uid = (n) => '000000c1-0000-4000-8000-0000c4a2' + String(n).padStart(4, '0');
const key = () => crypto.randomUUID();
const listOf = (name, sql = SRC.wipe) => {
  const m = sql.match(new RegExp('c_' + name + ' constant text\\[\\] := array\\[([\\s\\S]*?)\\];'));
  if (!m) throw Object.assign(new Error('no list c_' + name), { harness: true });
  return [...m[1].matchAll(/'([a-z_0-9]+)'/g)].map((x) => x[1]);
};
/* What a player leaves in place, by design: their account and the choices that aren't progress. */
const MAY_NAME = new Set(['auth.users', 'public.profiles', 'public.hr_access_allowlist', 'public.friend_links', 'public.friend_requests', 'public.chat_blocks', 'public.bug_reports', 'public.beta_signup_log', 'public.beta_invites', 'public.hr_lb_hidden']);

async function namesIn(db, id) {
  const rels = (await db.query(`select n.nspname s, c.relname t from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p', 'm') and n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast')`)).rows;
  const hits = [];
  for (const { s, t } of rels) {
    const n = (await db.query(`select count(*)::int n from "${s}"."${t}" x where x::text like $1`, ['%' + id + '%'])).rows[0].n;
    if (n) hits.push(s + '.' + t);
  }
  return { hits, read: rels.length };
}

async function scenario(db, wipeSql) {
  const red = new Map();
  const arm = (id, ok, good, bad) => { if (!MUTATE) console.log(ok ? `  ✓ ${id} — ${good}` : `  ✗ ${id} — ${bad}`); if (!ok) red.set(id, bad); };
  const one = async (sql, params) => { const r = (await db.query(sql, params)).rows[0]; return r ? Object.values(r)[0] : undefined; };
  const claims = (u) => db.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true), set_config('request.headers', $3, true), set_config('request.path', '', true)`,
    [u || '', u ? JSON.stringify({ sub: u, role: 'authenticated' }) : '', JSON.stringify({ 'cf-connecting-ip': '198.51.100.' + (u ? parseInt(u.slice(-2), 16) % 200 + 10 : 1) })]);
  const attempt = async (fn) => {
    await db.exec('savepoint cw');
    try { const r = await fn(); await db.exec('release savepoint cw'); return { r }; }
    catch (e) { await db.exec('rollback to savepoint cw'); return { e }; }
  };
  const as = (u, fn) => attempt(async () => { await claims(u); await db.exec('set local role authenticated'); const r = await fn(); await db.exec('reset role'); await claims(null); return r; });
  const ask = async (u, sql, params) => { const a = await as(u, () => one(sql, params)); return a.e ? { raised: String(a.e.message).slice(0, 200) } : a.r; };
  const apply = async (sql) => { const a = await attempt(() => db.exec(sql)); return a.e ? String(a.e.message).split('\n')[0] : null; };
  const must = async (name, sql) => { const e = await apply(sql); if (e) throw Object.assign(new Error(name + ': ' + e), { harness: true }); };
  let COLORS = null;
  const hero = async (u, slot, name) => {
    const r = await ask(u, `select public.hr_create_hero($1::int, $2, $4::jsonb, $3::uuid)`, [slot, name, key(), COLORS]);
    if (!r || r.ok !== true) throw Object.assign(new Error(`hr_create_hero(${slot}, ${name}): ` + js(r)), { harness: true });
    return r;
  };
  const allow = async (u) => {
    await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [u]);
    await db.query(`insert into public.hr_access_allowlist (user_id, note) values ($1, 'char-wipe guard') on conflict (user_id) do nothing`, [u]);
  };

  await db.exec('begin');
  try {
    const dye = await one('select min(idx) from public.hr_outfit_dyes');
    COLORS = JSON.stringify({ head: dye, body: dye, legs: dye, feet: dye });
    const A = uid(1), B = uid(2), C = uid(3);
    await db.query('update public.hr_hunt_config set enabled = true where id');
    await must('market-on', SRC.on);
    await allow(A); await allow(B);
    await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [C]);

    /* A PLAYED ACCOUNT: three heroes (one in a slot it bought), gold, a bag, Storage, a house and land, an open hunt, a party with a friend, a market listing, chat. */
    await hero(A, 0, 'Marlow');
    await hero(A, 1, 'Sorrel');
    await hero(B, 0, 'Tamsel');
    await db.query('update public.account_wallet set gold = 90000000 where user_id = $1', [A]);
    await db.query('update public.player_state set level_xp = public.hr_char_xp_for_level((select min_level from public.hr_market_config) + 1), stamina_ms = 28800000, stamina_at = now() where user_id in ($1, $2)', [A, B]);
    const slotId = await one('select min(slot_id) from public.hr_hero_slots where not starter and slot_id > 0');
    const bought = await ask(A, 'select public.hr_buy_hero_slot($1::int, 0, $2::uuid)', [slotId, key()]);
    if (!bought || bought.ok !== true) throw Object.assign(new Error('hr_buy_hero_slot: ' + js(bought)), { harness: true });
    await hero(A, slotId, 'Wrenna');
    const hunt = await one(`select g.hunt_id from public.hr_hunt_grounds g left join public.hr_hunts h on h.hunt_id = g.hunt_id order by coalesce(h.band_min, 0), g.hunt_id limit 1`);
    const item = (await db.query(`select m.item_id, m.floor_each::text f from public.hr_market_items m where m.listable and m.floor_each > 1 and m.ceiling_each < 1000000000
      and m.item_id not in (select item_id from public.hr_item_slots) order by m.item_id limit 1`)).rows[0];
    await db.query(`insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, $2, 30) on conflict (user_id, slot, item_id) do update set qty = excluded.qty`, [A, item.item_id]);
    await db.query(`insert into public.account_bank (user_id, item_id, qty, updated_at) values ($1, $2, 7, now()) on conflict (user_id, item_id) do update set qty = excluded.qty`, [A, item.item_id]);
    const chest = await one('select min(chest_id) from public.hr_storage_chests');
    await attempt(() => db.query('insert into public.account_storage_chests (user_id, chest_id) values ($1, $2)', [A, chest]));
    await attempt(() => db.query(`insert into public.account_farm (user_id) values ($1)`, [A]));
    await claims(A);
    const ver = await one('select version from public.player_state where user_id = $1 and slot = 0', [A]);
    const listed = await one(`select public.hr_market_list($1::uuid, 0, $2::bigint, $3::uuid, 'bag', $4, 3::bigint, $5::bigint)`, [A, ver, key(), item.item_id, item.f]);
    if (!listed || listed.ok !== true) throw Object.assign(new Error('hr_market_list: ' + js(listed)), { harness: true });
    await claims(B);
    const sold = await one(`select public.hr_market_buy($1::uuid, 0, null, $2::uuid, $3::uuid, 1::bigint, $4::bigint, 'storage')`, [B, key(), listed.listed.listing_id, item.f]);
    if (!sold || sold.ok !== true) await db.query('update public.account_wallet set gold = 1000000 where user_id = $1', [B]);
    await claims(null);
    /* the gold sinks' records: a powder, a round and a Crier line from a hero in town. They go with everything else. */
    for (const [show, price] of [['cinnabar', 2000], ['round', 5000]]) {
      const b = await ask(A, 'select public.hr_town_show(1, $1, $2::bigint, $3::uuid)', [show, price, key()]);
      if (!b || b.ok !== true) throw Object.assign(new Error('hr_town_show: ' + js(b)), { harness: true });
    }
    /* THE TOWN WORKS: a gift, and the project near a stage so the System line and the plaque are real rows the wipe must clear */
    await db.query("insert into public.town_works_totals (project_id, total) values ('weighhouse', 99000)");
    const gave = await ask(A, 'select public.hr_town_works_give(1, $1, 1000::bigint, $2::uuid)', ['weighhouse', key()]);
    if (!gave || gave.ok !== true || gave.stage !== 1) throw Object.assign(new Error('hr_town_works_give: ' + js(gave)), { harness: true });
    const cried = await ask(A, 'select public.hr_crier_send(1, $1, 1000::bigint, $2::uuid)', ['selling rat tails', key()]);
    if (!cried || cried.ok !== true) throw Object.assign(new Error('hr_crier_send: ' + js(cried)), { harness: true });
    const entered = await ask(A, `select public.hr_hunt_enter(0, $1, '[]'::jsonb, 0, null, gen_random_uuid())`, [hunt]);
    if (!entered || entered.ok !== true) throw Object.assign(new Error('hr_hunt_enter: ' + js(entered)), { harness: true });
    const inst = await one('select instance_id from public.hunt_sessions where user_id = $1 and ended_at is null', [A]);
    await claims(A);
    const party = await one('select public.hr_party_open($1::uuid, 1)', [A]);
    await one('select public.hr_party_seat_into($1::uuid, $2::uuid, 0)', [party, B]);
    await claims(null);
    await db.query(`insert into public.chat_messages (channel, from_id, from_name, body) values ('global', $1, 'Marlow', 'hello')`, [A]);
    await db.query(`insert into public.chat_whispers (from_id, from_name, to_id, to_name, body) values ($1, 'Marlow', $2, 'Tamsel', 'psst')`, [A, B]);
    const [lo, hi] = [A, B].sort();
    await db.query('insert into public.friend_links (user_lo, user_hi) values ($1, $2)', [lo, hi]);
    await db.query('insert into public.chat_blocks (blocker_id, blocked_id) values ($1, $2)', [A, C]);
    await db.query(`insert into public.bug_reports (user_id, summary, source, status) values ($1, 'a report', 'client', 'new')`, [A]);
    await db.query(`insert into public.character_presence (user_id, slot, seen_at) values ($1, 0, now()) on conflict do nothing`, [A]);
    await db.query(`insert into public.hr_name_holds (fold, user_id) values (public.hr_name_fold('Gutterbane'), $1)`, [A]);
    await db.query(`update public.profiles set display_name = 'Marlow' where id = $1`, [A]);
    await db.query(`update public.hr_tick_config set cursor_user = $1 where id`, [A]);
    await db.query(`insert into public.hr_tick_shard_cursor (shard, cursor_user) values (0, $1) on conflict (shard) do update set cursor_user = excluded.cursor_user`, [A]);
    await db.query('select public.hr_record_rejection($1::uuid, 0, $2, $3, $4::jsonb, 1)', [A, 'probe', 'probe_code', '{}']);
    await db.exec('refresh materialized view public.leaderboard_ranked');
    const boardBefore = await one('select count(*)::int from public.leaderboard_ranked');
    const allowBefore = await one('select count(*)::int from public.hr_access_allowlist');
    const usersBefore = await one('select count(*)::int from auth.users');
    const itemsBefore = await one('select count(*)::int from public.hr_items');
    const before = await namesIn(db, A);

    /* CW-LISTS */
    const census = JSON.parse(await readFile(join(ROOT, 'tests', 'restore-census.baseline.json'), 'utf8'));
    const WIPE = new Set(listOf('wipe')), KEEP = new Set(listOf('keep')), MARKET = new Set(listOf('market')), NOP = new Set(listOf('no_player'));
    const OPERATOR_LOGS = new Set(['hr_db_samples', 'hr_players_online_cache', 'hr_tick_cron_log', 'hunt_world_shape_move', 'maintenance_alerts', 'maintenance_log', 'hr_account_deletion_log']);
    const wrong = [];
    for (const [t, spec] of Object.entries(census.tables)) {
      const c = spec.class;
      if (c === 'seeded' || c === 'operator_tunable') { if (!NOP.has(t) && !KEEP.has(t)) wrong.push(t + ' (' + c + ') should name no player'); }
      else if (c === 'restore_only') { if (!WIPE.has(t) && !KEEP.has(t) && !MARKET.has(t)) wrong.push(t + ' (restore_only) is on no player list'); }
      else if (c === 'operational') { if (!WIPE.has(t) && !KEEP.has(t) && !OPERATOR_LOGS.has(t)) wrong.push(t + ' (operational) is unclassified'); }
    }
    const everyPlayer = (await db.query(`select c.relname t from pg_class c join pg_attribute a on a.attrelid = c.oid where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and a.attname = 'user_id' and not a.attisdropped`)).rows.map((r) => r.t);
    for (const t of everyPlayer) if (!WIPE.has(t) && !KEEP.has(t) && !MARKET.has(t)) wrong.push(t + ' has a user_id and is on no player list');
    arm('CW-LISTS', !wrong.length && WIPE.size >= 99, `${WIPE.size} tables go, ${KEEP.size} stay, ${NOP.size} name no player; ${everyPlayer.length} tables with a user_id all placed, every census class agrees`, wrong.join('; '));

    /* CW-SINKS: the design's wipe table, whatever has landed so far. hr_boss_calls waits on Tyler's word, so it isn't listed yet. */
    const SINK_GOES = ['town_shows', 'account_gold_given', 'player_titles', 'town_works_totals', 'town_works_gifts'];
    const SINK_NAMES_NOBODY = ['hr_sink_rules', 'hr_titles', 'hr_town_works'];
    /* read from the text this run applies, not the file on disk: a mutant moves the lists */
    const [goes, stays, nobody] = ['wipe', 'keep', 'no_player'].map((l) => new Set(listOf(l, wipeSql)));
    const sinkBad = [...SINK_GOES.filter((t) => !goes.has(t) || nobody.has(t) || stays.has(t)), ...SINK_NAMES_NOBODY.filter((t) => !nobody.has(t) || goes.has(t) || stays.has(t))];
    const sinkAbsent = [];
    for (const t of [...SINK_GOES, ...SINK_NAMES_NOBODY]) if (!(await one('select to_regclass($1) is not null', ['public.' + t]))) sinkAbsent.push(t);
    /* what a sink left behind is real before the wipe runs, or the wipe's empties below prove nothing about it */
    const sinkRows = (await one('select count(*)::int from public.town_shows where user_id = $1', [A])) + (await one('select count(*)::int from public.account_gold_given where user_id = $1', [A])) + (await one('select count(*)::int from public.chat_messages where crier and from_id = $1', [A]));
    if (sinkRows < 4) throw Object.assign(new Error('the played account holds no sink rows: ' + sinkRows), { harness: true });
    const worksRows = (await one('select count(*)::int from public.town_works_totals')) + (await one('select count(*)::int from public.town_works_gifts where user_id = $1', [A]));
    if (worksRows !== 2) throw Object.assign(new Error('the Works hold no rows to wipe: ' + worksRows), { harness: true });
    arm('CW-SINKS', !sinkBad.length && !goes.has('hr_boss_calls') && !nobody.has('hr_boss_calls'),
      `${SINK_GOES.length} sink tables go, ${SINK_NAMES_NOBODY.length} name nobody, each on its list; ${sinkAbsent.length} of them don't exist yet (${sinkAbsent.join(', ') || 'none'}) and the wipe below skips those`,
      'a sink table is on the wrong list, or none: ' + sinkBad.join(', '));

    /* CW-REFUSE: market on, then off with goods, then the sweep, then an open game. */
    const rOn = await apply(wipeSql);
    await must('market-off', SRC.off);
    const rFull = await apply(wipeSql);
    await must('market-wipe', SRC.mWipe);
    await db.query(`select public.hr_cron_ensure('hr-market-expire', '*/5 * * * *', 'select public.hr_market_expire(200)')`);
    const rSweep = await apply(wipeSql);
    await db.query(`select public.hr_cron_drop('hr-market-expire')`);
    await db.query(`update public.hr_flags set enabled = false where key = 'closed_mode'`);
    const rOpen = await apply(wipeSql);
    await db.query(`update public.hr_flags set enabled = true where key = 'closed_mode'`);
    const stillHeroes = await one('select count(*)::int from public.player_state where user_id = $1', [A]);
    arm('CW-REFUSE', /market is ON/.test(rOn || '') && /holds/.test(rFull || '') && /sweep is scheduled/.test(rSweep || '') && /closed_mode is not ON/.test(rOpen || '') && stillHeroes === 3,
      'refused with the market on, its tables full, the sweep scheduled or the game open, and nothing moved', js({ rOn, rFull, rSweep, rOpen, stillHeroes }));

    /* CW-UNKNOWN: each planted, each undone */
    const planted = [
      ['a new table with a user_id', 'create table public.hr__new_u (user_id uuid)', 'drop table public.hr__new_u', /no list: hr__new_u/],
      ['a new table with no uuid at all', 'create table public.hr__new_n (n int)', 'drop table public.hr__new_n', /no list: hr__new_n/],
      ['a person column on a no-player table', 'alter table public.hr_wipe_log add column who uuid', 'alter table public.hr_wipe_log drop column who', /naming a player: hr_wipe_log/],
    ];
    const unknownBad = [];
    for (const [name, up, down, want] of planted) {
      await db.exec(up);
      const e = await apply(wipeSql);
      await db.exec(down);
      if (!want.test(e || '')) unknownBad.push(name + ': ' + e);
    }
    arm('CW-UNKNOWN', !unknownBad.length, 'a table on no list, or a no-player table that names one, stops the wipe by name', unknownBad.join('; '));

    /* THE WIPE (the market's half already ran, above, in its place in the order) */
    const eWipe = await apply(wipeSql);
    arm('CW-APPLY-SELF', eWipe === null, 'the file applied: its §2 proved the wipe and a probe through hero creation and every tick job', 'the file refused: ' + eWipe);
    if (eWipe) return red;

    /* CW-APPLY */
    const after = await namesIn(db, A);
    const leftBehind = after.hits.filter((h) => !MAY_NAME.has(h));
    const notEmpty = [];
    for (const t of WIPE) {
      if (!(await one('select to_regclass($1) is not null', ['public.' + t]))) continue;
      const n = await one(`select count(*)::int from public.${t}`);
      if (n) notEmpty.push(t + ':' + n);
    }
    for (const t of MARKET) { const n = await one(`select count(*)::int from public.${t}`); if (n) notEmpty.push(t + ':' + n); }
    const log = (await db.query(`select removed from public.hr_wipe_log where wipe_key = 'character-wipe-2026-11'`)).rows[0];
    arm('CW-APPLY', before.hits.length >= 25 && after.read > 200 && !leftBehind.length && !notEmpty.length && !!log && log.removed.player_state >= 4,
      `${before.hits.length} relations named the account before; ${after.read} read after and only ${after.hits.length} do, each meant to; all ${WIPE.size} wiped tables are empty for everyone; the journal counted ${log && log.removed.player_state} heroes`,
      js({ before: before.hits.length, leftBehind, notEmpty, log }));

    /* CW-WORKS: the building goes back to stakes and the plaque is bare, but the project itself is still there to fund (a beta that inherits a finished Weighhouse loses the one goal the whole server shares) */
    const worksAfter = { totals: await one('select count(*)::int from public.town_works_totals'), gifts: await one('select count(*)::int from public.town_works_gifts'),
      project: await one("select count(*)::int from public.hr_town_works where project_id = 'weighhouse'"), extras: await one("select public.hr_town_extras('town_common')"),
      plaque: await one("select public.hr_town_works_plaque('weighhouse', null, 10)") };
    arm('CW-WORKS', worksAfter.totals === 0 && worksAfter.gifts === 0 && worksAfter.project === 1 && worksAfter.extras.works.weighhouse === 0 && worksAfter.plaque.length === 0,
      'the totals and the plaque are cleared, the Weighhouse reads stage 0, the project row stays', js(worksAfter));

    /* CW-KEPT */
    const profile = (await db.query('select display_name, clan_id, name_state, must_rename from public.profiles where id = $1', [A])).rows[0];
    const cfgCursor = (await db.query('select cursor_user from public.hr_tick_config where id')).rows;
    const shardCursor = await one('select count(*)::int from public.hr_tick_shard_cursor where cursor_user is not null');
    const kept = { allow: await one('select count(*)::int from public.hr_access_allowlist'), users: await one('select count(*)::int from auth.users'), items: await one('select count(*)::int from public.hr_items'),
      friends: await one('select count(*)::int from public.friend_links where user_lo = $1 and user_hi = $2', [lo, hi]), blocks: await one('select count(*)::int from public.chat_blocks where blocker_id = $1', [A]),
      reports: await one('select count(*)::int from public.bug_reports where user_id = $1', [A]), hold: (await db.query(`select user_id from public.hr_name_holds where fold = public.hr_name_fold('Gutterbane')`)).rows[0],
      closed: await one(`select enabled from public.hr_flags where key = 'closed_mode'`) };
    const social = await ask(A, 'select public.hr_social_state(0)');
    arm('CW-KEPT', kept.allow === allowBefore && kept.users === usersBefore && kept.items === itemsBefore && kept.friends === 1 && kept.blocks === 1 && kept.reports === 1 && kept.hold && kept.hold.user_id === null && kept.closed === true
        && profile.display_name === null && profile.clan_id === null && cfgCursor.length === 1 && cfgCursor[0].cursor_user === null && shardCursor === 0 && social && !social.raised,
      'auth, allowlist, friends, blocks, reports, catalogues and the tick config stand; the profile is a fresh signup\'s; the friends list still reads', js({ kept, profile, cfgCursor, shardCursor, social }));

    /* CW-SLOTS */
    const slotsA = await one('select public.hr_hero_slots_of($1::uuid)', [A]);
    const starters = await one(`select jsonb_agg(s order by s) from (select 0 as s union select slot_id from public.hr_hero_slots where starter) q`);
    arm('CW-SLOTS', js(slotsA) === js(starters) && starters.length === 2 && !starters.includes(slotId), `the slot it bought went; it owns ${js(slotsA)}, the catalogue's starters`, js({ slotsA, starters, slotId }));

    /* CW-STALE: what a tab or a settle that began before the wipe can still send. */
    const staleApply = await attempt(() => one('select public.hr_hunt_apply_instance($1::uuid, 0::bigint, $2::jsonb, $3::jsonb, $4::uuid, 0)', [inst, '{}', '[]', key()]));
    const staleLoad = await ask(A, 'select public.hr_load(0)');
    const stalePut = await ask(A, 'select public.hr_put_client_state(0, $1::jsonb, $2::uuid)', ['{"coach":{"read":["old_card"]}}', key()]);
    const staleLeave = await ask(A, 'select public.hr_hunt_leave(0, $1::uuid)', [key()]);
    const staleEnter = await ask(A, `select public.hr_hunt_enter(0, $1, '[]'::jsonb, 0, null, gen_random_uuid())`, [hunt]);
    const ghosts = {};
    for (const t of ['player_state', 'hunt_sessions', 'hunt_instances', 'hunt_bag', 'player_ledger', 'player_inventory', 'account_wallet', 'character_names']) ghosts[t] = await one(`select count(*)::int from public.${t}`);
    const said = (a) => (a && (a.error || a.raised)) || js(a);
    arm('CW-STALE', Object.values(ghosts).every((n) => n === 0) && staleLoad && staleLoad.ok !== true, `a settle read before the wipe (${staleApply.e ? 'raised: ' + String(staleApply.e.message).slice(0, 70) : said(staleApply.r)}), and a stale tab's read (${said(staleLoad)}), residue (${said(stalePut)}), leave (${said(staleLeave)}) and enter (${said(staleEnter)}), leave no ghost row`,
      js({ ghosts, staleApply: staleApply.e ? String(staleApply.e.message).slice(0, 120) : staleApply.r, staleLoad, stalePut, staleLeave, staleEnter }));
    await db.query('delete from public.hr_rate_counters');

    /* CW-JOBS: every job's own command on the empty world */
    const jobs = (await db.query('select jobname, command from cron.job order by jobname')).rows;
    const jobBad = [];
    for (const j of jobs) {
      const a = await attempt(() => db.exec(j.command));
      if (a.e) jobBad.push(j.jobname + ': ' + String(a.e.message).slice(0, 120));
    }
    const back = await one('select count(*)::int from public.player_state');
    const backSessions = await one('select count(*)::int from public.hunt_sessions');
    arm('CW-JOBS', !jobBad.length && back === 0 && backSessions === 0 && jobs.length >= 20, `${jobs.length} scheduled jobs answer on the empty world and bring nothing back`, js({ jobBad, back, backSessions }));

    /* CW-CLOSED */
    const strangerLoad = await as(C, () => db.query('select public.hr_access_check()'));
    const heldLoad = await as(A, () => db.query('select public.hr_access_check()'));
    arm('CW-CLOSED', !!strangerLoad.e && /hr_closed/.test(strangerLoad.e.message) && !heldLoad.e, 'an account on no list is refused hr_closed; the allowlisted one is let in', js({ stranger: strangerLoad.e && strangerLoad.e.message, held: heldLoad.e && heldLoad.e.message }));

    /* CW-BOARDS */
    const boardAfter = await one('select count(*)::int from public.leaderboard_ranked');
    arm('CW-BOARDS', boardBefore > 0 && boardAfter === 0, `${boardBefore} ranked rows before, none after`, js({ boardBefore, boardAfter }));

    /* CW-PLAY */
    const before2 = await one('select count(*)::int from public.player_state');
    const again = await ask(B, `select public.hr_create_hero(0, 'Marlow', $2::jsonb, $1::uuid)`, [key(), COLORS]);
    const pulled = await ask(A, `select public.hr_create_hero(0, 'Gutterbane', $2::jsonb, $1::uuid)`, [key(), COLORS]);
    await hero(A, 0, 'Sorrel');
    await db.query('update public.player_state set stamina_ms = 28800000, stamina_at = now() where user_id = $1', [A]);
    const lv = await one('select public.hr_level_of($1::uuid, 0)', [A]);
    const purse = await one('select gold from public.account_wallet where user_id = $1', [A]);
    const enteredAgain = await ask(A, `select public.hr_hunt_enter(0, $1, '[]'::jsonb, 0, null, gen_random_uuid())`, [hunt]);
    const bagAgain = await one('select count(*)::int from public.player_inventory where user_id = $1 and slot = 0', [A]);
    arm('CW-PLAY', before2 === 0 && again && again.ok === true && pulled && pulled.ok !== true && lv === 1 && Number(purse) < 90000000 && enteredAgain && enteredAgain.ok === true && bagAgain > 0,
      'a friend can take the old name, a moderated one stays refused, and the account makes a Level 1 hero with a start kit and goes hunting', js({ again, pulled, lv, purse, enteredAgain, bagAgain }));

    /* CW-RESUME */
    const eResume = await apply(SRC.resume);
    const eOnAgain = await apply(SRC.on);
    const sweep = await one(`select count(*)::int from cron.job where jobname = 'hr-market-expire'`);
    const open = await one('select enabled from public.hr_market_config');
    arm('CW-RESUME', eResume === null && eOnAgain === null && sweep === 1 && open === true, 'the sweep is back and the market opens on the procedure\'s last two steps', js({ eResume, eOnAgain, sweep, open }));

    /* CW-ONCE */
    const eOnce = await apply(wipeSql);
    const heroes = await one('select count(*)::int from public.player_state');
    arm('CW-ONCE', eOnce === null && heroes === 2, 'a second apply is a no-op: the new heroes stand, with the market back on', js({ eOnce, heroes }));
    return red;
  } finally {
    await db.exec('rollback').catch(() => {});
  }
}

/* Most of these the file's own §2 refuses before behaviour runs, which is the §4 self-check doing its job: CW-APPLY-SELF. */
const MUTANTS = [
  { id: 'sink_table_unlisted', arm: 'CW-SINKS', why: 'a sink table leaves the wipe list', edits: [["'account_gold_given', 'player_titles', 'town_shows',", "'player_titles', 'town_shows',"]] },
  { id: 'works_total_kept', arm: 'CW-WORKS', why: 'a finished Weighhouse survives the wipe', edits: [["'town_works_gifts', 'town_works_totals',", "'town_works_gifts',"], ["'hr_lb_hidden', 'hr_name_holds',", "'town_works_totals', 'hr_lb_hidden', 'hr_name_holds',"]] },
  { id: 'sink_catalogue_wiped', arm: 'CW-SINKS', why: 'the wipe truncates the prices', edits: [["'hr_account_deletion_log', 'hr_sink_rules', 'hr_titles', 'hr_town_works'];", "'hr_account_deletion_log', 'hr_titles', 'hr_town_works'];"], ["'account_gold_given', 'player_titles',", "'hr_sink_rules', 'account_gold_given', 'player_titles',"]] },
  { id: 'wipe_needs_every_table', arm: 'CW-APPLY-SELF', why: 'a listed table that does not exist yet stops the wipe', edits: [["    if to_regclass('public.' || t) is not null then\n      v_present := v_present || t;", "    if true then\n      v_present := v_present || t;"]] },
  { id: 'kept_count_needs_every_table', arm: 'CW-APPLY-SELF', why: 'a no-player table that does not exist yet stops the wipe', edits: [["    if to_regclass('public.' || t) is not null then\n      execute format('select count(*) from public.%I', t) into v_n;\n      v_kept", "    if true then\n      execute format('select count(*) from public.%I', t) into v_n;\n      v_kept"]] },
  { id: 'open_game', arm: 'CW-REFUSE', why: 'the wipe runs in an open game', edits: [["  if not coalesce((select enabled from public.hr_flags where key = 'closed_mode'), false) then\n    raise exception 'PRECONDITION: closed_mode", "  if false then\n    raise exception 'PRECONDITION: closed_mode"]] },
  { id: 'market_on', arm: 'CW-REFUSE', why: 'the wipe runs with the market on', edits: [["  if (select enabled from public.hr_market_config) is distinct from false then\n    raise exception 'PRECONDITION: the market is ON", "  if false then\n    raise exception 'PRECONDITION: the market is ON"]] },
  { id: 'market_full', arm: 'CW-REFUSE', why: 'the escrow is ignored', edits: [["    if v_n <> 0 then raise exception 'PRECONDITION: public.% holds", "    if false then raise exception 'PRECONDITION: public.% holds"]] },
  { id: 'sweep_on', arm: 'CW-REFUSE', why: 'the sweep runs through the wipe', edits: [["  if exists (select 1 from cron.job where jobname = 'hr-market-expire') then\n    raise exception 'PRECONDITION: the expiry", "  if false then\n    raise exception 'PRECONDITION: the expiry"]] },
  { id: 'unknown_table_passes', arm: 'CW-UNKNOWN', why: 'a table nobody classified is left with its rows', edits: [["    raise exception 'wipe §0: table(s) on no list: % — decide each (goes, stays, or names no player), then apply', v_bad; end if;", "    null; end if;"]] },
  { id: 'no_player_unchecked', arm: 'CW-UNKNOWN', why: 'a no-player table quietly gains a person column', edits: [["  if v_bad is not null then raise exception 'wipe §0: on the no-player list but naming a player: %', v_bad; end if;", '']] },
  { id: 'ledger_guard_left_off', arm: 'CW-APPLY-SELF', why: 'the ledger comes out without its truncate guard', edits: [['  alter table public.player_ledger enable trigger hr_ledger_no_truncate;\n', '']] },
  { id: 'profile_not_reset', arm: 'CW-APPLY-SELF', why: 'a profile keeps its old name', edits: [["     set display_name = null, clan_id = null, name_state = 'ok', must_rename = false, updated_at = now()\n   where display_name is not null or clan_id is not null or name_state <> 'ok' or must_rename;", "     set updated_at = now() where false;"]] },
  { id: 'cursor_kept', arm: 'CW-APPLY-SELF', why: 'the tick resumes from a hero that no longer exists', edits: [["  update public.hr_tick_config set cursor_user = null, cursor_slot = null, cursor_at = null\n   where cursor_user is not null or cursor_slot is not null or cursor_at is not null;\n", '']] },
  { id: 'board_stale', arm: 'CW-APPLY-SELF', why: 'the boards still rank old heroes', edits: [['  refresh materialized view public.leaderboard_ranked;\n', '']] },
  { id: 'holds_named', arm: 'CW-APPLY-SELF', why: 'a moderated name keeps its old owner', edits: [['  update public.hr_name_holds set user_id = null where user_id is not null;\n', '']] },
  { id: 'allowlist_wiped', arm: 'CW-APPLY-SELF', why: 'the wipe takes the allowlist', edits: [["'account_bank', 'account_farm', 'account_farm_plots',", "'hr_access_allowlist', 'account_bank', 'account_farm', 'account_farm_plots',"], ["'hr_access_allowlist',\n    'hr_lb_hidden',", "\n    'hr_lb_hidden',"]] },
  { id: 'no_fence', arm: 'CW-ONCE', why: 'a re-apply wipes the new heroes', edits: [["  if exists (select 1 from public.hr_wipe_log where wipe_key = c_key) then\n    raise notice", "  if false then\n    raise notice"], ["  if not coalesce((select enabled from public.hr_flags where key = 'closed_mode'), false) then raise exception 'wipe k3", "  if false then raise exception 'wipe k3"]] },
  { id: 'one_table_left_full', arm: 'CW-APPLY', why: 'one table of rows is left behind (on a list, skipped by the truncate)', edits: [["unnest(v_present) x) || ' continue identity restrict';", "unnest(v_present) x where x not in ('hr_rejections')) || ' continue identity restrict';"], ["    if v_n <> 0 then raise exception 'wipe k1: public.% still holds % row(s)', t, v_n; end if;", '    null;']] },
];

function plant(sql, edits) {
  let s = sql;
  for (const [find, repl] of edits) {
    const n = s.split(find).length - 1;
    if (n !== 1) throw Object.assign(new Error(`mutant anchor matched ${n} times: ${find.slice(0, 80)}`), { harness: true });
    s = s.replace(find, () => repl);
  }
  return s;
}

/* READ-ONLY, for the Coordinator to run on live BEFORE step 1: a table the file doesn't know would stop it at step 3, after the market is already gone. */
function preflightSql() {
  const arr = (a) => 'array[' + a.map((x) => `'${x}'`).join(',') + ']';
  return `-- char-wipe preflight, read-only. It must return no rows before step 1.
select 'on no list' as what, c.relname as what_table, null::bigint as n from pg_class c
 where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p') and not c.relispartition
   and c.relname <> all (${arr([...listOf('wipe'), ...listOf('keep'), ...listOf('market'), ...listOf('no_player')])})
union all select 'closed_mode off', 'hr_flags', 0 where not coalesce((select enabled from public.hr_flags where key = 'closed_mode'), false)
union all select 'already wiped', 'hr_wipe_log', 1 where exists (select 1 from public.hr_wipe_log where wipe_key = 'character-wipe-2026-11')
union all select 'market wipe already spent: its file would no-op with goods in escrow', 'hr_wipe_log', 1 where exists (select 1 from public.hr_wipe_log where wipe_key = 'market-first-wipe');`;
}

async function main() {
  if (process.argv.includes('--preflight-sql')) { console.log(preflightSql()); return; }
  const m = await manifest();
  let db;
  try { ({ db } = await bootReplay({ keepClosed: true })); }
  catch (e) { console.error(`char-wipe: HARNESS — ${String(e.message).split('\n')[0]}`); process.exit(2); }
  try {
    if (!MUTATE) {
      console.log('\nchar-wipe — the declared wipe, the whole procedure in order, on the replayed chain\n');
      const note = String((m.excluded || {})[FILE] || '');
      const inOrder = (m.order || []).includes(FILE);
      const ok = !inOrder && /\bSTAGED\b/.test(note) && /Tyler's word/.test(note) && ['2027-02-14-market-off.sql', '2027-02-20-market-wipe.sql', '2027-02-20-market-wipe-resume.sql', '2027-02-14-market-on.sql'].every((f) => note.includes(f));
      console.log(ok ? `  ✓ CW-ORDER — ${FILE} is STAGED in \`excluded\`, never replayed, its note naming the whole order` : '  ✗ CW-ORDER — it must be in `excluded` with a STAGED note naming the order, and not in `order`');
      let red;
      try { red = await scenario(db, SRC.wipe); }
      catch (e) { console.error(`char-wipe: HARNESS — ${String(e.message).split('\n')[0]}`); process.exit(2); }
      const n = red.size + (ok ? 0 : 1);
      console.log(n ? `\nchar-wipe: RED (${n})` : '\nchar-wipe: green');
      process.exitCode = n ? 1 : 0;
      return;
    }
    console.log('\nchar-wipe --mutate\n');
    let survived = 0;
    const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
    for (const mu of MUTANTS.filter((x) => !only || x.id === only)) {
      let sql = SRC.wipe;
      try { if (!CONTROL) sql = plant(SRC.wipe, mu.edits); }
      catch (e) { console.error(`char-wipe: HARNESS — ${e.message}`); process.exit(2); }
      let red;
      try { red = await scenario(db, sql); }
      catch (e) {
        if (e.harness) { console.error(`char-wipe: HARNESS — ${mu.id}: ${String(e.message).split('\n')[0]}`); process.exit(2); }
        throw e;
      }
      const caught = red.has(mu.arm);
      console.log(caught ? `  ✓ ${mu.id} — caught by ${mu.arm} (${mu.why})` : `  ✗ ${mu.id} — SURVIVED (${mu.why}); red arms: ${[...red.keys()].join(', ') || 'none'}`);
      if (!caught) survived++;
    }
    console.log(survived ? `\nchar-wipe --mutate: ${survived} survived` : `\nchar-wipe --mutate: ${MUTANTS.length}/${MUTANTS.length} caught`);
    process.exitCode = survived ? 1 : 0;
  } finally {
    await db.close().catch(() => {});
  }
}

await main();
