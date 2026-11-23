#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/catacombs.mjs — THE UNMARKED CATACOMBS' DESCENT, PLAYED ON THE REPLAYED CHAIN WITH THE REAL ENGINE (lane/c-catacombs, 2026-11-18;
//   Tyler 2026-11-16, the board's "2026-11-16 The Unmarked Catacombs descent"; supabase/migrations/2027-05-08-catacombs.sql and its catalogues).
//
//   CB-DATA     the run rows (two wings: their rosters, Keeper Dunn, the boards), the `catacomb` mode a copy of `tower`, the eight keys (each
//               wing's metal, the Tower's doors and odds, the 70/30 lean), every key holding its six, the 24 pieces, and the server's rows the data's.
//   CB-METALS   THE DEEP KEYS OPEN (lane/d-catacomb-gold-platinum): a Gold Bone Key and a Platinum Waterlogged Key at the Hearth Chest each pay a
//               piece of their own metal (the key's six, the bag holds it), never chest_not_ready, and the keys are spent.
//   CB-ROOM     a wing's room is its own roster, Dunn at every door, never the Tower's ladder; the engine's call sites pass the wing's run.
//   CB-DOORS    a descent, the BROWSER CLOSED (the world tick) and the HUNT VIEWED (the player's settle), land the same: the `catacomb` mode,
//               the run on its wing, the wing's own record, one Bone Key a door to each hero alive (catacomb_key), no death price, no coin,
//               no Bestiary, the solo board raised, the Tower untouched, and only the wing's kinds in the world.
//   CB-START    the door: feature_off, bad_wing, the wing's Level (catacomb_level), the checkpoints per wing (a door of the record, bad_landing
//               otherwise), a replayed key answers once; the section: hidden while off, then each wing's record and doors.
//   CB-CAP      SIX A FAMILY A WEEK (the seventh Catacomb key refused week_limit; the Tower's family still opens) and THE HELD CAP ACROSS
//               THE ACCOUNT (another hero's bag and Storage count; held_max x heroes; at the cap a door's key is withheld and journalled).
//   CB-LEAN     both families on one chest, each its own warmth; 200 sure Bone Keys find ~70% helmets, 200 Waterlogged ~30%; the weight the
//               worn one about half the time, even thirds where nothing is worn.
//   CB-BOARD    a descent alone raises "Catacombs, Deepest" alone, a party's raises the party board (never the other), raise-only; a forged
//               window (more rooms than the stair allows) is refused and moves no board: the clamp.
//   CB-IDEM     a second apply of 2027-05-08-catacombs.sql, on the chain up to it, is byte-identical (schema, every body it states, its rows).
//
//   node tests/catacombs.mjs              the guard (credential-free)
//   node tests/catacombs.mjs --arm=lean   one arm
//   node tests/catacombs.mjs --mutate     each defect below planted in the booted chain (or a file) must turn its arm red (--selftest: the same)
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isMain } from './_is-main.mjs';
import { bootReplay, inventory } from './schema-replay.mjs';
import { loadGear } from '../tools/balance-sim/gear.mjs';

const H = (await import('./hunt-sessions-settle.mjs')).HARNESS;
const TC = (await import('./tower-climb.mjs')).HARNESS;
const { one, q, makeExec } = H;
const ROOT = H.ROOT;
const UID = H.UIDS[0], UID2 = H.UIDS[1];
const FILE = '2027-05-08-catacombs.sql';
const SPAN = TC.SPAN;
const idem = () => crypto.randomUUID();
const rewind = (db) => db.query(`select setval('public.hr_test_uuid_seq', 1000, false)`);
const asUser = (db, uid) => db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
async function as(db, uid, sql, p) { await asUser(db, uid); try { return await one(db, sql, p); } finally { await asUser(db, ''); } }
const switchOn = (db, uids) => db.query("update public.hr_feature_switches set scope = 'accounts', accounts = $1::uuid[] where switch_id = 'unmarked_catacombs'", [uids]);

