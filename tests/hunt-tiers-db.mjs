#!/usr/bin/env node
// tests/hunt-tiers-db.mjs — THE TIER IS THE SERVER'S (2027-02-27-hunt-tiers.sql, lane/c-difficulty-tiers; CLAUDE.md §1, §4).
//
//   node tests/hunt-tiers-db.mjs            the guard
//   node tests/hunt-tiers-db.mjs --mutate   the proof: each SQL mutant turns it red
//   node tests/hunt-tiers-db.mjs --mutate --only=HT-7   the mutants one arm owns
//
// THE MEASURE: the replayed chain (PGlite), the shipped world tick (tools/settle-cost.mjs).
//   HT-1 BOTH PATHS: a hero at Mosslight Glade on Deadly, windows settled with the browser closed (the tick's `fire` door) and hunt viewed (index.ts's hello, the `viewed` door), from one
//        anchor: the instance froze the tier and its pull, every window lands inside the kill bound, the two doors store the same world and pay the same Level XP.
//   HT-2 A FOUR: a mixed party on the Warrens on Dangerous: the leader's pick is everyone's, the four's pull from the row, every window lands; a member's pick is refused (not_leader) and its row plays nothing.
//   HT-3 THE PICK SURVIVES: the section reads the pick and the tier the hunt froze after a reload (a fresh hr_state_of); a pick mid-hunt moves neither the instance nor the engine's read, and plays from the next hunt.
//   HT-5 THE GROUND AS IT STANDS: a hero on a tier whose row brings no more monsters (the Thicket's Deadly) freezes its tier at pull 0, and the world stands at the ground's own pull, inside the kill bound.
//   HT-4 REFUSED, NEVER CLAMPED: a word nobody offers, a tier the ground doesn't offer and an unknown ground, each in words; a tier never comes in through the action set's options (bad_option).
//   HT-6 THE DIALS ARE THE DATA'S (tools/gen-ground-tiers.mjs OUT_NAME, lane/b-tier-dials): the replayed table holds dmg_pm, hp_pm and xp_pm, never power_pm, and
//        every ground's resolved row of src/data/hunt-tiers.js digit for digit; the catalogue file applied a second time moves no row and no constraint.
//   HT-7 THE ROW NAMES ITS TIER FROM THE OPEN, BOTH PATHS (2027-05-24-session-tier-open.sql, lane/c-session-tier-null; balance audit 2026-11-19 fix 9:
//        the export read an open Deadly hunt's row as null): on each door, the open Deadly hunt's row and its hr_hunt_view read deadly while it runs;
//        a change of ground landing at that door's settle (hr_hunt_swap) opens a CONTINUED row (prev_session_id) that names its own ground's pick from
//        the open, the tier its instance froze and the engine reads (hr_hunt_instance_read options.tier), never null and never the old ground's;
//        the row it continued ends `changed` keeping deadly; and a second apply of the file moves no body, trigger or comment.
//
// The mutants are SQL patched into the booted replay; their anchors are FILE's text (HT-7's: OPEN_FILE's).
import { isMain } from './_is-main.mjs';
import { bootReplay } from './schema-replay.mjs';
import { withdrawScale } from './_tier-path.mjs';
import { wholeViewOrRerun, applyOrder, packSqlOf } from '../tools/pack/whole.mjs';
import { packIds } from '../tools/pack/files.mjs';
import { prepare } from '../tools/settle-cost.mjs';
import { decodeStored } from '../src/core/hunt/world-state.js';
import { tierRowOf, pullOfTier, GROUND_TIERS } from '../src/data/hunt-tiers.js';
import { OUT_NAME as DIALS_FILE } from '../tools/gen-ground-tiers.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = '2027-02-27-hunt-tiers.sql';
const OPEN_FILE = '2027-05-24-session-tier-open.sql';
const ANCHOR = Date.UTC(2026, 10, 1, 12, 0, 0);
const WINDOWS = 3;
const WINDOW_MS = 90000;   /* prepare's own window (tools/settle-cost.mjs windowMs default), which door() keeps */
const GLADE = 'mosslight_glade', WARRENS = 'coppercap_warrens', THICKET = 'meadowbrook_thicket';
/* A hero who holds a full box for the guard's minutes: this measures the server's path, not the balance. */
const GEAR = Object.freeze({ helmet: 'steel_helm', body: 'steel_platebody', pants: 'steel_platelegs', boots: 'steel_boots', weapon: 'steel_sword', shield: 'coppercap_shield' });
const idem = () => crypto.randomUUID();

