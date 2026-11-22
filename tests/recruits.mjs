#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/recruits.mjs — ONE HERO FIRST, THEN THE RECRUITS IN ONE PRESS, PLAYED ON THE REPLAYED CHAIN (REAL POSTGRESQL).
//   (lane/c-recruits, 2026-11-22; Tyler RD-Q6 a: "One hero, then three recruits in one press at Level 5, near the first hero's Level";
//   supabase/migrations/1053-recruits.sql; the numbers, jobs and names are src/data/recruits.js through 1052-recruits-catalogue.generated.sql.)
//
// Real players through the client's own doors: hr_create_hero for the first hero, the envelope's `recruits` section (hr_load), and the
// press hr_recruit_company. The first hero's Level is set as its hunts would leave it (level_xp), the one fixture shortcut.
//   RC-DATA    the server's catalogue is src/data/recruits.js: the rules, the jobs in order, the names
//   RC-PLAY    one hero: the section offers the press, not ready, and the press refuses; at Level 5 the section says ready, the Level and
//              the jobs; ONE press makes three heroes in the empty slots at Level 5, each named (the typed name kept, the others the town's),
//              each wearing its job's set with the hero kit in its bag and loading into the world; one ledger row a recruit; the answer
//              carries the first hero's envelope with the offer gone, and every hero's section is null after it (the press is gone)
//   RC-RETRY   the same key again answers the first receipt and makes nothing; a new key is refused recruits_taken; still four heroes
//   RC-JOBS    the jobs follow the first hero's weapon (a shield hero gets a healer, a bow and a club), and a first hero far past the press's
//              Level brings recruits at max_level, never at its own
//   RC-TWO     an account of two heroes is never offered the press, and the press makes nothing for it
//
//   node tests/recruits.mjs            the guard
//   node tests/recruits.mjs --mutate   every planted defect must turn its own arm red (the migration's self-check blinded)
//
// mutant-anchors: supabase/migrations/1053-recruits.sql
// ci-step: db-replay | The recruit press: one hero first, three recruits in one press at Level 5, once an account (1053-recruits.sql)
// ci-run: node tests/recruits.mjs
// ci-run: node tools/mutant-gate.mjs node tests/recruits.mjs --mutate
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { bootReplay, closeReplays } from './schema-replay.mjs';
import { isMain } from './_is-main.mjs';
import { RECRUITS, RECRUIT_GIVEN, RECRUIT_FAMILY } from '../src/data/recruits.js';
import { STARTER_SETS, HERO_KIT } from '../src/data/start-kit.js';

const FILE = '1053-recruits.sql';
const COLORS = '{"head":1,"body":2,"legs":3,"feet":0}';

const one = async (db, sql, params = []) => { const r = await db.query(sql, params); return r.rows[0] ? Object.values(r.rows[0])[0] : null; };
async function as(db, uid, sql, params = []) {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid]);
  try { return await one(db, sql, params); } finally { await db.query(`select set_config('request.jwt.claim.sub', '', false)`); }
}
async function account(db, uid, note) {
  await db.query('insert into auth.users (id) values ($1) on conflict do nothing', [uid]);
  await db.query('insert into public.profiles (id) values ($1) on conflict do nothing', [uid]);
  await db.query('insert into public.hr_access_allowlist (user_id, note) values ($1, $2) on conflict do nothing', [uid, note]);
}
const first = (db, uid, set, name) => as(db, uid, `select public.hr_create_hero(0, $1, '${COLORS}'::jsonb, gen_random_uuid(), $2)`, [name, set]);
const atLevel = (db, uid, level, slot = 0) => db.query('update public.player_state set level_xp = public.hr_char_xp_for_level($3) where user_id = $1 and slot = $2', [uid, slot, level]);
const section = async (db, uid, slot = 0) => { const e = await as(db, uid, 'select public.hr_load($1)', [slot]); return e && e.ok === true ? e.recruits : { load: e }; };
const press = (db, uid, names, key) => as(db, uid, 'select public.hr_recruit_company($1::text[], $2::uuid)', [names, key]);
const heroes = async (db, uid) => (await db.query(`select ps.slot, public.hr_level_of(ps.user_id, ps.slot) as level, n.name,
    (select pe.item_id from public.player_equipment pe where pe.user_id = ps.user_id and pe.slot = ps.slot and pe.equip_slot = 'weapon') as weapon
    from public.player_state ps left join public.character_names n on n.user_id = ps.user_id and n.slot = ps.slot where ps.user_id = $1 order by ps.slot`, [uid])).rows;
