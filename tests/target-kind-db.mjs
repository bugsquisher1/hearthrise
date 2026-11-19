#!/usr/bin/env node
// tests/target-kind-db.mjs — THE FIRST TARGET IS THE SERVER'S (2027-04-22-target-kind.sql, lane/c-target-kind; CLAUDE.md §1, §4, §6).
//
//   node tests/target-kind-db.mjs            the guard
//   node tests/target-kind-db.mjs --mutate   the proof: each SQL mutant turns its case red
//
// THE MEASURE: the replayed chain (PGlite) and the shipped engine through the world tick (tools/settle-cost.mjs prepare).
//   TK-1 BOTH PATHS, A HEALER NAMED FIRST: a lone Melee hero at the Mill Cellar, its Target on Weakest (alone, that order takes the
//        Giant Rats first: 9 of 18 boundaries on a Slime, measured with the read mutant), names the Slime first through the real verb; the
//        Slime is a HEALER here (it casts a mend on its pull, src/data/monster-spells.js 'mend', planted in the engine's own rows as
//        tests/hunt-live.mjs LV-KINDS does) and every Cellar monster stands ten times its health so the fights last. Windows settled
//        with the browser closed (the tick's `fire` door) and with the hunt viewed (index.ts's hello, the `viewed` door), from one
//        anchor: at every window boundary where a Slime is in the fight the hero is on a Slime (80%+ of 5+ such boundaries), and the
//        two doors store the same world and pay the same Level XP.
//   TK-2 REFUSED, NEVER CLAMPED, NOTHING WRITTEN: a word that is no monster, a monster of another ground, an unknown ground, each
//        refused in its code; a kind never comes in through the action set's options (bad_option).
//   TK-3 THE PICK SURVIVES AND IS READ AFRESH: a reload's section (a fresh hr_state_of) names it; a pick mid-hunt is what the engine
//        reads next (never frozen); a kind the catalogue no longer holds there reads as none; None clears it and keeps the row.
//   TK-4 EACH HERO ITS OWN: two heroes in one party name two kinds; the engine's read gives each member its own, never the leader's.
//   TK-5 THE BAR OFFERS ONLY WHAT THE SERVER TAKES: for every ground the server holds, every monster the bar's First target lists
//        (src/shell/widgets/first-target.js reads hunt-grounds.js monstersOn) is one hr_hunt_ground_spawns holds there.
//   TK-6 TWICE: the file applied again on the chain THROUGH ITSELF applies (its pin takes its own image) and moves no body, row or check.
//        Not the chain end: 2027-04-25-boss-daily.sql splices hr_hunt_instance_read after it, so there the pin rightly refuses (the
//        house scope, tests/account-depot.mjs A4: upTo the file).
//
// The mutants are SQL patched into the booted replay; their anchors are FILE's text.
import { isMain } from './_is-main.mjs';
import { bootReplay } from './schema-replay.mjs';
import { prepare } from '../tools/settle-cost.mjs';
import { decodeStored } from '../src/core/hunt/world-state.js';
import { groundOfHunt, monstersOn } from '../src/data/hunt-grounds.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sourceQuery } from '../tools/lib/version-stamp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = '2027-04-22-target-kind.sql';
const ANCHOR = Date.UTC(2026, 10, 1, 12, 0, 0);
const CELLAR = 'mill_cellar', HEALER = 'slime', OTHER = 'hive_wasp';
const WINDOW_MS = 5000, WINDOWS = 40;
/* A sword alone (a Melee hero, no shield): it swings at what the Target order and its First target give it. */
const GEAR = Object.freeze({ helmet: 'steel_helm', body: 'steel_platebody', pants: 'steel_platelegs', boots: 'steel_boots', weapon: 'steel_sword' });
const idem = () => crypto.randomUUID();
const one = async (db, sql, params) => { const r = await db.query(sql, params); const row = r.rows[0]; return row ? row[Object.keys(row)[0]] : null; };
const asUser = (db, uid) => db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);

/* THE HEALER (the engine's own rows, the module instance src/core imports with the build's ?v=; tests/hunt-live.mjs LV-KINDS): the
   Cellar's Slime mends its pull, and every Cellar monster stands ten times its health. Set once for the process, every door alike. */