/* ── CB-DATA ─────────────────────────────────────────────────────────────── */
async function dataArm(db, M) {
  const bad = [];
  const W = M.TD.CATACOMB_WINGS, RG = M.TD.RUN_GROUNDS;
  const wing = (id) => W.find((w) => w.wing === id);
  if (W.map((w) => w.wing).join(',') !== 'flooded,bone') bad.push('CB-DATA the wings read ' + W.map((w) => w.wing));
  const fl = wing('flooded'), bo = wing('bone');
  if (Object.keys(fl.roster).sort().join(',') !== 'night_carter,shrouded_pauper,vault_leech' || Object.keys(bo.roster).sort().join(',') !== 'bone_wall,night_carter,shrouded_pauper'
      || !(bo.roster.night_carter < bo.roster.bone_wall)) bad.push('CB-DATA the rosters are not the design\'s: ' + JSON.stringify([fl.roster, bo.roster]));
  for (const w of W) {
    const r = RG[w.hunt];
    if (!r || r.keeper !== 'keeper_dunn' || r.family !== 'catacomb' || r.board !== 'catacomb' || r.boardParty !== 'catacomb_party' || r.landingEvery !== 10
        || r.roomSize !== M.TD.TOWER_RULES.roomSize || r.floorLimitMs !== M.TD.TOWER_RULES.floorLimitMs || r.stairMs !== M.TD.TOWER_RULES.stairMs) {
      bad.push('CB-DATA the ' + w.wing + ' run row reads ' + JSON.stringify(r));
    }
    if (!M.G.TOWER_GROUNDS[w.hunt] || M.G.TOWER_GROUNDS[w.hunt].mode !== 'catacomb' || M.G.TOWER_GROUNDS[w.hunt].map !== 'unmarked_catacombs') bad.push('CB-DATA the ' + w.wing + ' ground row reads ' + JSON.stringify(M.G.TOWER_GROUNDS[w.hunt]));
    for (const id of [...Object.keys(w.roster), w.keeper]) if (!M.MON.MONSTERS[id]) bad.push('CB-DATA ' + id + ' is no monster');
  }
  /* the mode: the Tower's row but its id (Tyler: "their OWN game mode like the Burning Tower"; the design: a copy of `tower`) */
  const { id: a, ...tw } = M.SMD.SESSION_MODES.tower, { id: b, ...cm } = M.SMD.SESSION_MODES.catacomb || {};
  if (JSON.stringify(tw) !== JSON.stringify(cm) || b !== 'catacomb') bad.push('CB-DATA the catacomb mode is not the tower mode\'s copy: ' + JSON.stringify(M.SMD.SESSION_MODES.catacomb));
  /* the keys: each wing's metal, the Tower's doors and odds, the lean */
  const CK = M.CH.CATACOMB_KEYS;
  const sum = CK.map((k) => [k.id, k.ground, k.from, k.weaponPm, k.helmetPm, k.gear, k.family].join(':')).join('|');
  /* the Tower's doors and odds: generated (src/data/chests.js landingForLevel, KEY_ODDS; lane/tower-boss-formula), Bronze 40 to Platinum 140 */
  const want = ['waterlogged', 'bone'].flatMap((lean) => [['bronze', 40, 160], ['silver', 80, 80], ['gold', 120, 40], ['platinum', 140, 20]]
    .map(([m, from, pm]) => [lean + '_' + m, lean === 'bone' ? bo.hunt : fl.hunt, from, pm, lean === 'bone' ? 700 : 300, 'armor', 'catacomb'].join(':'))).join('|');
  if (sum !== want) bad.push('CB-DATA the Catacomb keys read ' + sum);
  const ready = CK.filter((k) => Object.keys(k.armor).length === 6).map((k) => k.id).sort().join(',');
  if (ready !== CK.map((k) => k.id).sort().join(',')) bad.push('CB-DATA the keys with their six pieces are ' + ready + ' (all four metals ship: every key the descent drops opens)');
  if ((M.CH.keyForLanding(50, undefined, bo.hunt) || {}).id !== 'bone_bronze' || (M.CH.keyForLanding(150, undefined, fl.hunt) || {}).id !== 'waterlogged_platinum'
      || (M.CH.keyForLanding(50) || {}).id !== 'bronze') bad.push('CB-DATA a door hands out another ground\'s key');
  /* the server's rows are the data's */
  const rules = await q(db, 'select hunt_id, id, wing, keeper, family, board, board_party, min_level from public.hr_tower_rules order by hunt_id');
  const rw = Object.values(RG).map((r) => [r.hunt, r.hunt === M.TD.TOWER_RULES.hunt ? 'true' : 'null', r.wing, r.keeper, r.family, r.board, r.boardParty, r.minLevel].join(':')).sort().join('|');
  if (rules.map((r) => [r.hunt_id, String(r.id), r.wing, r.keeper, r.family, r.board, r.board_party, r.min_level].join(':')).join('|') !== rw) bad.push('CB-DATA hr_tower_rules reads ' + JSON.stringify(rules));
  const armor = await q(db, "select a.key_id, a.slot, a.weight, a.item_id from public.hr_chest_armor a order by 1, 2, 3");
  const aw = CK.flatMap((k) => Object.entries(k.armor).map(([sw, it]) => [k.id, ...sw.split(':'), it].join(':'))).sort().join('|');
  if (armor.map((r) => [r.key_id, r.slot, r.weight, r.item_id].join(':')).sort().join('|') !== aw) bad.push('CB-DATA hr_chest_armor reads ' + JSON.stringify(armor).slice(0, 300));
  const items = await q(db, "select item_id, tradeable, value from public.hr_items where item_id = any($1::text[]) order by item_id", [CK.map((k) => k.item).concat(M.CA.CATACOMB_ARMOR_SHIPPED.map((r) => r.id))]);
  if (items.length !== 32 || items.some((r) => (r.item_id.includes('_key_') ? r.tradeable !== false || Number(r.value) !== 0 : r.tradeable !== true || !(Number(r.value) > 0)))) {
    bad.push('CB-DATA the keys are not bound or the pieces do not trade: ' + JSON.stringify(items).slice(0, 300));
  }
  const mode = await q(db, "select death_loss_pm, blessings, xp_pm, coin, drops, bestiary, stamina, checkpoint_every from public.hr_session_modes where mode_id = 'catacomb'");
  if (!mode.length || mode[0].death_loss_pm !== 0 || mode[0].coin || mode[0].drops || mode[0].bestiary || !mode[0].stamina || mode[0].xp_pm !== cm.xpPm) bad.push('CB-DATA hr_session_modes catacomb reads ' + JSON.stringify(mode));
  return bad;
}

/* ── CB-ROOM ─────────────────────────────────────────────────────────────── */
function roomArm(_db, M) {
  const bad = [];
  for (const w of M.TD.CATACOMB_WINGS) {
    const run = M.TD.RUN_GROUNDS[w.hunt], ground = M.G.TOWER_GROUNDS[w.hunt];
    if (M.T.towerOf(ground) !== run) bad.push(`CB-ROOM the ${w.wing} ground reads another run row`);
    const kinds = new Set([...Object.keys(w.roster), w.keeper]);
    for (let F = 1; F <= 120; F++) {
      const r = M.T.towerRoom(F, run);
      if (r.monsters.length !== run.roomSize || r.monsters.some((id) => !kinds.has(id))) { bad.push(`CB-ROOM ${w.wing} room ${F} fields ${r.monsters}`); break; }
      if ((F % 10 === 0) !== (r.keeper === 'keeper_dunn') || (r.keeper && (r.monsters[0] !== 'keeper_dunn' || r.monsters.slice(1).includes('keeper_dunn')))) { bad.push(`CB-ROOM ${w.wing} room ${F}'s Keeper reads ${r.keeper}`); break; }
      if (F === 40) {
        const t = M.T.towerMonsters(F, run);
        if (t.keeper_dunn.level !== 40 || t.keeper_dunn.gp[1] !== 0 || t.keeper_dunn.drops.length || t[Object.keys(w.roster)[0]].level !== 40) bad.push(`CB-ROOM ${w.wing} room 40's rows are not the formula's at 40, no coin, no drops`);
      }
    }
    if (JSON.stringify(M.T.towerRoom(7, run)) === JSON.stringify(M.T.towerRoom(7))) bad.push(`CB-ROOM ${w.wing} room 7 is the Tower's floor 7`);
  }
  /* the Tower's rooms never moved: its keeper and slots are picked on its own namespace still */
  const t10 = M.T.towerRoom(10);
  if (!t10.keeper || t10.keeper === 'keeper_dunn') bad.push('CB-ROOM the Tower\'s landing 10 reads ' + JSON.stringify(t10));
  return bad;
}

/* ── THE DESCENDER (the Tower's climber, through the descent's own door) ─────────────── */
/* `o.style` dresses the hero in that style's ladder kit at its Level (tools/balance-sim/gear.mjs kitOf: the worn set a player of that
   Level holds) in place of the start kit hr_create_character hands out; without it the hero descends bare, as before. */