const weaponOf = (set) => STARTER_SETS[set][0];
const uidOf = (n) => '00000000-0000-4000-8000-0000000fc' + String(n).padStart(3, '0');

export async function rules(db) {
  const fails = [];
  const arm = (id, cond, msg) => { if (!cond) fails.push(id + ' ' + msg); };

  /* RC-DATA */
  const rule = (await db.query('select at_level, levels_under, max_level, recruit_count from public.hr_recruit_rules')).rows[0];
  arm('RC-DATA', rule && rule.at_level === RECRUITS.atLevel && rule.levels_under === RECRUITS.levelsUnder && rule.max_level === RECRUITS.maxLevel && rule.recruit_count === RECRUITS.count,
    'the server\'s rules are ' + JSON.stringify(rule));
  const jobs = (await db.query('select set_id from public.hr_recruit_jobs order by rank')).rows.map((r) => r.set_id);
  arm('RC-DATA', jobs.join() === RECRUITS.jobs.join(), 'the server\'s jobs are ' + JSON.stringify(jobs));
  const names = (await db.query("select string_agg(name, ',' order by name) filter (where part = 'given') g, string_agg(name, ',' order by name) filter (where part = 'family') f from public.hr_recruit_names")).rows[0];
  arm('RC-DATA', names.g === [...RECRUIT_GIVEN].sort().join() && names.f === [...RECRUIT_FAMILY].sort().join(), 'the server\'s names differ from the data');

  /* RC-PLAY */
  const A = uidOf(1);
  await account(db, A, 'recruits play');
  const made = await first(db, A, 'club', 'Recruitguard Ana');
  arm('RC-PLAY', made && made.ok === true, 'the first hero answered ' + JSON.stringify(made));
  const s1 = await section(db, A);
  arm('RC-PLAY', s1 && s1.ready === false && s1.at === RECRUITS.atLevel && JSON.stringify(s1.slots) === '[1,2,3]', 'a Level 1 hero\'s section reads ' + JSON.stringify(s1));
  const early = await press(db, A, null, '00000000-0000-4000-8000-00000000c001');
  arm('RC-PLAY', early && early.error === 'recruits_not_ready' && early.at === RECRUITS.atLevel && (await heroes(db, A)).length === 1,
    'a press under the Level answered ' + JSON.stringify(early));
  await atLevel(db, A, RECRUITS.atLevel);
  const s2 = await section(db, A);
  const want = Math.min(RECRUITS.maxLevel, RECRUITS.atLevel - RECRUITS.levelsUnder);
  arm('RC-PLAY', s2 && s2.ready === true && s2.level === want && JSON.stringify(s2.sets) === JSON.stringify(['tank', 'healer', 'ranger']),
    'a Level ' + RECRUITS.atLevel + ' Club hero\'s section reads ' + JSON.stringify(s2));
  const KEY = '00000000-0000-4000-8000-00000000c002';
  const r = await press(db, A, ['Recruitguard Bo', null, ''], KEY);
  arm('RC-PLAY', r && r.ok === true && Array.isArray(r.heroes) && r.heroes.length === 3 && r.level === want, 'the press answered ' + JSON.stringify(r && { ok: r.ok, error: r.error, heroes: r.heroes, level: r.level }));
  arm('RC-PLAY', r && r.envelope && r.envelope.ok === true && r.envelope.recruits === null, 'the answer\'s envelope reads recruits ' + JSON.stringify(r && r.envelope && r.envelope.recruits));
  const four = await heroes(db, A);
  arm('RC-PLAY', four.length === 4 && four.slice(1).every((h) => h.level === want), 'the company is ' + JSON.stringify(four));
  arm('RC-PLAY', four[1] && four[1].name === 'Recruitguard Bo' && four.slice(2).every((h) => typeof h.name === 'string' && h.name.length >= 3 && h.name !== 'Recruitguard Bo'),
    'the recruits are named ' + JSON.stringify(four.map((h) => h.name)));
  arm('RC-PLAY', four.slice(1).map((h) => h.weapon).join() === ['tank', 'healer', 'ranger'].map(weaponOf).join(), 'the recruits hold ' + JSON.stringify(four.map((h) => h.weapon)));
  for (const h of four.slice(1)) {
    const e = await as(db, A, 'select public.hr_load($1)', [h.slot]);
    arm('RC-PLAY', e && e.ok === true && e.recruits === null, 'recruit ' + h.slot + ' loads as ' + JSON.stringify(e && (e.ok ? { recruits: e.recruits } : e)));
    const bag = Object.fromEntries((await db.query('select item_id, qty from public.player_inventory where user_id = $1 and slot = $2', [A, h.slot])).rows.map((x) => [x.item_id, Number(x.qty)]));
    arm('RC-PLAY', Object.entries(HERO_KIT).every(([id, q]) => bag[id] === q), 'recruit ' + h.slot + '\'s bag holds ' + JSON.stringify(bag));
  }
  const led = Number(await one(db, "select count(*) from public.player_ledger where user_id = $1 and kind = 'admin' and intent = 'recruit' and (meta->>'level')::int = $2", [A, want]));
  arm('RC-PLAY', led === 3, 'the grant is journalled in ' + led + ' ledger rows');
  arm('RC-PLAY', (await section(db, A)) === null, 'the first hero is still offered the press: ' + JSON.stringify(await section(db, A)));

  /* RC-RETRY */
  const again = await press(db, A, ['Recruitguard Bo', null, ''], KEY);
  arm('RC-RETRY', again && again.ok === true && JSON.stringify(again.heroes) === JSON.stringify(r && r.heroes) && !('envelope' in again), 'the same key answered ' + JSON.stringify(again));
  const other = await press(db, A, null, '00000000-0000-4000-8000-00000000c003');
  arm('RC-RETRY', other && other.error === 'recruits_taken', 'a new key answered ' + JSON.stringify(other));
  arm('RC-RETRY', (await heroes(db, A)).length === 4 && Number(await one(db, "select count(*) from public.player_ledger where user_id = $1 and intent = 'recruit'", [A])) === 3,
    'a retried press changed the company: ' + JSON.stringify(await heroes(db, A)));

  /* RC-JOBS */
  const B = uidOf(2);
  await account(db, B, 'recruits jobs');
  await first(db, B, 'tank', 'Recruitguard Shield');
  await atLevel(db, B, 40);
  const sb = await section(db, B);
  arm('RC-JOBS', sb && JSON.stringify(sb.sets) === JSON.stringify(['healer', 'ranger', 'club']), 'a shield hero\'s recruits are ' + JSON.stringify(sb && sb.sets));
  arm('RC-JOBS', sb && sb.level === Math.min(RECRUITS.maxLevel, 40 - RECRUITS.levelsUnder), 'a Level 40 hero\'s recruits arrive at ' + JSON.stringify(sb && sb.level));
  const rb = await press(db, B, null, '00000000-0000-4000-8000-00000000c004');
  const late = await heroes(db, B);
  arm('RC-JOBS', rb && rb.ok === true && late.length === 4 && late.slice(1).every((h) => h.level === Math.min(RECRUITS.maxLevel, 40 - RECRUITS.levelsUnder)),
    'the late press made ' + JSON.stringify(late));

  /* RC-TWO */
  const C = uidOf(3);
  await account(db, C, 'recruits two');
  await as(db, C, 'select public.hr_create_character(0)');
  await as(db, C, 'select public.hr_create_character(1)');
  await db.query('update public.player_state set level_xp = public.hr_char_xp_for_level($2) where user_id = $1', [C, RECRUITS.atLevel]);
  const rc = await as(db, C, 'select public.hr_recruit_company(null::text[], gen_random_uuid())');
  arm('RC-TWO', (await one(db, 'select public.hr_recruit_offer($1)', [C])) === null && rc && rc.error === 'recruits_taken' && (await heroes(db, C)).length === 2,
    'a two-hero account answered ' + JSON.stringify(rc));
  return fails;
}

