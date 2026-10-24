#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/play-cap.mjs — AT MOST FOUR HEROES PLAY AT ONCE, PER ACCOUNT AND PER
// NETWORK, AND THE SERVER COUNTS IT (Tyler 2026-10-17: "Up to 4 characters can
// play AT ONCE, free. A 4-per-hashed-IP concurrent cap is mandatory").
//
//   node tests/play-cap.mjs            the guard (every arm)
//   node tests/play-cap.mjs --mutate   every planted defect must turn an arm red
//
// mutant-anchors: supabase/migrations/2027-01-19-play-cap.sql
// mutant-writes-tree: no — each mutant is planted on the chain end inside a rolled-back transaction
//
// Ships with supabase/migrations/2027-01-19-play-cap.sql. On the real chain (PGlite), as a player and as the engine
// call each door (`authenticated` with the request's cf-connecting-ip header; `hr_engine` with neither JWT nor header):
//   PC-CLOSED  THE BROWSER CLOSED (no client at all): two heroes hunt (hr_hunt_enter) and two gather through the REAL
//              edge verb (supabase/functions/hr-accrue/set-activity.js runSetActivity); the account's fifth is refused
//              too_many_playing by the hunt door and by the town door (409), and nothing of it moved
//   PC-VIEWED  THE HUNT VIEWED: a real CharacterSession for the fifth hero, viewed, presses Enter: refused, its hunt
//              section stays empty and the screen's words say why (src/shell/intent-words.js); one hunter leaves, the
//              same press goes in and the section shows the hunt
//   PC-AGAIN   NEVER COUNTED TWICE (the cap lowered to 3 so a recount would refuse): a gathering hero goes hunting
//              (the activity yields), a hunt changes ground (hr_hunt_swap), the settle ends a hunt and resumes the last
//              activity in one transaction; a hero that never stopped is still refused
//   PC-NET     THE NETWORK: four heroes of two accounts behind one address; the fifth, a third account's, is refused
//              too_many_playing_here, by the hunt door and (its stored network) by the engine's town door; another
//              address plays; an IPv6 /64 is one network; the stored value is a 32-byte salted hash
//   PC-PARTY   THE PARTY VIEW SAYS WHAT START DOES: four own heroes seated, a fifth gathering: the view's `ready` of the
//              fourth seat is too_many_playing (the seats before it walk in first), Start refuses that seat by name and
//              enters nobody; the gatherer stops and Start enters all four
//   PC-WORDS   the refusal words name SESSION_CONFIG.maxConcurrentCharacters (four, a fifth)
// Exit: 0 green · 1 a red arm or a missed mutant · 2 a harness problem.
//
// ── WHAT IT CANNOT PROVE ────────────────────────────────────────────────
// TRUE CONCURRENCY: PGlite is one backend. Two racing starts are serialised by the play locks every start takes
// before it counts; the migration's §7 proves a start HOLDS them (pg_locks) and that the second of two starts for one
// slot is refused; the lock order is read from the installed bodies (PC-CLOSED's last check).
// ════════════════════════════════════════════════════════════════════════
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { bootReplay, ROOT } from './schema-replay.mjs';

const MUTATE = process.argv.includes('--mutate');
const mod = (f) => import(pathToFileURL(join(ROOT, f)).href);
const { CharacterSession } = await mod('src/session/character-session.js');
const { refusalText } = await mod('src/shell/intent-words.js');
const { REFUSAL_WORDS } = await mod('src/data/refusal-words.js');
const { SESSION_CONFIG } = await mod('src/session/config.js');
const SA = await mod('supabase/functions/hr-accrue/set-activity.js');

const idem = () => crypto.randomUUID();
const U = (n) => `000000c0-0000-4000-8000-0000000ca${String(n).padStart(3, '0')}`;
const IP_X = '198.51.100.23';
const IP_Y = '203.0.113.77';