const V = sourceQuery(ROOT);
const ENGINE_MONSTERS = (await import(pathToFileURL(join(ROOT, 'src', 'data', 'monsters.js')).href + V)).MONSTERS;
const ENGINE_SPELLS = await import(pathToFileURL(join(ROOT, 'src', 'data', 'monster-spells.js')).href + V);
const MEND = 'tk_mend';
ENGINE_SPELLS.MONSTER_SPELLS[MEND] = { n: 'Test Mend', shape: 'mend', range: 4, windupMs: 1200, cdMs: 4000, hitPm: 1000, element: null };
ENGINE_SPELLS.SPELL_SWITCH.live = true;
for (const k of ['rat', HEALER, OTHER]) ENGINE_MONSTERS[k].hp *= 10;
ENGINE_MONSTERS[HEALER].spells = [MEND];

/* One hero at the Cellar naming the healer first, through one door: the boundaries where a Slime was in the fight, those where the
   hero was on one, the world it stored and the Level XP it paid. */
async function door(db, which) {
  const run = await prepare({ heroes: 1, windows: WINDOWS, windowMs: WINDOW_MS, hunt: CELLAR, door: which, db, level: 30, anchorMs: ANCHOR, gear: GEAR,
    beforeEnter: async ({ uids, asUser: as, one: q, idem: key }) => {
      await as(uids[0]);
      /* Target on Weakest: on its own the order takes the Giant Rats (60 HP) before the Slime (80), so only the First target puts the hero on it */
      const t = await q(db, `select public.hr_action_set_options(0, 0, '{"target_mode":"weakest"}'::jsonb, $1::uuid)`, [key()]);
      if (!t || t.ok !== true) throw new Error('the Target setting was refused: ' + JSON.stringify(t));
      const r = await q(db, 'select public.hr_hunt_target_kind_set(0, $1, $2, $3::uuid)', [CELLAR, HEALER, key()]);
      if (!r || r.ok !== true) throw new Error('the pick was refused: ' + JSON.stringify(r));
    } });
  const user = run.users[0];
  const n = { with: 0, on: 0 };
  const look = async () => {
    const raw = await one(db, 'select world::text from public.hunt_instances where id = $1', [run.instance]);
    const w = raw ? decodeStored(JSON.parse(raw)) : null;
    if (!w) return;
    const hero = w.units.find((u) => u.side === 'hero');
    const healers = w.units.filter((u) => u.side === 'mon' && u.alive && u.kind === HEALER && Number.isInteger(u.target));
    const on = hero && Number.isInteger(hero.target) ? w.units.find((u) => u.id === hero.target) : null;
    if (healers.length && on && on.side === 'mon') { n.with++; if (on.kind === HEALER) n.on++; }
  };
  await run.warm();
  await look();
  for (let i = 2; i <= WINDOWS + 1; i++) { await run.step(i); await look(); }
  const world = await one(db, 'select world::text from public.hunt_instances where id = $1', [run.instance]);
  const xp = Number(await one(db, 'select level_xp from public.player_state where user_id = $1 and slot = 0', [user]));
  return { n, world, xp, user };
}

async function bothPaths(boot) {
  const problems = [];
  const closed = await door((await boot()).db, 'fire');
  const viewedDb = (await boot()).db;
  const viewed = await door(viewedDb, 'viewed');
  for (const [name, r] of [['browser closed', closed], ['hunt viewed', viewed]]) {
    const pct = r.n.with ? Math.round((100 * r.n.on) / r.n.with) : 0;
    console.log(`  TK-1 ${name}: on a Slime at ${r.n.on} of ${r.n.with} boundaries with one in the fight (${pct}%), ${r.xp} Level XP`);
    if (r.n.with < 5 || pct < 80) problems.push(`TK-1 ${name}: the hero naming the healer first was on one at ${r.n.on} of ${r.n.with} boundaries with one in the fight (want 5+, 80%+)`);
    if (!(r.xp > 0)) problems.push('TK-1 ' + name + ': no Level XP was paid');
  }
  if (closed.world !== viewed.world) problems.push('TK-1 the two doors stored different worlds');
  if (closed.xp !== viewed.xp) problems.push('TK-1 browser closed pays ' + closed.xp + ' Level XP, hunt viewed ' + viewed.xp);
  problems.push(...await afterwards(viewedDb, viewed.user));
  return problems;
}

