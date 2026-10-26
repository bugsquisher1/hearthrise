#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/town-stands.mjs — EVERY BODY IN TOWN ON THE SERVER'S STAND, ON A REAL DATABASE.
//
//   node tests/town-stands.mjs            the rules, on the whole replayed chain (PGlite, real PostgreSQL)
//   node tests/town-stands.mjs --load     + the synthetic load: 60 viewers reading every 2 s over 240 bodies
//   node tests/town-stands.mjs --mutate   every planted defect in the migration must turn a rule RED
//
// mutant-anchors: supabase/migrations/2027-01-28-town-stands.sql, supabase/migrations/2027-01-29-havora-stations.generated.sql
//
// supabase/migrations/2027-01-28-town-stands.sql proves its contract inside ONE
// transaction (its §6, on every replay). This guard plays it the way the game
// does, call by call on a committed database, as `authenticated`, with the real
// clock between the calls (a cursor from one answer, a change, the next read):
//   TS-1  BROWSER CLOSED: heroes that start a town activity the way the settle does
//         (the activity pointer, nothing else: no keepalive, no publish, no page)
//         are drawn for another player on their own stands of their activity's
//         station, never two on one, and stay there while nobody keeps them alive
//   TS-2  TOWN VIEWED: the viewer is set down on the idle station by its first read
//         (`me`), its steered publish is what others see, its look (name, level, role,
//         outfit) is re-read once a minute, a new activity moves its stand to the
//         station walking from where it stood, hr_town_go takes it to a counter and
//         back, and a work station is refused
//   TS-0  A TOWN ALREADY AT WORK (production refused 2027-01-26-town-stands.sql, 10-26: its
//         self-check assumed an empty town): the migration applies, its self-check included,
//         on a chain where 8 heroes are already gathering and cooking (production's shape),
//         twice, and leaves their 8 notes for the first town read
//   TS-4  THE NEXT CATALOGUE (tools/gen-town-stations.mjs OUT_FILE, today Havora) over a town at
//         work: no body is left on a stand it lacks, the released workers are noted and the
//         next read sets each down on its activity's new station; a second apply moves nobody
//   TS-3  OUT AND BACK: a parked hero that starts a hunt is refused a keepalive and is
//         `gone` from a delta read made with the real cursor; when the hunt ends it is
//         set down on the arrival stand; once a cursor is more than the 5 s commit
//         slack past the last change, a delta with nothing changed is empty
// --load (the real-town plan's "Measure before L2 ships"): 120 accounts x 2 heroes =
//   240 bodies in ONE instance of a probe town (players raised for the measure), 60
//   viewers each reading every 2 s (30 reads/s) while 12 heroes walk a tick; prints
//   PGlite ms per read (full and delta, p50/p95) and the payload bytes. PGlite is one
//   WASM backend: the reads run one after another, so ms per read is the measure and
//   30 reads/s needs it under ~33 ms.
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, ROOT } from './schema-replay.mjs';
import { isMain } from './_is-main.mjs';
import { OUT_FILE as CATALOGUE } from '../tools/gen-town-stations.mjs';

const FILE = '2027-01-28-town-stands.sql';
const U = (i) => '000000c0-0000-4000-a000-7057ff' + String(i).padStart(6, '0');

/* As `authenticated`, each call its OWN transaction (the session's claim, not a transaction's): the real clock moves between calls. */
async function as(db, uid, sql, params) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
  await db.exec('set role authenticated');
  try { const r = (await db.query(sql, params)).rows[0]; return r ? Object.values(r)[0] : undefined; }
  finally { await db.exec('reset role'); }
}
const one = async (db, sql, params) => { const r = (await db.query(sql, params)).rows[0]; return r ? Object.values(r)[0] : undefined; };
const view = (db, uid, slot, cx, cy, cursor = null, pcx = null, pcy = null, map = 'town_common') =>
  as(db, uid, 'select public.hr_town_view($1, $2, $3, $4, $5, $6, $7)', [slot, map, cx, cy, cursor, pcx, pcy]);

