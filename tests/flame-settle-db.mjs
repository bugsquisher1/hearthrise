#!/usr/bin/env node
// tests/flame-settle-db.mjs — THE INNER FLAME IN THE SETTLE IS THE SERVER'S, BOTH PATHS (1074-inner-flame-luck.sql, lane/f1-inner-flame,
// backend-architect, 2026-11-27; 20-v030-the-roads.md F1, 21-flame-temper-imbue-loot.md section 1, CLAUDE.md §1, §4 both paths, §6).
//
//   node tests/flame-settle-db.mjs            the guard
//   node tests/flame-settle-db.mjs --mutate   the proof: each planted SQL or edge defect turns its case red
//
// THE MEASURE: the replayed chain (PGlite), the shipped world tick (browser closed, the `fire` door) and the viewed hello (hunt viewed, the
// `viewed` door) through tools/settle-cost.mjs, the real engine, a Level 60 four of steel on Muster Barrows on Steady (trait-pieces-db's),
// each hero its own account, every fire at 12,000 milli-points when its hunt begins.
//   FS-1 DARK: with the switches as applied (off) the read says no `flame`, the edge proposes no claim, a hunt freezes no luck, burns no
//        Remains and leaves the fire as it was; a commit that carries a claim anyway is refused flame_dark.
//   FS-2 THE DEFAULT STOKE RULE, BOTH PATHS: with inner_flame and trait_drops lit, the closed and the viewed hunt from one anchor store the
//        SAME fires (height, Flame XP, carry, Level) and the same Remains burned for every hero; Keep full (the default) burns some and keeps
//        every fire under its room; each hero's bag holds exactly what the same hunt on Off holds less what it burned (the gross is the net
//        plus the burn, never more); each hero's hunt journal names its burn; the read hands each hero the luck its hunt froze as it began,
//        after its fire moved; on Off nothing burns and the fire only burns down.
//   FS-5 THE DROPS AT THE FROZEN LUCK, BOTH PATHS: Rare hours planted short, every fire full when its hunt begins: the closed and the viewed
//        hunt store the same pieces and pity, and the pity differs from the same hunt on an empty fire (the luck reached the roll).
//   FS-3 THE CUT: the same closed hunt settled in 45-second windows stores the same fires, burns and bags as in 90-second windows.
//   FS-4 THE BOUNDS, THROUGH THE REAL COMMIT: a claim the edge proposes, tampered (more of an item than the delta carries, an instant past the
//        hero's span, a seq out of order, a malformed entry), refuses the whole settle with its code and moves no fire; the untampered
//        proposal then lands.
//
// mutant-anchors: supabase/migrations/1074-inner-flame-luck.sql supabase/functions/hr-accrue/hunt-settle.js src/core/hunt-rewards.js
// ci-step: db-replay | Inner Flame in the settle - the walk both paths and any cut, luck frozen per hunt, the claim bounds (1074)
// ci-run: node tests/flame-settle-db.mjs
// ci-run: node tools/mutant-gate.mjs node tests/flame-settle-db.mjs --mutate
import { isMain } from './_is-main.mjs';
import { bootReplay, closeReplays } from './schema-replay.mjs';
import { prepare } from '../tools/settle-cost.mjs';
import { plant } from './hunt-core/fixtures/h1.js';
import { FLAME_FUEL } from '../src/data/inner-flame.js';
import { DANGER_GROUNDS } from '../src/data/danger.js';
import { GROUND_PACKS } from '../src/data/grounds/index.js';
import { foldedPacks } from '../tools/pack/whole.mjs';
import { OUT_NAME as FLAME_OUT } from '../tools/gen-flame-temper.mjs';

