#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/town-walk-mask.mjs — A HERO IN TOWN STANDS ONLY WHERE A HERO CAN STAND, ON A REAL DATABASE.
//
//   node tests/town-walk-mask.mjs            the rules, on the whole replayed chain (PGlite, real PostgreSQL)
//   node tests/town-walk-mask.mjs --mutate   every planted defect must be refused, each for its own reason
//
// mutant-anchors: supabase/migrations/2027-04-02-town-walk-mask.sql, supabase/migrations/2027-04-02-town-walk-mask.generated.sql
//
// Architecture audit 2026-11-09 F10: hr_town_move stored any tile inside the map's rectangle, so a forged
// client could stand in a wall in front of every viewer. The server now holds the town's walk mask
// (tools/gen-town-walk.mjs, from the map the World draws) and refuses a tile off it. The migrations prove
// their contract in one transaction; this plays it call by call on a committed database, as two players:
//   TM-1  PARITY, EVERY TILE: what the server answers for each of a town map's tiles is what the World's
//         compiled map says (open, and walked to from the start). One wrong bit is red, by its tile
//   TM-2  ANOTHER PLAYER SEES ONLY AN HONEST TILE: a hero's honest publish is what a second player reads; its
//         publish INTO A WALL is refused off_mask, journalled (hr_rejections, verb town_move), and the second
//         player still reads the hero on the honest tile; a blocked tile to WALK TO is refused the same way
//   TM-3  EVERY STAND THE SERVER HOLDS IS ON THE MASK (a hero set down by the server can always say so)
//   TM-4  A TOWN WITH NO MASK TAKES NO POSITION: catalogue_missing, journalled, nothing stored
//   TM-5  THE CHAIN'S END: the hr_town_move the database ends with still asks the mask and still records its
//         rate refusal (a later file that restates it from an older image loses both; red here by name)
//   TM-6  THE GENERATED FILE IS WHAT THE MAPS GENERATE (tools/gen-town-walk.mjs --check)
// ════════════════════════════════════════════════════════════════════════
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { bootReplay, ROOT } from './schema-replay.mjs';
import { isMain } from './_is-main.mjs';
import { OUT_FILE as MASK, walkMask } from '../tools/gen-town-walk.mjs';
import { compiledFrom } from '../tools/gen-town-stations.mjs';

const FILE = '2027-04-02-town-walk-mask.sql';
const PREV = '2027-04-02-rate-refusals-recorded.sql';   // the last file before the pair (the mutants' shared prefix)
const U = (i) => '000000c0-0000-4000-a000-00402b' + String(i).padStart(6, '0');

/* As `authenticated`, each call its OWN transaction (the real clock moves between calls). */
async function as(db, uid, sql, params) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: uid, role: 'authenticated' })]);
  await db.exec('set role authenticated');
  try { const r = (await db.query(sql, params)).rows[0]; return r ? Object.values(r)[0] : undefined; }
  finally { await db.exec('reset role'); }
}
const rows = async (db, sql, params) => (await db.query(sql, params)).rows;
const one = async (db, sql, params) => { const r = (await db.query(sql, params)).rows[0]; return r ? Object.values(r)[0] : undefined; };

async function person(db, i) {
  const uid = U(i);
  await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [uid]);
  await db.query('insert into public.profiles (id, display_name) values ($1, $2) on conflict (id) do update set display_name = excluded.display_name', [uid, 'Mask Probe ' + i]);
  await db.query("insert into public.hr_access_allowlist (user_id, note) values ($1, 'town-walk-mask test') on conflict (user_id) do nothing", [uid]);
  const c = await as(db, uid, 'select public.hr_create_character(0)');
  if (!c || c.ok !== true) throw new Error('HARNESS: hr_create_character refused: ' + JSON.stringify(c));
  await db.query("update public.player_state set active_kind = 'idle', active_id = null where user_id = $1", [uid]);
  return uid;
}
const stored = (db, uid) => rows(db, 'select x, y, gx, gy from public.town_positions where user_id = $1 and slot = 0', [uid]);
const journal = (db, uid, code) => rows(db, 'select slot, n::int as n, verbs, last_detail from public.hr_rejections where user_id = $1 and code = $2', [uid, code]);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

