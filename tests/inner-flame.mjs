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
//   IF-1 FUEL     a hero with Bones presses "Burn all": ONE set_activity artisan fuel_bones (the
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
//   IF-4 DISPLAY  the bag offers "Burn all N" / "Burn" from the server's counts and the
//                 named fuel's "Burn"; the town read's flame is held on the local clock
//                 and REPLACED by every answer; the World throws the hero's fuel only once it stands
//                 at its Hearth stand (never predicted), peers working at the Hearth throw, and a
//                 named flame swaps the fire's art. An ERRAND ("Burn" on one, 2027-04-27-hearth-
//                 errand.sql) throws its fuel ONCE when the visit reaches the fire, though the pointer
//                 moved on; a work stand throws on the beat; the press says no "You stopped" and arms no Stop.
//   IF-5 ERRAND   a fisher feeds ONE bone, the owner's browser open (its own town reads and settle):
//                 the body visits the Hearth, the bone burns once (one bone's XP, one craft row), the
//                 pointer goes back to the same fishing spot, which pays again; the body walks back when
//                 the visit ends; nothing burns twice; the player's own Stop mid-errand stops the hero.
//   IF-6 CLOSED   the same with the browser shut: the world tick ends the run and pays the fishing after,
//                 and another player's town reads move the body.
// The death loss Inner Flame keeps (both paths) is tests/hunt-sessions-settle.mjs DEATHXP-FLAME;
// the bench's XP rate is tests/hearth-fuel-rate.mjs. TRUE CONCURRENCY is unverified (PGlite is one
// backend); the lock order is the migration header's.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, mkdtempSync, rmSync, writeFileSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';
import { sourceQuery } from '../tools/lib/version-stamp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const U1 = '000000c0-0000-4000-a000-00000f1a3e11';
const U2 = '000000c0-0000-4000-a000-00000f1a3e12';
const idem = () => crypto.randomUUID();
const BURN = 'public.hr_hearth_burn(integer,text,uuid)';
const ERRAND = 'public.hr_town_errand()';
const SETTLE = 'public.hr_town_moves_settle(text,integer,uuid,integer)';

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
    db: ['public.hr_town_view(integer,text,integer,integer,bigint,integer,integer)', "    'hearth', public.hr_hearth_flame_of(p_map),\n", "    'hearth', null,\n"] },
  queue_overlaps: { arm: 'IF-3', why: 'a second named fuel starts now, over the first colour',
    db: [BURN, "    perform pg_advisory_xact_lock(hashtextextended('hr:hearth:' || v_map, 0));\n    v_start := greatest(now(), coalesce((select max(f.ends_at) from public.hearth_flames f where f.map_id = v_map), now()));",
      "    perform pg_advisory_xact_lock(hashtextextended('hr:hearth:' || v_map, 0));\n    v_start := now();"] },
  fuel_not_at_hearth: { arm: 'IF-1', why: 'the Hearth hosts no skill: a fuelling hero stands on the square, not at the fire',
    ddl: "delete from public.hr_town_station_hosts where skill = 'inner_flame'" },
  bag_no_fuel_all: { arm: 'IF-4', why: 'a stack of bones offers no "Burn all N"',
    js: ['src/shell/windows/inventory/bury.js', [["  if (e.skill !== 'cooking') return qty > e.need ? 'Burn all ' + whole(qty) : 'Burn';\n", '']]] },
  throw_before_arrival: { arm: 'IF-4', why: 'the World throws the fuel before the hero stands at the fire (a prediction)',
    js: ['src/world/hearth-burn.js', [['      const there = me && arrivedAt !== null && atStand(e.place, me);', '      const there = !!me;']]] },
  flame_merged: { arm: 'IF-4', why: 'an answer with no flame keeps the last one (merged upward, not replaced)',
    js: ['src/session/town-presence.js', [['    this._hearth = hearthOf(b.hearth, this._now());', '    this._hearth = hearthOf(b.hearth, this._now()) || this._hearth;']]] },
  /* THE ERRAND (2027-04-27-hearth-errand.sql): each half of the fix, undone */
  errand_no_way_back: { arm: 'IF-5', why: 'the run of one ends and the hero stays idle (fishing stopped for good: the report)',
    db: [ERRAND, "  if new.active_kind = 'idle'\n     and not exists", "  if false\n     and not exists"] },
  errand_no_way_back_tick: { arm: 'IF-6', why: 'the same, the run ended by the world tick with the browser closed',
    db: [ERRAND, "  if new.active_kind = 'idle'\n     and not exists", "  if false\n     and not exists"] },
  errand_not_noted: { arm: 'IF-6', why: 'the note does not name the errand: the body works the fire until the run ends, no visit',
    db: ['public.hr_town_note_move()', '          case when public.hr_hearth_errand(new.active_kind, new.active_id, new.active_left) then new.active_id end);', '          null);'] },
  errand_visit_is_work: { arm: 'IF-5', why: 'the errand\'s read sets the body to work at the fire, not on a visit',
    db: [SETTLE, "      perform public.hr_town_place(r.user_id, r.slot, p_map, v_go, 'visit', null, v_from);", "      perform public.hr_town_place(r.user_id, r.slot, p_map, v_go, 'work', null, v_from);"] },
  errand_ignores_stop: { arm: 'IF-5', why: 'the player\'s own Stop mid-errand sends the hero back to its job',
    db: [ERRAND, "     and not exists (select 1 from public.player_intents i\n                      where i.at = now() and i.user_id = old.user_id and i.slot = old.slot and i.intent = 'set_activity:idle')\n", ''] },
  errand_no_throw: { arm: 'IF-4', why: 'the World throws an errand\'s fuel only while the pointer names it (the report: no throw)',
    js: ['src/world/hearth-burn.js', [['      for (const b of [env.burn, env.errand]) if', '      for (const b of [env.burn]) if']]] },
  errand_beat_on_visit: { arm: 'IF-4', why: 'a visit throws its one fuel on the beat like a bench run',
    js: ['src/world/hearth-burn.js', [['      const chunk = there && me.work && e.active ? chunkOfRecipe(e.active) : null;', '      const chunk = there && e.active ? chunkOfRecipe(e.active) : null;']]] },
  errand_arms_stop: { arm: 'IF-4', why: '"Burn" arms the bench\'s Stop, which ends the job the server went back to',
    js: ['src/shell/town-work.js', [["    if (w.kind === 'artisan' && !errand) {", "    if (w.kind === 'artisan') {"]]] },
  errand_says_stopped: { arm: 'IF-4', why: '"Burn" says it stopped the fishing though the fishing comes back',
    js: ['src/shell/town-work.js', [['  const replaced = errand ? \'\' : jobReplacedWords(cs, w);', '  const replaced = jobReplacedWords(cs, w);']]] },
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
    if (go.status !== 200 || !go.body || go.body.ok !== true) return ['Burn all was refused: ' + JSON.stringify(go).slice(0, 300)];
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
    /* THE BAG: Burn all N on a stack, Burn on one; the named fuel's own entry (the server's counts) */
    const cs = (inv, skills, st) => ({ slot: 0, read: (k) => (k === 'inventory' ? inv : k === 'skills' ? skills : k === 'state' ? st || { active_kind: 'idle', active_id: null } : null) });
    const bones = BU.buryRecipeOf('bones');
    if (!bones || BU.buryLabel(bones, 120) !== 'Burn all 120' || BU.buryLabel(bones, 1) !== 'Burn') out.push('the bones read ' + JSON.stringify(bones && [BU.buryLabel(bones, 120), BU.buryLabel(bones, 1)]));
    const st = { cs: cs({ den_knot: 1 }, { inner_flame: { xp: 0, level: 1 } }), qty: new Map([['den_knot', 1]]), eq: {}, bar: null, shop: null, rules: null };
    const prim = ST.primaryOf(st, 'den_knot');
    if (!prim || prim[0] !== 'hearth' || prim[1] !== 'Burn') out.push('the Den Knot offers ' + JSON.stringify(prim));
    const why = BU.namedBlock(cs({ den_knot: 1 }, { inner_flame: { xp: 0, level: 1 } }), 'den_knot');
    if (why !== 'Den Knot: requires Inner Flame ' + HD.NAMED_FUELS.den_knot.req) out.push('the Den Knot below its level says ' + JSON.stringify(why));
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
    /* "Burn all": the server holds the hero WORKING at its fuel stand (hr_town_me `work`) */
    const me = { station: 'hearth', stand: 3, since: 1, x: 114, y: 49, work: true };
    const walking = view.frame({ place: { x: 110, y: 52, gx: 114, gy: 49 }, units: [], walkers: [], me, active: 'fuel_bones', burn: null, flame: null, xp: 0, hero: { x: 110, y: 52 } }, 10000);
    if (walking.fx.length) out.push('the World threw before the hero reached the fire: ' + JSON.stringify(walking.fx.map((f) => f.id)));
    const at = { place: { x: 114, y: 49, gx: 114, gy: 49 }, units: [], walkers: [], me, active: 'fuel_bones', burn: null, flame: null, xp: 0, hero: { x: 114, y: 49 } };
    const first = view.frame(at, 20000);
    const flare = view.frame(at, 20000 + HD.BURN_SHOW.throwMs + 50);
    if (!first.fx.some((f) => f.id === 'fuel_bone') || !flare.fx.some((f) => f.id === 'hearth_flare')) out.push('at the fire: ' + JSON.stringify([first.fx.map((f) => f.id), flare.fx.map((f) => f.id)]));
    /* a bench run throws on the beat while it works there */
    const beats = (v, f, from) => Array.from({ length: 40 }, (_, i) => v.frame(f, from + i * 100).fx.some((x) => x.id === 'fuel_bone')).filter((b, i, a) => b && !a[i - 1]).length;
    if (beats(view, at, 20000 + HD.BURN_SHOW.throwEveryMs) < 2) out.push('"Burn all" at its work stand does not throw on the beat');
    /* AN ERRAND (2027-04-27-hearth-errand.sql): "Burn" while fishing. The press names the fuel; the run of one ends in
       seconds and the pointer moves on; the server holds the body on a VISIT for the ~25 s walk. ONE throw when it gets there. */
    const ev = HB.createHearthView(map, { sprites });
    const shore = { station: 'shore', stand: 2, since: 1, x: 60, y: 70, work: true };
    const visit = { station: 'hearth', stand: 4, since: 2, x: 115, y: 49, work: false };
    const fr = (o) => ({ place: { x: 60, y: 70, gx: 60, gy: 70 }, units: [], walkers: [], me: shore, active: null, burn: null, flame: null, xp: 0, hero: { x: 60, y: 70 }, ...o });
    const onWay = { place: { x: 90, y: 60, gx: 115, gy: 49 }, me: visit, hero: { x: 90, y: 60 } };
    const atFire = { place: { x: 115, y: 49, gx: 115, gy: 49 }, me: visit, hero: { x: 115, y: 49 } };
    const errandFx = [ev.frame(fr({ active: 'fuel_bones' }), 50000), ev.frame(fr({ active: 'fuel_bones', ...onWay }), 51000), ev.frame(fr(onWay), 60000)]
      .flatMap((r) => r.fx.map((f) => f.id));
    if (errandFx.length) out.push('the errand threw before its visit reached the fire: ' + JSON.stringify(errandFx));
    if (beats(ev, fr(atFire), 75000) !== 1) out.push(`the errand's visit threw ${beats(ev, fr(atFire), 75000)} times at the fire, not once (the pointer had moved on)`);
    const vv = HB.createHearthView(map, { sprites });
    vv.frame(fr({ active: 'fuel_bones' }), 50000);
    if (beats(vv, fr({ ...atFire, active: 'fuel_bones' }), 75000) !== 1) out.push('a visit with the run still on threw on the beat, not once');
    const nv = HB.createHearthView(map, { sprites });
    nv.frame(fr({}), 50000);
    if (beats(nv, fr(atFire), 75000) !== 0) out.push('a visit no fuel was named for threw');
    /* the visit ended at the shore: a later visit with no new press throws nothing */
    ev.frame(fr({}), 80000);
    if (beats(ev, fr({ ...atFire, me: { ...visit, since: 3 } }), 90000) !== 0) out.push('an errand thrown and walked away from threw again on a later visit');
    /* THE PRESS: an errand stops nothing ("You stopped …" is not said) and arms no Stop (it would end the job the server points
       the hero back at); "Burn all" over the fishing still says so and arms its Stop */
    const TW = X.TW;
    const fishing = { active_kind: 'gather', active_id: 'shrimp_s', active_since: '2026-11-01T00:00:00Z' };
    const fisher = { slot: 0, read: (k) => (k === 'state' ? fishing : k === 'inventory' ? { bones: 5 } : k === 'skills' ? { inner_flame: { xp: 0, level: 1 } } : null),
      edgeIntent: async () => ({ ok: true }) };
    const fuelRow = TW.workRow('artisan', 'fuel_bones');
    const armed = async (count) => {
      const st = globalThis.setTimeout; let n = 0;
      globalThis.setTimeout = (...a) => { n++; return st(() => {}, 0); };
      try { return { words: await TW.startWork(fisher, fuelRow, (fn, busy, done) => done({ ok: true }), null, '', count), n }; }
      finally { globalThis.setTimeout = st; }
    };
    /* the words a press that replaces the fishing says are the module's own (their text is tests/alpha-windows.mjs AW-62's pin) */
    const stopped = TW.jobReplacedWords(fisher, fuelRow);
    if (!stopped) out.push('a Hearth run over the fishing names no job it replaces');
    const one1 = await armed(1);
    if ((stopped && one1.words.includes(stopped)) || one1.n !== 0) out.push('"Burn" while fishing says ' + JSON.stringify(one1.words) + ' and arms ' + one1.n + ' Stop(s)');
    const all = await armed(null);
    if (!stopped || !all.words.startsWith(stopped) || all.n < 1) out.push('"Burn all" over the fishing says ' + JSON.stringify(all.words) + ' and arms ' + all.n);
    const peerAt = { ...at, active: null, me: null, units: [{ x: 115, y: 49, ref: { player: { id: 'p', slot: 1 } } }], walkers: [{ id: 'p', slot: 1, station: 'hearth', work: true }] };
    const peerRun = Array.from({ length: 16 }, (_, i) => view.frame(peerAt, 30000 + i * 100).fx.map((f) => f.id)).flat();
    if (!peerRun.includes('fuel_bone')) out.push('a peer working at the Hearth never throws');
    const idle = Array.from({ length: 16 }, (_, i) => view.frame({ ...peerAt, walkers: [{ id: 'p', slot: 1, station: 'hearth', work: false }] }, 30000 + i * 100).fx.length).reduce((a, n) => a + n, 0);
    if (idle) out.push('a peer standing at the Hearth without working throws');
    const named = view.frame({ ...at, flame: { flame: 'amber', startedAt: 40000 } }, 40100);
    if (!named.ambientSwap || named.ambientSwap.hearth_fire !== 'hearth_fire_amber') out.push('a named flame left the fire ' + JSON.stringify(named.ambientSwap));
    return out;
  },

  'IF-5': (db, M) => errandArm(db, M, false),
  'IF-6': (db, M) => errandArm(db, M, true),
};