const MUSTER = 'muster_barrows';
const ANCHOR = Date.UTC(2026, 10, 1, 12, 0, 0);
const HELD = 20;
const START_MPTS = 12000;
const GEAR = Object.freeze({ helmet: 'steel_helm', body: 'steel_platebody', pants: 'steel_platelegs', boots: 'steel_boots', weapon: 'steel_sword', shield: 'coppercap_shield' });
/* the fuel the server holds: 1069 (tools/gen-flame-temper.mjs) renders the whole view, the scale grounds of the packs it folds, so a
   staged pack's Remains (the Roost's dragon bones and scale) burn only once that pack ships (lane/flame-temper-shipped-packs) */
const FOLDED = new Set(foldedPacks(FLAME_OUT));
const SERVED_DROPS = new Set(GROUND_PACKS.filter((p) => FOLDED.has(p.id) && Object.prototype.hasOwnProperty.call(DANGER_GROUNDS, p.id))
  .flatMap((p) => Object.values(p.monsters || {}).flatMap((m) => (m.drops || []).map((d) => d.id))));
const FUEL = FLAME_FUEL.map((r) => r.item).filter((item) => SERVED_DROPS.has(item));
const one = async (db, sql, params) => { const r = await db.query(sql, params); const row = r.rows[0]; return row ? row[Object.keys(row)[0]] : null; };
const exec = (db) => async (text, params) => { await db.exec('set role hr_engine'); try { return (await db.query(text, params)).rows; } finally { await db.exec('reset role'); } };

/* the plan and held step (trait-pieces-db's), the switches, each account's fire and stoke rule, set before anyone enters */
const fixture = ({ lit = false, keep = 'full', start = START_MPTS, flags = [] }) => async ({ db, uids, asUser, one: q, idem: id }) => {
  for (const uid of uids) {
    await db.query('insert into public.hunt_density (user_id, slot, hunt_id, density, danger_held) values ($1, 0, $2, 0, $3) on conflict (user_id, slot, hunt_id) do update set danger_held = excluded.danger_held', [uid, MUSTER, HELD]);
    await db.query(`insert into public.company_flame (user_id, height_mpts, stoke) values ($1, $2, jsonb_build_object('keep', $3::text, 'own_first', true, 'buy_per_day', 0, 'cap_hours_pm', 0, 'sell_rest', false))
                    on conflict (user_id) do update set height_mpts = excluded.height_mpts, stoke = excluded.stoke`, [uid, start, keep]);
  }
  await asUser(uids[0]);
  const r = await q(db, 'select public.hr_hunt_risk_set(0, $1, $2::uuid)', ['steady', id()]);
  if (!r || r.ok !== true) throw new Error('the stance was refused: ' + JSON.stringify(r).slice(0, 200));
  await db.query("update public.hr_flags set enabled = $1 where key in ('inner_flame', 'trait_drops')", [lit]);
  if (flags.length) await db.query('update public.hr_flags set enabled = true where key = any ($1::text[])', [flags]);
};

const EVIDENCE = [];
async function door(db, which, o = {}) {
  const windowMs = o.windowMs || 90000, windows = o.windows || 4;
  const run = await prepare({ heroes: 4, windows, windowMs, hunt: MUSTER, door: which, db, level: 60, anchorMs: ANCHOR, gear: GEAR,
    edgeRoot: o.edgeRoot, beforeEnter: fixture(o) });
  await run.warm();
  for (let w = 2; w <= windows + 1; w++) await run.step(w);
  const inst = (await db.query('select id, refusals from public.hunt_instances where hunt_id = $1', [MUSTER])).rows[0];
  return { run, db, inst, users: run.users, sessions: run.sessions };
}

