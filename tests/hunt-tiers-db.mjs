#!/usr/bin/env node
// tests/hunt-tiers-db.mjs — THE TIER IS THE SERVER'S (2027-02-27-hunt-tiers.sql, lane/c-difficulty-tiers; CLAUDE.md §1, §4).
//
//   node tests/hunt-tiers-db.mjs            the guard
//   node tests/hunt-tiers-db.mjs --mutate   the proof: each SQL mutant turns it red
//
// THE MEASURE: the replayed chain (PGlite), the shipped world tick (tools/settle-cost.mjs).
//   HT-1 BOTH PATHS: a hero at Mosslight Glade on Deadly, windows settled with the browser closed (the tick's `fire` door) and hunt viewed (index.ts's hello, the `viewed` door), from one
//        anchor: the instance froze the tier and its pull, every window lands inside the kill bound, the two doors store the same world and pay the same Level XP.
//   HT-2 A FOUR: a mixed party on the Warrens on Dangerous: the leader's pick is everyone's, the four's pull from the row, every window lands; a member's pick is refused (not_leader) and its row plays nothing.
//   HT-3 THE PICK SURVIVES: the section reads the pick and the tier the hunt froze after a reload (a fresh hr_state_of); a pick mid-hunt moves neither the instance nor the engine's read, and plays from the next hunt.
//   HT-4 REFUSED, NEVER CLAMPED: a word nobody offers, a tier the ground doesn't offer and an unknown ground, each in words; a tier never comes in through the action set's options (bad_option).
//
// The mutants are SQL patched into the booted replay; their anchors are FILE's text.
import { isMain } from './_is-main.mjs';
import { bootReplay } from './schema-replay.mjs';
import { prepare } from '../tools/settle-cost.mjs';
import { decodeStored } from '../src/core/hunt/world-state.js';
import { HUNT_TIERS, pullOfTier } from '../src/data/hunt-tiers.js';

const FILE = '2027-02-27-hunt-tiers.sql';
const ANCHOR = Date.UTC(2026, 10, 1, 12, 0, 0);
const WINDOWS = 3;
const GLADE = 'mosslight_glade', WARRENS = 'coppercap_warrens';
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
  return { tier: row.tier, density: row.density, world: row.world, xp, user: row.user_id };
}

async function bothPaths(boot) {
  const problems = [];
  const closed = await door((await boot()).db, 'fire');
  const viewedDb = (await boot()).db;
  const viewed = await door(viewedDb, 'viewed');
  const pull = pullOfTier(HUNT_TIERS.deadly, 1);
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
  return problems;
}

async function aFour(boot) {
  const problems = [];
  const { db } = await boot();
  const run = await prepare({ heroes: 4, windows: WINDOWS, hunt: WARRENS, door: 'fire', db, level: 60, tier: 'dangerous', anchorMs: ANCHOR, gear: GEAR });
  let landed = 0;
  try { await run.warm(); landed++; for (let w = 2; w <= WINDOWS + 1; w++) { await run.step(w); landed++; } } catch (e) { problems.push('HT-2 window ' + (landed + 1) + ' did not land: ' + String(e && e.message).slice(0, 300)); }
  const row = (await db.query('select id, tier, density, world::text as world from public.hunt_instances where hunt_id = $1 order by created_at desc limit 1', [WARRENS])).rows[0];
  const pull = pullOfTier(HUNT_TIERS.dangerous, 4);
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

const MUTANTS = [
  { name: 'the freeze ignores the pick: every hunt is Normal', fn: 'public.hr_hunt_density_freeze()', find: "  v_tier := public.hr_hunt_tier_pick(new.instance_id, new.user_id, new.slot);", repl: "  v_tier := 'normal';", want: /HT-1/ },
  { name: 'the engine never reads the tier', fn: 'public.hr_hunt_instance_read(uuid,integer)', find: "jsonb_build_object('density', v_i.density, 'tier', coalesce(v_i.tier, 'normal'))", repl: "jsonb_build_object('density', v_i.density)", want: /HT-3/ },
  { name: 'a member picks for itself', fn: 'public.hr_hunt_tier_set(integer,text,text,uuid)', find: "    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'not_leader')); end if;\n  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then\n    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;\n  insert into public.hunt_density as d (user_id, slot, hunt_id, density, tier, updated_at)", repl: "    null; end if;\n  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then\n    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;\n  insert into public.hunt_density as d (user_id, slot, hunt_id, density, tier, updated_at)", want: /HT-2/, four: true },
  { name: 'a four plays the lone pull', fn: 'public.hr_hunt_density_freeze()', find: "select t.pull[v_size] from", repl: "select t.pull[1] from", want: /HT-2/, four: true },
  { name: 'a tier the ground does not offer is clamped, not refused', fn: 'public.hr_hunt_tier_set(integer,text,text,uuid)', find: "    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_tier')); end if;", repl: "    p_tier := 'normal'; end if;", want: /HT-4/ },
];

async function main() {
  if (process.argv.includes('--mutate')) {
    let escaped = 0;
    for (const m of MUTANTS) {
      /* Patched into the booted replay (FILE's own self-check would refuse most of them at apply): the body as it landed, the one change, re-applied. */
      const boot = async () => {
        const b = await bootReplay();
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
    console.log(escaped ? 'hunt-tiers-db --mutate: ' + escaped + ' ESCAPED' : 'hunt-tiers-db --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' caught');
    process.exitCode = escaped ? 1 : 0;
    return;
  }
  const boot = () => bootReplay();
  const problems = [...await bothPaths(boot), ...await aFour(boot)];
  for (const p of problems) console.log('FAIL  ' + p);
  console.log(problems.length ? 'hunt-tiers-db: ' + problems.length + ' FAILED' : 'hunt-tiers-db: green (both paths, a four, the pick survives, refused not clamped)');
  process.exitCode = problems.length ? 1 : 0;
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