const one = async (db, sql, params) => { const r = await db.query(sql, params); const row = r.rows[0]; return row ? row[Object.keys(row)[0]] : null; };
const asUser = (db, uid) => db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);

/* One hero on Deadly through one door: what the instance holds after it, and the Level XP it paid. */
async function door(db, which) {
  const run = await prepare({ heroes: 1, windows: WINDOWS, hunt: GLADE, door: which, db, level: 60, tier: 'deadly', anchorMs: ANCHOR, gear: GEAR });
  await run.warm();
  for (let w = 2; w <= WINDOWS + 1; w++) await run.step(w);
  const row = (await db.query(`select i.tier, i.density, i.world::text as world, s.user_id from public.hunt_instances i join public.hunt_sessions s on s.instance_id = i.id where i.hunt_id = $1 order by s.entered_at desc limit 1`, [GLADE])).rows[0];
  const xp = Number(await one(db, 'select level_xp from public.player_state where user_id = $1 and slot = 0', [row.user_id]));
  return { tier: row.tier, density: row.density, world: row.world, xp, user: row.user_id, run, db };
}

/* HT-7 on one door's db, its Glade Deadly hunt still open after `door`: the open row, then a change of ground landing at that door's next settle.
   Browser closed: the tick's fire (run.step). Hunt viewed: the viewed hero's own hunt_settle as index.ts runs it (mode settle, project, live), ONE
   ask: run.step's early live asks are pinned to answer below_min_span, and a pending change is settled by the first ask that comes. */
async function openRow(d, which) {
  const name = which === 'fire' ? 'browser closed' : 'hunt viewed';
  const problems = [];
  const { db, run, user } = d;
  const open = (await db.query('select id, tier, settled_to from public.hunt_sessions where user_id = $1 and slot = 0 and ended_at is null', [user])).rows[0];
  if (!open) return ['HT-7 ' + name + ': CONTROL: no open hunt after the windows'];
  const view = await one(db, 'select public.hr_hunt_view($1::uuid)', [open.id]);
  if (open.tier !== 'deadly' || !view || view.tier !== 'deadly') problems.push('HT-7 ' + name + ': the open Deadly hunt\'s row reads ' + open.tier + ', its view ' + (view && view.tier));
  /* the player's change of ground (the real verb), its own pick on the next ground first */
  await db.query('begin');
  await asUser(db, user);
  await db.query('delete from public.hr_rate_counters where user_id = $1', [user]);
  const pick = await one(db, "select public.hr_hunt_tier_set(0, $1, 'dangerous', $2::uuid)", [THICKET, idem()]);
  await db.query('delete from public.hr_rate_counters where user_id = $1', [user]);
  const ch = await one(db, 'select public.hr_hunt_change(0, $1, $2::uuid)', [THICKET, idem()]);
  await db.query('commit');
  if (!pick || pick.ok !== true || !ch || ch.ok !== true) return [...problems, 'HT-7 ' + name + ': CONTROL: the pick answered ' + JSON.stringify(pick) + ', the change ' + JSON.stringify(ch)];
  /* FIXTURE: the change pends to the live horizon, greatest(now(), settled_to + 32 s) on the SERVER's clock, weeks past this guard's anchored hunt
     clock; it is moved inside the next window so the door's own settle lands it (the swap is under test here, not the horizon). */
  await db.query("update public.hunt_sessions set change_at = settled_to + interval '30 seconds' where id = $1", [open.id]);
  try {
    if (which === 'fire') await run.step(WINDOWS + 2);
    else {
      const { HARNESS: H } = await import('./hunt-sessions-settle.mjs');
      const M = await H.loadEdge(H.ROOT);
      const v = await M.HS.settleHunt({ exec: H.makeExec(db), user, slot: 0, mode: 'settle', bucket: null, project: true, live: true, atMs: run.fromMs + (WINDOWS + 2) * WINDOW_MS });
      if (!v || v.outcome !== 'paid') throw new Error('the viewed settle answered ' + JSON.stringify(v && { o: v.outcome, r: v.reason }));
    }
  } catch (e) { return [...problems, 'HT-7 ' + name + ': the window carrying the change did not land: ' + String(e && e.message).slice(0, 300)]; }
  const next = (await db.query(`select s.id, s.tier, s.ended_at is null as open, i.tier as inst from public.hunt_sessions s join public.hunt_instances i on i.id = s.instance_id
                                 where s.prev_session_id = $1`, [open.id])).rows[0];
  const was = (await db.query('select tier, end_reason from public.hunt_sessions where id = $1', [open.id])).rows[0];
  if (!next) return [...problems, 'HT-7 ' + name + ': the change opened no continued row (the old one ended ' + (was && was.end_reason) + ')'];
  const read = await one(db, 'select public.hr_hunt_instance_read($1::uuid, 0)', [user]);
  const plays = read && read.members && read.members[0] && read.members[0].session && read.members[0].session.options && read.members[0].session.options.tier;
  if (!next.open || next.tier !== 'dangerous' || next.inst !== 'dangerous' || plays !== 'dangerous') {
    problems.push('HT-7 ' + name + ': the continued row (open ' + next.open + ') reads ' + next.tier + ', its instance froze ' + next.inst + ', the engine plays ' + plays + ', want dangerous (the Thicket\'s pick) in all three');
  }
  if (!was || was.end_reason !== 'changed' || was.tier !== 'deadly') problems.push('HT-7 ' + name + ': the row it continued ended ' + (was && was.end_reason) + ' at ' + (was && was.tier) + ', want changed at deadly');
  return problems;
}

