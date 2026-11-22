#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/boss-hall-db.mjs — A KEYED HALL ON THE REPLAYED CHAIN WITH THE SHIPPED EDGE (supabase/migrations/2027-04-20-boss-hall.sql; the engine's
//   half is tests/boss-hall.mjs). The data holds no hall yet, so each arm installs the fixture hall (tests/boss-hall-fixture.mjs) in the
//   catalogue from the generator's own rows (tools/gen-hunt-sessions.mjs catalogueRows) and hands the edge its ground (the settle's test seam).
//
//   node tests/boss-hall-db.mjs            the guard
//   node tests/boss-hall-db.mjs --mutate   every planted defect must turn it red
//
// mutant-anchors: supabase/migrations/2027-04-20-boss-hall.sql supabase/migrations/2027-04-24-hall-key-any-seat.sql supabase/migrations/2027-04-25-boss-daily.sql
//
//   (lane/c-krell-daily, 2027-04-24-hall-key-any-seat.sql and 2027-04-25-boss-daily.sql)
//   HD-SEAT    ANY SEAT'S KEY OPENS IT: with the leader holding none, the leader's press takes the MEMBER's key, exactly one, journalled in the
//              member's ledger and not the leader's, the member's version forward; a replay answers the first answer whole and spends nothing;
//              a member's LOCKED key is never taken (no_key, nothing moved); the body locks every seat before it reads whose key
//   HD-DAILY   THE DAILY PRIZE THROUGH BOTH DOORS: the first kill of the day gives every hero there its own piece, stamps its day and journals
//              it once; a second kill the same day pays Level XP and coin and NO piece, no second stamp, nothing taken off (the engine never
//              rolled); the day rolled over (the row is yesterday's), the next kill pays the piece again; the section says taken and when next
//   HD-CLAIM   THE COMMIT RE-PROVES THE CLAIM: two pieces on one claim, a claim with no kill of the boss beside it and a claim that is not
//              `true` are each refused whole, nothing written; a prize row with no claim (an engine before the file) and one whose day was
//              taken since the read are taken off the window and journalled, the rest of the window paid
//
//   HD-WORDS   every refusal by its code, each moving nothing: an unknown hall, a hero with no key, a member, a hero already in the room
//   HD-DOOR    no other door reaches the room: an enter, a party's Start: none opens a session; the door shuts behind the verb
//   HD-KEY     a hero alone with two keys: ONE spent, ONE ledger row (kind shop, intent boss_hall:<hall>, reason boss_hall), ONE seat; a
//              replay of the press spends nothing; a press under another key finds the hero in the room and keeps the last key
//   HD-LOCK    the second press of one key, run as it runs after the locks it waited on (its first key read cut out), answers the first's
//              receipt and moves nothing (2027-04-19-key-under-lock.sql)
//   HD-PARTY   a party's leader spends HIS key and both heroes walk in; the member's key stays; a start the party can't make spends nothing
//   HD-BOTH    the kill, a death and the limit, each with the browser closed (the tick) and the hunt viewed (index.ts's settle): the same
//              ends on the same instants, nobody left in the room, the party back on the hall's ground, each hero's record
//   HD-PAID    the kill PAYS like any ground's: Level XP, coin and the boss's and adds' drops in the bags, his kill counter for every hero
//   HD-OWED    a window past the limit with no end is refused end_missing, whatever the engine proposed
//   HD-AGAIN   the two files applied a second time move nothing: the schema's inventory, every body, the catalogue rows
//
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { isMain } from './_is-main.mjs';
import { bootReplay, closeReplays, inventory } from './schema-replay.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BOSS, NAMED, ADD, ROOM, FROM, KEY, PRIZE, ROWS, hallGround, hallSource } from './boss-hall-fixture.mjs';
import { sourceQuery } from '../tools/lib/version-stamp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const V = sourceQuery(ROOT);
const EM = (await import(pathToFileURL(join(ROOT, 'src/data/monsters.js')).href + V)).MONSTERS;
const PM = (await import(pathToFileURL(join(ROOT, 'src/data/monsters.js')).href)).MONSTERS;
const { pocket } = await import(pathToFileURL(join(ROOT, 'src/data/grounds/shape.js')).href);
const { BOSS_HALL_RULES } = await import(pathToFileURL(join(ROOT, 'src/data/boss-halls.js')).href);
const GEN = await import(pathToFileURL(join(ROOT, 'tools/gen-hunt-sessions.mjs')).href);
const H = (await import('./hunt-sessions-settle.mjs')).HARNESS;
const { one, q } = H;
const GROUND = hallGround(pocket);
const UIDS = Array.from({ length: 16 }, (_, i) => '00000000-0000-4000-8000-0000000bd0' + String(i + 10));
const WINDOW = 90000;
const FILES = ['2027-04-20-boss-hall-hunt-sessions-catalogue.generated.sql', '2027-04-20-boss-hall.sql'];
/* lane/c-krell-daily's two, in their apply order */
const DAILY_FILES = ['2027-04-24-hall-key-any-seat.sql', '2027-04-25-boss-daily.sql'];
const prizeOf = async (db, uid) => Number(await one(db, 'select coalesce((select qty from public.player_inventory where user_id = $1 and slot = 0 and item_id = $2), 0)', [uid, PRIZE]));
const dayRows = async (db, uid) => Number(await one(db, 'select count(*) from public.player_boss_loot_day where user_id = $1 and slot = 0 and boss = $2', [uid, BOSS]));
/* this hero's boss_daily journal rows, each as its meta ({ reason, hall, boss, day, took, items | dropped + why }), in order */
const dailyRows = async (db, uid) => (await q(db, `select meta from public.player_ledger where user_id = $1 and kind = 'hunt' and intent = 'boss_daily' order by id`, [uid])).map((r) => r.meta);
const giveKey = (db, uid, n = 1) => db.query('insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, $2, $3) on conflict (user_id, slot, item_id) do update set qty = excluded.qty', [uid, KEY, n]);
/* the bag's lock on this hero's keys (a rule row must say something, player_item_rules_says_ck: unlocking a row that says nothing else removes it) */
const lockKey = (db, uid, on) => (on
  ? db.query('insert into public.player_item_rules (user_id, slot, item_id, locked) values ($1, 0, $2, true) on conflict (user_id, slot, item_id) do update set locked = true', [uid, KEY])
  : db.query('delete from public.player_item_rules where user_id = $1 and slot = 0 and item_id = $2', [uid, KEY]));
const GEAR = Object.freeze({ helmet: 'steel_helm', body: 'steel_platebody', pants: 'steel_platelegs', boots: 'steel_boots', weapon: 'steel_sword', shield: 'coppercap_shield' });
const STAFF = Object.freeze({ helmet: 'scholar_helmet', body: 'scholar_body', pants: 'scholar_pants', boots: 'scholar_boots', weapon: 'willow_staff' });
const idem = () => crypto.randomUUID();
const asUser = (db, uid) => db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
const keysOf = async (db, uid) => Number(await one(db, 'select coalesce((select qty from public.player_inventory where user_id = $1 and slot = 0 and item_id = $2), 0)', [uid, KEY]));
const hallRows = async (db, uid) => Number(await one(db, `select count(*) from public.player_ledger where user_id = $1 and intent like 'boss\\_hall:%'`, [uid]));
const openIn = async (db, inst) => Number(await one(db, 'select count(*) from public.hunt_sessions where instance_id = $1 and ended_at is null', [inst]));
const grounds = (M) => ({ [ROOM]: { ground: GROUND, grid: M.HG.gridOfMap(GROUND.map) } });

