#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/company-trades.mjs — TRADE LEVELS BELONG TO THE COMPANY, AND A HERO'S TOWN WORK STOPS AT ITS DAY, WINDOW OPEN OR BROWSER CLOSED
//   (FB-10 slice 1; Tyler 2026-11-22 CR-Q1 a, CR-Q3 b; supabase/migrations/1059-company-trades*.sql, src/data/work-day.js,
//   src/core/work-day.js, supabase/functions/hr-accrue; CLAUDE.md §1, §4 both paths).
//
//   node tests/company-trades.mjs            the guard (the whole replayed chain, the shipped edge modules)
//   node tests/company-trades.mjs --mutate   the proof: each planted defect (SQL in the live body, JS in a temp copy of the edge) turns its arm red
//
// mutant-anchors: supabase/functions/hr-accrue/accrual.js, supabase/functions/hr-accrue/tick-shadow.js
//   (the JS mutants patch a temporary copy of the edge; the SQL mutants are planted in live bodies read from the replayed chain with
//   pg_get_functiondef and restored after their arm)
//
// Every hero is made with hr_create_hero and set to work through the REAL set_activity intent (runSetActivity), as hr_engine.
//   CT-DATA    src/data/work-day.js is valid; the server's hr_work_day row is the data's; a skill is a company trade on the server
//              exactly when its src/data/skills.js category is one of TRADE_CATS.
//   CT-TWIN    src/core/work-day.js foldWork and the SQL twin hr_work_fold agree on 200 seeded windows (midnight crossings, a used day,
//              bought work today, and an earlier day's own bought work: 1075-work-blocks-midnight.sql's eight-argument fold, with the
//              seven-argument one its answer with none); workStopMs is where the day runs out: the fold to it fits and a minute past
//              it does not; workStateOf reads the section's `bought` (yesterday's kept, today's and later dropped).
//   CT-SHARED  ONE COMPANY, TWO HEROES, BOTH DOORS: hero 0 mines with the window open (the viewed settle), hero 1 with the browser
//              closed (the world tick). The company's Mining is the sum of both heroes' journalled XP, both heroes read it, and a
//              hero made afterwards is born at it. A combat skill stays each hero's own.
//   CT-OPEN    WINDOW OPEN: a hero with 10 minutes of town work left mines; a viewed settle four minutes in continues, the next one ends
//              the job at the day's end (journal `work_cap`), the day's work reads its cap to the action, and nothing pays after.
//   CT-CLOSED  BROWSER CLOSED: the same on the world tick (10 s polls folded into 90 s flushes, the day carried between polls): the
//              tick ends the job at the day's end (`work_cap`, src tick) and the day reads its cap to the action.
//   CT-REFUSE  THE SERVER DECIDES: a crafted window past the day is refused work_cap and moves nothing; a new job on a spent day is
//              refused work_cap by the real intent; the Premium switch makes the day 10 h; the client's reader shows the section.
// Exit: 0 green · 1 red · 2 harness.
//
// ── WHAT IT CANNOT PROVE ────────────────────────────────────────────────
// TRUE CONCURRENCY: PGlite is one backend, so two heroes crediting one trade at once are played one after the other; the lock order
// that makes the real race safe is argued in 1059's header and its trigger takes the account's key before any trade row.
// ════════════════════════════════════════════════════════════════════════
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { bootReplay, ROOT } from './schema-replay.mjs';
import { isMain } from './_is-main.mjs';

const MUTATE = process.argv.includes('--mutate') || process.argv.includes('--selftest');
const FN = 'supabase/functions/hr-accrue';
const COLORS = '{"head": 13, "body": 5, "legs": 3, "feet": 0}';
const MIN = 60000;
const mod = (f) => import(pathToFileURL(join(ROOT, f)).href);
const WD = await mod('src/data/work-day.js');
const CORE = await mod('src/core/work-day.js');
const { SKILLS_DEF } = await mod('src/data/skills.js');
const { workDayOf } = await mod('src/session/trade-sections.js');