/* what the server stores: every fire, every hunt's flame and every bag's Remains, by seat */
async function stored(db) {
  const fires = (await db.query(`select s.seat, f.height_mpts::text as h, f.flame_points::text as p, f.carry_ms::text as c, f.flame_level as l
      from public.company_flame f join public.hunt_sessions s on s.user_id = f.user_id and s.hunt_id = $1 order by s.seat`, [MUSTER])).rows;
  const hunts = (await db.query(`select s.seat, h.luck_pm, h.top, h.units::text as units, h.burned from public.hunt_flame h
      join public.hunt_sessions s on s.id = h.session_id where s.hunt_id = $1 order by s.seat`, [MUSTER])).rows;
  const bags = (await db.query(`select s.seat, i.item_id, i.qty::text as qty from public.player_inventory i
      join public.hunt_sessions s on s.user_id = i.user_id and s.slot = i.slot and s.hunt_id = $1 where i.item_id = any ($2::text[]) order by s.seat, i.item_id`, [MUSTER, FUEL])).rows;
  const journal = (await db.query(`select s.seat, l.meta->'flame'->'burned' as burned from public.player_ledger l
      join public.hunt_sessions s on s.id = l.session_id and s.hunt_id = $1 where l.meta ? 'flame' order by s.seat, l.id`, [MUSTER])).rows;
  return { fires, hunts, bags, journal };
}
const canon = (x) => JSON.stringify(x);
const bagOf = (rows, seat) => Object.fromEntries(rows.filter((r) => r.seat === seat).map((r) => [r.item_id, Number(r.qty)]));

async function dark(boot) {
  const problems = [];
  const r = await door((await boot()).db, 'fire', { lit: false });
  if (Number(r.inst.refusals) !== 0) problems.push('FS-1 ' + r.inst.refusals + ' window(s) refused');
  const read = await one(r.db, 'select public.hr_hunt_instance_read($1::uuid, 0)', [r.users[0]]);
  if (!read || read.open !== true) return [...problems, 'FS-1 CONTROL: the hunt is not open'];
  if (read.instance.flame !== null) problems.push('FS-1 the read says flame ' + JSON.stringify(read.instance.flame));
  const s = await stored(r.db);
  if (s.hunts.length || s.journal.length || s.fires.some((f) => Number(f.h) !== START_MPTS || Number(f.p) !== 0)) problems.push('FS-1 a dark hunt moved a fire: ' + canon(s).slice(0, 300));
  if (!s.bags.some((b) => Number(b.qty) > 0)) problems.push('FS-1 CONTROL: no Remains dropped');
  const M = await (await import('./hunt-sessions-settle.mjs')).HARNESS.loadEdge((await import('./hunt-sessions-settle.mjs')).HARNESS.ROOT);
  const nowMs = Number(await one(r.db, 'select floor(extract(epoch from now()) * 1000)::bigint'));
  const plan = await M.HS.readHuntSettle({ exec: exec(r.db), user: r.users[0], slot: 0, atMs: nowMs }, 'tick');
  if (plan.answer) return [...problems, 'FS-1 CONTROL: no window to propose (' + plan.answer.reason + ')'];
  const p = await M.HS.proposeHuntSettle(plan, plan.toMs, 0);
  if (!p.commit) return [...problems, 'FS-1 CONTROL: nothing proposed (' + p.out.reason + ')'];
  if (p.commit.members.some((m) => 'flame' in m)) problems.push('FS-1 the edge proposed a claim on a dark read');
  const forged = { ...p.commit, members: p.commit.members.map((m, i) => (i ? m : { ...m, flame: [] })) };
  const res = await M.HS.commitHuntSettle(exec(r.db), { ...forged, project: null });
  if (!res || res.ok !== false || res.error !== 'flame_dark') problems.push('FS-1 a dark commit carrying a claim answered ' + canon(res).slice(0, 160));
  return problems;
}