async function people(db, n, slots = [0]) {
  await db.query("insert into public.hr_flags (key, enabled, note) values ('town_presence', true, 'town-stands test') on conflict (key) do update set enabled = true");
  for (let i = 1; i <= n; i++) {
    const uid = U(i);
    await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [uid]);
    await db.query('insert into public.profiles (id, display_name) values ($1, $2) on conflict (id) do update set display_name = excluded.display_name', [uid, 'Stand ' + i]);
    await db.query("insert into public.hr_access_allowlist (user_id, note) values ($1, 'town-stands test') on conflict (user_id) do nothing", [uid]);
    for (const slot of slots) {
      const c = await as(db, uid, 'select public.hr_create_character($1)', [slot]);
      if (!c || c.ok !== true) throw new Error('HARNESS: hr_create_character refused: ' + JSON.stringify(c));
    }
  }
  await db.query('delete from public.hr_rate_counters');
}

/* The settle's write: the activity pointer and nothing else (what hr_apply's set_activity / the resume do). */
const work = (db, uid, slot, kind, id) => db.query('update public.player_state set active_kind = $3, active_id = $4 where user_id = $1 and slot = $2', [uid, slot, kind, id]);
const standOf = (db, uid, slot) => db.query('select station_id, stand_no, why, inst, from_x, from_y from public.town_bodies where user_id = $1 and slot = $2', [uid, slot]).then((r) => r.rows[0] || null);
const tileOf = (db, map, station, no) => db.query('select x, y from public.hr_town_stands where map_id = $1 and station_id = $2 and stand_no = $3', [map, station, no]).then((r) => r.rows[0] || null);

/* TS-0: production's shape when the file applies: 7 heroes gathering and 1 cooking (measured read-only, 10-26). */
const LIVE_WORK = [['gather', 'deep_mithril_vein'], ['gather', 'essence_rock'], ['gather', 'iron_rock'], ['gather', 'normal_tree'],
  ['gather', 'rich_coal_rock'], ['gather', 'swordfish_deeps_s'], ['gather', 'yew_tree'], ['artisan', 'cook_shrimp']];
const LIVE_SEED = `do $seed$
declare u uuid; w text[] := array[${LIVE_WORK.map(([k, id]) => `'${k}:${id}'`).join(', ')}]; i int;
begin
  for i in 1..array_length(w, 1) loop
    u := ('000000c1-0000-4000-a000-7057ee' || lpad(i::text, 6, '0'))::uuid;
    insert into auth.users (id) values (u) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (u, 'Live ' || i) on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (u, 'town-stands TS-0') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', u::text, true);
    perform public.hr_create_character(0);
    update public.player_state set active_kind = split_part(w[i], ':', 1), active_id = split_part(w[i], ':', 2) where user_id = u and slot = 0;
  end loop;
  perform set_config('request.jwt.claim.sub', '', true);
end $seed$;`;

async function liveTown(patches) {
  const fails = [];
  let db;
  /* up to this file: its §6 plays on the catalogue it was applied over (2027-01-26's seed, as production on 10-26) */
  try { ({ db } = await bootReplay(Object.assign({ seedBefore: new Map([[FILE, LIVE_SEED]]), upTo: FILE }, patches ? { patches } : {}))); }
  catch (e) { if (e && e.harness) throw e; return ['TS-0 the file did not apply on a town already at work: ' + String(e.message).split('\n')[1]]; }
  try {
    const src = (await readFile(join(ROOT, 'supabase/migrations', FILE), 'utf8')).replace(/\r\n/g, '\n');
    try { await db.exec(`begin;\n${src}\ncommit;`); } catch (e) { await db.exec('rollback').catch(() => {}); fails.push('TS-0 a second apply on a town at work refused: ' + e.message); }
    const n = await one(db, "select count(*)::int from public.town_moves where user_id::text like '000000c1-0000-4000-a000-7057ee%'");
    if (n !== LIVE_WORK.length) fails.push('TS-0 the live workers\' notes are not left for the first read: ' + n + ' of ' + LIVE_WORK.length);
  } finally { await db.close().catch(() => {}); }
  return fails;
}