let seq = 0;
const nextUid = () => `000000c1-0000-4000-8000-0000001059${String(++seq).padStart(2, '0')}`;
const idem = () => crypto.randomUUID();
const one = async (db, sql, params) => { const r = (await db.query(sql, params)).rows[0]; return r ? Object.values(r)[0] : undefined; };
const js = (v) => String(JSON.stringify(v === undefined ? null : v));

async function as(db, uid, sql, params) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)",
    [uid, JSON.stringify({ sub: uid, role: 'authenticated' })]);
  await db.exec('set role authenticated');
  try { const r = (await db.query(sql, params)).rows[0]; return r ? Object.values(r)[0] : undefined; }
  finally {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claims', '', false)");
  }
}
/* The seam index.ts hands the engine: one statement, its own transaction, as hr_engine. */
const engineExec = (db) => async (text, params) => {
  await db.exec('begin'); await db.exec('set local role hr_engine');
  try { return (await db.query(text, params)).rows; } finally { await db.exec('commit'); }
};

/* A new account and its hero in `slot` (another hero of the same account when `uid` is given). */
async function makeHero(db, uid = null, slot = 0) {
  const u = uid || nextUid();
  if (!uid) {
    await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [u]);
    await db.query('insert into public.profiles (id, display_name) values ($1, $2) on conflict (id) do update set display_name = excluded.display_name',
      [u, 'Trader ' + seq]);
  }
  const n = seq * 7 + slot;
  const name = 'Trader' + String.fromCharCode(97 + (n % 26)) + String.fromCharCode(97 + Math.floor(n / 26) % 26) + String.fromCharCode(97 + slot);
  await db.query('delete from public.hr_rate_counters');
  const h = await as(db, u, 'select public.hr_create_hero($1, $2, $3::jsonb, $4::uuid)', [slot, name, COLORS, idem()]);
  if (!h || h.ok !== true) throw Object.assign(new Error('hr_create_hero refused: ' + js(h)), { harness: true });
  await db.query('update public.player_state set premium_until = null where user_id = $1', [u]);
  return u;
}

const stateOf = async (db, uid, slot = 0) => (await db.query(
  `select ps.active_kind, ps.active_id, ps.version, ps.work_day::text as work_day, ps.work_ms::text as work_ms, ps.job_end,
          floor(extract(epoch from ps.accrued_to) * 1000)::bigint::text as wm
     from public.player_state ps where ps.user_id = $1 and ps.slot = $2`, [uid, slot])).rows[0];
const xpOf = async (db, uid, slot, skill) => Number(await one(db,
  'select xp::text from public.player_skills where user_id = $1 and slot = $2 and skill_id = $3', [uid, slot, skill]) ?? -1);
const companyXp = async (db, uid, trade) => Number(await one(db,
  'select xp::text from public.company_trades where user_id = $1 and trade_id = $2', [uid, trade]) ?? 0);
const gatherRows = async (db, uid, slot = 0) => (await db.query(
  "select meta, xp_in::text as xp_in from public.player_ledger where user_id = $1 and slot = $2 and kind = 'gather' and intent = 'accrue' order by id",
  [uid, slot])).rows;