async function bothPaths(boot, o = {}) {
  const problems = [];
  const edge = o.edits && o.edits.length ? plant(o.edits, ['supabase/functions/hr-accrue']) : null;
  try {
    const closed = await door((await boot()).db, 'fire', { lit: true, edgeRoot: edge && edge.root });
    const viewed = await door((await boot()).db, 'viewed', { lit: true, edgeRoot: edge && edge.root });
    const off = await door((await boot()).db, 'fire', { lit: true, keep: 'off', edgeRoot: edge && edge.root });
    for (const [name, r] of [['browser closed', closed], ['hunt viewed', viewed], ['Off', off]]) if (Number(r.inst.refusals) !== 0) problems.push('FS-2 ' + name + ': ' + r.inst.refusals + ' window(s) refused');
    const a = await stored(closed.db), b = await stored(viewed.db), z = await stored(off.db);
    const burned = a.hunts.reduce((n, h) => n + Number(h.units), 0);
    EVIDENCE.push('FS-2 Keep full burned ' + burned + ' Remains over ' + a.hunts.length + ' hunts; fires ' + a.fires.map((f) => f.h).join('/') + ' mpts from ' + START_MPTS + '; doors ' + (canon(a) === canon(b) ? 'identical' : 'DIFFER') + '; Off fires ' + z.fires.map((f) => f.h).join('/'));
    if (canon(a) !== canon(b)) problems.push('FS-2 the doors stored different fires:\n      closed ' + canon(a).slice(0, 400) + '\n      viewed ' + canon(b).slice(0, 400));
    if (!(burned > 0) || a.hunts.length !== 4) problems.push('FS-2 CONTROL: Keep full burned ' + burned + ' Remains over ' + a.hunts.length + ' frozen hunts');
    const room = Number(await one(closed.db, 'select public.hr_flame_room_mpts(1)'));
    if (a.fires.some((f) => Number(f.h) > room)) problems.push('FS-2 a fire stands over its room ' + room + ': ' + canon(a.fires));
    /* the gross is the net plus the burn: the same hunt on Off holds exactly the burned Remains more */
    for (const h of a.hunts) {
      const net = bagOf(a.bags, h.seat), gross = bagOf(z.bags, h.seat);
      for (const item of FUEL) {
        if ((gross[item] || 0) !== (net[item] || 0) + (h.burned[item] || 0)) { problems.push('FS-2 seat ' + h.seat + ' ' + item + ': Off holds ' + (gross[item] || 0) + ', Keep full ' + (net[item] || 0) + ' and burned ' + (h.burned[item] || 0)); break; }
      }
      const named = a.journal.filter((j) => j.seat === h.seat).reduce((m, j) => { for (const [k, v] of Object.entries(j.burned)) m[k] = (m[k] || 0) + Number(v); return m; }, {});
      if (canon(Object.fromEntries(Object.entries(named).sort())) !== canon(Object.fromEntries(Object.entries(h.burned).map(([k, v]) => [k, Number(v)]).sort()))) problems.push('FS-2 seat ' + h.seat + '\'s journal names ' + canon(named) + ', its hunt burned ' + canon(h.burned));
    }
    /* every hunt row that names a burn folds into its hour (1047's model lists `flame`), never left as detail */
    const unfold = (await closed.db.query(`select l.id from public.player_ledger l where l.meta ? 'flame'
        and coalesce((public.hr_ledger_meta_plan(public.hr_ledger_fold_model(l.kind, l.intent), l.meta)->>'ok')::boolean, false) is not true`)).rows;
    if (unfold.length || !a.journal.length) problems.push('FS-2 ' + unfold.length + ' of ' + a.journal.length + ' burning hunt rows cannot fold into their hour');
    if (z.hunts.some((h) => Number(h.units) !== 0) || z.journal.length || z.fires.some((f) => !(Number(f.h) < START_MPTS) || !(Number(f.p) > 0))) problems.push('FS-2 Off burned or did not burn down: ' + canon(z).slice(0, 300));
    /* the luck each hunt rolls at is the one it froze as it began, after its fire moved */
    const want = Number(await one(closed.db, 'select public.hr_flame_luck_pm($1)', [START_MPTS]));
    const read = await one(closed.db, 'select public.hr_hunt_instance_read($1::uuid, 0)', [closed.users[0]]);
    if (!read || !Array.isArray(read.instance.flame) || JSON.stringify(read.instance.flame) !== JSON.stringify([...FUEL].sort())) problems.push('FS-2 a lit read says flame ' + JSON.stringify(read && read.instance.flame));
    for (const m of (read && read.members) || []) if (!m.drops || m.drops.luck_pm !== want) { problems.push('FS-2 the read hands luck ' + canon(m.drops) + ', the hunt froze ' + want); break; }
    if (a.hunts.some((h) => h.luck_pm !== want) || a.fires.every((f) => Number(f.h) === START_MPTS) || !(want > 0)) problems.push('FS-2 the frozen luck is not the start fire\'s (' + want + '): ' + canon(a.hunts.map((h) => h.luck_pm)));
  } finally { if (edge) edge.done(); }
  return problems;
}