/* As PostgREST calls it: the JWT subject and the request headers set, `set role authenticated`. */
async function as(db, uid, ip, sql, params) {
  await db.query("select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true), set_config('request.headers', $3, true)",
    [uid, JSON.stringify({ sub: uid, role: 'authenticated' }), ip ? JSON.stringify({ 'cf-connecting-ip': ip }) : '']);
  await db.query('savepoint as_call');
  await db.exec('set role authenticated');
  try { const r = (await db.query(sql, params)).rows[0]; await db.query('release savepoint as_call'); return r ? Object.values(r)[0] : undefined; }
  catch (e) { await db.query('rollback to savepoint as_call'); throw e; }
  finally { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true), set_config('request.headers', '', true)"); }
}
const one = async (db, sql, params) => { const r = (await db.query(sql, params)).rows[0]; return r ? Object.values(r)[0] : undefined; };
/* As hr-accrue runs a statement: `set role hr_engine`, no JWT, no request headers. */
const engineExec = (db) => async (text, params) => {
  await db.exec('set role hr_engine');
  try { return (await db.query(text, params)).rows; } finally { await db.exec('reset role'); }
};
const enter = (db, uid, slot, hunt, ip = IP_X) => as(db, uid, ip, 'select public.hr_hunt_enter($1, $2, $3::jsonb, 0, null, $4::uuid)', [slot, hunt, '[]', idem()]);
const gather = (db, uid, slot, node) => SA.runSetActivity({ exec: engineExec(db), user: uid, slot, intentId: idem(), activity: { kind: 'gather', id: node } });
const playing = (db, uid, slot) => one(db, 'select public.hr_playing($1, $2)', [uid, slot]);
const err = (r) => (r && r.ok === true ? 'ok' : r && r.error);

/* Accounts with N named heroes each, admitted, slots 2-4 owned as bought ones are; hunts on; the lowest ground. */
async function world(db, accounts) {
  await db.query('update public.hr_hunt_config set enabled = true where id');
  const hunt = await one(db, `select g.hunt_id from public.hr_hunt_grounds g left join public.hr_hunts h on h.hunt_id = g.hunt_id
                              order by coalesce(h.band_min, 0), g.hunt_id limit 1`);
  const other = await one(db, 'select hunt_id from public.hr_hunt_grounds where hunt_id <> $1 order by hunt_id limit 1', [hunt]);
  const node = await one(db, "select activity_id from public.hr_activities where kind = 'gather' and coalesce(req_lv, 1) <= 1 order by activity_id limit 1");
  if (!hunt || !other || !node) throw Object.assign(new Error('HARNESS: no ground, no second ground or no level-1 node'), { harness: true });
  for (const [i, [uid, n]] of accounts.entries()) {
    await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [uid]);
    await db.query("insert into public.hr_access_allowlist (user_id, note) values ($1, 'play-cap') on conflict (user_id) do nothing", [uid]);
    for (let slot = 0; slot < n; slot++) {
      const c = await as(db, uid, null, 'select public.hr_create_character($1)', [slot]);
      if (!c || c.ok !== true) throw Object.assign(new Error('HARNESS: hr_create_character refused: ' + JSON.stringify(c)), { harness: true });
      if (slot === 0) await db.query(`insert into public.player_progress (user_id, slot, kind, key, period_key, value)
                                      select $1, 0, 'flag', 'character_slot:' || s, '', 1 from generate_series(2, 4) s`, [uid]);
      const nm = await as(db, uid, null, 'select public.hr_character_name_set($1, $2, $3::uuid)', [slot, 'Capa ' + 'ABCDEFGH'[i] + 'abcde'[slot] + 'lt', idem()]);
      if (!nm || nm.ok !== true) throw Object.assign(new Error('HARNESS: naming refused: ' + JSON.stringify(nm)), { harness: true });
    }
    await db.query('insert into public.social_presence (user_id, slot, seen_at) values ($1, 0, now()) on conflict (user_id) do update set seen_at = now()', [uid]);
  }
  await db.query('delete from public.hr_rate_counters');
  return { hunt, other, node };
}

