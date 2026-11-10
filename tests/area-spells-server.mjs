#!/usr/bin/env node
// tests/area-spells-server.mjs — THE AREA SPELLS' SERVER HALF (lane/b-area-set; Tyler 2026-11-08: "start giving some monsters some aoe
// spells and our heros some more aoe spells"; CLAUDE.md §1, §4, §6). The three staged files, on the replayed chain (PGlite):
//   2027-03-28-area-conditions.sql, 2027-03-28-area-spells-hunt-sessions-catalogue.generated.sql, 2027-03-28-area-spells-rune-spells.generated.sql
//
//   node tests/area-spells-server.mjs            the guard
//   node tests/area-spells-server.mjs --mutate   the proof: each planted defect turns it red
//
// THE MEASURE: the shipped world tick and the viewed hello (tools/settle-cost.mjs), a party of four on the Coppercap Warrens' own rows: a shield
// tank, a sword alone with Turning Cut, a wand with Hoarfrost on the shop's Plain Ice Rune, a staff with Spring Tide "when the fight is on".
//   AS-1 BOTH PATHS, A MONSTER'S SPELL ON A PARTY: the Goblin Diggers' Blasting Charge (whole-group) and the Chief's Slag Toss (marked) land with the
//        browser closed (the tick's `fire` door) and the hunt viewed (the `viewed` hello) from one anchor: every window lands and nothing is refused,
//        every hero of the four took the spell's element, the two doors store the same world and the same tallies, and the viewer's answers carry
//        the spell's warning marks (`spell` events naming a row of src/data/monster-spells.js).
//   AS-2 BOTH PATHS, THE HERO AREA ABILITIES: the bars are saved through the real verb (hr_action_set_options: the server's own bar check); on both
//        doors Turning Cut and Hoarfrost deal damage, Hoarfrost buys only the Plain Ice Rune it names, Spring Tide heals.
//   AS-3 THE DEFENSE BOUND HAS ROOM: each hero's Defense XP over the hunt is inside the Defense term hr_hunt_apply_member allows for the same span
//        (computed from the chain's own rows), a shield tank standing in every spell included; the largest share is printed.
//   AS-4 ONLY THE AREA ROWS DIFFER: on the chain as it stands after one difficulty, every table, constraint and function is read, the three files
//        are applied, and all of it is read again. What moved is exactly: five condition metrics and Chill; four abilities (the older rows' `ord`
//        only); the world's shape and its two unit fields; the limit spell_windup_min_ms; two rune spells. Named, because an apply must not roll
//        them back: death_xp_permille 60 with no death_xp_base row, runes_out, Undertow, and every kill bound.
//   AS-5 BEFORE AND AFTER: on the chain before the three files the same slots are refused (the regression this lane closes); after them, accepted.
//   AS-6 A SECOND APPLY of the three files, in order, self-checks included, moves nothing.
//
// The text mutants patch a file's SQL before it is applied (its own self-check may be what refuses it: that counts, by name).
import { isMain } from './_is-main.mjs';
import { bootReplay, manifest } from './schema-replay.mjs';
import { prepare } from '../tools/settle-cost.mjs';
import { OUT_NAME as CAT } from '../tools/gen-hunt-sessions.mjs';
import { ABILITIES } from '../src/data/abilities.js';
import { MONSTER_SPELLS, SPELL_BOUNDS } from '../src/data/monster-spells.js';
import { METRICS } from '../src/data/condition-metrics.js';
import { DEATH_XP_LOSS } from '../src/data/hunt-sessions.js';
import { SHAPE, FIELDS } from '../src/core/hunt/world-state.js';
import { BUILD } from '../src/build-info.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* THE SPELLS ARE THIS GUARD'S SUBJECT: the switch on (the engine's own instance of the row: src/core imports src/data with the build's ?v=),
   whichever way it ships. Off, AS-1 would have nothing to land. */