/* HT-7's second apply: OPEN_FILE again (`again`: a mutant's edit to its text) moves no body, trigger or comment. */
async function openTwice(db, again) {
  const shape = async () => JSON.stringify((await db.query(`select (select string_agg(md5(pg_get_functiondef(p.oid)), ',' order by p.proname) from pg_proc p
       where p.pronamespace = 'public'::regnamespace and p.proname in ('hr_hunt_tier_open', 'hr_hunt_tier_stamp')) as bodies,
     (select string_agg(pg_get_triggerdef(t.oid), ',' order by t.tgname) from pg_trigger t where t.tgrelid = 'public.hunt_sessions'::regclass and not t.tgisinternal) as triggers,
     col_description('public.hunt_sessions'::regclass, (select attnum from pg_attribute where attrelid = 'public.hunt_sessions'::regclass and attname = 'tier')) as note`)).rows[0]);
  const once = await shape();
  const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations', OPEN_FILE), 'utf8');
  try { await db.exec(again ? again(sql) : sql); } catch (e) { return ['HT-7 ' + OPEN_FILE + ' does not apply a second time: ' + String(e && e.message).slice(0, 200)]; }
  return (await shape()) === once ? [] : ['HT-7 a second apply of ' + OPEN_FILE + ' moved a body, a trigger or the column\'s comment'];
}

