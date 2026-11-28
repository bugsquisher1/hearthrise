#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/trade-jobs.mjs — THE KIT TRADES' JOB SLICE: A JOB STARTS ON THE SERVER'S QUOTE, REFUSES IN ORDER, AND SETTLES FROM ITS OWN SEED
//   THE SAME WITH THE PAGE OPEN OR THE BROWSER CLOSED (lane/k1-job-slice; supabase/migrations/1073-k1-job-slice.sql,
//   1063-trade-formulas-catalogue.generated.sql (tools/gen-trades.mjs); src/core/trades.js jobRecipes and settleJob; CLAUDE.md §1, §4 both
//   paths; 09-crafting.md sections 4.9 and 6).
//
//   node tests/trade-jobs.mjs            the guard (every arm, the whole replayed chain, real CharacterSessions for the presses)
//   node tests/trade-jobs.mjs --mutate   the proof: each SQL mutant planted in the live body must turn its arm red
//
// mutant-anchors: none — every mutant is planted in a live function body read from the replayed chain (pg_get_functiondef), inside the
//   arm's rolled-back transaction; no tracked file is patched
//
// ci-step: db-replay-17 | Trade jobs - a kit-trade job on the server's quote, its refusals in order, the same goods viewed and closed, a stop returns the rest
// ci-run: node tests/trade-jobs.mjs
// ci-run: node tools/mutant-gate.mjs node tests/trade-jobs.mjs --mutate
//
//   TJ-DATA    the server's recipes are src/core/trades.js jobRecipes (kind, band, rung, face, inputs a set); each imbuement job takes
//              exactly imbueRecipe's set (5 of its part, 4 Remains of its band) at its part's band; every face and input is an item on
//              both sides; every Danger scale ground's band is its gearLevel over tierSteps
//   TJ-TWIN    the server's roller is settleJob to the last good: hr_trade_mulberry is mulberry32's draw at 2,000 states,
//              hr_trade_roll is settleJob for every recipe at several Levels, times and seeds (and with Mastery and a bench, quality
//              dark as shipped, every good Plain, and the cascade lit in a rolled-back transaction: 09 4.11 row 6),
//              hr_trade_band_rung is bandRung for every kind and band 0 to 12, hr_trade_work_stop is workStopMs over day states and times
//   TJ-ORDER   the start's refusals in the spec's order, each moving nothing: bad_recipe, busy, rung_locked, band_locked, work_cap,
//              count_cap, quote_changed, short_inputs; the chain ends lit (1079, the cut), and dark, not_open and no section
//   TJ-BOTH    THE DONE LINE, BOTH DOORS: one hero starts a job from the Work window's quote (a real CharacterSession: one RPC, its answer
//              taken as the envelope, no hr_load); then (a) VIEWED, the window's Collect at the job's end, and (b) CLOSED, nothing from the
//              browser and the server's sweep a while after the end: the same goods by quality, XP and work day on both, and both are
//              settleJob on the stored seed. Twice: a whole-count Cook Shrimp, and a band 2 imbuement the day cuts short (work_cap, the
//              rest refunded)
//   TJ-STOP    a stop an hour in lands exactly the first hour of the seeded sequence, hands every unattempted set back to Storage
//              (trade_refund) and their share of the fee (fee - ceil(fee x attempted / count), one trade_fee_refund credit: 09 4.11
//              row 5), and the restart is a new job with a new seed
//   TJ-DAY     a job the day ends stops at work_cap with the day used and the fee of its unattempted sets back; a work block bought
//              under a running job moves its end (the sweep at the old end answers not_due and later collects the whole count)
//   TJ-RULE    the standing work rule buys for a running job (09 4.11 row 7), the browser closed: nothing for a hero with no job; the
//              cron's sweep buys one block for a whole day's job on the day's last minutes, the job's end moves by the block, the rule's
//              count holds, and the job lands the bought time's attempts
//   TJ-MIDNIGHT THE UTC DAY TURNING OVER (lane/k1-server-fixes): 1073's own §9 self-check completes with the server clock pinned at
//              23:59:58, 23:56, 21:52, 22:30, 10:00 and 00:00:02 UTC (the rehearsal's red was 23:59:58); and a job keeps the work blocks
//              bought on its own day when it is read after midnight: a morning block carrying a job past midnight, and a job its block
//              ran to 20:00 collected after midnight, land the same goods viewed and closed, the section's end unmoved by the date
//   TJ-BAND    a band opens on a depth record at that band or deeper (the designer's ruling): a band 3 record opens bands 0 to 3 (a band
//              1 job starts, a band 2 quotes), a band 1 record leaves band 3 band_locked
//   TJ-KEY     the start pressed twice with one key is one job and one fee; the pointer cannot leave idle while a job is open (HRJ01)
//   TJ-SURFACE anon reaches neither verb, no client reaches the settle, the sweep or the roller, and the seed never leaves the server
// Exit: 0 green · 1 a red arm or a missed mutant · 2 a harness problem.
//
// ── WHAT IT CANNOT PROVE ────────────────────────────────────────────────
// TRUE CONCURRENCY: PGlite is one backend, so the sweep's try-locks never meet a busy hero here; the never-wait argument is 1073's
// header (CONCURRENCY). The cron itself is not run: the arms call hr_trade_jobs_sweep as the cron does.
// ════════════════════════════════════════════════════════════════════════
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { isMain } from './_is-main.mjs';
import { bootReplay, ROOT } from './schema-replay.mjs';

const MUTATE = process.argv.includes('--mutate');
const MIN = 60000;
const HOUR = 3600000;
const DAY_MS = 86400000;
const mod = (f) => import(pathToFileURL(join(ROOT, f)).href);
const { HARNESS: H } = await import('./hunt-sessions-settle.mjs');
const { CharacterSession } = await mod('src/session/character-session.js');
const { tradeJobsOf } = await mod('src/session/trade-sections.js');
const { startTradeJob, endTradeJob } = await mod('src/session/trade-intents.js');
const T = await mod('src/core/trades.js');
const { mulberry32 } = await mod('src/core/rng.js');
const { workStopMs } = await mod('src/core/work-day.js');
const { imbueRecipe } = await mod('src/core/imbue.js');
const { ITEMS } = await mod('src/data/items.js');
const { DANGER_GROUNDS, GEAR_STEPS } = await mod('src/data/danger.js');
const { one, q } = H;
const idem = () => crypto.randomUUID();
const js = (v) => String(JSON.stringify(v === undefined ? null : v)).slice(0, 400);
const COLORS = '{"head": 13, "body": 5, "legs": 3, "feet": 0}';
const CAT = T.tradeCatalogue();
const RECIPES = T.jobRecipes(CAT);
/* THE PINNED DAY: the first UTC day whose 10:00 is more than an hour ahead of the real clock (work-blocks.mjs's rule). */
const DAY = new Date(Math.ceil((Date.now() + HOUR - 10 * HOUR) / DAY_MS) * DAY_MS + 10 * HOUR).toISOString().slice(0, 10);
const at = (hhmm) => DAY + 'T' + hhmm + ':00Z';
const msOf = (iso) => Date.parse(iso);

let seq = 0;
const nextUid = () => '000000c1-0000-4000-8000-' + String(107300000000 + (++seq)).padStart(12, '0');