let GEAR = null;
async function dress(db, style, level) {
  GEAR = GEAR || await loadGear(ROOT);
  await db.query('delete from public.player_equipment where user_id = $1 and slot = 0', [UID]);
  for (const [slot, item] of Object.entries(GEAR.kitOf(style, level))) {
    await db.query('insert into public.player_equipment (user_id, slot, equip_slot, item_id) values ($1, 0, $2, $3)', [UID, slot, item]);
  }
}
async function descender(db, M, o = {}) {
  await rewind(db);
  await H.character(db, M, UID, { level: o.level || 12, inv: {}, gold: 200000 });
  if (o.style) await dress(db, o.style, o.level || 12);
  await db.query('update public.hr_hunt_config set enabled = true where id');
  await db.query('update public.hr_tick_config set enabled = true where id');
  await switchOn(db, [UID]);
  const r = await as(db, UID, 'select public.hr_catacomb_start(0, $1, $2, $3::uuid)', [o.wing || 'bone', o.landing === undefined ? 0 : o.landing, idem()]);
  if (!r || r.ok !== true) throw new Error('hr_catacomb_start refused: ' + JSON.stringify(r));
  const sid = r.session_id;
  const t = `date_trunc('second', now() - make_interval(mins => ${Number(o.minutesAgo || 25)}))`;
  await db.query(`update public.hunt_sessions set entered_at = ${t} - interval '1 minute', hunt_from = ${t}, settled_to = ${t}, next_swing_at = ${t} where id = $1`, [sid]);
  const inst = await one(db, 'select instance_id from public.hunt_sessions where id = $1', [sid]);
  await db.query(`update public.hunt_instances set settled_to = ${t}, next_swing_at = ${t} where id = $1`, [inst]);
  const from = Number(await one(db, `select floor(extract(epoch from settled_to) * 1000)::bigint from public.hunt_instances where id = $1`, [inst]));
  return { sid, inst, from, start: r };
}
/* every monster kind standing in the stored world (the engine's own encoding: a unit is an array carrying its kind) */
async function kindsIn(db, M, inst) {
  const w = await one(db, 'select world from public.hunt_instances where id = $1', [inst]);
  const out = new Set();
  if (typeof w === 'string') for (const u of JSON.parse(w).u || []) for (const v of u) if (typeof v === 'string' && M.MON.MONSTERS[v]) out.add(v);
  return out;
}
async function state(db, h) {
  return one(db, `select jsonb_build_object(
      'run', (select to_jsonb(r) - 'session_id' - 'instance_id' - 'started_at' - 'ended_at' - 'updated_at' from public.tower_runs r where r.session_id = $2),
      'best', (select jsonb_object_agg(p.hunt_id, jsonb_build_array(p.best_floor, p.best_landing)) from public.tower_progress p where p.user_id = $1 and p.slot = 0),
      'keys', (select jsonb_object_agg(l.meta->>'landing', l.item_id) from public.player_ledger l where l.session_id = $2 and l.intent = 'catacomb_key'),
      'tower_keys', (select count(*) from public.player_ledger l where l.user_id = $1 and l.intent like 'tower\\_key%'),
      'level_xp', (select level_xp from public.player_state where user_id = $1 and slot = 0),
      'death_rows', (select count(*) from public.player_ledger where session_id = $2 and intent = 'death_xp'),
      'coin_rows', (select count(*) from public.player_ledger where session_id = $2 and gold > 0),
      'ev', (select count(*) from public.player_progress where user_id = $1 and key like 'ev:%'),
      'board', (select jsonb_object_agg(b.mode_id, b.score) from public.hr_mode_board b where b.user_id = $1),
      'end', (select h.end_reason from public.hunt_sessions h where h.id = $2),
      'mode', (select i.session_mode from public.hunt_instances i where i.id = $3))`, [UID, h.sid, h.inst]);
}

/* ── CB-DOORS: both paths ─────────────────────────────────────────────────────────────── */
async function doorsArm(db, M) {
  const bad = [];
  const sigs = {};
  const bone = M.TD.CATACOMB_WINGS.find((w) => w.wing === 'bone');
  const allowed = new Set([...Object.keys(bone.roster), bone.keeper, 'rat']);
  for (const door of ['closed', 'viewed']) {
    const tag = `CB-DOORS the ${door === 'closed' ? 'browser closed' : 'hunt viewed'}:`;
    const r = await H.inTx(db, async () => {
      /* A LEVEL 50 HAMMER IN ITS LADDER KIT: the arm's case is a vault door minting the wing's key, and the first keyed door is Bronze's
         generated 40 (src/data/chests.js landingForLevel). The bare Level 12 this arm sent tops out at room 13 since the keys moved to
         their generated landings (lane/tower-boss-formula), so both doors minted nothing and "a wing mints the Tower's keys" had nothing
         to read (ESCAPED on run 45221888675). Measured on set f385c30e1: this hero clears door 40 and falls in room 46, 15.6 of SPAN's
         20 minutes (Levels 48 to 55 in their kits clear 40 too, 46 does not). The CONTROL below turns red the day it stops reaching a key. */
      const h = await descender(db, M, { wing: 'bone', level: 50, style: 'hammer' });
      const s0 = await state(db, h);
      const seen = new Set();
      try {
        if (door === 'closed') await TC.drive(db, M, 'closed', h);
        else {
          /* the player's settle at the Tower harness's own cuts, the world read after each */
          const exec = makeExec(db);
          for (const at of [h.from + 7001, h.from + 33333, h.from + 61234, h.from + 200001, h.from + 333333, h.from + 600000, h.from + SPAN]) {
            for (let guard = 0; guard < 60; guard++) {
              const s = (await q(db, 'select settled_to, ended_at from public.hunt_sessions where id = $1', [h.sid]))[0];
              if (s.ended_at || Date.parse(s.settled_to) >= at) break;
              const v = await M.HS.settleHunt({ exec, user: UID, slot: 0, mode: 'settle', bucket: null, project: true, live: true, atMs: at, minWindowMs: 0, grounds: {} });
              if (v.outcome !== 'paid') throw new Error('the player\'s settle answered ' + JSON.stringify({ o: v.outcome, r: v.reason, d: v.body && v.body.detail }).slice(0, 400));
              for (const k of await kindsIn(db, M, h.inst)) seen.add(k);
            }
            if ((await q(db, 'select ended_at from public.hunt_sessions where id = $1', [h.sid]))[0].ended_at) break;
          }
        }
      } catch (e) { return { err: String(e.message).slice(0, 400) }; }
      for (const k of await kindsIn(db, M, h.inst)) seen.add(k);
      return { s0, s1: await state(db, h), seen: [...seen].sort(), start: h.start };
    });
    if (r.err) { bad.push(`${tag} ${r.err}`); continue; }
    const { s0, s1 } = r, run = s1.run || {};
    if (s1.mode !== 'catacomb') bad.push(`${tag} the instance plays ${s1.mode}`);
    if (run.hunt_id !== bone.hunt) bad.push(`${tag} the run is on ${run.hunt_id}`);
    if (!(run.top_floor >= 10)) { bad.push(`${tag} CONTROL: the descent reached room ${run.top_floor} (want a vault door): ${JSON.stringify(run)}`); continue; }
    if (r.start.wing !== 'bone' || r.start.floor !== 1 || JSON.stringify(r.start.checkpoints) !== '[0]') bad.push(`${tag} the door answered ${JSON.stringify(r.start).slice(0, 200)}`);
    if (JSON.stringify(s1.best) !== JSON.stringify({ [bone.hunt]: [run.top_floor, Math.floor(run.top_floor / 10) * 10] })) bad.push(`${tag} the record reads ${JSON.stringify(s1.best)} (want the Bone Wing's alone)`);
    const want = {};
    /* a door under the first key's (Bronze's generated 40) mints nothing */
    for (let l = 10; l <= run.top_floor; l += 10) { const k = M.CH.keyForLanding(l, undefined, bone.hunt); if (k) want[l] = k.item; }
    if (!Object.keys(want).length) bad.push(`${tag} CONTROL: the descent cleared no keyed door (top room ${run.top_floor}), so no mint was read`);
    if (JSON.stringify(s1.keys || {}) !== JSON.stringify(want)) bad.push(`${tag} the doors minted ${JSON.stringify(s1.keys)}, not ${JSON.stringify(want)}`);
    if (Number(s1.tower_keys) !== 0) bad.push(`${tag} a Tower key row was journalled`);
    if (s1.end !== 'died' || run.end_reason !== 'died') bad.push(`${tag} the descent ended ${s1.end} (run ${run.end_reason}), not died`);
    if (Number(s1.death_rows) !== 0) bad.push(`${tag} the death journalled ${s1.death_rows} death_xp row(s): Dunn carries you up for nothing`);
    if (!(Number(s1.level_xp) > Number(s0.level_xp))) bad.push(`${tag} the Level XP did not rise`);
    if (Number(s1.coin_rows) !== 0 || Number(s1.ev) !== Number(s0.ev)) bad.push(`${tag} coin (${s1.coin_rows} rows) or a Bestiary count moved`);
    if (JSON.stringify(s1.board) !== JSON.stringify({ catacomb: run.top_floor })) bad.push(`${tag} the boards read ${JSON.stringify(s1.board)} (want Catacombs, Deepest alone at ${run.top_floor})`);
    const off = r.seen.filter((k) => !allowed.has(k));
    if (off.length) bad.push(`${tag} the world fielded ${off} (the Tower's ladder, not the Bone Wing's roster)`);
    /* the hunt viewed reads the world after every settle; the browser closed only once, at its end, when the room may stand empty */
    if (door === 'viewed' && !r.seen.some((k) => k !== 'rat')) bad.push(`${tag} CONTROL: no monster kind was read from the world`);
    sigs[door] = JSON.stringify([run, s1.best, s1.keys, s1.level_xp, s1.end, s1.board]);
  }
  if (sigs.closed && sigs.viewed && sigs.closed !== sigs.viewed) bad.push(`CB-DOORS the browser closed lands ${sigs.closed.slice(0, 240)}, the hunt viewed ${sigs.viewed.slice(0, 240)}`);
  return bad;
}