async function as(db, uid, sql, params) {
  await db.query('begin');
  await asUser(db, uid);
  await db.query('delete from public.hr_rate_counters where user_id = $1', [uid]);
  try { const v = await one(db, sql, params); await db.query('commit'); return v; } catch (e) { await db.query('rollback'); throw e; }
}
const enter = (db, uid, key, hall = FROM) => as(db, uid, 'select public.hr_boss_hall_enter(0, $1, $2::uuid)', [hall, key || idem()]);

/* The fixture rows in every MONSTERS the edge reads, and out again. */
function withRows(fn) {
  for (const m of [EM, PM]) for (const [id, r] of Object.entries(ROWS)) m[id] = JSON.parse(JSON.stringify(r));
  const restore = () => { for (const m of [EM, PM]) for (const [id, r] of Object.entries(ROWS)) m[id] = JSON.parse(JSON.stringify(r)); };
  return Promise.resolve(fn(restore)).finally(() => { for (const m of [EM, PM]) for (const id of Object.keys(ROWS)) delete m[id]; });
}

/* THE FIXTURE HALL IN THE CATALOGUE: the generator's own rows for the room (its ground, spawn rows, its rows' kill bounds, the hall), and the
   open ground's hunt and travel rows copied to the room's id. */
async function installHall(db) {
  const real = Object.fromEntries(Object.entries(PM).filter(([id]) => !(id in ROWS)));
  const r = GEN.catalogueRows(hallSource(real, GROUND));
  for (const t of ['hr_hunts', 'hr_hunt_travel']) {
    await db.query(`insert into public.${t} select (jsonb_populate_record(null::public.${t}, to_jsonb(r) || jsonb_build_object('hunt_id', $1::text))).* from public.${t} r where r.hunt_id = $2`, [ROOM, FROM]);
  }
  for (const g of r.grounds.filter((x) => x.hunt === ROOM)) {
    await db.query('insert into public.hr_hunt_grounds (hunt_id, ground_id, pockets, spawns, respawn_ms, seats, density_max) values ($1,$2,$3,$4,$5,$6,$7::int[])',
      [g.hunt, g.ground, g.pockets, g.spawns, g.respawn, g.seats, g.dmax]);
  }
  for (const s of r.groundSpawns.filter((x) => x.hunt === ROOM)) await db.query('insert into public.hr_hunt_ground_spawns (hunt_id, monster_id, n) values ($1,$2,$3)', [s.hunt, s.monster, s.n]);
  for (const b of r.killBounds.filter((x) => x.id in ROWS)) {
    await db.query('insert into public.hr_hunt_kill_bounds (monster_id, gold_max, xp_max, drops) values ($1,$2,$3,$4::jsonb)', [b.id, b.gold, b.xp, JSON.stringify(b.drops)]);
  }
  for (const h of r.bossHalls) await db.query('insert into public.hr_boss_halls (hall_id, hunt_id, monster_id, key_item, limit_ms) values ($1,$2,$3,$4,$5)', [h.id, h.hunt, h.monster, h.key, h.limitMs]);
}

async function booted(boot) {
  const b = await boot();
  await H.pinDice(b.db);
  const M = await H.loadEdge(H.ROOT);
  M.HG = await import(pathToFileURL(join(ROOT, 'src/core/hunt-ground.js')).href);
  await b.db.query('update public.hr_hunt_config set enabled = true where id');
  await installHall(b.db);
  return { db: b.db, M };
}

/* A hero, named, in its kit, holding `keys` Hall Keys. */
async function hero(db, M, uid, { level = 60, gold = 200000, gear = GEAR, name, keys = 0 } = {}) {
  await db.query('begin');
  await H.character(db, M, uid, { level, inv: { cooked_shrimp: 400, ...(keys ? { [KEY]: keys } : {}) }, gold });
  await db.query('commit');
  for (const [slot, item] of Object.entries(gear || {})) {
    await db.query('insert into public.player_equipment (user_id, slot, equip_slot, item_id) values ($1, 0, $2, $3) on conflict (user_id, slot, equip_slot) do update set item_id = excluded.item_id', [uid, slot, item]);
  }
  const named = await as(db, uid, 'select public.hr_character_name_set(0, $1, $2::uuid)', [name, idem()]);
  if (!named || named.ok !== true) throw new Error('harness: name refused: ' + JSON.stringify(named));
}
/* A party: the first hero leads, the rest join. */
async function party(db, M, uids, { level = 60, names = 'Hallb', gear = [GEAR, STAFF], keys = [1, 1] } = {}) {
  for (const [i, uid] of uids.entries()) await hero(db, M, uid, { level, gear: gear[i], name: names + String.fromCharCode(97 + i), keys: keys[i] || 0 });
  const inv = await as(db, uids[0], 'select public.hr_hunt_party_invite(0, $1, $2::uuid)', [names + 'b', idem()]);
  if (!inv || inv.ok !== true) throw new Error('harness: invite refused: ' + JSON.stringify(inv));
  const id = await one(db, 'select public.hr_hunt_party_of($1::uuid, 0)', [uids[0]]);
  /* No party finder (1059-no-party-finder.sql): every other hero is invited (b by name above, the rest by account) and accepts. */
  for (const [i, uid] of uids.slice(1).entries()) {
    if (i > 0) {
      const more = await as(db, uids[0], 'select public.hr_hunt_party_invite_player(0, $1::uuid, 0, $2::uuid)', [uid, idem()]);
      if (!more || more.ok !== true) throw new Error('harness: invite refused: ' + JSON.stringify(more));
    }
    const inviteId = await one(db, 'select id from public.hunt_party_invites where to_user = $1::uuid and to_slot = 0 and party_id = $2::uuid', [uid, id]);
    const j = await as(db, uid, 'select public.hr_hunt_party_accept(0, $1::uuid, $2::uuid)', [inviteId, idem()]);
    if (!j || j.ok !== true) throw new Error('harness: accept refused: ' + JSON.stringify(j));
  }
  return id;
}

/* THE SECOND PRESS AFTER THE LOCKS: the live body with its FIRST key read (the one before the locks) cut out, installed as public.<as>. */
async function afterLock(db, as) {
  const READ = 'v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);';
  const LOCK = "perform pg_advisory_xact_lock(hashtextextended('hr:hall:'";
  const def = String(await one(db, `select pg_get_functiondef('public.hr_boss_hall_enter(integer,text,uuid)'::regprocedure)`)).replace(/\r/g, '');
  const body = def.replace('FUNCTION public.hr_boss_hall_enter(', () => 'FUNCTION public.' + as + '(');
  const at = body.indexOf(READ), lock = body.indexOf(LOCK);
  if (at < 0 || lock < 0 || at > lock) throw new Error('HARNESS: hr_boss_hall_enter has no key read before its lock');
  const end = body.indexOf('end if;', at) + 'end if;'.length;
  await db.exec(body.slice(0, at) + body.slice(end));
}