async function bothPaths(boot) {
  const problems = [];
  const closed = await door((await boot()).db, 'fire');
  const viewedDb = (await boot()).db;
  const viewed = await door(viewedDb, 'viewed');
  const pull = pullOfTier(tierRowOf(GLADE, 'deadly'), 1);
  for (const [name, r] of [['browser closed', closed], ['hunt viewed', viewed]]) {
    if (r.tier !== 'deadly' || r.density !== pull) problems.push('HT-1 ' + name + ': the instance froze ' + r.tier + ' at ' + r.density + ', want deadly at ' + pull);
    const w = r.world ? decodeStored(JSON.parse(r.world)) : null;
    if (!w || w.density !== pull) problems.push('HT-1 ' + name + ': the world stands at ' + (w && w.density) + ', want ' + pull);
    if (!(r.xp > 0)) problems.push('HT-1 ' + name + ': no Level XP was paid');
  }
  if (closed.world !== viewed.world) problems.push('HT-1 the two doors stored different worlds');
  if (closed.xp !== viewed.xp) problems.push('HT-1 browser closed pays ' + closed.xp + ' Level XP, hunt viewed ' + viewed.xp);

  /* HT-3: the pick survives, on the viewed door's db (its one hunt still open) */
  const { user } = viewed;
  const state = async () => (await one(viewedDb, 'select public.hr_state_of($1::uuid, 0)', [user])).hunt_tier;
  const a = await state();
  if (!a || a.playing !== 'deadly' || (a.picks || {})[GLADE] !== 'deadly') problems.push('HT-3 a reload reads ' + JSON.stringify(a));
  await viewedDb.query('begin');
  await asUser(viewedDb, user);
  await viewedDb.query('delete from public.hr_rate_counters where user_id = $1', [user]);
  const moved = await one(viewedDb, "select public.hr_hunt_tier_set(0, $1, 'dangerous', $2::uuid)", [GLADE, idem()]);
  await viewedDb.query('commit');
  if (!moved || moved.ok !== true) problems.push('HT-3 a pick mid-hunt answered ' + JSON.stringify(moved));
  const inst = (await viewedDb.query('select i.tier, i.density from public.hunt_instances i join public.hunt_sessions s on s.instance_id = i.id where s.user_id = $1 and s.ended_at is null', [user])).rows[0];
  if (!inst || inst.tier !== 'deadly' || inst.density !== pull) problems.push('HT-3 a pick mid-hunt moved the running hunt to ' + JSON.stringify(inst));
  const read = await one(viewedDb, 'select public.hr_hunt_instance_read($1::uuid, 0)', [user]);
  const opts = read && read.members && read.members[0] && read.members[0].session && read.members[0].session.options;
  if (!opts || opts.tier !== 'deadly' || opts.density !== pull) problems.push('HT-3 the engine reads ' + JSON.stringify(opts) + ' mid-hunt');
  const b = await state();
  if (!b || b.playing !== 'deadly' || (b.picks || {})[GLADE] !== 'dangerous') problems.push('HT-3 after a pick mid-hunt the section reads ' + JSON.stringify(b));

  /* HT-4: refused, never clamped */
  await viewedDb.query('begin');
  await asUser(viewedDb, user);
  for (const [hunt, tier, want] of [[GLADE, 'hardcore', 'bad_tier'], ['mill_cellar', 'deadly', 'bad_tier'], ['no_such_ground', 'deadly', 'bad_hunt']]) {
    await viewedDb.query('delete from public.hr_rate_counters where user_id = $1', [user]);
    const r = await one(viewedDb, 'select public.hr_hunt_tier_set(0, $1, $2, $3::uuid)', [hunt, tier, idem()]);
    if (!r || r.error !== want) problems.push('HT-4 ' + tier + ' on ' + hunt + ' answered ' + JSON.stringify(r) + ', want ' + want);
  }
  await viewedDb.query('delete from public.hr_rate_counters where user_id = $1', [user]);
  const opt = await one(viewedDb, `select public.hr_action_set_options(0, 0, '{"tier":"deadly"}'::jsonb, $1::uuid)`, [idem()]);
  if (!opt || opt.error !== 'bad_option') problems.push('HT-4 a tier through the action set answered ' + JSON.stringify(opt));
  await viewedDb.query('commit');

  /* HT-7: the row names its tier from the open, on each door (the viewed one after HT-3's pick mid-hunt: the running row keeps deadly), then the file twice */
  problems.push(...await openRow(closed, 'fire'), ...await openRow(viewed, 'viewed'), ...await openTwice(closed.db));
  return problems;
}