/* ── CB-START ─────────────────────────────────────────────────────────────── */
async function startArm(db, M) {
  const bad = [];
  const bo = M.TD.CATACOMB_WINGS.find((w) => w.wing === 'bone');
  const r = await H.inTx(db, async () => {
    const out = {};
    await rewind(db);
    await H.character(db, M, UID, { level: 12, inv: {}, gold: 200000 });
    await db.query('update public.hr_hunt_config set enabled = true where id');
    out.off = await as(db, UID, 'select public.hr_catacomb_start(0, $1, 0, $2::uuid)', ['bone', idem()]);
    out.offSection = await one(db, `select public.hr_state_of($1::uuid, 0)->'catacomb'`, [UID]);
    out.offChest = await one(db, `select public.hr_state_of($1::uuid, 0)->'tower'`, [UID]);
    await switchOn(db, [UID]);
    out.wing = await as(db, UID, 'select public.hr_catacomb_start(0, $1, 0, $2::uuid)', ['crypt', idem()]);
    /* a record on the Bone Wing alone: its doors offered there, none on the Flooded Wing */
    await db.query('insert into public.tower_progress (user_id, slot, hunt_id, best_floor, best_landing) values ($1, 0, $2, 25, 20)', [UID, bo.hunt]);
    out.section = await one(db, `select public.hr_state_of($1::uuid, 0)->'catacomb'`, [UID]);
    out.floodedTen = await as(db, UID, 'select public.hr_catacomb_start(0, $1, 10, $2::uuid)', ['flooded', idem()]);
    out.open0 = Number(await one(db, 'select count(*) from public.hunt_sessions where user_id = $1 and ended_at is null', [UID]));
    const key = idem();
    out.boneTwenty = await as(db, UID, 'select public.hr_catacomb_start(0, $1, 20, $2::uuid)', ['bone', key]);
    out.replay = await as(db, UID, 'select public.hr_catacomb_start(0, $1, 20, $2::uuid)', ['bone', key]);
    out.runs = await q(db, 'select hunt_id, start_floor, party from public.tower_runs where user_id = $1', [UID]);
    out.journal = Number(await one(db, "select count(*) from public.player_ledger where user_id = $1 and intent = 'catacomb_start:bone:20'", [UID]));
    out.after = await one(db, `select public.hr_state_of($1::uuid, 0)->'catacomb'`, [UID]);
    /* the wing's Level: a hero under it opens nothing */
    await db.query(`select public.hr_hunt_close($1, 'left', now(), true)`, [out.boneTwenty.session_id]);
    await db.query('update public.player_state set level_xp = 0 where user_id = $1 and slot = 0', [UID]);
    out.low = await as(db, UID, 'select public.hr_catacomb_start(0, $1, 0, $2::uuid)', ['bone', idem()]);
    out.open1 = Number(await one(db, 'select count(*) from public.hunt_sessions where user_id = $1 and ended_at is null', [UID]));
    return out;
  });
  if (r.off?.error !== 'feature_off' || r.offSection !== null) bad.push(`CB-START with its switch off the door answered ${JSON.stringify(r.off)} and the section ${JSON.stringify(r.offSection)}`);
  if ((r.offChest?.chest?.families || []).some((f) => f.family === 'catacomb') || (r.offChest?.chest?.keys || []).some((k) => k.family === 'catacomb')) bad.push('CB-START the Tower\'s chest lists the Catacomb family with its switch off');
  if (r.wing?.error !== 'bad_wing') bad.push('CB-START an unknown wing answered ' + JSON.stringify(r.wing));
  const s = r.section || {};
  const ws = Object.fromEntries((s.wings || []).map((w) => [w.wing, w]));
  if (JSON.stringify(ws.bone?.checkpoints) !== '[0,10,20]' || JSON.stringify(ws.flooded?.checkpoints) !== '[0]' || ws.bone?.best !== 25 || ws.flooded?.best !== 0
      || s.gate?.ok !== true || s.gate?.need !== M.TD.CATACOMB_RULES.minLevel || s.rules?.door_every !== 10 || s.pays?.death_loss_pm !== 0 || s.last_wing !== null) {
    bad.push('CB-START the section reads ' + JSON.stringify(s).slice(0, 400));
  }
  if (!(s.chest?.families || []).some((f) => f.family === 'catacomb' && f.max === 6 && f.held_max === 30 && f.per_hero === 30)) bad.push('CB-START the section\'s chest lists no Catacomb family of six and 30: ' + JSON.stringify(s.chest?.families));
  if (r.floodedTen?.error !== 'bad_landing' || JSON.stringify(r.floodedTen?.checkpoints) !== '[0]' || r.open0 !== 0) bad.push(`CB-START a Flooded door the hero never reached answered ${JSON.stringify(r.floodedTen)} (${r.open0} open)`);
  if (r.boneTwenty?.ok !== true || r.boneTwenty?.floor !== 21 || r.boneTwenty?.wing !== 'bone') bad.push('CB-START the Bone Wing from door 20 answered ' + JSON.stringify(r.boneTwenty).slice(0, 300));
  if (r.runs.length !== 1 || r.runs[0].hunt_id !== bo.hunt || r.runs[0].start_floor !== 21 || r.journal !== 1) bad.push(`CB-START one key opened ${JSON.stringify(r.runs)} with ${r.journal} journal rows`);
  /* a replayed key answers its receipt (the journal-only apply's) and opens nothing: still one run, one journal row (above) */
  if (r.replay?.ok !== true || (r.replay?.session_id && r.replay.session_id !== r.boneTwenty?.session_id)) bad.push('CB-START a replayed key answered ' + JSON.stringify(r.replay).slice(0, 200));
  if (r.after?.last_wing !== 'bone' || r.after?.run?.wing !== 'bone' || r.after?.run?.start !== 21) bad.push('CB-START the section after the start reads ' + JSON.stringify([r.after?.last_wing, r.after?.run]));
  if (r.low?.error !== 'catacomb_level' || r.low?.need !== M.TD.CATACOMB_RULES.minLevel || r.open1 !== 0) bad.push(`CB-START a Level 1 hero answered ${JSON.stringify(r.low)} (${r.open1} open)`);
  return bad;
}

