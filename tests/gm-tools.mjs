#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/gm-tools.mjs — THE GAME MASTER'S POWERS REFUSE EVERYONE ELSE, AND HIS WALL HOLDS AGAINST A FORGED CALL
//   (supabase/migrations/2027-03-05-gm-tools.sql; tools/gm-allow.mjs; docs/planning/PRIORITY_BOARD.md "2026-11-05 Game Master tools").
//
//   node tests/gm-tools.mjs            the guard, on the replayed chain
//   node tests/gm-tools.mjs --mutate   each planted defect must turn its own arm red
//
// mutant-anchors: supabase/migrations/2027-03-05-gm-tools.sql
//
// Every call runs as PostgREST runs it: the JWT subject, the request path, `set role authenticated`. The real engine verb
// (hr-accrue gm-stop.js, set-activity.js) runs as hr_engine. A "forged" call is a real RPC with arguments the client chose. "Past the
// door" means the request path is one the walled account may reach, so only the row lock is left: what remains if the hook is ever lost.
//
//   GM-SHAPE      no client or engine role writes the tables; a grant's signature has no account argument; anon reaches nothing
//   GM-AUTH       every power answers a stranger the one refusal, whatever it sends; nothing moves; the journal has it, bounded
//   GM-ROW        an account with a hero can't be walled; the wall can't be lifted while a hero stands; no client writes the row
//   GM-DOOR       the walled account reaches what is on the list and nothing else: each shared verb, an undecided name, a table
//   GM-SEE        who plays, and one hero: the fields a GM needs, and never an email, an address or a network hash
//   GM-STOP-JOB   a town job stops by the player's collect-then-switch: it is paid, the hero is idle, the seat is free
//   GM-STOP-HUNT  a hunt stops at the horizon hr_hunt_leave uses; the GM's own stop and the player's write the same leave_at
//   GM-CAP        a walled hero counts on its account's four and not on the network's; a real hero's cap is untouched
//   GM-MUTE       a muted account can't chat or whisper (both locks), a server line still names it, it lifts, it expires
//   GM-BAN        every door shuts (hook, gate, engine, a look-up), hunts leave, jobs are named and stoppable, the boards hide it, unban undoes it
//   GM-SAY        stamped Game Master on the system channel, cleaned and masked, rate limited; nobody else writes that stamp
//   GM-GRANT      gold, items, a Level: the caller's own account, ledger and log, clamped per call and per day, a replay moves nothing
//   GM-LOG        append-only; a reason is required on stop, mute, ban and grant
//   GM-NAME       nobody's hero can read as staff
//   GM-BADGE      the server stamps a walled hero's look; a real hero's has no such key
//   GM-W-MARKET   list, buy and receive: refused by the row lock through the real engine verbs; no gold or goods move
//   GM-W-CHAT     global, local, party, past the door
//   GM-W-WHISPER  both directions
//   GM-W-FRIEND   both directions
//   GM-W-PARTY    invite, seat, list, seek across the wall; own heroes still party
//   GM-W-HEARTH   a burn is refused and leaves no colour and no line
//   GM-W-FINDS    no Hearthfind rolled; a server line, a notice and a find row go nowhere, and never fail the writer
//   GM-W-BOARDS   a walled hero at any Level is on no board; a real one at less is
//   GM-W-OTHER    clans and the Discord gift, by row
//   GM-W-CROSS    a grant reaches no other purse; Storage and the bag have no path across accounts
//   GM-W-FUTURE   a shared table landed by a later lane carries the row lock (the door already refuses its verbs)
//   GM-WIPE       the wipe's lists say who stays
//   GM-TOOL       tools/gm-allow.mjs: its migration makes a fresh account the GM, twice over the same; refuses an account with a hero; a typo admits nobody
//
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { bootReplay, ROOT } from './schema-replay.mjs';

const MUTATE = process.argv.includes('--mutate') || process.argv.includes('--selftest');
const CONTROL = Boolean(process.env.HR_MUTANT_CONTROL);
const FILE = '2027-03-05-gm-tools.sql';
const PREV = '2027-02-26-slots-lower-hero-slots.sql';
const MIG = join(ROOT, 'supabase', 'migrations', FILE);
const WIPE = join(ROOT, 'supabase', 'migrations', '2027-02-25-character-wipe.sql');
const lf = (s) => s.replace(/\r\n/g, '\n');
const mod = (p) => import(pathToFileURL(join(ROOT, p)).href);
const { runGmStop } = await mod('supabase/functions/hr-accrue/gm-stop.js');
const SA = await mod('supabase/functions/hr-accrue/set-activity.js');
const { engineInputsFromEnvelope } = await mod('supabase/functions/hr-accrue/envelope.js');
const { checkInputs, gmSql } = await mod('tools/gm-allow.mjs');

const U = (n) => `000000c9-0000-4000-8000-0000000d${String(n).padStart(4, '0')}`;
const GM = U(1), A = U(2), B = U(3), C = U(4), D = U(5);
const IP = '198.51.100.44';
const REFUSED = '{"ok":false,"error":"refused"}';
const key = () => crypto.randomUUID();
const js = (v) => JSON.stringify(v === undefined ? null : v);
const harness = (m) => Object.assign(new Error(m), { harness: true });

