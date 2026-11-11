#!/usr/bin/env node
// tests/hunt-preset-read.mjs — ONE SAVED SETUP READ WHOLE, IN USE OR NOT (2027-04-13-hunt-preset-read.sql; the Hunt prep builder, Tyler 2026-11-11; CLAUDE.md §1, §6).
//
//   node tests/hunt-preset-read.mjs            the guard
//   node tests/hunt-preset-read.mjs --mutate   the proof: each SQL mutant turns it red
//
// THE MEASURE: the replayed chain (PGlite), one hero with two saved setups, asked as the signed-in player through the client door.
//   HPR-1 TWO SETUPS, EACH WHOLE: number 0 (not in use) and number 1 (in use) read back their own name, stance, target, distance, chase,
//         gold floor, and their own bars: each tablet's move or food with its conditions, a gap kept as a gap, a tablet switched Off kept Off;
//         `bar` is byte-for-byte the stored array; `slots` carries the server's display fields (mana, usable, count).
//   HPR-2 PARITY: for the setup in use, the read and hr_hunt_settings_view (the envelope's hunt_settings) answer the same seventeen keys.
//   HPR-3 UNSET = THE ROLE DEFAULT: a number nobody saved reads null name / bar / options / gear and, for stance, target, distance, chase and
//         gold floor, exactly what hr_hunt_role_default (2027-01-25-town-defaults.sql) and gold_floor_default say, named again in `defaults`.
//   HPR-4 OWN HERO ONLY: another signed-in account reads its own number, never this hero's; the signature carries no uuid and has no overload.
//   HPR-5 EVERY NUMBER THE DATA ALLOWS: src/data/rule-subjects.js ACTION_SET_LIMITS.presets is the server's hr_hunt_limit('presets'); every
//         number below it answers, the limit itself, a negative and a null are refused bad_preset, a bad slot bad_slot, signed out not_signed_in.
//   HPR-6 THE NAME CLAMP the builder renames through (hr_action_set_rename, hr_hunt_preset_rename): 25 characters and a control character refused
//         bad_preset_name, 24 kept and read back.
//   HPR-7 THE SHAPE: VOLATILE (PostgREST runs a STABLE RPC READ ONLY; the rate counter would refuse it), authenticated only, the projector
//         internal, the baseline row and the Game Master's door list it.
//   HPR-8 A READ WRITES NOTHING: the setup rows' clocks and the intent journal are as before.
//
// The mutants are SQL patched into the booted replay (the file's own §4 refuses most of them at apply time); their anchors are the landed bodies' text.
import { isMain } from './_is-main.mjs';
import { bootReplay } from './schema-replay.mjs';
import { ACTION_SET_LIMITS } from '../src/data/rule-subjects.js';

const A = '00000000-0000-4000-8000-0000b1d3a001';
const B = '00000000-0000-4000-8000-0000b1d3b001';
const idem = () => crypto.randomUUID();
const one = async (db, sql, params) => { const r = await db.query(sql, params); const row = r.rows[0]; return row ? row[Object.keys(row)[0]] : null; };
const KEYS = ['preset', 'role', 'discipline', 'target_mode', 'stance', 'distance', 'chase', 'gold_floor', 'supply_source', 'on_empty',
  'action_set', 'gather_share', 'stop_rules', 'grounds', 'slots', 'bar', 'options'];
const J = (x) => JSON.stringify(x === undefined ? null : x);

/* Run `fn` as one signed-in player, in one transaction (set_config(.., true) is transaction-local), with a fresh rate window. */
async function as(db, uid, fn) {
  await db.query('begin');
  try {
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
    if (uid) await db.query('delete from public.hr_rate_counters where user_id = $1', [uid]);
    const out = await fn();
    await db.query('commit');
    return out;
  } catch (e) { await db.query('rollback'); throw e; }
}
const read = (db, slot, preset) => one(db, 'select public.hr_hunt_preset_read($1, $2)', [slot, preset]);