(await import(pathToFileURL(join(ROOT, 'src', 'data', 'monster-spells.js')).href + '?v=' + BUILD.cache)).SPELL_SWITCH.live = true;
const COND = '2027-03-28-area-conditions.sql';
const RUNES = '2027-03-28-area-spells-rune-spells.generated.sql';
const FILES = Object.freeze([COND, CAT, RUNES]);
const sqlOf = (f) => readFileSync(join(ROOT, 'supabase', 'migrations', f), 'utf8').replace(/\r\n/g, '\n');
const WARRENS = 'coppercap_warrens';
const ANCHOR = Date.UTC(2026, 10, 1, 12, 0, 0);
const WINDOWS = 5, WINDOW_MS = 90000;
const AREA_ABILITIES = Object.freeze(['turning_cut', 'raking_shot', 'hoarfrost', 'spring_tide']);
const AREA_METRICS = Object.freeze(['party_hp_pct', 'enemy_casting', 'in_fight', 'target_weak', 'target_resists']);
/* the death share the catalogue carries (Tyler 2026-11-09: 6% of the total Level XP), the data's own number */
const DEATH_PM = Math.round(DEATH_XP_LOSS * 1000);

const one = async (db, sql, params) => { const r = await db.query(sql, params); const row = r.rows[0]; return row ? row[Object.keys(row)[0]] : null; };
const rowsOf = async (db, sql, params) => (await db.query(sql, params)).rows;
const short = (v, n = 260) => JSON.stringify(v).slice(0, n);

/* THE FOUR (seat order): a shield tank, a sword alone, a wand, a staff, each in steel at Level 38 (in the Warrens' band). */
const PLATE = { helmet: 'steel_helm', body: 'steel_platebody', pants: 'steel_platelegs', boots: 'steel_boots' };
const GEAR = [
  { ...PLATE, weapon: 'steel_sword', shield: 'coppercap_shield' },
  { ...PLATE, weapon: 'steel_sword', shield: null },
  { ...PLATE, weapon: 'maple_wand', shield: 'maple_spellbook' },
  { ...PLATE, weapon: 'maple_staff', shield: null },
];
const food = { action: { type: 'consume', id: 'cooked_shrimp' }, conditions: [{ metric: 'self_hp_pct', op: 'lt', value: 70 }], join: 'and' };
const drink = { action: { type: 'consume', id: 'thin_turnip_juice' }, conditions: [{ metric: 'self_mana_pct', op: 'lt', value: 40 }], join: 'and' };
const ab = (id, extra, conditions) => ({ action: { type: 'ability', id, ...(extra || {}) }, conditions: conditions || [], join: 'and' });
/* The slots as Configure action sends them. Spring Tide is the only heal on the staff's bar, so every point it heals is Spring Tide's. */
const SLOT = Object.freeze({
  turning_cut: ab('turning_cut'),
  hoarfrost: ab('hoarfrost', { store: 'plain_ice_rune' }),
  spring_tide: ab('spring_tide', { store: 'plain_water_rune' }, [{ metric: 'in_fight', op: 'eq', value: true }]),
});
const BARS = [null, [SLOT.turning_cut, ab('power_strike'), food, drink], [SLOT.hoarfrost, food, drink], [SLOT.spring_tide, food, drink]];