/* FS-5 THE DROPS, BOTH PATHS, AT THE FROZEN LUCK: Rare hours planted short (trait-pieces-db's plant, the pity step planted with them), every
   fire full when its hunt begins; the closed and the viewed hunt store the same pieces and the same pity, and the pity differs from the
   same hunt on an empty fire (the roll read the luck: a miss owes the find at the luck it had) */
const PLANTED = Object.freeze({ rare: 0.005, very_rare: 0.05 });
async function luckRolls(boot) {
  const problems = [];
  const DR = await import('../src/core/drop-rate.js'), DH = await import('../src/data/drop-hours.js'), PARTY = await import('../src/data/party.js');
  const FL = await import('../src/data/inner-flame.js'), DG = await import('../src/data/danger.js'), { HUNT_GROUNDS } = await import('../src/data/hunt-grounds.js');
  const { pityStep } = await import('../tools/gen-trait-pieces.mjs');
  const dh = { ...DH, DROP_HOURS: { ...DH.DROP_HOURS, rarity: { ...DH.DROP_HOURS.rarity,
    rare: { ...DH.DROP_HOURS.rarity.rare, everyHours: PLANTED.rare }, very_rare: { ...DH.DROP_HOURS.rarity.very_rare, everyHours: PLANTED.very_rare } } } };
  const step = Object.fromEntries(['rare', 'very_rare'].map((r) => [r, pityStep({ dr: DR, dh, party: PARTY, flame: FL, danger: DG }, HUNT_GROUNDS[MUSTER], r)]));
  const edge = plant([
    ['src/data/drop-hours.js', 'rare: Object.freeze({ everyHours: 40, band', 'rare: Object.freeze({ everyHours: 0.005, band'],
    ['src/data/drop-hours.js', 'very_rare: Object.freeze({ everyHours: 400, band', 'very_rare: Object.freeze({ everyHours: 0.05, band']], ['supabase/functions/hr-accrue']);
  const run = async (which, fire) => {
    const { db } = await boot();
    await db.query('update public.hr_piece_grounds set pity_step_rare = $2, pity_step_very_rare = $3 where hunt_id = $1', [MUSTER, step.rare, step.very_rare]);
    const r = await door(db, which, { lit: true, edgeRoot: edge.root, start: fire, flags: ['trait_pieces'] });
    const pieces = (await db.query("select s.seat, p.slot, p.base, p.traits, p.step, p.kill_unit, p.at_ms::text as at from public.trait_pieces p"
      + " join public.hunt_sessions s on s.user_id = p.user_id and s.slot = p.found_slot and s.hunt_id = $1 order by s.seat, p.at_ms, p.kill_unit", [MUSTER])).rows;
    const pity = (await db.query("select s.seat, h.rarity, h.misses::text as m from public.hero_pity h"
      + " join public.hunt_sessions s on s.user_id = h.user_id and s.slot = h.slot and s.hunt_id = $1 order by s.seat, h.rarity", [MUSTER])).rows;
    return { r, pieces, pity, luck: (await db.query('select luck_pm from public.hunt_flame order by session_id')).rows.map((x) => x.luck_pm) };
  };
  try {
    const full = 18750;   /* the room at Flame Level 1 (FR-1): the most luck a new company's fire gives */
    const closed = await run('fire', full), viewed = await run('viewed', full), empty = await run('fire', 0);
    for (const [name, x] of [['browser closed', closed], ['hunt viewed', viewed], ['an empty fire', empty]]) if (Number(x.r.inst.refusals) !== 0) problems.push('FS-5 ' + name + ': ' + x.r.inst.refusals + ' window(s) refused');
    EVIDENCE.push('FS-5 a full fire froze luck ' + closed.luck.join('/') + '; ' + closed.pieces.length + ' pieces, doors ' + (canon([closed.pieces, closed.pity]) === canon([viewed.pieces, viewed.pity]) ? 'identical' : 'DIFFER') + '; an empty fire ' + empty.pieces.length + ' pieces');
    if (closed.pieces.length < 2 || closed.luck.some((l) => !(l > 0))) problems.push('FS-5 CONTROL: ' + closed.pieces.length + ' pieces at luck ' + closed.luck.join('/'));
    if (canon([closed.pieces, closed.pity]) !== canon([viewed.pieces, viewed.pity])) problems.push('FS-5 the doors stored different drops at the frozen luck:\n      closed ' + canon([closed.pieces, closed.pity]).slice(0, 300) + '\n      viewed ' + canon([viewed.pieces, viewed.pity]).slice(0, 300));
    if (canon(closed.pity) === canon(empty.pity)) problems.push('FS-5 the lit fire\'s luck never reached the roll: the pity equals the empty fire\'s ' + canon(empty.pity).slice(0, 200));
    if (empty.luck.some((l) => l !== 0)) problems.push('FS-5 an empty fire froze luck ' + empty.luck.join('/'));
  } finally { edge.done(); }
  return problems;
}