export async function rules(db) {
  const fails = [];
  const no = (m) => fails.push(m);
  await db.query("insert into public.hr_flags (key, enabled, note) values ('town_presence', true, 'town-walk-mask test') on conflict (key) do update set enabled = true");
  const compiled = await compiledFrom(ROOT);
  const towns = (await import(pathToFileURL(join(ROOT, 'src', 'data', 'world', 'maps', 'index.js')).href)).WORLD_MAPS.filter((m) => m.kind === 'town');
  const served = await rows(db, 'select map_id, w, h, main from public.hr_town_maps order by map_id');

  // TM-1 ─ parity, every tile
  if (!served.length || served.length !== towns.length) no('TM-1: the server holds ' + served.length + ' town map(s), the World ' + towns.length);
  for (const t of served) {
    const m = compiled(t.map_id);
    const want = Array.from(walkMask(m)).join('');
    const got = await one(db, `select string_agg(case when public.hr_town_walk_ok($1, x, y, x, y) then '1' else '0' end, '' order by y, x)
                                 from generate_series(0, $2::int - 1) x, generate_series(0, $3::int - 1) y`, [t.map_id, t.w, t.h]);
    if (t.w !== m.w || t.h !== m.h) { no(`TM-1: ${t.map_id} is ${t.w}x${t.h} on the server and ${m.w}x${m.h} in the World`); continue; }
    if (got !== want) {
      let i = 0; while (i < want.length && got && got[i] === want[i]) i++;
      no(`TM-1: ${t.map_id} tile (${i % m.w}, ${Math.floor(i / m.w)}) reads ${got ? got[i] : 'nothing'} on the server and ${want[i]} in the World (${want.split('1').length - 1} open tiles there)`);
    }
    if (!want.includes('1') || !want.includes('0')) no(`TM-1: ${t.map_id}'s mask is all one value: the parity proves nothing`);
  }

  const town = served.find((t) => t.main) || served[0];
  const m = compiled(town.map_id);
  const bits = walkMask(m);
  const at = (i) => [i % m.w, Math.floor(i / m.w)];
  /* two honest tiles next to each other, and a blocked tile beside an open one (a wall a hero could step into) */
  let honest = null, wall = null;
  for (let i = 0; i < bits.length - 1 && !(honest && wall); i++) {
    const x = i % m.w;
    if (x === m.w - 1) continue;
    if (!honest && bits[i] && bits[i + 1]) honest = [at(i), at(i + 1)];
    if (!wall && bits[i] && !bits[i + 1]) wall = [at(i), at(i + 1)];
  }
  if (!honest || !wall) { no('TM-2: HARNESS: the town gives no pair of open tiles or no wall'); return fails; }

  // TM-2 ─ another player sees only an honest tile
  const a = await person(db, 1), b = await person(db, 2);
  const view = (uid, c) => as(db, uid, 'select public.hr_town_view(0, $1, $2, $3, null, null, null)', [town.map_id, c[0], c[1]]);
  await view(a, honest[0]); await view(b, honest[0]);   // each is set down on its stand by its first read
  let v = await as(db, a, "select public.hr_town_move(0, $1, $2, $3, $4, $5, 'e')", [town.map_id, ...honest[0], ...honest[1]]);
  if (!v || v.ok !== true || v.stamped !== true) no('TM-2: an honest publish answered ' + JSON.stringify(v));
  const seenAt = async () => {
    const r = await view(b, honest[0]);
    const w = r && Array.isArray(r.walkers) ? r.walkers.find((x) => x.id === a) : null;
    return w ? [w.x, w.y] : null;
  };
  await pause(300);
  let seen = await seenAt();
  if (!seen || seen[0] !== honest[0][0] || seen[1] !== honest[0][1]) no('TM-2: the second player reads the hero at ' + JSON.stringify(seen) + ', not on its honest tile ' + JSON.stringify(honest[0]));
  const before = JSON.stringify(await stored(db, a));
  v = await as(db, a, "select public.hr_town_move(0, $1, $2, $3, $2, $3, 'e')", [town.map_id, ...wall[1]]);
  if (!v || v.ok !== false || v.error !== 'off_mask') no('TM-2: a publish into the wall at ' + JSON.stringify(wall[1]) + ' answered ' + JSON.stringify(v));
  if (JSON.stringify(await stored(db, a)) !== before) no('TM-2: a refused publish changed the stored tile: ' + JSON.stringify(await stored(db, a)));
  seen = await seenAt();
  if (!seen || seen[0] !== honest[0][0] || seen[1] !== honest[0][1]) no('TM-2: after the refused publish the second player reads the hero at ' + JSON.stringify(seen) + ' (a wall tile reached another player)');
  let j = await journal(db, a, 'off_mask');
  if (j.length !== 1 || j[0].n !== 1 || j[0].slot !== 0 || !j[0].verbs || j[0].verbs.town_move !== 1) no('TM-2: the refusal is not journalled as one town_move row: ' + JSON.stringify(j));
  v = await as(db, a, "select public.hr_town_move(0, $1, $2, $3, $4, $5, 'e')", [town.map_id, ...wall[0], ...wall[1]]);
  if (!v || v.error !== 'off_mask') no('TM-2: an open tile to stand on with a wall to walk to answered ' + JSON.stringify(v));
  if (JSON.stringify(await stored(db, a)) !== before) no('TM-2: a refused goal changed the stored tile');
  j = await journal(db, a, 'off_mask');
  if (!j[0] || j[0].n !== 2) no('TM-2: the second refusal is not counted on the day\'s row: ' + JSON.stringify(j));
  await pause(300);
  v = await as(db, a, "select public.hr_town_move(0, $1, $2, $3, $2, $3, 'e')", [town.map_id, ...honest[1]]);
  if (!v || v.stamped !== true) no('TM-2: an honest publish after two refusals answered ' + JSON.stringify(v) + ' (a refusal must not lock a hero out)');

  // TM-3 ─ every stand is on the mask
  const off = await rows(db, 'select s.map_id, s.station_id, s.x, s.y from public.hr_town_stands s where public.hr_town_walk_ok(s.map_id, s.x, s.y, s.x, s.y) is not true limit 5');
  const stands = await one(db, 'select count(*)::int from public.hr_town_stands');
  if (off.length || !stands) no('TM-3: ' + (stands ? off.length + ' stand(s) are off the mask: ' + JSON.stringify(off) : 'no stand was read'));

  // TM-5 ─ the chain's end
  const body = await one(db, "select prosrc from pg_proc where oid = 'public.hr_town_move(integer,text,integer,integer,integer,integer,text)'::regprocedure");
  if (!/hr_town_walk_ok\(p_map, p_x, p_y, p_gx, p_gy\)/.test(body) || !/'off_mask'/.test(body)) no('TM-5: the hr_town_move the chain ends with no longer asks the walk mask');
  if (!/hr_rate_refused\(v_uid, p_slot, 'town_move'/.test(body)) no('TM-5: the hr_town_move the chain ends with no longer records its rate refusal');

  // TM-4 ─ a town with no mask takes no position (last: it removes the mask from this database)
  await db.query('delete from public.hr_town_walk where map_id = $1', [town.map_id]);
  await pause(300);
  const kept = JSON.stringify(await stored(db, a));
  v = await as(db, a, "select public.hr_town_move(0, $1, $2, $3, $2, $3, 'e')", [town.map_id, ...honest[0]]);
  if (!v || v.ok !== false || v.error !== 'catalogue_missing') no('TM-4: a town with no mask answered ' + JSON.stringify(v) + ' (a position was taken unchecked)');
  if (JSON.stringify(await stored(db, a)) !== kept) no('TM-4: a town with no mask stored a tile');
  j = await journal(db, a, 'catalogue_missing');
  if (j.length !== 1 || !j[0].verbs || j[0].verbs.town_move !== 1) no('TM-4: the missing mask is not journalled: ' + JSON.stringify(j));
  return fails;
}

/* ── THE MUTANTS: each plants one defect; the replay (a self-check) or a rule must refuse it FOR ITS REASON. ── */
export const MUTANTS = [
  { name: 'a wall to stand in is taken', file: 'supabase/migrations/' + FILE,
    from: "  if not v_on then return public.hr_note_rejection('town_move', v_slot, jsonb_build_object('ok', false, 'error', 'off_mask'",
    to: "  if false then return public.hr_note_rejection('town_move', v_slot, jsonb_build_object('ok', false, 'error', 'off_mask'",
    expect: '§2(c): a publish on the blocked tile' },
  { name: 'only the tile stood on is asked, not the tile walked to', file: 'supabase/migrations/' + FILE,
    from: '  v_on := public.hr_town_walk_ok(p_map, p_x, p_y, p_gx, p_gy);', to: '  v_on := public.hr_town_walk_ok(p_map, p_x, p_y, p_x, p_y);',
    expect: '§2(d): a blocked goal answered' },
  { name: 'the off-mask refusal is not journalled', file: 'supabase/migrations/' + FILE,
    from: "  if not v_on then return public.hr_note_rejection('town_move', v_slot, jsonb_build_object('ok', false, 'error', 'off_mask', 'detail', jsonb_build_array(p_x, p_y, p_gx, p_gy))); end if;",
    to: "  if not v_on then return jsonb_build_object('ok', false, 'error', 'off_mask'); end if;",
    expect: '§2(c): the refusal is not journalled' },
  { name: 'a town with no mask takes any tile', file: 'supabase/migrations/' + FILE,
    from: "  if v_on is null then return public.hr_note_rejection('town_move', v_slot, jsonb_build_object('ok', false, 'error', 'catalogue_missing'",
    to: "  if false then return public.hr_note_rejection('town_move', v_slot, jsonb_build_object('ok', false, 'error', 'catalogue_missing'",
    expect: '§2(f): a town with no mask answered' },
  { name: 'the body changes outside the marked lines (the hunting check is gone)', file: 'supabase/migrations/' + FILE,
    from: "    delete from public.town_positions where user_id = v_uid and slot = v_slot;\n    return jsonb_build_object('ok', false, 'error', 'hunting'); end if;",
    to: "    return jsonb_build_object('ok', true, 'stamped', false); end if;",
    expect: '§2(g): hr_town_move is not this file\'s image' },
  { name: 'the reader reads the mask transposed', file: 'supabase/migrations/' + MASK,
    from: 'else get_bit(m.mask, p_y * m.w + p_x) = 1 and get_bit(m.mask, p_gy * m.w + p_gx) = 1 end', to: 'else get_bit(m.mask, p_x * m.h + p_y) = 1 and get_bit(m.mask, p_gx * m.h + p_gy) = 1 end',
    expect: 'town-walk:' },
  { name: 'the mask is left readable by clients', file: 'supabase/migrations/' + MASK,
    from: 'revoke all on public.hr_town_walk from public, anon, authenticated, service_role;', to: 'revoke all on public.hr_town_walk from public, anon;',
    expect: 'holds a privilege on hr_town_walk' },
  { name: 'the reader is left open to clients', file: 'supabase/migrations/' + MASK,
    from: 'revoke all on function public.hr_town_walk_ok(text, integer, integer, integer, integer) from public, anon, authenticated, service_role;', to: '',
    expect: 'can execute hr_town_walk_ok' },
];

async function main() {
  /* AN EMPTY EVENT LOOP BEFORE THE VERDICT IS RED: a query that never settles must not let node exit 0 mid-run */
  process.on('beforeExit', () => { console.log('  ✗ town-walk-mask stopped before its verdict (a query never settled)'); process.exit(1); });
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
    /* the chain up to the files under test, on disk once, so every mutant's process restores it instead of replaying it */
    await bootReplay({ upTo: PREV });
    let bad = 0, ran = 0;
    for (const [i, mu] of MUTANTS.entries()) {
      if (only && !mu.name.includes(only)) continue;
      ran++;
      const r = spawnSync(process.execPath, [join(ROOT, 'tests', 'town-walk-mask.mjs'), '--mutant', String(i)], { encoding: 'utf8', timeout: 900000 });
      const said = String(r.stdout || '').trim().split('\n').pop() || String(r.stderr || '').trim().split('\n').pop() || '';
      if (r.status === 0) console.log('  ✓ ' + mu.name + ' — caught (' + said + ')');
      else { console.log('  ✗ ' + mu.name + ' — ' + (r.status === 10 ? 'NOT caught' : r.status === 30 ? said : 'harness (exit ' + r.status + '): ' + said)); bad++; }
    }
    console.log(bad || !ran ? 'town-walk-mask --mutate: ' + bad + ' escaped of ' + ran : 'town-walk-mask --mutate: ' + ran + '/' + ran + ' mutants caught');
    if (!ran) bad = 1;
    process.exit(bad ? 1 : 0);
  }
  const { db } = await bootReplay();
  const fails = await rules(db);
  // TM-6 ─ the generated file is what the maps generate
  const g = spawnSync(process.execPath, [join(ROOT, 'tools', 'gen-town-walk.mjs'), '--check'], { encoding: 'utf8' });
  if (g.status !== 0) fails.push('TM-6: ' + String(g.stderr || g.stdout || '').trim().split('\n')[0]);
  for (const f of fails) console.log('  ✗ ' + f);
  console.log(fails.length ? 'town-walk-mask: ' + fails.length + ' rule(s) RED'
    : 'town-walk-mask: every tile reads as the World compiles it; a second player sees a hero only on an honest tile; a wall to stand in or walk to is refused off_mask and journalled; every stand is on the mask; a town with no mask takes no position');
  process.exit(fails.length ? 1 : 0);
}

if (isMain(import.meta.url)) main();