/* TS-4: THE NEXT CATALOGUE OVER A TOWN AT WORK (2027-01-29-havora-stations.generated.sql, production's shape: 8 heroes
   working, each set down on the 24 x 14 seed's stands by the town's first read before it applies). Every body on a
   stand the new catalogue lacks is released and, while it works, noted again; the next read sets each down on its
   activity's NEW station; a second apply of the file changes nothing and passes its own self-check. */
const NEXT = CATALOGUE;
const SEEDED_AND_READ = LIVE_SEED.replace('end $seed$;', `  perform public.hr_town_moves_settle((select map_id from public.hr_town_maps where main), 1000);
end $seed$;`);
async function nextCatalogue(patches) {
  const fails = [];
  let db;
  try { ({ db } = await bootReplay(Object.assign({ seedBefore: new Map([[NEXT, SEEDED_AND_READ]]), upTo: NEXT }, patches ? { patches } : {}))); }
  catch (e) { if (e && e.harness) throw e; return ['TS-4 ' + NEXT + ' did not apply on a town at work: ' + String(e.message).split('\n')[1]]; }
  try {
    const live = "user_id::text like '000000c1-0000-4000-a000-7057ee%'";   // TS-0's live workers (LIVE_SEED)
    const dangling = () => one(db, `select count(*)::int from public.town_bodies b where b.${live} and b.station_id is not null
      and not exists (select 1 from public.hr_town_stands s where s.map_id = b.map_id and s.station_id = b.station_id and s.stand_no = b.stand_no)`);
    if (await dangling() !== 0) fails.push('TS-4 a body holds a stand the new catalogue does not have');
    const noted = await one(db, `select count(distinct (user_id, slot))::int from public.town_moves where ${live}`);
    if (noted !== LIVE_WORK.length) fails.push('TS-4 the released workers are not noted for the next read: ' + noted + ' of ' + LIVE_WORK.length);
    await one(db, "select public.hr_town_moves_settle('town_common', 1000)");
    const placed = (await db.query(`select b.station_id, ps.active_kind k, ps.active_id a,
        public.hr_town_station_for('town_common', ps.active_kind, ps.active_id) want
        from public.town_bodies b join public.player_state ps using (user_id, slot) where b.${live}`)).rows;
    const wrong = placed.filter((r) => r.station_id !== r.want);
    if (placed.length !== LIVE_WORK.length || wrong.length) fails.push('TS-4 a worker is not set down on its new station: ' + JSON.stringify(wrong.length ? wrong : placed).slice(0, 300));
    const before = JSON.stringify((await db.query('select user_id, slot, station_id, stand_no, inst from public.town_bodies order by 1, 2')).rows);
    const src = (await readFile(join(ROOT, 'supabase/migrations', NEXT), 'utf8')).replace(/\r\n/g, '\n');
    try { await db.exec(`begin;\n${src}\ncommit;`); } catch (e) { await db.exec('rollback').catch(() => {}); fails.push('TS-4 a second apply refused: ' + e.message); }
    const after = JSON.stringify((await db.query('select user_id, slot, station_id, stand_no, inst from public.town_bodies order by 1, 2')).rows);
    if (before !== after) fails.push('TS-4 a second apply moved a body');
  } finally { await db.close().catch(() => {}); }
  return fails;
}