async function startJob(db, edge, uid, slot, activity) {
  await db.query('delete from public.hr_rate_counters');
  return edge.sa.runSetActivity({ exec: engineExec(db), user: uid, slot, intentId: idem(), activity });
}
/* The viewed hero's settle at the server instant `atMs` (default: the server's now): index.ts's accrue semantics (A14). */
async function viewedSettle(db, edge, uid, slot = 0, atMs = null) {
  await db.query('delete from public.hr_rate_counters');
  const exec = engineExec(db);
  const [read] = await exec(edge.sa.READ_SQL, [uid, slot, 'accrue']);
  const env = read && read.state;
  if (!env || env.ok !== true) throw Object.assign(new Error('no envelope: ' + js(read)), { harness: true });
  return edge.sa.collectCurrentWindow({ exec, user: uid, slot, env, st: env.state, nowMs: atMs ?? new Date(read.now).getTime(),
    capMs: Number(read.cap_ms) || 0, pointerSurvives: true });
}
/* One world-tick fire for these heroes, the way the cron drives it (job-counts.mjs's). */
async function fire(db, edge, rows) {
  await db.query('delete from public.hr_rate_counters');
  await db.query('select public.hr_tick_enrol(200)');
  const holder = await one(db, "select left('cron:' || coalesce(current_database(), 'db'), 64)");
  await db.query("select count(*) from public.hr_tick_roster((select channels from public.hr_tick_config where id), 0, 200, $1, 30000, null, null, null)", [holder]);
  try {
    return (await edge.tick.runTick({ exec: engineExec(db),
      body: { op: 'tick', roster: rows.map(([u, s]) => ({ user_id: u, slot: s })), cadence_ms: 10000, flush_ms: 90000 } })).body;
  } catch (e) { return { RAISED: String(e.message).slice(0, 200) }; }
}
/* Server time passes for a town job: both watermarks and the return anchor move back together (job-counts.mjs's). */
async function passes(db, uid, slot, s) {
  await db.query(`update public.player_state set active_since = active_since - make_interval(secs => $3),
                         accrued_to = accrued_to - make_interval(secs => $3) where user_id = $1 and slot = $2`, [uid, slot, s]);
  await db.query('update public.hr_return_anchor set real_return_at = real_return_at - make_interval(secs => $3) where user_id = $1 and slot = $2', [uid, slot, s]);
}
/* A hero whose town job started at T0 with `leftMs` of its day left: T0 at least `leftMs` + 5 minutes before the server's now and
   [T0, T0 + leftMs + 1 minute] inside ONE UTC day, so the stop is the day's cap at any hour the test runs. Returns { t0, cap, day }. */
async function dayLeft(db, uid, slot, leftMs) {
  const now = Number(await one(db, 'select floor(extract(epoch from now()) * 1000)::bigint::text'));
  const cap = Number(await one(db, 'select public.hr_work_base_ms($1::uuid, $2)::text', [uid, slot]));
  let t0 = now - leftMs - 5 * MIN;
  if (CORE.utcDayStart(t0) !== CORE.utcDayStart(t0 + leftMs + MIN)) t0 = CORE.utcDayStart(now) - leftMs - 4 * 3600000;
  const day = new Date(CORE.utcDayStart(t0)).toISOString().slice(0, 10);
  await db.query(`update public.player_state set accrued_to = to_timestamp($3::double precision / 1000), active_since = to_timestamp($3::double precision / 1000),
                         work_day = $4::date, work_ms = $5 where user_id = $1 and slot = $2`, [uid, slot, t0, day, cap - leftMs]);
  await db.query('update public.hr_return_anchor set real_return_at = to_timestamp($3::double precision / 1000) where user_id = $1 and slot = $2', [uid, slot, t0]);
  return { t0, cap, day, now };
}

