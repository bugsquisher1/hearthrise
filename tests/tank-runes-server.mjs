#!/usr/bin/env node
// tests/tank-runes-server.mjs — THE TANK RUNE SPELLS' SERVER HALF (lane/b-tank-runes; Tyler 2026-11-19: "tanks should have rune spells that are
// tank spells", "Tank spells should be party only I think"; the board's "2026-11-19 Tank rune spells"; CLAUDE.md §1, §4, §6). The two staged
// files, on the replayed chain (PGlite):
//   2027-05-25-tank-runes-hunt-sessions-catalogue.generated.sql, 2027-05-25-tank-runes-rune-spells.generated.sql
//
//   node tests/tank-runes-server.mjs            the guard
//   node tests/tank-runes-server.mjs --mutate   the proof: each planted defect turns it red
//
// THE MEASURE: the shipped world tick and the viewed hello (tools/settle-cost.mjs) on the Coppercap Warrens' own rows (the Goblin Diggers cast a
// whole-group spell), a shield tank at Level 38 whose bar Configure action saved: Frost Slam on the shop's Plain Ice Rune and Shelter on the
// Plain Earth Rune, each on the rule a new slot starts with (abilities.js suggestedTrigger), then the Challenge and Power Strike.
//   TR-1 BOTH PATHS, IN A PARTY (the tank and a Healer): the bars are saved through the real verb (hr_action_set_options: the server's own bar
//        check); every window lands on both doors with nothing refused; the tank buys the Plain Ice Rune (Frost Slam cast) and the Plain Earth Rune
//        (Shelter cast) and deals no damage as Frost Slam (it lands no blow); the two doors store the same world and the same tallies; the viewer's
//        answers carry Frost Slam's casts with Chill landing on monsters and Shelter's shells on both heroes.
//   TR-2 ALONE THE TANK CASTS NEITHER (party only): the same tank and bar, alone, browser closed: every window lands and it buys neither rune.
//   TR-3 ONLY THE TANK ROWS DIFFER: on the chain before the two files every table, constraint and function is read, the two files are applied,
//        and all of it is read again. What moved is exactly: two abilities (the older rows' `ord` only), the world's shape with one new unit field
//        (shieldBy, after the old ones in their order) and its journalled move, and two rune spells on skill melee.
//   TR-4 BEFORE AND AFTER: before the two files the tank's two slots are refused (hr_hunt_slot_check); after, accepted.
//   TR-5 A SECOND APPLY of the two files, in order, self-checks included, moves nothing.
import { isMain } from './_is-main.mjs';
import { bootReplay, manifest } from './schema-replay.mjs';
import { prepare } from '../tools/settle-cost.mjs';
import { ABILITIES, suggestedTrigger } from '../src/data/abilities.js';
import { SHAPE, FIELDS } from '../src/core/hunt/world-state.js';
import { readFileSync, mkdtempSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CAT = '2027-05-25-tank-runes-hunt-sessions-catalogue.generated.sql';
const RUNES = '2027-05-25-tank-runes-rune-spells.generated.sql';
const FILES = Object.freeze([CAT, RUNES]);
const sqlOf = (f) => readFileSync(join(ROOT, 'supabase', 'migrations', f), 'utf8').replace(/\r\n/g, '\n');
const WARRENS = 'coppercap_warrens';
const ANCHOR = Date.UTC(2026, 10, 1, 12, 0, 0);
const WINDOWS = 5, WINDOW_MS = 90000;
const TANK_SPELLS = Object.freeze(['frost_slam', 'shelter']);

const one = async (db, sql, params) => { const r = await db.query(sql, params); const row = r.rows[0]; return row ? row[Object.keys(row)[0]] : null; };
const rowsOf = async (db, sql, params) => (await db.query(sql, params)).rows;
const short = (v, n = 260) => JSON.stringify(v).slice(0, n);

const PLATE = { helmet: 'steel_helm', body: 'steel_platebody', pants: 'steel_platelegs', boots: 'steel_boots' };
const GEAR = [{ ...PLATE, weapon: 'steel_sword', shield: 'coppercap_shield' }, { ...PLATE, weapon: 'maple_staff', shield: null }];
const food = { action: { type: 'consume', id: 'cooked_shrimp' }, conditions: [{ metric: 'self_hp_pct', op: 'lt', value: 70 }], join: 'and' };
const drink = { action: { type: 'consume', id: 'thin_turnip_juice' }, conditions: [{ metric: 'self_mana_pct', op: 'lt', value: 40 }], join: 'and' };
/* the slots as Configure action sends them: each tank spell on its store rune and the rule a new slot starts with */
const ab = (id, extra, conditions) => ({ action: { type: 'ability', id, ...(extra || {}) }, conditions: conditions || [], join: 'and' });
const SLOT = Object.freeze({
  frost_slam: ab('frost_slam', { store: 'plain_ice_rune' }, suggestedTrigger(ABILITIES.frost_slam)),
  shelter: ab('shelter', { store: 'plain_earth_rune' }, suggestedTrigger(ABILITIES.shelter)),
});
const TANK_BAR = [SLOT.frost_slam, SLOT.shelter, ab('challenge'), ab('power_strike'), food, drink];

/* One door: the tank (and a Healer on its role's defaults, `heroes` 2), what the chain holds after it. */
async function door(db, which, heroes, edgeRoot) {
  const refusedBars = [];
  const run = await prepare({ heroes, windows: WINDOWS, windowMs: WINDOW_MS, hunt: WARRENS, door: which, db, level: 38, anchorMs: ANCHOR, gear: (i) => GEAR[i], edgeRoot,
    beforeEnter: async ({ db: d, uids, asUser, one: ask, idem }) => {
      await asUser(uids[0]);
      const r = await ask(d, 'select public.hr_action_set_options(0, 0, $1::jsonb, $2::uuid)', [JSON.stringify({ slots: TANK_BAR }), idem()]);
      if (!r || r.ok !== true) refusedBars.push('the tank ' + short(r, 160));
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
    seats.push({ seat: i, kills: Number(t.kills || 0), xp: t.xp || {}, dealt: t.dealt || {}, taken: t.taken || {}, healed: t.healed || {}, bought, ended: s.end_reason || null });
  }
  const world = await one(db, 'select world::text from public.hunt_instances where id = $1', [run.instance]);
  const refusals = Number(await one(db, 'select coalesce(sum(n), 0) from public.hr_rejections where user_id = any($1::uuid[])', [run.users]));
  const answers = which === 'viewed' ? (await run.evidence()).answers : [];
  return { landed, threw, refusedBars, seats, world, refusals, answers };
}

const by = (s, id) => Number(((s.dealt || {}).byAbility || {})[id] || 0);
/* every event object the viewer's answers carry */
function eventsOf(answers) {
  const out = [];
  const walk = (v) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') { if (typeof v.type === 'string' && Number.isInteger(v.atMs)) out.push(v); else Object.values(v).forEach(walk); } };
  walk(answers);
  return out;
}

/* TR-1 over both doors (`o.doors`: fewer), TR-2 on the tick's door alone (`o.lone`, on by default). `boot` answers a fresh chain; `o.edgeRoot` a planted engine for the lone arm. */
async function bothPaths(boot, o = {}) {
  const problems = [];
  const got = {};
  for (const which of o.doors || ['fire', 'viewed']) got[which] = await door((await boot()).db, which, 2);
  for (const [which, r] of Object.entries(got)) {
    const name = which === 'fire' ? 'browser closed' : 'hunt viewed';
    if (r.refusedBars.length) problems.push('TR-1 ' + name + ': the server refused the tank\'s bar: ' + r.refusedBars.join('; '));
    if (r.threw || r.landed !== WINDOWS + 1) problems.push('TR-1 ' + name + ': window ' + (r.landed + 1) + ' of ' + (WINDOWS + 1) + ' did not land: ' + r.threw);
    if (r.refusals) problems.push('TR-1 ' + name + ': the server journalled ' + r.refusals + ' refusal(s)');
    if (r.seats.some((s) => s.ended)) problems.push('TR-1 ' + name + ': a hunt ended: ' + r.seats.map((s) => s.ended).join());
    const t = r.seats[0];
    if (!(t.bought.plain_ice_rune > 0)) problems.push('TR-1 ' + name + ': the tank bought no Plain Ice Rune (Frost Slam never cast in a party): ' + short(t.bought));
    if (!(t.bought.plain_earth_rune > 0)) problems.push('TR-1 ' + name + ': the tank bought no Plain Earth Rune (Shelter never cast in a party): ' + short(t.bought));
    if (by(t, 'frost_slam')) problems.push('TR-1 ' + name + ': Frost Slam dealt ' + by(t, 'frost_slam') + ' damage (it lands no blow)');
  }
  if (got.viewed) {
    const ev = eventsOf(got.viewed.answers);
    const casts = (id) => ev.filter((e) => e.type === 'cast' && e.ability === id);
    const slam = casts('frost_slam'), shell = casts('shelter');
    const tank = slam.length ? slam[0].u : null;
    const chilled = ev.filter((e) => e.type === 'status_on' && e.status === 'chill').length;
    const shells = new Set(ev.filter((e) => e.type === 'shield' && e.u === tank).map((e) => e.t));
    console.log('  TR-1 hunt viewed: ' + slam.length + ' Frost Slams, ' + chilled + ' chills landed; ' + shell.length + ' Shelters, shells on ' + shells.size + ' hero(es)');
    if (!slam.length || !chilled) problems.push('TR-1 hunt viewed: ' + slam.length + ' Frost Slam cast(s) and ' + chilled + ' chill(s) on the viewer\'s answers');
    if (!shell.length || shells.size < 2) problems.push('TR-1 hunt viewed: ' + shell.length + ' Shelter cast(s), shells from the tank on ' + shells.size + ' hero(es), want both');
    if (ev.some((e) => e.type === 'dmg' && e.ability === 'frost_slam')) problems.push('TR-1 hunt viewed: a Frost Slam struck a blow');
  }
  if (got.fire && got.viewed) {
    if (got.fire.world !== got.viewed.world) problems.push('TR-1 the two doors stored different worlds');
    const a = JSON.stringify(got.fire.seats), b = JSON.stringify(got.viewed.seats);
    if (a !== b) problems.push('TR-1 browser closed and hunt viewed wrote different tallies: ' + a.slice(0, 200) + ' vs ' + b.slice(0, 200));
  }
  if (o.lone !== false) {
    /* TR-2: the tank alone, browser closed */
    const lone = await door((await boot()).db, 'fire', 1, o.edgeRoot);
    if (lone.refusedBars.length) problems.push('TR-2 alone: the server refused the tank\'s bar: ' + lone.refusedBars.join('; '));
    if (lone.threw || lone.landed !== WINDOWS + 1) problems.push('TR-2 alone: window ' + (lone.landed + 1) + ' of ' + (WINDOWS + 1) + ' did not land: ' + lone.threw);
    const t = lone.seats[0] || { bought: {} };
    if (t.bought.plain_ice_rune || t.bought.plain_earth_rune) problems.push('TR-2 alone: the tank cast a party-only spell (bought ' + short(t.bought) + ')');
    if (!(t.kills > 0)) problems.push('TR-2 alone: CONTROL: the lone tank killed nothing');
  }
  return problems;
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

/* TR-3, TR-4, TR-5 on the chain as it stands before the two files. `patch(file, sql)`: a mutant's edit to a file's text. */
async function rowsOnly(patch, reorder) {
  const problems = [];
  const order = reorder ? reorder((await manifest()).order.slice()) : (await manifest()).order;
  const at = order.indexOf(CAT);
  if (at < 1 || order.slice(at, at + FILES.length).join() !== FILES.join()) return ['TR-3 HARNESS: the two tank files are not in the chain, together and in order: ' + order.slice(Math.max(0, at), at + FILES.length + 1).join()];
  const { db } = await bootReplay({ upTo: order[at - 1] });
  const check = (slot) => one(db, 'select public.hr_hunt_slot_check($1::jsonb)', [JSON.stringify(slot)]);
  for (const [id, slot] of Object.entries(SLOT)) {
    const r = await check(slot);
    if (r && r.ok === true) problems.push('TR-4 before the tank files the server already accepts a ' + id + ' slot: the control is dead');
  }
  const before = await image(db);
  for (const f of FILES) {
    try { await db.exec(patch ? patch(f, sqlOf(f)) : sqlOf(f)); } catch (e) { problems.push('TR-3 ' + f + ' does not apply: ' + String(e && e.message).split('\n')[0].slice(0, 220)); return problems; }
  }
  const after = await image(db);
  /* (hunt_world_shape_move is the shape's own journal: 2026-12-11-hunt-deploy-no-forfeit.sql holds an old engine's settles, never counts them) */
  const MAY = ['hr_hunt_abilities', 'hr_hunt_world_shape', 'hunt_world_shape_move'];
  const moved = Object.keys(after.data).filter((t) => !same(before.data[t], after.data[t]));
  const stray = moved.filter((t) => !MAY.includes(t));
  if (stray.length) problems.push('TR-3 an apply moved ' + stray.join(', ') + ': only ' + MAY.join(', ') + ' may move');
  if (Object.keys(before.data).join() !== Object.keys(after.data).join()) problems.push('TR-3 an apply made or dropped a table');
  if (before.checks !== after.checks) problems.push('TR-3 an apply moved a constraint');
  const fnMoved = [...new Set([...Object.keys(before.fns), ...Object.keys(after.fns)])].filter((f) => before.fns[f] !== after.fns[f]);
  if (fnMoved.join() !== 'hr_hunt_rune_spells()') problems.push('TR-3 the function bodies or grants that moved: ' + (fnMoved.join(', ') || 'none') + ', want hr_hunt_rune_spells() alone');
  { // the abilities: the two, and nothing of an older row but its order
    const b = byKey(before.data.hr_hunt_abilities, 'ability_id'), a = byKey(after.data.hr_hunt_abilities, 'ability_id');
    const added = Object.keys(a).filter((k) => !b[k]).sort();
    if (added.join() !== [...TANK_SPELLS].sort().join() || Object.keys(b).some((k) => !a[k])) problems.push('TR-3 the abilities gained ' + added.join() + ', want ' + TANK_SPELLS.join());
    for (const k of Object.keys(b)) {
      const was = { ...b[k] }, now = { ...(a[k] || {}) };
      delete was.ord; delete now.ord;
      if (!same(was, now)) problems.push('TR-3 the ability ' + k + ' moved beyond its order: ' + short(was, 140) + ' -> ' + short(now, 140));
    }
    for (const id of TANK_SPELLS) {
      const r = a[id], d = ABILITIES[id];
      if (!r || !d || r.lane !== d.lane || Number(r.cd_ms) !== d.cdMs || Number(r.mana) !== d.mana || (r.rune || null) !== (d.rune || null) || Number(r.ammo) !== (d.ammo || 0)
        || r.active !== true || JSON.stringify(r.disciplines) !== '["shield"]') problems.push('TR-3 the server\'s ' + id + ' is not the data\'s shield row: ' + short(r));
    }
  }
  { // the world's shape: this engine's, its one new unit field after the old ones' own order
    const b = before.data.hr_hunt_world_shape[0], a = after.data.hr_hunt_world_shape[0];
    if (!a || Number(a.shape) !== SHAPE || Number(a.version) !== Number(b.version)) problems.push('TR-3 the world shape on the server is ' + (a && a.shape) + ', the engine\'s ' + SHAPE);
    const names = (f) => Object.entries(f).sort((x, y) => x[1] - y[1]).map((x) => x[0]);
    const was = names(b.fields.unit), now = names(a.fields.unit);
    const added = now.filter((n) => !was.includes(n));
    if (added.join() !== 'shieldBy' || !same(now.filter((n) => was.includes(n)), was)) problems.push('TR-3 the unit fields gained ' + (added.join() || 'nothing') + ' or lost their order, want shieldBy alone');
    if (!same(a.fields.world, b.fields.world)) problems.push('TR-3 the world fields moved');
    if (!same(now, FIELDS.unit.map((f) => f[0]))) problems.push('TR-3 the server\'s unit fields are not world-state.js FIELDS');
    const mv = (after.data.hunt_world_shape_move || []).find((m) => Number(m.shape) === SHAPE);
    if (!mv || Number(mv.prev_shape) !== Number(b.shape)) problems.push('TR-3 the shape move is journalled ' + short(after.data.hunt_world_shape_move) + ', want ' + b.shape + ' -> ' + SHAPE);
  }
  { // the rune spells: the two on Melee, every older spell as it was
    const b = before.runeSpells, a = after.runeSpells;
    const added = Object.keys(a).filter((k) => !(k in b)).sort();
    if (added.join() !== [...TANK_SPELLS].sort().join() || Object.keys(b).some((k) => !same(b[k], a[k]))) problems.push('TR-3 the rune spells gained ' + added.join() + ' or an older one moved');
    for (const id of TANK_SPELLS) if (!a[id] || a[id].skill !== 'melee') problems.push('TR-3 the server reads ' + id + '\'s rune versions on ' + (a[id] && a[id].skill) + ', want melee (the shield\'s skill)');
  }
  for (const [id, slot] of Object.entries(SLOT)) {
    const r = await check(slot);
    if (!r || r.ok !== true || !r.slot || r.slot.action.id !== id) problems.push('TR-4 after the tank files a ' + id + ' slot answers ' + short(r, 200));
  }
  for (const f of FILES) {
    try { await db.exec(sqlOf(f)); } catch (e) { problems.push('TR-5 a second apply of ' + f + ' raised: ' + String(e && e.message).split('\n')[0].slice(0, 200)); }
  }
  const again = await image(db);
  if (!same(again, after)) problems.push('TR-5 a second apply of the two files moved ' + (Object.keys(again.data).filter((t) => !same(again.data[t], after.data[t])).join(', ') || 'a constraint, a body or the rune spells'));
  await db.close?.();
  return problems;
}

const swap = (file, find, repl) => (f, sql) => {
  if (f !== file) return sql;
  if (sql.split(find).length !== 2) throw new Error('HARNESS: ' + file + ' holds ' + (sql.split(find).length - 1) + ' of ' + JSON.stringify(find.slice(0, 70)));
  return sql.replace(find, () => repl);
};
/* An engine planted with `edits` ([file, from, to], each anchor once), for the lone arm: the copy holds the edge, src/core and src/data. */
function plantEngine(edits) {
  const dir = mkdtempSync(join(tmpdir(), 'tank-runes-'));
  for (const d of ['src/core', 'src/data', 'supabase/functions/hr-accrue']) cpSync(join(ROOT, d), join(dir, d), { recursive: true, filter: (f) => !/\.(png|webp)$/i.test(f) });
  cpSync(join(ROOT, 'src/build-info.js'), join(dir, 'src/build-info.js'));
  for (const [file, from, to] of edits) {
    const p = join(dir, file), src = readFileSync(p, 'utf8');
    if (src.split(from).length !== 2) { rmSync(dir, { recursive: true, force: true }); throw new Error('HARNESS: ' + file + ' anchor not found once: ' + from.slice(0, 70)); }
    writeFileSync(p, src.replace(from, () => to));
  }
  return { root: dir, done: () => rmSync(dir, { recursive: true, force: true }) };
}
const D = ABILITIES.frost_slam;
const MUTANTS = [
  { name: 'the catalogue forgets Frost Slam', patch: swap(CAT, "  ('frost_slam', array['shield']::text[], 'support', " + D.cdMs + ', ' + D.mana + ", 'chalked_ice_rune', 0, true, ", "  ('frost_slam', array['shield']::text[], 'support', " + D.cdMs + ', ' + D.mana + ", 'chalked_ice_rune', 0, false, "), want: /TR-3 .* does not apply|TR-3 the server's frost_slam/ },
  { name: 'Shelter belongs to another discipline on the server', patch: swap(CAT, "  ('shelter', array['shield']::text[], ", "  ('shelter', array['sword']::text[], "), want: /TR-3 .* does not apply: .*shelter|TR-3 the server's shelter|TR-4/ },
  { name: 'the rune spells read Frost Slam on Magic', patch: swap(RUNES, '"frost_slam":{"skill":"melee"', '"frost_slam":{"skill":"magic"'), want: /TR-3 the server reads frost_slam/ },
  { name: 'the rune spells lose Shelter', patch: (f, sql) => (f !== RUNES ? sql : sql.replace(/"shelter":\{[^}]*\{[^}]*\}[^}]*\{[^}]*\}\},?/, '')), want: /TR-3 .* does not apply|TR-3 the rune spells gained/ },
  { name: 'the catalogue drops shieldBy from the world fields', patch: (f, sql) => (f !== CAT ? sql : sql.replace(/"shieldBy":\d+,/, '')), want: /TR-3 .* does not apply|TR-3 the unit fields/ },
  { name: 'the rune spells apply before the catalogue', reorder: (o) => { const i = o.indexOf(CAT); [o[i], o[i + 1]] = [o[i + 1], o[i]]; return o; }, want: /TR-3 HARNESS/ },
  { name: 'the server keeps the old world shape', boot: { file: CAT, find: '(true, 1, ' + SHAPE + ', ', repl: '(true, 1, 95703826, ' }, want: /TR-1 browser closed: window 1 of/ },
  { name: 'a party-only spell casts alone (the engine)', engine: [['src/core/hunt/abilities.js', "    && (!solo || !partyOnly(ABILITIES[r.slot.action.id], hero.role))\n", '']], want: /TR-2 alone: the tank cast a party-only spell/ },
];

async function main() {
  if (process.argv.includes('--mutate')) {
    let escaped = 0;
    for (const m of MUTANTS) {
      let got = [];
      try {
        if (m.boot) got = await bothPaths(() => bootReplay({ patches: new Map([[m.boot.file, [[m.boot.find, m.boot.repl]]]]), upTo: RUNES }), { doors: ['fire'], lone: false });
        else if (m.engine) {
          const p = plantEngine(m.engine);
          try { got = await bothPaths(() => bootReplay(), { doors: [], edgeRoot: p.root }); } finally { p.done(); }
        } else got = await rowsOnly(m.patch, m.reorder);
      } catch (e) { got = ['THREW ' + String(e && e.message).slice(0, 200)]; }
      const hit = got.some((p) => m.want.test(p));
      if (!hit) escaped++;
      console.log('  ' + (hit ? 'caught ' : 'ESCAPED') + ' ' + m.name + ': ' + (got.find((p) => m.want.test(p)) || got[0] || 'every check held').slice(0, 170));
    }
    console.log(escaped ? 'tank-runes-server --mutate: ' + escaped + ' ESCAPED' : 'tank-runes-server --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' caught');
    process.exitCode = escaped ? 1 : 0;
    return;
  }
  const problems = [...await bothPaths(() => bootReplay()), ...await rowsOnly()];
  for (const p of problems) console.log('FAIL  ' + p);
  console.log(problems.length ? 'tank-runes-server: ' + problems.length + ' FAILED'
    : 'tank-runes-server: green (Frost Slam and Shelter on both paths in a party and never alone, only the tank rows differ, refused before and accepted after, a second apply moves nothing)');
  process.exitCode = problems.length ? 1 : 0;
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
