#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/mode-death.mjs — A DEATH IN A MODE THAT COSTS NOTHING TAKES NOTHING AND LEAVES THE BLESSINGS; A HUNT'S DEATH IS UNCHANGED
//   (lane/c-tower-mode; Tyler 2026-11-14, the board's "2026-11-14 The Burning Tower" §3; src/data/session-modes.js,
//   supabase/migrations/2027-04-23-session-modes.sql). On the replayed chain with the shipped engine, BOTH PATHS (CLAUDE.md §4):
//   the browser closed (the world tick, tick.js runTick) and the hunt viewed (the player's settle, hunt-settle.js settleHunt).
//
//   node tests/mode-death.mjs              the guard
//   node tests/mode-death.mjs --arm=doors  one arm
//   node tests/mode-death.mjs --mutate     every planted defect must turn its arm red (--mutant=<part of a name>)
//
// mutant-anchors: src/core/combat-sim.js, src/data/session-modes.js, src/session/character-session.js,
//   supabase/migrations/2027-04-23-session-modes.sql
//
//   MD-DATA    the two ruled rows (hunt: the full price, Blessings used, everything paid; tower: no loss, Blessings kept, 375 permille
//              XP, no coin, drops or Bestiary, stamina drains); the default is the full hunt; the load-time rule refuses a free death
//              that pays coin, drops or Bestiary, a free death that spends a Blessing and a default that is not a full hunt; the
//              engine's share is DEATH_XP_LOSS to the bit in a hunt and nothing in the Tower; the server's catalogue is the data,
//              row for row, the default included
//   MD-DOORS   one doomed hero holding all three Blessings, the same dice, through both doors: on a hunt ground the death takes
//              DEATH_XP_LOSS of the Level XP less the Blessings' cut, a share of each combat skill's progress, and uses the
//              Blessings up; on the same ground mapped to `tower` the hunt still ends `died` at the same instant, swing for swing
//              the same fight, and the death takes nothing from Level or any skill, journals no death_xp and no blessing_used, and
//              leaves the three Blessings held. The two doors land the same rows
//   MD-BOUND   the two locks, apart: the engine's proposal for the Tower's death carries an empty loss; the database refuses a
//              Tower window whose proposal carries any death XP (death_xp_over), and the same forged price lands in a hunt
//   MD-FREEZE  the mode is the server's: frozen from its ground catalogue when the instance starts, read back by the engine, never
//              moved by a catalogue changed mid-hunt, and a write of the column keeps no value its ground does not name
//   MD-INTENT  no intent carries a mode: no function a client can call takes an argument named for one, no client file sends one,
//              and the edge reads it from the instance read alone
//
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';
import { bootReplay } from './schema-replay.mjs';
import { strip } from './_js-strip.mjs';
import { sourceQuery } from '../tools/lib/version-stamp.mjs';

const H = (await import('./hunt-sessions-settle.mjs')).HARNESS;
const { one, q, makeExec } = H;
const ROOT = H.ROOT;
const UID = H.UIDS[0];
const SPAN = 20 * 60000;
const FN = join('supabase', 'functions', 'hr-accrue');
const MIGRATION = 'supabase/migrations/2027-04-23-session-modes.sql';
const TOWER = "insert into public.hr_ground_session_modes (hunt_id, mode_id) values ('mill_cellar', 'tower')";
const rewind = (db) => db.query(`select setval('public.hr_test_uuid_seq', 1000, false)`);
const V = sourceQuery(ROOT);

/* The engine's own instances of the modes and the share (src/core imports src/data with the build's ?v=). */
async function load(root) {
  const u = (p) => pathToFileURL(join(root, p)).href + V;
  return { ...(await H.loadEdge(root)), SM: await import(u('src/data/session-modes.js')), ARV: await import(u('src/core/action-rules.js')),
    HSDV: await import(u('src/data/hunt-sessions.js')), root };
}

async function boot() {
  const { db } = await bootReplay();
  await H.pinDice(db);
  return db;
}