/* ── THE VERB ─────────────────────────────────────────────────────────────── */
async function verbArms(boot) {
  const bad = [];
  const { db, M } = await booted(boot);
  const [a, b, c, d, e] = UIDS;
  await hero(db, M, a, { name: 'Halla', keys: 0 });
  /* HD-WORDS: an unknown hall, a malformed one, and no key: each by name, each moving nothing */
  let v = await enter(db, a, null, 'no_such_ground');
  if (v.error !== 'hall_unknown') bad.push('HD-WORDS an unknown hall answered ' + JSON.stringify(v));
  v = await enter(db, a, null, 'Bad Hall!');
  if (v.error !== 'hall_unknown') bad.push('HD-WORDS a malformed hall answered ' + JSON.stringify(v));
  v = await enter(db, a);
  if (v.error !== 'no_key' || v.key !== KEY) bad.push('HD-WORDS no key answered ' + JSON.stringify(v));
  if (Number(await one(db, 'select count(*) from public.hunt_sessions where user_id = $1', [a])) || await hallRows(db, a)) bad.push('HD-WORDS a refusal moved something');
  /* HD-DOOR: an enter, by itself, answers the room's refusal */
  v = await as(db, a, `select public.hr_hunt_enter(0, $1, '[]'::jsonb, 0, null, $2::uuid)`, [ROOM, idem()]);
  if (v.ok === true || !JSON.stringify(v).includes('hall_only')) bad.push('HD-DOOR an enter answered ' + JSON.stringify(v));
  if (Number(await one(db, 'select count(*) from public.hunt_sessions where user_id = $1', [a]))) bad.push('HD-DOOR a refused door opened a session');
  v = await as(db, a, `select public.hr_hunt_enter(0, $1, '[]'::jsonb, 0, null, $2::uuid)`, [FROM, idem()]);
  if (v.ok !== true) bad.push('HD-DOOR the hall\'s own ground refused a lone hero: ' + JSON.stringify(v));
  await db.query(`select public.hr_hunt_close(h.id, 'left', now(), true) from public.hunt_sessions h where h.user_id = $1 and h.ended_at is null`, [a]);
  /* HD-KEY: two keys, one spent; a replay spends nothing; another key finds the hero in the room */
  await db.query('insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, $2, 2) on conflict (user_id, slot, item_id) do update set qty = 2', [a, KEY]);
  const k = idem();
  v = await enter(db, a, k);
  if (v.ok !== true || v.entered !== 1 || v.alone !== true || v.party !== null || v.key !== KEY || v.hall !== FROM) bad.push('HD-KEY the press answered ' + JSON.stringify(v));
  if (await keysOf(db, a) !== 1) bad.push('HD-KEY the bag holds ' + await keysOf(db, a) + ' keys, want 1');
  const rows = await q(db, `select kind, intent, gold, meta from public.player_ledger where user_id = $1 and intent like 'boss\\_hall:%'`, [a]);
  if (rows.length !== 1 || rows[0].kind !== 'shop' || rows[0].intent !== 'boss_hall:' + FROM || Number(rows[0].gold || 0) !== 0 || rows[0].meta.reason !== 'boss_hall' || rows[0].meta.key !== KEY || rows[0].meta.hunt !== ROOM) bad.push('HD-KEY the journal reads ' + JSON.stringify(rows));
  if (Number(await one(db, 'select count(*) from public.hunt_sessions where user_id = $1 and hunt_id = $2 and ended_at is null', [a, ROOM])) !== 1) bad.push('HD-KEY the hero is not in the room');
  const again = await enter(db, a, k);
  if (again.ok !== true || await keysOf(db, a) !== 1 || await hallRows(db, a) !== 1) bad.push('HD-KEY a replay answered ' + JSON.stringify(again) + ' and left ' + await keysOf(db, a) + ' keys, ' + await hallRows(db, a) + ' rows');
  v = await enter(db, a);
  if (v.ok === true || await keysOf(db, a) !== 1 || await hallRows(db, a) !== 1) bad.push('HD-WORDS a second press in the room answered ' + JSON.stringify(v) + ' and left ' + await keysOf(db, a) + ' keys');
  if ((await one(db, `select current_setting('hr.boss_hall', true)`)) || '') bad.push('HD-DOOR the door stayed open');
  /* HD-LOCK: the second press of k, as it runs after the locks it waited on */
  await afterLock(db, 'hr__hl_after');
  v = await as(db, a, 'select public.hr__hl_after(0, $1, $2::uuid)', [FROM, k]);
  if (v.ok !== true || await keysOf(db, a) !== 1 || await hallRows(db, a) !== 1) bad.push('HD-LOCK the second press after the locks answered ' + JSON.stringify(v).slice(0, 160) + ' and left ' + await keysOf(db, a) + ' keys, ' + await hallRows(db, a) + ' rows');
  /* HD-PARTY: a member is refused; the leader's Start can't reach the room; the leader's key opens it for both */
  const pid = await party(db, M, [b, c], { names: 'Hallp', keys: [1, 1] });
  v = await enter(db, c);
  if (v.error !== 'hall_leader') bad.push('HD-WORDS a member answered ' + JSON.stringify(v));
  v = await as(db, b, 'select public.hr_hunt_party_start(0, $1, $2::uuid)', [ROOM, idem()]);
  if (v.ok === true || !JSON.stringify(v).includes('hall_only')) bad.push('HD-DOOR Start answered ' + JSON.stringify(v));
  if (await openIn(db, pid)) bad.push('HD-DOOR a refused Start opened a session');
  v = await enter(db, b);
  if (v.ok !== true || v.entered !== 2 || v.alone !== false || !v.party || v.party.id !== pid) bad.push('HD-PARTY the leader answered ' + JSON.stringify(v));
  if (await openIn(db, pid) !== 2 || await keysOf(db, b) !== 0 || await keysOf(db, c) !== 1 || await hallRows(db, b) !== 1 || await hallRows(db, c)) bad.push('HD-PARTY seats ' + await openIn(db, pid) + ', keys ' + await keysOf(db, b) + '/' + await keysOf(db, c));
  /* a party that can't start (its member is away: not seen for days, hr_party_away): nothing spent, nobody in */
  const pid2 = await party(db, M, [d, e], { names: 'Hallq', keys: [1, 0] });
  await db.query(`update public.hunt_party_members set joined_at = now() - interval '7 days' where party_id = $1 and user_id = $2`, [pid2, e]);
  await db.query(`delete from public.social_presence where user_id = $1`, [e]);
  v = await enter(db, d);
  if (v.ok === true || await keysOf(db, d) !== 1 || await hallRows(db, d) || await openIn(db, pid2)) bad.push('HD-PARTY a start the party can\'t make answered ' + JSON.stringify(v).slice(0, 160) + ', keys ' + await keysOf(db, d));
  /* HD-SEAT: the leader holds none and the member two: the leader's press takes ONE of the member's, in the member's ledger, its version forward */
  const [f, g, h, i] = UIDS.slice(5, 9);
  const pid3 = await party(db, M, [f, g], { names: 'Halls', keys: [0, 2] });
  const gSeat = Number(await one(db, 'select seat from public.hunt_party_members where party_id = $1 and user_id = $2 and slot = 0', [pid3, g]));
  const gVer = Number(await one(db, 'select version from public.player_state where user_id = $1 and slot = 0', [g]));
  const k3 = idem();
  v = await enter(db, f, k3);
  if (v.ok !== true || v.entered !== 2 || v.alone !== false || v.key_seat !== gSeat) bad.push('HD-SEAT the leader with no key of its own answered ' + JSON.stringify(v).slice(0, 200) + ' (want the member\'s seat ' + gSeat + ')');
  if (await openIn(db, pid3) !== 2 || await keysOf(db, g) !== 1 || await keysOf(db, f) !== 0) bad.push('HD-SEAT seats ' + await openIn(db, pid3) + ', the member holds ' + await keysOf(db, g) + ' keys (want 1 of 2)');
  const seatRows = await q(db, `select kind, intent, item_id, qty, gold, meta from public.player_ledger where user_id = $1 and intent like 'boss\\_hall:%'`, [g]);
  if (seatRows.length !== 1 || seatRows[0].kind !== 'shop' || seatRows[0].intent !== 'boss_hall:' + FROM || seatRows[0].item_id !== KEY || Number(seatRows[0].qty) !== -1
      || Number(seatRows[0].gold || 0) !== 0 || seatRows[0].meta.reason !== 'boss_hall' || seatRows[0].meta.key_seat !== gSeat || seatRows[0].meta.hunt !== ROOM) bad.push('HD-SEAT the member\'s journal reads ' + JSON.stringify(seatRows));
  if (await hallRows(db, f)) bad.push('HD-SEAT the leader\'s ledger says it spent a key it never held');
  if (!(Number(await one(db, 'select version from public.player_state where user_id = $1 and slot = 0', [g])) > gVer)) bad.push('HD-SEAT the member\'s version did not move with its bag');
  const again3 = await enter(db, f, k3);
  if (JSON.stringify(again3) !== JSON.stringify(v) || await keysOf(db, g) !== 1 || await hallRows(db, g) !== 1) bad.push('HD-SEAT a replay answered ' + JSON.stringify(again3).slice(0, 160) + ' and left the member ' + await keysOf(db, g) + ' keys');
  v = await enter(db, f);
  if (v.ok === true || await keysOf(db, g) !== 1 || await hallRows(db, g) !== 1) bad.push('HD-SEAT a second press in the room answered ' + JSON.stringify(v).slice(0, 160) + ' and left the member ' + await keysOf(db, g) + ' keys');
  /* a member's LOCKED key is never taken: no_key, nobody in, nothing moved; unlocked, it opens the hall */
  const pid4 = await party(db, M, [h, i], { names: 'Hallt', keys: [0, 1] });
  await lockKey(db, i, true);
  v = await enter(db, h);
  if (v.error !== 'no_key' || await keysOf(db, i) !== 1 || await openIn(db, pid4) || await hallRows(db, i)) bad.push('HD-SEAT a member\'s locked key answered ' + JSON.stringify(v).slice(0, 160) + ', keys ' + await keysOf(db, i));
  await lockKey(db, i, false);
  v = await enter(db, h);
  if (v.ok !== true || await keysOf(db, i) !== 0 || await openIn(db, pid4) !== 2) bad.push('HD-SEAT unlocked, the member\'s key answered ' + JSON.stringify(v).slice(0, 160));
  /* the key is read under every seat's lock: the body takes the seats' locks before it asks whose key */
  const body = String(await one(db, `select pg_get_functiondef('public.hr_boss_hall_enter(integer,text,uuid)'::regprocedure)`));
  const lockAt = body.indexOf('perform public.hr_hunt_lock(v_m.user_id, v_m.slot);'), keyAt = body.indexOf('v_key := public.hr_boss_hall_key_of(');
  if (!(lockAt > 0 && keyAt > lockAt)) bad.push('HD-SEAT the verb reads whose key before it locks the seats (lock at ' + lockAt + ', read at ' + keyAt + ')');
  return bad;
}