/* One hero (A) with two setups: number 0 a move with one condition, a gap, a food switched Off; number 1 a food with two conditions. The hero ends on 1. */
async function seed(db) {
  for (const [uid, note] of [[A, 'hunt-preset-read A'], [B, 'hunt-preset-read B']]) {
    await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [uid]);
    await db.query('insert into public.hr_access_allowlist (user_id, note) values ($1, $2) on conflict (user_id) do nothing', [uid, note]);
  }
  const cat = {};
  await as(db, A, async () => {
    const c = await one(db, 'select public.hr_create_character(0)');
    if (!c || c.ok !== true) throw new Error('HARNESS: hr_create_character answered ' + J(c));
    await db.query("update public.player_state set active_kind = 'idle', active_id = null where user_id = $1 and slot = 0", [A]);
    cat.disc = await one(db, 'select w.discipline from public.hr_hunt_weapon_roles w where w.weapon_type = public.hr_hunt_weapon_of($1::uuid, 0)', [A]);
    cat.ab = await one(db, 'select ab.ability_id from public.hr_hunt_abilities ab where ab.active and ab.rune is null and $1 = any (ab.disciplines) order by ab.ability_id limit 1', [cat.disc]);
    /* a rune spell of any discipline: the bar may hold it, so the RUNE-SUPPLY branch of the mirror is walked by HPR-2 */
    cat.spell = await one(db, 'select ab.ability_id from public.hr_hunt_abilities ab where ab.active and ab.rune is not null order by ab.ability_id limit 1');
    cat.eat = await one(db, "select x.id from public.hr_hunt_action_ids x where x.type = 'consume' and not exists (select 1 from public.hr_hunt_basic_supplies q where q.basic_id = x.id) order by x.id limit 1");
    cat.mode0 = await one(db, 'select m.mode from public.hr_hunt_target_modes m order by m.mode limit 1');
    cat.mode1 = await one(db, 'select m.mode from public.hr_hunt_target_modes m order by m.mode offset 1 limit 1');
    cat.dmin = await one(db, "select public.hr_hunt_limit('distance_min')");
    cat.dmax = await one(db, "select public.hr_hunt_limit('distance_max')");
    cat.gmin = await one(db, "select public.hr_hunt_limit('gold_floor_min')");
    cat.lim = await one(db, "select public.hr_hunt_limit('presets')");
    for (const [k, v] of Object.entries(cat)) if (v === null || v === undefined) throw new Error('HARNESS: catalogue has no ' + k);
    const s0 = await one(db, "select public.hr_hunt_preset_save(0, 0, 'Boss nights', $1::uuid)", [idem()]);
    const s1 = await one(db, "select public.hr_hunt_preset_save(0, 1, 'Cellar rats', $1::uuid)", [idem()]);
    if (!s0 || s0.ok !== true || !s1 || s1.ok !== true) throw new Error('HARNESS: save answered ' + J(s0) + ' / ' + J(s1));
    const o0 = await one(db, 'select public.hr_action_set_options(0, 0, $1::jsonb, $2::uuid)', [JSON.stringify({
      slots: [
        { action: { type: 'ability', id: cat.ab }, conditions: [{ metric: 'self_hp_pct', op: 'lt', value: 45 }], join: 'and' },
        null,
        { action: { type: 'consume', id: cat.eat }, conditions: [], join: 'and', enabled: false }],
      stance: 'offensive', target_mode: cat.mode0, distance: cat.dmin, chase: true, gold_floor: cat.gmin }), idem()]);
    const o1 = await one(db, 'select public.hr_action_set_options(0, 1, $1::jsonb, $2::uuid)', [JSON.stringify({
      slots: [
        { action: { type: 'consume', id: cat.eat }, conditions: [{ metric: 'self_hp_pct', op: 'lt', value: 70 }, { metric: 'self_mana_pct', op: 'gte', value: 10 }], join: 'and' },
        { action: { type: 'ability', id: cat.spell }, conditions: [], join: 'and' }],
      stance: 'defensive', target_mode: cat.mode1, distance: cat.dmax, chase: false, gold_floor: cat.gmin + 1 }), idem()]);
    if (!o0 || o0.ok !== true || !o1 || o1.ok !== true) throw new Error('HARNESS: options answered ' + J(o0) + ' / ' + J(o1));
    cat.have = Number(await one(db, 'select coalesce(sum(pi.qty), 0) from public.player_inventory pi where pi.user_id = $1 and pi.slot = 0 and pi.item_id = $2', [A, cat.eat]));
  });
  return cat;
}