async function rules(db) {
  const fails = [];
  const fail = (m) => fails.push(m);
  await people(db, 6, [0, 1]);
  const V = U(6);   // the viewer: its own account, idle
  /* WHERE TO LOOK: the catalogue's own tiles (the town is whatever the generated catalogue says, today Havora) */
  const firstTile = async (station) => (await db.query("select x, y from public.hr_town_stands where map_id = 'town_common' and station_id = $1 order by stand_no limit 1", [station])).rows[0];
  const W = await firstTile(await one(db, "select public.hr_town_station_for('town_common', 'gather', 'normal_tree')"));
  const I = await firstTile(await one(db, "select station_id from public.hr_town_stations where map_id = 'town_common' and role = 'idle'"));
  const A = await firstTile(await one(db, "select public.hr_town_station_for('town_common', 'combat', 'mill_cellar')"));
  const counter = await one(db, "select station_id from public.hr_town_stations where map_id = 'town_common' and role = 'visit' order by ord limit 1");
  const SX = W.x + 1, SY = W.y;   // the viewer's steered tile, in the woodcutters' view
  // TS-1 BROWSER CLOSED
  for (let i = 1; i <= 5; i++) await work(db, U(i), 0, 'gather', 'normal_tree');
  await view(db, V, 0, W.x, W.y);                    // places the viewer; applies the notes after its read
  const first = await view(db, V, 0, W.x, W.y);
  const ws = (first && first.walkers) || [];
  const workers = ws.filter((w) => [1, 2, 3, 4, 5].some((i) => w.id === U(i)));
  if (workers.length !== 5) fail('TS-1 the viewer sees ' + workers.length + ' of the 5 workers whose browsers are closed: ' + JSON.stringify(first).slice(0, 300));
  const held = await db.query("select station_id, stand_no, count(*) n from public.town_bodies where user_id::text like '000000c0-0000-4000-a000-7057ff%' and station_id is not null group by 1, 2 having count(*) > 1");
  if (held.rows.length) fail('TS-1 two bodies hold one stand: ' + JSON.stringify(held.rows));
  for (const w of workers) {
    const t = await one(db, "select count(*)::int from public.hr_town_stands where map_id = 'town_common' and station_id = $1 and x = $2 and y = $3", [w.station, w.x, w.y]);
    const want = await one(db, "select public.hr_town_station_for('town_common', 'gather', 'normal_tree')");
    if (t !== 1 || w.station !== want || w.work !== true) fail('TS-1 a worker is not drawn working on a stand of its station ' + want + ': ' + JSON.stringify(w));
  }
  if (await one(db, "select count(*)::int from public.town_seen s where s.user_id::text like '000000c0-0000-4000-a000-7057ff%' and s.user_id <> $1", [V]) !== 0
      || await one(db, "select count(*)::int from public.town_positions p where p.user_id::text like '000000c0-0000-4000-a000-7057ff%' and p.user_id <> $1", [V]) !== 0)
    fail('TS-1 CONTROL: a worker had a keepalive or a publish');
  // TS-2 TOWN VIEWED
  const me = first && first.me;
  const idle = await one(db, "select station_id from public.hr_town_stations where map_id = 'town_common' and role = 'idle'");
  if (!me || me.station !== idle || !Array.isArray(me.at)) fail('TS-2 the idle viewer is not on the idle station: ' + JSON.stringify(me));
  const pub = await as(db, V, "select public.hr_town_move(0, 'town_common', $1, $2, $1, $2, 's')", [SX, SY]);
  if (!pub || pub.stamped !== true) fail('TS-2 the viewer\'s publish was refused: ' + JSON.stringify(pub));
  const seen = await view(db, U(1), 0, W.x, W.y);
  const vw = seen && (seen.walkers || []).find((w) => w.id === V && w.slot === 0);
  if (!vw || vw.x !== SX || vw.y !== SY) fail('TS-2 another player does not see the viewer on its steered tile: ' + JSON.stringify(vw));
  /* a walker's LOOK (name, level, role, outfit) is read once a minute, not every read: a rename shows after it */
  await db.query("update public.profiles set display_name = 'Renamed Six' where id = $1", [V]);
  const cached = await view(db, U(1), 0, W.x, W.y);
  const cw = cached && (cached.walkers || []).find((w) => w.id === V && w.slot === 0);
  await db.query("update public.town_bodies set look_at = now() - interval '61 seconds' where user_id = $1", [V]);
  const fresh = await view(db, U(1), 0, W.x, W.y);
  const fw = fresh && (fresh.walkers || []).find((w) => w.id === V && w.slot === 0);
  if (!cw || cw.name !== 'Stand 6' || !fw || fw.name !== 'Renamed Six')
    fail('TS-2 a walker\'s look is not the minute-old one, then the new one: ' + JSON.stringify(cw && cw.name) + ' then ' + JSON.stringify(fw && fw.name));
  await work(db, V, 0, 'artisan', 'cook_shrimp');
  const moved = await view(db, V, 0, W.x, W.y);      // its own pending change first: `me` is its new stand at once
  const cook = await one(db, "select public.hr_town_station_for('town_common', 'artisan', 'cook_shrimp')");
  const vb = await standOf(db, V, 0);
  if (!moved.me || moved.me.station !== cook || moved.me.work !== true || !vb || vb.from_x !== SX || vb.from_y !== SY)
    fail('TS-2 a new activity did not move the viewer\'s stand to ' + cook + ' walking from where it stood: ' + JSON.stringify(moved.me) + ' ' + JSON.stringify(vb));
  const go = await as(db, V, 'select public.hr_town_go(0, $1)', [counter]);
  const back = await as(db, V, 'select public.hr_town_go(0, null)');
  const refused = await as(db, V, "select public.hr_town_go(0, $1)", [cook]);
  if (!go || !go.me || go.me.station !== counter || !back || !back.me || back.me.station !== cook || !refused || refused.error !== 'unknown_station')
    fail('TS-2 hr_town_go: counter ' + JSON.stringify(go && go.me) + ', back ' + JSON.stringify(back && back.me) + ', a work station ' + JSON.stringify(refused));
  // TS-3 OUT AND BACK (a parked hero: U(1) slot 1, idle, kept alive by hr_town_here)
  const P = U(1);
  const here = await as(db, P, "select public.hr_town_here(1, 'town_common')");
  if (!here || !here.me || here.me.station !== idle) fail('TS-3 a parked idle hero is not on the idle station: ' + JSON.stringify(here));
  const c1 = await view(db, V, 0, I.x, I.y);          // the viewer looks at the square, where the parked hero stands
  const inst = await one(db, 'select gen_random_uuid()');
  await db.query("insert into public.hunt_instances (id, hunt_id, settled_to, next_swing_at) values ($1, 'mill_cellar', now(), now())", [inst]);
  await db.query("insert into public.hunt_sessions (id, user_id, slot, hunt_id, entered_at, hunt_from, settled_to, next_swing_at, instance_id) values (gen_random_uuid(), $1, 1, 'mill_cellar', now(), now(), now(), now(), $2)", [P, inst]);
  await db.query("select public.hr_hunt_point($1, 1, 'mill_cellar')", [P]);
  const refusedHere = await as(db, P, "select public.hr_town_here(1, 'town_common')");
  if (!refusedHere || refusedHere.error !== 'hunting') fail('TS-3 a hunting hero was answered present: ' + JSON.stringify(refusedHere));
  await view(db, V, 0, I.x, I.y, c1.cursor, I.x, I.y);   // applies the hunt-start note after its read
  const c2 = await view(db, V, 0, I.x, I.y, c1.cursor, I.x, I.y);
  if (!c2 || c2.full !== false || !(c2.gone || []).some((g) => g.id === P && g.slot === 1)) fail('TS-3 the hunter is not gone from a delta read: ' + JSON.stringify(c2).slice(0, 300));
  await db.query("update public.hunt_sessions set ended_at = now(), end_reason = 'left' where user_id = $1 and slot = 1 and ended_at is null", [P]);
  await db.query('select public.hr_hunt_point($1, 1, null)', [P]);
  const home = await as(db, P, "select public.hr_town_here(1, 'town_common')");
  const arrive = await one(db, "select public.hr_town_station_for('town_common', 'combat', 'mill_cellar')");
  if (!home || !home.me || home.me.station !== arrive) fail('TS-3 back from its hunt the hero is not on the arrival (' + arrive + '): ' + JSON.stringify(home));
  const c3 = await view(db, V, 0, A.x, A.y, c2.cursor, I.x, I.y);   // ...then pans to the gate
  if (!(c3.walkers || []).some((w) => w.id === P && w.slot === 1)) fail('TS-3 the hero back from its hunt is not in the next delta: ' + JSON.stringify(c3).slice(0, 300));
  await new Promise((r) => setTimeout(r, 6000));      // past the commit slack: nothing changed since c3
  for (let i = 1; i <= 5; i++) await as(db, U(i), "select public.hr_town_here(0, 'town_common')");   // keepalives move nothing
  await as(db, P, "select public.hr_town_here(1, 'town_common')");
  /* a cursor re-reads what changed in the 5 s slack before it (commit order), so the read after the next one is the empty one */
  const c4 = await view(db, V, 0, A.x, A.y, c3.cursor, A.x, A.y);
  const c5 = await view(db, V, 0, A.x, A.y, c4.cursor, A.x, A.y);
  if (!c5 || c5.full !== false || (c5.walkers || []).length || (c5.gone || []).length) fail('TS-3 a delta six seconds after the last change is not empty: ' + JSON.stringify(c5).slice(0, 300));
  return fails;
}

