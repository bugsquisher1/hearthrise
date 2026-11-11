#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/training-yard.mjs — THE TRAINING YARD'S SERVER HALF ON THE REPLAYED CHAIN (lane/c-training-yard; Tyler 2026-11-08 "training
// dummies and stuff to train skills (for gold)"; supabase/migrations/2027-04-06-training-*.sql, tools/gen-training.mjs,
// supabase/functions/hr-accrue/set-activity.js SERVER_SETTLED_KINDS).
//
//   node tests/training-yard.mjs            the guard
//   node tests/training-yard.mjs --mutate   every planted defect must turn its arm red
//
// mutant-anchors: supabase/migrations/2027-04-06-training-yard.sql supabase/functions/hr-accrue/set-activity.js tools/gen-training.mjs
//
//   TY-CAT     the server's rule row and skills are tools/gen-training.mjs catalogueOf(src/data/training.js), field for field
//   TY-START   the switch off refuses feature_off and projects nothing; every refusal (under Level 10, Inner Flame, a gathering skill, the
//              house dummy, a place nobody has, 0 or 25 hours, a keep out of range, a gather window owed to the engine, A HERO WHO CAN'T
//              PAY the first minute above "Keep at least", a purse of 0) moves nothing; a start seats the hero on the yard, remembers the
//              settings, projects the rates at its Level; a replay answers its receipt; another request under the key is intent_mismatch
//   TY-BOTH    THE TWO PATHS, six hours at Level 50: TRAINING VIEWED (the owner's tick polled every 20 s) and BROWSER CLOSED (the sweep,
//              every minute) pay the same Defense XP and gold to the unit, exactly 6 x 400 x 50 and 6 x 50 x 50; the viewed path
//              writes one ledger row a minute at most, the closed one a row a flush; "Stop after 6 h" ends on the clock with the browser
//              closed; a late sweep never pays past it; the books close (ledger = purse = skill)
//   TY-KEEP    the purse reaches "Keep at least" with the browser closed: the longest span above it is paid, the run stops keep_gold, the
//              purse sits exactly on the keep; another hero's spend mid-run stops it at the next settle, never under the keep
//   TY-HUNT    a hunt begins: the run is paid to the entry and closed `hunt` before the session opens (no session on the training row);
//              a hunting hero is refused in_hunt
//   TY-SWITCH  any other door moves the pointer (the edge's switch commit): paid to that instant, closed `switched`; the edge's collect
//              owes a training pointer nothing (a shop buy proceeds, the database is never asked)
//   TY-STOP    the stop pays to now, idles the hero, projects last_stop; its replay pays nothing; a second stop is not_training
//   TY-FUSE    one settle pays at most 24 h; no hero is paid more than 25 h in any 24 h of the server clock (read from the ledger)
//   TY-MINT    over every hero of every arm: no XP without its gold (xp x 50 <= gold x 400 + 400), no row over 400 x Level an hour
//
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync, mkdtempSync, mkdirSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isMain } from './_is-main.mjs';
import { setGold } from './_gold.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MUTATE = process.argv.includes('--mutate');
const HOUR = 3600000, MIN = 60000;
const UIDS = Array.from({ length: 12 }, (_, i) => '00000000-0000-4000-8000-0000007a' + String(i + 10).padStart(4, '0'));
const ARMS = ['TY-CAT', 'TY-START', 'TY-BOTH', 'TY-KEEP', 'TY-HUNT', 'TY-SWITCH', 'TY-STOP', 'TY-FUSE'];

const q = async (db, sql, p) => (await db.query(sql, p)).rows;
const one = async (db, sql, p) => { const r = await q(db, sql, p); return r[0] ? Object.values(r[0])[0] : undefined; };
const asUser = (db, uid) => db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid || '']);
const key = () => crypto.randomUUID();
const num = (x) => Number(x);
async function inTx(db, fn) { await db.query('begin'); try { return await fn(); } finally { await db.query('rollback'); } }

/* A verb as the signed-in hero (its rate bucket cleared: one transaction is one instant). */
async function as(db, uid, sql, params) {
  await db.query('delete from public.hr_rate_counters where user_id = $1', [uid]);
  await asUser(db, uid);
  try { return await one(db, sql, params); } finally { await asUser(db, ''); }
}
const start = (db, uid, o = {}) => as(db, uid, 'select public.hr_training_start(0, $1, $2, $3, $4, $5::uuid) as r',
  [o.skill || 'defense', o.place === undefined ? 'yard' : o.place, o.hours ?? null, o.keep ?? 0, o.key || key()]);
const stop = (db, uid, k) => as(db, uid, 'select public.hr_training_stop(0, $1::uuid) as r', [k || key()]);
const purse = async (db, uid) => num(await one(db, 'select public.hr_purse_of($1::uuid)::text', [uid]));
const skillXp = async (db, uid, s) => num(await one(db,
  'select coalesce((select xp from public.player_skills where user_id = $1 and slot = 0 and skill_id = $2), 0)::text', [uid, s]));