async function aFour(boot) {
  const problems = [];
  const { db } = await boot();
  const run = await prepare({ heroes: 4, windows: WINDOWS, hunt: WARRENS, door: 'fire', db, level: 60, tier: 'dangerous', anchorMs: ANCHOR, gear: GEAR });
  let landed = 0;
  try { await run.warm(); landed++; for (let w = 2; w <= WINDOWS + 1; w++) { await run.step(w); landed++; } } catch (e) { problems.push('HT-2 window ' + (landed + 1) + ' did not land: ' + String(e && e.message).slice(0, 300)); }
  const row = (await db.query('select id, tier, density, world::text as world from public.hunt_instances where hunt_id = $1 order by created_at desc limit 1', [WARRENS])).rows[0];
  const pull = pullOfTier(tierRowOf(WARRENS, 'dangerous'), 4);
  if (!row || row.tier !== 'dangerous' || row.density !== pull) problems.push('HT-2 the party froze ' + (row && row.tier) + ' at ' + (row && row.density) + ', want dangerous at ' + pull);
  const w = row && row.world ? decodeStored(JSON.parse(row.world)) : null;
  if (!w || w.density !== pull) problems.push('HT-2 the party\'s world stands at ' + (w && w.density) + ', want ' + pull);
  const seats = (await db.query('select user_id, seat from public.hunt_party_members where party_id = $1 order by seat', [row.id])).rows;
  const lead = (await db.query('select leader_user from public.hunt_parties where id = $1', [row.id])).rows[0];
  const member = seats.find((s) => s.user_id !== lead.leader_user);
  await db.query('begin');
  await asUser(db, member.user_id);
  await db.query('delete from public.hr_rate_counters where user_id = $1', [member.user_id]);
  const r = await one(db, "select public.hr_hunt_tier_set(0, $1, 'deadly', $2::uuid)", [WARRENS, idem()]);
  await db.query('commit');
  if (!r || r.error !== 'not_leader') problems.push('HT-2 a member\'s pick answered ' + JSON.stringify(r));
  const read = await one(db, 'select public.hr_hunt_instance_read($1::uuid, 0)', [member.user_id]);
  const ids = ((read && read.members) || []).map((m) => m.session.options.tier + ':' + m.session.options.density);
  if (ids.length !== 4 || ids.some((x) => x !== 'dangerous:' + pull)) problems.push('HT-2 every member should play the leader\'s pick: ' + ids.join());
  return problems;
}

async function asItStands(boot) {
  const problems = [];
  const { db } = await boot();
  const run = await prepare({ heroes: 1, windows: WINDOWS, hunt: THICKET, door: 'fire', db, level: 60, tier: 'deadly', anchorMs: ANCHOR, gear: GEAR });
  let landed = 0;
  try { await run.warm(); landed++; for (let w = 2; w <= WINDOWS + 1; w++) { await run.step(w); landed++; } } catch (e) { problems.push('HT-5 window ' + (landed + 1) + ' did not land: ' + String(e && e.message).slice(0, 300)); }
  const row = (await db.query('select tier, density, world::text as world from public.hunt_instances where hunt_id = $1 order by created_at desc limit 1', [THICKET])).rows[0];
  const pull = pullOfTier(tierRowOf(THICKET, 'deadly'), 1);
  if (!row || row.tier !== 'deadly' || row.density !== pull) problems.push('HT-5 the Thicket froze ' + (row && row.tier) + ' at ' + (row && row.density) + ', want deadly at ' + pull);
  const w = row && row.world ? decodeStored(JSON.parse(row.world)) : null;
  if (!w || w.density !== pull) problems.push('HT-5 the world stands at ' + (w && w.density) + ', want ' + pull);
  return problems;
}