async function arms(db, edge, only = null) {
  const red = new Map();
  const want = (id) => !only || only.includes(id);
  const arm = (id, pass, good, bad) => {
    if (!MUTATE) console.log(pass ? `  ✓ ${id} — ${good}` : `  ✗ ${id} — ${bad}`);
    if (!pass) red.set(id, bad);
  };
  const node = await one(db, "select activity_id from public.hr_activities where kind = 'gather' and req_skill = 'mining' and coalesce(req_lv, 1) <= 1 order by activity_id limit 1");
  if (!node) throw Object.assign(new Error('no level-1 mining node'), { harness: true });

  /* ── CT-DATA ── */
  if (want('CT-DATA')) {
    const row = (await db.query('select free_min, premium_extra_min, trade_cats, work_kinds from public.hr_work_day')).rows[0];
    const server = new Map((await db.query('select skill_id, public.hr_trade_is(skill_id) as t from public.hr_skills')).rows.map((r) => [r.skill_id, r.t]));
    const wrong = Object.keys(SKILLS_DEF).filter((k) => server.has(k) && server.get(k) !== WD.TRADE_CATS.includes(SKILLS_DEF[k].cat));
    arm('CT-DATA', WD.validate().length === 0 && row && row.free_min === WD.WORK_DAY.freeMin && row.premium_extra_min === WD.WORK_DAY.premiumExtraMin
        && js([...row.trade_cats].sort()) === js([...WD.TRADE_CATS].sort()) && js([...row.work_kinds].sort()) === js([...WD.WORK_KINDS].sort())
        && wrong.length === 0 && server.get('mining') === true && server.get('melee') === false,
      `the data is valid, hr_work_day is its row (${WD.WORK_DAY.freeMin} min, +${WD.WORK_DAY.premiumExtraMin}), and a trade is a skill of category ${WD.TRADE_CATS.join(' or ')}`,
      `problems ${js(WD.validate())}, row ${js(row)}, trade disagreements ${js(wrong)}`);
  }

  /* ── CT-TWIN ── */
  if (want('CT-TWIN')) {
    let s = 0x1059;
    const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
    const base0 = Date.UTC(2026, 10, 20);
    const today = Date.UTC(2026, 10, 21);
    const bad = [];
    const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
    const flat = (q) => ({ ok: q.ok, day: q.day, used_ms: Number(q.used_ms), over_ms: Number(q.over_ms), left_ms: Number(q.left_ms) });
    let crossed = 0;
    for (let i = 0; i < 200 && bad.length < 3; i++) {
      /* EACH DAY'S OWN BOUGHT WORK (1075-work-blocks-midnight.sql): an earlier day's blocks ride `boughtMs` (the section's `bought`),
         keyed by day: yesterday's (a window from it crosses into today) and the day before's (out of every window's reach here) */
      const boughtMs = {};
      for (const d of [base0 - CORE.DAY_MS, base0]) if (rnd() < 0.35) boughtMs[d] = (1 + Math.floor(rnd() * 2)) * 2 * 3600000;
      const w = { dayMs: base0 + Math.floor(rnd() * 3) * CORE.DAY_MS, usedMs: Math.floor(rnd() * 11 * 3600000), baseMs: 8 * 3600000,
        extraMs: rnd() < 0.3 ? 2 * 3600000 : 0, todayMs: today, boughtMs };
      const from = base0 + Math.floor(rnd() * 2 * CORE.DAY_MS);
      const to = from + Math.floor(rnd() * 14 * 3600000);
      const map = Object.fromEntries(Object.entries(boughtMs).map(([d, ms]) => [isoDay(Number(d)), ms]));
      const j = CORE.foldWork(w, from, to);
      const args = [isoDay(w.dayMs), w.usedMs, from, to, w.baseMs, w.extraMs, isoDay(today)];
      const q = await one(db, `select public.hr_work_fold($1::date, $2, to_timestamp($3::double precision / 1000), to_timestamp($4::double precision / 1000), $5, $6, $7::date, $8::jsonb)`,
        [...args, JSON.stringify(map)]);
      const jj = { ok: j.ok, day: isoDay(j.dayMs), used_ms: j.usedMs, over_ms: j.overMs, left_ms: j.leftMs };
      if (js(jj) !== js(flat(q))) bad.push({ w, from, to, js: jj, sql: q });
      /* the seven-argument fold is the eight with no earlier day's blocks, and both are foldWork without them */
      if (!Object.keys(map).length) {
        const q7 = await one(db, `select public.hr_work_fold($1::date, $2, to_timestamp($3::double precision / 1000), to_timestamp($4::double precision / 1000), $5, $6, $7::date)`, args);
        if (js(flat(q7)) !== js(flat(q))) bad.push({ w, from, to, seven: q7, eight: q });
      }
      if (map[isoDay(from)] && CORE.utcDayStart(from) !== CORE.utcDayStart(to)) crossed++;
      const stop = CORE.workStopMs(w, from);
      if (stop - from < 14 * 3600000 && (!CORE.foldWork(w, from, stop).ok || CORE.foldWork(w, from, stop + MIN).ok)) bad.push({ w, from, stop, why: 'the stop is not where the day runs out' });
    }
    /* the state the engine reads: the section's `bought` keyed by day, today's and later days dropped (today's is extra_ms) */
    const ws = CORE.workStateOf({ today: '2026-11-21', day: '2026-11-20', used_ms: 5, base_ms: 8, extra_ms: 2,
      bought: { '2026-11-20': 7200000, '2026-11-21': 1, '2026-11-22': 1, nope: 3, '2026-11-19': -4 } });
    const wsOk = ws && js(ws.boughtMs) === js({ [Date.UTC(2026, 10, 20)]: 7200000 }) && js(CORE.workStateOf({ today: '2026-11-21', base_ms: 8 }).boughtMs) === '{}';
    arm('CT-TWIN', bad.length === 0 && crossed >= 5 && wsOk,
      `foldWork and hr_work_fold agree on 200 seeded windows (${crossed} cross midnight from a day with its own bought blocks), the seven-argument fold is the eight with none, workStopMs is where the day runs out, and workStateOf reads the section's bought`,
      `disagreements ${js(bad).slice(0, 600)}; crossings ${crossed}; workStateOf ${js(ws)}`);
  }

  /* ── CT-SHARED: one company, two heroes, both doors ── */
  if (want('CT-SHARED')) {
    const u = await makeHero(db);
    await makeHero(db, u, 1);
    await db.query("update public.player_skills set xp = 500 where user_id = $1 and slot = 0 and skill_id = 'melee'", [u]);
    const m0 = await companyXp(db, u, 'mining');
    const s0 = await startJob(db, edge, u, 0, { kind: 'gather', id: node, count: 30, next: 'wait' });
    const s1 = await startJob(db, edge, u, 1, { kind: 'gather', id: node, count: 30, next: 'wait' });
    if (s0.status !== 200 || s1.status !== 200) throw Object.assign(new Error('CT-SHARED start refused: ' + js([s0.body, s1.body])), { harness: true });
    await db.query('update public.player_state set last_seen_at = null where user_id = $1 and slot = 1', [u]);
    await passes(db, u, 0, 120); await passes(db, u, 1, 120);
    await viewedSettle(db, edge, u, 0);
    for (let i = 0; i < 4; i++) { await fire(db, edge, [[u, 1]]); if ((await stateOf(db, u, 1)).active_kind !== 'gather') break; }
    const r0 = await gatherRows(db, u, 0), r1 = await gatherRows(db, u, 1);
    const paid = [...r0, ...r1].reduce((a, r) => a + Number(r.xp_in || 0), 0);
    const co = await companyXp(db, u, 'mining');
    const h0 = await xpOf(db, u, 0, 'mining'), h1 = await xpOf(db, u, 1, 'mining');
    await makeHero(db, u, 2);
    const h2 = await xpOf(db, u, 2, 'mining');
    const env2 = await one(db, 'select public.hr_state_of($1::uuid, 2)', [u]);
    const melee = [await xpOf(db, u, 0, 'melee'), await xpOf(db, u, 1, 'melee')];
    arm('CT-SHARED', r0.length >= 1 && r1.length >= 1 && r1.every((r) => r.meta.src === 'tick') && paid > 0 && co === m0 + paid
        && h0 === co && h1 === co && h2 === co && env2 && env2.skills && Number(env2.skills.mining.xp) === co && melee[0] === 500 && melee[1] !== 500,
      `hero 0 (viewed) and hero 1 (the tick) mined into ONE company total, ${co} XP = the ${paid} both journalled; every hero reads it, a hero made after is born at it, and Melee stays each hero's own`,
      `rows ${r0.length}/${r1.length} (srcs ${js(r1.map((r) => r.meta.src))}), paid ${paid}, company ${m0} -> ${co}, heroes ${h0}/${h1}/${h2}, envelope ${js(env2 && env2.skills && env2.skills.mining)}, melee ${js(melee)}`);
  }

  /* ── CT-OPEN: window open, the day runs out ── */
  if (want('CT-OPEN')) {
    const u = await makeHero(db);
    const st = await startJob(db, edge, u, 0, { kind: 'gather', id: node, count: 100000, next: 'wait' });
    if (st.status !== 200) throw Object.assign(new Error('CT-OPEN start refused: ' + js(st.body)), { harness: true });
    const { t0, cap, day } = await dayLeft(db, u, 0, 10 * MIN);
    await viewedSettle(db, edge, u, 0, t0 + 4 * MIN);
    const mid = await stateOf(db, u, 0);
    await viewedSettle(db, edge, u, 0);
    const end = await stateOf(db, u, 0);
    const rows = await gatherRows(db, u, 0);
    const v1 = end.version;
    await passes(db, u, 0, 300);
    await viewedSettle(db, edge, u, 0).catch(() => null);
    const after = await stateOf(db, u, 0);
    const last = rows[rows.length - 1] || {};
    arm('CT-OPEN', mid.active_kind === 'gather' && Number(mid.work_ms) > cap - 10 * MIN && Number(mid.work_ms) < cap - 5 * MIN
        && end.active_kind === 'idle' && end.work_day === day && Number(end.work_ms) <= cap && cap - Number(end.work_ms) < 10000
        && rows.length === 2 && last.meta && last.meta.stopped === 'work_cap' && end.job_end && end.job_end.end === 'work_cap' && after.version === v1,
      `window open: four minutes in the job runs on (${Math.round((cap - Number(mid.work_ms)) / 1000)} s left), the next settle ends it at the day's end (work_cap, ${Math.round((cap - Number(end.work_ms)) / 1000)} s short of the cap: the last action's step), nothing pays after`,
      `mid ${js(mid)}, end ${js(end)} (cap ${cap}, day ${day}), rows ${js(rows.map((r) => r.meta && [r.meta.ms, r.meta.stopped]))}, after v${after.version} (was ${v1})`);
  }

  /* ── CT-CLOSED: browser closed, the tick, the day carried between polls ── */
  if (want('CT-CLOSED')) {
    const u = await makeHero(db);
    const st = await startJob(db, edge, u, 0, { kind: 'gather', id: node, count: 100000, next: 'wait' });
    if (st.status !== 200) throw Object.assign(new Error('CT-CLOSED start refused: ' + js(st.body)), { harness: true });
    await db.query('update public.player_state set last_seen_at = null where user_id = $1 and slot = 0', [u]);
    /* the tick owns a hero it enrolled while its watermark was fresh (hr_tick_enrol), as job-counts.mjs J-CLOSED does */
    await db.query('select public.hr_tick_enrol(200)');
    const { cap, day } = await dayLeft(db, u, 0, 10 * MIN);
    let f = null;
    for (let i = 0; i < 20; i++) { f = await fire(db, edge, [[u, 0]]); if ((await stateOf(db, u, 0)).active_kind !== 'gather') break; }
    const end = await stateOf(db, u, 0);
    const rows = await gatherRows(db, u, 0);
    const last = rows[rows.length - 1] || {};
    /* the tick's journal row is accrueGather's shape without a stop word (foldGatherMeta); the job's end the server wrote says it */
    arm('CT-CLOSED', end.active_kind === 'idle' && end.work_day === day && Number(end.work_ms) <= cap && cap - Number(end.work_ms) < 10000
        && rows.length >= 3 && rows.every((r) => r.meta.src === 'tick') && last.meta && end.job_end && end.job_end.end === 'work_cap',
      `browser closed: the tick worked ${rows.length} flushes and ended the job at the day's end (job end work_cap, ${Math.round((cap - Number(end.work_ms)) / 1000)} s short of the cap)`,
      `last fire ${js(f).slice(0, 200)}, end ${js(end)} (cap ${cap}, day ${day}), rows ${js(rows.map((r) => r.meta && [r.meta.src, r.meta.ms]))}`);
  }

  /* ── CT-REFUSE: the server decides ── */
  if (want('CT-REFUSE')) {
    const u = await makeHero(db);
    const st = await startJob(db, edge, u, 0, { kind: 'gather', id: node, count: 100000, next: 'wait' });
    if (st.status !== 200) throw Object.assign(new Error('CT-REFUSE start refused: ' + js(st.body)), { harness: true });
    const { t0, cap } = await dayLeft(db, u, 0, 10 * MIN);
    const before = await stateOf(db, u, 0);
    const m0 = await companyXp(db, u, 'mining');
    await db.query('delete from public.hr_rate_counters');
    const over = (await engineExec(db)('select public.hr_apply($1::uuid, 0, $2, $3::uuid, $4::jsonb) as r', [u, before.version, idem(), JSON.stringify({
      accrued_to: new Date(t0 + 11 * MIN).toISOString(), xp: { mining: 50 }, journal: { kind: 'gather', intent: 'accrue' } })]))[0].r;
    const still = await stateOf(db, u, 0);
    /* a spent day: the real intent refuses a new job */
    await db.query("update public.player_state set work_day = (now() at time zone 'utc')::date, work_ms = $2 where user_id = $1 and slot = 0", [u, cap]);
    const again = await startJob(db, edge, u, 0, { kind: 'gather', id: node, count: 20, next: 'wait' });
    const env = await one(db, 'select public.hr_state_of($1::uuid, 0)', [u]);
    const day = workDayOf({ read: (k) => env[k] });
    await db.query("update public.hr_flags set enabled = true where key = 'beta_premium'");
    const prem = await one(db, 'select public.hr_work_base_ms($1::uuid, 0)::text', [u]);
    await db.query("update public.hr_flags set enabled = false where key = 'beta_premium'");
    arm('CT-REFUSE', over && over.error === 'work_cap' && still.version === before.version && still.work_ms === before.work_ms && (await companyXp(db, u, 'mining')) === m0
        && again.body && again.body.error === 'work_cap' && day && day.leftMs === 0 && day.capMs === cap && day.trades.includes('mining') && !day.trades.includes('melee')
        && Number(prem) === (WD.WORK_DAY.freeMin + WD.WORK_DAY.premiumExtraMin) * MIN,
      'a window past the day is refused work_cap and moves nothing, the real intent refuses a new job on a spent day, the client reads the section, and Premium\'s day is longer',
      `over ${js(over)}, version ${before.version} -> ${still.version}, again ${js(again.status)} ${js(again.body && again.body.error)}, section ${js(day)}, premium ${prem}`);
  }
  return red;
}