const runOf = async (db, uid) => (await q(db, `select skill, running, stop_reason, run_ms::text, run_xp::text, run_gold::text, settled_to, since, keep_gold::text
  from public.player_training where user_id = $1 and slot = 0`, [uid]))[0] || null;
const pointer = async (db, uid) => (await q(db, 'select active_kind, active_id, version::text from public.player_state where user_id = $1 and slot = 0', [uid]))[0];
const rows = (db, uid) => q(db, `select gold::text, xp::text, skill_id, purse::text, gold_kind, session_id, meta from public.player_ledger
  where user_id = $1 and kind = 'training' and intent like 'training:%' order by id`, [uid]);
const switchOn = (db, uids) => db.query("update public.hr_feature_switches set scope = 'accounts', accounts = $1::uuid[] where switch_id = 'training'", [uids]);
/* The run's clock moved back `ms`: the same as `ms` having passed (the transaction is one instant). */
const back = (db, uid, ms) => db.query(`update public.player_training set since = since - $2::bigint * interval '1 millisecond',
  settled_to = settled_to - $2::bigint * interval '1 millisecond', stop_at = stop_at - $2::bigint * interval '1 millisecond' where user_id = $1`, [uid, ms]);
/* `base` is a timestamptz as PGlite hands it (a Date): getTime keeps its milliseconds (Date.parse of its string would not). */
const at = (base, ms) => new Date(new Date(base).getTime() + ms).toISOString();

/* A hero on its account, idle, at Level `level`, the purse at `gold`. */
async function hero(db, uid, { level = 50, gold = 1000000 } = {}) {
  await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [uid]);
  await db.query(`insert into public.hr_access_allowlist (user_id, note) values ($1, 'training-yard') on conflict (user_id) do nothing`, [uid]);
  await asUser(db, uid);
  const c = await one(db, 'select public.hr_create_character(0)');
  await asUser(db, '');
  if (!c || (c.ok !== true && c.created !== true)) throw Object.assign(new Error('harness: hr_create_character refused ' + JSON.stringify(c)), { harness: true });
  await db.query(`update public.player_state set active_kind = 'idle', active_id = null, level_xp = public.hr_char_xp_for_level($2) where user_id = $1 and slot = 0`, [uid, level]);
  await setGold((sql, p) => q(db, sql, p), uid, 0, gold);
  return { xp: { defense: await skillXp(db, uid, 'defense') }, purse: gold };
}

/* THE BOOKS of one hero (TY-MINT): the ledger is the purse and the skill, and no row pays XP it did not charge for. */
async function books(db, uid, base, M) {
  const bad = [];
  const r = await rows(db, uid);
  const X = M.T.xpPerLevelPerHour, F = M.T.feePerLevelPerHour;
  const sum = (k) => r.reduce((s, x) => s + num(x[k] || 0), 0);
  const gold = -sum('gold'), xp = sum('xp');
  if (base.purse - (await purse(db, uid)) !== gold + (base.spent || 0)) bad.push(uid.slice(-4) + ': the purse moved ' + (base.purse - (await purse(db, uid))) + ', the ledger says ' + gold);
  let skillDelta = 0;
  for (const s of M.T.skills) skillDelta += (await skillXp(db, uid, s)) - (base.xp[s] ?? (s === 'defense' ? base.xp.defense : 0));
  if (skillDelta !== xp) bad.push(uid.slice(-4) + ': the skills moved ' + skillDelta + ', the ledger says ' + xp);
  if (xp * F > gold * X + X) bad.push(uid.slice(-4) + ': XP without its gold (' + xp + ' XP for ' + gold + ' g)');
  for (const x of r) {
    const ms = num(x.meta.ms), L = num(x.meta.level);
    if (num(x.xp) * HOUR > ms * L * X + HOUR - 1 || -num(x.gold) * HOUR > ms * L * F + HOUR - 1) bad.push(uid.slice(-4) + ': a row pays over the hour\'s rate ' + JSON.stringify(x.meta));
    if (num(x.gold) < 0 && (x.gold_kind !== 'training' || x.purse === null)) bad.push(uid.slice(-4) + ': a gold row without its kind or purse');
    if (x.session_id !== null) bad.push(uid.slice(-4) + ': a training row inside a hunt session');
  }
  return bad;
}