/* ── THE FIGHT ON THE SERVER, BOTH DOORS ──────────────────────────────────── */
async function backdate(db, inst, anchorMs) {
  const t = `to_timestamp(${Math.floor(anchorMs / 1000)})`;
  await db.query(`update public.hunt_sessions set entered_at = ${t} - interval '1 minute', hunt_from = ${t}, settled_to = ${t}, next_swing_at = ${t} where instance_id = $1 and ended_at is null`, [inst]);
  await db.query(`update public.hunt_instances set settled_to = ${t}, next_swing_at = ${t} where id = $1`, [inst]);
}
const makeExec = (db) => async (text, params) => { await db.exec('set role hr_engine'); try { return (await db.query(text, params)).rows; } finally { await db.exec('reset role'); } };

async function fightToEnd(db, M, door, uids, inst, anchorMs) {
  const exec = makeExec(db);
  await db.query('update public.hr_tick_config set enabled = true where id');
  const sids = await q(db, 'select user_id, id from public.hunt_sessions where instance_id = $1 and ended_at is null order by seat', [inst]);
  for (let w = 1, n = Math.ceil(BOSS_HALL_RULES.limitMs / WINDOW) + 2; w <= n && await openIn(db, inst); w++) {
    const atMs = anchorMs + w * WINDOW;
    if (door === 'fire') {
      await db.query('delete from public.hunt_tick_lease');
      const r = (await M.TK.runTick({ exec, atMs, grounds: grounds(M), body: { op: 'tick', roster: [], cadence_ms: 10000, flush_ms: WINDOW, hunts: sids.map((s) => ({ user_id: s.user_id, slot: 0, session_id: s.id })) } })).body;
      if (!r.hunts || r.hunts.settled < 1) throw new Error('fire settled nothing: ' + JSON.stringify(r.hunts || r).slice(0, 300));
    } else {
      const v = await M.HS.settleHunt({ exec, user: uids[0], slot: 0, mode: 'settle', bucket: null, project: true, live: true, atMs, minWindowMs: 0, grounds: grounds(M) });
      if (v.outcome !== 'paid') throw new Error('viewed settled nothing: ' + JSON.stringify({ o: v.outcome, r: v.reason, d: v.body && v.body.detail }).slice(0, 400));
    }
  }
  return q(db, 'select h.user_id, h.end_reason, h.ended_at, t.coins, t.kills, t.xp, t.loot, t.deaths from public.hunt_sessions h join public.hunt_session_tally t on t.session_id = h.id where h.instance_id = $1 order by h.seat', [inst]);
}

const JOBS = [
  { name: 'the kill', want: ['boss_felled'], level: 60, uids: [0, 1], paid: true },
  { name: 'a death', want: ['died', 'party_member_died'], or: ['died'], level: 1, uids: [2, 3], gear: [{}, {}], rows: { [BOSS]: { hp: 100000 } } },
  { name: 'the limit', want: ['boss_time'], level: 60, uids: [4, 5], rows: { [BOSS]: { hp: 100000000, atk: 1, aim: 1 }, [NAMED]: { hp: 10000000, atk: 1, aim: 1 }, [ADD]: { hp: 10000000, atk: 1, aim: 1 } } },
  { name: 'a lone kill', want: ['boss_felled'], level: 60, uids: [6], lone: true, paid: true },
];