const pct = (xs, p) => { const s = xs.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

async function load(db) {
  /* a probe town of 300 stands in a 20 x 15 block (inside one viewer's window); 120 players of 2 heroes an instance for the measure */
  await db.query("insert into public.hr_town_maps (map_id, zone_id, w, h, players, heroes, view_w, view_h, margin, view_cap, main) values ('zz_load', 'zz_load', 40, 40, 120, 2, 22, 14, 8, 120, false) on conflict (map_id) do nothing");
  await db.query("insert into public.hr_town_stations (map_id, station_id, role, face_x, face_y, ord) values ('zz_load', 'zz_square', 'idle', null, null, 1) on conflict do nothing");
  await db.query("insert into public.hr_town_stands (map_id, station_id, stand_no, x, y, dir, overflow) select 'zz_load', 'zz_square', g + 1, 2 + g % 20, 2 + g / 20, 's', false from generate_series(0, 299) g on conflict do nothing");
  const N = 120;
  await people(db, N, [0, 1]);
  const t0 = Date.now();
  for (let i = 1; i <= N; i++) for (const slot of [0, 1]) await as(db, U(i), "select public.hr_town_here($1, 'zz_load')", [slot]);
  const placeMs = (Date.now() - t0) / (2 * N);
  const bodies = await one(db, "select count(*)::int from public.town_bodies where map_id = 'zz_load' and station_id is not null");
  const insts = await one(db, "select count(distinct inst)::int from public.town_bodies where map_id = 'zz_load' and station_id is not null");
  const full = [], delta = [], fullB = [], deltaB = [];
  const cursors = new Map();
  const keepalive = async () => { for (let i = 1; i <= N; i++) for (const slot of [0, 1]) await db.query("insert into public.town_seen (user_id, slot, seen_at) values ($1, $2, now()) on conflict (user_id, slot) do update set seen_at = now()", [U(i), slot]); };
  for (let round = 0; round < 6; round++) {
    await db.query('delete from public.hr_rate_counters');
    await keepalive();
    /* 12 heroes walk this tick (a steered publish each) */
    for (let k = 0; k < 12; k++) {
      const i = 1 + ((round * 12 + k) % N);
      await as(db, U(i), "select public.hr_town_move(0, 'zz_load', $1, $2, $1, $2, 's')", [2 + ((round + k) % 20), 2 + ((round * 3 + k) % 12)]);
    }
    for (let v = 1; v <= 60; v++) {
      const c = cursors.get(v) || null;
      const t = performance.now();
      const ans = await view(db, U(v), 0, 12, 9, c, c ? 12 : null, c ? 9 : null, 'zz_load');
      const ms = performance.now() - t;
      const bytes = Buffer.byteLength(JSON.stringify(ans));
      if (!ans || ans.ok !== true) throw new Error('LOAD: a read failed: ' + JSON.stringify(ans).slice(0, 200));
      (ans.full ? full : delta).push(ms);
      (ans.full ? fullB : deltaB).push(bytes);
      cursors.set(v, ans.cursor);
    }
  }
  return { bodies, insts, placeMs, full, delta, fullB, deltaB };
}

/* ── THE MUTANTS: each plants one defect in the migration (the chain replays to it); a rule or its §6 must go red. ── */
const MUTANTS = [
  ['a hunter keeps its stand', "      perform public.hr_town_release(r.user_id, r.slot);\n      delete from public.town_seen where user_id = r.user_id and slot = r.slot;", '      null;'],
  ['a worker is not drawn without a keepalive', "     and (public.hr_town_work_kind(p_kind) or coalesce(p_seen > now() - interval '30 seconds', false))", "     and coalesce(p_seen > now() - interval '30 seconds', false)"],
  ['a delta is answered whole', "  v_full := v_cur is null or v_cur < v_now - c_full_after or v_cur > v_now + interval '1 second';", '  v_full := true;'],
  ['the gone are never told', "                       where v_since is not null and not (s.shown and s.inside)", "                       where false and not (s.shown and s.inside)"],
  ['a delta reads every body again', "         where v_since is null or t.changed > v_since or (t.inside and not t.was_inside)", "         where true or t.changed > v_since or (t.inside and not t.was_inside)"],
  ['a peer\'s look is never re-read', "        where t.look is null or t.look_at < v_now - interval '60 seconds'", "        where t.look is null"],
  ['the arrival is ignored', "        perform public.hr_town_place(r.user_id, r.slot, p_map, v_from, 'arrive', r.ended_at);", "        perform public.hr_town_place_pointer(r.user_id, r.slot, p_map);"],
  ['a full station skips its fallback', "when s.station_id = v_fallback then 1 when st.role = 'bench' then 2 else 3 end", "when st.role = 'bench' then 2 else 3 end"],
  ['the live town is not set down first (production 10-26)', "    perform public.hr_town_moves_settle(v_live, 100000);\n    if exists", "    if false and exists"],
  ['hr_town_go takes a work station', "s.role in ('visit', 'idle', 'bench')) then", "s.role in ('visit', 'idle', 'bench', 'work')) then"],
];
/* ...and in the next generated catalogue (TS-4): [name, file, from, to]. A regenerated catalogue keeps these lines
   (tools/gen-town-stations.mjs writes them); a new OUT_FILE moves the file named here (the harness refuses a mismatch). */
const NEXT_MUTANTS = [
  ['a released worker is not noted again', 'supabase/migrations/2027-01-29-havora-stations.generated.sql',
    "       where ps.active_kind in ('gather', 'artisan', 'training')", "       where false and ps.active_kind in ('gather', 'artisan', 'training')"],
  ['a body is left on a stand the catalogue lacks', 'supabase/migrations/2027-01-29-havora-stations.generated.sql',
    '       where b.station_id is not null\n         and not exists', '       where false and b.station_id is not null\n         and not exists'],
];
/* every mutant as [name, migration file, from, to] */
const ALL_MUTANTS = MUTANTS.map(([n, f, t]) => [n, FILE, f, t]).concat(NEXT_MUTANTS.map(([n, p, f, t]) => [n, p.split('/').pop(), f, t]));

async function main() {
  /* AN EMPTY EVENT LOOP BEFORE THE VERDICT IS RED: a query that never settles must not let node exit 0 mid-run */
  process.on('beforeExit', () => { console.log('  ✗ town-stands stopped before its verdict (a query never settled)'); process.exit(1); });
  if (NEXT_MUTANTS.some(([, p]) => !p.endsWith('/' + NEXT))) { console.log('harness: NEXT_MUTANTS name a file that is not the generator\'s OUT_FILE ' + NEXT); process.exit(2); }
  const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
  /* ONE MUTANT, IN ITS OWN PROCESS (the parent's --mutate spawns this): exit 0 caught, 10 escaped, 20 a harness fault */
  if (process.argv.includes('--mutant')) {
    const [name, mig, from, to] = ALL_MUTANTS[Number(process.argv[process.argv.indexOf('--mutant') + 1])];
    const src = (await readFile(join(ROOT, 'supabase/migrations', mig), 'utf8')).replace(/\r\n/g, '\n');
    if (src.split(from).length !== 2) { console.log('harness: anchor matches ' + (src.split(from).length - 1) + ' times'); process.exit(20); }
    let fails;
    const patches = new Map([[mig, [[from, to]]]]);
    try {
      fails = mig === FILE ? [...await rules((await bootReplay({ patches, upTo: FILE })).db), ...await liveTown(patches)]
        : [...await nextCatalogue(patches)];
    }
    catch (e) {
      /* a HARNESS fault (the anchor moved, the patch did not land) proves nothing: red, never "caught" */
      if (e && e.harness) { console.log('harness: ' + String(e.message).split('\n')[0]); process.exit(20); }
      fails = ['replay refused it: ' + String(e.message).split('\n')[1]];
    }
    console.log(fails.length ? fails[0].slice(0, 90) : 'NOT caught: ' + name);
    process.exit(fails.length ? 0 : 10);
  }
  if (process.argv.includes('--mutate')) {
    const clean = await rules((await bootReplay()).db);
    if (clean.length) { console.log('  ✗ clean control RED: ' + clean.join('; ')); process.exit(1); }
    console.log('  ✓ clean control green');
    /* the chain up to the migration under test, on disk once, so every mutant's process restores it instead of replaying it */
    await bootReplay({ upTo: '2027-01-26-town-stations.generated.sql' });
    const { spawnSync } = await import('node:child_process');
    let bad = 0, ran = 0;
    for (const [i, [name]] of ALL_MUTANTS.entries()) {
      if (only && !name.includes(only)) continue;
      ran++;
      const r = spawnSync(process.execPath, [join(ROOT, 'tests', 'town-stands.mjs'), '--mutant', String(i)], { encoding: 'utf8', timeout: 900000 });
      const said = String(r.stdout || '').trim().split('\n').pop() || String(r.stderr || '').trim().split('\n').pop() || '';
      if (r.status === 0) console.log('  ✓ ' + name + ' — caught (' + said + ')');
      else { console.log('  ✗ ' + name + ' — ' + (r.status === 10 ? 'NOT caught' : 'harness (exit ' + r.status + '): ' + said)); bad++; }
    }
    console.log(bad || !ran ? 'town-stands --mutate: ' + bad + ' escaped of ' + ran : 'town-stands --mutate: ' + ran + '/' + ran + ' mutants caught');
    if (!ran) bad = 1;
    process.exit(bad ? 1 : 0);
  }
  const { db } = await bootReplay();
  const fails = [...await rules(db), ...await liveTown(null), ...await nextCatalogue()];
  for (const f of fails) console.log('  ✗ ' + f);
  if (process.argv.includes('--load')) {
    const { db: ldb } = await bootReplay();
    const L = await load(ldb);
    const f = (xs) => xs.length ? 'p50 ' + pct(xs, 0.5).toFixed(1) + ' ms, p95 ' + pct(xs, 0.95).toFixed(1) + ' ms (n ' + xs.length + ')' : 'none';
    const kb = (xs) => xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length / 1024).toFixed(1) + ' KB' : '-';
    console.log('  load: ' + L.bodies + ' bodies in ' + L.insts + ' instance(s); placement ' + L.placeMs.toFixed(1) + ' ms a body');
    console.log('  load: full read ' + f(L.full) + ', ' + kb(L.fullB) + ' a read');
    console.log('  load: delta read ' + f(L.delta) + ', ' + kb(L.deltaB) + ' a read (12 walkers a tick)');
    const all = L.full.concat(L.delta);
    console.log('  load: 60 viewers x every 2 s = 30 reads/s needs < 33 ms a read on one backend; measured mean ' + (all.reduce((a, b) => a + b, 0) / all.length).toFixed(1) + ' ms (PGlite WASM, one backend)');
  }
  console.log(fails.length ? 'town-stands: ' + fails.length + ' rule(s) RED'
    : 'town-stands: closed-browser workers on their stands, never two on one; the viewed hero placed, steered, moved and sent to a counter; a hunt out (gone) and back (the arrival); an empty delta is empty');
  process.exit(fails.length ? 1 : 0);
}

if (isMain(import.meta.url)) main();