// ═══════════════════════════════════════════════════════════════════════
// THE ARMS
// ═══════════════════════════════════════════════════════════════════════
const DB_ARMS = {
  async 'TY-CAT'(db, M) {
    const bad = [];
    const c = M.gen.catalogueOf(await M.gen.loadData(M.root));
    const r = (await q(db, 'select * from public.hr_training_rule'))[0] || {};
    const want = { xp_per_level_h: c.rule.xp, fee_per_level_h: c.rule.fee, min_level: c.rule.minLevel, stop_min_h: c.rule.stopMin, stop_max_h: c.rule.stopMax,
      keep_max: c.rule.keepMax, owner_min_ms: c.rule.ownerMinMs, flush_ms: c.rule.flushMs, settle_max_ms: c.rule.settleMaxMs, day_fuse_h: c.rule.dayFuseH, sweep_batch: c.rule.batch };
    for (const [k, v] of Object.entries(want)) if (num(r[k]) !== v) bad.push('hr_training_rule.' + k + ' is ' + r[k] + ', the data says ' + v);
    const skills = (await q(db, 'select skill_id from public.hr_training_skills order by skill_id')).map((x) => x.skill_id);
    if (skills.join(',') !== c.skills.join(',')) bad.push('hr_training_skills is ' + skills.join(',') + ', the data says ' + c.skills.join(','));
    return bad;
  },

  async 'TY-START'(db, M) {
    const bad = [];
    const [a, z] = UIDS;
    const base = await hero(db, a, { level: 50, gold: 100000 });
    await hero(db, z, { level: 50, gold: 0 });
    let v = await start(db, a);
    if (v.error !== 'feature_off' || (await one(db, 'select public.hr_state_of($1::uuid, 0)->\'training\'', [a])) !== null) bad.push('the switch off answered ' + JSON.stringify(v).slice(0, 160) + ' or projected the section');
    await switchOn(db, [a, z]);
    const need = Math.ceil(M.T.server.ownerMinSeconds * 1000 * 50 * M.T.feePerLevelPerHour / HOUR);
    await db.query(`update public.player_state set level_xp = public.hr_char_xp_for_level($2) where user_id = $1 and slot = 0`, [a, M.T.minLevel - 1]);
    const sec = await one(db, 'select public.hr_training_view($1::uuid, 0)', [a]);
    if (!sec || sec.open !== false || sec.min_level !== M.T.minLevel || sec.settings !== null || sec.run !== null) bad.push('a Level ' + (M.T.minLevel - 1) + ' hero is projected ' + JSON.stringify(sec).slice(0, 200));
    v = await start(db, a);
    if (v.error !== 'level_low' || v.need !== M.T.minLevel) bad.push('under the gate answered ' + JSON.stringify(v));
    await db.query(`update public.player_state set level_xp = public.hr_char_xp_for_level(50) where user_id = $1 and slot = 0`, [a]);
    await db.query(`update public.player_state set active_kind = 'gather', active_id = 'copper_rock', accrued_to = now() - interval '10 minutes', active_since = now() - interval '10 minutes'
                     where user_id = $1 and slot = 0`, [a]);
    v = await start(db, a);
    if (v.error !== 'settle_first') bad.push('a gather window owed to the engine answered ' + JSON.stringify(v));
    await db.query(`update public.player_state set active_kind = 'idle', active_id = null where user_id = $1 and slot = 0`, [a]);
    const refusals = [
      [{ skill: 'inner_flame' }, 'bad_skill'], [{ skill: 'mining' }, 'bad_skill'], [{ skill: 'Defense' }, 'bad_skill'],
      [{ place: 'home' }, 'no_dummy'], [{ place: 'castle' }, 'bad_place'],
      [{ hours: 0 }, 'bad_hours'], [{ hours: M.T.stopAfterHours.max + 1 }, 'bad_hours'], [{ keep: -1 }, 'bad_keep'], [{ keep: M.T.keepGoldMax + 1 }, 'bad_keep'],
      [{ keep: 100000 - need + 1 }, 'cannot_pay'],
    ];
    for (const [o, want] of refusals) {
      v = await start(db, a, o);
      if (!v || v.ok !== false || v.error !== want) bad.push(JSON.stringify(o) + ' answered ' + JSON.stringify(v).slice(0, 160) + ', want ' + want);
      if (want === 'cannot_pay' && (v.need !== need || v.purse !== 100000)) bad.push('cannot_pay names ' + JSON.stringify(v) + ', want need ' + need);
    }
    v = await start(db, z);
    if (v.error !== 'cannot_pay' || v.purse !== 0) bad.push('an empty purse answered ' + JSON.stringify(v));
    for (const u of [a, z]) {
      if ((await pointer(db, u)).active_kind !== 'idle' || (await runOf(db, u)) !== null || (await rows(db, u)).length) bad.push(u.slice(-4) + ': a refusal seated, remembered or journalled something');
    }
    if ((await purse(db, a)) !== 100000 || (await purse(db, z)) !== 0) bad.push('a refusal moved a purse');
    /* the start */
    const v0 = num((await pointer(db, a)).version);
    const k = key();
    v = await start(db, a, { skill: 'defense', hours: 8, keep: 30000, key: k });
    const p = await pointer(db, a);
    if (!v || v.ok !== true || p.active_kind !== 'training' || p.active_id !== 'yard_defense' || num(p.version) <= v0) bad.push('the start answered ' + JSON.stringify(v).slice(0, 200) + ' and the pointer is ' + JSON.stringify(p));
    const t = v && v.training;
    if (!t || t.xp_h !== 50 * M.T.xpPerLevelPerHour || t.gold_h !== 50 * M.T.feePerLevelPerHour || !t.run || t.run.skill !== 'defense' || t.run.keep_gold !== 30000
        || !t.settings || t.settings.stop_after_h !== 8 || t.settings.keep_gold !== 30000) bad.push('the section after the start is ' + JSON.stringify(t).slice(0, 300));
    if ((await one(db, `select public.hr_town_station_for('town_common', 'training', 'yard_defense')`)) !== 'training_yard') bad.push('the town does not stand a training hero on the yard');
    const viaState = await one(db, 'select public.hr_state_of($1::uuid, 0)->\'training\'', [a]);
    if (JSON.stringify(viaState) !== JSON.stringify(t)) bad.push('hr_state_of does not carry the section');
    const replay = await start(db, a, { skill: 'defense', hours: 8, keep: 30000, key: k });
    if (!replay || replay.ok !== true || 'training' in replay || num((await pointer(db, a)).version) !== num(p.version)) bad.push('a replay answered ' + JSON.stringify(replay).slice(0, 160) + ' or moved the hero');
    const other = await start(db, a, { skill: 'melee', key: k });
    if (other.error !== 'intent_mismatch' || (await runOf(db, a)).skill !== 'defense') bad.push('another request under the key answered ' + JSON.stringify(other));
    /* a new skill is a new run: the old one closed `switched`, the settings replaced */
    v = await start(db, a, { skill: 'ranged' });
    if (!v.ok || (await pointer(db, a)).active_id !== 'yard_ranged' || (await runOf(db, a)).skill !== 'ranged' || !(await runOf(db, a)).running) bad.push('a new skill answered ' + JSON.stringify(v).slice(0, 160));
    bad.push(...await books(db, a, base, M));
    return bad;
  },

  async 'TY-BOTH'(db, M) {
    const bad = [];
    const [viewed, closed, timed, late] = UIDS;
    const base = {};
    for (const u of [viewed, closed, timed, late]) base[u] = await hero(db, u, { level: 50, gold: 1000000 });
    await switchOn(db, [viewed, closed, timed, late]);
    for (const [u, hours] of [[viewed, null], [closed, null], [timed, 6]]) {
      const v = await start(db, u, { hours });
      if (!v || v.ok !== true) return ['harness: the start of ' + u.slice(-4) + ' answered ' + JSON.stringify(v)];
    }
    const t0 = (await runOf(db, viewed)).since;
    const SIX = 6 * HOUR;
    /* TRAINING VIEWED: the owner's tick, polled every 20 s (the client's cadence is its own; the server pays at most once a minute). */
    for (let ms = 20000; ms <= SIX; ms += 20000) await db.query('select public.hr_training_tick_at($1::uuid, 0, $2::timestamptz)', [viewed, at(t0, ms)]);
    await db.query(`select public.hr_training_settle($1::uuid, 0, $2::timestamptz, 'stopped')`, [viewed, at(t0, SIX)]);
    /* THE BROWSER CLOSED: nothing but the sweep, every minute. */
    for (let m = 1; m <= 360; m++) await db.query('select public.hr_training_sweep($1::timestamptz)', [at(t0, m * MIN)]);
    const wantXp = 6 * M.T.xpPerLevelPerHour * 50, wantGold = 6 * M.T.feePerLevelPerHour * 50;
    for (const [u, what] of [[viewed, 'viewed'], [closed, 'closed'], [timed, 'closed, Stop after 6 h']]) {
      const xp = (await skillXp(db, u, 'defense')) - base[u].xp.defense, gold = base[u].purse - (await purse(db, u));
      if (xp !== wantXp || gold !== wantGold) bad.push(what + ': six hours paid ' + xp + ' XP for ' + gold + ' g, want ' + wantXp + ' for ' + wantGold);
    }
    const nv = (await rows(db, viewed)).length, nc = (await rows(db, closed)).length;
    if (nv > SIX / MIN || nv < 1) bad.push('the viewed path wrote ' + nv + ' ledger rows in six hours (at most one a minute)');
    if (nc !== SIX / (M.T.server.flushSeconds * 1000)) bad.push('the closed path wrote ' + nc + ' ledger rows in six hours, want one a flush (' + SIX / (M.T.server.flushSeconds * 1000) + ')');
    const rt = await runOf(db, timed);
    if (rt.stop_reason !== 'stop_after' || num(rt.run_ms) !== SIX || (await pointer(db, timed)).active_kind !== 'idle') bad.push('"Stop after 6 h" ended ' + JSON.stringify(rt));
    if ((await runOf(db, viewed)).stop_reason !== 'stopped' || (await pointer(db, viewed)).active_kind !== 'idle') bad.push('the viewed hero did not stop on its stop');
    if (!(await runOf(db, closed)).running || (await pointer(db, closed)).active_kind !== 'training') bad.push('the closed hero (no stop) stopped');
    /* a sweep that comes late never pays past "Stop after": 1 h asked, the first sweep 1 h 07 min in */
    const vl = await start(db, late, { hours: 1, skill: 'magic' });
    if (!vl || vl.ok !== true) return ['harness: the late hero\'s start answered ' + JSON.stringify(vl)];
    await back(db, late, HOUR + 7 * MIN);
    const xl0 = await skillXp(db, late, 'magic');
    await db.query('select public.hr_training_sweep(now())');
    const rl = await runOf(db, late);
    if (rl.stop_reason !== 'stop_after' || num(rl.run_ms) !== HOUR || (await skillXp(db, late, 'magic')) - xl0 !== M.T.xpPerLevelPerHour * 50) bad.push('a late sweep paid ' + JSON.stringify(rl));
    /* the client's tick door: signed out refused; signed in, inside its minute, nothing paid */
    const out = await one(db, 'select public.hr_training_tick(0)');
    if (out.error !== 'not_signed_in') bad.push('a signed-out tick answered ' + JSON.stringify(out));
    const tick = await as(db, closed, 'select public.hr_training_tick(0)');
    if (!tick || tick.ok !== true || !tick.training || !tick.training.run) bad.push('the tick answered ' + JSON.stringify(tick).slice(0, 200));
    for (const u of [viewed, closed, timed]) bad.push(...await books(db, u, base[u], M));
    base[late].xp.magic = 0;
    bad.push(...await books(db, late, { ...base[late], xp: { defense: base[late].xp.defense, magic: xl0 } }, M));
    return bad;
  },

  async 'TY-KEEP'(db, M) {
    const bad = [];
    const [k, s] = UIDS;
    const base = await hero(db, k, { level: 50, gold: 20000 });
    const baseS = await hero(db, s, { level: 50, gold: 50000 });
    await switchOn(db, [k, s]);
    let v = await start(db, k, { keep: 15000 });
    if (!v || v.ok !== true) return ['harness: start answered ' + JSON.stringify(v)];
    const t0 = (await runOf(db, k)).since;
    for (let m = 10; m <= 180; m += 10) await db.query('select public.hr_training_sweep($1::timestamptz)', [at(t0, m * MIN)]);
    const r = await runOf(db, k);
    if (r.stop_reason !== 'keep_gold' || (await purse(db, k)) !== 15000 || (await pointer(db, k)).active_kind !== 'idle') bad.push('the keep ended ' + JSON.stringify(r) + ' at a purse of ' + (await purse(db, k)));
    if (num(r.run_ms) < 2 * HOUR || num(r.run_ms) > 2 * HOUR + MIN) bad.push('the keep paid ' + r.run_ms + ' ms, want two hours (5,000 g above the keep at 2,500 g an hour)');
    bad.push(...await books(db, k, base, M));
    /* another spend of the account mid-run (any purchase: hr_purse_move under the lock) */
    v = await start(db, s, { keep: 10000 });
    const ts = (await runOf(db, s)).since;
    await db.query('select public.hr_training_sweep($1::timestamptz)', [at(ts, 10 * MIN)]);
    /* 50,000 less 416 for the first 10 min, less this: 184 above the keep, under the next 10 min (416) */
    const spent = 39400;
    await db.query('select public.hr_purse_move($1::uuid, $2::bigint, 0)', [s, -spent]);
    await db.query('select public.hr_training_sweep($1::timestamptz)', [at(ts, 20 * MIN)]);
    const rs = await runOf(db, s);
    if (rs.stop_reason !== 'keep_gold' || (await purse(db, s)) < 10000 || (await purse(db, s)) > 10000 + 1) bad.push('another spend mid-run ended ' + JSON.stringify(rs) + ' at ' + (await purse(db, s)));
    bad.push(...await books(db, s, { ...baseS, spent }, M));
    return bad;
  },

  async 'TY-HUNT'(db, M) {
    const bad = [];
    const [h] = UIDS;
    const base = await hero(db, h, { level: 20, gold: 100000 });
    await switchOn(db, [h]);
    await db.query('update public.hr_hunt_config set enabled = true where id');
    let v = await start(db, h);
    if (!v || v.ok !== true) return ['harness: start answered ' + JSON.stringify(v)];
    await back(db, h, 30 * MIN);
    v = await as(db, h, `select public.hr_hunt_enter(0, 'mill_cellar', '[]'::jsonb, 0, null, $1::uuid)`, [key()]);
    if (!v || v.ok !== true) return ['harness: the hunt enter answered ' + JSON.stringify(v).slice(0, 300)];
    const r = await runOf(db, h);
    const want = M.T.xpPerLevelPerHour * 20 / 2;
    if (r.stop_reason !== 'hunt' || num(r.run_ms) !== 30 * MIN || (await skillXp(db, h, 'defense')) - base.xp.defense !== want) bad.push('a hunt entered closed the run ' + JSON.stringify(r) + ' (want 30 min, ' + want + ' XP)');
    const p = await pointer(db, h);
    if (p.active_kind !== 'combat' || !(await one(db, 'select public.hr_hunt_open_of($1::uuid, 0)', [h]))) bad.push('the hunt did not open: ' + JSON.stringify(p));
    v = await start(db, h);
    if (v.error !== 'in_hunt') bad.push('a hunting hero\'s start answered ' + JSON.stringify(v));
    bad.push(...await books(db, h, base, M));
    return bad;
  },

  async 'TY-SWITCH'(db, M) {
    const bad = [];
    const [w] = UIDS;
    const base = await hero(db, w, { level: 50, gold: 100000 });
    await switchOn(db, [w]);
    let v = await start(db, w);
    if (!v || v.ok !== true) return ['harness: start answered ' + JSON.stringify(v)];
    await back(db, w, 45 * MIN);
    /* the edge's switch commit (hr_apply's activity statement): any writer of the pointer */
    await db.query(`update public.player_state set active_kind = 'gather', active_id = 'copper_rock', active_since = now(), accrued_to = now(),
                     version = version + 1 where user_id = $1 and slot = 0`, [w]);
    const r = await runOf(db, w);
    if (r.stop_reason !== 'switched' || num(r.run_ms) !== 45 * MIN || (await skillXp(db, w, 'defense')) - base.xp.defense !== M.T.xpPerLevelPerHour * 50 * 3 / 4) bad.push('the pointer moving closed ' + JSON.stringify(r));
    v = await stop(db, w);
    if (v.error !== 'not_training') bad.push('a stop after the switch answered ' + JSON.stringify(v));
    bad.push(...await books(db, w, base, M));
    /* THE EDGE'S COLLECT (set-activity.js): a training pointer owes the engine nothing; the database is never asked */
    let asked = 0;
    const exec = async () => { asked++; throw new Error('the database was asked'); };
    const env = { ok: true, version: 7, state: { active_kind: 'training', active_id: 'yard_defense', accrued_to: new Date(Date.now() - HOUR).toISOString() } };
    let c;
    try { c = await M.SA.collectCurrentWindow({ exec, user: w, slot: 0, env, st: env.state, nowMs: Date.now(), capMs: 12 * HOUR, pointerSurvives: true }); }
    catch (e) { c = { threw: String(e.message) }; }
    if (!c || c.outcome !== 'nothing' || c.reason !== 'server_settled' || asked) bad.push('the edge\'s collect of a training pointer answered ' + JSON.stringify(c) + ' (asked the database ' + asked + 'x)');
    let s;
    try { s = await M.SF.settleBeforeMutate({ exec, user: w, slot: 0, verb: 'shop_buy', env, nowMs: Date.now(), capMs: 12 * HOUR }); }
    catch (e) { s = { threw: String(e.message) }; }
    if (!s || s.proceed !== true) bad.push('a shop buy of a training hero answered ' + JSON.stringify(s).slice(0, 200));
    return bad;
  },

  async 'TY-STOP'(db, M) {
    const bad = [];
    const [p] = UIDS;
    const base = await hero(db, p, { level: 50, gold: 100000 });
    await switchOn(db, [p]);
    let v = await start(db, p, { skill: 'melee' });
    base.xp.melee = await skillXp(db, p, 'melee');
    await back(db, p, 20 * MIN);
    const k = key();
    v = await stop(db, p, k);
    const r = await runOf(db, p);
    if (!v || v.ok !== true || !v.stopped || num(v.stopped.ms) !== 20 * MIN || r.stop_reason !== 'stopped' || (await pointer(db, p)).active_kind !== 'idle')
      bad.push('the stop answered ' + JSON.stringify(v).slice(0, 200) + ' and the run is ' + JSON.stringify(r));
    const ls = v && v.training && v.training.last_stop;
    if (!ls || ls.reason !== 'stopped' || ls.skill !== 'melee' || ls.ms !== 20 * MIN || ls.xp !== Math.floor(M.T.xpPerLevelPerHour * 50 / 3)) bad.push('last_stop is ' + JSON.stringify(ls));
    const g1 = await purse(db, p);
    const again = await stop(db, p, k);
    if (!again || again.ok !== true || (await purse(db, p)) !== g1) bad.push('a replayed stop answered ' + JSON.stringify(again).slice(0, 160) + ' or paid');
    v = await stop(db, p);
    if (v.error !== 'not_training') bad.push('a second stop answered ' + JSON.stringify(v));
    bad.push(...await books(db, p, { ...base, xp: { defense: base.xp.defense, melee: base.xp.melee } }, M));
    return bad;
  },

  async 'TY-FUSE'(db, M) {
    const bad = [];
    const [f] = UIDS;
    const base = await hero(db, f, { level: 50, gold: 1000000 });
    await switchOn(db, [f]);
    await start(db, f);
    await back(db, f, 30 * HOUR);
    const settle = async () => num((await one(db, 'select public.hr_training_settle($1::uuid, 0, now(), null)', [f])).ms);
    const a1 = await settle(), a2 = await settle(), a3 = await settle();
    const cap = M.T.server.maxSettleHours * HOUR, fuse = M.T.server.dayFuseHours * HOUR;
    if (a1 !== cap) bad.push('one settle of 30 h paid ' + a1 + ' ms, want the per-call ' + cap);
    if (a2 !== fuse - cap) bad.push('the next paid ' + a2 + ' ms, want what the day fuse leaves (' + (fuse - cap) + ')');
    if (a3 !== 0) bad.push('past the fuse a settle paid ' + a3 + ' ms');
    const r = await runOf(db, f);
    if (!r.running) bad.push('the fuse stopped the run (it holds, it never ends one)');
    bad.push(...await books(db, f, base, M));
    return bad;
  },
};