const ARMS = {
  'PC-CLOSED': async (db) => {
    const p = []; const A = U(1);
    const { hunt, node } = await world(db, [[A, 5]]);
    for (const s of [0, 1]) if (err(await enter(db, A, s, hunt)) !== 'ok') p.push(`hero ${s} could not go hunting`);
    for (const s of [2, 3]) { const r = await gather(db, A, s, node); if (r.status !== 200) p.push(`hero ${s} could not gather: ${JSON.stringify(r.body).slice(0, 160)}`); }
    const r5 = await enter(db, A, 4, hunt);
    if (err(r5) !== 'too_many_playing' || r5.max !== SESSION_CONFIG.maxConcurrentCharacters || r5.playing !== 4) p.push('the fifth hunt start was not refused too_many_playing {max 4, playing 4}: ' + JSON.stringify(r5).slice(0, 160));
    const g5 = await gather(db, A, 4, node);
    if (g5.status !== 409 || g5.body.error !== 'too_many_playing') p.push('the engine town door let a fifth hero gather: ' + JSON.stringify(g5.body).slice(0, 160));
    if (await playing(db, A, 4)) p.push('the refused fifth hero is playing');
    if (await one(db, 'select count(*)::int from public.hunt_sessions where user_id = $1 and slot = 4', [A])) p.push('the refused fifth start opened a hunt session');
    /* THE LOCK ORDER, read from the installed bodies: the play locks come after the character's and before the count. */
    const ef = String(await one(db, "select prosrc from pg_proc where oid = 'public.hr_hunt_enter_for(uuid,integer,text,jsonb,integer,integer)'::regprocedure"));
    const at = (s) => ef.indexOf(s);
    if (!(at('public.hr_hunt_lock(v_uid, p_slot)') > 0 && at('public.hr_hunt_lock(v_uid, p_slot)') < at('public.hr_play_lock_for(v_uid)')
          && at('public.hr_play_lock_for(v_uid)') < at('public.hr_hunt_enter_check(v_uid') && at('public.hr_hunt_enter_check(v_uid') < at('public.hr_play_refusal(v_uid'))) {
      p.push('hr_hunt_enter_for no longer takes the play locks after the character lock and before the count');
    }
    const ps = String(await one(db, "select prosrc from pg_proc where oid = 'public.hr_hunt_party_start(integer,text,uuid)'::regprocedure"));
    if (!(ps.indexOf('public.hr_play_lock_seats(v_pid)') > 0 && ps.indexOf('public.hr_play_lock_seats(v_pid)') < ps.indexOf('-- EVERY MEMBER OR NONE'))) {
      p.push('hr_hunt_party_start no longer pre-locks the seats before it enters the first');
    }
    return p;
  },

  'PC-VIEWED': async (db) => {
    const p = []; const A = U(2);
    const { hunt } = await world(db, [[A, 5]]);
    for (const s of [0, 1, 2, 3]) if (err(await enter(db, A, s, hunt)) !== 'ok') p.push(`hero ${s} could not go hunting`);
    const server = {
      rpc: async (name, args) => {
        const keys = Object.keys(args);
        const body = await as(db, A, IP_X, `select public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`,
          keys.map((k) => (args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k])));
        return { ok: true, status: 200, body, closed: false };
      },
      accrue: async () => ({ ok: false, status: 0, error: 'network' }),
    };
    const cs = new CharacterSession({ slot: 4, uid: A, server, viewed: true, setTimer: () => 0, clearTimer: () => {}, now: () => Date.now() });
    try {
      await cs.load();
      if (cs.status !== 'ready') { p.push('HARNESS: the viewed hero did not load: ' + cs.status); return p; }
      const r = await cs.enterHunt(hunt, [], 0);
      if (r.ok !== false || r.error !== 'too_many_playing') p.push('the viewed fifth hero went in: ' + JSON.stringify(r).slice(0, 160));
      const h = cs.read('hunt');
      if (h && typeof h === 'object' && typeof h.session_id === 'string' && h.ended !== true) p.push('the viewed hero shows a hunt the server refused');
      if (refusalText(r) !== REFUSAL_WORDS.too_many_playing) p.push(`the screen says "${refusalText(r)}", not the play-cap words`);
      /* one hunter leaves (its hunt ends, the bag home): the same press goes in, and the section shows it */
      const sid = await one(db, 'select id from public.hunt_sessions where user_id = $1 and slot = 0 and ended_at is null', [A]);
      await db.query("select public.hr_hunt_close($1, 'left', now(), true)", [sid]);
      const r2 = await cs.enterHunt(hunt, [], 0);
      if (r2.ok !== true) p.push('with a slot free the viewed hero was refused: ' + JSON.stringify(r2).slice(0, 160));
      const h2 = cs.read('hunt');
      if (!(h2 && typeof h2.session_id === 'string' && h2.ended !== true)) p.push('the viewed hero entered but its hunt section is empty');
    } finally { cs.close?.(); }
    return p;
  },

  'PC-AGAIN': async (db) => {
    const p = []; const A = U(3);
    const { hunt, other, node } = await world(db, [[A, 5]]);
    for (const s of [0, 1, 2]) if (err(await enter(db, A, s, hunt)) !== 'ok') p.push(`hero ${s} could not go hunting`);
    if ((await gather(db, A, 3, node)).status !== 200) p.push('hero 3 could not gather');
    await db.query("update public.hr_hunt_limits set value = 3 where key = 'max_concurrent'");
    /* a gathering hero goes hunting: the town activity yields; not a new player */
    const y = await enter(db, A, 3, hunt);
    if (err(y) !== 'ok') p.push('a gathering hero going hunting was counted as a start: ' + JSON.stringify(y).slice(0, 160));
    /* a hunt changes ground: the old session closes, the new one opens, one hero throughout */
    const sid = await one(db, 'select id from public.hunt_sessions where user_id = $1 and slot = 1 and ended_at is null', [A]);
    await db.query('update public.hunt_sessions set change_to = $2, change_at = now() where id = $1', [sid, other]);
    try { if (!(await one(db, 'select public.hr_hunt_swap($1, now())', [sid]))) p.push('the ground change did not swap'); }
    catch (e) { p.push('the ground change was refused: ' + String(e.message).slice(0, 120)); }
    /* the settle ends a hunt and resumes the last activity, in ONE transaction (savepoint = that transaction's work) */
    const s0 = await one(db, 'select id from public.hunt_sessions where user_id = $1 and slot = 0 and ended_at is null', [A]);
    try {
      await db.query("select public.hr_hunt_close($1, 'stamina', now(), true)", [s0]);
      await db.query("update public.player_state set active_kind = 'gather', active_id = $2 where user_id = $1 and slot = 0", [A, node]);
    } catch (e) { p.push('the settle\'s resume was refused as a start: ' + String(e.message).slice(0, 120)); }
    /* a hero that never played this transaction is a start, and refused */
    let refused = false;
    try { await db.query('savepoint s'); await db.query("update public.player_state set active_kind = 'gather', active_id = $2 where user_id = $1 and slot = 4", [A, node]); await db.query('release savepoint s'); }
    catch (e) { await db.query('rollback to savepoint s'); refused = /too_many_playing/.test(String(e.message)); }
    if (!refused) p.push('a hero that never played started beside the cap');
    return p;
  },

  'PC-NET': async (db) => {
    const p = []; const [A, B, C, D] = [U(4), U(5), U(6), U(7)];
    const { hunt, node } = await world(db, [[A, 3], [B, 2], [C, 2], [D, 1]]);
    for (const s of [0, 1, 2]) if (err(await enter(db, A, s, hunt)) !== 'ok') p.push(`A hero ${s} could not go hunting`);
    if (err(await enter(db, B, 0, hunt)) !== 'ok') p.push('B\'s first hero (the fourth on the network) could not go hunting');
    const r = await enter(db, C, 0, hunt);
    if (err(r) !== 'too_many_playing_here' || r.max !== 4 || 'playing' in r) p.push('a fifth hero on one network was not refused too_many_playing_here {max}: ' + JSON.stringify(r).slice(0, 160));
    /* the engine has no address: it uses the account's stored network (C's hr_load from X stored it) */
    await as(db, C, IP_X, 'select public.hr_load(1)', []);
    const g = await gather(db, C, 1, node);
    if (g.status !== 409 || g.body.error !== 'too_many_playing_here') p.push('the engine town door ignored the stored network: ' + JSON.stringify(g.body).slice(0, 160));
    if (err(await enter(db, D, 0, hunt, IP_Y)) !== 'ok') p.push('a hero behind another address was refused');
    if (err(await enter(db, C, 0, hunt, IP_Y)) !== 'ok') p.push('C, now behind another address, was refused');
    const row = await one(db, "select jsonb_build_object('n', count(*), 'len', min(octet_length(net)), 'raw', bool_or(position(convert_to('198.51', 'utf8') in net) > 0)) from public.hero_play_net");
    if (!row || row.len !== 32 || row.raw) p.push('a stored network is not a 32-byte hash: ' + JSON.stringify(row));
    const v6 = await one(db, "select public.hr_play_net_hash('2001:db8:7:8::1') = public.hr_play_net_hash('2001:db8:7:8:abcd::9') and public.hr_play_net_hash('2001:db8:7:8::1') <> public.hr_play_net_hash('2001:db8:7:9::1')");
    if (v6 !== true) p.push('an IPv6 /64 is not one network');
    for (const t of ['account_play_net', 'hero_play_net']) {
      let leaked = true;
      try { await as(db, A, IP_X, `select count(*) from public.${t}`, []); } catch { leaked = false; }
      if (leaked) p.push(`a player can read ${t}`);
    }
    return p;
  },

  'PC-PARTY': async (db) => {
    const p = []; const A = U(8);
    const { hunt, node } = await world(db, [[A, 5]]);
    for (const s of [1, 2, 3]) {
      const r = await as(db, A, IP_X, 'select public.hr_hunt_party_invite_own(0, $1, $2::uuid)', [s, idem()]);
      if (err(r) !== 'ok') p.push(`seating hero ${s} was refused: ` + JSON.stringify(r).slice(0, 120));
    }
    if ((await gather(db, A, 4, node)).status !== 200) p.push('the fifth hero could not gather');
    /* the leader's own envelope (hr_load, as the client reads it): the party section's seats and their readiness */
    const env = await as(db, A, IP_X, 'select public.hr_load(0)', []);
    const view = env && env.party;
    const members = (view && view.members) || [];
    const seat3 = members.find((m) => m.seat === 3);
    if (!seat3 || seat3.ready !== false || seat3.ready_why !== 'too_many_playing') p.push('the party view does not say the fourth seat would be one too many: ' + JSON.stringify(seat3 || members).slice(0, 200));
    for (const m of members.filter((x) => x.seat < 3)) if (m.ready !== true) p.push(`seat ${m.seat} reads not ready (${m.ready_why})`);
    const st = await as(db, A, IP_X, 'select public.hr_hunt_party_start(0, $1, $2::uuid)', [hunt, idem()]);
    const seats = (st && st.seats) || [];
    if (err(st) !== 'not_ready' || seats.length !== 1 || seats[0].seat !== 3 || seats[0].error !== 'too_many_playing') p.push('Start did not refuse exactly the fourth seat: ' + JSON.stringify(st).slice(0, 200));
    if (!/would be a fifth hero playing on that account/.test(refusalText(st))) p.push(`Start's words are "${refusalText(st)}"`);
    if (await one(db, 'select count(*)::int from public.hunt_sessions where user_id = $1 and ended_at is null', [A])) p.push('a refused Start let somebody in');
    const stop = await SA.runSetActivity({ exec: engineExec(db), user: A, slot: 4, intentId: idem(), activity: { kind: 'idle' } });
    if (stop.status !== 200) p.push('the gatherer could not stop');
    const st2 = await as(db, A, IP_X, 'select public.hr_hunt_party_start(0, $1, $2::uuid)', [hunt, idem()]);
    if (err(st2) !== 'ok' || st2.entered !== 4) p.push('with the gatherer stopped Start did not enter all four: ' + JSON.stringify(st2).slice(0, 200));
    return p;
  },

  'PC-WORDS': async () => {
    const n = SESSION_CONFIG.maxConcurrentCharacters;
    const NUM = ['None', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'];
    const ORD = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth'];
    const p = [];
    for (const k of ['too_many_playing', 'too_many_playing_here']) {
      if (!String(REFUSAL_WORDS[k] || '').startsWith(NUM[n] + ' ')) p.push(`${k} does not say ${NUM[n]} (SESSION_CONFIG.maxConcurrentCharacters): "${REFUSAL_WORDS[k]}"`);
    }
    const seat = refusalText({ error: 'not_ready', seats: [{ name: 'Mira', error: 'too_many_playing' }, { name: 'Oren', error: 'too_many_playing_here' }] });
    if (!seat.includes('Mira would be a ' + ORD[n + 1] + ' hero') || !seat.includes('Oren would be a ' + ORD[n + 1] + ' hero')) p.push('the seat words do not name the ' + ORD[n + 1] + ' hero: ' + seat);
    return p;
  },
};