/* TK-2 and TK-3, on the viewed door's db (its one hunt still open at the Cellar, the healer named). */
async function afterwards(db, user) {
  const problems = [];
  const opts = async () => {
    const read = await one(db, 'select public.hr_hunt_instance_read($1::uuid, 0)', [user]);
    return read && read.members && read.members[0] && read.members[0].session ? read.members[0].session.options : null;
  };
  const picks = async () => ((await one(db, 'select public.hr_state_of($1::uuid, 0)', [user])) || {}).hunt_target_kind;
  const set = async (hunt, kind) => {
    await db.query('begin');
    await asUser(db, user);
    await db.query('delete from public.hr_rate_counters where user_id = $1', [user]);
    const r = await one(db, 'select public.hr_hunt_target_kind_set(0, $1, $2, $3::uuid)', [hunt, kind, idem()]);
    await db.query('commit');
    return r;
  };
  const row = async () => (await db.query('select target_kind, tier from public.hunt_density where user_id = $1 and slot = 0 and hunt_id = $2', [user, CELLAR])).rows[0] || null;

  /* TK-3: a reload reads the pick, the engine plays it */
  const a = await picks();
  if (!a || !a.picks || a.picks[CELLAR] !== HEALER) problems.push('TK-3 a reload reads ' + JSON.stringify(a));
  const o0 = await opts();
  if (!o0 || o0.target_kind !== HEALER) problems.push('TK-3 the engine reads ' + JSON.stringify(o0));

  /* TK-2: refused, never clamped, nothing written */
  for (const [hunt, kind, want] of [[CELLAR, 'not_a_monster', 'bad_kind'], [CELLAR, 'brook_bear', 'bad_kind'], ['no_such_ground', HEALER, 'bad_hunt']]) {
    const r = await set(hunt, kind);
    if (!r || r.error !== want) problems.push('TK-2 ' + kind + ' on ' + hunt + ' answered ' + JSON.stringify(r) + ', want ' + want);
  }
  const kept = await row();
  if (!kept || kept.target_kind !== HEALER) problems.push('TK-2 a refused pick moved the row to ' + JSON.stringify(kept));
  await db.query('begin');
  await asUser(db, user);
  await db.query('delete from public.hr_rate_counters where user_id = $1', [user]);
  const viaSet = await one(db, `select public.hr_action_set_options(0, 0, '{"target_kind":"rat"}'::jsonb, $1::uuid)`, [idem()]);
  await db.query('commit');
  if (!viaSet || viaSet.error !== 'bad_option') problems.push('TK-2 a kind through the action set answered ' + JSON.stringify(viaSet));

  /* TK-3: a pick mid-hunt is the engine's next read, the hunt's instance unmoved */
  const r1 = await set(CELLAR, OTHER);
  const o1 = await opts();
  if (!r1 || r1.ok !== true || !o1 || o1.target_kind !== OTHER) problems.push('TK-3 a pick mid-hunt answered ' + JSON.stringify(r1) + ', the engine reads ' + JSON.stringify(o1));
  /* a kind the catalogue no longer holds on the ground (a later catalogue moved it off): none, in the engine and the section */
  await db.query('update public.hunt_density set target_kind = $3 where user_id = $1 and slot = 0 and hunt_id = $2', [user, CELLAR, 'brook_bear']);
  const o2 = await opts();
  const p2 = await picks();
  if (!o2 || 'target_kind' in o2 || !p2 || Object.keys(p2.picks || {}).length) problems.push('TK-3 a kind off the ground is served: engine ' + JSON.stringify(o2) + ', section ' + JSON.stringify(p2));
  /* None clears it and keeps the row (its tier) */
  const r3 = await set(CELLAR, null);
  const o3 = await opts();
  const left = await row();
  if (!r3 || r3.ok !== true || !o3 || 'target_kind' in o3 || !left || left.target_kind !== null || left.tier !== 'normal') {
    problems.push('TK-3 None answered ' + JSON.stringify(r3) + ', the engine reads ' + JSON.stringify(o3) + ', the row ' + JSON.stringify(left));
  }
  return problems;
}

/* TK-4: two heroes in one party, two kinds; each member's read is its own. */
async function aParty(boot) {
  const problems = [];
  const { db } = await boot();
  const want = [HEALER, OTHER];
  const run = await prepare({ heroes: 2, windows: 1, windowMs: WINDOW_MS, hunt: CELLAR, door: 'fire', db, level: 30, anchorMs: ANCHOR, gear: GEAR,
    beforeEnter: async ({ uids, asUser: as, one: q, idem: key }) => {
      for (const [i, uid] of uids.entries()) {
        await as(uid);
        const r = await q(db, 'select public.hr_hunt_target_kind_set(0, $1, $2, $3::uuid)', [CELLAR, want[i], key()]);
        if (!r || r.ok !== true) throw new Error('a pick was refused: ' + JSON.stringify(r));
      }
    } });
  await run.warm();
  for (const uid of run.users) {
    const read = await one(db, 'select public.hr_hunt_instance_read($1::uuid, 0)', [uid]);
    const got = ((read && read.members) || []).map((m) => [m.user, m.session && m.session.options && m.session.options.target_kind]);
    const ok = got.length === 2 && got.every(([u, k]) => k === want[run.users.indexOf(u)]);
    if (!ok) problems.push('TK-4 read by ' + uid.slice(-4) + ', the members play ' + JSON.stringify(got) + ', want ' + JSON.stringify(run.users.map((u, i) => [u, want[i]])));
  }
  const second = ((await one(db, 'select public.hr_state_of($1::uuid, 0)', [run.users[1]])) || {}).hunt_target_kind;
  if (!second || !second.picks || second.picks[CELLAR] !== OTHER) problems.push('TK-4 the second hero\'s section reads ' + JSON.stringify(second));
  return problems;
}

