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
// ci-step: db-replay | Trade jobs - a kit-trade job on the server's quote, its refusals in order, the same goods viewed and closed, a stop returns the rest
// ci-run: node tests/trade-jobs.mjs
// ci-run: node tools/mutant-gate.mjs node tests/trade-jobs.mjs --mutate
//
//   TJ-DATA    the server's recipes are src/core/trades.js jobRecipes (kind, band, rung, face, inputs a set); each imbuement job takes
//              exactly imbueRecipe's set (5 of its part, 4 Remains of its band) at its part's band; every face and input is an item on
//              both sides; every Danger scale ground's band is its gearLevel over tierSteps
//   TJ-TWIN    the server's roller is settleJob to the last good: hr_trade_mulberry is mulberry32's draw at 2,000 states,
//              hr_trade_roll is settleJob for every recipe at several Levels, times and seeds (and with Mastery and a bench),
//              hr_trade_band_rung is bandRung for every kind and band 0 to 12, hr_trade_work_stop is workStopMs over day states and times
//   TJ-ORDER   the start's refusals in the spec's order, each moving nothing: bad_recipe, busy, rung_locked, band_locked, work_cap,
//              count_cap, quote_changed, short_inputs; dark, not_open and no section
//   TJ-BOTH    THE DONE LINE, BOTH DOORS: one hero starts a job from the Work window's quote (a real CharacterSession: one RPC, its answer
//              taken as the envelope, no hr_load); then (a) VIEWED, the window's Collect at the job's end, and (b) CLOSED, nothing from the
//              browser and the server's sweep a while after the end: the same goods by quality, XP and work day on both, and both are
//              settleJob on the stored seed. Twice: a whole-count Cook Shrimp, and a band 2 imbuement the day cuts short (work_cap, the
//              rest refunded)
//   TJ-STOP    a stop an hour in lands exactly the first hour of the seeded sequence, hands every unattempted set back to Storage
//              (trade_refund), and the restart is a new job with a new seed
//   TJ-DAY     a job the day ends stops at work_cap with the day used; a work block bought under a running job moves its end (the sweep
//              at the old end answers not_due and later collects the whole count)
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
    /* Mastery and a bench (a yield over 1000: returned sets, and Master first) */
    for (const kind of ['arrow', 'meal', 'ore', 'imbuement']) for (const seed of [11, 99]) {
      const js0 = T.settleJob(CAT.kinds[kind], 1, 60, { mastery: true, benchPm: 100, count: 300, elapsedMs: 9 * HOUR, seed });
      const s = await one(db, 'select public.hr_trade_roll($1, 1, 60, true, 100, 1000, 300, $2::bigint, $3::bigint)', [kind, 9 * HOUR, seed]);
      if (!s || s.plain !== js0.plain || s.fine !== js0.fine || s.master !== js0.master || s.returned !== js0.returned) p.push(kind + ' with the Mastery: SQL ' + js(s) + ' JS ' + js(js0));
    }
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
    if (n < 500) p.push('the roll was swept at ' + n + ' points, under 500');
    return p;
  },

  async 'TJ-ORDER'(db) {
    const p = [];
    await pin(db, at('10:00'));
    const u = await makeHero(db);
    await setPurse(db, u, 50000000);
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
    if (!early || early.settled !== 0 || !still || new Date(still.ends_at).getTime() <= msOf(at('12:00'))) p.push('the sweep at the old end answered ' + js(early) + ', the job ' + js(still && still.ends_at));
    const endMs = await trueEnd(db, still);
    await pin(db, new Date(endMs + MIN).toISOString());
    await sweep(db);
    const got = await landed(db, u, job);
    const want = expected(job, endMs - new Date(job.started_at).getTime());
    if (got.result.attempts !== want.attempts || got.plain !== want.plain) p.push('the lengthened job landed ' + js(got) + ', settleJob says ' + js(want));
    if (got.end !== (endMs < msOf(at('14:00')) ? 'done' : 'work_cap')) p.push('the lengthened job ended ' + got.end);
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
    find: 'v_left := greatest(0, v_base + case when v_d0 = v_tms then v_extra else 0 end', repl: 'v_left := greatest(0, v_base + case when v_d0 = v_tms then 0 else 0 end' },
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