async function loadEdge(dir) {
  const tick = await import(pathToFileURL(join(dir, FN, 'tick.js')).href + `?m=${seq}`);
  const sa = await import(pathToFileURL(join(dir, FN, 'set-activity.js')).href + `?m=${seq}`);
  return { tick, sa };
}

async function prepare(db) {
  await db.query("insert into public.hr_flags (key, enabled, note) values ('town_presence', true, 'company-trades') on conflict (key) do update set enabled = true");
  await db.query("update public.hr_flags set enabled = false where key = 'beta_premium'");
  await db.query('update public.hr_tick_config set enabled = true where id');
  await db.query("update public.hr_tick_config set armed_channels = (select array_agg(distinct x) from unnest(armed_channels || 'gather'::text) x) where id");
}

const JS_MUTANTS = [
  { id: 'no_stop', arm: 'CT-OPEN', file: `${FN}/accrual.js`, why: 'the engine never stops a job at the day\'s end (the server refuses the window)',
    from: '    if (leftMs <= grantMs) { grantMs = leftMs; workCapped = true; }', to: '' },
  { id: 'no_carry', arm: 'CT-CLOSED', file: `${FN}/tick-shadow.js`, why: 'the tick forgets the day between its 10 s polls',
    from: '    char.workDay = { ...char.workDay, dayMs: f.dayMs, usedMs: f.usedMs };', to: '' },
];
const SQL_MUTANTS = [
  { arm: 'CT-TWIN', name: 'the SQL twin ignores an earlier day\'s own bought work (1075\'s eight-argument fold drifts from foldWork)',
    fn: 'public.hr_work_fold(date,bigint,timestamp with time zone,timestamp with time zone,bigint,bigint,date,jsonb)',
    find: "when jsonb_typeof(v_b) = 'number' and v_b::text ~ '^[0-9]{1,15}$' then (v_b::text)::bigint", repl: 'when false then 0' },
  { arm: 'CT-REFUSE', name: 'hr_apply never refuses a window past the day', fn: 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)',
    find: "      if not (v_work->>'ok')::boolean then\n        perform public.hr_reject('work_cap', v_work - 'ok');", repl: "      if false then\n        perform public.hr_reject('work_cap', v_work - 'ok');" },
  { arm: 'CT-SHARED', name: 'the company total never reaches the other heroes (no fan-out)', fn: 'public.hr_trade_row_sync()',
    find: '   where s.user_id = new.user_id and s.skill_id = new.skill_id and s.slot <> new.slot and s.xp is distinct from v_x;',
    repl: '   where false;' },
  { arm: 'CT-SHARED', name: 'a credit replaces the company total instead of adding to it', fn: 'public.hr_trade_row_sync()',
    find: '    if new.xp is not distinct from v_x then return new; end if;', repl: '    if true then return new; end if;' },
];