async function bothDoors(door, boot, restore) {
  const bad = [];
  const { db, M } = await booted(boot);
  const ends = {};
  for (const job of JOBS) {
    const uids = job.uids.map((i) => UIDS[i]);
    const anchorMs = Date.UTC(2026, 9, 25, 12, 0, 0);
    const lone = job.lone === true;
    const pid = lone ? null : await party(db, M, uids, { level: job.level, names: 'Hall' + job.uids[0], gear: job.gear, keys: [1, 0] });
    if (lone) await hero(db, M, uids[0], { level: job.level, name: 'Lone' + job.uids[0] + 'h', keys: 1 });
    const lx0 = await q(db, 'select user_id, level_xp from public.player_state where user_id = any($1::uuid[]) and slot = 0 order by user_id', [uids]);
    const made = await enter(db, uids[0]);
    if (made.ok !== true) { bad.push(`HD-BOTH ${door} ${job.name}: the press answered ${JSON.stringify(made)}`); continue; }
    const inst = lone ? await one(db, 'select instance_id from public.hunt_sessions where user_id = $1 and slot = 0 and hunt_id = $2 and ended_at is null', [uids[0], ROOM]) : pid;
    if (!inst) { bad.push(`HD-BOTH ${door} ${job.name}: nobody in the room`); continue; }
    await backdate(db, inst, anchorMs);
    for (const [id, o] of Object.entries(job.rows || {})) for (const m of [EM, PM]) Object.assign(m[id], o);
    let got;
    try { got = await fightToEnd(db, M, door, uids, inst, anchorMs); } finally { restore(); }
    if (await openIn(db, inst)) bad.push(`HD-BOTH ${door} ${job.name}: ${await openIn(db, inst)} heroes still in the room`);
    const reasons = [...new Set(got.map((g) => g.end_reason))].sort();
    if (reasons.join() !== job.want.join() && reasons.join() !== (job.or || job.want).join()) bad.push(`HD-BOTH ${door} ${job.name}: ended ${reasons.join()}, want ${job.want.join()}`);
    if (new Set(got.map((g) => new Date(g.ended_at).getTime())).size !== 1) bad.push(`HD-BOTH ${door} ${job.name}: ends on two instants: ${got.map((g) => g.ended_at)}`);
    if (job.want[0] === 'boss_time' && !got.every((g) => new Date(g.ended_at).getTime() === anchorMs + BOSS_HALL_RULES.limitMs)) bad.push(`HD-BOTH ${door} the limit ended at ${got.map((g) => g.ended_at)}`);
    if (!lone && await one(db, 'select hunt_id from public.hunt_parties where id = $1', [pid]) !== FROM) bad.push(`HD-BOTH ${door} ${job.name}: the party stands on ${await one(db, 'select hunt_id from public.hunt_parties where id = $1', [pid])}`);
    const recs = await q(db, `select t.fight, public.hr_hunt_view(h.id)->'tally'->'fight' as seen from public.hunt_sessions h join public.hunt_session_tally t on t.session_id = h.id where h.instance_id = $1 order by h.seat`, [inst]);
    for (const r of recs) {
      if (!r.fight || !Number.isInteger(r.fight.boss_pm)) { bad.push(`HD-BOTH ${door} ${job.name}: a hero has no record of the fight`); continue; }
      if (JSON.stringify(r.seen) !== JSON.stringify(r.fight)) bad.push(`HD-BOTH ${door} ${job.name}: the view reads ${JSON.stringify(r.seen)}, the row ${JSON.stringify(r.fight)}`);
      if (job.paid && r.fight.boss_pm !== 0) bad.push(`HD-BOTH ${door} ${job.name}: the record says he stood at ${r.fight.boss_pm}`);
    }
    ends[job.name] = got.map((g) => g.end_reason + '@' + new Date(g.ended_at).toISOString()).concat(recs.map((r) => JSON.stringify(r.fight)));
    /* HD-PAID: the kill pays like any ground */
    if (job.paid) {
      const lx1 = await q(db, 'select user_id, level_xp from public.player_state where user_id = any($1::uuid[]) and slot = 0 order by user_id', [uids]);
      for (const [i, r] of lx1.entries()) if (!(Number(r.level_xp) > Number(lx0[i].level_xp))) bad.push(`HD-PAID ${door} ${job.name}: Level XP did not rise`);
      if (!got.some((g) => Number(g.coins) > 0)) bad.push(`HD-PAID ${door} ${job.name}: no coin: ${JSON.stringify(got.map((g) => g.coins))}`);
      if (!got.every((g) => Number(g.kills) > 0)) bad.push(`HD-PAID ${door} ${job.name}: the tally counts no kill`);
      const counters = Number(await one(db, `select count(*) from public.player_progress where user_id = any($1::uuid[]) and slot = 0 and kind = 'stat' and period_key = '' and key = 'ev:kill_monster:' || $2`, [uids, BOSS]));
      if (counters !== uids.length) bad.push(`HD-PAID ${door} ${job.name}: ${counters} kill counters for ${uids.length} heroes`);
      /* HD-DAILY (lane/c-krell-daily): THE FIRST KILL OF THE DAY gives every hero there its own piece (the fixture's one sure slice), stamps its day
         and journals it once; the page's section says taken, and when next */
      const today = await one(db, `select (now() at time zone 'utc')::date::text`);
      const state = async (tag, want) => {
        for (const uid of uids) {
          const got = { prize: await prizeOf(db, uid), days: await dayRows(db, uid), rows: await dailyRows(db, uid) };
          const took = got.rows.filter((r) => r.took === true).length, off = got.rows.filter((r) => r.took !== true).length;
          if (got.prize !== want.prize || got.days !== want.days || took !== want.took || off !== 0) {
            bad.push(`HD-DAILY ${door} ${job.name}, ${tag}: a hero holds ${got.prize} pieces on ${got.days} stamped days, ${took} claims journalled and ${off} taken off (want ${want.prize} / ${want.days} / ${want.took} / 0)`);
          }
        }
      };
      await state('the first kill of the day', { prize: 1, days: 1, took: 1 });
      const first = (await dailyRows(db, uids[0]))[0] || {};
      if (first.boss !== BOSS || first.hall !== FROM || first.day !== today || JSON.stringify(first.items) !== JSON.stringify({ [PRIZE]: 1 })) bad.push(`HD-DAILY ${door} ${job.name}: the claim's journal reads ${JSON.stringify(first)}`);
      /* A HERO'S FIRST ROLL ON THE BOSS IS MARKED, ONCE (lane/c-krell-uniques, the audit's F21: the engine's sure roll reads this): the claim's
         journal and its day row say first, and from then the engine's read and the page's section say the first win is behind the hero */
      for (const uid of uids) {
        const marked = Number(await one(db, `select count(*) from public.player_boss_loot_day where user_id = $1::uuid and slot = 0 and first`, [uid]));
        const took = (await dailyRows(db, uid)).filter((r) => r.took === true);
        if (marked !== 1 || took.length !== 1 || took[0].first !== true) bad.push(`HD-DAILY ${door} ${job.name}: the first roll is marked on ${marked} day rows and its journal says first ${JSON.stringify(took.map((r) => r.first))} (want 1 and [true])`);
        const ahead = await one(db, `select public.hr_boss_prize_first($1::uuid, 0, $2)`, [uid, ROOM]);
        if (ahead !== false) bad.push(`HD-DAILY ${door} ${job.name}: after its first roll the engine's read still says first: ${JSON.stringify(ahead)}`);
      }
      const sec = await one(db, `select public.hr_state_of($1::uuid, 0)->'boss_halls'->$2`, [uids[0], FROM]);
      if (sec && sec.first !== false) bad.push(`HD-DAILY ${door} ${job.name}: after its first roll the section says first ${JSON.stringify(sec.first)}`);
      const nextAt = sec && sec.next_at ? new Date(sec.next_at).getTime() : null;
      if (!sec || sec.taken !== true || sec.left !== 0 || sec.seats !== uids.length || nextAt !== Date.parse(today + 'T00:00:00Z') + 86400000) bad.push(`HD-DAILY ${door} ${job.name}: after the kill the section reads ${JSON.stringify(sec)}`);
      /* A SECOND KILL THE SAME DAY: the hero joins and fights, takes the kill's Level XP and coin, and no piece; no second stamp, and nothing
         was taken off its window (the engine never rolled: its read said taken) */
      const again = async (tag, anchor2) => {
        await giveKey(db, uids[0]);
        const lxA = await q(db, 'select user_id, level_xp from public.player_state where user_id = any($1::uuid[]) and slot = 0 order by user_id', [uids]);
        const coinA = Number(await one(db, `select coalesce(sum(t.coins), 0) from public.hunt_session_tally t where t.user_id = any($1::uuid[])`, [uids]));
        const made2 = await enter(db, uids[0]);
        if (made2.ok !== true) { bad.push(`HD-DAILY ${door} ${job.name}, ${tag}: the press answered ${JSON.stringify(made2).slice(0, 200)}`); return false; }
        const inst2 = lone ? await one(db, 'select instance_id from public.hunt_sessions where user_id = $1 and slot = 0 and hunt_id = $2 and ended_at is null', [uids[0], ROOM]) : pid;
        await backdate(db, inst2, anchor2);
        const got2 = await fightToEnd(db, M, door, uids, inst2, anchor2);
        const mine = got2.filter((x) => new Date(x.ended_at).getTime() > anchor2);
        if (mine.length !== uids.length || !mine.every((x) => x.end_reason === 'boss_felled')) bad.push(`HD-DAILY ${door} ${job.name}, ${tag}: ended ${mine.map((x) => x.end_reason).join() || 'nothing'}`);
        const lxB = await q(db, 'select user_id, level_xp from public.player_state where user_id = any($1::uuid[]) and slot = 0 order by user_id', [uids]);
        for (const [n, r] of lxB.entries()) if (!(Number(r.level_xp) > Number(lxA[n].level_xp))) bad.push(`HD-DAILY ${door} ${job.name}, ${tag}: Level XP did not rise`);
        const coinB = Number(await one(db, `select coalesce(sum(t.coins), 0) from public.hunt_session_tally t where t.user_id = any($1::uuid[])`, [uids]));
        if (!(coinB > coinA)) bad.push(`HD-DAILY ${door} ${job.name}, ${tag}: no coin from the kill`);
        return true;
      };
      if (await again('a second kill the same day', anchorMs + 3600000)) await state('a second kill the same day', { prize: 1, days: 1, took: 1 });
      /* THE DAY ROLLS OVER ON THE SERVER'S CLOCK: the stamp is yesterday's, so the next kill pays the piece again and stamps today */
      await db.query('update public.player_boss_loot_day set day = day - 1 where user_id = any($1::uuid[])', [uids]);
      if (await again('the next day', anchorMs + 7200000)) await state('the next day', { prize: 2, days: 2, took: 2 });
    }
  }
  return { bad, ends };
}