async function as(db, uid, sql, params, role = 'authenticated') {
  await db.query("select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)", [uid, JSON.stringify({ sub: uid, role })]);
  await db.query('savepoint tj_as');
  await db.exec('set role ' + role);
  try { const r = (await db.query(sql, params)).rows[0]; await db.exec('reset role'); await db.query('release savepoint tj_as'); return r ? Object.values(r)[0] : undefined; }
  catch (e) { await db.query('rollback to savepoint tj_as'); await db.exec('reset role'); return { thrown: String(e.message).split('\n')[0] }; }
  finally { await db.query("select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true)"); }
}
const pin = (db, iso) => db.query("select set_config('hr.test_now', $1, true)", [iso]);
const clear = (db) => db.query('delete from public.hr_rate_counters');
const sweep = async (db) => { await clear(db); return one(db, 'select public.hr_trade_jobs_sweep(50)'); };
const start = async (db, uid, recipe, count, fee, key = idem(), slot = 0) => {
  await clear(db);
  return as(db, uid, 'select public.hr_trade_job_start($1, $2, $3, $4::bigint, $5::uuid) as r', [slot, recipe, count, fee, key]);
};
const end = async (db, uid, early, slot = 0) => { await clear(db); return as(db, uid, 'select public.hr_trade_job_end($1, $2, $3::uuid) as r', [slot, early, idem()]); };
const quote = (db, uid, recipe, count, slot = 0) => one(db, 'select public.hr_trade_job_quote($1, $2, $3, $4)', [uid, slot, recipe, count]);
const section = (db, uid, slot = 0) => one(db, 'select public.hr_trade_jobs_view($1, $2)', [uid, slot]);
const openJob = async (db, uid, slot = 0) => (await q(db, 'select * from public.trade_jobs where user_id = $1 and slot = $2 and settled_at is null', [uid, slot]))[0] || null;
const bank = async (db, uid, item) => Number((await one(db, 'select qty::text from public.account_bank where user_id = $1 and item_id = $2', [uid, item])) || 0);
const stockOf = async (db, uid, item, qual) => Number((await one(db, 'select qty::text from public.company_stock where user_id = $1 and item_id = $2 and quality = $3', [uid, item, qual])) || 0);
const tradeXp = async (db, uid, trade) => Number((await one(db, 'select xp::text from public.company_trade_xp where user_id = $1 and trade_id = $2', [uid, trade])) || 0);
const setBank = (db, uid, item, n) => (n > 0
  ? db.query('insert into public.account_bank as b (user_id, item_id, qty) values ($1, $2, $3) on conflict (user_id, item_id) do update set qty = excluded.qty', [uid, item, n])
  : db.query('delete from public.account_bank where user_id = $1 and item_id = $2', [uid, item]));
const setPurse = (db, uid, g) => db.query(`insert into public.account_wallet as w (user_id, gold) values ($1, $2)
  on conflict (user_id) do update set gold = excluded.gold, version = w.version + 1, updated_at = now()`, [uid, g]);
const purse = async (db, uid) => Number(await one(db, 'select gold::text from public.account_wallet where user_id = $1', [uid]));
const lit = (db, on = true) => db.query("update public.hr_flags set enabled = $1 where key = 'trade_jobs'", [on]);
const freshDay = (db, uid, slot = 0) => db.query('update public.player_state set work_day = null, work_ms = 0 where user_id = $1 and slot = $2', [uid, slot]);

async function makeHero(db, uid = null, slot = 0) {
  const u = uid || nextUid();
  if (!uid) {
    await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [u]);
    await db.query('insert into public.profiles (id, display_name) values ($1, $2) on conflict (id) do update set display_name = excluded.display_name', [u, 'Maker ' + seq]);
  }
  const n = seq * 7 + slot;
  const name = 'Maker' + String.fromCharCode(97 + (n % 26)) + String.fromCharCode(97 + Math.floor(n / 26) % 26) + String.fromCharCode(97 + slot);
  await clear(db);
  const h = await as(db, u, 'select public.hr_create_hero($1, $2, $3::jsonb, $4::uuid)', [slot, name, COLORS, idem()]);
  if (!h || h.ok !== true) throw Object.assign(new Error('hr_create_hero refused: ' + js(h)), { harness: true });
  await db.query('update public.player_state set premium_until = null where user_id = $1', [u]);
  await freshDay(db, u, slot);
  return u;
}

/* A real viewed CharacterSession: every rpc is the real verb as `authenticated`; hr_load calls are counted. */
function viewedClient(db, uid, slot = 0) {
  const calls = [];
  const server = {
    rpc: async (name, args) => {
      calls.push(name);
      await clear(db);
      const keys = Object.keys(args);
      const body = await as(db, uid, `select public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`,
        keys.map((k) => (args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k])));
      return { ok: true, status: 200, body, closed: false };
    },
    accrue: async () => ({ ok: false, status: 0, error: 'network' }),
  };
  const cs = new CharacterSession({ slot, uid, server, viewed: true, setTimer: () => 0, clearTimer: () => {}, now: () => Date.now() });
  return { cs, calls, account: { server } };
}
async function loadClient(db, c, uid, slot = 0) {
  await clear(db);
  const env = await as(db, uid, 'select public.hr_state_of($1, $2) as r', [uid, slot]);
  await c.cs.load(env);
}

/* The goods a settled job landed, from the server's rows (Storage is the face's Plain; company_stock its Fine and Master). */
async function landed(db, uid, job) {
  const r = (await q(db, 'select result, end_reason from public.trade_jobs where id = $1', [job.id]))[0];
  return { end: r && r.end_reason, result: r && r.result, plain: await bank(db, uid, job.face), fine: await stockOf(db, uid, job.face, 1),
    master: await stockOf(db, uid, job.face, 2), xp: await tradeXp(db, uid, job.trade),
    work: (await q(db, 'select work_day::text as d, work_ms::text as ms from public.player_state where user_id = $1 and slot = 0', [uid]))[0] };
}
/* What settleJob says the job lands, at its true end (its count's time, or the day's stop). */
function expected(job, elapsedMs) {
  return T.settleJob(CAT.kinds[job.kind], job.rung, job.level, { count: job.count, elapsedMs, seed: Number(job.seed) });
}
/* The job's true end on the server: its count's time, cut by the day's stop from its start (the twin's own reading). */
async function trueEnd(db, job) {
  const stop = msOf(await one(db, 'select public.hr_trade_work_stop($1, $2, $3::timestamptz)::text', [job.user_id, job.slot, job.started_at]));
  const b = T.jobBound(CAT.kinds[job.kind], job.rung, job.level, { count: job.count, elapsedMs: 1e12 });
  return Math.min(new Date(job.started_at).getTime() + b.spentMs, stop);
}