async function cut(boot) {
  const problems = [];
  const long = await door((await boot()).db, 'fire', { lit: true });
  const short = await door((await boot()).db, 'fire', { lit: true, windowMs: 45000, windows: 9 });
  for (const [name, r] of [['90 s', long], ['45 s', short]]) if (Number(r.inst.refusals) !== 0) problems.push('FS-3 ' + name + ': ' + r.inst.refusals + ' window(s) refused');
  const a = await stored(long.db), b = await stored(short.db);
  const strip = (s) => ({ fires: s.fires, hunts: s.hunts.map((h) => ({ ...h })), bags: s.bags });
  EVIDENCE.push('FS-3 5 windows of 90 s and 10 of 45 s: ' + (canon(strip(a)) === canon(strip(b)) ? 'the same fires, burns and bags' : 'DIFFER'));
  if (canon(strip(a)) !== canon(strip(b))) problems.push('FS-3 the cut moved the fire:\n      90 s ' + canon(strip(a)).slice(0, 400) + '\n      45 s ' + canon(strip(b)).slice(0, 400));
  return problems;
}

async function bounds(boot) {
  const problems = [];
  const { db } = await boot();
  const run = await prepare({ heroes: 4, windows: 6, hunt: MUSTER, door: 'pieces', db, level: 60, anchorMs: ANCHOR, gear: GEAR, beforeEnter: fixture({ lit: true }) });
  const H = (await import('./hunt-sessions-settle.mjs')).HARNESS;
  const M = await H.loadEdge(H.ROOT);
  const ex = exec(db);
  let found = null;
  for (let w = 1; w <= 6 && !found; w++) {
    const plan = await M.HS.readHuntSettle({ exec: ex, user: run.users[0], slot: 0, atMs: run.fromMs + w * 90000 }, 'tick');
    if (plan.answer) return ['FS-4 CONTROL: window ' + w + ' skipped (' + plan.answer.reason + ')'];
    const p = await M.HS.proposeHuntSettle(plan, plan.toMs, 0);
    const i = p.commit.members.findIndex((m) => Array.isArray(m.flame) && m.flame.length >= 2);
    if (i >= 0) { found = { p, i }; break; }
    const res = await M.HS.commitHuntSettle(ex, { ...p.commit, project: null });
    if (!res || res.ok !== true) return ['FS-4 CONTROL: window ' + w + ' refused ' + canon(res).slice(0, 160)];
  }
  if (!found) return ['FS-4 CONTROL: no proposal claimed two Remains in 6 windows'];
  const fire = async () => canon((await db.query('select user_id, height_mpts, flame_points, carry_ms from public.company_flame order by user_id')).rows);
  const before = await fire();
  EVIDENCE.push('FS-4 a claim of ' + found.p.commit.members[found.i].flame.length + ' Remains tampered four ways');
  const tamper = (fn) => ({ ...found.p.commit, project: null, members: found.p.commit.members.map((m, j) => (j === found.i ? fn(JSON.parse(JSON.stringify(m))) : m)) });
  for (const [want, fn] of [
    ['flame_over', (m) => { m.flame.push([m.flame[m.flame.length - 1][0], 999999, m.flame[0][2], 50000]); return m; }],
    ['flame_when', (m) => { m.flame[0][0] = m.flame[0][0] + 10 * 3600000; return m; }],
    ['flame_order', (m) => { m.flame[1][1] = m.flame[0][1]; return m; }],
    ['bad_flame', (m) => { m.flame[0] = [m.flame[0][0], m.flame[0][1], 'Bones!', 1]; return m; }]]) {
    const res = await M.HS.commitHuntSettle(ex, tamper(fn));
    if (!res || res.ok !== false || res.error !== want) problems.push('FS-4 a forged ' + want + ' answered ' + canon(res).slice(0, 160));
  }
  if (await fire() !== before) problems.push('FS-4 a refused commit moved a fire');
  const res = await M.HS.commitHuntSettle(ex, { ...found.p.commit, project: null });
  if (!res || res.ok !== true) problems.push('FS-4 the untampered proposal answered ' + canon(res).slice(0, 200));
  if (await fire() === before) problems.push('FS-4 the untampered proposal moved no fire');
  return problems;
}