/* ── THE CALLS ─────────────────────────────────────────────────────────── */
function kit(db) {
  const one = async (sql, params) => { const r = (await db.query(sql, params)).rows[0]; return r ? Object.values(r)[0] : undefined; };
  const claims = (u, path, ip) => db.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true), set_config('request.headers', $3, true), set_config('request.path', $4, true)`,
    [u || '', u ? js({ sub: u, role: 'authenticated' }) : '', ip === null ? '' : js({ 'cf-connecting-ip': ip || IP }), path || '']);
  /* As PostgREST: the subject, the path, the role. `door`: the pre-request hook runs first, as it does on production. */
  const call = async (u, sql, params, o = {}) => {
    const m = /public\.(hr_[a-z0-9_]+)\(/.exec(sql);
    const path = o.path !== undefined ? o.path : (m ? '/rpc/' + m[1] : '');
    await db.exec('begin');
    try {
      await claims(u, path, o.ip);
      await db.exec('set local role authenticated');
      if (o.door) await db.query('select public.hr_access_check()');
      const r = await one(sql, params);
      await db.exec('commit');
      return r;
    } catch (e) {
      await db.exec('rollback');
      return { raised: e.code === 'PGRST' ? (/"code":"([a-z_]+)"/.exec(e.message) || [])[1] : String(e.message).split('\n')[0], sqlstate: e.code };
    }
  };
  /* Past the door: a path the walled account may reach, so only the row lock stands. */
  const past = (u, sql, params) => call(u, sql, params, { path: '/rpc/hr_load' });
  const engine = async (text, params) => {
    await db.exec('begin');
    try {
      await db.exec('set local role hr_engine');
      const rows = (await db.query(text, params)).rows;
      await db.exec('commit');
      return rows;
    } catch (e) { await db.exec('rollback'); throw e; }
  };
  const row = async (sql, params) => {
    await db.exec('begin');
    try { const r = await one(sql, params); await db.exec('commit'); return r; }
    catch (e) { await db.exec('rollback'); return { raised: String(e.message).split('\n')[0], sqlstate: e.code }; }
  };
  const fresh = () => db.query('delete from public.hr_rate_counters');
  return { one, call, past, engine, row, fresh };
}

const gold = (k, u) => k.one('select coalesce((select gold from public.account_wallet where user_id = $1), 0)::bigint', [u]);
const qty = (k, u, slot, item) => k.one('select coalesce((select qty from public.player_inventory where user_id = $1 and slot = $2 and item_id = $3), 0)::bigint', [u, slot, item]);
const stopOf = (k, gm, target, slot, reason, intentId) => runGmStop({ exec: k.engine, gm, stop: { target, slot, reason }, intentId: intentId === undefined ? key() : intentId });

async function world(db) {
  const k = kit(db);
  await db.query('update public.hr_hunt_config set enabled = true where id');
  await db.query('update public.hr_market_config set enabled = true');
  const dye = await k.one('select min(idx) from public.hr_outfit_dyes');
  const colors = js({ head: dye, body: dye, legs: dye, feet: dye });
  for (const [u, email] of [[GM, 'gm-secret@example.test'], [A, 'marlow-secret@example.test'], [B, null], [C, null], [D, null]]) {
    await db.query('insert into auth.users (id, email) values ($1, $2) on conflict (id) do nothing', [u, email]);
    await db.query(`insert into public.hr_access_allowlist (user_id, note) values ($1, 'gm-tools guard') on conflict (user_id) do nothing`, [u]);
  }
  await db.query(`insert into public.hr_gm_accounts (user_id, note) values ($1, 'gm-tools guard')`, [GM]);
  const hero = async (u, slot, name) => {
    const r = await k.call(u, 'select public.hr_create_hero($1::int, $2, $3::jsonb, $4::uuid)', [slot, name, colors, key()]);
    if (!r || r.ok !== true) throw harness(`hr_create_hero(${name}): ${js(r)}`);
  };
  await hero(GM, 0, 'Warden');
  for (const [u, base] of [[A, 'Marlow'], [B, 'Tamsel'], [C, 'Sorrel'], [D, 'Wrenna']]) { await hero(u, 0, base); await hero(u, 1, base + 'bo'); }
  const hunt = await k.one(`select g.hunt_id from public.hr_hunt_grounds g left join public.hr_hunts h on h.hunt_id = g.hunt_id order by coalesce(h.band_min, 0), g.hunt_id limit 1`);
  const node = await k.one(`select activity_id from public.hr_activities where kind = 'gather' and coalesce(req_lv, 1) <= 1 order by activity_id limit 1`);
  const item = await k.one(`select m.item_id from public.hr_market_items m where m.listable and m.floor_each > 1 and m.ceiling_each < 1000000000 and m.item_id not in (select item_id from public.hr_item_slots) order by m.item_id limit 1`);
  const fuel = await k.one(`select item_id from public.hr_hearth_named order by req_lv, item_id limit 1`);
  if (!hunt || !node || !item || !fuel) throw harness('no ground, node, listable item or named fuel');
  for (const u of [GM, A, B, C, D]) await k.call(u, 'select public.hr_load(0)', []);
  await k.fresh();
  return { k, hunt, node, item, fuel };
}

/* ── THE ARMS ──────────────────────────────────────────────────────────── */
const ARMS = {
  'GM-SHAPE': async (W, say) => {
    const { k } = W;
    for (const t of ['hr_gm_accounts', 'hr_bans', 'hr_chat_mutes', 'hr_gm_wall_allow', 'hr_gm_log']) {
      if (await k.one(`select has_table_privilege('authenticated', $1, 'insert,update,delete,truncate')`, ['public.' + t])) say(`a client can write ${t}`);
      if (await k.one(`select has_table_privilege('hr_engine', $1, 'select,insert,update,delete')`, ['public.' + t])) say(`the engine can touch ${t}`);
    }
    if (await k.one(`select has_table_privilege('authenticated', 'public.hr_gm_log', 'select')`)) say('a client can read the log');
    const fns = (await k.row(`select jsonb_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')') from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'hr\\_gm\\_grant\\_%'`));
    if (fns.length !== 3) say('expected three grant verbs, got ' + js(fns));
    if (fns.some((f) => /uuid[^)]*p_(user|target|account)|p_(user|target|account) uuid/.test(f))) say('a grant names an account: ' + js(fns));
    if (await k.one(`select bool_or(has_function_privilege('anon', p.oid, 'execute')) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'hr\\_gm\\_%'`)) say('anon reaches a power');
    if (await k.one(`select bool_or(has_function_privilege('authenticated', p.oid, 'execute')) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('hr_gm_open', 'hr_gm_close', 'hr_gm_walled', 'hr_gm_stop_gate', 'hr_gm_stop_result', 'hr_hunt_leave_pending')`)) say('a client reaches an inner helper');
  },
  'GM-AUTH': async (W, say) => {
    const { k } = W;
    const before = { g: await gold(k, A), gm: await gold(k, GM) };
    const forged = [
      ['select public.hr_gm_online()', []],
      ['select public.hr_gm_hero($1, $2::int)', ['Warden', 0]],
      ['select public.hr_gm_mute($1::uuid, 60, $2, $3::uuid)', [B, 'forged reason', key()]],
      ['select public.hr_gm_unmute($1::uuid, $2, $3::uuid)', [B, 'forged reason', key()]],
      ['select public.hr_gm_ban($1::uuid, $2, $3::uuid)', [B, 'forged reason', key()]],
      ['select public.hr_gm_unban($1::uuid, $2, $3::uuid)', [B, 'forged reason', key()]],
      ['select public.hr_gm_say($1, $2::uuid)', ['forged line', key()]],
      ['select public.hr_gm_grant_gold(0, 1000::bigint, $1, $2::uuid)', ['forged reason', key()]],
      ['select public.hr_gm_grant_gold(5, 1000::bigint, $1, $2::uuid)', ['a forged slot', key()]],
      ['select public.hr_gm_grant_gold(0, null, null, null)', []],
      ['select public.hr_gm_grant_item(0, $1, 5::bigint, $2, $3::uuid)', [W.item, 'forged reason', key()]],
      ['select public.hr_gm_grant_level(0, 300, $1, $2::uuid)', ['forged reason', key()]],
    ];
    for (const [sql, params] of forged) {
      const r = await k.call(A, sql, params);
      if (js(r) !== REFUSED) say(`${sql} answered a stranger ${js(r)}`);
    }
    const g = await stopOf(k, A, B, 0, 'forged reason');
    if (g.status !== 403 || js(g.body) !== REFUSED) say('the engine verb answered a stranger ' + js(g));
    const bad = await stopOf(k, A, null, null, null, null);
    if (js(bad.body) !== REFUSED) say('a stranger with an empty body read as something else: ' + js(bad));
    if (await k.one('select count(*)::int from public.hr_bans') || await k.one('select count(*)::int from public.hr_chat_mutes')) say('a stranger moved a ban or a mute');
    if (await gold(k, A) !== before.g || await gold(k, GM) !== before.gm) say('a stranger moved gold');
    if (await k.one(`select level_xp from public.player_state where user_id = $1 and slot = 0`, [A]) > 1000) say('a stranger raised its own Level');
    if (await k.one(`select count(*)::int from public.chat_messages where channel = 'system' and body = 'forged line'`)) say('a stranger spoke as the Game Master');
    const logged = await k.one(`select count(*)::int from public.hr_gm_log where actor = $1 and outcome = 'refused'`, [A]);
    if (logged !== 10) say(`the journal holds ${logged} of a stranger's refused calls, not the 10 a minute it bounds them to`);
    if (await k.one(`select count(*)::int from public.hr_gm_log where actor = $1 and verb = 'grant_gold' and target_user is not null`, [A])) say('a stranger chose its log target');
    await k.fresh();
  },
  'GM-ROW': async (W, say) => {
    const { k } = W;
    const r = await k.row(`insert into public.hr_gm_accounts (user_id, note) values ($1, 'a real account') returning 1`, [A]);
    if (!r || !r.raised || !/already has a hero/.test(r.raised)) say('an account with a hero took the wall: ' + js(r));
    const d = await k.row('delete from public.hr_gm_accounts where user_id = $1 returning 1', [GM]);
    if (!d || !d.raised || !/heroes stand/.test(d.raised)) say('the wall lifted with a hero standing: ' + js(d));
    const c = await k.call(GM, `insert into public.hr_gm_accounts (user_id, note) values ('${A}', 'x') returning 1`, [], { path: '/rpc/hr_load' });
    if (!c || !c.raised) say('a client wrote the row: ' + js(c));
    if (!await k.one('select exists (select 1 from public.hr_lb_hidden where user_id = $1 and slot is null)', [GM])) say('the GM row did not hide the account from the boards');
  },
  'GM-DOOR': async (W, say) => {
    const { k } = W;
    const deny = ['hr_chat_send', 'hr_whisper_send', 'hr_friend_request', 'hr_friend_answer', 'hr_friend_remove', 'hr_block_set', 'hr_hunt_party_invite', 'hr_hunt_party_invite_player',
      'hr_hunt_party_join', 'hr_hunt_party_list', 'hr_party_seek', 'hr_hearth_burn', 'hr_claim_discord_gift', 'hr_companion_grant', 'hr_buy_gem_unlock', 'hr_nothing_decided_yet'];
    for (const n of deny) {
      const r = await k.call(GM, 'select public.hr_server_now()', [], { path: '/rpc/' + n, door: true });
      if (!r || r.raised !== 'hr_gm_walled') say(`the door let the walled account reach ${n}: ${js(r)}`);
    }
    for (const path of ['/chat_messages', '/clan_members', '/bug_reports', '/', '']) {
      const r = await k.call(GM, 'select public.hr_server_now()', [], { path, door: true });
      if (!r || r.raised !== 'hr_gm_walled') say(`the door let the walled account reach "${path}": ${js(r)}`);
    }
    const ok = await k.call(GM, 'select public.hr_load(0)', [], { door: true });
    if (!ok || ok.raised || ok.ok === false) say('the door refused the walled account its own hero: ' + js(ok && (ok.raised || ok.error)));
    const a = await k.call(A, 'select public.hr_load(0)', [], { path: '/rpc/hr_chat_send', door: true });
    if (!a || a.raised) say('the door refused a real account: ' + js(a));
    const stale = await k.row(`select jsonb_agg(a.rpc) from public.hr_gm_wall_allow a where not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = a.rpc and has_function_privilege('authenticated', p.oid, 'execute'))`);
    if (stale) say('the list names what no client can call: ' + js(stale));
  },
  'GM-SEE': async (W, say) => {
    const { k, hunt } = W;
    await k.call(A, `select public.hr_hunt_enter(0, $1, '[]'::jsonb, 0, null, $2::uuid)`, [hunt, key()]);
    await db_setEmailProbe(k);
    const on = await k.call(GM, 'select public.hr_gm_online()', []);
    const row = on && on.heroes && on.heroes.find((h) => h.name === 'Marlow');
    if (!row || row.hunt !== hunt || row.id !== A || row.slot !== 0 || !Number.isInteger(row.level)) say('the online list did not show Marlow on its ground: ' + js(on).slice(0, 300));
    const h = await k.call(GM, 'select public.hr_gm_hero($1, $2::int)', ['marlow', 0]);
    if (!h || !h.hero || h.hero.id !== A || h.hero.slot !== 0 || !h.hero.hunt || h.hero.hunt.id !== hunt || typeof h.hero.gold !== 'number') say('the hero read is wrong: ' + js(h).slice(0, 300));
    const byId = await k.call(GM, 'select public.hr_gm_hero($1, $2::int)', [A, 1]);
    if (!byId || !byId.hero || byId.hero.name !== 'Marlowbo') say('the hero read by id is wrong: ' + js(byId).slice(0, 200));
    const none = await k.call(GM, 'select public.hr_gm_hero($1, $2::int)', ['Nobody Here', 0]);
    if (!none || none.error !== 'no_character') say('a missing hero answered ' + js(none));
    const net = await k.one(`select encode(net, 'hex') from public.account_play_net where user_id = $1`, [A]);
    for (const [what, ans] of [['online', on], ['hero', h]]) {
      const txt = js(ans);
      if (/secret@|example\.test/.test(txt)) say(`${what} carries an email`);
      if (txt.includes(IP)) say(`${what} carries an address`);
      if (net && txt.includes(net)) say(`${what} carries the network hash`);
    }
    await k.db.query(`update public.hunt_sessions set leave_at = now() - interval '1 hour', ended_at = now(), end_reason = 'left' where user_id = $1 and ended_at is null`, [A]);
    await k.db.query(`update public.player_state set active_kind = 'idle', active_id = null where user_id = $1`, [A]);
    await k.fresh();
  },
  'GM-STOP-JOB': async (W, say) => {
    const { k, node } = W;
    const started = await SA.runSetActivity({ exec: k.engine, user: B, slot: 0, intentId: key(), activity: { kind: 'gather', id: node } });
    if (started.status !== 200) throw harness('a real gather refused: ' + js(started.body).slice(0, 200));
    await k.db.query(`update public.player_state set active_since = now() - interval '1 hour', accrued_to = now() - interval '1 hour' where user_id = $1 and slot = 0`, [B]);
    const before = await k.one(`select count(*)::int from public.player_ledger where user_id = $1 and slot = 0`, [B]);
    const noWhy = await stopOf(k, GM, B, 0, 'x');
    if (noWhy.body.error !== 'needs_reason') say('a stop with no real reason answered ' + js(noWhy.body));
    const missing = await stopOf(k, GM, B, 4, 'a hero who is not there');
    if (missing.body.error !== 'no_character') say('a forged slot answered ' + js(missing.body));
    const k1 = key();
    const out = await stopOf(k, GM, B, 0, 'a QA check is blocked', k1);
    if (out.status !== 200 || out.body.kind !== 'job' || !out.body.collected || !(out.body.collected.ms > 0)) say('the stop did not collect the window: ' + js(out).slice(0, 300));
    if (js(out.body).includes('"state"')) say('the stop echoed the hero\'s state');
    if (await k.one('select public.hr_playing($1, 0)', [B])) say('the hero still plays after the stop');
    if (await k.one(`select active_kind from public.player_state where user_id = $1 and slot = 0`, [B]) !== 'idle') say('the pointer is not idle');
    if (await k.one(`select count(*)::int from public.player_ledger where user_id = $1 and slot = 0`, [B]) <= before) say('the switch left no ledger row on the hero');
    if (!await k.one(`select exists (select 1 from public.player_ledger where user_id = $1 and slot = 0 and intent = 'set_activity:idle')`, [B])) say('the stop did not go through set_activity');
    const again = await stopOf(k, GM, B, 0, 'a QA check is blocked', k1);
    if (again.status !== 200 || again.body.kind !== 'job') say('a replay of the stop answered ' + js(again.body).slice(0, 200));
    const idle = await stopOf(k, GM, B, 0, 'nothing is running now');
    if (idle.body.error !== 'nothing_to_stop') say('a stop on an idle hero answered ' + js(idle.body));
    const log = await k.one(`select count(*)::int from public.hr_gm_log where actor = $1 and verb = 'stop' and target_user = $2 and outcome = 'ok' and reason = 'a QA check is blocked'`, [GM, B]);
    if (log !== 1) say(`the stop journalled ${log} rows`);
    if (!await k.one(`select exists (select 1 from public.hr_gm_log where actor = $1 and verb = 'stop' and outcome = 'refused' and result->>'error' = 'needs_reason')`, [GM])) say('a refused stop left no row');
    if (!await k.one(`select exists (select 1 from public.hr_gm_log where actor = $1 and verb = 'stop_job' and target_user = $2 and outcome = 'ok')`, [GM, B])) say('the switch\'s result left no row');
    await k.fresh();
  },
  'GM-STOP-HUNT': async (W, say) => {
    const { k, hunt } = W;
    const e = await k.call(C, `select public.hr_hunt_enter(0, $1, '[]'::jsonb, 0, null, $2::uuid)`, [hunt, key()]);
    if (!e || e.ok !== true) throw harness('a real hunt refused: ' + js(e));
    const out = await stopOf(k, GM, C, 0, 'a hunt to stop');
    if (out.status !== 200 || out.body.kind !== 'hunt' || out.body.pending !== true) say('the stop on a hunt answered ' + js(out.body));
    const s = (await k.db.query(`select leave_at, settled_to, public.hr_hunt_live_horizon_at(settled_to) h, ended_at from public.hunt_sessions where user_id = $1 and ended_at is null`, [C])).rows[0];
    if (!s || !s.leave_at) say('the hunt holds no leave');
    else if (new Date(s.leave_at) < new Date(s.settled_to)) say('the stop walked behind the hunt');
    if (await k.one(`select active_kind from public.player_state where user_id = $1 and slot = 0`, [C]) !== 'combat') say('the stop wrote the pointer directly');
    /* The player's own verb reaches the same statement: its source is the helper's, once. */
    const src = await k.one(`select prosrc from pg_proc where oid = 'public.hr_hunt_leave(integer,uuid)'::regprocedure`);
    if (!/hr_hunt_leave_pending\(v_uid, p_slot\)/.test(src)) say('hr_hunt_leave no longer runs the shared statement');
    const twice = await stopOf(k, GM, C, 0, 'a hunt to stop');
    if (twice.body.kind !== 'hunt') say('a second stop answered ' + js(twice.body));
    await k.db.query(`update public.hunt_sessions set ended_at = now(), end_reason = 'left' where user_id = $1 and ended_at is null`, [C]);
    await k.db.query(`update public.player_state set active_kind = 'idle', active_id = null where user_id = $1`, [C]);
    await k.fresh();
  },
  'GM-CAP': async (W, say) => {
    const { k, node } = W;
    const go = (u, slot) => SA.runSetActivity({ exec: k.engine, user: u, slot, intentId: key(), activity: { kind: 'gather', id: node } });
    /* Four real heroes on one network fill it. The walled hero still starts; a fifth real one doesn't. */
    for (const [u, s] of [[A, 0], [A, 1], [D, 0], [D, 1]]) {
      const r = await go(u, s);
      if (r.status !== 200) throw harness('a real gather refused: ' + js(r.body).slice(0, 200));
    }
    const g = await go(GM, 0);
    if (g.status !== 200) say('the walled hero was refused by a full network: ' + js(g.body).slice(0, 200));
    if (await k.one('select count(*)::int from public.hero_play_net where user_id = $1', [GM])) say('a walled hero was stamped with a network');
    if (await k.one('select count(*)::int from public.account_play_net where user_id = $1', [GM])) say('a walled account stored its network');
    const real = await go(B, 1);
    if (real.status === 200 || real.body.error !== 'too_many_playing_here') say('a real fifth hero was not refused: ' + js(real.body).slice(0, 200));
    /* The pain: the GM stops the hero in the way, and the check goes on. */
    await stopOf(k, GM, A, 1, 'a real hero holds the seat');
    const after = await go(B, 1);
    if (after.status !== 200) say('the seat stayed taken after the stop: ' + js(after.body).slice(0, 200));
    /* The account's own four hold for the walled account. */
    await k.db.query(`insert into public.player_progress (user_id, slot, kind, key, period_key, value) select $1, 0, 'flag', 'character_slot:' || s, '', 1 from generate_series(1, 4) s on conflict do nothing`, [GM]);
    const dye = await k.one('select min(idx) from public.hr_outfit_dyes');
    for (let s = 1; s <= 4; s++) {
      const c = await k.call(GM, 'select public.hr_create_hero($1::int, $2, $3::jsonb, $4::uuid)', [s, 'Warden ' + 'abcd'[s - 1] + 'x', js({ head: dye, body: dye, legs: dye, feet: dye }), key()]);
      if (!c || c.ok !== true) throw harness('a walled hero: ' + js(c));
    }
    await k.fresh();
    for (let s = 1; s <= 3; s++) {
      const r = await go(GM, s);
      if (r.status !== 200) say(`walled hero ${s + 1} of 4 was refused: ` + js(r.body).slice(0, 200));
    }
    const fifth = await go(GM, 4);
    if (fifth.status === 200 || fifth.body.error !== 'too_many_playing') say('the walled account played a fifth hero: ' + js(fifth.body).slice(0, 200));
    /* No account is named in the cap: nobody is exempt by id. */
    const src = await k.one(`select string_agg(prosrc, ' ') from pg_proc where proname in ('hr_play_net_of', 'hr_play_net_note', 'hr_play_refusal', 'hr_play_claim')`);
    if (/[0-9a-f]{8}-[0-9a-f]{4}-/.test(src)) say('the cap names an account');
    for (const [u, s] of [[A, 0], [D, 0], [D, 1], [B, 1], [GM, 0], [GM, 1], [GM, 2], [GM, 3]]) {
      await k.fresh();
      const r = await SA.runSetActivity({ exec: k.engine, user: u, slot: s, intentId: key(), activity: { kind: 'idle' } });
      if (r.status !== 200) throw harness('a stop refused: ' + js(r.body).slice(0, 200));
    }
    await k.fresh();
  },
  'GM-MUTE': async (W, say) => {
    const { k } = W;
    const m = await k.call(GM, 'select public.hr_gm_mute($1::uuid, 60, $2, $3::uuid)', [D, 'spam in global', key()]);
    if (!m || m.ok !== true || !m.until) say('the mute answered ' + js(m));
    const chat = await k.call(D, `select public.hr_chat_send(0, 'global', 'hello')`, []);
    if (!chat || chat.error !== 'muted') say('a muted account chatted: ' + js(chat).slice(0, 200));
    const w = await k.call(D, `select public.hr_whisper_send(0, 'Marlow', 'psst')`, []);
    if (!w || w.error !== 'muted') say('a muted account whispered: ' + js(w).slice(0, 200));
    /* The second lock: any writer of a player line. A server line about the hero still lands. */
    const direct = await k.row(`insert into public.chat_messages (channel, from_id, from_name, from_slot, body) values ('global', $1, 'x', 0, 'by another door') returning 1`, [D]);
    if (!direct || direct.raised !== 'muted') say('a line reached past the mute: ' + js(direct));
    const wd = await k.row(`insert into public.chat_whispers (from_id, from_name, to_id, to_name, body) values ($1, 'x', $2, 'y', 'by another door') returning 1`, [D, A]);
    if (!wd || wd.raised !== 'muted') say('a whisper reached past the mute: ' + js(wd));
    const sys = await k.row(`insert into public.chat_messages (channel, from_id, from_name, from_slot, body) values ('system', $1, 'x', 0, 'found something') returning 1`, [D]);
    if (sys !== 1) say('a server line about a muted hero failed: ' + js(sys));
    if (await k.one('select public.hr_chat_muted_until($1)', [A])) say('someone else reads as muted');
    const bad = await k.call(GM, 'select public.hr_gm_mute($1::uuid, 0, $2, $3::uuid)', [D, 'a zero mute', key()]);
    if (!bad || bad.error !== 'bad_minutes') say('a zero mute answered ' + js(bad));
    const ghost = await k.call(GM, 'select public.hr_gm_mute($1::uuid, 5, $2, $3::uuid)', [U(99), 'a forged account', key()]);
    if (!ghost || ghost.error !== 'no_player') say('a forged account answered ' + js(ghost));
    const self = await k.call(GM, 'select public.hr_gm_mute($1::uuid, 5, $2, $3::uuid)', [GM, 'the wrong one', key()]);
    if (!self || self.error !== 'target_is_gm') say('the GM muted a GM: ' + js(self));
    const un = await k.call(GM, 'select public.hr_gm_unmute($1::uuid, $2, $3::uuid)', [D, 'served', key()]);
    if (!un || un.ok !== true) say('the unmute answered ' + js(un));
    const back = await k.call(D, `select public.hr_chat_send(0, 'global', 'hello again')`, []);
    if (!back || back.ok !== true) say('an unmuted account is still refused: ' + js(back).slice(0, 200));
    await k.db.query(`insert into public.hr_chat_mutes (user_id, until) values ($1, now() - interval '1 minute')`, [D]);
    const over = await k.call(D, `select public.hr_chat_send(0, 'global', 'it ran out')`, []);
    if (!over || over.ok !== true) say('an expired mute still refuses: ' + js(over).slice(0, 200));
    await k.db.query('delete from public.hr_chat_mutes where user_id = $1', [D]);
    await k.fresh();
  },
  'GM-BAN': async (W, say) => {
    const { k, hunt, node } = W;
    const e = await k.call(D, `select public.hr_hunt_enter(0, $1, '[]'::jsonb, 0, null, $2::uuid)`, [hunt, key()]);
    if (!e || e.ok !== true) throw harness('a real hunt refused: ' + js(e));
    const j = await SA.runSetActivity({ exec: k.engine, user: D, slot: 1, intentId: key(), activity: { kind: 'gather', id: node } });
    if (j.status !== 200) throw harness('a real gather refused: ' + js(j.body).slice(0, 200));
    const noWhy = await k.call(GM, 'select public.hr_gm_ban($1::uuid, $2, $3::uuid)', [D, '', key()]);
    if (!noWhy || noWhy.error !== 'needs_reason') say('a ban with no reason answered ' + js(noWhy));
    const b = await k.call(GM, 'select public.hr_gm_ban($1::uuid, $2, $3::uuid)', [D, 'rmt spam', key()]);
    if (!b || b.ok !== true || b.hunts !== 1 || !b.jobs || b.jobs.length !== 1 || b.jobs[0].slot !== 1) say('the ban answered ' + js(b));
    const load = await k.call(D, 'select public.hr_load(0)', [], { door: true });
    if (!load || load.raised !== 'hr_banned') say('a banned account passed the door: ' + js(load).slice(0, 200));
    const rpc = await k.call(D, `select public.hr_chat_send(0, 'global', 'x')`, []);
    if (!rpc || rpc.raised !== 'hr_banned') say('a banned account reached an RPC: ' + js(rpc).slice(0, 200));
    if (await k.one(`select public.hr_rate_gate($1, 0, 'accrue')`, [D])) say('the engine door let a banned account in');
    if (await k.one('select public.hr_admitted($1)', [D])) say('hr_admitted admits a banned account');
    if (!await k.one('select public.hr_admitted($1)', [A])) say('hr_admitted refuses someone else');
    const look = await k.call(A, 'select public.hr_inspect($1, 0)', ['Wrenna']);
    if (!look || look.error !== 'unavailable') say('a look-up reached a banned account: ' + js(look).slice(0, 200));
    if (!await k.one(`select exists (select 1 from public.hr_lb_hidden where user_id = $1 and slot is null and reason = 'banned')`, [D])) say('the boards still rank a banned account');
    if (!await k.one(`select leave_at is not null from public.hunt_sessions where user_id = $1 and slot = 0 and ended_at is null`, [D])) say('the banned hero\'s hunt holds no leave');
    /* Neither the hero's own budget nor its ban may refuse its stop. */
    const s = await stopOf(k, GM, D, 1, 'banned, its job stops');
    if (s.status !== 200 || s.body.kind !== 'job') say('a banned hero\'s job would not stop: ' + js(s).slice(0, 300));
    if (await k.one(`select active_kind from public.player_state where user_id = $1 and slot = 1`, [D]) !== 'idle') say('the banned hero still works');
    const un = await k.call(GM, 'select public.hr_gm_unban($1::uuid, $2, $3::uuid)', [D, 'appeal heard', key()]);
    if (!un || un.ok !== true) say('the unban answered ' + js(un));
    const in2 = await k.call(D, 'select public.hr_load(0)', [], { door: true });
    if (!in2 || in2.raised) say('an unbanned account stays out: ' + js(in2).slice(0, 200));
    if (await k.one(`select exists (select 1 from public.hr_lb_hidden where user_id = $1 and reason = 'banned')`, [D])) say('the boards still hide an unbanned account');
    /* A 'test' row the boards already held isn't lifted by an unban. */
    if (!await k.one(`select exists (select 1 from public.hr_lb_hidden where user_id = $1 and reason = 'test')`, [GM])) say('the GM fell off the hidden list');
    const gmBan = await k.call(GM, 'select public.hr_gm_ban($1::uuid, $2, $3::uuid)', [GM, 'the wrong one', key()]);
    if (!gmBan || gmBan.error !== 'target_is_gm') say('the GM banned a GM: ' + js(gmBan));
    await k.db.query(`update public.hunt_sessions set ended_at = now(), end_reason = 'left' where user_id = $1 and ended_at is null`, [D]);
    await k.db.query(`update public.player_state set active_kind = 'idle', active_id = null where user_id = $1`, [D]);
    await k.fresh();
  },
  'GM-SAY': async (W, say) => {
    const { k } = W;
    const empty = await k.call(GM, 'select public.hr_gm_say($1, $2::uuid)', ['   ', key()]);
    if (!empty || empty.error !== 'empty') say('an empty line answered ' + js(empty));
    const k1 = key();
    const r = await k.call(GM, 'select public.hr_gm_say($1, $2::uuid)', ['  Maintenance\tin ten minutes  ', k1]);
    if (!r || r.ok !== true || !r.line) throw harness('the say answered ' + js(r));
    if (r.line.channel !== 'system' || r.line.from_role !== 'game_master') say('the line is not stamped: ' + js(r.line));
    if (await k.one('select from_name from public.chat_messages where id = $1', [r.line.id]) !== 'Game Master') say('the stored line is not the Game Master\'s');
    if (r.line.body !== 'Maintenance in ten minutes') say('the line was not cleaned: ' + js(r.line.body));
    const rep = await k.call(GM, 'select public.hr_gm_say($1, $2::uuid)', ['Maintenance in ten minutes', k1]);
    if (!rep || rep.ok !== true) say('a replay answered ' + js(rep));
    if (await k.one(`select count(*)::int from public.chat_messages where body = 'Maintenance in ten minutes'`) !== 1) say('a replay spoke twice');
    const fast = await k.call(GM, 'select public.hr_gm_say($1, $2::uuid)', ['Too soon', key()]);
    if (!fast || fast.error !== 'rate_limited') say('a second line in 30 s answered ' + js(fast));
    await k.fresh();
    const masked = await k.call(GM, 'select public.hr_gm_say($1, $2::uuid)', ['you hitler', key()]);
    if (!masked || masked.ok !== true || /hitler/i.test(masked.line.body)) say('a line was not masked: ' + js(masked).slice(0, 200));
    /* A player's channel kinds stop at global, local and party: no client path to `system`, and no stamp on a hero named anything. */
    const forged = await k.call(A, `select public.hr_chat_send(0, 'system', 'Game Master speaks')`, []);
    if (!forged || forged.error !== 'bad_channel') say('a client reached the system channel: ' + js(forged).slice(0, 200));
    const fixed = await k.row(`insert into public.chat_messages (channel, from_id, from_name, from_slot, from_role, body) values ('system', $1, 'x', 0, 'game_master', 'a real hero') returning from_name`, [A]);
    if (fixed === 'Game Master') say('a real hero was stamped Game Master');
    for (let i = 0; i < 20; i++) await k.db.query(`insert into public.hr_gm_log (actor, verb, outcome) values ($1, 'say', 'ok')`, [GM]);
    await k.fresh();
    const day = await k.call(GM, 'select public.hr_gm_say($1, $2::uuid)', ['One more today', key()]);
    if (!day || day.error !== 'day_limit') say('the day\'s limit answered ' + js(day));
    await k.fresh();
  },
  'GM-GRANT': async (W, say) => {
    const { k, item, node } = W;
    const real = { g: await gold(k, A), q: await qty(k, A, 0, item), lx: await k.one(`select level_xp from public.player_state where user_id = $1 and slot = 0`, [A]) };
    const g0 = await gold(k, GM);
    const k1 = key();
    const r = await k.call(GM, 'select public.hr_gm_grant_gold(0, 5000::bigint, $1, $2::uuid)', ['testing a price', k1]);
    if (!r || r.ok !== true) say('a gold grant answered ' + js(r));
    if (await gold(k, GM) !== g0 + 5000) say('the purse did not move by the grant');
    const led = (await k.db.query(`select gold::bigint g, kind, intent, meta from public.player_ledger where user_id = $1 and intent = 'gm_grant:gold' order by id desc limit 1`, [GM])).rows[0];
    if (!led || Number(led.g) !== 5000 || led.kind !== 'admin' || !led.meta || led.meta.reason !== 'testing a price') say('the ledger row is wrong: ' + js(led));
    if (!await k.one(`select exists (select 1 from public.hr_gm_log where actor = $1 and verb = 'grant_gold' and outcome = 'ok' and reason = 'testing a price' and target_user = $1 and target_slot = 0)`, [GM])) say('the log has no grant row');
    const rep = await k.call(GM, 'select public.hr_gm_grant_gold(0, 5000::bigint, $1, $2::uuid)', ['testing a price', k1]);
    if (!rep || rep.ok !== true || await gold(k, GM) !== g0 + 5000) say('a replay paid again');
    if ((await k.call(GM, 'select public.hr_gm_grant_gold(0, 5000::bigint, $1, $2::uuid)', ['no', key()])).error !== 'needs_reason') say('a grant with no real reason was not refused');
    if ((await k.call(GM, 'select public.hr_gm_grant_gold(0, 1000001::bigint, $1, $2::uuid)', ['over the call', key()])).error !== 'bad_amount') say('over the per-call clamp');
    if ((await k.call(GM, 'select public.hr_gm_grant_gold(0, 0::bigint, $1, $2::uuid)', ['zero gold', key()])).error !== 'bad_amount') say('a zero grant');
    if ((await k.call(GM, 'select public.hr_gm_grant_gold(0, -5::bigint, $1, $2::uuid)', ['a negative grant', key()])).error !== 'bad_amount') say('a negative grant');
    if ((await k.call(GM, 'select public.hr_gm_grant_gold(5, 5::bigint, $1, $2::uuid)', ['a slot with no hero', key()])).error !== 'no_character') say('a forged slot');
    if ((await k.call(GM, 'select public.hr_gm_grant_gold(9, 5::bigint, $1, $2::uuid)', ['a slot out of range', key()])).error !== 'bad_slot') say('a slot out of range');
    /* The day's clamp reads the ledger. */
    await k.fresh();
    for (let i = 0; i < 9; i++) {
      const g = await k.call(GM, 'select public.hr_gm_grant_gold(0, 1000000::bigint, $1, $2::uuid)', ['filling the day', key()]);
      if (!g || g.ok !== true) say('a grant under the day refused: ' + js(g));
    }
    const over = await k.call(GM, 'select public.hr_gm_grant_gold(0, 1000000::bigint, $1, $2::uuid)', ['past the day', key()]);
    if (!over || over.error !== 'day_limit') say('past the day\'s clamp answered ' + js(over));
    /* Items and a Level. */
    await k.fresh();
    const i0 = await qty(k, GM, 0, item);
    const it = await k.call(GM, 'select public.hr_gm_grant_item(0, $1, 25::bigint, $2, $3::uuid)', [item, 'testing a bench', key()]);
    if (!it || it.ok !== true || await qty(k, GM, 0, item) !== i0 + 25) say('an item grant answered ' + js(it));
    if ((await k.call(GM, 'select public.hr_gm_grant_item(0, $1, 25::bigint, $2, $3::uuid)', ['no_such_item_zz', 'a forged item', key()])).error !== 'bad_item') say('a forged item');
    if ((await k.call(GM, 'select public.hr_gm_grant_item(0, $1, 1001::bigint, $2, $3::uuid)', [item, 'over the call', key()])).error !== 'bad_amount') say('items over the clamp');
    const lv = await k.call(GM, 'select public.hr_gm_grant_level(0, 40, $1, $2::uuid)', ['testing a ground', key()]);
    if (!lv || lv.ok !== true || await k.one('select public.hr_level_of($1, 0)', [GM]) !== 40) say('a Level grant answered ' + js(lv));
    if (!await k.one(`select exists (select 1 from public.player_ledger where user_id = $1 and intent = 'gm_grant:level' and (meta->>'level')::int = 40)`, [GM])) say('the Level grant left no ledger row');
    if ((await k.call(GM, 'select public.hr_gm_grant_level(0, 20, $1, $2::uuid)', ['lowering it', key()])).error !== 'already_there') say('a Level grant lowered a hero');
    if ((await k.call(GM, 'select public.hr_gm_grant_level(0, 501, $1, $2::uuid)', ['over the top', key()])).error !== 'bad_level') say('a Level over the clamp');
    /* A hero at work is refused: a grant never races a settle. */
    const busy = await SA.runSetActivity({ exec: k.engine, user: GM, slot: 0, intentId: key(), activity: { kind: 'gather', id: node } });
    if (busy.status !== 200) throw harness('a walled gather refused: ' + js(busy.body).slice(0, 200));
    if ((await k.call(GM, 'select public.hr_gm_grant_gold(0, 5::bigint, $1, $2::uuid)', ['while it works', key()])).error !== 'hero_busy') say('a working hero took a grant');
    await k.fresh();
    await SA.runSetActivity({ exec: k.engine, user: GM, slot: 0, intentId: key(), activity: { kind: 'idle' } });
    /* The real hero: unmoved by any of it. */
    if (await gold(k, A) !== real.g || await qty(k, A, 0, item) !== real.q || await k.one(`select level_xp from public.player_state where user_id = $1 and slot = 0`, [A]) !== real.lx) say('a grant reached a real hero');
    /* Forged at the real hero: a real caller is refused; a GM has no way to name one (GM-SHAPE). */
    if (js(await k.call(A, 'select public.hr_gm_grant_level(0, 300, $1, $2::uuid)', ['my own hero', key()])) !== REFUSED) say('a real hero was granted');
    await k.fresh();
  },
  'GM-LOG': async (W, say) => {
    const { k } = W;
    await k.db.query(`insert into public.hr_gm_log (actor, verb, outcome) values ($1, 'probe', 'ok')`, [GM]);
    for (const [what, sql] of [['update', `update public.hr_gm_log set verb = 'rewrite' where verb = 'probe'`], ['delete', `delete from public.hr_gm_log where verb = 'probe'`], ['truncate', 'truncate public.hr_gm_log']]) {
      const r = await k.row(sql + (what === 'truncate' ? '' : ' returning 1'));
      if (!r || !r.raised || !/append-only/.test(r.raised)) say(`the log took a ${what}: ` + js(r));
    }
    const r = await k.call(GM, `select * from public.hr_gm_log`, [], { path: '/rpc/hr_load' });
    if (!r || !r.raised) say('a client read the log, even the GM: ' + js(r).slice(0, 120));
  },
  'GM-NAME': async (W, say) => {
    const { k } = W;
    for (const n of ['Game Master', 'GameMaster', 'GM Bob', 'Bob GM', 'Bob_GM', 'G.M. Bob', 'Game-Master Bob', 'gm_lord']) {
      const r = await k.one('select public.hr_validate_display_name($1)', [n]);
      if (!r || r.ok !== false || r.reason !== 'reserved') say(`"${n}" is a free name: ${js(r)}`);
    }
    for (const n of ['Gmork', 'Magma', 'Ogma Rune', 'Hegemon']) {
      const r = await k.one('select public.hr_validate_display_name($1)', [n]);
      if (!r || r.ok !== true) say(`"${n}" was refused: ${js(r)}`);
    }
  },
  'GM-BADGE': async (W, say) => {
    const { k } = W;
    const map = await k.one('select m.map_id from public.hr_town_maps m where m.main');
    let at = null;
    for (const u of [GM, A]) {
      const r = await k.call(u, 'select public.hr_town_here(0, $1)', [map]);
      if (!r || r.ok === false || r.raised) throw harness('hr_town_here: ' + js(r).slice(0, 200));
      if (u === GM) at = r.me;
    }
    const look = await k.one('select look from public.town_bodies where user_id = $1 and slot = 0', [GM]);
    if (!look || look.gm !== true) say('a walled body is not stamped: ' + js(look));
    const mine = await k.one('select look from public.town_bodies where user_id = $1 and slot = 0', [A]);
    if (!mine || mine.gm !== undefined) say('a real body carries the stamp: ' + js(mine));
    const v = await k.call(A, 'select public.hr_town_view(0, $1, $2::int, $3::int, null, null, null)', [map, at.x, at.y]);
    const seen = v && Array.isArray(v.people) ? v.people : v && Array.isArray(v.walkers) ? v.walkers : null;
    if (!seen) say('the town view holds no people: ' + js(v).slice(0, 200));
    else {
      const w = seen.find((p) => p.id === GM);
      if (!w || w.gm !== true) say('another player does not read the stamp: ' + js(w) + ' of ' + js(seen.map((p) => p.name)));
    }
    await k.fresh();
  },
  'GM-W-MARKET': async (W, say) => {
    const { k, item } = W;
    const floor = String(await k.one('select floor_each from public.hr_market_items where item_id = $1', [item]));
    await k.db.query(`update public.player_state set level_xp = public.hr_char_xp_for_level((select min_level from public.hr_market_config) + 1) where user_id = any ($1) and slot = 0`, [[GM, A]]);
    for (const u of [GM, A]) await k.db.query(`insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, $2, 10) on conflict (user_id, slot, item_id) do update set qty = 10`, [u, item]);
    await k.db.query(`insert into public.account_wallet (user_id, gold) values ($1, 100000) on conflict (user_id) do update set gold = public.account_wallet.gold + 100000`, [GM]);
    await k.db.query(`insert into public.account_wallet (user_id, gold) values ($1, 100000) on conflict (user_id) do update set gold = public.account_wallet.gold + 100000`, [A]);
    const list = async (u) => { const v = await k.one('select version from public.player_state where user_id = $1 and slot = 0', [u]); return (await k.engine(`select public.hr_market_list($1::uuid, 0, $2::bigint, $3::uuid, 'bag', $4, 3::bigint, $5::bigint) as r`, [u, v, key(), item, floor]))[0].r; };
    const gm0 = { g: await gold(k, GM), q: await qty(k, GM, 0, item) };
    const l = await list(GM);
    if (!l || l.ok === true || l.error !== 'gm_walled') say('a walled hero listed: ' + js(l).slice(0, 200));
    if (await k.one('select count(*)::int from public.market_listings where user_id = $1', [GM])) say('a walled listing stands');
    const real = await list(A);
    if (!real || real.ok !== true) throw harness('a real listing refused: ' + js(real).slice(0, 200));
    const buy = (await k.engine(`select public.hr_market_buy($1::uuid, 0, null, $2::uuid, $3::uuid, 1::bigint, $4::bigint, 'storage') as r`, [GM, key(), real.listed.listing_id, floor]))[0].r;
    if (!buy || buy.ok === true || buy.error !== 'gm_walled') say('a walled hero bought: ' + js(buy).slice(0, 200));
    if (await k.one('select count(*)::int from public.market_sales where buyer_user_id = $1', [GM])) say('a sale to a walled hero stands');
    const after = { g: await gold(k, GM), q: await qty(k, GM, 0, item) };
    if (after.g !== gm0.g || after.q !== gm0.q) say('the wall let value move: ' + js([gm0, after]));
    /* Receive: a row naming a walled seller, on any path. */
    const forged = await k.row(`insert into public.market_sales (listing_id, seller_user_id, seller_slot, buyer_user_id, buyer_slot, item_id, qty, gold_gross, tax, gold_net) values ($1, $2, 0, $3, 0, $4, 1, 10, 1, 9) returning 1`, [real.listed.listing_id, GM, A, item]);
    if (!forged || forged.raised !== 'gm_walled') say('a walled seller received: ' + js(forged));
    await k.fresh();
  },
  'GM-W-CHAT': async (W, say) => {
    const { k } = W;
    for (const kind of ['global', 'local', 'party']) {
      const door = await k.call(GM, `select public.hr_chat_send(0, $1, 'hello')`, [kind], { door: true });
      if (!door || door.raised !== 'hr_gm_walled') say(`the door let ${kind} chat through: ` + js(door).slice(0, 200));
    }
    for (const kind of ['global', 'local']) {
      const r = await k.past(GM, `select public.hr_chat_send(0, $1, 'hello')`, [kind]);
      if (!r || r.raised !== 'gm_walled') say(`${kind} chat crossed the wall past the door: ` + js(r).slice(0, 200));
    }
    for (const ch of ['global', 'local:town', 'party:00000000-0000-4000-a000-000000000001']) {
      const r = await k.row(`insert into public.chat_messages (channel, from_id, from_name, from_slot, body) values ($1, $2, 'x', 0, 'by another door') returning 1`, [ch, GM]);
      if (!r || r.raised !== 'gm_walled') say(`a line on ${ch} crossed the wall: ` + js(r));
    }
    await k.fresh();
  },
  'GM-W-WHISPER': async (W, say) => {
    const { k } = W;
    const out = await k.past(GM, `select public.hr_whisper_send(0, 'Marlow', 'psst')`, []);
    if (!out || out.raised !== 'gm_walled') say('a walled hero whispered: ' + js(out).slice(0, 200));
    const inn = await k.call(A, `select public.hr_whisper_send(0, 'Warden', 'psst')`, []);
    if (!inn || inn.error !== 'unavailable') say('a whisper reached the Game Master: ' + js(inn).slice(0, 200));
    for (const [f, t] of [[GM, A], [A, GM]]) {
      const r = await k.row(`insert into public.chat_whispers (from_id, from_name, to_id, to_name, body) values ($1, 'x', $2, 'y', 'by another door') returning 1`, [f, t]);
      if (!r || r.raised !== 'gm_walled') say('a whisper row crossed the wall: ' + js(r));
    }
    await k.fresh();
  },
  'GM-W-FRIEND': async (W, say) => {
    const { k } = W;
    const out = await k.past(GM, `select public.hr_friend_request('Marlow')`, []);
    if (!out || out.raised !== 'gm_walled') say('a walled hero asked a friend: ' + js(out).slice(0, 200));
    const inn = await k.call(A, `select public.hr_friend_request('Warden')`, []);
    if (!inn || inn.raised !== 'gm_walled') say('a real hero befriended the Game Master: ' + js(inn).slice(0, 200));
    const [lo, hi] = [GM, A].sort();
    const link = await k.row('insert into public.friend_links (user_lo, user_hi) values ($1, $2) returning 1', [lo, hi]);
    if (!link || link.raised !== 'gm_walled') say('a friend link crossed the wall: ' + js(link));
    await k.fresh();
  },
  'GM-W-PARTY': async (W, say) => {
    const { k, hunt } = W;
    /* A walled leader inviting a real hero, and the door before it. */
    const d = await k.call(GM, 'select public.hr_hunt_party_invite_player(0, $1::uuid, 0, $2::uuid)', [A, key()], { door: true });
    if (!d || d.raised !== 'hr_gm_walled') say('the door let a cross-wall invite through: ' + js(d).slice(0, 200));
    const out = await k.past(GM, 'select public.hr_hunt_party_invite_player(0, $1::uuid, 0, $2::uuid)', [A, key()]);
    if (!out || out.raised !== 'gm_walled') say('a walled hero invited a real one: ' + js(out).slice(0, 200));
    /* A real leader inviting the Game Master. */
    const inn = await k.call(A, 'select public.hr_hunt_party_invite_player(0, $1::uuid, 0, $2::uuid)', [GM, key()]);
    if (!inn || inn.raised !== 'gm_walled') say('a real hero invited the Game Master: ' + js(inn).slice(0, 200));
    if (await k.one('select count(*)::int from public.hunt_party_invites where to_user = $1 or from_user = $1', [GM])) say('a cross-wall invite stands');
    /* A seat across the wall, by the writer every join goes through; a walled party is never listed, and neither is a seeker. */
    const real = await k.one('select public.hr_party_open($1::uuid, 0)', [A]);
    const seat = await k.row('select public.hr_party_seat_into($1::uuid, $2::uuid, 0)', [real, GM]);
    if (!seat || seat.raised !== 'gm_walled') say('a walled hero took a real party\'s seat: ' + js(seat));
    const join = await k.past(GM, 'select public.hr_hunt_party_join(0, $1::uuid, $2::uuid)', [real, key()]);
    if (!join || !(join.raised === 'gm_walled' || join.ok === false)) say('a walled hero joined a real party: ' + js(join).slice(0, 200));
    if (await k.one('select count(*)::int from public.hunt_party_members where party_id = $1 and user_id = $2', [real, GM])) say('a walled hero sits in a real party');
    const mine = await k.one('select public.hr_party_open($1::uuid, 0)', [GM]);
    const in2 = await k.row('select public.hr_party_seat_into($1::uuid, $2::uuid, 1)', [mine, A]);
    if (!in2 || in2.raised !== 'gm_walled') say('a real hero took a walled party\'s seat: ' + js(in2));
    const listed = await k.row('update public.hunt_parties set listed = true where id = $1 returning 1', [mine]);
    if (!listed || listed.raised !== 'gm_walled') say('a walled party was listed: ' + js(listed));
    const seek = await k.row(`insert into public.party_seekers (user_id, slot, hunt_id, expires_at) values ($1, 0, $2, now() + interval '1 hour') returning 1`, [GM, hunt]);
    if (!seek || seek.raised !== 'gm_walled') say('a walled hero sought a party: ' + js(seek));
    /* Control: the real party still lists, and the wall isn't refusing everyone. */
    const ok = await k.row('update public.hunt_parties set listed = true where id = $1 returning 1', [real]);
    if (ok !== 1) say('a real party was refused a listing: ' + js(ok));
    await k.db.query('delete from public.hunt_party_members where party_id = any ($1)', [[real, mine]]);
    await k.db.query('delete from public.hunt_parties where id = any ($1)', [[real, mine]]);
    await k.fresh();
  },
  'GM-W-HEARTH': async (W, say) => {
    const { k, fuel } = W;
    await k.db.query(`insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, $2, 3) on conflict (user_id, slot, item_id) do update set qty = 3`, [GM, fuel]);
    await k.db.query(`insert into public.player_skills (user_id, slot, skill_id, xp) values ($1, 0, 'inner_flame', public.hr_skill_xp_for_level('inner_flame', 99)) on conflict (user_id, slot, skill_id) do update set xp = excluded.xp`, [GM]);
    const door = await k.call(GM, 'select public.hr_hearth_burn(0, $1, $2::uuid)', [fuel, key()], { door: true });
    if (!door || door.raised !== 'hr_gm_walled') say('the door let a burn through: ' + js(door).slice(0, 200));
    const r = await k.past(GM, 'select public.hr_hearth_burn(0, $1, $2::uuid)', [fuel, key()]);
    if (!r || r.raised !== 'gm_walled') say('a walled hero fed the Great Hearth: ' + js(r).slice(0, 200));
    if (await qty(k, GM, 0, fuel) !== 3) say('the refused burn took the fuel');
    if (await k.one('select count(*)::int from public.hearth_flames where user_id = $1', [GM])) say('a walled flame stands');
    if (await k.one(`select count(*)::int from public.chat_messages where from_id = $1 and body like 'fed the Great Hearth%'`, [GM])) say('a walled burn spoke');
    await k.fresh();
  },
  'GM-W-FINDS': async (W, say) => {
    const { k, hunt, item } = W;
    for (const [u, want, who] of [[GM, false, 'a walled hero'], [A, true, 'a real hero']]) {
      for (const fn of ['hr_state_of', 'hr_hunt_member_state']) {
        const env = await k.one(`select public.${fn}($1, 0)`, [u]);
        if (engineInputsFromEnvelope(env, Date.now()).hearthfindReady !== want) say(`${fn}: ${who} reads hearthfindReady ${!want}`);
      }
    }
    const find = await k.row(`insert into public.world_finds (user_id, slot, item_id, source_kind, source_id, one_in) values ($1, 0, $2, 'monster', 'x', 1000) returning 1`, [GM, item]);
    if (find && find.raised) say('a walled find row raised: ' + js(find));
    if (await k.one('select count(*)::int from public.world_finds where user_id = $1', [GM])) say('a walled find is in the feed');
    /* The rare line, through its own trigger, as a settle writes it: nothing refused, nothing posted. */
    const e = await k.call(GM, `select public.hr_hunt_enter(0, $1, '[]'::jsonb, 0, null, $2::uuid)`, [hunt, key()]);
    if (!e || e.ok !== true) throw harness('a walled hunt refused: ' + js(e));
    const sid = await k.one('select id from public.hunt_sessions where user_id = $1 and ended_at is null', [GM]);
    const ev = await k.row(`insert into public.hunt_session_events (session_id, user_id, slot, type, at, data) values ($1, $2, 0, 'rare_drop', now(), $3::jsonb) returning 1`, [sid, GM, js({ item })]);
    if (ev !== 1) say('a rare event failed the writer: ' + js(ev));
    const n = (await k.db.query('select status, message_id from public.hr_world_notices where user_id = $1', [GM])).rows;
    if (n.length !== 1 || n[0].status !== 'quiet' || n[0].message_id !== null) say('a walled notice reads ' + js(n));
    if (await k.one(`select count(*)::int from public.chat_messages where from_id = $1 and channel = 'system' and body like 'found %'`, [GM])) say('a walled find spoke to the server');
    await k.db.query(`update public.hunt_sessions set ended_at = now(), end_reason = 'left' where user_id = $1 and ended_at is null`, [GM]);
    await k.db.query(`update public.player_state set active_kind = 'idle', active_id = null where user_id = $1`, [GM]);
    await k.fresh();
  },
  'GM-W-BOARDS': async (W, say) => {
    const { k } = W;
    await k.db.query(`update public.player_state set level_xp = public.hr_char_xp_for_level(400) where user_id = $1 and slot = 0`, [GM]);
    await k.db.query(`update public.player_state set level_xp = public.hr_char_xp_for_level(50) where user_id = $1 and slot = 0`, [A]);
    await k.one('select public.hr_leaderboard_refresh(true)');
    if (await k.one('select count(*)::int from public.leaderboard_ranked where user_id = $1', [GM])) say('a walled hero is ranked');
    if (!await k.one('select count(*)::int from public.leaderboard_ranked where user_id = $1', [A])) say('no real hero is ranked: the arm proves nothing');
    const boards = await k.one('select public.hr_lb_boards()');
    for (const b of boards) {
      await k.fresh();
      const r = await k.call(A, 'select public.hr_leaderboard($1, 200, 1)', [b]);
      if (js(r).includes('Warden')) say(`board ${b} names the Game Master`);
    }
    await k.db.query(`update public.player_state set level_xp = 0 where user_id = $1 and slot = 0`, [GM]);
    await k.fresh();
  },
  'GM-W-OTHER': async (W, say) => {
    const { k } = W;
    const clan = await k.one(`insert into public.clans (name, created_by) values ('gm tools clan', $1) returning id`, [A]);
    const r = await k.row(`insert into public.clan_members (clan_id, user_id) values ($1, $2) returning 1`, [clan, GM]);
    if (!r || r.raised !== 'gm_walled') say('a walled hero joined a clan: ' + js(r));
    const ok = await k.row(`insert into public.clan_members (clan_id, user_id) values ($1, $2) returning 1`, [clan, B]);
    if (ok !== 1) say('a real hero was refused a clan (control): ' + js(ok));
    await k.db.query('delete from public.clan_members where clan_id = $1', [clan]);
    await k.db.query('delete from public.clans where id = $1', [clan]);
    const g = await k.row(`insert into public.hr_discord_gift_claims (user_id, slot, week, gems_paid) values ($1, 0, 'x', 1) returning 1`, [GM]);
    if (!g || g.raised !== 'gm_walled') say('a walled hero claimed a gift: ' + js(g));
  },
  'GM-W-CROSS': async (W, say) => {
    const { k } = W;
    /* Storage and the bag move inside one account, and the verb names no other. */
    const args = await k.one(`select pg_get_function_identity_arguments('public.hr_bank_move(integer,text,bigint,text,uuid)'::regprocedure)`);
    if (/uuid[^,]*(target|user|account)|(target|user|account) uuid/.test(args)) say('hr_bank_move names another account: ' + args);
    const g = await gold(k, A);
    await k.fresh();
    const r = await k.call(GM, 'select public.hr_gm_grant_gold(0, 7::bigint, $1, $2::uuid)', ['the purse is mine', key()]);
    if (!r || r.ok !== true) say('a grant refused: ' + js(r));
    if (await gold(k, A) !== g) say('a grant reached another purse');
    /* The only verbs that write two accounts' goods are the market's; GM-W-MARKET refuses them. */
    const crossers = await k.one(`select coalesce(jsonb_agg(p.proname order by p.proname), '[]'::jsonb) from pg_proc p
      where p.pronamespace = 'public'::regnamespace and has_function_privilege('authenticated', p.oid, 'execute') and p.prosecdef
        and p.prosrc ~ 'hr_purse_move|update public.account_wallet' and p.proname not like 'hr\\_gm\\_%'
        and pg_get_function_identity_arguments(p.oid) ~ '(p_target|p_to|p_buyer|p_seller)'`);
    if (crossers.length) say('a client verb moves a purse and names a target: ' + js(crossers));
    await k.fresh();
  },
  'GM-W-FUTURE': async (W, say) => {
    const { k } = W;
    for (const t of ['account_gold_given', 'town_works_gifts', 'town_works_totals', 'town_shows']) {
      const present = await k.one('select to_regclass($1) is not null', ['public.' + t]);
      if (!present) continue;
      const locked = await k.one(`select exists (select 1 from pg_trigger g where g.tgrelid = $1::regclass and g.tgname like 'hr_gm_wall%' and not g.tgisinternal)`, ['public.' + t]);
      if (!locked) say(`public.${t} is shared and carries no row lock: create trigger hr_gm_wall ... execute function public.hr_gm_wall_guard('<its person columns>')`);
    }
  },
  'GM-WIPE': async (_W, say) => {
    const src = lf(await readFile(WIPE, 'utf8'));
    const listOf = (name) => { const m = src.match(new RegExp('c_' + name + ' constant text\\[\\] := array\\[([\\s\\S]*?)\\];')); return m ? [...m[1].matchAll(/'([a-z_0-9]+)'/g)].map((x) => x[1]) : []; };
    const keep = listOf('keep'), none = listOf('no_player'), wipe = listOf('wipe');
    for (const t of ['hr_gm_accounts', 'hr_gm_log', 'hr_bans', 'hr_chat_mutes']) if (!keep.includes(t)) say(`${t} must survive a character wipe`);
    if (!none.includes('hr_gm_wall_allow')) say('hr_gm_wall_allow names no player');
    for (const t of ['player_state', 'account_wallet', 'player_ledger']) if (!wipe.includes(t)) say(`${t} is not wiped, so walled heroes would not follow the wipe`);
  },
  'GM-TOOL': async (W, say) => {
    const { k } = W;
    if (checkInputs('add', U(70), 'Game Master (owner)') !== null) say('a good input was refused');
    if (!checkInputs('add', 'NOT-A-UUID', 'x')) say('a bad id passed');
    if (!checkInputs('add', U(70), 'someone@example.test')) say('an email passed as a note');
    if (!checkInputs('remove', U(70), 'x')) say('a remove verb exists');
    const fresh = U(70), ghost = U(71);
    await k.db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [fresh]);
    const sql = gmSql(fresh, 'Game Master (owner)', 'x.sql');
    await k.db.exec(sql);
    await k.db.exec(sql);
    if (!await k.one('select exists (select 1 from public.hr_gm_accounts where user_id = $1)', [fresh])) say('the migration made nobody the GM');
    if (!await k.one('select exists (select 1 from public.hr_access_allowlist where user_id = $1)', [fresh])) say('the GM is not admitted');
    if (!await k.one(`select exists (select 1 from public.hr_lb_hidden where user_id = $1 and slot is null)`, [fresh])) say('the GM is on the boards');
    await k.db.exec(gmSql(ghost, 'nobody', 'y.sql'));
    if (await k.one('select exists (select 1 from public.hr_gm_accounts where user_id = $1)', [ghost])) say('a typo made a GM');
    let refused = false;
    try { await k.db.exec(gmSql(A, 'a real account', 'z.sql')); } catch (e) { refused = /already has a hero/.test(e.message); }
    if (!refused) say('the migration walled an account with a hero');
    await k.db.query('delete from public.hr_gm_accounts where user_id = $1', [fresh]);
    await k.db.query('delete from public.hr_lb_hidden where user_id = $1', [fresh]);
    await k.db.query('delete from public.hr_access_allowlist where user_id = $1', [fresh]);
    await k.db.query('delete from auth.users where id = $1', [fresh]);
  },
};
/* GM-SEE's email probe sits on the fixture accounts; this only confirms the fixture has one, or the arm reads nothing. */
async function db_setEmailProbe(k) {
  if (!await k.one(`select count(*)::int from auth.users where email like '%secret@%'`)) throw harness('no email on the fixture accounts');
}