async function arms(db) {
  const problems = [];
  const cat = await seed(db);
  const clock = () => one(db, 'select greatest(max(x.updated_at), max(p.updated_at))::text from public.player_action_sets x join public.player_hunt_presets p on p.user_id = x.user_id and p.slot = x.slot and p.preset = x.preset where x.user_id = $1 and x.slot = 0', [A]);
  const intents = () => one(db, 'select count(*)::int from public.player_intents where user_id = $1', [A]);
  const t0 = await clock(), n0 = await intents();

  /* HPR-1 */
  const [v0, v1] = await as(db, A, async () => [await read(db, 0, 0), await read(db, 0, 1)]);
  const stored0 = await one(db, 'select x.slots from public.player_action_sets x where x.user_id = $1 and x.slot = 0 and x.preset = 0', [A]);
  if (!v0 || v0.ok !== true || v0.name !== 'Boss nights' || v0.saved !== true || v0.in_use !== false || v0.hunt_open !== false || v0.locked !== false
      || v0.stance !== 'offensive' || v0.target_mode !== cat.mode0 || v0.distance !== cat.dmin || v0.chase !== true || v0.gold_floor !== cat.gmin
      || !v0.role || v0.discipline !== cat.disc || !v0.gear || typeof v0.gear !== 'object' || !['gear', 'worn'].includes(v0.role_from)
      || !v0.options || v0.options.stance !== 'offensive') problems.push('HPR-1 number 0 reads ' + J(v0).slice(0, 400));
  const b0 = v0 && v0.bar;
  if (!Array.isArray(b0) || b0.length !== 3 || !b0[0] || b0[0].action.id !== cat.ab || !b0[0].id || b0[0].conditions[0].metric !== 'self_hp_pct' || b0[0].conditions[0].value !== 45
      || b0[1] !== null || !b0[2] || b0[2].action.id !== cat.eat || b0[2].enabled !== false) problems.push('HPR-1 number 0\'s bar reads ' + J(b0));
  if (J(b0) !== J(stored0)) problems.push('HPR-1 `bar` is not the stored array: ' + J(b0).slice(0, 200) + ' vs ' + J(stored0).slice(0, 200));
  const s0 = v0 && v0.slots;
  if (!Array.isArray(s0) || s0.length < 3 || !s0[0] || s0[0].action.id !== cat.ab || typeof s0[0].usable !== 'boolean' || typeof s0[0].mana !== 'number'
      || !s0[2] || s0[2].action.id !== cat.eat || Number(s0[2].count) !== cat.have || s0[2].usable !== (cat.have > 0)) problems.push('HPR-1 number 0\'s slots read ' + J(s0).slice(0, 400));
  if (!v1 || v1.ok !== true || v1.name !== 'Cellar rats' || v1.in_use !== true || v1.stance !== 'defensive' || v1.target_mode !== cat.mode1 || v1.distance !== cat.dmax
      || v1.chase !== false || v1.gold_floor !== cat.gmin + 1 || !Array.isArray(v1.bar) || v1.bar.length !== 2 || v1.bar[0].conditions.length !== 2
      || v1.bar[0].conditions[1].metric !== 'self_mana_pct' || v1.bar[0].conditions[1].op !== 'gte'
      || !v1.bar[1] || v1.bar[1].action.id !== cat.spell || !Array.isArray(v1.bar[1].action.own) || !v1.bar[1].action.onEmpty
      || !v1.slots[1] || v1.slots[1].action.id !== cat.spell || !Array.isArray(v1.slots[1].action.own) || typeof v1.slots[1].usable !== 'boolean') problems.push('HPR-1 number 1 reads ' + J(v1).slice(0, 400));

  /* HPR-2 */
  const view = await one(db, 'select public.hr_hunt_settings_view($1::uuid, 0)', [A]);
  if (!view || view.preset !== 1) problems.push('HPR-2 the view is on ' + J(view && view.preset) + ', want 1');
  else {
    for (const k of KEYS) if (J(v1 && v1[k]) !== J(view[k])) problems.push('HPR-2 `' + k + '` reads ' + J(v1 && v1[k]).slice(0, 160) + ' through the read and ' + J(view[k]).slice(0, 160) + ' through the view');
    const named = (view.presets || []).find((p) => p.preset === 1);
    if (!named || named.name !== (v1 && v1.name)) problems.push('HPR-2 the name differs from the view\'s presets entry: ' + J(named));
  }

  /* HPR-3 */
  const v2 = await as(db, A, () => read(db, 0, 2));
  const rdef = await one(db, "select coalesce(public.hr_hunt_role_default($1, '{}'::text[]), '{}'::jsonb) || jsonb_build_object('gold_floor', public.hr_hunt_limit('gold_floor_default'))", [v2 && v2.role]);
  if (!v2 || v2.ok !== true || v2.saved !== false || v2.in_use !== false || v2.locked !== false || v2.name !== null || v2.bar !== null || v2.options !== null || v2.gear !== null
      || v2.role_from !== 'worn' || v2.role !== (view && view.role)) problems.push('HPR-3 an unset number reads ' + J(v2).slice(0, 400));
  for (const k of ['target_mode', 'stance', 'distance', 'chase', 'gold_floor']) {
    if (!v2 || v2[k] === null || v2[k] === undefined || J(v2[k]) !== J(rdef && rdef[k])) problems.push('HPR-3 unset `' + k + '` reads ' + J(v2 && v2[k]) + ', the role default is ' + J(rdef && rdef[k]));
  }
  if (!v2 || J(v2.defaults) !== J(rdef)) problems.push('HPR-3 `defaults` reads ' + J(v2 && v2.defaults) + ', want ' + J(rdef));
  if (!v2 || !Array.isArray(v2.slots) || v2.slots.length === 0 || v2.slots.some((s) => s && typeof s === 'object' && !s.id)) problems.push('HPR-3 an unset number\'s bar is not the role\'s default tablets: ' + J(v2 && v2.slots).slice(0, 200));

  /* HPR-4 */
  const bNone = await as(db, B, () => read(db, 0, 0));
  if (!bNone || bNone.error !== 'no_character') problems.push('HPR-4 B with no hero answered ' + J(bNone));
  const bOwn = await as(db, B, async () => {
    const c = await one(db, 'select public.hr_create_character(0)');
    if (!c || c.ok !== true) throw new Error('HARNESS: B\'s hero refused ' + J(c));
    return read(db, 0, 0);
  });
  if (!bOwn || bOwn.ok !== true || bOwn.saved !== false || bOwn.name !== null || bOwn.bar !== null) problems.push('HPR-4 another account read A\'s setup: ' + J(bOwn).slice(0, 300));
  const overloads = Number(await one(db, "select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'hr_hunt_preset_read'"));
  const ident = await one(db, "select pg_get_function_identity_arguments('public.hr_hunt_preset_read(integer,integer)'::regprocedure)");
  if (overloads !== 1 || ident !== 'p_slot integer, p_preset integer') problems.push('HPR-4 the door has ' + overloads + ' overload(s) and reads (' + ident + '): a shape that could name another player');

  /* HPR-5 */
  if (cat.lim !== ACTION_SET_LIMITS.presets) problems.push('HPR-5 ACTION_SET_LIMITS.presets is ' + ACTION_SET_LIMITS.presets + ', the server\'s hr_hunt_limit(presets) ' + cat.lim);
  await as(db, A, async () => {
    for (let i = 0; i < ACTION_SET_LIMITS.presets; i++) {
      const r = await read(db, 0, i);
      if (!r || r.ok !== true || r.preset !== i) problems.push('HPR-5 number ' + i + ' answered ' + J(r).slice(0, 160));
    }
    const last = await read(db, 0, ACTION_SET_LIMITS.presets - 1);
    if (!last || last.locked !== true) problems.push('HPR-5 the last number, new and past the free count, does not read locked: ' + J(last && last.locked));
    for (const [slot, n, want] of [[0, ACTION_SET_LIMITS.presets, 'bad_preset'], [0, -1, 'bad_preset'], [0, null, 'bad_preset'], [6, 0, 'bad_slot'], [null, 0, 'bad_slot']]) {
      const r = await read(db, slot, n);
      if (!r || r.error !== want) problems.push('HPR-5 slot ' + slot + ' number ' + n + ' answered ' + J(r) + ', want ' + want);
    }
  });
  const out = await as(db, '', () => read(db, 0, 0));
  if (!out || out.error !== 'not_signed_in') problems.push('HPR-5 a signed-out read answered ' + J(out));

  /* HPR-8 (before the renames of HPR-6 move the clocks on purpose) */
  if (await clock() !== t0 || await intents() !== n0) problems.push('HPR-8 a read moved a setup row or journalled an intent');

  /* HPR-6 */
  await as(db, A, async () => {
    const long = 'a'.repeat(25), ok = 'b'.repeat(24);
    const r1 = await one(db, 'select public.hr_action_set_rename(0, 0, $1, $2::uuid)', [long, idem()]);
    if (!r1 || r1.error !== 'bad_preset_name') problems.push('HPR-6 a 25-character name answered ' + J(r1));
    const r2 = await one(db, 'select public.hr_hunt_preset_rename(0, 0, $1, $2::uuid)', [long, idem()]);
    if (!r2 || r2.error !== 'bad_preset_name') problems.push('HPR-6 a 25-character name through the setup verb answered ' + J(r2));
    /* a newline is whitespace and collapses to a space by the server's rule; a BEL is the control character the clamp refuses */
    const r3 = await one(db, 'select public.hr_action_set_rename(0, 0, $1, $2::uuid)', ['Boss\u0007nights', idem()]);
    if (!r3 || r3.error !== 'bad_preset_name') problems.push('HPR-6 a control character answered ' + J(r3));
    const r4 = await one(db, 'select public.hr_action_set_rename(0, 0, $1, $2::uuid)', [ok, idem()]);
    const back = await read(db, 0, 0);
    if (!r4 || r4.ok !== true || !back || back.name !== ok) problems.push('HPR-6 a 24-character name answered ' + J(r4) + ' and reads back ' + J(back && back.name));
  });

  /* HPR-7 */
  const shape = (await db.query(`select p.provolatile, p.prosecdef, p.proconfig,
      has_function_privilege('anon', p.oid, 'execute') as anon_x, has_function_privilege('authenticated', p.oid, 'execute') as auth_x,
      has_function_privilege('service_role', p.oid, 'execute') as svc_x
    from pg_proc p where p.oid = 'public.hr_hunt_preset_read(integer,integer)'::regprocedure`)).rows[0];
  if (!shape || shape.provolatile !== 'v' || !shape.prosecdef || !(shape.proconfig || []).includes('search_path=public, pg_catalog')
      || shape.anon_x || !shape.auth_x || shape.svc_x) problems.push('HPR-7 the door is shaped ' + J(shape));
  const pj = (await db.query(`select p.provolatile, p.prosecdef,
      has_function_privilege('anon', p.oid, 'execute') as anon_x, has_function_privilege('authenticated', p.oid, 'execute') as auth_x
    from pg_proc p where p.oid = 'public.hr_hunt_preset_project(uuid,integer,integer)'::regprocedure`)).rows[0];
  if (!pj || pj.provolatile !== 's' || !pj.prosecdef || pj.anon_x || pj.auth_x) problems.push('HPR-7 the projector is shaped ' + J(pj));
  for (const t of ['player_action_sets', 'player_hunt_presets']) {
    const row = (await db.query(`select (select c.relrowsecurity from pg_class c where c.oid = ('public.' || $1)::regclass) as rls,
        has_table_privilege('anon', 'public.' || $1, 'insert,update,delete,truncate,references,trigger') as anon_w,
        has_table_privilege('authenticated', 'public.' || $1, 'insert,update,delete,truncate,references,trigger') as auth_w,
        (select count(*)::int from pg_policies p where p.schemaname = 'public' and p.tablename = $1 and p.cmd <> 'SELECT') as write_policies`, [t])).rows[0];
    if (!row || row.rls !== true || row.anon_w || row.auth_w || Number(row.write_policies) !== 0) problems.push('HPR-7 ' + t + ' is open to a client write: ' + J(row));
  }
  const base = await one(db, "select count(*)::int from public.hr_client_rpc_baseline b where b.proname = 'hr_hunt_preset_read' and b.grantee = 'authenticated' and b.identity_args = 'p_slot integer, p_preset integer'");
  const wall = await one(db, "select count(*)::int from public.hr_gm_wall_allow where rpc = 'hr_hunt_preset_read'");
  if (Number(base) !== 1 || Number(wall) !== 1) problems.push('HPR-7 baseline rows ' + base + ', wall rows ' + wall + ', want 1 and 1');
  return problems;
}