/* One door over the four: what the chain holds after it. A window that does not land throws inside prepare's doors. */
async function door(db, which) {
  const refusedBars = [];
  const run = await prepare({ heroes: 4, windows: WINDOWS, windowMs: WINDOW_MS, hunt: WARRENS, door: which, db, level: 38, anchorMs: ANCHOR, gear: (i) => GEAR[i],
    beforeEnter: async ({ db: d, uids, asUser, one: ask, idem }) => {
      for (const [i, uid] of uids.entries()) {
        if (!BARS[i]) continue;
        await asUser(uid);
        const r = await ask(d, 'select public.hr_action_set_options(0, 0, $1::jsonb, $2::uuid)', [JSON.stringify({ slots: BARS[i] }), idem()]);
        if (!r || r.ok !== true) refusedBars.push('seat ' + i + ' ' + short(r, 160));
      }
    } });
  let landed = 0, threw = null;
  try { await run.warm(); landed++; for (let w = 2; w <= WINDOWS + 1; w++) { await run.step(w); landed++; } } catch (e) { threw = String(e && e.message).slice(0, 300); }
  const seats = [];
  for (const [i, sid] of run.sessions.entries()) {
    const t = (await rowsOf(db, 'select kills, xp, dealt, taken, healed from public.hunt_session_tally where session_id = $1', [sid]))[0] || {};
    const buys = await rowsOf(db, "select meta->'items' as items from public.player_ledger where session_id = $1 and intent = 'supply_buy'", [sid]);
    const bought = {};
    for (const b of buys) for (const [k, v] of Object.entries(b.items || {})) bought[k] = (bought[k] || 0) + Number(v.qty);
    const s = (await rowsOf(db, 'select end_reason from public.hunt_sessions where id = $1', [sid]))[0] || {};
    seats.push({ seat: i, kills: Number(t.kills || 0), xp: t.xp || {}, dealt: t.dealt || {}, taken: t.taken || {}, healed: t.healed || {}, bought, ended: s.end_reason || null,
      levelXp: Number(await one(db, 'select level_xp from public.player_state where user_id = $1 and slot = 0', [run.users[i]])) });
  }
  const world = await one(db, 'select world::text from public.hunt_instances where id = $1', [run.instance]);
  const refusals = Number(await one(db, 'select coalesce(sum(n), 0) from public.hr_rejections where user_id = any($1::uuid[])', [run.users]));
  /* THE DEFENSE TERM hr_hunt_apply_member allows over this hunt's whole span, from the chain's own rows (its v_def: every swing interval, every foe
     the ground can engage at once, the highest level it spawns, a block's multiple). One span's term is under the sum of its windows'. */
  const spanMs = landed * WINDOW_MS;
  const defMax = Number(await one(db, `
    select ceil((floor($1::numeric / public.hr_hunt_limit('swing_interval_ms')) + 1)
                * least(g.spawns + g.pockets * i.d, greatest(i.d, 16))
                * (select max(public.hr_monster_level(sp.monster_id)) from public.hr_hunt_ground_spawns sp where sp.hunt_id = g.hunt_id)
                * public.hr_hunt_limit('defense_xp_level_permille') / 1000.0 * public.hr_hunt_limit('block_mult'))
      from public.hr_hunt_grounds g, (select coalesce(density, 0)::bigint d from public.hunt_instances where id = $3) i
     where g.hunt_id = $2`, [spanMs, WARRENS, run.instance]));
  const answers = which === 'viewed' ? (await run.evidence()).answers : [];
  return { landed, threw, refusedBars, seats, world, refusals, defMax, spanMs, answers };
}

const ember = (s) => Number(((s.taken || {}).byElement || {}).ember || 0);
const by = (s, id) => Number(((s.dealt || {}).byAbility || {})[id] || 0);