/* HD-OWED: a window past the limit with no end is refused, whatever the engine proposed. */
async function owed(boot) {
  const bad = [];
  const { db, M } = await booted(boot);
  const uids = UIDS.slice(8, 10);
  const pid = await party(db, M, uids, { names: 'Hallo', keys: [1, 0] });
  const made = await enter(db, uids[0]);
  if (made.ok !== true) return ['HD-OWED harness: the press answered ' + JSON.stringify(made)];
  const anchorMs = Date.UTC(2026, 9, 25, 12, 0, 0);
  await backdate(db, pid, anchorMs);
  const exec = makeExec(db);
  await db.query(`update public.hunt_sessions set entered_at = entered_at - make_interval(secs => ${BOSS_HALL_RULES.limitMs / 1000 + 120}), hunt_from = hunt_from - make_interval(secs => ${BOSS_HALL_RULES.limitMs / 1000 + 120}) where instance_id = $1`, [pid]);
  const plan = await M.HS.readHuntSettle({ exec, user: uids[0], slot: 0, atMs: anchorMs + WINDOW, grounds: grounds(M) }, 'tick');
  if (plan.answer) return ['HD-OWED harness: ' + JSON.stringify(plan.answer).slice(0, 200)];
  const p = await M.HS.proposeHuntSettle(plan, plan.toMs, 0);
  for (const m of p.commit.members) m.hunt.ended = null;
  const res = await M.HS.commitHuntSettle(exec, { ...p.commit, project: null });
  if (!res || res.ok === true || !JSON.stringify(res).includes('end_missing')) bad.push('HD-OWED a window past the limit with no end answered ' + JSON.stringify(res).slice(0, 200));
  return bad;
}

/* HD-CLAIM: the commit re-proves the claim, whatever the engine proposed (2027-04-25-boss-daily.sql hr_boss_prize_take). The kill's window is
   proposed by the real engine, then sent as it is not: each tamper is the same window read and proposed afresh. */
async function claim(boot) {
  const bad = [];
  const { db, M } = await booted(boot);
  const uids = UIDS.slice(10, 12);
  const pid = await party(db, M, uids, { names: 'Hallc', keys: [1, 0] });
  const made = await enter(db, uids[0]);
  if (made.ok !== true) return ['HD-CLAIM harness: the press answered ' + JSON.stringify(made)];
  const anchorMs = Date.UTC(2026, 9, 25, 12, 0, 0);
  await backdate(db, pid, anchorMs);
  const exec = makeExec(db);
  const propose = async (w) => {
    const plan = await M.HS.readHuntSettle({ exec, user: uids[0], slot: 0, atMs: anchorMs + w * WINDOW, grounds: grounds(M) }, 'tick');
    if (plan.answer) throw new Error('HD-CLAIM harness: the read answered ' + JSON.stringify(plan.answer).slice(0, 200));
    return (await M.HS.proposeHuntSettle(plan, plan.toMs, 0)).commit;
  };
  const send = (c) => M.HS.commitHuntSettle(exec, { ...c, project: null });
  const of = (c, uid) => c.members.find((m) => m.user === uid);
  const wrote = async () => Number(await one(db, `select (select count(*) from public.player_boss_loot_day where user_id = any($1::uuid[]))
    + (select count(*) from public.player_ledger where user_id = any($1::uuid[]) and intent = 'boss_daily')
    + (select coalesce(sum(qty), 0) from public.player_inventory where user_id = any($1::uuid[]) and item_id = $2)`, [uids, PRIZE]));
  for (let w = 1, n = Math.ceil(BOSS_HALL_RULES.limitMs / WINDOW) + 2; w <= n; w++) {
    let c = await propose(w);
    if (!c.members.some((m) => ((m.delta.journal || {}).meta || {}).prize === true)) {
      const res = await send(c);
      if (!res || res.ok !== true) return ['HD-CLAIM harness: an honest window before the kill was refused: ' + JSON.stringify(res).slice(0, 200)];
      continue;
    }
    /* THE KILL'S WINDOW: both heroes claim, each with its piece and the boss's kill journalled beside it */
    for (const uid of uids) {
      const m = of(c, uid);
      const meta = m ? (m.delta.journal || {}).meta || {} : {};
      if (!m || meta.prize !== true || 'prize' in m.hunt || (m.delta.items || {})[PRIZE] !== 1 || !((meta.km || {})[BOSS] >= 1)) {
        return ['HD-CLAIM CONTROL: the kill\'s window does not carry both heroes\' claims in their journals: ' + JSON.stringify(c.members.map((x) => [((x.delta.journal || {}).meta || {}).prize, x.delta.items, ((x.delta.journal || {}).meta || {}).km])).slice(0, 300)];
      }
    }
    /* (1) two pieces on one claim; (2) a claim with no kill of the boss beside it; (3) a claim that is not `true`: each refused WHOLE */
    const TAMPERS = [
      /* (the window says two kills, so the ground's own drop bound, kills x one a kill, would let two pieces by: only the claim's bound refuses) */
      ['two pieces on one claim', (m) => { m.delta.items[PRIZE] = 2; m.delta.journal.meta.kills = Math.max(2, m.delta.journal.meta.kills); }, 'value_over'],
      ['a claim with no kill of the boss beside it', (m) => { delete m.delta.journal.meta.km[BOSS]; }, 'bad_prize'],
      ['a claim that is not true', (m) => { m.delta.journal.meta.prize = 1; }, 'bad_prize'],
    ];
    for (const [name, tamper, want] of TAMPERS) {
      c = await propose(w);
      tamper(of(c, uids[0]));
      const res = await send(c);
      if (!res || res.ok === true || !JSON.stringify(res).includes(want)) bad.push('HD-CLAIM ' + name + ' answered ' + JSON.stringify(res).slice(0, 200) + ' (want ' + want + ')');
      if (await wrote()) { bad.push('HD-CLAIM ' + name + ' wrote a day, a journal row or a piece'); return bad; }
    }
    /* (4) NO CLAIM, NO PRIZE (an engine before the file): the first hero's piece is sent with no claim. (5) THE DAY TAKEN SINCE THE READ: the
       second hero's row for today is already there when its claim lands. Neither is refused: both pieces are taken off the window, each
       journalled once with its reason, the rest of the window (the kill's Level XP) paid. */
    c = await propose(w);
    delete of(c, uids[0]).delta.journal.meta.prize;
    await db.query(`insert into public.player_boss_loot_day (user_id, slot, boss, day) values ($1, 0, $2, (now() at time zone 'utc')::date)`, [uids[1], BOSS]);
    const lx0 = await q(db, 'select user_id, level_xp from public.player_state where user_id = any($1::uuid[]) and slot = 0 order by user_id', [uids]);
    const res = await send(c);
    if (!res || res.ok !== true) { bad.push('HD-CLAIM a window with an unclaimed prize was refused, and a hall hunt must never freeze on it: ' + JSON.stringify(res).slice(0, 200)); return bad; }
    const lx1 = await q(db, 'select user_id, level_xp from public.player_state where user_id = any($1::uuid[]) and slot = 0 order by user_id', [uids]);
    for (const [n2, r] of lx1.entries()) if (!(Number(r.level_xp) > Number(lx0[n2].level_xp))) bad.push('HD-CLAIM the window\'s Level XP was not paid with its prize taken off');
    for (const [n2, why] of [[0, 'no_claim'], [1, 'taken_today']]) {
      const rows = await dailyRows(db, uids[n2]);
      if (await prizeOf(db, uids[n2]) !== 0) bad.push('HD-CLAIM a prize with ' + why + ' reached the bag');
      if (rows.length !== 1 || rows[0].took !== false || rows[0].why !== why || JSON.stringify(rows[0].dropped) !== JSON.stringify({ [PRIZE]: 1 })) bad.push('HD-CLAIM ' + why + ' is journalled as ' + JSON.stringify(rows));
    }
    for (const uid of uids) {
      const said = await one(db, `select count(*) from public.player_ledger where user_id = $1 and kind = 'combat' and intent = 'accrue' and meta ? 'prize'`, [uid]);
      if (Number(said)) bad.push('HD-CLAIM the window\'s own ledger row still says a prize roll the day refused, or one never claimed');
    }
    if (await dayRows(db, uids[0]) !== 0 || await dayRows(db, uids[1]) !== 1) bad.push('HD-CLAIM the days read ' + await dayRows(db, uids[0]) + ' and ' + await dayRows(db, uids[1]) + ' (an unclaimed prize stamps none; a taken day stays one)');
    return bad;
  }
  bad.push('HD-CLAIM CONTROL: no window carried a claim: the boss never fell');
  return bad;
}