/* Each arm in its own transaction, rolled back; inside a mutant's transaction, a savepoint. */
async function runArms(db, nested) {
  const out = [];
  for (const [name, fn] of Object.entries(ARMS)) {
    await db.query(nested ? 'savepoint arm' : 'begin');
    let problems;
    try { problems = await fn(db); } catch (e) { problems = [(e.harness ? 'HARNESS: ' : 'THREW: ') + String(e.message).slice(0, 300)]; }
    finally { await db.query(nested ? 'rollback to savepoint arm' : 'rollback'); }
    out.push({ name, problems });
  }
  return out;
}

const fnText = async (db, sig) => String(await one(db, `select pg_get_functiondef('public.${sig}'::regprocedure)`));
async function plant(db, sig, from, to) {
  const t = await fnText(db, sig);
  if (t.split(from).length !== 2) throw new Error(`mutant anchor not found once in ${sig}: ${from.slice(0, 60)}`);
  await db.exec(t.replace(from, to));
}
const MUTANTS = [
  { arm: 'PC-CLOSED', why: 'the cap admits everyone', go: (db) => plant(db, 'hr_play_refusal(uuid,integer,bytea,uuid)', '  -- THE ACCOUNT.\n', '  return null;\n  -- THE ACCOUNT.\n') },
  { arm: 'PC-CLOSED', why: 'no guard trigger: the engine town door is uncapped', go: (db) => db.exec('drop trigger hr_play_cap_guard_upd on public.player_state') },
  { arm: 'PC-VIEWED', why: 'the hunt door counts after it writes (no clean refusal)', go: (db) => plant(db, 'hr_hunt_enter_for(uuid,integer,text,jsonb,integer,integer)', '  if not public.hr_playing(v_uid, p_slot) then\n    v_r := public.hr_play_refusal', '  if false then\n    v_r := public.hr_play_refusal') },
  { arm: 'PC-AGAIN', why: 'a yield counts as a start', go: (db) => plant(db, 'hr_hunt_enter_for(uuid,integer,text,jsonb,integer,integer)', '  if not public.hr_playing(v_uid, p_slot) then\n    v_r := public.hr_play_refusal', '  if true then\n    v_r := public.hr_play_refusal') },
  { arm: 'PC-AGAIN', why: 'the settle\'s resume counts as a start', go: (db) => plant(db, 'hr_play_cap_guard()', "    if position(' ' || v_key || ' ' in coalesce(current_setting('hr.play_stopped', true), '') || ' ') > 0 then return null; end if;\n", '') },
  { arm: 'PC-AGAIN', why: 'the account counts the hero itself', go: (db) => plant(db, 'hr_play_refusal(uuid,integer,bytea,uuid)', 'where ps.user_id = p_uid and ps.slot <> p_slot', 'where ps.user_id = p_uid') },
  { arm: 'PC-NET', why: 'the network is not counted', go: (db) => plant(db, 'hr_play_refusal(uuid,integer,bytea,uuid)', '  if p_net is not null then\n    select count(*)', '  if false then\n    select count(*)') },
  { arm: 'PC-NET', why: 'the engine reads no stored network', go: (db) => plant(db, 'hr_play_net_of(uuid)', '  return (select n.net from public.account_play_net n where n.user_id = p_uid);', '  return null;') },
  { arm: 'PC-NET', why: 'IPv6 by the full address', go: (db) => plant(db, 'hr_play_net_hash(text)', "else host(network(set_masklen(v, 64))) || '/64' end;", "else host(v) || '/128' end;") },
  { arm: 'PC-NET', why: 'a player can read the stamps', go: (db) => db.exec('grant select on public.hero_play_net to authenticated; create policy pc_m on public.hero_play_net for select to authenticated using (true)') },
  { arm: 'PC-PARTY', why: 'the seat readiness ignores the seats Start enters first', go: (db) => plant(db, 'hr_party_seat_ready(uuid,uuid,integer,text,uuid,timestamp with time zone)', 'public.hr_play_net_of(p_user), p_party);', 'public.hr_play_net_of(p_user));') },
];