/* AS-1, AS-2, AS-3 over both doors. `boot` answers a fresh chain (a mutant's, patched). `only`: one door (a mutant that needs no comparison). */
async function bothPaths(boot, only) {
  const problems = [];
  const names = only ? [only] : ['fire', 'viewed'];
  const got = {};
  for (const which of names) got[which] = await door((await boot()).db, which);
  let share = 0;
  for (const which of names) {
    const r = got[which], name = which === 'fire' ? 'browser closed' : 'hunt viewed';
    if (r.refusedBars.length) problems.push('AS-2 ' + name + ': the server refused a bar naming an area ability: ' + r.refusedBars.join('; '));
    if (r.threw || r.landed !== WINDOWS + 1) problems.push('AS-1 ' + name + ': window ' + (r.landed + 1) + ' of ' + (WINDOWS + 1) + ' did not land: ' + r.threw);
    if (r.refusals) problems.push('AS-1 ' + name + ': the server journalled ' + r.refusals + ' refusal(s)');
    const dry = r.seats.filter((s) => !(ember(s) > 0));
    if (dry.length) problems.push('AS-1 ' + name + ': a whole-group spell missed seat(s) ' + dry.map((s) => s.seat).join() + ' (ember taken ' + r.seats.map(ember).join() + ')');
    if (r.seats.some((s) => s.ended)) problems.push('AS-1 ' + name + ': a hunt ended: ' + r.seats.map((s) => s.ended).join());
    if (!(by(r.seats[1], 'turning_cut') > 0)) problems.push('AS-2 ' + name + ': the sword dealt nothing with Turning Cut: ' + short(r.seats[1].dealt));
    if (!(by(r.seats[2], 'hoarfrost') > 0)) problems.push('AS-2 ' + name + ': the wand dealt nothing with Hoarfrost: ' + short(r.seats[2].dealt));
    const ice = Object.keys(r.seats[2].bought).filter((k) => /_rune$/.test(k));
    if (ice.join() !== 'plain_ice_rune') problems.push('AS-2 ' + name + ': Hoarfrost bought ' + short(r.seats[2].bought) + ', its slot names plain_ice_rune');
    if (!(Number((r.seats[3].healed || {}).total || 0) > 0) || !(r.seats[3].bought.plain_water_rune > 0)) problems.push('AS-2 ' + name + ': Spring Tide healed ' + short(r.seats[3].healed) + ' on ' + short(r.seats[3].bought));
    for (const s of r.seats) {
      const d = Number((s.xp || {}).defense || 0);
      share = Math.max(share, d / r.defMax);
      if (!(d > 0)) problems.push('AS-3 ' + name + ': seat ' + s.seat + ' took spells and earned no Defense XP');
      if (!(d <= r.defMax)) problems.push('AS-3 ' + name + ': seat ' + s.seat + ' earned ' + d + ' Defense XP, over the ' + r.defMax + ' the settle allows for ' + r.spanMs / 1000 + ' s');
    }
  }
  if (got.viewed) {
    /* the warning marks reach the viewing client: the answers' events name each cast, its shape and its windup */
    const marks = [];
    const walk = (v) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') { if (v.type === 'spell' && typeof v.spell === 'string') marks.push(v); else Object.values(v).forEach(walk); } };
    walk(got.viewed.answers);
    if (!marks.length) problems.push('AS-1 hunt viewed: no answer carried a spell\'s warning mark');
    const odd = marks.filter((m) => !MONSTER_SPELLS[m.spell] || typeof m.shape !== 'string' || !(m.ms >= SPELL_BOUNDS.windupMs[0]));
    if (odd.length) problems.push('AS-1 hunt viewed: a mark the client cannot draw: ' + short(odd[0]));
    if (!marks.some((m) => m.shape === 'group') || !marks.some((m) => m.shape !== 'group')) problems.push('AS-1 hunt viewed: the marks hold ' + [...new Set(marks.map((m) => m.shape))].join() + ', want a whole-group spell and a marked one');
  }
  if (got.fire && got.viewed) {
    if (got.fire.world !== got.viewed.world) problems.push('AS-1 the two doors stored different worlds');
    const a = JSON.stringify(got.fire.seats), b = JSON.stringify(got.viewed.seats);
    if (a !== b) problems.push('AS-1 browser closed and hunt viewed wrote different tallies: ' + a.slice(0, 200) + ' vs ' + b.slice(0, 200));
  }
  return { problems, share };
}