const ARMS = {
  verb: (boot) => verbArms(boot),
  doors: async (boot, restore) => {
    const a = await bothDoors('fire', boot, restore), b = await bothDoors('viewed', boot, restore);
    const bad = [...a.bad, ...b.bad];
    for (const k of Object.keys(a.ends)) if (JSON.stringify(a.ends[k]) !== JSON.stringify(b.ends[k])) bad.push(`HD-BOTH ${k}: the browser closed ends ${JSON.stringify(a.ends[k])}, the hunt viewed ${JSON.stringify(b.ends[k])}`);
    return bad;
  },
  owed: (boot) => owed(boot),
  claim: (boot) => claim(boot),
  /* HD-AGAIN: each lane's files again on the chain as of its own last file: byte for byte (the hall's two, then lane/c-krell-daily's two) */
  again: async (boot) => {
    const bad = [];
    for (const files of [FILES, DAILY_FILES]) {
      const { db } = await boot({ upTo: files[files.length - 1] });
      const read = async () => ({ inv: await inventory(db),
        bodies: await q(db, `select p.proname, md5(p.prosrc) as m from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('hr_hunt_admit', 'hr_hunt_settle_session', 'hr_boss_fight_ok', 'hr_boss_hall_enter', 'hr_boss_hall_closed',
          'hr_boss_hall_key_of', 'hr_boss_prize_left', 'hr_boss_prize_take', 'hr_boss_halls_view', 'hr_hunt_instance_read', 'hr_hunt_apply_member') order by 1`),
        halls: await q(db, 'select * from public.hr_boss_halls order by hall_id'), baseline: await q(db, `select proname, identity_args, grantee, note from public.hr_client_rpc_baseline where proname = 'hr_boss_hall_enter'`),
        sections: await q(db, `select key, fn, note from public.hr_state_sections where key = 'boss_halls'`) });
      const before = await read();
      for (const f of files) {
        try { await db.exec(readFileSync(join(ROOT, 'supabase/migrations', f), 'utf8')); } catch (e) { bad.push('HD-AGAIN ' + f + ' refused a second apply: ' + String(e.message).split('\n')[0].slice(0, 400)); return bad; }
      }
      const after = await read();
      for (const k of Object.keys(before)) if (JSON.stringify(after[k]) !== JSON.stringify(before[k])) bad.push('HD-AGAIN a second apply of ' + files.join(' + ') + ' moved ' + k + (k === 'inv' ? ': ' + Object.keys(before.inv).filter((c) => JSON.stringify(before.inv[c]) !== JSON.stringify(after.inv[c])).join() : ''));
    }
    return bad;
  },
};

const FN = { admit: 'public.hr_hunt_admit(uuid,integer,text)', settle: 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)', verb: 'public.hr_boss_hall_enter(integer,text,uuid)',
  fight: 'public.hr_boss_fight_ok(jsonb,text)', closed: 'public.hr_boss_hall_closed()',
  keyOf: 'public.hr_boss_hall_key_of(uuid,uuid,integer,text)', take: 'public.hr_boss_prize_take(uuid,integer,uuid,uuid,text,jsonb)',
  left: 'public.hr_boss_prize_left(uuid,integer,text)', read: 'public.hr_hunt_instance_read(uuid,integer)',
  member: 'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)' };