/* --mutate: a SQL defect planted in a replayed function body, or an edge defect planted on a copy of the edge */
const MUTANTS = [
  { name: 'the settle never walks the fire', fn: 'public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)',
    find: "if p_members @? '$[*].flame' then perform public.hr_flame_settle(p_instance, v_i.hunt_id, p_members); end if;", repl: 'null;', want: /^FS-2/, test: bothPaths },
  { name: 'a member lands its gross', fn: 'public.hr_flame_net(jsonb)',
    find: "if p_m is null or not (p_m ? 'flame') then return p_m->'delta'; end if;", repl: "return p_m->'delta';", want: /^FS-2/, test: bothPaths },
  { name: 'the roller reads the fire as it is now', fn: 'public.hr_trait_drops_of(uuid,integer)',
    find: "'luck_pm', coalesce(v_l, 0));", repl: "'luck_pm', public.hr_flame_luck_pm(coalesce((select f.height_mpts from public.company_flame f where f.user_id = p_user), 0)));", want: /^FS-2/, test: bothPaths },
  { name: 'a hunt freezes no luck', fn: 'public.hr_flame_session_freeze()',
    find: "if not public.hr_flag_on('inner_flame') then return null; end if;", repl: 'return null;', want: /^FS-2/, test: bothPaths },
  { name: 'the walk ignores the stoke rule', fn: 'public.hr_flame_settle(uuid,text,jsonb)',
    find: "select coalesce((r.keeps->>(f.stoke->>'keep'))::int, 0) into v_keep", repl: 'select 1000 into v_keep', want: /^FS-2/, test: bothPaths },
  { name: 'the walk burns every drop at the window end', fn: 'public.hr_flame_walk(bigint,bigint,bigint,jsonb,jsonb,integer,jsonb)',
    find: 'v_at := least(v_end, (v_x->>0)::bigint);', repl: 'v_at := v_end;', want: /^FS-3/, test: cut },
  { name: 'a claim past the delta is trusted', fn: 'public.hr_flame_settle(uuid,text,jsonb)',
    find: "perform public.hr_reject('flame_over',", repl: "perform public.hr_reject_nothing('flame_over',", want: /^FS-4/, test: bounds, prelude: 'create or replace function public.hr_reject_nothing(text, jsonb) returns void language sql as $f$ select null::void $f$;' },
  { name: 'an instant past the span is trusted', fn: 'public.hr_flame_settle(uuid,text,jsonb)',
    find: "perform public.hr_reject('flame_when',", repl: "perform public.hr_reject_nothing('flame_when',", want: /^FS-4/, test: bounds, prelude: 'create or replace function public.hr_reject_nothing(text, jsonb) returns void language sql as $f$ select null::void $f$;' },
  { name: 'the dark switch is ignored', fn: 'public.hr_flame_settle(uuid,text,jsonb)',
    find: "if not public.hr_flag_on('inner_flame') then perform public.hr_reject('flame_dark'); end if;", repl: '', want: /^FS-1/, test: dark },
  /* an edge defect: the engine never notes a drop, so nothing burns */
  { name: 'the engine notes no Remains', edits: [['src/core/hunt-rewards.js', 'if (ctx.flameDrops && ctx.flameDrops.fuel.has(ev.id)) ctx.flameDrops.list.push(', 'if (false) ctx.flameDrops.list.push(']], want: /^FS-2/, test: bothPaths },
  /* the hour fold (1047) does not know the burn, so every hunt row that burned keeps its detail */
  { name: 'the hour fold does not know the flame', fn: 'public.hr_ledger_fold_model(text,text)',
    find: '      "flame": {"burned": {"*": "sum"}},\n', repl: '', want: /^FS-2/, test: bothPaths },
  /* the roller hands every hunt no luck: the lit hunt finds what the dark one finds */
  { name: 'the roller reads no luck', fn: 'public.hr_trait_drops_of(uuid,integer)', find: "'luck_pm', coalesce(v_l, 0));", repl: "'luck_pm', 0);", want: /^FS-5/, test: luckRolls },
];