const MUTANTS = [
  { name: 'the projector ignores the number: every read is the setup in use', fn: 'public.hr_hunt_preset_project(uuid,integer,integer)',
    find: 'from public.player_action_sets x where x.user_id = p_user and x.slot = p_slot and x.preset = p_preset;',
    repl: 'from public.player_action_sets x where x.user_id = p_user and x.slot = p_slot and x.preset = public.hr_hunt_active_set(p_user, p_slot);', want: /HPR-1/ },
  { name: 'an unset option no longer reads the role default', fn: 'public.hr_hunt_preset_project(uuid,integer,integer)',
    find: "v_val := coalesce(nullif(v_opt->v_o.opt, 'null'::jsonb), v_o.dflt, v_rdef->v_o.opt);",
    repl: "v_val := coalesce(nullif(v_opt->v_o.opt, 'null'::jsonb), v_o.dflt);", want: /HPR-3/ },
  { name: '`bar` answers the filled bar, not the stored array', fn: 'public.hr_hunt_preset_project(uuid,integer,integer)',
    find: "'bar', a.slots, 'options', a.options);", repl: "'bar', v_list, 'options', a.options);", want: /HPR-1|HPR-2/ },
  /* The clamp is held twice: hr_setup_name and player_hunt_presets' own CHECK (length 1..24). With only the function widened the table throws
     before a name lands, so the mutant plants the whole defect (both layers) and HPR-6 must be what catches the 25 characters. */
  { name: 'the name clamp widens to 32 (the function and the table)', fn: 'public.hr_setup_name(text)',
    find: 'char_length(v) not between 1 and 24', repl: 'char_length(v) not between 1 and 32',
    sql: 'alter table public.player_hunt_presets drop constraint player_hunt_presets_name_check;', want: /HPR-6/ },
  { name: 'a read moves the setup row', fn: 'public.hr_hunt_preset_read(integer,integer)',
    find: 'v := public.hr_hunt_preset_project(v_uid, p_slot, p_preset);',
    repl: 'update public.player_action_sets set updated_at = now() where user_id = v_uid and slot = p_slot and preset = p_preset; v := public.hr_hunt_preset_project(v_uid, p_slot, p_preset);', want: /HPR-8/ },
  { name: 'anon may ask', sql: 'grant execute on function public.hr_hunt_preset_read(integer, integer) to anon;', want: /HPR-7/ },
  { name: 'the door is declared STABLE', sql: 'alter function public.hr_hunt_preset_read(integer, integer) stable;', want: /HPR-7/ },
  { name: 'an overload that names a player', sql: 'create function public.hr_hunt_preset_read(p_user uuid, p_slot integer, p_preset integer) returns jsonb language sql security definer as $m$ select public.hr_hunt_preset_project(p_user, p_slot, p_preset) $m$; grant execute on function public.hr_hunt_preset_read(uuid, integer, integer) to authenticated;', want: /HPR-4/ },
];