/* TK-5: the bar's list is inside the server's catalogue, ground by ground. */
async function barInsideCatalogue(db) {
  const problems = [];
  const rows = (await db.query('select g.hunt_id, array_agg(s.monster_id order by s.monster_id) as kinds from public.hr_hunt_grounds g join public.hr_hunt_ground_spawns s on s.hunt_id = g.hunt_id group by g.hunt_id order by g.hunt_id')).rows;
  if (rows.length < 6) problems.push('TK-5 the server holds only ' + rows.length + ' grounds: the scan is blind');
  for (const r of rows) {
    const g = groundOfHunt(r.hunt_id);
    if (!g) { problems.push('TK-5 the server holds ' + r.hunt_id + ', which the data has no ground for'); continue; }
    const off = [...monstersOn(g)].filter((k) => !r.kinds.includes(k));
    if (off.length) problems.push('TK-5 the bar would offer ' + off.join(', ') + ' on ' + r.hunt_id + ', which the server refuses (bad_kind)');
  }
  return problems;
}

/* TK-6: FILE applied a second time on the chain AS OF FILE (`again`: a mutant's edit to its text) applies, and moves no body, row or check. The
   chain as of FILE, not its end: a later file restates hr_hunt_instance_read whole (2027-04-23-session-modes.sql) and FILE's pin rightly refuses
   a body another file moved (combat-training-db TD-AGAIN stands the same way). */
async function twice(db, again) {
  const problems = [];
  const print = async () => JSON.stringify({
    fns: (await db.query("select p.proname, md5(pg_get_functiondef(p.oid)) m, p.proacl::text acl from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('hr_hunt_instance_read', 'hr_hunt_target_kind_set', 'hr_hunt_target_kind_view') order by 1")).rows,
    rows: (await db.query("select (select row_to_json(s) from public.hr_state_sections s where key = 'hunt_target_kind') sec, (select count(*) from public.hr_client_rpc_baseline where proname = 'hr_hunt_target_kind_set') base, (select count(*) from public.hr_gm_wall_allow where rpc = 'hr_hunt_target_kind_set') wall")).rows,
    checks: (await db.query("select conname, pg_get_constraintdef(oid) d from pg_constraint where conrelid = 'public.hunt_density'::regclass order by conname")).rows,
  });
  const once = await print();
  const sql = readFileSync(join(ROOT, 'supabase', 'migrations', FILE), 'utf8').replace(/\r\n/g, '\n');
  try { await db.exec(again ? again(sql) : sql); } catch (e) { problems.push('TK-6 ' + FILE + ' does not apply a second time: ' + String(e && e.message).slice(0, 200)); return problems; }
  if (await print() !== once) problems.push('TK-6 a second apply of ' + FILE + ' moved a body, a row or a check');
  return problems;
}