/* Everything the chain holds that an apply could move: every table's rows, every constraint, every function's body and grants. */
async function image(db) {
  const tables = (await rowsOf(db, "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1")).map((r) => r.table_name);
  const data = {};
  for (const t of tables) data[t] = await one(db, `select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text), '[]'::jsonb) from public.${t} x`);
  const checks = await rowsOf(db, "select conrelid::regclass::text t, conname, pg_get_constraintdef(oid) d from pg_constraint where connamespace = 'public'::regnamespace order by 1, 2");
  const fns = await rowsOf(db, "select p.oid::regprocedure::text f, md5(p.prosrc) h, coalesce(p.proacl::text, '') acl from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1");
  return { data, checks: JSON.stringify(checks), fns: Object.fromEntries(fns.map((r) => [r.f, r.h + ' ' + r.acl])), runeSpells: await one(db, 'select public.hr_hunt_rune_spells()') };
}
const byKey = (rows, k) => Object.fromEntries(rows.map((r) => [r[k], r]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* AS-4, AS-5, AS-6 on the chain as one difficulty leaves it. `patch(file, sql)`: a mutant's edit to a file's text. */
async function rowsOnly(patch) {
  const problems = [];
  const order = (await manifest()).order;
  const at = order.indexOf(COND);
  if (at < 1 || order.slice(at).join() !== FILES.join()) return ['AS-4 HARNESS: the three area files are not the chain\'s last three, in order: ' + order.slice(-4).join()];
  const { db } = await bootReplay({ upTo: order[at - 1] });
  const check = (slot) => one(db, 'select public.hr_hunt_slot_check($1::jsonb)', [JSON.stringify(slot)]);
  /* AS-5, before: the server as one difficulty leaves it knows neither the abilities nor the conditions */
  for (const [id, slot] of Object.entries(SLOT)) {
    const r = await check(slot);
    if (r && r.ok === true) problems.push('AS-5 before the area files the server already accepts a ' + id + ' slot: the control is dead');
  }
  const before = await image(db);
  for (const f of FILES) {
    try { await db.exec(patch ? patch(f, sqlOf(f)) : sqlOf(f)); } catch (e) { problems.push('AS-4 ' + f + ' does not apply: ' + String(e && e.message).split('\n')[0].slice(0, 220)); return problems; }
  }
  const after = await image(db);

  /* the tables that may move, each held to exactly what the lane adds */
  /* (hunt_world_shape_move is the shape's own journal: its trigger notes the shape the catalogue replaced, so the old engine's settles are held, never counted, until the edge deploys: 2026-12-11-hunt-deploy-no-forfeit.sql) */
  const MAY = ['hr_hunt_condition_metrics', 'hr_hunt_abilities', 'hr_hunt_limits', 'hr_hunt_world_shape', 'hunt_world_shape_move'];
  const moved = Object.keys(after.data).filter((t) => !same(before.data[t], after.data[t]));
  const stray = moved.filter((t) => !MAY.includes(t));
  if (stray.length) problems.push('AS-4 an apply moved ' + stray.join(', ') + ': only ' + MAY.join(', ') + ' may move');
  if (Object.keys(before.data).join() !== Object.keys(after.data).join()) problems.push('AS-4 an apply made or dropped a table');
  if (before.checks !== after.checks) problems.push('AS-4 an apply moved a constraint');
  const fnMoved = [...new Set([...Object.keys(before.fns), ...Object.keys(after.fns)])].filter((f) => before.fns[f] !== after.fns[f]);
  if (fnMoved.join() !== 'hr_hunt_rune_spells()') problems.push('AS-4 the function bodies or grants that moved: ' + (fnMoved.join(', ') || 'none') + ', want hr_hunt_rune_spells() alone');

  { // the condition metrics: the five, and Chill on effect_missing
    const b = byKey(before.data.hr_hunt_condition_metrics, 'metric'), a = byKey(after.data.hr_hunt_condition_metrics, 'metric');
    const added = Object.keys(a).filter((k) => !b[k]).sort();
    if (added.join() !== [...AREA_METRICS].sort().join() || Object.keys(b).some((k) => !a[k])) problems.push('AS-4 the condition metrics gained ' + added.join() + ', want ' + AREA_METRICS.join());
    for (const k of Object.keys(b)) {
      const was = { ...b[k] }, now = { ...(a[k] || {}) };
      if (k === 'effect_missing') { if (!now.vals || now.vals.filter((v) => !was.vals.includes(v)).join() !== 'chill') problems.push('AS-4 effect_missing offers ' + short(now.vals)); delete was.vals; delete now.vals; }
      if (!same(was, now)) problems.push('AS-4 the metric ' + k + ' moved: ' + short(was, 120) + ' -> ' + short(now, 120));
    }
    if (Object.keys(a).sort().join() !== METRICS.map((m) => m.id).sort().join()) problems.push('AS-4 the server\'s metrics are not src/data/condition-metrics.js METRICS');
  }
  { // the abilities: the four, and nothing of an older row but its order
    const b = byKey(before.data.hr_hunt_abilities, 'ability_id'), a = byKey(after.data.hr_hunt_abilities, 'ability_id');
    const added = Object.keys(a).filter((k) => !b[k]).sort();
    if (added.join() !== [...AREA_ABILITIES].sort().join() || Object.keys(b).some((k) => !a[k])) problems.push('AS-4 the abilities gained ' + added.join() + ', want ' + AREA_ABILITIES.join());
    for (const k of Object.keys(b)) {
      const was = { ...b[k] }, now = { ...(a[k] || {}) };
      delete was.ord; delete now.ord;
      if (!same(was, now)) problems.push('AS-4 the ability ' + k + ' moved beyond its order: ' + short(was, 140) + ' -> ' + short(now, 140));
    }
    if (!b.undertow || !a.undertow) problems.push('AS-4 Undertow is not carried (one difficulty\'s row)');
    for (const id of AREA_ABILITIES) {
      const r = a[id], d = ABILITIES[id];
      if (!r || !d || r.lane !== d.lane || Number(r.cd_ms) !== d.cdMs || Number(r.mana) !== d.mana || (r.rune || null) !== (d.rune || null) || Number(r.ammo) !== (d.ammo || 0) || r.active !== true) problems.push('AS-4 the server\'s ' + id + ' is not the data\'s: ' + short(r));
    }
  }
  { // the limits: one new row, and the two an apply must not roll back
    const b = Object.fromEntries(before.data.hr_hunt_limits.map((r) => [r.key, Number(r.value)])), a = Object.fromEntries(after.data.hr_hunt_limits.map((r) => [r.key, Number(r.value)]));
    const diff = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]);
    if (diff.join() !== 'spell_windup_min_ms' || a.spell_windup_min_ms !== SPELL_BOUNDS.windupMs[0]) problems.push('AS-4 the limits that moved: ' + diff.map((k) => k + ' ' + b[k] + ' -> ' + a[k]).join(', ') + ', want spell_windup_min_ms alone at ' + SPELL_BOUNDS.windupMs[0]);
    if (a.death_xp_permille !== DEATH_PM || 'death_xp_base' in a) problems.push('AS-4 the death share was rolled back: death_xp_permille ' + a.death_xp_permille + ', death_xp_base ' + a.death_xp_base);
    if (!(a.spell_windup_min_ms * a.block_mult >= a.swing_interval_ms)) problems.push('AS-3 the least windup ' + a.spell_windup_min_ms + ' x block_mult ' + a.block_mult + ' is under the swing interval ' + a.swing_interval_ms);
  }
  { // the world's shape: this engine's, its two new unit fields after the old ones' own order
    const b = before.data.hr_hunt_world_shape[0], a = after.data.hr_hunt_world_shape[0];
    if (!a || Number(a.shape) !== SHAPE || Number(a.version) !== Number(b.version)) problems.push('AS-4 the world shape on the server is ' + (a && a.shape) + ', the engine\'s ' + SHAPE);
    const names = (f) => Object.entries(f).sort((x, y) => x[1] - y[1]).map((x) => x[0]);
    const was = names(b.fields.unit), now = names(a.fields.unit);
    const added = now.filter((n) => !was.includes(n));
    if (added.sort().join() !== 'cast,spellCds' || !same(now.filter((n) => was.includes(n)), was)) problems.push('AS-4 the unit fields gained ' + added.join() + ' or lost their order');
    if (!same(a.fields.world, b.fields.world)) problems.push('AS-4 the world fields moved');
    if (!same(now, FIELDS.unit.map((f) => f[0]))) problems.push('AS-4 the server\'s unit fields are not world-state.js FIELDS');
    /* the move is journalled with the shape it replaced: a settle of the engine still writing that one is held, not counted against the hunt */
    const mv = after.data.hunt_world_shape_move[0];
    if (!mv || Number(mv.shape) !== SHAPE || Number(mv.prev_shape) !== Number(b.shape)) problems.push('AS-4 the shape move is journalled ' + short(mv) + ', want ' + b.shape + ' -> ' + SHAPE);
  }
  { // the rows an apply must not roll back, by name
    if (!same(before.data.hr_hunt_kill_bounds, after.data.hr_hunt_kill_bounds) || !before.data.hr_hunt_kill_bounds.length) problems.push('AS-4 a kill bound moved (one difficulty\'s)');
    if (!after.data.hr_hunt_end_reasons.some((r) => r.reason === 'runes_out')) problems.push('AS-4 runes_out is gone from the end reasons');
    if (!/runes_out/.test(after.checks)) problems.push('AS-4 runes_out is gone from hunt_sessions.end_reason\'s CHECK');
  }
  { // the rune spells: Hoarfrost and Spring Tide, every older spell as it was
    const b = before.runeSpells, a = after.runeSpells;
    const added = Object.keys(a).filter((k) => !(k in b)).sort();
    if (added.join() !== 'hoarfrost,spring_tide' || Object.keys(b).some((k) => !same(b[k], a[k]))) problems.push('AS-4 the rune spells gained ' + added.join() + ' or an older one moved');
  }
  /* AS-5, after: the same slots, accepted, and what the server stores names the spell */
  for (const [id, slot] of Object.entries(SLOT)) {
    const r = await check(slot);
    if (!r || r.ok !== true || !r.slot || r.slot.action.id !== id) problems.push('AS-5 after the area files a ' + id + ' slot answers ' + short(r, 200));
  }
  /* AS-6: a second apply, in order, self-checks included */
  for (const f of FILES) {
    try { await db.exec(sqlOf(f)); } catch (e) { problems.push('AS-6 a second apply of ' + f + ' raised: ' + String(e && e.message).split('\n')[0].slice(0, 200)); }
  }
  const again = await image(db);
  if (!same(again, after)) problems.push('AS-6 a second apply of the three files moved ' + (Object.keys(again.data).filter((t) => !same(again.data[t], after.data[t])).join(', ') || 'a constraint, a body or the rune spells'));
  await db.close?.();
  return problems;
}