/* ── CB-CAP ─────────────────────────────────────────────────────────────── */
async function capArm(db, M) {
  const bad = [];
  const bo = M.TD.CATACOMB_WINGS.find((w) => w.wing === 'bone');
  const r = await H.inTx(db, async () => {
    const out = {};
    await rewind(db);
    await H.character(db, M, UID, { level: 12, inv: { bone_key_bronze: 9, tower_key_bronze: 2 }, gold: 200000 });
    await db.query("update public.hr_feature_switches set scope = 'accounts', accounts = $1::uuid[] where switch_id in ('unmarked_catacombs', 'burning_tower')", [[UID]]);
    /* SIX A FAMILY A WEEK: six Catacomb keys, then a seventh refused; the Tower's family still opens */
    out.six = await as(db, UID, "select public.hr_chest_open(0, 'great_hearth', 'bone_bronze', 6, 0, $1::uuid)", [idem()]);
    out.seventh = await as(db, UID, "select public.hr_chest_open(0, 'great_hearth', 'bone_bronze', 1, 0, $1::uuid)", [idem()]);
    out.tower = await as(db, UID, "select public.hr_chest_open(0, 'great_hearth', 'bronze', 1, 0, $1::uuid)", [idem()]);
    /* THE HELD CAP ACROSS THE ACCOUNT: Storage and the bag at the cap less one; a run over doors 40, 50 and 60 (the first key's generated door is 40) mints 40's and withholds the rest */
    const cap = Number(await one(db, "select public.hr_chest_family_cap($1, 'catacomb')", [UID]));
    out.cap = cap;
    out.held0 = Number(await one(db, "select public.hr_chest_family_held($1, 0, 'catacomb')", [UID]));
    await db.query("insert into public.account_bank (user_id, item_id, qty) values ($1, 'bone_key_silver', $2) on conflict (user_id, item_id) do update set qty = $2", [UID, cap - 1 - out.held0]);
    const sid = idem();
    await db.query('insert into public.tower_runs (session_id, user_id, slot, instance_id, hunt_id, start_floor) values ($1::uuid, $2, 0, $3::uuid, $4, 1)', [sid, UID, idem(), bo.hunt]);
    await db.query('update public.tower_runs set top_floor = 60, floors = 60, kills = 300 where session_id = $1::uuid', [sid]);
    out.rows = await q(db, `select intent, (meta->>'landing')::int as landing, (meta->>'max')::int as max from public.player_ledger where session_id = $1::uuid order by 2`, [sid]);
    /* a key moved from Storage into the bag makes no room: the count is the account's */
    await db.query("update public.account_bank set qty = qty - 5 where user_id = $1 and item_id = 'bone_key_silver'", [UID]);
    await db.query("insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, 'bone_key_silver', 5)", [UID]);
    out.held1 = Number(await one(db, "select public.hr_chest_family_held($1, 0, 'catacomb')", [UID]));
    /* a second hero on the account raises the cap by its own 30 */
    await db.query("insert into public.player_state (user_id, slot) select user_id, 1 from public.player_state where user_id = $1 and slot = 0", [UID]).catch((e) => { out.secondErr = String(e.message).slice(0, 120); });
    out.cap2 = Number(await one(db, "select public.hr_chest_family_cap($1, 'catacomb')", [UID]));
    return out;
  });
  if (r.six?.ok !== true || r.six?.opens?.length !== 6) bad.push('CB-CAP six Catacomb keys answered ' + JSON.stringify(r.six).slice(0, 300));
  if (r.seventh?.error !== 'week_limit' || r.seventh?.family !== 'catacomb' || r.seventh?.used !== 6 || r.seventh?.limit !== 6) bad.push('CB-CAP the seventh Catacomb key answered ' + JSON.stringify(r.seventh));
  if (r.tower?.ok !== true) bad.push('CB-CAP the Tower\'s family was refused beside a full Catacomb week: ' + JSON.stringify(r.tower).slice(0, 200));
  const minted = r.rows.filter((x) => x.intent === 'catacomb_key').map((x) => x.landing).join(','), held = r.rows.filter((x) => x.intent === 'catacomb_key_withheld');
  if (r.cap !== 30 || minted !== '40' || held.map((x) => x.landing).join(',') !== '50,60' || held.some((x) => x.max !== r.cap)) bad.push(`CB-CAP at the account's cap (${r.cap}) the doors read ${JSON.stringify(r.rows)}`);
  if (r.held1 !== r.cap) bad.push(`CB-CAP moving keys from Storage to the bag changed the account's count to ${r.held1} (cap ${r.cap})`);
  if (!r.secondErr && r.cap2 !== 60) bad.push(`CB-CAP a second hero on the account made the cap ${r.cap2}, not 60`);
  return bad;
}