/* HT-6 on a booted chain: the shape, the rows, and a second apply of the catalogue file (`again`: a mutant's edit to that file's text). */
async function dialsTwice(db, again) {
  const problems = [];
  const cols = (await db.query("select column_name, data_type, is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'hr_ground_tiers' order by column_name")).rows
    .map((c) => c.column_name + ':' + c.data_type + ':' + c.is_nullable).join();
  if (cols !== 'dmg_pm:integer:NO,hp_pm:integer:NO,hunt_id:text:NO,pull:ARRAY:NO,tier:text:NO,xp_pm:integer:NO') problems.push('HT-6 the table is shaped ' + cols);
  const print = async () => JSON.stringify({
    rows: (await db.query('select hunt_id, tier, pull, dmg_pm, hp_pm, xp_pm from public.hr_ground_tiers order by hunt_id, tier')).rows,
    checks: (await db.query("select conname, pg_get_constraintdef(oid) d from pg_constraint where conrelid = 'public.hr_ground_tiers'::regclass order by conname")).rows,
  });
  const want = [];
  for (const g of Object.keys(GROUND_TIERS).sort()) for (const id of ['dangerous', 'deadly']) {
    const t = GROUND_TIERS[g][id];
    want.push({ hunt_id: g, tier: id, pull: t.pull, dmg_pm: t.dmgPm, hp_pm: t.hpPm, xp_pm: t.xpPm });
  }
  const once = await print();
  if (JSON.stringify(JSON.parse(once).rows) !== JSON.stringify(want)) problems.push('HT-6 the server holds ' + JSON.stringify(JSON.parse(once).rows).slice(0, 300) + ', the data ' + JSON.stringify(want).slice(0, 300));
  const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations', DIALS_FILE), 'utf8');
  try { await db.exec(again ? again(sql) : sql); } catch (e) { problems.push('HT-6 ' + DIALS_FILE + ' does not apply a second time: ' + String(e && e.message).slice(0, 200)); return problems; }
  /* a ground pack shipped after the dials file holds its tier rows in its own file (tools/pack/whole.mjs: the whole file's delete + re-insert
     carries only the packs before it), so the chain's second pass re-applies those files after it, in apply order, as a replay would */
  const order = applyOrder(), at = order.indexOf(DIALS_FILE);
  for (const f of packIds().map((id) => packSqlOf(id)).filter((x) => x && order.indexOf(x) > at).sort((x, y) => order.indexOf(x) - order.indexOf(y))) {
    await db.exec(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations', f), 'utf8'));
  }
  if (await print() !== once) problems.push('HT-6 a second apply of ' + DIALS_FILE + ' moved the table');
  return problems;
}

const MUTANTS = [
  { name: 'the freeze ignores the pick: every hunt is Normal', fn: 'public.hr_hunt_density_freeze()', find: "  v_tier := public.hr_hunt_tier_pick(new.instance_id, new.user_id, new.slot);", repl: "  v_tier := 'normal';", want: /HT-1/ },
  { name: 'the engine never reads the tier', fn: 'public.hr_hunt_instance_read(uuid,integer)', find: "jsonb_build_object('density', v_i.density, 'tier', coalesce(v_i.tier, 'normal'))", repl: "jsonb_build_object('density', v_i.density)", want: /HT-3/ },
  { name: 'a member picks for itself', fn: 'public.hr_hunt_tier_set(integer,text,text,uuid)', find: "    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'not_leader')); end if;\n  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then\n    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;\n  insert into public.hunt_density as d (user_id, slot, hunt_id, density, tier, updated_at)", repl: "    null; end if;\n  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then\n    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;\n  insert into public.hunt_density as d (user_id, slot, hunt_id, density, tier, updated_at)", want: /HT-2/, four: true },
  { name: 'the rename is not guarded: the file applies once', again: (sql) => sql.replace(/if exists \(select 1 from information_schema\.columns\s+where table_schema = 'public' and table_name = 'hr_ground_tiers' and column_name = 'power_pm'\) then/, 'if true then'), want: /HT-6/ },
  { name: 'a second apply moves a check', again: (sql) => sql.replace('check (hp_pm between 1000 and 4000)', 'check (hp_pm between 1000 and 5000)'), want: /HT-6/ },
  /* RE-AIMED 2026-11-10 (run 42785532468): this planted "select t.pull[1] from", a four playing the lone hero's pull. Since one difficulty
     (2027-03-23-one-difficulty.generated.sql, Tyler 2026-11-08) a row holds ONE pull for every party size, so that read is the same number
     and the mutant changed nothing. What is left to hold for a four is that the freeze writes its tier's pull at all. */
  { name: 'a tier brings a party no pull: a four plays the ground as it stands', fn: 'public.hr_hunt_density_freeze()', find: "select t.pull[v_size] from", repl: "select case when v_size > 1 then 0 else t.pull[v_size] end from", want: /HT-2/, four: true },
  { name: 'a tier the ground does not offer is clamped, not refused', fn: 'public.hr_hunt_tier_set(integer,text,text,uuid)', find: "    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_tier')); end if;", repl: "    p_tier := 'normal'; end if;", want: /HT-4/ },
  /* HT-7 (OPEN_FILE): the 2027-03-16 contract alone (null until the end), the audit's guess (a continued row copies the old one's tier), a file that applies once */
  { name: 'the row names no tier until it ends', fn: 'public.hr_hunt_tier_open()', find: "   where s.id = new.id\n", repl: "   where false\n", want: /HT-7/ },
  { name: 'a continued row copies the tier of the row it continued', fn: 'public.hr_hunt_tier_open()',
    find: "     set tier = coalesce((select i.tier from public.hunt_instances i where i.id = new.instance_id), 'normal')\n",
    repl: "     set tier = coalesce((select p.tier from public.hunt_sessions p where p.id = new.prev_session_id), (select i.tier from public.hunt_instances i where i.id = new.instance_id), 'normal')\n", want: /HT-7/ },
  { name: 'the open stamp\'s trigger is not dropped first: the file applies once', openFile: true, again: (sql) => sql.replace('drop trigger if exists hr_hunt_tier_open on public.hunt_sessions;\n', ''), want: /HT-7/ },
];

async function main() {
  if (process.argv.includes('--mutate')) {
    /* --only=HT-7: the mutants one arm owns (a lane's own proof); the full sweep is the default and what CI runs */
    const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
    const chosen = MUTANTS.filter((m) => !only || m.want.test(only));
    if (!chosen.length) { console.log('hunt-tiers-db --mutate: HARNESS: no mutant is owned by ' + only); process.exitCode = 2; return; }
    let escaped = 0;
    for (const m of chosen) {
      /* Patched into the booted replay (FILE's own self-check would refuse most of them at apply): the body as it landed, the one change, re-applied. */
      if (m.again) {
        let got = [];
        try { got = await (m.openFile ? openTwice : dialsTwice)((await bootReplay()).db, m.again); } catch (e) { got = ['THREW ' + String(e && e.message).slice(0, 200)]; }
        const hit = got.some((p) => m.want.test(p));
        if (!hit) escaped++;
        console.log('  ' + (hit ? 'caught ' : 'ESCAPED') + ' ' + m.name + ': ' + (got[0] || 'every check held').slice(0, 160));
        continue;
      }
      const boot = async () => {
        const b = await bootReplay();
        await withdrawScale(b.db, [THICKET, GLADE, WARRENS]);
        const def = await one(b.db, 'select pg_get_functiondef($1::regprocedure)', [m.fn]);
        if (!def.includes(m.find)) throw new Error('HARNESS: ' + m.fn + ' has no ' + JSON.stringify(m.find.slice(0, 60)));
        await b.db.exec(def.replace(m.find, () => m.repl));
        return b;
      };
      let got = [];
      try { got = m.four ? await aFour(boot) : await bothPaths(boot); } catch (e) { got = ['THREW ' + String(e && e.message).slice(0, 200)]; }
      const hit = got.some((p) => m.want.test(p));
      if (!hit) escaped++;
      console.log('  ' + (hit ? 'caught ' : 'ESCAPED') + ' ' + m.name + ': ' + (got[0] || 'every check held').slice(0, 160));
    }
    console.log(escaped ? 'hunt-tiers-db --mutate: ' + escaped + ' ESCAPED' : 'hunt-tiers-db --mutate: ' + chosen.length + '/' + chosen.length + ' caught' + (only ? ' (' + only + ' of ' + MUTANTS.length + ')' : ''));
    process.exitCode = escaped ? 1 : 0;
    return;
  }
  /* every arm here is the tier path; the Thicket, the Glade and the Warrens joined the Danger scale (lane/scale-early-grounds, lane/scale-grounds-2),
     so their scale rows leave this database */
  const boot = async () => { const b = await bootReplay(); await withdrawScale(b.db, [THICKET, GLADE, WARRENS]); return b; };
  const problems = [...await bothPaths(boot), ...await aFour(boot), ...await asItStands(boot), ...await dialsTwice((await boot()).db)];
  for (const p of problems) console.log('FAIL  ' + p);
  console.log(problems.length ? 'hunt-tiers-db: ' + problems.length + ' FAILED' : 'hunt-tiers-db: green (both paths, a four, the pick survives, refused not clamped, a row with no more monsters, the dials are the data\'s twice, the row names its tier from the open on both paths)');
  process.exitCode = problems.length ? 1 : 0;
}

/* THE CHAIN END'S VIEW: a STAGED ground pack's tier rows are in src/data and in no migration until tools/pack.mjs ship, so the data is read as the
   chain end holds it: the base and every pack whose file is in the apply order (tools/pack/whole.mjs; lane/d-packs-retune, the lane/b-slake-and-ford pattern). */
const CHAIN_END = 'the chain end, every applied file';
if (isMain(import.meta.url) && wholeViewOrRerun(import.meta.url, CHAIN_END)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
