#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/inner-flame.mjs — FEED THE HEARTH, RAISE YOUR INNER FLAME (Tyler 2026-10-25:
// Inner Flame replaces Prayer; 2027-01-31-inner-flame.sql + the 2027-01-31-*.generated.sql
// catalogues; src/data/hearth.js).
//
//   node tests/inner-flame.mjs             the guard
//   node tests/inner-flame.mjs --list      the mutation catalogue
//   node tests/inner-flame.mjs --selftest  every planted defect must turn its arm red
//   node tests/inner-flame.mjs --mutate=<id>
//
// The real chain replayed (PGlite), the real edge intent (supabase/functions/hr-accrue
// set-activity.js as hr_engine), the real client modules; production untouched:
//   IF-1 FUEL     a hero with Bones presses "Fuel all": ONE set_activity artisan fuel_bones (the
//                 edge's own intent) puts its body on a Great Hearth fuel stand (the server's
//                 town read says station `hearth`: the walk the World plays), and the collect
//                 takes the bones and pays exactly the bench's Inner Flame XP, journalled as one
//                 `craft` ledger row naming the bones and the XP; a reload's tables say so.
//   IF-2 REFUSE   a named fuel is refused, in words, while hunting (the Hearth is in town), with
//                 none in the bag, for an item that is not a named fuel (Bones: a bench run), and
//                 below its Inner Flame level; nothing moves on any of them.
//   IF-3 NAMED    a Den Knot burns ONCE: the item leaves the bag, the catalogue's XP lands, one
//                 craft row (intent hearth_burn:den_knot), one system line naming the hero, the body
//                 at the Hearth; ANOTHER player's town read in the square carries the amber flame
//                 (the shared surface); a retried key burns nothing twice; a second named fuel
//                 queues behind the first.
//   IF-4 DISPLAY  the bag offers "Fuel all N" / "Fuel the hearth" from the server's counts and the
//                 named fuel's "Fuel the hearth"; the town read's flame is held on the local clock
//                 and REPLACED by every answer; the World throws the hero's fuel only once it stands
//                 at its Hearth stand (never predicted), peers working at the Hearth throw, and a
//                 named flame swaps the fire's art.
// The death loss Inner Flame keeps (both paths) is tests/hunt-sessions-settle.mjs DEATHXP-FLAME;
// the bench's XP rate is tests/hearth-fuel-rate.mjs. TRUE CONCURRENCY is unverified (PGlite is one
// backend); the lock order is the migration header's.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, mkdtempSync, rmSync, writeFileSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const U1 = '000000c0-0000-4000-a000-00000f1a3e11';
const U2 = '000000c0-0000-4000-a000-00000f1a3e12';
const idem = () => crypto.randomUUID();
const BURN = 'public.hr_hearth_burn(integer,text,uuid)';

/* ── THE PLANTED DEFECTS ─────────────────────────────────────────────────────
   db: a live body edited inside the arm's transaction (fn, find, replace). js: a client module, copied and
   edited. Each names the arm that must go red. */