/* ── CB-LEAN ─────────────────────────────────────────────────────────────── */
const N_LEAN = 200;
async function leanArm(db, M) {
  const bad = [];
  const r = await H.inTx(db, async () => {
    const out = {};
    await rewind(db);
    await H.character(db, M, UID, { level: 50, inv: { bone_key_bronze: N_LEAN, waterlogged_key_bronze: N_LEAN, tower_key_bronze: 3, tower_cinders: 900000, iron_helm: 1 }, gold: 200000 });
    await db.query("update public.hr_feature_switches set scope = 'accounts', accounts = $1::uuid[] where switch_id in ('unmarked_catacombs', 'burning_tower')", [[UID]]);
    await db.query('update public.hr_chest_key_families set opens_per_week = 1000, held_max = 1000');
    /* every Catacomb key a sure find (its chance is TCH-DATA's to prove): the slot and the weight are what this arm reads */
    await db.query("update public.hr_chest_keys set weapon_pm = 1000 where key_family = 'catacomb'");
    await db.query('update public.player_state set bank_cap = 500 where user_id = $1 and slot = 0', [UID]);
    /* worn: a plate helmet (heavy), no boots */
    await db.query("insert into public.player_equipment (user_id, slot, equip_slot, item_id) values ($1, 0, 'helmet', 'iron_helm') on conflict (user_id, slot, equip_slot) do update set item_id = excluded.item_id", [UID]);
    /* BOTH FAMILIES ON ONE CHEST, EACH ITS OWN WARMTH: the Tower family warm at 7, a Catacomb press never moves it */
    await db.query("insert into public.chest_warmth (user_id, slot, key_family, dry) values ($1, 0, 'tower', 7)", [UID]);
    for (const k of ['bone_bronze', 'waterlogged_bronze']) {
      for (let i = 0; i < N_LEAN / 20; i++) {
        const v = await as(db, UID, "select public.hr_chest_open(0, 'great_hearth', $1, 20, 0, $2::uuid)", [k, idem()]);
        if (!v || v.ok !== true) { out.err = k + ' refused: ' + JSON.stringify(v).slice(0, 300); return out; }
      }
    }
    out.towerDry = Number(await one(db, "select dry from public.chest_warmth where user_id = $1 and key_family = 'tower'", [UID]));
    out.tower = await as(db, UID, "select public.hr_chest_open(0, 'great_hearth', 'bronze', 1, 0, $1::uuid)", [idem()]);
    out.rows = await q(db, `select key_id, key_family, armor_slot, armor_weight, armor, weapon from public.chest_opens where user_id = $1 order by n`, [UID]);
    return out;
  });
  if (r.err) return ['CB-LEAN CONTROL: ' + r.err];
  const of = (k) => r.rows.filter((x) => x.key_id === k);
  for (const [k, slot] of [['bone_bronze', 'helmet'], ['waterlogged_bronze', 'boots']]) {
    const rows = of(k);
    if (rows.length !== N_LEAN || rows.some((x) => !x.armor || x.weapon || x.key_family !== 'catacomb')) { bad.push(`CB-LEAN ${k}: ${rows.length} sure keys, ${rows.filter((x) => !x.armor).length} without a piece`); continue; }
    const lean = rows.filter((x) => x.armor_slot === slot).length;
    /* 70% of 200, a standard deviation ~6.5: inside 4.5 of them */
    if (lean < 110 || lean > 170) bad.push(`CB-LEAN ${k} found ${lean} of ${N_LEAN} in its ${slot} slot (want about 140)`);
  }
  /* the weight: helmets the worn heavy about half the time; boots (nothing worn) about a third each */
  const helmets = r.rows.filter((x) => x.armor_slot === 'helmet'), boots = r.rows.filter((x) => x.armor_slot === 'boots');
  const heavyH = helmets.filter((x) => x.armor_weight === 'heavy').length / helmets.length;
  const thirds = ['heavy', 'medium', 'light'].map((w) => boots.filter((x) => x.armor_weight === w).length / boots.length);
  if (!(heavyH > 0.38 && heavyH < 0.62)) bad.push(`CB-LEAN the worn helmet weight came ${(heavyH * 100).toFixed(1)}% of ${helmets.length} helmets (want about 50%)`);
  if (thirds.some((t) => !(t > 0.22 && t < 0.45))) bad.push(`CB-LEAN boots with none worn came ${thirds.map((t) => (t * 100).toFixed(1) + '%')} (want even thirds)`);
  for (const x of r.rows.filter((y) => y.armor)) {
    const k = M.CH.CATACOMB_KEYS.find((c) => c.id === x.key_id);
    if (k.armor[x.armor_slot + ':' + x.armor_weight] !== x.armor) { bad.push(`CB-LEAN ${x.key_id} paid ${x.armor} for ${x.armor_slot}:${x.armor_weight}`); break; }
  }
  if (r.towerDry !== 7) bad.push(`CB-LEAN the Tower family's warmth moved to ${r.towerDry} under Catacomb presses`);
  if (r.tower?.ok !== true || r.rows[r.rows.length - 1].key_family !== 'tower' || r.rows[r.rows.length - 1].armor) bad.push('CB-LEAN the Tower key after them answered ' + JSON.stringify(r.tower).slice(0, 200));
  return bad;
}

/* ── CB-METALS ────────────────────────────────────────────────────────────── */
/* The deep keys open: a Gold Bone Key and a Platinum Waterlogged Key, each pressed at the chest, pay a piece of their own metal into the bag
   (before lane/d-catacomb-gold-platinum the chest refused both chest_not_ready, the key kept). The chance is CB-DATA's and TCH-DATA's to
   prove, so both are made a sure find here: what this arm reads is that the key opens and what it pays. */
const N_METAL = 3;
async function metalsArm(db, M) {
  const bad = [];
  const DEEP = [['bone_gold', 'gold'], ['waterlogged_platinum', 'platinum']];
  const r = await H.inTx(db, async () => {
    const out = { answers: {} };
    await rewind(db);
    await H.character(db, M, UID, { level: 50, inv: { bone_key_gold: N_METAL, waterlogged_key_platinum: N_METAL, tower_cinders: 1000 }, gold: 200000 });
    await switchOn(db, [UID]);
    await db.query("update public.hr_chest_keys set weapon_pm = 1000 where key_id = any($1::text[])", [DEEP.map(([k]) => k)]);
    for (const [k] of DEEP) out.answers[k] = await as(db, UID, "select public.hr_chest_open(0, 'great_hearth', $1, $2, 0, $3::uuid)", [k, N_METAL, idem()]);
    out.rows = await q(db, 'select key_id, armor, armor_slot, armor_weight, weapon from public.chest_opens where user_id = $1 order by n', [UID]);
    out.bag = Object.fromEntries((await q(db, 'select item_id, qty from public.player_inventory where user_id = $1 and slot = 0', [UID])).map((x) => [x.item_id, Number(x.qty)]));
    return out;
  });
  for (const [k, metal] of DEEP) {
    const key = M.CH.CATACOMB_KEYS.find((c) => c.id === k);
    const v = r.answers[k];
    if (!v || v.ok !== true) { bad.push(`CB-METALS the ${key.name} answered ${JSON.stringify(v).slice(0, 200)}`); continue; }
    const rows = r.rows.filter((x) => x.key_id === k);
    if (rows.length !== N_METAL || rows.some((x) => !x.armor || x.weapon)) { bad.push(`CB-METALS ${N_METAL} sure ${key.name}s wrote ${rows.length} opens, ${rows.filter((x) => !x.armor).length} without a piece`); continue; }
    for (const x of rows) {
      const piece = M.CA.CATACOMB_ARMOR.find((p) => p.id === x.armor);
      if (key.armor[x.armor_slot + ':' + x.armor_weight] !== x.armor || !piece || piece.key !== metal) { bad.push(`CB-METALS the ${key.name} paid ${x.armor} for ${x.armor_slot}:${x.armor_weight}, not a ${metal} piece of its six`); break; }
    }
    const paid = rows.reduce((o, x) => ({ ...o, [x.armor]: (o[x.armor] || 0) + 1 }), {});
    for (const [id, n] of Object.entries(paid)) if ((r.bag[id] || 0) !== n) bad.push(`CB-METALS the bag holds ${r.bag[id] || 0} ${id}, the ${key.name}s paid ${n}`);
    if (r.bag[key.item]) bad.push(`CB-METALS ${r.bag[key.item]} ${key.name}s are still in the bag after ${N_METAL} opened`);
  }
  return bad;
}