const MUTANTS = [
  { name: 'every door opens the hall', fn: FN.admit, find: "and current_setting('hr.boss_hall', true) is distinct from p_hunt then", repl: 'and false then', arm: 'verb', want: /HD-DOOR/ },
  { name: 'the key is read only before the locks', fn: FN.verb, find: "perform pg_advisory_xact_lock(hashtextextended('hr:hall:' || v_uid::text || ':' || p_slot::text, 0));\n  -- A SECOND PRESS OF ONE KEY that waited on those locks answers the first one's decision (2027-04-19-key-under-lock.sql): the read above ran\n  -- before the first press committed.\n  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);\n  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;", repl: "perform pg_advisory_xact_lock(hashtextextended('hr:hall:' || v_uid::text || ':' || p_slot::text, 0));", arm: 'verb', want: /HD-LOCK/ },
  { name: 'a member spends the leader\'s door', fn: FN.verb, find: 'if v_party is not null and not (v_p.leader_user = v_uid and v_p.leader_slot = p_slot) then', repl: 'if false then', arm: 'verb', want: /HD-WORDS|HD-PARTY/ },
  /* ("no key is needed" retired with 2027-04-24-hall-key-any-seat.sql: the read under the locks and the spend each refuse no_key by themselves,
     so no single line's loss opens a hall free: with `if v_key is null` gone the spend finds no row and answers no_key, every seat rolled back) */
  /* ANY SEAT'S KEY (2027-04-24-hall-key-any-seat.sql) */
  { name: 'only the leader\'s own key opens it', fn: FN.verb, find: 'v_key := public.hr_boss_hall_key_of(v_party, v_uid, p_slot, v_h.key_item);', repl: 'v_key := public.hr_boss_hall_key_of(null, v_uid, p_slot, v_h.key_item);', arm: 'verb', want: /HD-SEAT/ },
  { name: 'another seat\'s key is never spent', fn: FN.verb, find: "      delete from public.player_inventory where user_id = v_ku and slot = v_ks and item_id = v_h.key_item and qty = 1;\n      get diagnostics v_n = row_count;\n      if v_n = 0 then", repl: "      v_n := 1;\n      if v_n = 0 then", arm: 'verb', want: /HD-SEAT/ },
  { name: 'the holder\'s ledger says nothing', fn: FN.verb, find: "        values (v_ku, v_ks, 'shop', v_verb, v_h.key_item, -1, 0, 0, 0, 0, 0, v_meta);", repl: "        select v_ku, v_ks, 'shop', v_verb, v_h.key_item, -1, 0, 0, 0, 0, 0, v_meta where false;", arm: 'verb', want: /HD-SEAT/ },
  { name: 'the key is read before the seats are locked', fn: FN.verb, find: '      perform public.hr_hunt_lock(v_m.user_id, v_m.slot);\n', repl: '      null;\n', arm: 'verb', want: /HD-SEAT the verb reads whose key before it locks/ },
  { name: 'a member\'s locked key is taken', fn: FN.keyOf, find: 'where r.user_id = m.user_id and r.slot = m.slot and r.item_id = p_item and r.locked))', repl: 'where false))', arm: 'verb', want: /HD-SEAT a member's locked key/ },
  { name: 'the leader\'s key is not first', fn: FN.keyOf, find: 'order by (m.user_id = p.leader_user and m.slot = p.leader_slot) desc, m.seat', repl: 'order by m.seat desc', arm: 'verb', want: /HD-PARTY/ },
  /* THE DAILY PRIZE (2027-04-25-boss-daily.sql) */
  { name: 'the engine\'s read carries no prize', fn: FN.read, find: "'prize_left', public.hr_boss_prize_left(h.user_id, h.slot, v_i.hunt_id),", repl: "'prize_left', null,", arm: 'doors', want: /HD-DAILY/ },
  { name: 'the read offers a prize the day has taken', fn: FN.left, find: '  return not exists (select 1 from public.player_boss_loot_day d', repl: '  return true or not exists (select 1 from public.player_boss_loot_day d', arm: 'doors', want: /HD-DAILY .*a second kill the same day/ },
  { name: 'the first roll is never marked', fn: FN.take, find: 'values (p_user, p_slot, v_boss, v_day, p_session, v_first)', repl: 'values (p_user, p_slot, v_boss, v_day, p_session, false)', arm: 'doors', want: /HD-DAILY .*the first roll is marked on 0 day rows/ },
  { name: 'the first roll\'s journal does not say so', fn: FN.take, find: "'took', true, 'first', v_first, 'items', v_got)", repl: "'took', true, 'items', v_got)", arm: 'doors', want: /HD-DAILY .*its journal says first/ },
  { name: 'the prize step never runs', fn: FN.member, find: "  if right(v_s.hunt_id, 5) = '_hall' or coalesce(p_delta #> '{journal,meta}', '{}'::jsonb) ? 'prize' then", repl: '  if false then', arm: 'claim', want: /HD-CLAIM/ },
  { name: 'a refused claim stays in the window\'s own ledger row', fn: FN.take, find: "    p_delta := p_delta #- '{journal,meta,prize}';", repl: '    null;', arm: 'claim', want: /HD-CLAIM the window's own ledger row/ },
  { name: 'a second claim the same day passes', fn: FN.take, find: '    if v_ins = 1 then', repl: '    if true then', arm: 'claim', want: /HD-CLAIM a prize with taken_today|HD-CLAIM taken_today/ },
  { name: 'a claim needs no kill', fn: FN.take, find: '    if v_km < 1 then perform', repl: '    if false then perform', arm: 'claim', want: /HD-CLAIM a claim with no kill/ },
  { name: 'a claim may carry two pieces', fn: FN.take, find: '      if v_n > 1 then perform', repl: '      if false then perform', arm: 'claim', want: /HD-CLAIM two pieces/ },
  { name: 'a claim may be anything', fn: FN.take, find: "  if v_prize is not null and v_prize is distinct from 'true'::jsonb then", repl: '  if false then', arm: 'claim', want: /HD-CLAIM a claim that is not true/ },
  { name: 'an unclaimed prize passes', fn: FN.take, find: '  if v_n > 0 then\n    v_items := v_items - array(select jsonb_object_keys(v_got));', repl: '  if false then\n    v_items := v_items - array(select jsonb_object_keys(v_got));', arm: 'claim', want: /HD-CLAIM a prize with no_claim/ },
  { name: 'the key is never spent', fn: FN.verb, find: "jsonb_build_object('items', jsonb_build_object(v_h.key_item, -1),", repl: "jsonb_build_object('items', jsonb_build_object(v_h.key_item, 0),", arm: 'verb', want: /HD-KEY|HD-PARTY/ },
  { name: 'a refused start still spends the key', fn: FN.verb, find: "    if coalesce(v_r->>'ok', 'false') <> 'true' then\n      v_no := v_r;", repl: "    if false then\n      v_no := v_r;", arm: 'verb', want: /HD-PARTY|HD-WORDS/ },
  { name: 'the felled end is a call\'s only', fn: FN.settle, find: "                              or exists (select 1 from public.hr_boss_halls h where h.hunt_id = v_s.hunt_id)\n", repl: '', arm: 'doors', want: /HD-BOTH|THREW/ },
  { name: 'the limit is not owed in a hall', fn: FN.settle, find: '       or exists (select 1 from public.hr_boss_halls h where h.hunt_id = v_s.hunt_id and v_to > v_s.hunt_from + make_interval(secs => h.limit_ms / 1000.0) + c_skew)\n', repl: '', arm: 'owed', want: /HD-OWED/ },
  { name: 'a hall keeps no record', fn: FN.fight, find: '  if not exists (select 1 from public.hr_boss_halls h where h.hunt_id = p_hunt) then\n    if not exists', repl: '  if true then\n    if not exists', arm: 'doors', want: /HD-BOTH|THREW/ },
  { name: 'the party stays on the room', fn: FN.closed, find: 'update public.hunt_parties p set hunt_id = v_from', repl: 'update public.hunt_parties p set hunt_id = p.hunt_id', arm: 'doors', want: /HD-BOTH/ },
];

async function main() {
  if (process.argv.includes('--mutate') || process.argv.includes('--selftest')) {
    if (process.env.HR_MUTANT_CONTROL) {
      const bad = await ARMS.verb(() => bootReplay());
      console.log('boss-hall-db --mutate: control ran the clean tree: ' + (bad.length ? bad.join('; ') : 'green'));
      process.exit(0);
    }
    let escaped = 0;
    const pick = (process.argv.find((a) => a.startsWith('--mutant=')) || '').slice(9);
    const list = MUTANTS.filter((m) => !pick || m.name.includes(pick));
    for (const m of list) {
      const boot = async (o) => {
        const b = await bootReplay(o);
        const def = (await one(b.db, 'select pg_get_functiondef($1::regprocedure)', [m.fn])).replace(/\r/g, '');
        if (!def.includes(m.find)) throw new Error('HARNESS: ' + m.fn + ' has no ' + JSON.stringify(m.find.slice(0, 70)));
        await b.db.exec(def.replace(m.find, () => m.repl));
        return b;
      };
      let got = [];
      try { got = await withRows((restore) => ARMS[m.arm](boot, restore)); } catch (e) { if (/HARNESS/.test(String(e.message))) throw e; got = ['THREW ' + String(e && e.message).slice(0, 200)]; }
      await closeReplays();   // an unclosed replay is never collected (tests/schema-replay.mjs closeReplays)
      const hit = got.some((p) => m.want.test(p));
      if (!hit) escaped++;
      console.log('  ' + (hit ? 'caught ' : 'ESCAPED') + ' ' + m.name + ': ' + String(got[0] || 'every check held').slice(0, 150));
    }
    console.log(escaped ? `boss-hall-db --mutate: ${escaped} ESCAPED` : `boss-hall-db --mutate: ${list.length}/${list.length} caught`);
    process.exit(escaped ? 1 : 0);
  }
  const boot = (o) => bootReplay(o);
  const only = (process.argv.find((a) => a.startsWith('--arm=')) || '').slice(6);
  const bad = [];
  await withRows(async (restore) => { for (const arm of Object.keys(ARMS)) if (!only || arm === only) { bad.push(...await ARMS[arm](boot, restore)); await closeReplays(); } });
  for (const p of bad) console.log('FAIL  ' + p);
  console.log(bad.length ? 'boss-hall-db: ' + bad.length + ' FAILED' : 'boss-hall-db: green (the verb, the key under the lock, any seat\'s key, the one door, three ends and the daily prize through both doors, the pay, the owed limit, the claim re-proved, a second apply)');
  process.exit(bad.length ? 1 : 0);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