async function main() {
  if (process.argv.includes('--mutate')) {
    let escaped = 0;
    for (const m of MUTANTS) {
      let got = [];
      try {
        const { db } = await bootReplay();
        if (m.fn) {
          const def = await one(db, 'select pg_get_functiondef($1::regprocedure)', [m.fn]);
          if (!def.includes(m.find)) throw new Error('HARNESS: ' + m.fn + ' has no ' + JSON.stringify(m.find.slice(0, 60)));
          await db.exec(def.replace(m.find, () => m.repl));
        }
        if (m.sql) await db.exec(m.sql);
        got = await arms(db);
      } catch (e) { got = ['THREW ' + String(e && e.message).slice(0, 200)]; }
      const hit = got.some((p) => m.want.test(p));
      if (!hit) escaped++;
      console.log('  ' + (hit ? 'caught ' : 'ESCAPED') + ' ' + m.name + ': ' + (got[0] || 'every check held').slice(0, 160));
    }
    console.log(escaped ? 'hunt-preset-read --mutate: ' + escaped + ' ESCAPED' : 'hunt-preset-read --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' caught');
    process.exitCode = escaped ? 1 : 0;
    return;
  }
  const { db } = await bootReplay();
  const problems = await arms(db);
  for (const p of problems) console.log('FAIL  ' + p);
  console.log(problems.length ? 'hunt-preset-read: ' + problems.length + ' FAILED' : 'hunt-preset-read: green (two setups whole, parity with the view, unset = the role default, own hero only, every number the data allows, the name clamp, the shape, a read writes nothing)');
  process.exitCode = problems.length ? 1 : 0;
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