export const MUTANTS = {
  burn_while_hunting: { arm: 'IF-2', why: 'a named fuel burns while the hero is out hunting',
    db: [BURN, '  if v_hunt is not null then', '  if false then'] },
  burn_any_item: { arm: 'IF-2', why: 'any item the catalogue does not name burns as a named fuel',
    db: [BURN, '  select * into v_fuel from public.hr_hearth_named where item_id = p_item;\n  if not found then',
      '  select * into v_fuel from public.hr_hearth_named limit 1;\n  if not found then'] },
  burn_level_ignored: { arm: 'IF-2', why: 'the fuel\'s Inner Flame level is never read',
    db: [BURN, '  if v_lv < v_fuel.req_lv then', '  if false then'] },
  burn_keeps_item: { arm: 'IF-3', why: 'the burn pays the XP and keeps the fuel',
    db: [BURN, "           'items', jsonb_build_object(p_item, -1),\n", ''] },
  flame_not_shared: { arm: 'IF-3', why: 'the town read never carries the flame to the square',
    db: ['public.hr_town_view(integer,text,integer,integer,bigint,integer,integer)', "    'hearth', public.hr_hearth_flame_of(p_map));", "    'hearth', null);"] },
  queue_overlaps: { arm: 'IF-3', why: 'a second named fuel starts now, over the first colour',
    db: [BURN, '  v_start := greatest(now(), coalesce((select max(f.ends_at) from public.hearth_flames f where f.map_id = v_map), now()));',
      '  v_start := now();'] },
  fuel_not_at_hearth: { arm: 'IF-1', why: 'the Hearth hosts no skill: a fuelling hero stands on the square, not at the fire',
    ddl: "delete from public.hr_town_station_hosts where skill = 'inner_flame'" },
  bag_no_fuel_all: { arm: 'IF-4', why: 'a stack of bones offers no "Fuel all N"',
    js: ['src/shell/windows/inventory/bury.js', [["  if (e.skill !== 'cooking') return qty > e.need ? 'Fuel all ' + whole(qty) : 'Fuel the hearth';\n", '']]] },
  throw_before_arrival: { arm: 'IF-4', why: 'the World throws the fuel before the hero stands at the fire (a prediction)',
    js: ['src/world/hearth-burn.js', [['      const there = me && arrivedAt !== null && atStand(e.place, me);', '      const there = !!me;']]] },
  flame_merged: { arm: 'IF-4', why: 'an answer with no flame keeps the last one (merged upward, not replaced)',
    js: ['src/session/town-presence.js', [['    this._hearth = hearthOf(b.hearth, this._now());', '    this._hearth = hearthOf(b.hearth, this._now()) || this._hearth;']]] },
};

async function q(db, sql, params) { return (await db.query(sql, params)).rows; }
async function one(db, sql, params) { const r = await q(db, sql, params); return r[0] ? Object.values(r[0])[0] : undefined; }
const asUser = (db, uid) => db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid || '']);
const makeExec = (db) => async (text, params) => {
  await db.exec('set role hr_engine');
  try { return (await db.query(text, params)).rows; } finally { await db.exec('reset role'); }
};

/* A probe hero, its kit kept, in an admitted account, the town presence on. */
async function hero(db, uid) {
  await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [uid]);
  await db.query(`insert into public.hr_access_allowlist (user_id, note) values ($1, 'inner-flame test') on conflict (user_id) do nothing`, [uid]);
  await db.query(`insert into public.hr_flags (key, enabled, note) values ('town_presence', true, 'inner-flame test') on conflict (key) do update set enabled = true`);
  await asUser(db, uid);
  const c = await one(db, 'select public.hr_create_character(0)');
  if (!c || c.ok !== true) throw new Error('probe hero refused: ' + JSON.stringify(c));
  await db.query("update public.player_state set active_kind = 'idle', active_id = null where user_id = $1 and slot = 0", [uid]);
}
const put = (db, uid, item, qty) => db.query(`insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, $2, $3)
  on conflict (user_id, slot, item_id) do update set qty = excluded.qty`, [uid, item, qty]);
const qty = async (db, uid, item) => Number((await one(db, 'select qty from public.player_inventory where user_id = $1 and slot = 0 and item_id = $2', [uid, item])) || 0);
const xp = async (db, uid) => Number((await one(db, "select xp from public.player_skills where user_id = $1 and slot = 0 and skill_id = 'inner_flame'", [uid])) || 0);
const setXp = (db, uid, v) => db.query("update public.player_skills set xp = $2 where user_id = $1 and slot = 0 and skill_id = 'inner_flame'", [uid, v]);
const levelXp = async (db, lv) => Number(await one(db, 'select min(xp) from public.hr_skill_curve where level = $1', [lv]));
async function burn(db, uid, item, key = idem()) {
  await asUser(db, uid);
  return one(db, 'select public.hr_hearth_burn(0, $1, $2::uuid)', [item, key]);
}