/* ── CB-BOARD ─────────────────────────────────────────────────────────────── */
async function boardArm(db, M) {
  const bad = [];
  const fl = M.TD.CATACOMB_WINGS.find((w) => w.wing === 'flooded');
  const r = await H.inTx(db, async () => {
    const out = {};
    await rewind(db);
    await H.character(db, M, UID, { level: 12, inv: {}, gold: 200000 });
    await switchOn(db, [UID]);
    const run = async (party, top, at) => {
      const sid = idem();
      await db.query('insert into public.tower_runs (session_id, user_id, slot, instance_id, hunt_id, start_floor, party) values ($1::uuid, $2, 0, $3::uuid, $4, 1, $5)', [sid, UID, idem(), fl.hunt, party]);
      await db.query('select public.hr_tower_write($1, 0, $2::uuid, $3::jsonb, $4, $5::timestamptz)', [UID, sid, JSON.stringify({ lo: 1, n: top }), top * 5, at]);
      return sid;
    };
    const board = async () => Object.fromEntries((await q(db, 'select mode_id, score from public.hr_mode_board where user_id = $1', [UID])).map((x) => [x.mode_id, x.score]));
    await run(1, 14, '2026-11-18T10:00:00Z');
    out.solo = await board();
    await run(3, 22, '2026-11-18T11:00:00Z');
    out.party = await board();
    await run(1, 9, '2026-11-18T12:00:00Z');
    out.lower = await board();
    out.field = await one(db, `select public.hr_state_of($1::uuid, 0)->'catacomb'->'field'`, [UID]);
    /* THE CLAMP: a window claiming more rooms than its time allows is refused, and no board moves */
    const sid = await run(1, 1, '2026-11-18T13:00:00Z');
    const t0 = '2026-11-18T13:00:00Z';
    await db.query('savepoint cb_fast');
    out.fast = await db.query("select public.hr_tower_check($1::uuid, $2::jsonb, $3::timestamptz, $3::timestamptz + interval '8 seconds')",
      [sid, JSON.stringify({ tower: { floors: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16] } }), t0]).then(() => 'passed', (e) => String(e.message).slice(0, 160));
    await db.query('rollback to savepoint cb_fast');
    out.after = await board();
    return out;
  });
  if (JSON.stringify(r.solo) !== '{"catacomb":14}') bad.push('CB-BOARD a descent alone raised ' + JSON.stringify(r.solo));
  if (JSON.stringify(r.party) !== '{"catacomb":14,"catacomb_party":22}') bad.push('CB-BOARD a party descent raised ' + JSON.stringify(r.party) + ' (want the party board alone)');
  if (JSON.stringify(r.lower) !== JSON.stringify(r.party)) bad.push('CB-BOARD a shallower descent lowered a board: ' + JSON.stringify(r.lower));
  if (!(r.field && r.field.solo && r.field.solo.rank === 1 && r.field.party && r.field.party.rank === 1)) bad.push('CB-BOARD the section\'s field reads ' + JSON.stringify(r.field));
  if (!/tower_too_fast/.test(r.fast) || JSON.stringify(r.after) !== JSON.stringify(r.party)) bad.push(`CB-BOARD fifteen rooms in eight seconds answered ${r.fast} and the boards read ${JSON.stringify(r.after)}`);
  return bad;
}

/* ── CB-IDEM ─────────────────────────────────────────────────────────────── */
const SIGS = ['hr_tower_start(integer,integer,uuid)', 'hr_catacomb_start(integer,text,integer,uuid)', 'hr_run_start(uuid,integer,text,integer,uuid,text,text,text)',
  'hr_tower_write(uuid,integer,uuid,jsonb,bigint,timestamp with time zone)', 'hr_tower_key_mint()', 'hr_chest_open(integer,text,text,integer,integer,uuid)',
  'hr_chest_section(uuid,integer)', 'hr_catacomb_section(uuid,integer)', 'hr_state_sections_of(uuid,integer)', 'hr_tower_section(uuid,integer)'];
let SQL_EDIT = null;
const fileText = () => {
  const t = readFileSync(join(ROOT, 'supabase', 'migrations', FILE), 'utf8').replace(/\r\n/g, '\n');
  return SQL_EDIT ? SQL_EDIT.reduce((s, [a, b]) => s.replace(a, () => b), t) : t;
};
/* The second apply is judged on the chain UP TO this file: a later file may restate a body this one pins (2027-05-29-tower-party-floor.sql
   restates hr_tower_section), and on the whole chain the pin rightly refuses to restate over it. Booted once, for this arm alone. */
let IDEM_DB = null;
async function idemArm() {
  if (!IDEM_DB) IDEM_DB = (await bootReplay({ upTo: FILE })).db;
  const db = IDEM_DB;
  return H.inTx(db, async () => {
    const bad = [];
    const snap = async () => JSON.stringify([await inventory(db),
      await q(db, `select string_agg(md5(replace(prosrc, chr(13), '')), ',' order by oid::regprocedure::text) m from pg_proc where oid = any (array[${SIGS.map((s) => `'public.${s}'::regprocedure`).join(',')}])`),
      await q(db, "select key, fn, note from public.hr_state_sections where key = 'catacomb'"),
      await q(db, "select switch_id, scope, note from public.hr_feature_switches where switch_id = 'unmarked_catacombs'"),
      await q(db, "select proname, identity_args, note from public.hr_client_rpc_baseline where proname = 'hr_catacomb_start'")]);
    const before = await snap();
    try { await db.exec(fileText()); } catch (e) { bad.push('CB-IDEM the second apply RAISED: ' + String(e.message).split('\n')[0]); return bad; }
    if (await snap() !== before) bad.push('CB-IDEM the second apply moved the schema, a body, the section, the switch or the baseline row');
    return bad;
  });
}

const ARMS = { data: dataArm, room: roomArm, doors: doorsArm, start: startArm, cap: capArm, lean: leanArm, metals: metalsArm, board: boardArm, idem: idemArm };