async function main() {
  let db;
  try { ({ db } = await bootReplay()); } catch (e) { console.error(`company-trades: HARNESS — ${String(e.message).split('\n').slice(0, 2).join(' ')}`); process.exit(2); }
  try {
    await prepare(db);
    if (!MUTATE) {
      console.log('\ncompany-trades — trade Levels are the company\'s, and a hero\'s town work stops at its day, window open and browser closed\n');
      const red = await arms(db, await loadEdge(ROOT));
      console.log(red.size ? `\ncompany-trades: RED (${red.size})` : '\ncompany-trades: green');
      process.exitCode = red.size ? 1 : 0;
      return;
    }
    console.log('\ncompany-trades --mutate\n');
    let bad = 0;
    for (const mu of JS_MUTANTS) {
      const dir = mkdtempSync(join(tmpdir(), 'hr-ctrades-'));
      try {
        for (const d of ['src/core', 'src/data', FN]) cpSync(join(ROOT, d), join(dir, d), { recursive: true });
        cpSync(join(ROOT, 'src/build-info.js'), join(dir, 'src/build-info.js'));
        const p = join(dir, mu.file);
        const src = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
        if (src.split(mu.from).length !== 2) { console.error(`company-trades: HARNESS — mutant ${mu.id}: anchor not found once in ${mu.file}`); process.exit(2); }
        writeFileSync(p, src.replace(mu.from, () => mu.to));
        seq += 1;
        const red = await arms(db, await loadEdge(dir), [mu.arm]);
        const caught = red.has(mu.arm);
        console.log(caught ? `  ✓ ${mu.id} — caught by ${mu.arm} (${mu.why})` : `  ✗ ${mu.id} — SURVIVED (${mu.why})`);
        if (!caught) bad++;
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }
    const edge = await loadEdge(ROOT);
    for (const m of SQL_MUTANTS) {
      const def = String(await one(db, 'select pg_get_functiondef($1::regprocedure)', [m.fn])).replace(/\r/g, '');
      if (def.split(m.find).length !== 2) { console.error(`company-trades: HARNESS — mutant "${m.name}": anchor not found once in ${m.fn}`); process.exit(2); }
      await db.exec(def.replace(m.find, () => m.repl));
      try {
        const red = await arms(db, edge, [m.arm]);
        const caught = red.has(m.arm);
        console.log(caught ? `  ✓ ${m.arm} goes red on: ${m.name}` : `  ✗ ${m.arm} stayed GREEN on: ${m.name}`);
        if (!caught) bad++;
      } finally { await db.exec(def); }
    }
    console.log(bad ? `\ncompany-trades --mutate: ${bad} survived` : `\ncompany-trades --mutate: all ${JS_MUTANTS.length + SQL_MUTANTS.length} mutants killed`);
    process.exitCode = bad ? 1 : 0;
  } catch (e) {
    console.error(`company-trades: ${e && e.harness ? 'HARNESS' : 'THREW'} — ${String(e && e.stack || e).slice(0, 800)}`);
    process.exitCode = 2;
  }
}

if (isMain(import.meta.url)) await main();