/* ── THE ERRAND, BOTH PATHS (2027-04-27-hearth-errand.sql; Tyler 2026-11-16: fed the Hearth while fishing, no walk, no throw,
   fishing stopped for good). A fisher at the shore presses "Burn" on one of three Bones: the player's own set_activity
   (artisan fuel_bones, count 1). Then the body walks to the Hearth on a VISIT, the one bone burns ONCE (one bone's Inner Flame
   XP, one craft row), the pointer goes back to the same fishing spot (which pays again), and the body walks back to the shore when
   the visit ends. `closed`: the owner's browser is shut, so the world tick settles the run and another player's town reads move
   the body; else the owner's own reads and settle (the shell's settle of a spent bench: the accrue verb's collect). ── */
const SPOT = 'shrimp_s';
async function errandArm(db, M, closed) {
  const out = [];
  await hero(db, U1);
  await hero(db, U2);
  await put(db, U1, 'bones', 3);
  const map = await one(db, 'select map_id from public.hr_town_maps where main');
  const shore = await one(db, "select public.hr_town_station_for($1, 'gather', $2)", [map, SPOT]);
  const fire = (await q(db, "select x, y from public.hr_town_stands where map_id = $1 and station_id = 'hearth' order by stand_no limit 1", [map]))[0];
  const exec = makeExec(db);
  const clear = () => db.query('delete from public.hr_rate_counters');
  const call = async (activity) => { await clear(); return M.SA.runSetActivity({ exec, user: U1, slot: 0, intentId: idem(), activity }); };
  const st = async () => (await q(db, 'select active_kind, active_id, active_left, errand_kind, errand_id from public.player_state where user_id = $1 and slot = 0', [U1]))[0];
  const body = async () => (await q(db, 'select station_id, why from public.town_bodies where user_id = $1 and slot = 0', [U1]))[0] || {};
  /* a town read: the owner's own (open browser), or another player's in the square (closed) */
  const read = async () => {
    if (closed) { await asUser(db, U2); await one(db, 'select public.hr_town_view(0, $1, $2, $3, null, null, null)', [map, fire.x, fire.y]); }
    else { await asUser(db, U1); await one(db, 'select public.hr_town_here(0, $1)', [map]); }
    await asUser(db, '');
    return body();
  };
  const back = (s) => db.query(`update public.player_state set accrued_to = accrued_to - make_interval(secs => $2), active_since = active_since - make_interval(secs => $2)
                                 where user_id = $1 and slot = 0`, [U1, s]);
  /* the run's settle: the world tick (closed) or the owner's settle (open) */
  const settle = async () => {
    await clear();
    if (closed) {
      /* the replay lands the tick disabled and gather disarmed (production runs both: tests/artisan-tick.mjs prepare) */
      await db.query("update public.hr_tick_config set enabled = true, armed_channels = (select array_agg(distinct x) from unnest(armed_channels || '{gather,artisan}'::text[]) x) where id");
      await db.query('select public.hr_tick_enrol(200)');
      const holder = await one(db, "select left('cron:' || coalesce(current_database(), 'db'), 64)");
      await db.query('select count(*) from public.hr_tick_roster((select channels from public.hr_tick_config where id), 0, 200, $1, 30000, null, null, null)', [holder]);
      return M.TK.runTick({ exec, body: { op: 'tick', roster: [{ user_id: U1, slot: 0 }], cadence_ms: 10000, flush_ms: 90000 } });
    }
    const [r] = await exec(M.SA.READ_SQL, [U1, 0, 'accrue']);
    return M.SA.collectCurrentWindow({ exec, user: U1, slot: 0, env: r.state, st: r.state.state, nowMs: new Date(r.now).getTime(),
      capMs: Number(r.cap_ms) || 0, pointerSurvives: true });
  };
  const crafts = async () => (await q(db, "select meta from public.player_ledger where user_id = $1 and slot = 0 and kind = 'craft' and meta->>'recipe' = 'fuel_bones' order by id", [U1])).map((r) => r.meta);

  /* FISHING at the shore, the body at its station */
  const fish = await call({ kind: 'gather', id: SPOT, count: 100000 });
  if (fish.status !== 200 || !fish.body || fish.body.ok !== true) return ['the fishing was refused: ' + JSON.stringify(fish).slice(0, 300)];
  if (closed) await db.query("update public.player_state set last_seen_at = null where user_id = $1 and slot = 0", [U1]);
  if ((await read()).station_id !== shore) out.push('the fisher stands at ' + JSON.stringify(await body()) + ', not the ' + shore);
  const x0 = await xp(db, U1);
  /* "FUEL THE HEARTH": one bone, while fishing */
  const go = await call({ kind: 'artisan', id: 'fuel_bones', count: 1 });
  if (go.status !== 200 || !go.body || go.body.ok !== true) return out.concat(['"Burn" was refused: ' + JSON.stringify(go).slice(0, 300)]);
  const s1 = await st();
  if (s1.errand_kind !== 'gather' || s1.errand_id !== SPOT) out.push('the errand did not remember the fishing: ' + JSON.stringify(s1));
  /* THE WALK: the body goes to the Hearth on a visit (the World walks it there, and throws on arrival: IF-4) */
  const b1 = await read();
  if (b1.station_id !== 'hearth' || b1.why !== 'visit') out.push('the errand set the body at ' + JSON.stringify(b1) + ', not on a visit to the Hearth');
  /* THE BURN: the bone's moment passes (the tick's window, the owner's settle) */
  if (closed) await db.query('select public.hr_tick_enrol(200)');
  await back(90);
  const paid = await settle();
  const gained = (await xp(db, U1)) - x0;
  const rows = await crafts();
  const d = (r) => (r && r.delta) || {};
  if ((await qty(db, U1, 'bones')) !== 2) out.push(`the errand left ${await qty(db, U1, 'bones')} of 3 Bones (want 2): ${JSON.stringify(paid).slice(0, 300)}`);
  if (!(gained >= Math.floor(M.CM.FLAME_FUEL.xpPerBone) && gained <= Math.ceil(M.CM.FLAME_FUEL.xpPerBone))) out.push(`one bone paid ${gained} Inner Flame XP, not ~${M.CM.FLAME_FUEL.xpPerBone}`);
  if (rows.length !== 1 || Number((d(rows[0]).i || {}).bones) !== -1 || Number((d(rows[0]).x || {}).inner_flame) !== gained) out.push('the burn is not ONE craft row of one bone and its XP: ' + JSON.stringify(rows).slice(0, 300));
  /* BACK TO FISHING, the same spot */
  const s2 = await st();
  if (s2.active_kind !== 'gather' || s2.active_id !== SPOT || !(s2.active_left > 0 && s2.active_left <= 100000) || s2.errand_kind !== null) out.push('after the errand the hero is ' + JSON.stringify(s2) + ', not fishing again');
  /* the body stays at the fire while the visit holds (the walk and the throw), then walks back to the shore */
  if ((await read()).station_id !== 'hearth') out.push('the fishing took the body off the Hearth before its visit ended: ' + JSON.stringify(await body()));
  await db.query('update public.town_bodies set visit_until = now() - interval \'1 second\' where user_id = $1 and slot = 0', [U1]);
  const b3 = await read();
  if (b3.station_id !== shore || b3.why !== 'work') out.push('the ended visit left the body at ' + JSON.stringify(b3) + ', not working at the ' + shore);
  /* the fishing pays again, and nothing burns twice */
  const f0 = Number((await one(db, "select xp from public.player_skills where user_id = $1 and slot = 0 and skill_id = 'fishing'", [U1])) || 0);
  if (closed) await db.query('select public.hr_tick_enrol(200)');
  await back(120);
  await settle();
  const f1 = Number((await one(db, "select xp from public.player_skills where user_id = $1 and slot = 0 and skill_id = 'fishing'", [U1])) || 0);
  if (!(f1 > f0)) out.push(`the fishing paid nothing after the errand (${f0} -> ${f1})`);
  if ((await qty(db, U1, 'bones')) !== 2 || (await crafts()).length !== 1 || (await xp(db, U1)) - x0 !== gained) out.push('a later settle burnt or paid the errand again');
  if (closed) return out;
  /* THE PLAYER'S OWN STOP mid-errand stops the hero (as every Stop does) */
  const again = await call({ kind: 'artisan', id: 'fuel_bones', count: 1 });
  const stop = await call({ kind: 'idle' });
  const s3 = await st();
  if (again.body.ok !== true || stop.body.ok !== true || s3.active_kind !== 'idle' || s3.errand_kind !== null) out.push('a Stop mid-errand left the hero ' + JSON.stringify(s3));
  return out;
}

async function loadReaders(root) {
  const u = (p) => pathToFileURL(join(root, p)).href + sourceQuery(root);
  return {
    BU: await import(u('src/shell/windows/inventory/bury.js')),
    ST: await import(u('src/shell/windows/inventory/state.js')),
    TP: await import(u('src/session/town-presence.js')),
    HB: await import(u('src/world/hearth-burn.js')),
    HD: await import(u('src/data/hearth.js')),
    IL: await import(u('src/shell/item-lore.js')),
    TW: await import(u('src/shell/town-work.js')),
  };
}

async function loadEdge(root) {
  const u = (p) => pathToFileURL(join(root, p)).href;
  return { SA: await import(u('supabase/functions/hr-accrue/set-activity.js')), CM: await import(u('src/data/core-model.js')),
    TK: await import(u('supabase/functions/hr-accrue/tick.js')) };
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