/* ── THE MUTANTS: each a defect the descent exists to refuse ─────────────── */
const RUN = 'public.hr_run_start(uuid,integer,text,integer,uuid,text,text,text)';
const OPEN = 'public.hr_chest_open(integer,text,text,integer,integer,uuid)';
const MUTANTS = [
  { name: 'every armor key leans helmets', arm: 'lean', want: /^CB-LEAN waterlogged_bronze found/, fn: OPEN,
    find: "                        then 'helmet' else 'boots' end;", replace: "                        or true then 'helmet' else 'boots' end;" },
  { name: 'the worn weight is never asked', arm: 'lean', want: /^CB-LEAN the worn helmet weight/, fn: OPEN,
    find: "        v_roll := public.hr_chest_roll(v_uid, p_slot, v_n, v_chance, v_aown, v_weights);", replace: "        v_roll := public.hr_chest_roll(v_uid, p_slot, v_n, v_chance, null, v_weights);" },
  { name: 'one warmth for both families', arm: 'lean', want: /^CB-LEAN the Tower family's warmth/, fn: OPEN,
    find: "    update public.chest_warmth set dry = v_dry, updated_at = now() where user_id = v_uid and slot = p_slot and key_family = v_k.key_family;",
    replace: "    update public.chest_warmth set dry = v_dry, updated_at = now() where user_id = v_uid and slot = p_slot;" },
  { name: 'the chest still refuses the deep keys', arm: 'metals', want: /^CB-METALS the Gold Bone Key answered .*chest_not_ready/, fn: OPEN,
    find: '    if v_kinds <> 6 then\n', replace: '    if v_kinds <> 6 or v_k.from_landing >= 70 then\n' },
  { name: 'the week counts every family', arm: 'cap', want: /^CB-CAP the Tower's family was refused/, fn: OPEN,
    find: "  v_week := (select count(*) from public.chest_opens o where o.user_id = v_uid and o.slot = p_slot and o.key_family = v_k.key_family",
    replace: "  v_week := (select count(*) from public.chest_opens o where o.user_id = v_uid and o.slot = p_slot and o.key_family is not null" },
  { name: 'the held count is the hero\'s bag alone', arm: 'cap', want: /^CB-CAP/, fn: 'public.hr_chest_family_held(uuid,integer,text)',
    find: "       + coalesce((select sum(b.qty) from public.account_bank b join public.hr_chest_keys k on k.item_id = b.item_id\n                    where b.user_id = p_user and k.key_family = p_family), 0)::bigint;",
    replace: ";" },
  { name: 'the cap is one hero\'s whatever the account', arm: 'cap', want: /^CB-CAP a second hero/, fn: 'public.hr_chest_family_cap(uuid,text)',
    find: "greatest(1, (select count(*) from public.player_state ps where ps.user_id = p_user))", replace: "1" },
  { name: 'a wing mints the Tower\'s keys', arm: 'doors', want: /^CB-DOORS .*minted/, fn: 'public.hr_tower_key_mint()',
    find: "k.ground = new.hunt_id and k.from_landing <= v_l", replace: "k.ground = 'the_burning_tower' and k.from_landing <= v_l" },
  { name: 'a party run ranks on the solo board', arm: 'board', want: /^CB-BOARD a party descent/, fn: 'public.hr_run_board_of(text,integer)',
    find: "case when coalesce(p_party, 1) > 1 and r.board_party is not null then r.board_party else r.board end", replace: "r.board" },
  { name: 'the record is the hero\'s on any ground', arm: 'start', want: /^CB-START (the section|a Flooded door)/, fn: 'public.hr_run_record(uuid,integer,text)',
    find: "where p.user_id = p_user and p.slot = p_slot and p.hunt_id = p_hunt), 0);", replace: "where p.user_id = p_user and p.slot = p_slot order by p.best_floor desc limit 1), 0);" },
  { name: 'the descent asks no Level', arm: 'start', want: /^CB-START a Level 1 hero/, fn: RUN, find: '    if v_lv < v_need then\n', replace: '    if false then\n' },
  { name: 'the section shows with its switch off', arm: 'start', want: /^CB-START with its switch off/, fn: 'public.hr_catacomb_section(uuid,integer)',
    find: "  if not public.hr_feature_on('unmarked_catacombs', p_user) then return null; end if;", replace: '' },
  { name: 'a wing fields the Tower\'s ladder', arm: 'room', want: /^CB-ROOM/, file: 'src/core/hunt/tower.js',
    from: '  if (run.roster !== null) return Object.keys(run.roster)', to: '  if (false) return Object.keys(run.roster)' },
  { name: 'a second apply moves the section row', arm: 'idem', want: /^CB-IDEM/, sql: [["  on conflict (key) do update set fn = excluded.fn, note = excluded.note;\n\n-- ── §7", "  on conflict (key) do update set fn = excluded.fn, note = excluded.note || '.';\n\n-- ── §7"]] },
];

async function runArm(db, M, name) {
  try { return await ARMS[name](db, M); } catch (e) { return ['THREW ' + String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')]; }
}

async function main() {
  let db;
  try { db = await TC.boot(); } catch (e) { console.error('catacombs: the chain would not replay: ' + String(e.message).slice(0, 600)); process.exit(2); }
  const u = (p) => new URL('../' + p, import.meta.url).href;
  const load = async () => ({ ...(await TC.load(ROOT)), CA: await import(u('src/data/catacomb-armor.js')) });
  let M = await load();
  if (process.argv.includes('--mutate') || process.argv.includes('--selftest')) {
    const pick = (process.argv.find((a) => a.startsWith('--mutant=')) || '').slice(9);
    const list = MUTANTS.filter((m) => !pick || m.name.includes(pick));
    let escaped = 0;
    for (const m of list) {
      let got = [];
      if (m.fn) {
        const def = String(await one(db, 'select pg_get_functiondef($1::regprocedure)', [m.fn])).split('\r').join('');
        if (def.split(m.find).length !== 2) { console.error(`HARNESS: ${m.fn} has no single ${JSON.stringify(m.find.slice(0, 70))}`); process.exit(2); }
        await db.exec(def.replace(m.find, () => m.replace));
        try { got = await runArm(db, M, m.arm); } finally { await db.exec(def); }
      } else if (m.file) {
        const path = join(ROOT, m.file), was = readFileSync(path, 'utf8');
        if (was.split(m.from).length !== 2) { console.error(`HARNESS: ${m.file} has no single ${JSON.stringify(m.from.slice(0, 70))}`); process.exit(2); }
        writeFileSync(path, was.replace(m.from, () => m.to));
        try { const fresh = await import(u(m.file) + '?mutant=' + Date.now()); got = await runArm(db, { ...M, T: fresh }, m.arm); } finally { writeFileSync(path, was); }
      } else {
        const text = readFileSync(join(ROOT, 'supabase', 'migrations', FILE), 'utf8').replace(/\r\n/g, '\n');
        for (const [a] of m.sql) if (text.split(a).length !== 2) { console.error(`HARNESS: ${FILE} has no single ${JSON.stringify(a.slice(0, 70))}`); process.exit(2); }
        SQL_EDIT = m.sql;
        try { got = await runArm(db, M, m.arm); } finally { SQL_EDIT = null; }
      }
      const hit = got.some((x) => m.want.test(x));
      if (!hit) escaped++;
      console.log(`  ${hit ? 'caught ' : 'ESCAPED'} ${m.name}: ${String(got[0] || 'every check held').slice(0, 160)}`);
    }
    console.log(escaped ? `catacombs --mutate: ${escaped} ESCAPED` : `catacombs --mutate: ${list.length}/${list.length} caught`);
    process.exit(escaped ? 1 : 0);
  }
  const only = (process.argv.find((a) => a.startsWith('--arm=')) || '').slice(6);
  const bad = [];
  for (const name of Object.keys(ARMS)) {
    if (only && name !== only) continue;
    const got = await runArm(db, M, name);
    console.log((got.length ? '✗ ' : '✓ ') + name);
    bad.push(...got);
  }
  for (const p of bad) console.log('FAIL  ' + p);
  console.log(bad.length ? `catacombs: ${bad.length} FAILED` : 'catacombs: green (the data, a wing\'s rooms, a descent viewed and closed, the door, six a family a week and the account\'s held cap, the lean, the Gold and Platinum keys open, both boards and the clamp, a second apply)');
  process.exit(bad.length ? 1 : 0);
}

if (isMain(import.meta.url)) main();