/* The migration's own self-check would refuse a planted defect first: each mutant blinds it, so this guard's arm is the one that names it. */
const BLIND = ["    -- (a) ONE HERO, LEVEL 1: the offer is there and not ready; the press refuses and makes nothing.\n",
  "    return;\n    -- (a) ONE HERO, LEVEL 1: the offer is there and not ready; the press refuses and makes nothing.\n"];
const MUTANTS = [
  ['the recruits arrive at Level 1 (RC-PLAY)', [BLIND, ['      update public.player_state set level_xp = v_xp, version = version + 1 where user_id = v_uid and slot = v_slot;\n', '']], 'RC-PLAY'],
  ['a typed name is dropped for the town\'s (RC-PLAY)', [BLIND, ['      v_name := v_names[v_i + 1]; v_canon := v_canons[v_i + 1];\n', '      v_name := null; v_canon := null;\n']], 'RC-PLAY'],
  ['the answer carries no envelope (RC-PLAY)', [BLIND, ["  return v_r || jsonb_build_object('envelope', public.hr_state_of(v_uid, v_first));", '  return v_r;']], 'RC-PLAY'],
  ['a retried key is not replayed (RC-RETRY)', [BLIND, ['  v_r := public.hr_intent_replay(v_uid, null, p_idem, c_verb);\n', '  v_r := null;\n']], 'RC-RETRY'],
  ['the jobs ignore the first hero\'s weapon (RC-JOBS)', [BLIND, ["order by coalesce(public.hr_recruit_set_role(j.set_id) = any (coalesce(v_roles, '{}'::text[])), false), j.rank)", 'order by j.rank)']], 'RC-JOBS'],
  ['a late press brings recruits at the first hero\'s Level (RC-JOBS)', [BLIND, ["    'level', greatest(1, least(r.max_level, v_lv - r.levels_under)),", "    'level', greatest(1, v_lv - r.levels_under),"]], 'RC-JOBS'],
];