async function runArms(db, M, only) {
  const out = {};
  for (const name of ARMS) {
    if (only && !only.includes(name)) continue;
    try { out[name] = await inTx(db, () => DB_ARMS[name](db, M)); }
    catch (e) { out[name] = ['threw: ' + String(e && e.message).slice(0, 400)]; }
  }
  return out;
}

/* DB mutants: one anchored edit of a live body, and the arm that must go red. */
const PAY = 'public.hr_training_pay(uuid,integer,timestamp with time zone,text)';
const START = 'public.hr_training_start(integer,text,text,integer,bigint,uuid)';
const DB_MUTANTS = [
  { arm: 'TY-BOTH', name: 'XP without paying: the settle credits the skill and charges nothing', fn: PAY, find: '    v_g := v_fn / c_hour;\n', replace: '    v_g := 0;\n' },
  { arm: 'TY-BOTH', name: 'the gold is journalled but never taken from the purse', fn: PAY,
    find: '    v_after := public.hr_purse_move(p_user, -v_g, t.keep_gold);', replace: '    v_after := public.hr_purse_of(p_user);' },
  { arm: 'TY-BOTH', name: 'the carries are dropped (short settles round down)', fn: PAY,
    find: "         xp_carry = case when r.id is null then xp_carry else v_xn % c_hour end,", replace: '         xp_carry = 0,' },
  { arm: 'TY-BOTH', name: '"Stop after" is never read', fn: PAY,
    find: "  v_to := least(coalesce(p_at, now()), coalesce(t.stop_at, 'infinity'::timestamptz));", replace: '  v_to := coalesce(p_at, now());' },
  { arm: 'TY-BOTH', name: 'the rate reads a fixed Level, not the hero\'s', fn: PAY,
    find: '  v_lv := greatest(1, coalesce(public.hr_level_of(p_user, p_slot), 1));', replace: '  v_lv := 100;' },
  { arm: 'TY-BOTH', name: 'the owner\'s tick settles every poll (a ledger row every 20 s)', fn: 'public.hr_training_tick_at(uuid,integer,timestamp with time zone)',
    find: "  if t.running and (r.id is null or t.settled_to <= p_at - r.owner_min_ms * interval '1 millisecond'", replace: '  if t.running and (true' },
  { arm: 'TY-BOTH', name: 'the sweep never settles a closed browser', fn: 'public.hr_training_sweep(timestamp with time zone)',
    find: "      v := public.hr_training_settle(h.user_id, h.slot, p_at, null);", replace: '      v := null;' },
  { arm: 'TY-KEEP', name: 'the keep is never read (the purse is spent to 0)', fn: PAY,
    find: '    v_avail := public.hr_purse_lock(p_user) - t.keep_gold;', replace: '    v_avail := public.hr_purse_lock(p_user);' },
  { arm: 'TY-KEEP', name: 'a stopped run leaves the hero on the yard', fn: 'public.hr_training_settle(uuid,integer,timestamp with time zone,text)',
    find: "       set active_kind = 'idle', active_id = null, active_since = now(), version = version + 1, updated_at = now()",
    replace: "       set version = version + 1, updated_at = now()" },
  { arm: 'TY-HUNT', name: 'a hunt\'s session never pays the run', fn: 'public.hr_training_hunt_yield()',
    find: "    perform public.hr_training_pay(new.user_id, new.slot, now(), 'hunt');", replace: '    null;' },
  { arm: 'TY-SWITCH', name: 'another door moving the pointer never pays the run', fn: 'public.hr_training_leave()',
    find: "      perform public.hr_training_pay(new.user_id, new.slot, now(), case when new.active_kind = 'combat' then 'hunt' else 'switched' end);", replace: '      null;' },
  { arm: 'TY-FUSE', name: 'no day fuse', fn: PAY,
    find: '    v_span := least(v_span, greatest(0, r.day_fuse_h::bigint * c_hour - v_day));', replace: '    v_span := v_span;' },
  { arm: 'TY-FUSE', name: 'no per-call clamp', fn: PAY,
    find: '  v_span := least(v_span, coalesce(r.settle_max_ms, 0));', replace: '  v_span := v_span;' },
  { arm: 'TY-START', name: 'a hero who can\'t pay starts anyway', fn: START, find: '  if v_purse - p_keep_gold < v_need then', replace: '  if false then' },
  { arm: 'TY-START', name: 'no Level gate', fn: START, find: '  if v_lv < r.min_level then', replace: '  if false then' },
  { arm: 'TY-START', name: 'the switch is never asked', fn: START, find: "  if not public.hr_feature_on('training', v_uid) then", replace: '  if false then' },
  { arm: 'TY-START', name: 'a gather window owed to the engine is confiscated', fn: START,
    find: "    v_r := public.hr_settle_first_of(v_uid, p_slot);", replace: '    v_r := null;' },
  { arm: 'TY-STOP', name: 'the stop closes without paying', fn: 'public.hr_training_stop(integer,uuid)',
    find: "  v := public.hr_training_settle(v_uid, p_slot, now(), 'stopped');",
    replace: "  update public.player_training set running = false, stop_reason = 'stopped', stopped_at = settled_to where user_id = v_uid and slot = p_slot;\n  update public.player_state set active_kind = 'idle', active_id = null where user_id = v_uid and slot = p_slot;\n  v := null;" },
];
const JS_MUTANTS = [
  { arm: 'TY-SWITCH', name: 'the edge refuses every verb of a training hero (the collect asks the engine)', file: 'supabase/functions/hr-accrue/set-activity.js',
    from: '  if (SERVER_SETTLED_KINDS.includes(st.active_kind)) {', to: '  if (false) {' },
  { arm: 'TY-CAT', name: 'the generator writes another rate than the data', file: 'tools/gen-training.mjs',
    from: '    rule: { xp: T.xpPerLevelPerHour, fee:', to: '    rule: { xp: T.xpPerLevelPerHour + 1, fee:' },
];