const ARMS = {
  'IF-1': async (db, M) => {
    const out = [];
    await hero(db, U1);
    await put(db, U1, 'bones', 6);
    const x0 = await xp(db, U1);
    const exec = makeExec(db);
    const call = (o) => M.SA.runSetActivity({ exec, user: U1, slot: 0, ...o });
    const go = await call({ intentId: idem(), activity: { kind: 'artisan', id: 'fuel_bones' } });
    if (go.status !== 200 || !go.body || go.body.ok !== true) return ['Fuel all was refused: ' + JSON.stringify(go).slice(0, 300)];
    /* THE WALK: the server stands the hero at the Great Hearth (the World walks there from this answer) */
    await asUser(db, U1);
    const here = await one(db, "select public.hr_town_here(0, (select map_id from public.hr_town_maps where main))");
    if (!here || here.ok !== true || !here.me || here.me.station !== 'hearth') out.push('the fuelling hero stands at ' + JSON.stringify(here && here.me) + ', not a Hearth fuel stand');
    /* thirty seconds at the fire, then the collect */
    await db.query(`update public.player_state set accrued_to = now() - interval '30 seconds', active_since = now() - interval '30 seconds'
                     where user_id = $1 and slot = 0`, [U1]);
    const stop = await call({ intentId: idem(), activity: { kind: 'idle', id: null } });
    if (stop.status !== 200 || !stop.body || stop.body.ok !== true) return out.concat(['the collect was refused: ' + JSON.stringify(stop).slice(0, 300)]);
    const left = await qty(db, U1, 'bones');
    const gained = (await xp(db, U1)) - x0;
    const per = M.CM.FLAME_FUEL.xpPerBone;
    if (left !== 0) out.push(left + ' bones are still in the bag after 30 s at the Hearth');
    if (gained < 6 * Math.floor(per) || gained > Math.floor(6 * per)) out.push(`six bones paid ${gained} Inner Flame XP, not 6 x ${per}`);
    const rows = await q(db, `select kind, meta from public.player_ledger where user_id = $1 and slot = 0 and kind = 'craft' order by id`, [U1]);
    /* the craft row journals what the bench spent and paid (its delta: i = items, x = XP) */
    const d = (r) => (r.meta && r.meta.delta) || {};
    const row = rows.find((r) => d(r).i && Number(d(r).i.bones) === -6);
    if (!row || !d(row).x || Number(d(row).x.inner_flame) !== gained || row.meta.skill !== 'inner_flame' || row.meta.recipe !== 'fuel_bones') out.push('no craft ledger row names the six bones and the XP: ' + JSON.stringify(rows.map((r) => r.meta)).slice(0, 300));
    return out;
  },

  'IF-2': async (db) => {
    const out = [];
    await hero(db, U1);
    const say = (r, code) => { if (!r || r.ok !== false || r.error !== code) out.push(`want ${code}, the server answered ${JSON.stringify(r)}`); };
    const x0 = await xp(db, U1);
    /* none in the bag */
    say(await burn(db, U1, 'den_knot'), 'no_item');
    /* not a named fuel: Bones are a bench run */
    await put(db, U1, 'bones', 3);
    say(await burn(db, U1, 'bones'), 'not_a_fuel');
    /* hunting: the Hearth is in town */
    await put(db, U1, 'den_knot', 1);
    await setXp(db, U1, await levelXp(db, 5));
    const inst = idem();
    await db.query("insert into public.hunt_instances (id, hunt_id, settled_to, next_swing_at) values ($1, 'mill_cellar', now(), now())", [inst]);
    await db.query(`insert into public.hunt_sessions (id, user_id, slot, hunt_id, entered_at, hunt_from, settled_to, next_swing_at, instance_id)
                     values ($1, $2, 0, 'mill_cellar', now(), now(), now(), now(), $3)`, [idem(), U1, inst]);
    say(await burn(db, U1, 'den_knot'), 'hunting');
    await db.query('delete from public.hunt_sessions where user_id = $1 and slot = 0 and ended_at is null', [U1]);
    /* below its level (Den Knot: the catalogue's req_lv) */
    const need = Number(await one(db, "select req_lv from public.hr_hearth_named where item_id = 'den_knot'"));
    await setXp(db, U1, 0);
    const low = await burn(db, U1, 'den_knot');
    say(low, 'flame_too_low');
    if (low && (low.need !== need || low.have !== 1)) out.push('the level refusal says ' + JSON.stringify(low) + ', not need ' + need + ' have 1');
    /* nothing moved */
    if ((await qty(db, U1, 'den_knot')) !== 1 || (await qty(db, U1, 'bones')) !== 3 || (await xp(db, U1)) !== 0
      || Number(await one(db, 'select count(*) from public.hearth_flames where user_id = $1', [U1])) !== 0) out.push('a refused burn moved something');
    if (x0 < 0) out.push('CONTROL');
    return out;
  },

  'IF-3': async (db) => {
    const out = [];
    await hero(db, U1);
    await hero(db, U2);
    const fuel = await one(db, "select to_jsonb(n) from public.hr_hearth_named n where item_id = 'den_knot'");
    if (!fuel) return ['CONTROL: the generated catalogue has no Den Knot'];
    await put(db, U1, 'den_knot', 2);
    await put(db, U1, 'rat_kings_knot', 1);
    await setXp(db, U1, await levelXp(db, Math.max(fuel.req_lv, 5)));
    const x0 = await xp(db, U1);
    const key = idem();
    const r = await burn(db, U1, 'den_knot', key);
    if (!r || r.ok !== true) return ['the Den Knot was refused: ' + JSON.stringify(r)];
    if ((await qty(db, U1, 'den_knot')) !== 1) out.push('the burn left ' + (await qty(db, U1, 'den_knot')) + ' Den Knots (want 1 of 2)');
    if ((await xp(db, U1)) - x0 !== fuel.xp) out.push(`the burn paid ${(await xp(db, U1)) - x0} Inner Flame XP, the catalogue ${fuel.xp}`);
    if (Number(await one(db, "select count(*) from public.player_ledger where user_id = $1 and kind = 'craft' and intent = 'hearth_burn:den_knot'", [U1])) !== 1) out.push('no single craft row for the burn');
    if (Number(await one(db, "select count(*) from public.chat_messages where from_id = $1 and channel = 'system' and body = 'fed the Great Hearth a [[item:den_knot]].'", [U1])) !== 1) out.push('no system line for the burn');
    if (!r.me || r.me.station !== 'hearth') out.push('the burner is not set at the Hearth: ' + JSON.stringify(r.me));
    /* THE SHARED SURFACE: another player in the square reads the colour */
    await asUser(db, U2);
    const view = await one(db, "select public.hr_town_view(0, (select map_id from public.hr_town_maps where main), null, null, null, null, null)");
    if (!view || view.ok !== true || !view.hearth || view.hearth.flame !== fuel.flame) out.push('another player\'s town read carries ' + JSON.stringify(view && view.hearth) + ', not the ' + fuel.flame + ' flame');
    /* a retried key burns nothing twice */
    const again = await burn(db, U1, 'den_knot', key);
    if (!again || again.ok !== true || (await qty(db, U1, 'den_knot')) !== 1 || Number(await one(db, 'select count(*) from public.hearth_flames where user_id = $1', [U1])) !== 1) out.push('a retried key burnt again: ' + JSON.stringify(again));
    /* a second named fuel queues behind the first */
    const k2 = await burn(db, U1, 'rat_kings_knot');
    if (!k2 || k2.ok !== true) out.push('the second named fuel was refused: ' + JSON.stringify(k2));
    else if (k2.flame.from_ms !== r.flame.until_ms) out.push(`the second colour starts at ${k2.flame.from_ms}, not where the first ends (${r.flame.until_ms})`);
    return out;
  },

  'IF-4': async (db, M, X) => {
    const out = [];
    const { BU, ST, TP, HB, HD, IL } = X;
    /* THE BAG: Fuel all N on a stack, Fuel the hearth on one; the named fuel's own entry (the server's counts) */
    const cs = (inv, skills, st) => ({ slot: 0, read: (k) => (k === 'inventory' ? inv : k === 'skills' ? skills : k === 'state' ? st || { active_kind: 'idle', active_id: null } : null) });
    const bones = BU.buryRecipeOf('bones');
    if (!bones || BU.buryLabel(bones, 120) !== 'Fuel all 120' || BU.buryLabel(bones, 1) !== 'Fuel the hearth') out.push('the bones read ' + JSON.stringify(bones && [BU.buryLabel(bones, 120), BU.buryLabel(bones, 1)]));
    const st = { cs: cs({ den_knot: 1 }, { inner_flame: { xp: 0, level: 1 } }), qty: new Map([['den_knot', 1]]), eq: {}, bar: null, shop: null, rules: null };
    const prim = ST.primaryOf(st, 'den_knot');
    if (!prim || prim[0] !== 'hearth' || prim[1] !== 'Fuel the hearth') out.push('the Den Knot offers ' + JSON.stringify(prim));
    const why = BU.namedBlock(cs({ den_knot: 1 }, { inner_flame: { xp: 0, level: 1 } }), 'den_knot');
    if (why !== 'Den Knot needs Inner Flame ' + HD.NAMED_FUELS.den_knot.req + '. You have 1.') out.push('the Den Knot below its level says ' + JSON.stringify(why));
    if (!IL.usesOf('lamp_jelly').some((l) => /Great Hearth/.test(l))) out.push('the Lamp Jelly tooltip names no Hearth');
    /* THE TOWN READ'S FLAME: on the local clock, replaced by every answer */
    const clock = 1000;
    const withFlame = { ok: true, body: { ok: true, walkers: [], gone: [], cursor: 1, full: true, me: null,
      hearth: { flame: 'amber', item: 'den_knot', by: 'Harrow', from_ms: 5000, until_ms: 65000, now_ms: 6000, queued: 0 } } };
    let answer = withFlame;
    const tp = new TP.TownPresence({ server: { rpc: async () => answer }, slot: 0, timers: { setTimer: () => 1, clearTimer: () => {} }, now: () => clock });
    tp.show('town_common');
    await tp.read();
    const h1 = tp.hearth();
    if (!h1 || h1.flame !== 'amber' || h1.endsAt !== clock + 59000) out.push('the flame read as ' + JSON.stringify(h1));
    answer = { ok: true, body: { ok: true, walkers: [], gone: [], cursor: 2, full: true, me: null } };
    await tp.read();
    if (tp.hearth() !== null) out.push('an answer with no flame kept the last one: ' + JSON.stringify(tp.hearth()));
    tp.destroy();
    /* THE WORLD: no throw until the hero stands at its Hearth stand; then the bone, then the flare; peers throw;
       a named flame swaps the fire */
    const map = { T: 32, ambient: [{ id: 'hearth_fire', x: 117, y: 48, lift: 86 }] };
    const sprites = new Proxy({}, { get: (t, k) => ({ id: k }) });
    const view = HB.createHearthView(map, { sprites });
    const me = { station: 'hearth', stand: 3, since: 1, x: 114, y: 49 };
    const walking = view.frame({ place: { x: 110, y: 52, gx: 114, gy: 49 }, units: [], walkers: [], me, active: 'fuel_bones', burn: null, flame: null, xp: 0, hero: { x: 110, y: 52 } }, 10000);
    if (walking.fx.length) out.push('the World threw before the hero reached the fire: ' + JSON.stringify(walking.fx.map((f) => f.id)));
    const at = { place: { x: 114, y: 49, gx: 114, gy: 49 }, units: [], walkers: [], me, active: 'fuel_bones', burn: null, flame: null, xp: 0, hero: { x: 114, y: 49 } };
    const first = view.frame(at, 20000);
    const flare = view.frame(at, 20000 + HD.BURN_SHOW.throwMs + 50);
    if (!first.fx.some((f) => f.id === 'fuel_bone') || !flare.fx.some((f) => f.id === 'hearth_flare')) out.push('at the fire: ' + JSON.stringify([first.fx.map((f) => f.id), flare.fx.map((f) => f.id)]));
    const peerAt = { ...at, active: null, me: null, units: [{ x: 115, y: 49, ref: { player: { id: 'p', slot: 1 } } }], walkers: [{ id: 'p', slot: 1, station: 'hearth', work: true }] };
    const peerRun = Array.from({ length: 16 }, (_, i) => view.frame(peerAt, 30000 + i * 100).fx.map((f) => f.id)).flat();
    if (!peerRun.includes('fuel_bone')) out.push('a peer working at the Hearth never throws');
    const idle = Array.from({ length: 16 }, (_, i) => view.frame({ ...peerAt, walkers: [{ id: 'p', slot: 1, station: 'hearth', work: false }] }, 30000 + i * 100).fx.length).reduce((a, n) => a + n, 0);
    if (idle) out.push('a peer standing at the Hearth without working throws');
    const named = view.frame({ ...at, flame: { flame: 'amber', startedAt: 40000 } }, 40100);
    if (!named.ambientSwap || named.ambientSwap.hearth_fire !== 'hearth_fire_amber') out.push('a named flame left the fire ' + JSON.stringify(named.ambientSwap));
    return out;
  },
};