async function boot(patch) {
  const r = await bootReplay(patch ? { patches: new Map([[FILE, patch]]), upTo: FILE } : {});
  return r.db || r;
}

async function main() {
  if (process.argv.includes('--mutate')) {
    let missed = 0;
    for (const [name, patch, expect] of MUTANTS) {
      let fails;
      try { fails = await rules(await boot(patch)); } catch (e) { if (e && e.harness) throw e; fails = ['replay: ' + String(e && e.message).split('\n')[0]]; }
      await closeReplays();
      const caught = fails.some((f) => f.startsWith(expect));
      console.log((caught ? '  ✓ ' : '  ✗ MISSED ') + name + (caught ? '' : ' (' + fails.join(' | ') + ')'));
      if (!caught) missed++;
    }
    console.log(missed ? 'recruits --mutate: ' + missed + ' MISSED' : 'recruits --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' caught, each by its own arm');
    process.exit(missed ? 1 : 0);
  }
  const fails = await rules(await boot());
  await closeReplays();
  for (const f of fails) console.log('  ✗ ' + f);
  console.log(fails.length ? 'recruits: RED, ' + fails.length + ' finding(s)'
    : 'recruits: one hero first; at Level ' + RECRUITS.atLevel + ' one press makes ' + RECRUITS.count + ' recruits at that Level in the jobs the company lacks, named, kitted, journalled, once; a retried key replays');
  process.exit(fails.length ? 1 : 0);
}
if (isMain(import.meta.url)) {
  try { await main(); } catch (e) { console.error('recruits: HARNESS ' + (e && e.stack || e)); process.exit(2); }
}