/* ── THE MUTANTS. Each drops the file's §9 first, so a behaviour arm has to catch it (the §9 is proved by the plain run). ─ */
const WALL = (t, args) => `create or replace trigger hr_gm_wall before insert on public.${t} for each row execute function public.hr_gm_wall_guard(${args});\n`;
const MUTANTS = [
  { id: 'auth_off', arm: 'GM-AUTH', why: 'anyone is the Game Master', edits: [['  if not exists (select 1 from public.hr_gm_accounts g where g.user_id = p_actor) then\n', '  if false then\n']] },
  { id: 'door_off', arm: 'GM-DOOR', why: 'the wall has no door', edits: [['    if exists (select 1 from public.hr_gm_accounts g where g.user_id = v_uid) then\n      v_rpc :=', '    if false then\n      v_rpc :=']] },
  { id: 'door_lists_chat', arm: 'GM-DOOR', why: 'chat is on the walled account\'s list', edits: [["  ('hr_load', 'its own hero'),", "  ('hr_chat_send', 'x'), ('hr_load', 'its own hero'),"]] },
  { id: 'row_guard_off', arm: 'GM-ROW', why: 'a real hero can be walled and then granted', edits: [["    if exists (select 1 from public.player_state ps where ps.user_id = new.user_id) then\n      raise exception", "    if false then\n      raise exception"]] },
  { id: 'wall_lifts', arm: 'GM-ROW', why: 'a granted hero can walk out', edits: [['  if exists (select 1 from auth.users u where u.id = old.user_id) and exists (select 1 from public.player_state ps where ps.user_id = old.user_id) then\n', '  if false then\n']] },
  { id: 'hero_leaks_email', arm: 'GM-SEE', why: 'the hero read carries the account\'s email', edits: [["'id', v_u, 'slot', v_s, 'name', public.hr_character_name(v_u, v_s),", "'id', v_u, 'email', (select u.email from auth.users u where u.id = v_u), 'slot', v_s, 'name', public.hr_character_name(v_u, v_s),"]] },
  { id: 'stop_skips_log', arm: 'GM-STOP-JOB', why: 'a stop leaves no journal row', edits: [["  return public.hr_gm_close(p_gm, 'stop', p_user, p_slot, v_reason, p_idem, jsonb_build_object('ok', true, 'kind', 'job', 'job', v_kind, 'job_id', v_id));", "  return jsonb_build_object('ok', true, 'kind', 'job', 'job', v_kind, 'job_id', v_id);"]] },
  { id: 'stop_needs_no_reason', arm: 'GM-STOP-JOB', why: 'a stop without a reason', edits: [["  if v_reason is null then return public.hr_gm_close(p_gm, 'stop', p_user, p_slot, null, p_idem, jsonb_build_object('ok', false, 'error', 'needs_reason')); end if;\n", '']] },
  { id: 'hunt_skips_player_path', arm: 'GM-STOP-HUNT', why: 'the player\'s verb and the GM\'s no longer share a statement', edits: [['  v_s := public.hr_hunt_leave_pending(v_uid, p_slot);\n', '  v_s := public.hr_hunt_lock(v_uid, p_slot);\n']] },
  { id: 'walled_has_network', arm: 'GM-CAP', why: 'a walled hero fills a real network', edits: [["  if public.hr_gm_walled(p_uid) then return null; end if;   -- GM-TOOLS (2027-03-05-gm-tools.sql)\n  if auth.uid() is not distinct from p_uid then", '  if auth.uid() is not distinct from p_uid then'], ["  if public.hr_gm_walled(p_uid) then return null; end if;   -- GM-TOOLS (2027-03-05-gm-tools.sql)\n  if p_uid is null or auth.uid()", '  if p_uid is null or auth.uid()']] },
  { id: 'mute_says_nothing', arm: 'GM-MUTE', why: 'hr_chat_send ignores a mute and its row lock is gone', edits: [["  if new.channel <> 'system' and public.hr_chat_muted_until(new.from_id) is not null then\n    perform public.hr_reject('muted');\n  end if;\n", ''], ["  if v_until is not null then return jsonb_build_object('ok', false, 'error', 'muted', 'until', v_until); end if;\n  if p_slot is null or p_slot < 0 or p_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;\n  if p_kind", "  if p_slot is null or p_slot < 0 or p_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;\n  if p_kind"]] },
  { id: 'whisper_mute_off', arm: 'GM-MUTE', why: 'a whisper passes a mute\'s row lock', edits: [["  if public.hr_chat_muted_until(new.from_id) is not null then perform public.hr_reject('muted'); end if;\n", '']] },
  { id: 'ban_not_read', arm: 'GM-BAN', why: 'hr_admitted does not read a ban', edits: [['     and not exists (select 1 from public.hr_bans b where b.user_id = p_user)\n', '']] },
  { id: 'ban_keeps_boards', arm: 'GM-BAN', why: 'a banned account stays ranked', edits: [["  insert into public.hr_lb_hidden (user_id, slot, reason, note)\n    select p_target, null, 'banned', 'Banned by the Game Master'\n     where not exists (select 1 from public.hr_lb_hidden h where h.user_id = p_target and h.slot is null);\n", '']] },
  { id: 'say_unstamped', arm: 'GM-SAY', why: 'the line is not marked as the Game Master\'s', edits: [["new.from_slot := null; new.from_name := 'Game Master'; new.from_role := 'game_master'; new.from_level := null; new.from_weapon := null;", '']] },
  { id: 'say_unlimited', arm: 'GM-SAY', why: 'the server-wide line has no rate', edits: [["  if not public.hr_rate_ok(v_uid, 'gm:say', 1, interval '30 seconds') then\n", "  if false and not public.hr_rate_ok(v_uid, 'gm:say', 1, interval '30 seconds') then\n"]] },
  { id: 'grant_call_clamp', arm: 'GM-GRANT', why: 'no per-call clamp on gold', edits: [['  if p_amount is null or p_amount < 1 or p_amount > c_call then\n', '  if p_amount is null or p_amount < 1 then\n']] },
  { id: 'grant_day_clamp', arm: 'GM-GRANT', why: 'no per-day clamp on gold', edits: [['  if v_used + p_amount > c_day then\n', '  if false then\n']] },
  { id: 'grant_no_reason', arm: 'GM-GRANT', why: 'a grant with no reason', edits: [["  if v_reason is null then return public.hr_gm_close(v_uid, 'grant_gold', v_uid, p_slot, null, p_idem, jsonb_build_object('ok', false, 'error', 'needs_reason')); end if;\n", '']] },
  { id: 'grant_races_a_settle', arm: 'GM-GRANT', why: 'a working hero is granted', edits: [["  if public.hr_playing(p_user, p_slot) then return 'hero_busy'; end if;\n", '']] },
  { id: 'log_rewritable', arm: 'GM-LOG', why: 'the journal takes a rewrite', edits: [['create or replace trigger hr_gm_log_immutable before update or delete on public.hr_gm_log for each row execute function public.hr_gm_log_immutable();\n', '']] },
  { id: 'name_free', arm: 'GM-NAME', why: 'anyone\'s plate can read GM', edits: [["  if regexp_replace(v_canon, '\\s+', '', 'g') ~ 'gamemaster' or v_canon ~ '(^| )g ?m( |$)' then\n", '  if false then\n']] },
  { id: 'badge_off', arm: 'GM-BADGE', why: 'a walled hero looks like anyone', edits: [["  if new.look is not null and public.hr_gm_walled(new.user_id) then new.look := new.look || jsonb_build_object('gm', true); end if;\n", '']] },
  { id: 'market_list_row', arm: 'GM-W-MARKET', why: 'a walled hero lists', edits: [[WALL('market_listings', "'user_id'"), '']] },
  { id: 'market_sale_row', arm: 'GM-W-MARKET', why: 'a walled hero buys and receives', edits: [[WALL('market_sales', "'seller_user_id', 'buyer_user_id'"), '']] },
  { id: 'chat_row', arm: 'GM-W-CHAT', why: 'a walled line reaches a channel', edits: [["    if new.channel <> 'system' then perform public.hr_reject('gm_walled'); end if;\n", '']] },
  { id: 'whisper_row', arm: 'GM-W-WHISPER', why: 'a whisper crosses', edits: [["  if public.hr_gm_walled(new.from_id) or public.hr_gm_walled(new.to_id) then perform public.hr_reject('gm_walled'); end if;\n", '']] },
  { id: 'friend_row', arm: 'GM-W-FRIEND', why: 'a friend ask crosses', edits: [[WALL('friend_requests', "'from_id', 'to_id'"), '']] },
  { id: 'friend_link_row', arm: 'GM-W-FRIEND', why: 'a friend link crosses', edits: [[WALL('friend_links', "'user_lo', 'user_hi'"), '']] },
  { id: 'party_seat', arm: 'GM-W-PARTY', why: 'a seat crosses', edits: [['create or replace trigger hr_gm_wall before insert on public.hunt_party_members for each row execute function public.hr_gm_party_guard();\n', '']] },
  { id: 'party_invite', arm: 'GM-W-PARTY', why: 'an invite crosses', edits: [['create or replace trigger hr_gm_wall before insert on public.hunt_party_invites for each row execute function public.hr_gm_party_guard();\n', '']] },
  { id: 'party_listed', arm: 'GM-W-PARTY', why: 'a walled party is listed', edits: [["create or replace trigger hr_gm_wall_relist before update of listed on public.hunt_parties for each row when (new.listed) execute function public.hr_gm_wall_guard('leader_user');\n", '']] },
  { id: 'party_seeker', arm: 'GM-W-PARTY', why: 'a walled hero seeks', edits: [[WALL('party_seekers', "'user_id'"), '']] },
  { id: 'hearth_row', arm: 'GM-W-HEARTH', why: 'a walled hero colours the Hearth for everyone', edits: [[WALL('hearth_flames', "'user_id'"), '']] },
  { id: 'hearthfind_rolls', arm: 'GM-W-FINDS', why: 'a walled hero bumps the Nth-ever counter', edits: [["    'gm', public.hr_gm_section(p_user, v_st.slot),\n", '']] },
  { id: 'find_in_feed', arm: 'GM-W-FINDS', why: 'a walled find is in the feed', edits: [['create or replace trigger hr_gm_wall before insert on public.world_finds for each row execute function public.hr_gm_wall_quiet();\n', '']] },
  { id: 'server_line_fails', arm: 'GM-W-FINDS', why: 'a server line about a walled hero is posted', edits: [["    if coalesce(current_setting('hr.gm_say', true), '') <> '1' then return null; end if;\n", '']] },
  { id: 'board_ranks', arm: 'GM-W-BOARDS', why: 'the boards rank the Game Master', edits: [["  insert into public.hr_lb_hidden (user_id, slot, reason, note)\n    select new.user_id, null, 'test', 'Game Master account'\n     where not exists (select 1 from public.hr_lb_hidden h where h.user_id = new.user_id and h.slot is null);\n", '']] },
  { id: 'clan_row', arm: 'GM-W-OTHER', why: 'a walled hero joins a clan', edits: [[WALL('clan_members', "'user_id'"), '']] },
  { id: 'gift_row', arm: 'GM-W-OTHER', why: 'a walled hero claims a gift', edits: [[WALL('hr_discord_gift_claims', "'user_id'"), '']] },
  { id: 'future_table_unlocked', arm: 'GM-W-FUTURE', why: 'a shared table landed with no row lock', edits: [], plant: 'create table public.town_works_gifts (user_id uuid)' },
];