async function loadReaders(root) {
  const u = (p) => pathToFileURL(join(root, p)).href + '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];
  return {
    BU: await import(u('src/shell/windows/inventory/bury.js')),
    ST: await import(u('src/shell/windows/inventory/state.js')),
    TP: await import(u('src/session/town-presence.js')),
    HB: await import(u('src/world/hearth-burn.js')),
    HD: await import(u('src/data/hearth.js')),
    IL: await import(u('src/shell/item-lore.js')),
  };
}

async function loadEdge(root) {
  const u = (p) => pathToFileURL(join(root, p)).href;
  return { SA: await import(u('supabase/functions/hr-accrue/set-activity.js')), CM: await import(u('src/data/core-model.js')) };
}

/* One arm in its own transaction, the planted defect (if any) inside it. */
async function runArm(db, M, X, id, mutant) {
  await db.query('begin');
  try {
    if (mutant && mutant.db) {
      const [fn, find, repl] = mutant.db;
      let def = String(await one(db, 'select pg_get_functiondef($1::regprocedure)', [fn])).split(String.fromCharCode(13)).join('');
      if (def.split(find).length !== 2) throw Object.assign(new Error(`mutant anchor not found once in ${fn}: ${find.slice(0, 80)}`), { harness: true });
      await db.exec(def.replace(find, () => repl));
    }
    if (mutant && mutant.ddl) await db.exec(mutant.ddl);
    return await ARMS[id](db, M, X);
  } finally { await db.query('rollback'); await asUser(db, ''); }
}