async function load(root) {
  const u = (p) => pathToFileURL(join(root, p)).href;
  const gen = await import(u('tools/gen-training.mjs'));
  const { T } = await gen.loadData(root);
  const SA = await import(u('supabase/functions/hr-accrue/set-activity.js'));
  const SF = await import(u('supabase/functions/hr-accrue/settle-first.js'));
  return { root, gen, T, SA, SF };
}

async function main() {
  const { bootReplay } = await import('./schema-replay.mjs');
  let db;
  try { ({ db } = await bootReplay()); } catch (e) { console.error('✗ the chain would not replay: ' + String(e.message).slice(0, 800)); process.exit(1); }
  if (MUTATE) {
    let bad = 0;
    const M = await load(ROOT);
    const need = (m, res) => {
      const p = (res[m.arm] || [])[0];
      if (!p) { console.error('✗ ' + m.arm + ' stayed GREEN on: ' + m.name); return 1; }
      if (/^threw|^harness/.test(p)) { console.error('✗ harness: ' + m.arm + ' threw on: ' + m.name + ' (' + p.slice(0, 200) + ')'); return 1; }
      console.log('✓ ' + m.arm + ' goes red on: ' + m.name + '  (' + p.slice(0, 110) + ')'); return 0;
    };
    const control = await runArms(db, M);
    const redAtRest = Object.entries(control).filter(([, v]) => v.length);
    if (redAtRest.length) { console.error('✗ harness: the guard is red with no mutant: ' + redAtRest.map(([k, v]) => k + ': ' + v[0]).join(' | ')); process.exit(2); }
    for (const m of DB_MUTANTS) {
      if (process.env.HR_MUTANT_CONTROL) { bad += need(m, await runArms(db, M, [m.arm])); continue; }
      const def = String(await one(db, 'select pg_get_functiondef($1::regprocedure)', [m.fn])).split(String.fromCharCode(13)).join('');
      if (def.split(m.find).length !== 2) { console.error('✗ db mutant "' + m.name + '": anchor not found exactly once'); bad++; continue; }
      await db.exec(def.replace(m.find, () => m.replace));
      try { bad += need(m, await runArms(db, M, [m.arm])); } finally { await db.exec(def); }
    }
    for (const m of JS_MUTANTS) {
      const dir = mkdtempSync(join(tmpdir(), 'hr-ty-'));
      try {
        for (const d of ['src', 'supabase/functions/hr-accrue', 'tools/gen-training.mjs', 'tests/_is-main.mjs']) {
          mkdirSync(dirname(join(dir, d)), { recursive: true });
          cpSync(join(ROOT, d), join(dir, d), { recursive: true });
        }
        const p = join(dir, m.file);
        const src = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
        if (src.split(m.from).length !== 2) { console.error('✗ mutant "' + m.name + '": marker not found exactly once in ' + m.file); bad++; continue; }
        if (!process.env.HR_MUTANT_CONTROL) writeFileSync(p, src.replace(m.from, () => m.to));
        bad += need(m, await runArms(db, await load(dir), [m.arm]));
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }
    const total = DB_MUTANTS.length + JS_MUTANTS.length;
    console.log(bad ? 'training-yard --mutate: ' + bad + ' mutant(s) survived' : 'training-yard --mutate: all ' + total + ' mutants killed');
    process.exit(bad ? 1 : 0);
  }
  const M = await load(ROOT);
  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const out = await runArms(db, M, onlyArg ? onlyArg.slice(7).split(',') : null);
  let red = 0;
  for (const [name, bad] of Object.entries(out)) {
    if (bad.length) { red++; console.log('  ✗ ' + name); for (const b of bad) console.log('      ' + b); }
    else console.log('  ✓ ' + name);
  }
  const harness = Object.values(out).some((b) => b.some((x) => /^threw|^harness/.test(x)));
  console.log(red ? 'training-yard: ' + red + ' arm(s) red' : 'training-yard: all ' + Object.keys(out).length + ' arms green');
  process.exit(red ? (harness ? 2 : 1) : 0);
}

if (isMain(import.meta.url)) main();