const MUTANTS = [
  { name: 'the pin refuses its own image: the file applies once', again: (sql) => sql.replace("'5081f20a0facc6f36375b8af8ac9f1c8', 'd0cb8c8ec3e038ff865ce81b05242d49')", "'5081f20a0facc6f36375b8af8ac9f1c8')"), want: /TK-6/ },
  { name: 'a second apply adds a second check', again: (sql) => sql.replace("if not exists (select 1 from pg_constraint where conrelid = 'public.hunt_density'::regclass and conname = 'hunt_density_target_kind_ck') then", 'if true then').replace('add constraint hunt_density_target_kind_ck check', 'add constraint hunt_density_target_kind_ck2 check'), want: /TK-6/ },
  { name: 'the engine never reads the pick', fn: 'public.hr_hunt_instance_read(uuid,integer)',
    find: "(select jsonb_build_object('target_kind', d.target_kind) from public.hunt_density d", repl: "(select '{}'::jsonb from public.hunt_density d", want: /TK-1 browser closed/, run: 'both' },
  { name: 'a member plays the leader\'s pick', fn: 'public.hr_hunt_instance_read(uuid,integer)',
    find: '                     where d.user_id = h.user_id and d.slot = h.slot and d.hunt_id = v_i.hunt_id), \'{}\'::jsonb)) as r) mr',
    repl: '                     where d.user_id = p_user and d.slot = p_slot and d.hunt_id = v_i.hunt_id), \'{}\'::jsonb)) as r) mr', want: /TK-4/, run: 'party' },
  { name: 'a kind of another ground is taken', fn: 'public.hr_hunt_target_kind_set(integer,text,text,uuid)',
    find: 'where s.hunt_id = p_hunt and s.monster_id = v_kind', repl: 'where s.monster_id = v_kind', want: /TK-2/, run: 'both' },
  { name: 'a kind off the ground is still served', fn: 'public.hr_hunt_instance_read(uuid,integer)',
    find: "                      join public.hr_hunt_ground_spawns g on g.hunt_id = d.hunt_id and g.monster_id = d.target_kind\n                     where d.user_id = h.user_id",
    repl: "                     where d.user_id = h.user_id", want: /TK-3 a kind off the ground/, run: 'both' },
  { name: 'None takes the row (and its tier) with it', fn: 'public.hr_hunt_target_kind_set(integer,text,text,uuid)',
    find: '    update public.hunt_density set target_kind = null, updated_at = now()\n     where user_id = v_uid and slot = p_slot and hunt_id = p_hunt and target_kind is not null;',
    repl: '    delete from public.hunt_density\n     where user_id = v_uid and slot = p_slot and hunt_id = p_hunt;', want: /TK-3 None/, run: 'both' },
];

async function main() {
  if (process.argv.includes('--mutate')) {
    /* every anchor is FILE's own text, or the mutant tests nothing */
    const text = readFileSync(join(ROOT, 'supabase', 'migrations', FILE), 'utf8').replace(/\r\n/g, '\n');
    let escaped = 0;
    for (const m of MUTANTS) {
      if (m.again) {
        let got = [];
        if (m.again(text) === text) got = ['HARNESS: the edit changed nothing in ' + FILE];
        else try { got = await twice((await bootReplay({ upTo: FILE })).db, m.again); } catch (e) { got = ['THREW ' + String(e && e.message).slice(0, 200)]; }
        const hit = got.some((p) => m.want.test(p));
        if (!hit) escaped++;
        console.log('  ' + (hit ? 'caught ' : 'ESCAPED') + ' ' + m.name + ': ' + (got[0] || 'every check held').slice(0, 200));
        continue;
      }
      if (text.split(m.find).length !== 2) { console.log('  ESCAPED ' + m.name + ': HARNESS: the anchor is not in ' + FILE + ' exactly once'); escaped++; continue; }
      /* Patched into the booted replay (FILE's own self-check would refuse most of them at apply): the body as it landed, the one change, re-applied. */
      const boot = async () => {
        const b = await bootReplay();
        const def = String(await one(b.db, 'select pg_get_functiondef($1::regprocedure)', [m.fn])).replace(/\r\n/g, '\n');
        if (def.split(m.find).length !== 2) throw new Error('HARNESS: ' + m.fn + ' does not hold ' + JSON.stringify(m.find.slice(0, 60)) + ' once');
        await b.db.exec(def.replace(m.find, () => m.repl));
        return b;
      };
      let got = [];
      try { got = m.run === 'party' ? await aParty(boot) : await bothPaths(boot); } catch (e) { got = ['THREW ' + String(e && e.message).slice(0, 200)]; }
      const hit = got.some((p) => m.want.test(p));
      if (!hit) escaped++;
      console.log('  ' + (hit ? 'caught ' : 'ESCAPED') + ' ' + m.name + ': ' + (got.find((p) => m.want.test(p)) || got[0] || 'every check held').slice(0, 200));
    }
    console.log(escaped ? 'target-kind-db --mutate: ' + escaped + ' ESCAPED' : 'target-kind-db --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' caught');
    process.exitCode = escaped ? 1 : 0;
    return;
  }
  const boot = () => bootReplay();
  const last = (await boot()).db;
  const problems = [...await bothPaths(boot), ...await aParty(boot), ...await barInsideCatalogue(last), ...await twice((await bootReplay({ upTo: FILE })).db)];
  for (const p of problems) console.log('FAIL  ' + p);
  console.log(problems.length ? 'target-kind-db: ' + problems.length + ' FAILED'
    : 'target-kind-db: green (a healer named first on both paths, refused not clamped, read afresh and survives a reload, each hero its own, the bar inside the catalogue, a second apply moves nothing)');
  process.exitCode = problems.length ? 1 : 0;
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