const dropSelfCheck = (sql) => {
  const i = sql.indexOf('-- ── §9 SELF-CHECK');
  if (i < 0) throw harness('no §9 in the migration');
  return sql.slice(0, i);
};
const plant = (sql, edits) => {
  let out = sql;
  for (const [find, to] of edits) {
    const n = out.split(find).length - 1;
    if (n !== 1) throw harness(`mutant anchor matched ${n} times: ${find.slice(0, 80)}`);
    out = out.replace(find, () => to);
  }
  return out;
};
const withDb = (W, db) => { W.k.db = db; return W; };

async function runArms(W, ids) {
  const red = new Map();
  for (const id of ids) {
    const bad = [];
    try { await ARMS[id](W, (m) => bad.push(m)); }
    catch (e) { if (e.harness) throw e; bad.push('threw: ' + String(e.message).split('\n')[0]); }
    if (bad.length) red.set(id, bad);
  }
  return red;
}

async function main() {
  const src = lf(await readFile(MIG, 'utf8'));
  if (!MUTATE) {
    const { db } = await bootReplay({ upTo: PREV });
    try {
      await db.exec(src);
      await db.exec(src);   // the second apply: every statement idempotent, §9 again
      const W = withDb(await world(db), db);
      const red = await runArms(W, Object.keys(ARMS));
      let n = 0;
      for (const id of Object.keys(ARMS)) {
        if (red.has(id)) { n++; for (const m of red.get(id)) console.log(`  ✗ ${id} — ${m}`); }
        else console.log(`  ✓ ${id}`);
      }
      console.log(n ? `\ngm-tools: RED (${n} arms)` : `\ngm-tools: green (${Object.keys(ARMS).length} arms)`);
      process.exitCode = n ? 1 : 0;
    } finally { await db.close().catch(() => {}); }
    return;
  }
  console.log('\ngm-tools --mutate\n');
  let survived = 0;
  const base = dropSelfCheck(src);
  for (const mu of MUTANTS) {
    const { db } = await bootReplay({ upTo: PREV });
    let red;
    try {
      await db.exec(CONTROL ? base : plant(base, mu.edits));
      if (mu.plant && !CONTROL) await db.exec(mu.plant);
      const W = withDb(await world(db), db);
      red = await runArms(W, [mu.arm]);
    } catch (e) {
      if (e.harness) { console.error(`gm-tools: HARNESS — ${mu.id}: ${String(e.message).split('\n')[0]}`); process.exit(2); }
      red = new Map([[mu.arm, [String(e.message).split('\n')[0]]]]);
      if (!e.code) { console.error(`gm-tools: HARNESS — ${mu.id}: ${e.stack}`); process.exit(2); }
    } finally { await db.close().catch(() => {}); }
    const caught = red.has(mu.arm);
    console.log(caught ? `  ✓ ${mu.id} — caught by ${mu.arm} (${mu.why})` : `  ✗ ${mu.id} — SURVIVED (${mu.why})`);
    if (!caught) survived++;
  }
  console.log(survived ? `\ngm-tools --mutate: ${survived} survived` : `\ngm-tools --mutate: ${MUTANTS.length}/${MUTANTS.length} caught`);
  process.exitCode = survived ? 1 : 0;
}

await main();