const ARMS = {
  async 'TJ-DATA'(db) {
    const p = [];
    const rows = await q(db, 'select recipe, kind, trade, band, rung, r_level, face, inputs, imbue from public.hr_trade_recipes order by recipe');
    if (rows.length !== RECIPES.length) p.push('the server holds ' + rows.length + ' recipes, jobRecipes ' + RECIPES.length);
    for (const r of RECIPES) {
      const s = rows.find((x) => x.recipe === r.id);
      if (!s || s.kind !== r.kind || s.trade !== r.trade || s.band !== r.band || s.rung !== r.rung || s.r_level !== r.R || s.face !== r.face
          || js(Object.entries(s.inputs).sort()) !== js(Object.entries(r.inputs).sort())) p.push(r.id + ' is ' + js(s) + ' on the server, ' + js(r) + ' in JS');
      for (const id of [r.face, ...Object.keys(r.inputs)]) {
        if (!ITEMS[id]) p.push(r.id + ': ' + id + ' is no ITEMS row');
        if (!(await one(db, 'select count(*)::int from public.hr_items where item_id = $1', [id]))) p.push(r.id + ': ' + id + ' is no hr_items row');
      }
      if (r.imbue) {
        const want = imbueRecipe(r.imbue);
        const part = Object.keys(want.inputs)[0];
        const rem = Object.keys(r.inputs).find((k) => k !== part);
        if (r.inputs[part] !== want.inputs[part] || r.inputs[rem] !== want.remains || r.band !== T.bandOf(want.band) || r.face !== want.item) {
          p.push(r.id + ' takes ' + js(r.inputs) + ' at band ' + r.band + '; imbueRecipe says ' + js(want));
        }
      }
    }
    for (const [g, d] of Object.entries(DANGER_GROUNDS)) {
      const b = await one(db, 'select band from public.hr_trade_ground_bands where hunt_id = $1', [g]);
      if (b !== Math.floor(d.gearLevel / GEAR_STEPS.tierSteps)) p.push(g + ' is band ' + b + ' on the server');
    }
    return p;
  },

  async 'TJ-TWIN'(db) {
    const p = [];
    /* mulberry32's draws, a run from a spread of seeds */
    for (const seed of [0, 1, 7, 2147483647, 2147483648, 4294967295, 123456789]) {
      const next = mulberry32(seed);
      let a = seed >>> 0;
      for (let i = 0; i < 300; i++) {
        a = (a + 0x6D2B79F5) % 4294967296;
        const u = next();
        const s = Number(await one(db, 'select public.hr_trade_mulberry($1::bigint)::text', [a]));
        if (s !== u) { p.push('draw ' + i + ' from seed ' + seed + ' is ' + s + ' in SQL, ' + u + ' in JS'); break; }
      }
    }
    /* the roll: every recipe, Levels across its window, times from nothing to a long day, seeds across the range */
    let n = 0;
    for (const r of RECIPES) {
      const k = CAT.kinds[r.kind];
      for (const L of [r.R, r.R + 7, Math.min(99, r.R + 30)]) for (const elapsedMs of [0, 3 * MIN, 5 * HOUR + 17, 16 * HOUR]) {
        for (const seed of [3, 2654435761, 4000000000]) {
          const js0 = T.settleJob(k, r.rung, L, { count: 400, elapsedMs, seed });
          const s = await one(db, 'select public.hr_trade_roll($1, $2, $3, false, 0, 1000, 400, $4::bigint, $5::bigint)', [r.kind, r.rung, L, elapsedMs, seed]);
          n++;
          if (!s || s.attempts !== js0.attempts || s.plain !== js0.plain || s.fine !== js0.fine || s.master !== js0.master || s.returned !== js0.returned
              || s.xp !== js0.xp || s.spent_ms !== js0.spentMs) { p.push(r.id + ' L' + L + ' ' + elapsedMs + ' ms seed ' + seed + ': SQL ' + js(s) + ' JS ' + js(js0)); break; }
        }
      }
    }
    /* Mastery and a bench (a yield over 1000: returned sets, and Master first). QUALITY IS DARK as shipped (09 4.11 row 6): the server's
       switch is 0 and every roll lands Plain; the lit cascade is pinned with the switch lit in this arm's rolled-back transaction */
    if (Number(await one(db, 'select quality_live from public.hr_trade_levers')) !== 0) p.push('the server ships the quality switch lit');
    for (const lit of [false, true]) {
      await db.query('update public.hr_trade_levers set quality_live = $1', [lit ? 1 : 0]);
      for (const kind of ['arrow', 'meal', 'ore', 'imbuement']) for (const seed of [11, 99]) {
        const js0 = T.settleJob(CAT.kinds[kind], 1, 60, { mastery: true, benchPm: 100, count: 300, elapsedMs: 9 * HOUR, seed, quality: lit });
        const s = await one(db, 'select public.hr_trade_roll($1, 1, 60, true, 100, 1000, 300, $2::bigint, $3::bigint)', [kind, 9 * HOUR, seed]);
        if (!s || s.plain !== js0.plain || s.fine !== js0.fine || s.master !== js0.master || s.returned !== js0.returned) p.push(kind + ' with the Mastery, quality ' + (lit ? 'lit' : 'dark') + ': SQL ' + js(s) + ' JS ' + js(js0));
        if (!lit && s && (s.fine || s.master)) p.push(kind + ' rolls ' + s.fine + ' Fine and ' + s.master + ' Master with quality dark');
      }
    }
    await db.query('update public.hr_trade_levers set quality_live = 0');
    /* bandRung */
    for (const k of Object.values(CAT.kinds)) for (let band = 0; band <= 12; band++) {
      const s = await one(db, 'select public.hr_trade_band_rung($1, $2)', [k.id, band]);
      if (s !== T.bandRung(k, band)) { p.push(k.id + ' band ' + band + ': rung ' + s + ' in SQL, ' + T.bandRung(k, band) + ' in JS'); break; }
    }
    /* workStopMs over the hero's day states and times of day (the server's base and bought work, read the way the engine reads them) */
    const u = await makeHero(db);
    const today = msOf(at('00:00'));
    for (const hhmm of ['00:00', '06:30', '10:00', '17:59', '20:00', '23:59']) {
      await pin(db, at(hhmm));
      for (const [day, used] of [[null, 0], [DAY, 0], [DAY, 3 * HOUR], [DAY, 8 * HOUR], [new Date(today - DAY_MS).toISOString().slice(0, 10), 5 * HOUR]]) {
        await db.query('update public.player_state set work_day = $2::date, work_ms = $3 where user_id = $1 and slot = 0', [u, day, used]);
        const w = await one(db, 'select public.hr_work_state($1, 0)', [u]);
        const from = msOf(at(hhmm));
        const want = workStopMs({ dayMs: day ? msOf(day + 'T00:00:00Z') : today, usedMs: day ? used : 0, baseMs: w.base_ms, extraMs: w.extra_ms, todayMs: today }, from);
        const got = msOf(await one(db, 'select public.hr_trade_work_stop($1, 0, $2::timestamptz)::text', [u, new Date(from).toISOString()]));
        if (got !== want) p.push('the stop from ' + hhmm + ' with day ' + day + ' used ' + used + ' is ' + new Date(got).toISOString() + ' in SQL, ' + new Date(want).toISOString() + ' in JS');
      }
    }
    /* and with bought work in today's cap (one block: the stop moves by it today, not tomorrow) */
    await pin(db, at('10:00'));
    await db.query('update public.player_state set work_day = $2::date, work_ms = $3 where user_id = $1 and slot = 0', [u, DAY, 8 * HOUR]);
    await setPurse(db, u, 500000000);
    await clear(db);
    const wq = await one(db, "select public.hr_time_quote($1, 0, 'work')", [u]);
    const buy = wq && wq.available ? await as(db, u, "select public.hr_time_buy('work', 0, $1::bigint, $2::uuid) as r", [wq.price, idem()]) : null;
    if (!buy || buy.ok !== true) p.push('no work block to test the stop with: ' + js(wq) + ' ' + js(buy));
    const wb = await one(db, 'select public.hr_work_state($1, 0)', [u]);
    if (!(wb.extra_ms > 0)) p.push('the bought block is not in the day: ' + js(wb));
    for (const hhmm of ['10:00', '21:00']) {
      const from = msOf(at(hhmm));
      const want = workStopMs({ dayMs: today, usedMs: 8 * HOUR, baseMs: wb.base_ms, extraMs: wb.extra_ms, todayMs: today }, from);
      const got = msOf(await one(db, 'select public.hr_trade_work_stop($1, 0, $2::timestamptz)::text', [u, new Date(from).toISOString()]));
      if (got !== want) p.push('with a bought block the stop from ' + hhmm + ' is ' + new Date(got).toISOString() + ' in SQL, ' + new Date(want).toISOString() + ' in JS');
    }
    if (n < 500) p.push('the roll was swept at ' + n + ' points, under 500');
    return p;
  },

  async 'TJ-ORDER'(db) {
    const p = [];
    await pin(db, at('10:00'));
    const u = await makeHero(db);
    await setPurse(db, u, 50000000);
    /* THE CUT LIGHTS IT (1079-one-town-work-cut.sql's last statement, 09 4.17): the replayed chain ends lit; the dark arm turns it off */
    if ((await one(db, "select enabled::text from public.hr_flags where key = 'trade_jobs'")) !== 'true') p.push('the chain end leaves trade_jobs dark: the cut did not light it');
    await lit(db, false);
    const dark = await start(db, u, 'meal_b0', 1, 0);
    if (!dark || dark.error !== 'not_open' || (await section(db, u)) !== null) p.push('dark: the start answered ' + js(dark) + ' and the section ' + js(await section(db, u)));
    await lit(db);
    const g0 = await purse(db, u);
    const ledger0 = Number(await one(db, 'select count(*)::text from public.player_ledger where user_id = $1', [u]));
    const want = (got, code, w) => { if (!got || got.error !== code) p.push(w + ' answered ' + js(got) + ', want ' + code); };
    want(await start(db, u, 'meal_b77', 1, 0), 'bad_recipe', 'no such recipe');
    await db.query("update public.player_state set active_kind = 'gather', active_id = (select activity_id from public.hr_activities where kind = 'gather' order by 1 limit 1) where user_id = $1 and slot = 0", [u]);
    want(await start(db, u, 'meal_b0', 1, 0), 'busy', 'a gathering hero');
    await db.query("update public.player_state set active_kind = 'idle', active_id = null where user_id = $1 and slot = 0", [u]);
    want(await start(db, u, 'temper_kit_b1', 1, 1), 'rung_locked', 'Smithing 1 on the Iron salts');
    await db.query("insert into public.company_trade_xp (user_id, trade_id, xp) values ($1, 'smithing', (select xp from public.hr_trade_xp where level = 21))", [u]);
    await db.query('delete from public.hunt_density where user_id = $1', [u]);
    want(await start(db, u, 'temper_kit_b1', 1, 1), 'band_locked', 'band 1 with no depth record');
    await db.query('update public.player_state set work_day = $2::date, work_ms = $3 where user_id = $1 and slot = 0', [u, DAY, 8 * HOUR]);
    want(await start(db, u, 'meal_b0', 1, 0), 'work_cap', 'a used day');
    await freshDay(db, u);
    const cap = (await quote(db, u, 'meal_b0', null)).count_cap;
    want(await start(db, u, 'meal_b0', cap + 1, 0), 'count_cap', 'one past the day');
    const fee = Number((await quote(db, u, 'meal_b0', 3)).fee);
    want(await start(db, u, 'meal_b0', 3, fee + 1), 'quote_changed', 'a wrong fee');
    await db.query("delete from public.player_inventory where user_id = $1 and item_id = 'shrimp'", [u]);
    await setBank(db, u, 'shrimp', 2);
    want(await start(db, u, 'meal_b0', 3, fee), 'short_inputs', 'two shrimp for three');
    if (await purse(db, u) !== g0 || Number(await one(db, 'select count(*)::text from public.player_ledger where user_id = $1', [u])) !== ledger0
        || await openJob(db, u) || await bank(db, u, 'shrimp') !== 2) p.push('a refusal moved something');
    return p;
  },

  async 'TJ-BOTH'(db) {
    const p = [];
    await lit(db);
    for (const plan of [
      { recipe: 'meal_b0', at: '06:00', name: 'a whole-count Cook Shrimp' },
      /* a band 2 imbuement, started with 1 h of the day left, a count the day cannot reach: the day ends it (work_cap) */
      { recipe: 'imbuement_fire_ward', at: '09:00', used: 7 * HOUR, depth: 'hasks_ford', xp: { artificing: 0 }, name: 'a band 2 imbuement the day cuts short' },
    ]) {
      await pin(db, at(plan.at));
      const u = await makeHero(db);
      await setPurse(db, u, 50000000);
      if (plan.used) await db.query('update public.player_state set work_day = $2::date, work_ms = $3 where user_id = $1 and slot = 0', [u, DAY, plan.used]);
      if (plan.depth) await db.query('insert into public.hunt_density (user_id, slot, hunt_id, density, danger_held) values ($1, 0, $2, 1, 10) on conflict (user_id, slot, hunt_id) do update set danger_held = 10', [u, plan.depth]);
      const r = RECIPES.find((x) => x.id === plan.recipe);
      for (const [item, per] of Object.entries(r.inputs)) await setBank(db, u, item, per * 400);
      /* THE PRESS: the window's quote, one RPC, its answer the envelope */
      const c = viewedClient(db, u);
      await loadClient(db, c, u);
      const row = (tradeJobsOf(c.cs) || { recipes: [] }).recipes.find((x) => x.id === plan.recipe);
      if (!row || !row.quote || !row.quote.ok) { p.push(plan.name + ': the section offers ' + js(row)); continue; }
      const calls0 = c.calls.length;
      const ans = await startTradeJob(c.account, c.cs, row.id, row.quote.count, row.quote.fee);
      if (!ans.ok || c.calls.slice(calls0).join() !== 'hr_trade_job_start') { p.push(plan.name + ': the start answered ' + js(ans) + ' with calls ' + c.calls.slice(calls0)); continue; }
      const seen = tradeJobsOf(c.cs);
      if (!seen || !seen.job || seen.job.recipe !== plan.recipe) p.push(plan.name + ': the answer\'s envelope shows ' + js(seen && seen.job));
      const job = await openJob(db, u);
      const endMs = await trueEnd(db, job);
      const want = expected(job, endMs - new Date(job.started_at).getTime());
      await db.query('savepoint tj_door');
      /* (a) VIEWED: the window's Collect at the end */
      await pin(db, new Date(endMs).toISOString());
      const got = await endTradeJob(c.account, c.cs, false);
      const a = await landed(db, u, job);
      const last = tradeJobsOf(c.cs) && tradeJobsOf(c.cs).last;
      await db.query('rollback to savepoint tj_door');
      /* (b) CLOSED: nothing from the browser; the server's sweep half an hour after the end */
      await pin(db, new Date(endMs + 30 * MIN).toISOString());
      const sw = await sweep(db);
      const b = await landed(db, u, job);
      await db.query('release savepoint tj_door');
      if (!got.ok) p.push(plan.name + ': the viewed Collect answered ' + js(got));
      if (!sw || sw.settled !== 1) p.push(plan.name + ': the sweep answered ' + js(sw));
      for (const [door, x] of [['viewed', a], ['closed', b]]) {
        if (x.plain !== want.plain || x.fine !== want.fine || x.master !== want.master || x.xp !== want.xp || x.result.attempts !== want.attempts) {
          p.push(plan.name + ', ' + door + ': landed ' + js(x) + ', settleJob on the seed says ' + js(want));
        }
      }
      if (js(a) !== js(b)) p.push(plan.name + ': the doors differ: viewed ' + js(a) + ', closed ' + js(b));
      if (plan.used && (a.end !== 'work_cap' || a.result.refunded !== job.count - want.attempts || a.work.ms !== String(8 * HOUR))) {
        p.push(plan.name + ': the day did not end it: ' + js(a));
      }
      if (!plan.used && a.end !== 'done') p.push(plan.name + ': ended ' + a.end);
      if (!last || last.attempts !== want.attempts || last.plain !== want.plain) p.push(plan.name + ': the window\'s last job reads ' + js(last));
    }
    return p;
  },

  async 'TJ-STOP'(db) {
    const p = [];
    await lit(db);
    await pin(db, at('10:00'));
    const u = await makeHero(db);
    await setPurse(db, u, 50000000);
    await setBank(db, u, 'shrimp', 500);
    await db.query("delete from public.player_inventory where user_id = $1 and item_id = 'shrimp'", [u]);
    const qd = await quote(db, u, 'meal_b0', null);
    const count = Number(qd.count_cap);
    const fee = Number((await quote(db, u, 'meal_b0', count)).fee);
    const g0 = await purse(db, u);
    const s1 = await start(db, u, 'meal_b0', count, fee);
    if (!s1 || s1.ok !== true || 'seed' in (s1.job || {})) p.push('the start answered ' + js(s1 && (s1.error || s1.job)));
    const job = await openJob(db, u);
    await pin(db, new Date(new Date(job.started_at).getTime() + HOUR).toISOString());
    const stop = await end(db, u, true);
    const want = expected(job, HOUR);
    if (!stop || stop.ok !== true || stop.end !== 'stop' || stop.attempts !== want.attempts || stop.plain !== want.plain || stop.fine !== want.fine
        || stop.refunded !== count - want.attempts) p.push('the stop answered ' + js(stop) + ', settleJob at 1 h says ' + js(want));
    if (await bank(db, u, 'shrimp') !== 500 - want.attempts) p.push('Storage holds ' + (await bank(db, u, 'shrimp')) + ' shrimp, want ' + (500 - want.attempts));
    const refund = await q(db, "select qty::int as n from public.player_ledger where user_id = $1 and meta->>'reason' = 'trade_refund' and meta->>'job' = $2", [u, job.id]);
    if (refund.length !== 1 || refund[0].n !== count - want.attempts) p.push('the refund row is ' + js(refund));
    /* THE FEE OF EVERY SET NEVER ATTEMPTED comes back (09 4.11 row 5): fee - ceil(fee x attempted / count), one credit, journalled */
    const feeBack = fee - Math.ceil((fee * want.attempts) / count);
    const feeRows = await q(db, "select gold::text as g from public.player_ledger where user_id = $1 and meta->>'reason' = 'trade_fee_refund' and meta->>'job' = $2", [u, job.id]);
    if (!(feeBack > 0) || stop.fee_refund !== feeBack || feeRows.length !== 1 || Number(feeRows[0].g) !== feeBack) p.push('the stop gave back ' + js(stop && stop.fee_refund) + ' (rows ' + js(feeRows) + '), want ' + feeBack + ' of ' + fee);
    if (await purse(db, u) !== g0 - fee + feeBack) p.push('the purse reads ' + (await purse(db, u)) + ' after a stop, want ' + (g0 - fee + feeBack) + ' (only the attempted sets keep their fee)');
    const s2 = await start(db, u, 'meal_b0', 3, Number((await quote(db, u, 'meal_b0', 3)).fee));
    const job2 = await openJob(db, u);
    if (!s2 || s2.ok !== true || !job2 || job2.id === job.id || String(job2.seed) === String(job.seed)) p.push('the restart is ' + js(job2 && { id: job2.id }) + ': not a new job with a new seed');
    return p;
  },

  async 'TJ-DAY'(db) {
    const p = [];
    await lit(db);
    await pin(db, at('10:00'));
    const u = await makeHero(db);
    await setPurse(db, u, 500000000);
    await setBank(db, u, 'shrimp', 1000);
    await db.query('update public.player_state set work_day = $2::date, work_ms = $3 where user_id = $1 and slot = 0', [u, DAY, 6 * HOUR]);
    const count = Number((await quote(db, u, 'meal_b0', null)).count_cap);
    const s1 = await start(db, u, 'meal_b0', count, Number((await quote(db, u, 'meal_b0', count)).fee));
    if (!s1 || s1.ok !== true) { p.push('the start answered ' + js(s1)); return p; }
    const job = await openJob(db, u);
    if (new Date(job.ends_at).getTime() !== msOf(at('12:00'))) p.push('a job with 2 h of the day left ends at ' + job.ends_at);
    /* a work block bought under it: its end moves, so the sweep at the old end finds it not due */
    await clear(db);
    const wq = await one(db, "select public.hr_time_quote($1, 0, 'work')", [u]);
    const buy = wq && wq.available ? await as(db, u, "select public.hr_time_buy('work', 0, $1::bigint, $2::uuid) as r", [wq.price, idem()]) : null;
    if (!buy || buy.ok !== true) { p.push('the work block could not be bought: ' + js(wq) + ' ' + js(buy)); return p; }
    await pin(db, at('12:00'));
    const early = await sweep(db);
    const still = await openJob(db, u);
    if (!early || early.settled !== 0 || !still || new Date(still.ends_at).getTime() <= msOf(at('12:00'))) {
      p.push('the sweep at the old end answered ' + js(early) + ', the job ' + js(still && still.ends_at));
      return p;
    }
    const endMs = await trueEnd(db, still);
    await pin(db, new Date(endMs + MIN).toISOString());
    await sweep(db);
    const got = await landed(db, u, job);
    const want = expected(job, endMs - new Date(job.started_at).getTime());
    if (got.result.attempts !== want.attempts || got.plain !== want.plain) p.push('the lengthened job landed ' + js(got) + ', settleJob says ' + js(want));
    if (got.end !== (endMs < msOf(at('14:00')) ? 'done' : 'work_cap')) p.push('the lengthened job ended ' + got.end);
    /* a job the day's cap ends gives back the fee of its unattempted sets too (the fee is the sink on goods made, 09 4.11 row 5) */
    const fee = Number(job.fee), feeBack = fee - Math.ceil((fee * want.attempts) / job.count);
    const feeRow = await one(db, "select coalesce(sum(gold), 0)::text from public.player_ledger where user_id = $1 and meta->>'reason' = 'trade_fee_refund' and meta->>'job' = $2", [u, job.id]);
    if (got.end === 'work_cap' && (!(feeBack > 0) || Number(feeRow) !== feeBack || got.result.fee_refund !== feeBack)) p.push('the day\'s cap gave back ' + feeRow + ' of the fee, want ' + feeBack);
    /* the day spent: the 6 h before it and the job's own span (to the bought block's end, 14:00) */
    const spent = 6 * HOUR + (endMs - new Date(job.started_at).getTime());
    if (got.work.d !== DAY || got.work.ms !== String(spent)) p.push('the work day reads ' + js(got.work) + ', want ' + spent + ' ms on ' + DAY);
    return p;
  },

  /* THE STANDING WORK RULE BUYS FOR A RUNNING JOB (09 4.11 row 7), with nothing awake but the server: the hero sets the rule (its one
     client verb), starts a whole day's job on the day's last minutes, and the cron's own sweep buys the block; the job's end moves out by
     the block and the job then lands the bought time's attempts. With no job the rule buys nothing (not working) */
  async 'TJ-RULE'(db) {
    const p = [];
    await lit(db);
    await pin(db, at('10:00'));
    const u = await makeHero(db);
    await setPurse(db, u, 500000000);
    await setBank(db, u, 'shrimp', 2000);
    const lead = Number(await one(db, "select lead_min::bigint * 60000 from public.hr_time_blocks where kind = 'work'"));
    const block = Number(await one(db, "select block_min::bigint * 60000 from public.hr_time_blocks where kind = 'work'"));
    const base = Number((await one(db, 'select public.hr_work_state($1, 0)', [u])).base_ms);
    await db.query('update public.player_state set work_day = $2::date, work_ms = $3 where user_id = $1 and slot = 0', [u, DAY, base - lead / 2]);
    await clear(db);
    const set = await as(db, u, "select public.hr_time_auto_set('work', 0, 1, null, $1::uuid) as r", [idem()]);
    if (!set || set.ok !== true) { p.push('the rule could not be set: ' + js(set)); return p; }
    const autoRows = async () => Number(await one(db, "select count(*)::text from public.player_ledger where user_id = $1 and intent like 'time\\_buy:work:%' and meta->>'auto' = 'true'", [u]));
    await one(db, 'select public.hr_time_auto_sweep(50)');
    if (await autoRows() !== 0) p.push('the rule bought a block for a hero with no job');
    const count = Number((await quote(db, u, 'meal_b0', null)).count_cap);
    const s1 = await start(db, u, 'meal_b0', count, Number((await quote(db, u, 'meal_b0', count)).fee));
    if (!s1 || s1.ok !== true) { p.push('the start answered ' + js(s1)); return p; }
    const job = await openJob(db, u);
    const end0 = new Date(job.ends_at).getTime();
    if (end0 !== msOf(at('10:00')) + lead / 2) p.push('a whole day\'s job on the day\'s last ' + lead / 2 / MIN + ' minutes ends at ' + job.ends_at);
    const sw = await one(db, 'select public.hr_time_auto_sweep(50)');
    if (!sw || sw.bought !== 1 || await autoRows() !== 1) { p.push('the cron\'s sweep did not buy for the running job: ' + js(sw)); return p; }
    /* the server's own reading of the job (the section the Work window paints) has the block's end */
    const sec = await section(db, u);
    const end1 = sec && sec.job ? new Date(sec.job.ends_at).getTime() : 0;
    if (end1 !== end0 + block) p.push('after the bought block the job ends at ' + js(sec && sec.job && sec.job.ends_at) + ', want ' + new Date(end0 + block).toISOString());
    /* the rule's count is spent: the next minute buys nothing more */
    await one(db, 'select public.hr_time_auto_sweep(50)');
    if (await autoRows() !== 1) p.push('a rule of one bought a second block');
    /* the browser closed through the bought time: the trade sweep lands the job at its new end, the bought time's attempts included */
    await pin(db, new Date(end1 + MIN).toISOString());
    await sweep(db);
    const got = await landed(db, u, job);
    const want = expected(job, end1 - new Date(job.started_at).getTime());
    if (!got.result || got.result.attempts !== want.attempts || got.plain !== want.plain || got.end !== 'work_cap') p.push('the job landed ' + js(got.result) + ', settleJob through the bought block says ' + js(want));
    return p;
  },

  /* THE UTC MIDNIGHT (lane/k1-server-fixes). (1) 1073's own §9 self-check, run on the server clock pinned at the instants of the day
     that decide its answers: it must complete at every one, so a real apply is never refused by the hour it runs. 23:59:58 is the
     rehearsal's red (45958061052: the job's day ends before its last minutes of work, so it runs on into the next UTC day and wants no
     block); 21:52 is the second hour the old check read wrong (today can still use a whole block, so the rule buys it). (2) A JOB KEEPS
     ITS OWN DAY'S BOUGHT BLOCKS AFTER MIDNIGHT: read on the next UTC day (the sweep, a Collect, the section), its stop is the day it
     started on, that day's blocks included, the same as before midnight; both doors land the bought time's attempts */
  async 'TJ-MIDNIGHT'(db) {
    const p = [];
    const text = readFileSync(join(ROOT, 'supabase', 'migrations', '1073-k1-job-slice.sql'), 'utf8').replace(/\r/g, '');
    const s9 = text.indexOf('-- ── §9 SELF-CHECK');
    const from = s9 < 0 ? -1 : text.indexOf('\ndo $$', s9);
    const to = text.lastIndexOf('end $$;');
    if (from < 0 || to < from) throw Object.assign(new Error('the §9 self-check block is not found in 1073-k1-job-slice.sql'), { harness: true });
    const check = text.slice(from + 1, to + 'end $$;'.length);
    for (const t of ['23:59:58', '23:56:00', '21:52:00', '22:30:00', '10:00:00', '00:00:02']) {
      await db.query('savepoint tj_s9');
      await pin(db, DAY + 'T' + t + 'Z');
      try { await db.exec(check); } catch (e) { p.push('1073\'s §9 self-check run at ' + t + ' UTC raised: ' + String(e.message).split('\n')[0].slice(0, 300)); }
      await db.query('rollback to savepoint tj_s9');
    }
    await lit(db);
    const next = new Date(msOf(DAY + 'T00:00:00Z') + DAY_MS).toISOString().slice(0, 10);
    const buyBlock = async (u) => {
      await clear(db);
      const wq = await one(db, "select public.hr_time_quote($1, 0, 'work')", [u]);
      const buy = wq && wq.available ? await as(db, u, "select public.hr_time_buy('work', 0, $1::bigint, $2::uuid) as r", [wq.price, idem()]) : null;
      return buy && buy.ok === true ? null : js(wq) + ' ' + js(buy);
    };
    for (const plan of [
      /* a block bought in the morning, a whole day's job started at 15:00: midnight comes before the day's 10 h (8 free and the
         block) are used, so the job runs on into the next UTC day's fresh cap and its whole count fits */
      { name: 'a job the morning\'s block carries past midnight', buyAt: '09:00', startAt: '15:00', used: 0, seen: [next + 'T00:30:00Z'] },
      /* the day used past its free hours, a block bought at the start: the day's cap ends the job an hour later, and the sweep is
         busy until after midnight; the next day's first block, bought before the collect, is that day's and never reaches back */
      { name: 'a job its block ran to 20:00, collected after midnight', buyAt: '19:00', startAt: '19:00', used: 9 * HOUR, seen: [], late: next + 'T00:10:00Z', nextBlock: true },
    ]) {
      await pin(db, at(plan.buyAt));
      const u = await makeHero(db);
      await setPurse(db, u, 500000000);
      await setBank(db, u, 'shrimp', 2000);
      if (plan.used) await db.query('update public.player_state set work_day = $2::date, work_ms = $3 where user_id = $1 and slot = 0', [u, DAY, plan.used]);
      const why = await buyBlock(u);
      if (why) { p.push(plan.name + ': no work block to buy: ' + why); continue; }
      await pin(db, at(plan.startAt));
      const count = Number((await quote(db, u, 'meal_b0', null)).count_cap);
      const s1 = await start(db, u, 'meal_b0', count, Number((await quote(db, u, 'meal_b0', count)).fee));
      if (!s1 || s1.ok !== true) { p.push(plan.name + ': the start answered ' + js(s1)); continue; }
      const job = await openJob(db, u);
      const endMs = await trueEnd(db, job);
      const ends0 = new Date(job.ends_at).getTime();
      if (endMs !== ends0) p.push(plan.name + ': on its own day the job ends at ' + new Date(endMs).toISOString() + ', its row says ' + job.ends_at);
      if (!plan.used && !(endMs > msOf(next + 'T00:00:00Z'))) p.push(plan.name + ': the job ends at ' + new Date(endMs).toISOString() + ', not past midnight');
      /* the server's reading after midnight, before the end: the same end (the section the Work window paints) */
      for (const iso of plan.seen) {
        await pin(db, iso);
        const sec = await section(db, u);
        const e1 = sec && sec.job ? new Date(sec.job.ends_at).getTime() : 0;
        if (e1 !== ends0 || sec.job.due) p.push(plan.name + ': at ' + iso + ' the section says the job ends ' + js(sec && sec.job && sec.job.ends_at) + ' (due ' + js(sec && sec.job && sec.job.due) + '), before midnight ' + job.ends_at);
      }
      const want = expected(job, ends0 - new Date(job.started_at).getTime());
      const collectAt = plan.late || new Date(ends0 + 30 * MIN).toISOString();
      if (plan.nextBlock) {
        await pin(db, collectAt);
        const why2 = await buyBlock(u);
        if (why2) p.push(plan.name + ': the next day\'s block could not be bought: ' + why2);
      }
      await db.query('savepoint tj_mid');
      await pin(db, collectAt);
      const got = await end(db, u, false);
      const a = await landed(db, u, job);
      await db.query('rollback to savepoint tj_mid');
      await pin(db, collectAt);
      const sw = await sweep(db);
      const b = await landed(db, u, job);
      await db.query('release savepoint tj_mid');
      if (!got || got.ok !== true) p.push(plan.name + ': the Collect after midnight answered ' + js(got));
      if (!sw || sw.settled !== 1) p.push(plan.name + ': the sweep after midnight answered ' + js(sw));
      for (const [door, x] of [['viewed', a], ['closed', b]]) {
        if (!x.result || x.result.attempts !== want.attempts || x.plain !== want.plain || x.xp !== want.xp) {
          p.push(plan.name + ', ' + door + ': landed ' + js(x.result) + ', the job\'s own day (its bought block in it) says ' + js(want));
        }
      }
      if (js(a) !== js(b)) p.push(plan.name + ': the doors differ: viewed ' + js(a) + ', closed ' + js(b));
      if (plan.used && (!a.work || a.work.d !== DAY || a.work.ms !== String(plan.used + (ends0 - new Date(job.started_at).getTime())))) {
        p.push(plan.name + ': the work day reads ' + js(a.work) + ', want ' + (plan.used + ends0 - new Date(job.started_at).getTime()) + ' ms on ' + DAY);
      }
    }
    return p;
  },

  /* A BAND OPENS ON A DEPTH RECORD AT THAT BAND OR DEEPER (the designer, HANDOFFS 2026-11-27 designer-kit-band1 item 4): a company whose
     only record is band 3's starts a band 1 job and quotes a band 2 one; a company whose only record is band 1's is band_locked at 3 */
  async 'TJ-BAND'(db) {
    const p = [];
    await lit(db);
    await pin(db, at('10:00'));
    const deep = await one(db, 'select hunt_id from public.hr_trade_ground_bands where band = 3 order by hunt_id limit 1');
    const shallow = await one(db, 'select hunt_id from public.hr_trade_ground_bands where band = 1 order by hunt_id limit 1');
    if (!deep || !shallow) throw Object.assign(new Error('no band 1 or band 3 ground in hr_trade_ground_bands'), { harness: true });
    const record = (u, g) => db.query('insert into public.hunt_density (user_id, slot, hunt_id, density, danger_held) values ($1, 0, $2, 1, 10) on conflict (user_id, slot, hunt_id) do update set danger_held = 10', [u, g]);
    const open = async (u, b) => one(db, 'select public.hr_trade_band_open($1, $2)', [u, b]);
    const a = await makeHero(db);
    await setPurse(db, a, 50000000);
    await db.query('delete from public.hunt_density where user_id = $1', [a]);
    await record(a, deep);
    for (const [b, want] of [[0, true], [1, true], [2, true], [3, true], [4, false]]) {
      if (await open(a, b) !== want) p.push('a band 3 record ' + (want ? 'does not open' : 'opens') + ' band ' + b);
    }
    await db.query("insert into public.company_trade_xp (user_id, trade_id, xp) values ($1, 'mining', (select xp from public.hr_trade_xp where level = 11))", [a]);
    const q1 = await quote(db, a, 'ore_b1', 1);
    const s1 = q1 && q1.ok ? await start(db, a, 'ore_b1', 1, Number(q1.fee)) : q1;
    if (!s1 || s1.ok !== true || !(await openJob(db, a))) p.push('Mine Iron Ore (band 1) on a band 3 record answered ' + js(s1 && (s1.ok ? s1.job : s1)));
    const q2 = await quote(db, a, 'imbuement_fire_ward', 1);
    if (!q2 || q2.ok !== true) p.push('Make Fire Ward (band 2) on a band 3 record quotes ' + js(q2));
    const b = await makeHero(db);
    await setPurse(db, b, 50000000);
    await db.query('delete from public.hunt_density where user_id = $1', [b]);
    await record(b, shallow);
    if (await open(b, 1) !== true || await open(b, 2) !== false) p.push('a band 1 record opens band 1 ' + (await open(b, 1)) + ', band 2 ' + (await open(b, 2)));
    const s3 = await start(db, b, 'imbuement_fire_edge', 1, 1);
    if (!s3 || s3.error !== 'band_locked' || s3.band !== 3) p.push('Make Fire Edge (band 3) on a band 1 record answered ' + js(s3));
    return p;
  },

  async 'TJ-KEY'(db) {
    const p = [];
    await lit(db);
    await pin(db, at('10:00'));
    const u = await makeHero(db);
    await setPurse(db, u, 50000000);
    await setBank(db, u, 'shrimp', 50);
    const fee = Number((await quote(db, u, 'meal_b0', 5)).fee);
    const k = idem();
    const a = await start(db, u, 'meal_b0', 5, fee, k);
    const g = await purse(db, u);
    const b = await start(db, u, 'meal_b0', 5, fee, k);
    if (!a || a.ok !== true || !b || b.ok !== true || b.replayed !== true || !a.job || !b.job || a.job.id !== b.job.id) p.push('one key twice answered ' + js(a && a.job) + ' then ' + js(b));
    if (await purse(db, u) !== g || Number(await one(db, "select count(*)::text from public.player_ledger where user_id = $1 and meta->>'reason' = 'trade_fee'", [u])) !== 1) p.push('the key pressed again moved gold or wrote a second fee');
    const other = await start(db, u, 'meal_b0', 4, Number((await quote(db, u, 'meal_b0', 4)).fee), k);
    if (!other || other.error !== 'intent_mismatch') p.push('the key reused for another count answered ' + js(other));
    let thrown = null;
    await db.query('savepoint tj_guard');
    try { await db.query("update public.player_state set active_kind = 'combat', active_id = 'mill_cellar' where user_id = $1 and slot = 0", [u]); }
    catch (e) { thrown = String(e.message); }
    await db.query('rollback to savepoint tj_guard');
    if (!thrown || !/trade_job_open/.test(thrown)) p.push('the pointer left idle under an open job: ' + js(thrown));
    return p;
  },

  async 'TJ-SURFACE'(db) {
    const p = [];
    await lit(db);
    await pin(db, at('10:00'));
    const u = await makeHero(db);
    await setPurse(db, u, 50000000);
    await setBank(db, u, 'shrimp', 50);
    const fee = Number((await quote(db, u, 'meal_b0', 5)).fee);
    const s = await start(db, u, 'meal_b0', 5, fee);
    if (!s || s.ok !== true || 'seed' in (s.job || {}) || JSON.stringify((s.envelope || {}).trade_jobs || {}).includes('"seed"')) p.push('the start\'s answer carries the seed: ' + js(s && s.job));
    const sec = await section(db, u);
    if (!sec || JSON.stringify(sec).includes('"seed"') || !sec.job) p.push('the section carries the seed or no job: ' + js(sec && sec.job));
    for (const [w, sql] of [['anon start', "select public.hr_trade_job_start(0, 'meal_b0', 1, 0, gen_random_uuid())"], ['anon end', 'select public.hr_trade_job_end(0, false, gen_random_uuid())']]) {
      const r = await as(db, u, sql, [], 'anon');
      if (!r || !r.thrown || !/permission denied/.test(r.thrown)) p.push(w + ' reached the server: ' + js(r));
    }
    for (const [w, sql] of [['a client settle', 'select public.hr_trade_job_close($1, 0, now(), true)'], ['a client sweep', 'select public.hr_trade_jobs_sweep(5)'],
      ['a client roll', "select public.hr_trade_roll('meal', 1, 1, false, 0, 1000, 5, 3600000, 1)"], ['a client quote', "select public.hr_trade_job_quote($1, 0, 'meal_b0', 1)"]]) {
      const r = await as(db, u, sql, sql.includes('$1') ? [u] : [], 'authenticated');
      if (!r || !r.thrown || !/permission denied/.test(r.thrown)) p.push(w + ' reached the server: ' + js(r));
    }
    return p;
  },
};