async function main() {
  if (process.argv.includes('--mutate')) {
    let escaped = 0;
    for (const m of MUTANTS) {
      const boot = async () => {
        const b = await bootReplay();
        if (m.prelude) await b.db.exec(m.prelude);
        if (m.fn) {
          const def = await one(b.db, 'select pg_get_functiondef($1::regprocedure)', [m.fn]);
          if (!def.replace(/\r/g, '').includes(m.find)) throw new Error('HARNESS: ' + m.fn + ' has no ' + JSON.stringify(m.find.slice(0, 60)));
          await b.db.exec(def.replace(/\r/g, '').replace(m.find, () => m.repl));
        }
        return b;
      };
      let got = [];
      try { got = await m.test(boot, { edits: m.edits || [] }); } catch (e) { got = ['THREW ' + String(e && e.message).slice(0, 200)]; }
      await closeReplays();
      if (got.some((p) => /HARNESS/.test(p))) { console.log('  HARNESS ' + m.name + ': ' + got[0]); process.exitCode = 2; return; }
      const hit = got.some((p) => m.want.test(p));
      if (!hit) escaped++;
      console.log('  ' + (hit ? 'caught ' : 'ESCAPED') + ' ' + m.name + ': ' + (got[0] || 'every check held').slice(0, 160));
    }
    console.log(escaped ? 'flame-settle-db --mutate: ' + escaped + ' ESCAPED' : 'flame-settle-db --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' caught');
    process.exitCode = escaped ? 1 : 0;
    return;
  }
  const boot = () => bootReplay();
  /* one case's replays at a time (an unclosed replay is ~300 MB) */
  const problems = [];
  for (const c of [dark, bothPaths, luckRolls, cut, bounds]) { problems.push(...await c(boot)); await closeReplays(); }
  for (const e of EVIDENCE) console.log('  ' + e);
  for (const p of problems) console.log('FAIL  ' + p);
  console.log(problems.length ? 'flame-settle-db: ' + problems.length + ' FAILED' : 'flame-settle-db: green (dark, the default stoke rule both paths, the drops at the frozen luck both paths, the cut, the claim bounds through the real commit)');
  process.exitCode = problems.length ? 1 : 0;
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