async function main() {
  let db;
  try { ({ db } = await bootReplay()); } catch (e) { console.error('✗ the chain would not replay: ' + String(e.message).slice(0, 400)); process.exit(2); }
  if (!MUTATE) {
    const out = await runArms(db, false);
    let red = 0;
    for (const { name, problems } of out) {
      if (problems.some((x) => x.startsWith('HARNESS'))) { console.error(`✗ ${name}: ${problems.join(' | ')}`); process.exit(2); }
      console.log(`${problems.length ? '✗' : '✓'} ${name}${problems.length ? ': ' + problems.join(' | ') : ''}`);
      red += problems.length ? 1 : 0;
    }
    console.log(red ? `play-cap: ${red} arm(s) red` : `play-cap: ${out.length} arms green`);
    process.exit(red ? 1 : 0);
  }
  /* tests/mutant-control.mjs's protocol: under HR_MUTANT_CONTROL=1 nothing is planted, and every arm must survive. */
  const CONTROL = !!process.env.HR_MUTANT_CONTROL;
  console.log(`[mutants] ${MUTANTS.length}`);
  let escaped = 0;
  for (const [i, m] of MUTANTS.entries()) {
    await db.query('begin');
    let caught = false; let note = '';
    try {
      if (!CONTROL) await m.go(db);
      const out = await runArms(db, true);
      const mine = out.find((o) => o.name === m.arm);
      caught = !!(mine && mine.problems.length && !mine.problems.some((x) => x.startsWith('HARNESS')));
      note = mine ? mine.problems.join(' | ').slice(0, 140) : 'no such arm';
    } catch (e) { note = 'PLANT FAILED: ' + String(e.message).slice(0, 140); }
    finally { await db.query('rollback'); }
    console.log(`[mutant] PC${i + 1} ${caught ? 'caught' : 'survived'}`);
    console.log(`${caught ? '✓ caught' : '✗ ESCAPED'}  ${m.arm}  ${m.why}${caught ? '' : '  (' + note + ')'}`);
    if (!caught) escaped++;
  }
  console.log(escaped ? `play-cap --mutate: ${escaped} mutant(s) escaped` : `play-cap --mutate: all ${MUTANTS.length} mutants caught`);
  process.exit(escaped ? 1 : 0);
}
await main();