async function runArms(db, only) {
  const out = {};
  for (const name of Object.keys(ARMS)) {
    if (only && !only.includes(name)) continue;
    try { out[name] = await H.inTx(db, () => ARMS[name](db)); } catch (e) { out[name] = [(e && e.harness ? 'harness: ' : 'threw: ') + String(e && e.message).slice(0, 400)]; }
  }
  return out;
}

/* SQL MUTANTS, planted in the live body (each anchor found exactly once), and the arm that must go red. */
const MUTANTS = [
  { arm: 'TJ-TWIN', name: 'the draw ORs 63 where mulberry32 ORs 61', fn: 'public.hr_trade_mulberry(bigint)',
    find: 'x := t # (t >> 7); y := t | 61;', repl: 'x := t # (t >> 7); y := t | 63;' },
  { arm: 'TJ-TWIN', name: 'the cascade calls a Fine roll Plain', fn: 'public.hr_trade_roll(text,integer,integer,boolean,integer,integer,integer,bigint,bigint)',
    find: 'if public.hr_trade_mulberry(v_a) < v_fine then v_fn := v_fn + 1; else v_plain := v_plain + 1; end if;',
    repl: 'if public.hr_trade_mulberry(v_a) < v_fine then v_plain := v_plain + 1; else v_plain := v_plain + 1; end if;' },
  { arm: 'TJ-TWIN', name: 'a gathering attempt over 1000 rolls its second unit at the whole yield', fn: 'public.hr_trade_roll(text,integer,integer,boolean,integer,integer,integer,bigint,bigint)',
    find: 'if public.hr_trade_mulberry(v_a) < (v_y - 1000)::float8 / 1000::float8 then', repl: 'if public.hr_trade_mulberry(v_a) < v_y::float8 / 1000::float8 then' },
  { arm: 'TJ-TWIN', name: 'the day\'s stop ignores bought work', fn: 'public.hr_trade_work_stop(uuid,integer,timestamp with time zone)',
    find: 'v_x0 := case when v_d0 = v_tms then v_extra when', repl: 'v_x0 := case when v_d0 = v_tms then 0 when' },
  { arm: 'TJ-MIDNIGHT', name: 'a job read after midnight forgets the blocks bought on its own day', fn: 'public.hr_trade_work_stop(uuid,integer,timestamp with time zone)',
    find: 'v_x0 := case when v_d0 = v_tms then v_extra when v_d0 > v_tms or v_block is null then 0', repl: 'v_x0 := case when v_d0 = v_tms then v_extra when true then 0' },
  { arm: 'TJ-MIDNIGHT', name: 'a past day\'s blocks are counted up to now, not to its own midnight', fn: 'public.hr_trade_work_stop(uuid,integer,timestamp with time zone)',
    find: "and l.at < timestamptz '1970-01-01 00:00:00+00' + v_mid * interval '1 millisecond') end;", repl: ') end;' },
  { arm: 'TJ-BAND', name: 'a band opens only on a record at exactly that band', fn: 'public.hr_trade_band_open(uuid,integer)',
    find: 'd.danger_held is not null and g.band >= p_band);', repl: 'd.danger_held is not null and g.band = p_band);' },
  { arm: 'TJ-BAND', name: 'a record opens the bands deeper than it', fn: 'public.hr_trade_band_open(uuid,integer)',
    find: 'd.danger_held is not null and g.band >= p_band);', repl: 'd.danger_held is not null and g.band <= p_band);' },
  { arm: 'TJ-ORDER', name: 'a gathering hero is not busy', fn: 'public.hr_trade_job_start(integer,text,integer,bigint,uuid)',
    find: "if v_st.active_kind <> 'idle' or v_h.id is not null", repl: "if v_h.id is not null" },
  { arm: 'TJ-ORDER', name: 'every band is open', fn: 'public.hr_trade_band_open(uuid,integer)',
    find: 'select coalesce(p_band, -1) = 0 or exists', repl: 'select true or exists' },
  { arm: 'TJ-ORDER', name: 'the fee is never re-quoted', fn: 'public.hr_trade_job_start(integer,text,integer,bigint,uuid)',
    find: 'if v_fee <> p_fee then', repl: 'if false then' },
  { arm: 'TJ-ORDER', name: 'the trade Level never gates', fn: 'public.hr_trade_job_quote(uuid,integer,text,integer)',
    find: 'if v_lv < r.r_level then', repl: 'if false then' },
  { arm: 'TJ-BOTH', name: 'the settle rolls to its own instant, not the job\'s end', fn: 'public.hr_trade_job_close(uuid,integer,timestamp with time zone,boolean)',
    find: 'v_ms := floor(extract(epoch from (v_at - j.started_at)) * 1000)::bigint;', repl: 'v_ms := floor(extract(epoch from (p_at - j.started_at)) * 1000)::bigint;' },
  { arm: 'TJ-STOP', name: 'a stop lands the whole job', fn: 'public.hr_trade_job_close(uuid,integer,timestamp with time zone,boolean)',
    find: 'v_at := greatest(j.started_at, least(p_at, v_end));', repl: 'v_at := v_end;' },
  { arm: 'TJ-STOP', name: 'the unattempted sets are kept', fn: 'public.hr_trade_job_close(uuid,integer,timestamp with time zone,boolean)',
    find: 'v_n := l.per * (v_ret + v_unused);', repl: 'v_n := l.per * v_ret;' },
  { arm: 'TJ-STOP', name: 'a stop keeps the fee of the sets it never attempted', fn: 'public.hr_trade_job_close(uuid,integer,timestamp with time zone,boolean)',
    find: 'if v_unused > 0 and j.fee > 0 then', repl: 'if false then' },
  { arm: 'TJ-STOP', name: 'the refund is the whole fee, attempted sets included', fn: 'public.hr_trade_job_close(uuid,integer,timestamp with time zone,boolean)',
    find: 'v_fee_back := j.fee - ((j.fee * (j.count - v_unused) + j.count - 1) / j.count);', repl: 'v_fee_back := j.fee;' },
  { arm: 'TJ-DAY', name: 'a job the day ends keeps the fee of its unattempted sets', fn: 'public.hr_trade_job_close(uuid,integer,timestamp with time zone,boolean)',
    find: 'if v_unused > 0 and j.fee > 0 then', repl: 'if v_unused > 0 and j.fee > 0 and v_at < v_end then' },
  { arm: 'TJ-RULE', name: 'the rule ignores a running job', fn: 'public.hr_time_auto_buy(uuid,integer,text)',
    find: '       and not public.hr_trade_job_wants_block(p_user, p_slot) then', repl: '       then' },
  { arm: 'TJ-RULE', name: 'the rule\'s sweep never visits a hero with a job', fn: 'public.hr_time_auto_sweep(integer)',
    find: 'or exists (select 1 from public.trade_jobs t where t.user_id = r.user_id and t.slot = r.slot and t.settled_at is null)', repl: 'or false' },
  { arm: 'TJ-TWIN', name: 'the roller ignores the quality switch', fn: 'public.hr_trade_roll(text,integer,integer,boolean,integer,integer,integer,bigint,bigint)',
    find: 'if k.rolls is null or c.quality_live <> 1 then v_plain := v_plain + 1; continue; end if;', repl: 'if k.rolls is null then v_plain := v_plain + 1; continue; end if;' },
  { arm: 'TJ-DAY', name: 'the work day is never spent', fn: 'public.hr_trade_job_close(uuid,integer,timestamp with time zone,boolean)',
    find: "update public.player_state set work_day = (f->>'day')::date, work_ms = least(86400000, greatest(0, (f->>'used_ms')::bigint)),",
    repl: 'update public.player_state set work_day = work_day, work_ms = work_ms,' },
  { arm: 'TJ-DAY', name: 'the sweep collects a job bought work lengthened', fn: 'public.hr_trade_job_close(uuid,integer,timestamp with time zone,boolean)',
    find: 'if not coalesce(p_early, false) and v_end > p_at then', repl: 'if false then' },
  { arm: 'TJ-KEY', name: 'the pointer leaves idle under a job', fn: 'public.hr_trade_job_busy()',
    find: 'if exists (select 1 from public.trade_jobs j where j.user_id = new.user_id', repl: 'if false and exists (select 1 from public.trade_jobs j where j.user_id = new.user_id' },
  { arm: 'TJ-SURFACE', name: 'the start hands back the seed', fn: 'public.hr_trade_job_start(integer,text,integer,bigint,uuid)',
    find: "'job', (select to_jsonb(t) - 'seed' from public.trade_jobs t where t.id = v_job)", repl: "'job', (select to_jsonb(t) from public.trade_jobs t where t.id = v_job)" },
];