async function main() {
  if (process.argv.includes('--list')) { for (const [id, m] of Object.entries(MUTANTS)) console.log(`${id}  [${m.arm}]  ${m.why}`); return; }
  const { bootReplay } = await import('./schema-replay.mjs');
  let db;
  try { ({ db } = await bootReplay()); } catch (e) { console.error('✗ the chain would not replay: ' + String(e.message).slice(0, 600)); process.exit(1); }
  const M = await loadEdge(ROOT);
  const X = await loadReaders(ROOT);
  const pick = (process.argv.find((a) => a.startsWith('--mutate=')) || '').slice(9);
  if (!(process.argv.includes('--selftest') || pick)) {
    let bad = 0;
    for (const id of Object.keys(ARMS)) {
      let p;
      try { p = await runArm(db, M, X, id, null); } catch (e) { p = ['threw: ' + String(e && e.stack || e).slice(0, 600)]; }
      if (p.length) { bad++; for (const m of p) console.error(`✗ ${id}: ${m}`); } else console.log(`✓ ${id}`);
    }
    console.log(bad ? `inner-flame: ${bad} arm(s) red` : `inner-flame: all ${Object.keys(ARMS).length} arms green`);
    process.exit(bad ? 1 : 0);
  }
  if (pick && !MUTANTS[pick]) { console.error('unknown mutant ' + pick); process.exit(2); }
  let missed = 0;
  const ids = pick ? [pick] : Object.keys(MUTANTS);
  for (const id of ids) {
    const m = MUTANTS[id];
    let p;
    try {
      if (m.js) {
        const dir = mkdtempSync(join(tmpdir(), 'hr-if-'));
        try {
          cpSync(join(ROOT, 'src'), join(dir, 'src'), { recursive: true, filter: (s) => !/\.(png|webp|jpg|ogg|mp3)$/.test(s) });
          const f = join(dir, m.js[0]);
          let src = readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
          for (const [find, repl] of m.js[1]) {
            if (src.split(find).length !== 2) throw Object.assign(new Error('js mutant anchor not found once: ' + find.slice(0, 60)), { harness: true });
            src = src.replace(find, () => repl);
          }
          writeFileSync(f, src);
          p = await runArm(db, M, await loadReaders(dir), m.arm, null);
        } finally { rmSync(dir, { recursive: true, force: true }); }
      } else p = await runArm(db, M, X, m.arm, m);
    } catch (e) {
      if (e && e.harness) { console.error(`✗ ${id}: harness: ${e.message}`); missed++; continue; }
      p = ['threw: ' + String(e && e.message || e).slice(0, 200)];
    }
    if (p.length) console.log(`✓ ${m.arm} goes red on ${id}: ${m.why}`);
    else { console.error(`✗ ${m.arm} stayed GREEN on ${id}: ${m.why}`); missed++; }
  }
  console.log(missed ? `inner-flame --selftest: ${missed} of ${ids.length} mutant(s) survived` : `inner-flame --selftest: all ${ids.length} mutants killed`);
  process.exit(missed ? 1 : 0);
}

if (isMain(import.meta.url)) main();