const swap = (file, find, repl) => (f, sql) => {
  if (f !== file) return sql;
  if (sql.split(find).length !== 2) throw new Error('HARNESS: ' + file + ' holds ' + (sql.split(find).length - 1) + ' of ' + JSON.stringify(find.slice(0, 70)));
  return sql.replace(find, () => repl);
};
const TC = ABILITIES.turning_cut;
const TURNING_ROW = "  ('turning_cut', array[" + [...TC.disciplines].sort().map((d) => "'" + d + "'").join(', ') + "]::text[], '" + TC.lane + "', " + TC.cdMs + ', ' + TC.mana + ', null, ' + (TC.ammo || 0) + ', ';
const MUTANTS = [
  { name: 'the catalogue rolls the death share back to 2%', patch: swap(CAT, "  ('death_xp_permille', " + DEATH_PM + '),', "  ('death_xp_permille', 20),"), want: /AS-4 the limits that moved|AS-4 the death share/ },
  { name: 'the catalogue loses runes_out', patch: swap(CAT, "  ('runes_out', ", "  ('runes_gone', "), want: /AS-4/ },
  /* (the Barn Spider's kill bound row, whatever its numbers are today: one more gold a kill) */
  { name: 'the catalogue moves a kill bound', patch: (f, sql) => {
    if (f !== CAT) return sql;
    const re = /\n {2}\('barn_spider', (\d+), (\d+), '\{/g;
    if ((sql.match(re) || []).length !== 1) throw new Error('HARNESS: ' + CAT + ' holds ' + (sql.match(re) || []).length + ' kill bound rows of the Barn Spider');
    return sql.replace(re, (_, gold, xp) => "\n  ('barn_spider', " + (Number(gold) + 1) + ', ' + xp + ", '{");
  }, want: /AS-4 an apply moved hr_hunt_kill_bounds|AS-4 a kill bound/ },
  { name: 'a spell may wind up faster than the Defense bound covers', patch: swap(CAT, "  ('spell_windup_min_ms', " + SPELL_BOUNDS.windupMs[0] + '),', "  ('spell_windup_min_ms', 900),"), want: /AS-4 .* does not apply: .*Defense bound/ },
  /* (the row's numbers are the data's today, never typed: a re-tune moves the anchor with it) */
  { name: 'the catalogue forgets Turning Cut', patch: swap(CAT, TURNING_ROW + 'true, ', TURNING_ROW + 'false, '), want: /AS-4 .* does not apply: .*turning_cut/ },
  { name: 'Hoarfrost is no rune spell on the server', patch: swap(RUNES, '"hoarfrost":{', '"hoarfrost_x":{'), want: /AS-4 .* does not apply: .*hr_hunt_abilities/ },
  { name: 'the conditions forget the fight', patch: swap(COND, "  ('in_fight', 'bool', array['eq']::text[], null, null, '{}'::text[], false, '{}'::text[]),\n", ''), want: /AS-4 .* does not apply: .*VERIFY/ },
  /* the settle's side: a server that keeps the old shape refuses every world this engine stores */
  { name: 'the server keeps the old world shape', boot: { file: CAT, find: '(true, 1, ' + SHAPE + ', ', repl: '(true, 1, 95703826, ' }, want: /AS-1 browser closed: window 1 of/ },
];

async function main() {
  if (process.argv.includes('--mutate')) {
    let escaped = 0;
    for (const m of MUTANTS) {
      let got = [];
      try {
        if (m.boot) got = (await bothPaths(() => bootReplay({ patches: new Map([[m.boot.file, [[m.boot.find, m.boot.repl]]]]), upTo: RUNES }), 'fire')).problems;
        else got = await rowsOnly(m.patch);
      } catch (e) { got = ['THREW ' + String(e && e.message).slice(0, 200)]; }
      const hit = got.some((p) => m.want.test(p));
      if (!hit) escaped++;
      console.log('  ' + (hit ? 'caught ' : 'ESCAPED') + ' ' + m.name + ': ' + (got.find((p) => m.want.test(p)) || got[0] || 'every check held').slice(0, 170));
    }
    console.log(escaped ? 'area-spells-server --mutate: ' + escaped + ' ESCAPED' : 'area-spells-server --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' caught');
    process.exitCode = escaped ? 1 : 0;
    return;
  }
  const both = await bothPaths(() => bootReplay());
  const problems = [...both.problems, ...await rowsOnly()];
  for (const p of problems) console.log('FAIL  ' + p);
  console.log('  AS-3 the most Defense XP a hero earned is ' + (both.share * 100).toFixed(1) + '% of the Defense term the settle allows for the same span');
  console.log(problems.length ? 'area-spells-server: ' + problems.length + ' FAILED'
    : 'area-spells-server: green (a monster\'s spell on a four and three hero area abilities on both paths, the Defense bound has room, only the area rows differ, refused before and accepted after, a second apply moves nothing)');
  process.exitCode = problems.length ? 1 : 0;
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