async function main() {
  let db;
  try { ({ db } = await bootReplay()); } catch (e) { console.error('✗ the chain would not replay: ' + String(e.message).slice(0, 600)); process.exit(2); }
  await H.pinDice(db);
  await db.query("update public.hr_flags set enabled = false where key = 'beta_premium'");
  if (MUTATE) {
    let bad = 0;
    const clean = await runArms(db);
    for (const [name, pr] of Object.entries(clean)) if (pr.length) { console.error('✗ harness: ' + name + ' is red on the clean chain: ' + pr[0]); bad++; }
    if (bad) process.exit(1);
    for (const m of MUTANTS) {
      const def = String(await one(db, 'select pg_get_functiondef($1::regprocedure)', [m.fn])).replace(/\r/g, '');
      if (def.split(m.find).length !== 2) { console.error('✗ mutant "' + m.name + '": its anchor is not found exactly once in ' + m.fn); bad++; continue; }
      await db.exec(def.replace(m.find, () => m.repl));
      try {
        const first = ((await runArms(db, [m.arm]))[m.arm] || [])[0];
        if (!first) { console.error('✗ ' + m.arm + ' stayed GREEN on: ' + m.name); bad++; }
        else if (/^threw|^harness/.test(first)) { console.error('✗ harness: ' + m.arm + ' broke on: ' + m.name + ' (' + first.slice(0, 200) + ')'); bad++; }
        else console.log('✓ ' + m.arm + ' goes red on: ' + m.name + '  (' + first.slice(0, 110) + ')');
      } finally { await db.exec(def); }
    }
    console.log(bad ? 'trade-jobs --mutate: ' + bad + ' failure(s)' : 'trade-jobs --mutate: all ' + MUTANTS.length + ' mutants killed');
    process.exit(bad ? 1 : 0);
  }
  const oi = process.argv.indexOf('--only');
  const res = await runArms(db, oi > 0 ? process.argv[oi + 1].split(',') : null);
  let red = 0;
  for (const [name, problems] of Object.entries(res)) {
    if (problems.length) { red++; for (const pr of problems) console.error('✗ ' + name + ': ' + pr); }
    else console.log('✓ ' + name);
  }
  console.log(red ? 'trade-jobs: ' + red + ' arm(s) red' : 'trade-jobs: all ' + Object.keys(res).length + ' arms green');
  process.exit(red ? 1 : 0);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