/* ── MD-DATA ──────────────────────────────────────────────────────────────── */
async function dataArm(db, M) {
  const bad = [];
  const { SESSION_MODES: S, DEFAULT_SESSION_MODE: D, validateSessionModes: check } = M.SM;
  const row = (m) => m && [m.deathLossPm, m.blessings, m.xpPm, m.coin, m.drops, m.bestiary, m.stamina].join(',');
  if (row(S.hunt) !== '1000,true,1000,true,true,true,true') bad.push('MD-DATA the hunt row reads ' + row(S.hunt));
  if (row(S.tower) !== '0,false,375,false,false,false,true') bad.push('MD-DATA the tower row reads ' + row(S.tower));
  if (D !== 'hunt') bad.push('MD-DATA the default mode is ' + D + ', not the full hunt');
  const refuses = (name, modes, def, want) => { const p = check(modes, def); if (!p.some((x) => x.includes(want))) bad.push('MD-DATA the load-time rule let through ' + name + ': ' + JSON.stringify(p)); };
  if (check(S, D).length) bad.push('MD-DATA the table itself does not pass its rule: ' + check(S, D).join('; '));
  refuses('a free death paying coin', { ...S, tower: { ...S.tower, coin: true } }, D, 'pays coin, drops or Bestiary');
  refuses('a free death paying drops', { ...S, tower: { ...S.tower, drops: true } }, D, 'pays coin, drops or Bestiary');
  refuses('a free death counting the Bestiary', { ...S, tower: { ...S.tower, bestiary: true } }, D, 'pays coin, drops or Bestiary');
  refuses('a free death spending a Blessing', { ...S, tower: { ...S.tower, blessings: true } }, D, 'uses up the Blessings');
  refuses('the free-death row as the default', S, 'tower', 'is not a full hunt');
  /* the engine's share, to the bit */
  const share = M.ARV.modeDeathShare;
  if (share('hunt') !== M.HSDV.DEATH_XP_LOSS || share() !== M.HSDV.DEATH_XP_LOSS) bad.push('MD-DATA a hunt\'s death is priced at ' + share('hunt') + ', not DEATH_XP_LOSS ' + M.HSDV.DEATH_XP_LOSS);
  if (share('tower') !== 0) bad.push('MD-DATA the Tower\'s death is priced at ' + share('tower'));
  let threw = false;
  try { share('arena'); } catch { threw = true; }
  if (!threw) bad.push('MD-DATA a mode no row has was priced, not refused');
  /* the server's catalogue is the data, row for row */
  const srv = await q(db, 'select mode_id, is_default, death_loss_pm, blessings, xp_pm, coin, drops, bestiary, stamina from public.hr_session_modes order by mode_id');
  const want = Object.values(S).map((m) => [m.id, m.id === D, m.deathLossPm, m.blessings, m.xpPm, m.coin, m.drops, m.bestiary, m.stamina]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const got = srv.map((r) => [r.mode_id, r.is_default, Number(r.death_loss_pm), r.blessings, Number(r.xp_pm), r.coin, r.drops, r.bestiary, r.stamina]);
  if (JSON.stringify(got) !== JSON.stringify(want)) bad.push('MD-DATA the server holds ' + JSON.stringify(got) + ', the data ' + JSON.stringify(want));
  /* the grounds that name a mode: the server's rows are the data's (lane/c-tower-climb: the Burning Tower names `tower`) */
  const G = await import(pathToFileURL(join(M.root, 'src/data/hunt-grounds.js')).href + V);
  const named = [G.OPEN_GROUNDS, G.CALLED_GROUNDS, G.OPEN_HALL_GROUNDS, G.TRAINING_GROUNDS, G.TOWER_GROUNDS].flatMap((t) => Object.values(t))
    .filter((g) => g.mode !== undefined).map((g) => [g.hunt, g.mode]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const onSrv = (await q(db, 'select hunt_id, mode_id from public.hr_ground_session_modes order by hunt_id')).map((r) => [r.hunt_id, r.mode_id]);
  if (JSON.stringify(onSrv) !== JSON.stringify(named)) bad.push('MD-DATA the server maps ' + JSON.stringify(onSrv) + ' to modes, the data ' + JSON.stringify(named));
  const tower = (await import(pathToFileURL(join(M.root, 'src/data/tower.js')).href + V)).TOWER_RULES.hunt;
  if (!named.some(([h, m]) => h === tower && m === 'tower')) bad.push('MD-DATA CONTROL: the Burning Tower names no mode in the data');
  return bad;
}

/* ── ONE RUN: the doomed hero on mill_cellar, `mode` mapped, through `door`, to its end ───────────────────────────────── */
/* the combat skills a death prices: the server's own catalogue (hr_skills cat 'combat', src/data/skills.js COMBAT_SKILLS) */
let COMBAT = null;
async function state(db, h) {
  if (!COMBAT) COMBAT = (await q(db, "select skill_id from public.hr_skills where cat = 'combat' order by skill_id")).map((r) => r.skill_id);
  return one(db, `select jsonb_build_object(
      'level_xp', ps.level_xp,
      'skills', (select jsonb_object_agg(skill_id, xp) from public.player_skills where user_id = $1 and slot = 0 and skill_id = any ($3::text[])),
      'blessings', (select count(*) from public.player_blessings where user_id = $1 and slot = 0),
      'used', (select count(*) from public.player_ledger where user_id = $1 and intent = 'blessing_used'),
      'saved', (select l.meta->'saved' from public.player_ledger l where l.user_id = $1 and l.intent = 'blessing_used' order by l.id desc limit 1),
      'death_xp', (select jsonb_object_agg(k, v) from (select x.key k, sum((x.value #>> '{}')::bigint) v
                     from public.player_ledger l, jsonb_each(l.meta->'xp') x where l.session_id = $2 and l.intent = 'death_xp' group by 1) d),
      'death_rows', (select count(*) from public.player_ledger where session_id = $2 and intent = 'death_xp'),
      'deaths', (select jsonb_agg(jsonb_build_array(e.at, e.data->'xp', e.data->'xp_lost', e.data->'level_from', e.data->'level_to') order by e.id)
                   from public.hunt_session_events e where e.session_id = $2 and e.type = 'death'),
      'end', (select h.end_reason from public.hunt_sessions h where h.id = $2),
      'ended_at', (select h.ended_at from public.hunt_sessions h where h.id = $2),
      'mode', (select i.session_mode from public.hunt_instances i where i.id = (select instance_id from public.hunt_sessions where id = $2)))
    from public.player_state ps where ps.user_id = $1 and ps.slot = 0`, [UID, h.sid, COMBAT]);
}

/* the hero's own instants for the hunt viewed (a player's settles land where they land), the tick's for the browser closed */
const VIEWED_AT = (from) => [from + 7001, from + 33333, from + 61234, from + 200001, from + 333333, from + 600000, from + SPAN];
async function drive(db, M, door, h) {
  const exec = makeExec(db);
  const cuts = door === 'closed' ? [h.from + SPAN] : VIEWED_AT(h.from);
  for (const at of cuts) {
    for (let guard = 0; guard < 40; guard++) {
      const s = (await q(db, 'select settled_to, ended_at from public.hunt_sessions where id = $1', [h.sid]))[0];
      if (s.ended_at || Date.parse(s.settled_to) >= at) break;
      if (door === 'closed') {
        await db.query('delete from public.hunt_tick_lease');
        const r = (await M.TK.runTick({ exec, grounds: H.groundsOf(M), atMs: at,
          body: { op: 'tick', roster: [], cadence_ms: 10000, flush_ms: 90000, hunts: [{ user_id: UID, slot: 0, session_id: h.sid }] } })).body;
        if (!r.hunts || r.hunts.settled < 1) throw new Error('the world tick settled nothing: ' + JSON.stringify(r.hunts || r).slice(0, 300));
      } else {
        const v = await M.HS.settleHunt({ exec, user: UID, slot: 0, mode: 'settle', bucket: null, project: true, live: true, atMs: at, minWindowMs: 0, grounds: H.groundsOf(M) });
        if (v.outcome !== 'paid') throw new Error('the player\'s settle answered ' + JSON.stringify({ o: v.outcome, r: v.reason, d: v.body && v.body.detail }).slice(0, 400));
      }
    }
    if ((await q(db, 'select ended_at from public.hunt_sessions where id = $1', [h.sid]))[0].ended_at) break;
  }
}
async function doomed(db, M, mode) {
  await rewind(db);
  const h = await H.hunter(db, M, { ...H.DOOMED, beforeEnter: mode === 'tower' ? () => db.query(TOWER) : undefined });
  await db.query('update public.hr_tick_config set enabled = true where id');
  /* all three Blessings, held since long before the hunt (hr_blessing_take reads those bought before the window began) */
  await db.query(`insert into public.player_blessings (user_id, slot, tier, paid, bought_at)
                    select $1, 0, t.tier, 0, now() - interval '2 days' from public.hr_blessing_tiers t`, [UID]);
  return h;
}
async function play(db, M, mode, door) {
  return H.inTx(db, async () => {
    const h = await doomed(db, M, mode);
    const s0 = await state(db, h);
    try { await drive(db, M, door, h); } catch (e) { return { err: String(e.message).slice(0, 300) }; }
    const s1 = await state(db, h);
    /* each run starts on its own whole second of the real clock (H.hunter): every instant is read as ms into the hunt */
    s1.deaths = (s1.deaths || []).map(([at, ...rest]) => [Date.parse(at) - h.from, ...rest]);
    s1.ended_at = s1.ended_at ? Date.parse(s1.ended_at) - h.from : null;
    return { s0, s1 };
  });
}

/* ── MD-DOORS ─────────────────────────────────────────────────────────────── */
async function doorsArm(db, M) {
  const bad = [];
  const tiers = Number(await one(db, 'select count(*) from public.hr_blessing_tiers'));
  const top = Number(await one(db, 'select max(permille) from public.hr_blessing_tiers'));
  const runs = {};
  for (const door of ['closed', 'viewed']) {
    for (const mode of ['hunt', 'tower']) {
      const r = await play(db, M, mode, door);
      const tag = `MD-DOORS ${mode}, the ${door === 'closed' ? 'browser closed' : 'hunt viewed'}:`;
      if (r.err) { bad.push(`${tag} the settle failed: ${r.err}`); continue; }
      runs[door + ':' + mode] = r;
      const { s0, s1 } = r;
      const deaths = s1.deaths || [];
      if (s1.mode !== mode) bad.push(`${tag} the instance plays ${s1.mode}`);
      if (s1.end !== 'died' || deaths.length !== 1) { bad.push(`${tag} CONTROL: the doomed hero ended ${s1.end} after ${deaths.length} death(s)`); continue; }
      if (Number(s0.blessings) !== tiers) bad.push(`${tag} CONTROL: the hero held ${s0.blessings} of ${tiers} Blessings`);
      const [, xp, lost, from, to] = deaths[0];
      if (mode === 'hunt') {
        const paid = Number((s1.death_xp || {}).level || 0), kept = Number((s1.saved || {}).level || 0);
        const share = paid + kept, before = Number(s1.level_xp) + paid;
        if (!(paid > 0) || share !== Math.floor(before * M.HSDV.DEATH_XP_LOSS)) bad.push(`${tag} the death took ${paid} + ${kept} kept of ${before} Level XP, not DEATH_XP_LOSS of the total`);
        if (!(kept > 0) || kept !== Math.floor(share * top / 1000)) bad.push(`${tag} the Blessings kept ${kept} of ${share}, not floor(${share} x ${top} / 1000)`);
        if (!Object.keys(s1.death_xp || {}).some((k) => COMBAT.includes(k))) bad.push(`${tag} the death took nothing from a combat skill: ${JSON.stringify(s1.death_xp)}`);
        if (Number(s1.blessings) !== 0 || Number(s1.used) !== 1) bad.push(`${tag} ${s1.blessings} Blessing(s) still held, ${s1.used} blessing_used row(s): a hunt's death uses them up`);
        if (!(Number(xp) > 0)) bad.push(`${tag} the death event names ${xp} XP`);
      } else {
        if (Number(s1.death_rows) !== 0 || s1.death_xp) bad.push(`${tag} the death journalled ${JSON.stringify(s1.death_xp)}: a death in the Tower costs nothing`);
        if (Number(s1.blessings) !== tiers || Number(s1.used) !== 0) bad.push(`${tag} ${s1.blessings} of ${tiers} Blessings held after the death, ${s1.used} blessing_used row(s): the Tower never spends one`);
        if (Number(xp) !== 0 || JSON.stringify(lost) !== '{}' || from !== to) bad.push(`${tag} the death event reads xp ${xp}, lost ${JSON.stringify(lost)}, Level ${from} to ${to}`);
        if (!(Number(s1.level_xp) >= Number(s0.level_xp))) bad.push(`${tag} the Level XP fell ${s0.level_xp} -> ${s1.level_xp}`);
      }
    }
    /* THE SAME FIGHT, ONLY THE LOSS AND THE MODE'S SHARE MOVE: the same dice play the same swings in both modes; the Tower's hero
       keeps everything the hunt's death took, and earns on every route the mode's share of what the hunt's hero earned
       (lane/c-tower-climb wired what a mode pays: xpPm on the split and on every skill route; the stored XP is the floor of the carry,
       so a route reads within 1, and the Level within a floor a kill). */
    const hu = runs[door + ':hunt'], tw = runs[door + ':tower'];
    if (hu && tw && hu.s1.deaths && tw.s1.deaths) {
      const tag = `MD-DOORS the ${door === 'closed' ? 'browser closed' : 'hunt viewed'}:`;
      const pm = M.SM.SESSION_MODES.tower.xpPm;
      if (hu.s1.deaths[0][0] !== tw.s1.deaths[0][0] || hu.s1.ended_at !== tw.s1.ended_at) bad.push(`${tag} the Tower's hero died ${tw.s1.deaths[0][0]} ms into the hunt, the hunt's ${hu.s1.deaths[0][0]} ms: not the same fight`);
      const took = hu.s1.death_xp || {};
      const gainHu = Number(hu.s1.level_xp) + Number(took.level || 0) - Number(hu.s0.level_xp), gainTw = Number(tw.s1.level_xp) - Number(tw.s0.level_xp);
      if (Math.abs(gainTw - gainHu * pm / 1000) > Math.max(1, Math.ceil(gainHu * pm / 1000 / 50))) bad.push(`${tag} the Tower's hero earned ${gainTw} Level XP, the hunt's ${gainHu} before its death took ${took.level}: not ${pm} permille of it`);
      for (const k of COMBAT) {
        const h = Number(hu.s1.skills[k] || 0) + Number(took[k] || 0) - Number(hu.s0.skills[k] || 0), t = Number(tw.s1.skills[k] || 0) - Number(tw.s0.skills[k] || 0);
        if (Math.abs(t - h * pm / 1000) > 1) bad.push(`${tag} ${k}: the Tower's hero earned ${t}, the hunt's ${h} before its death took ${took[k] || 0}: not ${pm} permille of it`);
      }
    }
  }
  /* THE TWO DOORS LAND THE SAME ROWS */
  for (const mode of ['hunt', 'tower']) {
    const a = runs['closed:' + mode], b = runs['viewed:' + mode];
    if (!a || !b) continue;
    const sig = (r) => JSON.stringify([r.s1.level_xp, r.s1.skills, r.s1.death_xp, r.s1.blessings, r.s1.end, r.s1.deaths]);
    if (sig(a) !== sig(b)) bad.push(`MD-DOORS ${mode}: the browser closed lands ${sig(a).slice(0, 200)}, the hunt viewed ${sig(b).slice(0, 200)}`);
  }
  return bad;
}

/* ── MD-BOUND: the two locks, apart ───────────────────────────────────────── */
async function boundArm(db, M) {
  const bad = [];
  for (const mode of ['tower', 'hunt']) {
    const r = await H.inTx(db, async () => {
      const h = await doomed(db, M, mode);
      const exec = makeExec(db);
      for (let i = 0; i < 40; i++) {
        const plan = await M.HS.readHuntSettle({ exec, user: UID, slot: 0, grounds: H.groundsOf(M), atMs: h.from + SPAN }, 'tick');
        if (plan.answer) return { err: 'the read answered ' + plan.answer.reason };
        const p = await M.HS.proposeHuntSettle(plan, plan.toMs, 0);
        if (!p.commit) return { err: 'the engine proposed nothing: ' + (p.out && p.out.reason) };
        const dx = p.commit.members[0].hunt.death_xp || [];
        if (!dx.length) {
          const ok = await M.HS.commitHuntSettle(exec, { ...p.commit, project: null });
          if (!ok || ok.ok !== true) return { err: 'a window before the death was refused: ' + JSON.stringify(ok).slice(0, 200) };
          continue;
        }
        /* THE DEATH'S WINDOW: what the engine priced, then the same window carrying one Level XP of loss */
        const proposed = JSON.stringify(dx);
        const forged = JSON.parse(JSON.stringify(p.commit));
        forged.members[0].hunt.death_xp = [{ level: 1 }];
        const res = await M.HS.commitHuntSettle(exec, { ...forged, project: null });
        const held = Number(await one(db, 'select count(*) from public.player_blessings where user_id = $1 and slot = 0', [UID]));
        return { proposed, res: JSON.stringify(res).slice(0, 300), ok: !!(res && res.ok === true), held };
      }
      return { err: 'the hero never died' };
    });
    const tag = `MD-BOUND ${mode}:`;
    if (r.err) { bad.push(`${tag} CONTROL: ${r.err}`); continue; }
    if (mode === 'tower') {
      if (r.proposed !== '[{}]') bad.push(`${tag} the engine priced the Tower's death at ${r.proposed}, not an empty loss`);
      if (r.ok || !/death_xp_over/.test(r.res)) bad.push(`${tag} a Tower window carrying one Level XP of loss answered ${r.res}, not death_xp_over`);
    } else {
      if (!(r.proposed !== '[{}]' && /"level":\s*[1-9]/.test(r.proposed))) bad.push(`${tag} CONTROL: the engine priced the hunt's death at ${r.proposed}`);
      if (!r.ok) bad.push(`${tag} CONTROL: the forged price of one Level XP was refused in a hunt (${r.res}), so the Tower's refusal proves nothing`);
    }
  }
  return bad;
}

/* ── MD-FREEZE ────────────────────────────────────────────────────────────── */
async function freezeArm(db, M) {
  const bad = [];
  const read = (exec) => exec('select public.hr_hunt_instance_read($1::uuid, 0) as r', [UID]).then((x) => x[0].r);
  const r = await H.inTx(db, async () => {
    await rewind(db);
    const h = await H.hunter(db, M, { ...H.STRONG, beforeEnter: () => db.query(TOWER) });
    const exec = makeExec(db);
    const out = { start: (await read(exec)).instance.session_mode };
    /* the catalogue changed mid-hunt never moves the running instance */
    await db.query("delete from public.hr_ground_session_modes where hunt_id = 'mill_cellar'");
    out.mid = (await read(exec)).instance.session_mode;
    /* a write of the column (an owner's stray UPDATE) keeps no value its ground does not name: re-derived, now the default */
    await db.query("update public.hunt_instances set session_mode = 'tower' where id = $1", [h.inst]);
    out.stray = await one(db, 'select session_mode from public.hunt_instances where id = $1', [h.inst]);
    return out;
  });
  if (r.start !== 'tower') bad.push('MD-FREEZE a hunt on a ground the catalogue maps to the Tower froze ' + r.start + ' (the engine reads it)');
  if (r.mid !== 'tower') bad.push('MD-FREEZE the catalogue changed mid-hunt moved the running instance to ' + r.mid);
  if (r.stray !== 'hunt') bad.push('MD-FREEZE a stray write of the column kept ' + r.stray + ', which its ground does not name');
  return bad;
}

/* ── MD-INTENT ────────────────────────────────────────────────────────────── */
const CLIENT_DIRS = ['src/session', 'src/shell', 'src/app', 'src/net', 'src/social', 'src/hunt-view', 'src/world', 'src/render'];
const jsUnder = (dir) => { try { return readdirSync(dir, { recursive: true }).filter((f) => String(f).endsWith('.js')).map((f) => join(dir, String(f))); } catch { return []; } };
async function intentArm(db, M) {
  const bad = [];
  /* a function a client can call takes no argument named for a mode */
  const fns = await q(db, `select p.oid::regprocedure::text as f from pg_proc p where p.pronamespace = 'public'::regnamespace
                             and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))
                             and pg_get_function_identity_arguments(p.oid) ~* 'mode'`);
  for (const f of fns) bad.push('MD-INTENT a client can call ' + f.f + ', which takes a mode');
  const base = await q(db, "select proname, identity_args from public.hr_client_rpc_baseline where identity_args ~* 'mode'");
  for (const b of base) bad.push('MD-INTENT the client surface names ' + b.proname + '(' + b.identity_args + ')');
  /* no client file sends one: no RPC argument, no edge request field */
  for (const dir of CLIENT_DIRS) {
    for (const f of jsUnder(join(M.root, dir))) {
      const src = strip(readFileSync(f, 'utf8')).noC;
      const hit = src.match(/\bp_\w*mode\w*\s*:/) || (dir === 'src/session' && src.match(/['"]?\bsession_?mode['"]?\s*:/i));
      if (hit) bad.push('MD-INTENT ' + f.slice(M.root.length + 1).replace(/\\/g, '/') + ' sends a mode: ' + hit[0]);
    }
  }
  /* the edge takes the engine's mode from the instance read alone */
  for (const f of jsUnder(join(M.root, FN))) {
    const src = strip(readFileSync(f, 'utf8')).noC;
    for (const m of src.matchAll(/[\w.$]*session_mode\b/g)) if (m[0] !== 'inst.session_mode') bad.push('MD-INTENT the edge reads a mode from ' + m[0] + ' in ' + f.slice(M.root.length + 1).replace(/\\/g, '/'));
  }
  return bad;
}

const ARMS = { data: dataArm, doors: doorsArm, bound: boundArm, freeze: freezeArm, intent: intentArm };

/* ── THE MUTANTS: the spec's six (the board's §3), then the freeze ─────────── */
const AM = 'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)';
/* THE LOAD-TIME RULE IS THE CATCH: the module refuses to load (session-modes.js "does not load"), so nothing downstream runs. */
const LOAD_REFUSED = /^THREW loading the mutated tree: src\/data\/session-modes\.js does not load/;
const MUTANTS = [
  { name: 'die() ignores the mode', arm: 'doors', want: /^MD-DOORS tower/, file: 'src/core/combat-sim.js',
    from: '  const xpLost = deathXpLoss(m.state, share);', to: '  const xpLost = deathXpLoss(m.state);' },
  { name: 'the default mode is set to the no-loss row', arm: 'data', want: LOAD_REFUSED, file: 'src/data/session-modes.js',
    from: "export const DEFAULT_SESSION_MODE = 'hunt';", to: "export const DEFAULT_SESSION_MODE = 'tower';" },
  { name: 'the database bound is not scaled by the mode', arm: 'bound', want: /^MD-BOUND tower/, fn: AM,
    find: "        if v_n > public.hr_death_xp_mode_max('level', v_cur, v_mode.death_loss_pm) then",
    replace: "        if v_n > public.hr_death_xp_mode_max('level', v_cur, 1000) then" },
  { name: 'hr_blessing_take is still called in a mode', arm: 'doors', want: /^MD-DOORS tower/, fn: AM,
    find: '  if v_nd > 0 and v_mode.blessings then', replace: '  if v_nd > 0 then' },
  { name: 'an intent carries a mode field', arm: 'intent', want: /^MD-INTENT/, file: 'src/session/character-session.js',
    from: "this._server.rpc('hr_hunt_enter', { p_slot: this.slot, p_hunt: hunt,", to: "this._server.rpc('hr_hunt_enter', { p_mode: 'tower', p_slot: this.slot, p_hunt: hunt," },
  { name: 'the table check: a no-loss mode with coin or drops on', arm: 'data', want: LOAD_REFUSED, file: 'src/data/session-modes.js',
    from: "id: 'tower', deathLossPm: 0, blessings: false, xpPm: 375, coin: false, drops: false,", to: "id: 'tower', deathLossPm: 0, blessings: false, xpPm: 375, coin: true, drops: true," },
  { name: 'the table check is gone and a no-loss mode pays', arm: 'data', want: /^MD-DATA/, file: 'src/data/session-modes.js',
    edits: [["    if (m.deathLossPm < 1000 && (m.coin || m.drops || m.bestiary)) out.push(", "    if (false) out.push("],
            ["id: 'tower', deathLossPm: 0, blessings: false, xpPm: 375, coin: false,", "id: 'tower', deathLossPm: 0, blessings: false, xpPm: 375, coin: true,"]] },
  { name: 'the freeze keeps a caller\'s value', arm: 'freeze', want: /^MD-FREEZE/, fn: 'public.hr_hunt_mode_freeze()',
    find: '  new.session_mode := public.hr_session_mode_of(new.hunt_id);', replace: '  new.session_mode := coalesce(new.session_mode, public.hr_session_mode_of(new.hunt_id));' },
  { name: 'the edge takes a mode from the request', arm: 'intent', want: /^MD-INTENT/, file: join(FN, 'hunt-settle.js'),
    from: '    sessionMode: inst.session_mode,', to: '    sessionMode: plan.session_mode || inst.session_mode,' },
];

async function runArm(db, M, name) {
  try { return await ARMS[name](db, M); } catch (e) { return ['THREW ' + String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')]; }
}

async function main() {
  let db;
  try { db = await boot(); } catch (e) { console.error('mode-death: the chain would not replay: ' + String(e.message).slice(0, 600)); process.exit(2); }
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
        try { got = await runArm(db, await load(ROOT), m.arm); } finally { await db.exec(def); }
      } else {
        const dir = mkdtempSync(join(tmpdir(), 'hr-md-'));
        try {
          for (const d of ['src/core', 'src/data', 'src/session', FN]) cpSync(join(ROOT, d), join(dir, d), { recursive: true });
          cpSync(join(ROOT, 'src/build-info.js'), join(dir, 'src/build-info.js'));
          const p = join(dir, m.file);
          let src = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
          for (const [from, to] of m.edits || [[m.from, m.to]]) {
            if (src.split(from).length !== 2) { console.error(`HARNESS: ${m.file} has no single ${JSON.stringify(from.slice(0, 70))}`); process.exit(2); }
            src = src.replace(from, () => to);
          }
          writeFileSync(p, src);
          let M;
          try { M = await load(dir); } catch (e) { got = ['THREW loading the mutated tree: ' + String(e.message).slice(0, 160)]; }
          if (M) got = await runArm(db, M, m.arm);
        } finally { rmSync(dir, { recursive: true, force: true }); }
      }
      const hit = got.some((x) => m.want.test(x));
      if (!hit) escaped++;
      console.log(`  ${hit ? 'caught ' : 'ESCAPED'} ${m.name}: ${String(got[0] || 'every check held').slice(0, 160)}`);
    }
    console.log(escaped ? `mode-death --mutate: ${escaped} ESCAPED` : `mode-death --mutate: ${list.length}/${list.length} caught`);
    process.exit(escaped ? 1 : 0);
  }
  const only = (process.argv.find((a) => a.startsWith('--arm=')) || '').slice(6);
  const M = await load(ROOT);
  const bad = [];
  for (const name of Object.keys(ARMS)) {
    if (only && name !== only) continue;
    const got = await runArm(db, M, name);
    console.log((got.length ? '✗ ' : '✓ ') + name);
    bad.push(...got);
  }
  for (const p of bad) console.log('FAIL  ' + p);
  console.log(bad.length ? `mode-death: ${bad.length} FAILED` : 'mode-death: green (the rows, both doors in both modes, the two locks, the freeze, no intent carries a mode)');
  process.exit(bad.length ? 1 : 0);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
