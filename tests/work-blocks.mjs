#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/work-blocks.mjs — TOWN WORK IS BOUGHT IN 2 H BLOCKS (4 A DAY), AND A STANDING "BUY UP TO N A DAY" RULE BUYS WITHOUT A PRESS
//   (v0.3.0 lane B1; supabase/migrations/1071-work-blocks.sql, 1072-work-blocks-catalogue.generated.sql, src/data/time-blocks.js;
//   the UTC midnight: 1075-work-blocks-midnight.sql and src/core/work-day.js, lane/work-blocks-midnight;
//   Tyler 2026-11-22; the designer's ruling on the rule, 12-targets.md section 9.3; CLAUDE.md §1, §4 both paths).
//
//   node tests/work-blocks.mjs            the guard (every arm, the whole replayed chain, the shipped edge)
//   node tests/work-blocks.mjs --mutate   the proof: each SQL mutant planted in the live body, and each JS mutant in a temporary copy of
//                                         the engine, must turn its arm red
//
// mutant-anchors: src/core/work-day.js supabase/migrations/1075-work-blocks-midnight.sql
//   (the JS mutant patches a temporary copy of src/core, src/data and the edge; every SQL mutant is planted in a live function body
//   read from the replayed chain (pg_get_functiondef), inside the arm's rolled-back transaction; the §6 clock mutant plants into the
//   text WB-MIDNIGHT-CHECK reads, in memory; no tracked file is patched)
//
// ci-step: db-replay-17 | Work blocks - four town-work blocks at x1.5 and the fifth refused, the standing rule buys without a press on both doors, the offer once
// ci-run: node tests/work-blocks.mjs
// ci-run: node tools/mutant-gate.mjs node tests/work-blocks.mjs --mutate
//
// THE MEASURE: the replayed chain (PGlite), the real engine (tests/hunt-sessions-settle.mjs HARNESS; the town tick and set-activity),
// real CharacterSessions for the presses, and the server clock pinned where an arm's subject is the hour (hr.test_now, pinDice's seam).
//   WB-DATA    src/data/time-blocks.js is valid; hr_time_blocks and hr_time_standing are its rows; the work block costs 1.0, 1.5, 2.25 and
//              3.375 hours of the hero's wage (04 section 11) on the server and in src/core/wage.js, and nothing past the fourth
//   WB-FOUR    THE DONE LINE (press): at 10:00 UTC a hero whose day's work is used up buys four work blocks through
//              CharacterSession.buyTime('work'), each at the twin's price, x1.5, each answer taken as the envelope (no hr_load); the
//              fifth is quoted block_limit and a forged press is refused; the purse moved by exactly the four prices, four shop rows, and
//              the work day's cap reads 8 h more
//   WB-DAY-END A BLOCK IS TODAY'S: at 21:00 UTC a spent day buys one block (2 h fit in the 3 h left) and the next is day_ending, quoted
//              and refused; at 23:00 the first is day_ending
//   WB-RULE-WORK THE DONE LINE (rule), BOTH DOORS: a mining hero with "up to 1 a day" and 8 minutes of its day left is bought ONE work
//              block by the server's sweep (no press: meta.auto), never while the purse would fall under the reserve; the job then works
//              past the free day without a work_cap end, on the world tick (browser closed) and the viewed settle alike; a second sweep
//              buys nothing (rule_limit)
//   WB-RULE-HUNT BOTH DOORS: the account answers the offer "Up to 2 a day"; the hunt runs on the server and the sweep buys each block
//              only once the pool is under one block, and the hunt ends `stamina` at exactly 14 h, the same two prices on both doors
//   WB-MIDNIGHT THE UTC MIDNIGHT, BOTH DOORS: a hero that worked its free day and 90 minutes of a block bought at 21:00 starts a new
//              job at 23:50; at 00:04 the next UTC day the world tick (browser closed) and the viewed settle each land the 14 minutes,
//              the 10 before midnight on yesterday's own cap and the 4 after on today's, the job running on (no work_cap, the new day)
//   WB-MIDNIGHT-CHECK 1075's own §6 self-check completes with the server clock pinned at a day's last tenth of a second, its first
//              instant, inside and either side of its first minute, at 00:04:30 and at 10:00 (an apply is never refused by its hour)
//   WB-OFFER   THE OFFER ONCE: none under 3 days of the company's pay, one over it (the client's reader sees it); "Up to 2 a day" sets
//              both heroes' rule and the offer is gone; a second answer is offer_answered; a hero's rule stays its own to change; Not
//              now on another account sets nothing and is never asked again
//   WB-SURFACE OFF BY DEFAULT and the refusals: a new hero's rules read off; a count past a kind's cap is bad_intent; a kind with no
//              branch is bad_kind; anon reaches neither setting
// Exit: 0 green · 1 a red arm or a missed mutant · 2 a harness problem.
//
// ── WHAT IT CANNOT PROVE ────────────────────────────────────────────────
// TRUE CONCURRENCY: PGlite is one backend, so the sweep's try-locks never meet a busy hero here; the never-wait argument is 1071's
// header (CONCURRENCY). The cron itself is not run: the arms call hr_time_auto_sweep as the cron does.
// ════════════════════════════════════════════════════════════════════════
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isMain } from './_is-main.mjs';
import { bootReplay, ROOT } from './schema-replay.mjs';
import { goldOf } from './_gold.mjs';

const MUTATE = process.argv.includes('--mutate');
const MIN = 60000;
const HOUR = 3600000;
const FN = 'supabase/functions/hr-accrue';
const mod = (f) => import(pathToFileURL(join(ROOT, f)).href);
const { HARNESS: H } = await import('./hunt-sessions-settle.mjs');
const { CharacterSession } = await mod('src/session/character-session.js');
const { workBlockOf, timeRuleOf, timeOfferOf } = await mod('src/session/time-sections.js');
const { setTimeRule, answerTimeOffer } = await mod('src/session/time-intents.js');
const { workDayOf } = await mod('src/session/bench-sections.js');
const TB = await mod('src/data/time-blocks.js');
const { wage, blockPrice } = await mod('src/core/wage.js');
const { one, q } = H;
const idem = () => crypto.randomUUID();
const js = (v) => String(JSON.stringify(v === undefined ? null : v)).slice(0, 400);
const COLORS = '{"head": 13, "body": 5, "legs": 3, "feet": 0}';
/* THE PINNED DAY: the first UTC day whose 10:00 is more than an hour ahead of the real clock. The pin is always AHEAD of the machine's
   clock, because the world tick's leases are stamped from now() (pinned) and read against clock_timestamp() (real): a pin behind the
   real clock would make every lease look expired and the tick would settle nothing. */
const DAY = new Date(Math.ceil((Date.now() + HOUR - 10 * HOUR) / 86400000) * 86400000 + 10 * HOUR).toISOString().slice(0, 10);
const at = (hhmm) => DAY + 'T' + hhmm + ':00Z';

let seq = 0;
const nextUid = () => `000000c1-0000-4000-8000-0000001071${String(++seq).padStart(2, '0')}`;

/* As PostgREST calls it, inside a savepoint so a database refusal leaves the arm's transaction usable. */
async function as(db, uid, sql, params, role = 'authenticated') {
  await db.query("select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)", [uid, JSON.stringify({ sub: uid, role })]);
  await db.query('savepoint wb_as');
  await db.exec('set role ' + role);
  try { const r = (await db.query(sql, params)).rows[0]; await db.exec('reset role'); await db.query('release savepoint wb_as'); return r ? Object.values(r)[0] : undefined; }
  catch (e) { await db.query('rollback to savepoint wb_as'); await db.exec('reset role'); return { thrown: String(e.message).split('\n')[0] }; }
  finally { await db.query("select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true)"); }
}
/* The seam index.ts hands the engine, inside the arm's transaction: one statement as hr_engine. */
const engineExec = (db) => async (text, params) => {
  await db.query('savepoint wb_eng'); await db.exec('set local role hr_engine');
  try { const rows = (await db.query(text, params)).rows; await db.exec('reset role'); await db.query('release savepoint wb_eng'); return rows; }
  catch (e) { await db.query('rollback to savepoint wb_eng'); await db.exec('reset role'); throw e; }
};
const pin = (db, iso) => db.query("select set_config('hr.test_now', $1, true)", [iso]);
const clear = (db) => db.query('delete from public.hr_rate_counters');
const sweep = async (db) => { await clear(db); return one(db, 'select public.hr_time_auto_sweep(50)'); };
const purse = (db, uid) => goldOf((sql, p) => db.query(sql, p).then((r) => r.rows), uid, 0);
const setPurse = (db, uid, g) => db.query(`insert into public.account_wallet as w (user_id, gold) values ($1, $2)
  on conflict (user_id) do update set gold = excluded.gold, version = w.version + 1, updated_at = now()`, [uid, g]);
const blockRows = (db, uid, kind) => q(db, `select slot, intent, gold::text as gold, meta from public.player_ledger
  where user_id = $1 and kind = 'shop' and intent like $2 order by id`, [uid, 'time\\_buy:' + kind + ':%']);

/* A new account and its hero in `slot`. */
async function makeHero(db, uid = null, slot = 0) {
  const u = uid || nextUid();
  if (!uid) {
    await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [u]);
    await db.query('insert into public.profiles (id, display_name) values ($1, $2) on conflict (id) do update set display_name = excluded.display_name', [u, 'Buyer ' + seq]);
  }
  const n = seq * 7 + slot;
  const name = 'Buyer' + String.fromCharCode(97 + (n % 26)) + String.fromCharCode(97 + Math.floor(n / 26) % 26) + String.fromCharCode(97 + slot);
  await clear(db);
  const h = await as(db, u, 'select public.hr_create_hero($1, $2, $3::jsonb, $4::uuid)', [slot, name, COLORS, idem()]);
  if (!h || h.ok !== true) throw Object.assign(new Error('hr_create_hero refused: ' + js(h)), { harness: true });
  await db.query('update public.player_state set premium_until = null where user_id = $1', [u]);
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

/* THE TOWN DOORS (tests/company-trades.mjs's). */
async function startJob(db, edge, uid, slot, activity) {
  await clear(db);
  return edge.sa.runSetActivity({ exec: engineExec(db), user: uid, slot, intentId: idem(), activity });
}
async function viewedSettle(db, edge, uid, slot = 0) {
  await clear(db);
  const exec = engineExec(db);
  const [read] = await exec(edge.sa.READ_SQL, [uid, slot, 'accrue']);
  const env = read && read.state;
  if (!env || env.ok !== true) throw Object.assign(new Error('no envelope: ' + js(read)), { harness: true });
  return edge.sa.collectCurrentWindow({ exec, user: uid, slot, env, st: env.state, nowMs: new Date(read.now).getTime(),
    capMs: Number(read.cap_ms) || 0, pointerSurvives: true });
}
async function fire(db, edge, rows) {
  await clear(db);
  await db.query('select public.hr_tick_enrol(200)');
  const holder = await one(db, "select left('cron:' || coalesce(current_database(), 'db'), 64)");
  await db.query("select count(*) from public.hr_tick_roster((select channels from public.hr_tick_config where id), 0, 200, $1, 30000, null, null, null)", [holder]);
  try {
    return (await edge.tick.runTick({ exec: engineExec(db), body: { op: 'tick', roster: rows.map(([u, s]) => ({ user_id: u, slot: s })), cadence_ms: 10000, flush_ms: 90000 } })).body;
  } catch (e) { return { RAISED: String(e.message).slice(0, 200) }; }
}
const stateOf = async (db, uid, slot = 0) => (await q(db, `select active_kind, work_day::text as work_day, work_ms::text as work_ms, job_end,
  floor(extract(epoch from accrued_to) * 1000)::bigint::text as wm from public.player_state where user_id = $1 and slot = $2`, [uid, slot]))[0];
const nowMs = async (db) => Number(await one(db, 'select floor(extract(epoch from now()) * 1000)::bigint::text'));

/* THE HUNTING DOORS (tests/hunting-blocks.mjs's). */
const HUID = () => H.UIDS[0];
async function freeHunter(db, M, minutesAgo) {
  await db.query("update public.hr_flags set enabled = false where key = 'beta_premium'");
  const h = await H.hunter(db, M, { ...H.STRONG, level: 25, minutesAgo, inv: { cooked_shrimp: 400 }, bag: [{ item: 'cooked_shrimp', qty: 300 }], gold: 1000000 });
  await db.query(`update public.player_state set stamina_ms = 0, stamina_at = (select hunt_from - interval '11 hours' from public.hunt_sessions where id = $2)
                   where user_id = $1 and slot = 0`, [HUID(), h.sid]);
  return h;
}
async function huntSettle(db, M, door, toMs) {
  await clear(db);
  if (door === 'fire') return H.settleTo(db, M, toMs);
  for (let i = 0; i < 2000; i++) {
    await clear(db);
    const v = await M.HS.settleHunt({ exec: H.makeExec(db), user: HUID(), slot: 0, mode: 'settle', bucket: null, project: false, grounds: H.groundsOf(M), atMs: toMs, minWindowMs: 0 });
    if (v && v.body && v.body.error === 'no_hunt') return v;
    if (!v || v.status !== 200 || !v.body || v.body.ok !== true) throw new Error('the player-door settle answered ' + js(v && v.body));
    const s = (await q(db, 'select ended_at, floor(extract(epoch from settled_to) * 1000)::bigint::text as to_ms from public.hunt_sessions where user_id = $1 and slot = 0 order by entered_at desc limit 1', [HUID()]))[0];
    if (!s || s.ended_at !== null || Number(s.to_ms) >= toMs) return v;
  }
  throw new Error('harness: the player door never reached ' + new Date(toMs).toISOString());
}

const ARMS = {
  'WB-DATA': async (db) => {
    const p = [];
    if (TB.validate().length) p.push('src/data/time-blocks.js is refused: ' + TB.validate().join('; '));
    const rows = await q(db, 'select kind, block_min, per_day, growth_num, growth_den, price_hour_pm, earns_pm, lead_min from public.hr_time_blocks order by kind');
    const want = Object.keys(TB.TIME_BLOCKS).sort().map((k) => { const R = TB.TIME_BLOCKS[k]; return { kind: k, block_min: R.blockMin, per_day: R.perDay,
      growth_num: R.growthNum, growth_den: R.growthDen, price_hour_pm: R.priceHourPm, earns_pm: TB.EARNS_PM[k], lead_min: TB.STANDING.leadMin[k] }; });
    if (js(rows) !== js(want)) p.push('hr_time_blocks reads ' + js(rows) + ', the data ' + js(want));
    const st = (await q(db, 'select reserve_hours_pm, offer_kind, offer_days_pm, offer_choices from public.hr_time_standing'))[0];
    const S = TB.STANDING;
    if (!st || st.reserve_hours_pm !== S.reserveHours * 1000 || st.offer_kind !== S.offerKind || st.offer_days_pm !== S.offerDays * 1000
        || js(st.offer_choices) !== js([...S.offerChoices])) p.push('hr_time_standing reads ' + js(st) + ', the data ' + js(S));
    for (const L of [1, 25, 60, 400]) {
      const w = wage(L);
      const jsP = [1, 2, 3, 4, 5].map((n) => blockPrice({ kind: 'work', level: L, n }));
      const sql = (await q(db, "select n, public.hr_time_block_price('work', $1, n)::text as g from generate_series(1, 5) n order by n", [L])).map((r) => (r.g === null ? null : Number(r.g)));
      const four = [1, 1.5, 2.25, 3.375].map((h) => Math.ceil(h * w));
      if (js(jsP) !== js([...four, null]) || js(sql) !== js(jsP)) p.push('at Level ' + L + ' the work blocks price ' + js(sql) + ' (server) and ' + js(jsP) + ' (JS), want ' + js([...four, null]));
    }
    return p;
  },

  'WB-FOUR': async (db) => {
    const p = [];
    await pin(db, at('10:00'));
    const u = await makeHero(db);
    await setPurse(db, u, 1000000000);
    const base = Number(await one(db, 'select public.hr_work_base_ms($1::uuid, 0)::text', [u]));
    await db.query("update public.player_state set work_day = $2::date, work_ms = $3 where user_id = $1 and slot = 0", [u, DAY, base]);
    const { cs, calls } = viewedClient(db, u);
    await cs.load();
    if (cs.status !== 'ready') return ['harness: the viewed hero did not load: ' + cs.status];
    const L = Number(await one(db, 'select public.hr_level_of($1::uuid, 0)', [u]));
    const g0 = await purse(db, u);
    const paid = [];
    for (let n = 1; n <= 4; n++) {
      const qn = workBlockOf(cs);
      const want = blockPrice({ kind: 'work', level: L, n });
      if (!qn || !qn.available || qn.price !== want || qn.boughtToday !== n - 1 || qn.perDay !== 4) { p.push('work block ' + n + ' quotes ' + js(qn) + ', want ' + want); return p; }
      const loads = calls.filter((c) => c === 'hr_load').length;
      const r = await cs.buyTime('work', qn.price);
      if (!r || r.ok !== true) { p.push('work block ' + n + ' answered ' + js(r)); return p; }
      if (calls.filter((c) => c === 'hr_load').length !== loads) p.push('work block ' + n + ': the answer was not taken as the envelope (an hr_load followed it)');
      paid.push(want);
    }
    const q5 = workBlockOf(cs);
    if (!q5 || q5.available !== false || q5.why !== 'block_limit' || q5.boughtToday !== 4) p.push('after four the quote reads ' + js(q5) + ', want block_limit');
    const g4 = await purse(db, u);
    await clear(db);
    const forged = await as(db, u, "select public.hr_time_buy('work', 0, $1::bigint, $2::uuid) as r", [paid[3], idem()]);
    if (!forged || forged.error !== 'block_limit') p.push('a fifth work block pressed anyway answered ' + js(forged));
    const rows = await blockRows(db, u, 'work');
    if (g4 !== g0 - paid.reduce((a, b) => a + b, 0) || await purse(db, u) !== g4) p.push('the purse moved ' + g0 + ' -> ' + g4 + ', want exactly -' + paid.join(' -'));
    if (rows.length !== 4 || rows.some((r, i) => r.intent !== 'time_buy:work:' + paid[i] || Number(r.gold) !== -paid[i] || r.meta.n !== i + 1 || r.meta.auto)) p.push('the journal reads ' + js(rows));
    for (let i = 1; i < 4; i++) if (paid[i] !== Math.ceil(paid[i - 1] * 1.5) && Math.abs(paid[i] - paid[i - 1] * 1.5) > 1) p.push('block ' + (i + 1) + ' is not x1.5 the one before: ' + js(paid));
    const day = workDayOf(cs);
    if (!day || day.capMs !== base + 4 * TB.TIME_BLOCKS.work.blockMin * MIN) p.push('the work day reads ' + js(day) + ', want a cap of ' + (base + 8 * HOUR));
    return p;
  },

  'WB-DAY-END': async (db) => {
    const p = [];
    await pin(db, at('21:00'));
    const u = await makeHero(db);
    await setPurse(db, u, 1000000000);
    const base = Number(await one(db, 'select public.hr_work_base_ms($1::uuid, 0)::text', [u]));
    await db.query("update public.player_state set work_day = $2::date, work_ms = $3 where user_id = $1 and slot = 0", [u, DAY, base]);
    const q1 = await one(db, 'select public.hr_work_block_quote($1::uuid, 0)', [u]);
    await clear(db);
    const a = await as(db, u, "select public.hr_time_buy('work', 0, $1::bigint, $2::uuid) as r", [q1 && q1.price, idem()]);
    const q2 = await one(db, 'select public.hr_work_block_quote($1::uuid, 0)', [u]);
    const g = await purse(db, u);
    await clear(db);
    const b = await as(db, u, "select public.hr_time_buy('work', 0, $1::bigint, $2::uuid) as r", [blockPrice({ kind: 'work', level: 1, n: 2 }), idem()]);
    if (!q1 || q1.available !== true || !a || a.ok !== true) p.push('at 21:00 a spent day quotes ' + js(q1) + ' and buys ' + js(a) + ', want one block (2 h of the 3 h left)');
    if (!q2 || q2.why !== 'day_ending' || !b || b.error !== 'day_ending' || await purse(db, u) !== g) p.push('the second at 21:00 quotes ' + js(q2) + ' and answers ' + js(b) + ', want day_ending, nothing moved');
    await pin(db, at('23:00'));
    const u2 = await makeHero(db);
    await db.query("update public.player_state set work_day = $2::date, work_ms = $3 where user_id = $1 and slot = 0", [u2, DAY, base]);
    const q3 = await one(db, 'select public.hr_work_block_quote($1::uuid, 0)', [u2]);
    if (!q3 || q3.why !== 'day_ending' || q3.price !== null) p.push('at 23:00 the first work block quotes ' + js(q3) + ', want day_ending');
    return p;
  },

  'WB-RULE-WORK': async (db, M, edge) => {
    const p = [];
    await pin(db, at('10:00'));
    const node = await one(db, "select activity_id from public.hr_activities where kind = 'gather' and req_skill = 'mining' and coalesce(req_lv, 1) <= 1 order by activity_id limit 1");
    const seen = {};
    for (const door of ['fire', 'viewed']) {
      const u = await makeHero(db);
      await setPurse(db, u, 1000000000);
      const set = await as(db, u, "select public.hr_time_auto_set('work', 0, 1, null, $1::uuid) as r", [idem()]);
      if (!set || set.ok !== true) { p.push(door + ': the rule set answered ' + js(set)); continue; }
      const st = await startJob(db, edge, u, 0, { kind: 'gather', id: node, count: 100000, next: 'wait' });
      if (st.status !== 200) throw Object.assign(new Error('the job start refused: ' + js(st.body)), { harness: true });
      /* the tick owns a hero it enrolled while its watermark was fresh (hr_tick_enrol), as company-trades.mjs CT-CLOSED does */
      if (door === 'fire') {
        await db.query('update public.player_state set last_seen_at = null where user_id = $1 and slot = 0', [u]);
        await db.query('select public.hr_tick_enrol(200)');
      }
      /* 8 minutes of the free day left, its watermark 13 minutes ago: unbought, the window would stop the job at the day's end */
      const base = Number(await one(db, 'select public.hr_work_base_ms($1::uuid, 0)::text', [u]));
      const now = await nowMs(db);
      await db.query(`update public.player_state set accrued_to = to_timestamp($2::double precision / 1000), active_since = to_timestamp($2::double precision / 1000),
                       work_day = $3::date, work_ms = $4 where user_id = $1 and slot = 0`, [u, now - 13 * MIN, DAY, base - 8 * MIN]);
      await db.query('update public.hr_return_anchor set real_return_at = to_timestamp($2::double precision / 1000) where user_id = $1 and slot = 0', [u, now - 13 * MIN]);
      const L = Number(await one(db, 'select public.hr_level_of($1::uuid, 0)', [u]));
      const price = blockPrice({ kind: 'work', level: L, n: 1 });
      const reserve = Math.ceil(TB.STANDING.reserveHours * wage(L));
      /* THE RESERVE: a purse one gold short of the block and the reserve buys nothing */
      await setPurse(db, u, price + reserve - 1);
      await sweep(db);
      const short = await blockRows(db, u, 'work');
      await setPurse(db, u, 1000000000);
      const s1 = await sweep(db);
      const bought = await blockRows(db, u, 'work');
      /* the door settles the 13 minutes: into the bought block, the job running on */
      if (door === 'fire') {
        /* the tick settles a flush (90 s) a fire, and leaves the last one under a flush for the next */
        for (let i = 0; i < 12; i++) {
          await fire(db, edge, [[u, 0]]);
          const s = await stateOf(db, u, 0);
          if (s.active_kind !== 'gather' || Number(s.wm) >= now - 100000) break;
        }
      }
      else await viewedSettle(db, edge, u, 0);
      const end = await stateOf(db, u, 0);
      /* the hero works its bought block down to 8 minutes left: due again, and the rule of 1 is spent */
      await db.query('update public.player_state set work_ms = $2 where user_id = $1 and slot = 0', [u, base + TB.TIME_BLOCKS.work.blockMin * MIN - 8 * MIN]);
      const s2 = await sweep(db);
      const after = await blockRows(db, u, 'work');
      seen[door] = js(bought.map((r) => [r.intent, r.meta.auto, r.meta.n]));
      if (short.length) p.push(door + ': a purse under the reserve was bought ' + js(short));
      if (bought.length !== 1 || bought[0].intent !== 'time_buy:work:' + price || bought[0].meta.auto !== true || !(s1 && s1.bought >= 1)) {
        p.push(door + ': with 8 minutes left the sweep (' + js(s1) + ') bought ' + js(bought) + ', want ONE block at ' + price + ', meta.auto');
      }
      if (end.active_kind !== 'gather' || !(Number(end.work_ms) > base) || (end.job_end && end.job_end.end === 'work_cap')) {
        p.push(door + ': after the window the hero reads ' + js(end) + ' (free day ' + base + '), want the job running past the free day');
      }
      if (after.length !== 1) p.push(door + ': a second sweep (' + js(s2) + ') bought past a rule of 1: ' + js(after));
    }
    if (seen.fire && seen.viewed && seen.fire !== seen.viewed) p.push('the two doors bought differently: closed ' + seen.fire + ', viewed ' + seen.viewed);
    return p;
  },

  /* THE UTC MIDNIGHT (lane/work-blocks-midnight; 1075-work-blocks-midnight.sql). A block is sold only while today can work it whole, so
     a hero inside a block at midnight is one whose job paused: the free day and 90 minutes of a 21:00 block worked, a new job at 23:50
     with 30 minutes of it left. At 00:04 the next UTC day each door settles the 14 minutes: the 10 before midnight on yesterday's own
     cap (the block in it), the 4 after on today's fresh one, the job running on. Before the fix the first settle after midnight read
     yesterday's cap as the free day: the engine stopped the job at its watermark (work_cap) and hr_apply refused the window. */
  'WB-MIDNIGHT': async (db, M, edge) => {
    const p = [];
    const node = await one(db, "select activity_id from public.hr_activities where kind = 'gather' and req_skill = 'mining' and coalesce(req_lv, 1) <= 1 order by activity_id limit 1");
    const next = new Date(Date.parse(DAY + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
    const midMs = Date.parse(next + 'T00:00:00Z');
    const seen = {};
    for (const door of ['fire', 'viewed']) {
      await pin(db, at('21:00'));
      const u = await makeHero(db);
      await setPurse(db, u, 1000000000);
      const base = Number(await one(db, 'select public.hr_work_base_ms($1::uuid, 0)::text', [u]));
      await db.query('update public.player_state set work_day = $2::date, work_ms = $3 where user_id = $1 and slot = 0', [u, DAY, base]);
      const q1 = await one(db, 'select public.hr_work_block_quote($1::uuid, 0)', [u]);
      await clear(db);
      const b = await as(db, u, "select public.hr_time_buy('work', 0, $1::bigint, $2::uuid) as r", [q1 && q1.price, idem()]);
      if (!b || b.ok !== true) { p.push(door + ': the block pressed at 21:00 answered ' + js(b) + ' (quote ' + js(q1) + ')'); continue; }
      /* 90 minutes of the block worked (its job ended), a new job at 23:50 with the last 30 minutes of it */
      await db.query('update public.player_state set work_ms = $2 where user_id = $1 and slot = 0', [u, base + 90 * MIN]);
      await pin(db, at('23:50'));
      const st = await startJob(db, edge, u, 0, { kind: 'gather', id: node, count: 100000, next: 'wait' });
      if (st.status !== 200) throw Object.assign(new Error('the job start at 23:50 refused: ' + js(st.body)), { harness: true });
      await db.query('update public.hr_return_anchor set real_return_at = now() where user_id = $1 and slot = 0', [u]);
      if (door === 'fire') {
        await db.query('update public.player_state set last_seen_at = null where user_id = $1 and slot = 0', [u]);
        await db.query('select public.hr_tick_enrol(200)');
      }
      /* 00:04 the next UTC day */
      await pin(db, next + 'T00:04:00Z');
      const now = await nowMs(db);
      if (door === 'fire') {
        for (let i = 0; i < 20; i++) {
          await fire(db, edge, [[u, 0]]);
          const s = await stateOf(db, u, 0);
          if (s.active_kind !== 'gather' || Number(s.wm) >= now - 100000) break;
        }
      } else await viewedSettle(db, edge, u, 0);
      const end = await stateOf(db, u, 0);
      const rows = await q(db, "select meta from public.player_ledger where user_id = $1 and slot = 0 and kind = 'gather' and intent = 'accrue' order by id", [u]);
      seen[door] = end.work_day;
      if (end.active_kind !== 'gather' || (end.job_end && end.job_end.end === 'work_cap') || end.work_day !== next
          || !(Number(end.work_ms) > 0 && Number(end.work_ms) <= 4 * MIN) || !(Number(end.wm) > midMs) || !rows.length
          || (door === 'fire' && rows.some((r) => !r.meta || r.meta.src !== 'tick'))) {
        p.push(door + ': inside yesterday\'s block at midnight the hero reads ' + js(end) + ' after ' + rows.length + ' journalled window(s) '
          + js(rows.map((r) => r.meta && [r.meta.src, r.meta.ms, r.meta.stopped])) + ', want the job running into ' + next
          + ' (0 < work_ms <= 4 min, watermark past midnight, no work_cap)');
      }
    }
    if (seen.fire && seen.viewed && seen.fire !== seen.viewed) p.push('the two doors landed on different days: closed ' + seen.fire + ', viewed ' + seen.viewed);
    return p;
  },

  /* 1075's OWN §6 SELF-CHECK AT EVERY HOUR THAT DECIDES IT (the class of 1073's 2026-11-27 rehearsal red): run on the server clock pinned
     at a day's last tenth of a second, its first instant, inside its first minute, either side of 00:01, inside the five-minute window
     tests/utc-midnight-replay.mjs replays the chain in, and mid-morning, it must complete at every one, so the hour never refuses an apply. */
  'WB-MIDNIGHT-CHECK': async (db) => {
    const p = [];
    let text = readFileSync(join(ROOT, 'supabase', 'migrations', '1075-work-blocks-midnight.sql'), 'utf8').replace(/\r/g, '');
    if (S6_PLANT) {
      if (text.split(S6_PLANT.from).length !== 2) throw Object.assign(new Error('the §6 plant is not found once in 1075'), { harness: true });
      text = text.replace(S6_PLANT.from, () => S6_PLANT.to);
    }
    const s6 = text.indexOf('-- ── §6 SELF-CHECK');
    const from = s6 < 0 ? -1 : text.indexOf('\ndo $$', s6);
    const to = text.lastIndexOf('end $$;');
    if (from < 0 || to < from) throw Object.assign(new Error('the §6 self-check block is not found in 1075-work-blocks-midnight.sql'), { harness: true });
    const check = text.slice(from + 1, to + 'end $$;'.length);
    const next = new Date(Date.parse(DAY + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
    for (const iso of [DAY + 'T23:59:59.900Z', next + 'T00:00:00.000Z', next + 'T00:00:00.400Z', next + 'T00:00:59.999Z',
      next + 'T00:01:00.001Z', next + 'T00:04:30.000Z', next + 'T10:00:00.000Z']) {
      await db.query('savepoint wb_s6');
      await pin(db, iso);
      try { await db.exec(check); } catch (e) { p.push('1075\'s §6 self-check run at ' + iso + ' raised: ' + String(e.message).split('\n')[0].slice(0, 300)); }
      await db.query('rollback to savepoint wb_s6');
    }
    return p;
  },

  'WB-RULE-HUNT': async (db, M) => {
    const p = [];
    const ends = {};
    for (const door of ['fire', 'viewed']) {
      await db.query('savepoint wb_door');
      const h = await freeHunter(db, M, 14 * 60 + 30);
      await clear(db);
      const offer = (await one(db, 'select public.hr_state_of($1::uuid, 0)', [HUID()])).time_blocks.offer;
      const ans = await as(db, HUID(), 'select public.hr_time_offer_answer(0, 2, $1::uuid) as r', [idem()]);
      if (!offer || offer.kind !== 'hunt' || !ans || ans.ok !== true) { p.push(door + ': the offer ' + js(offer) + ' answered ' + js(ans)); await db.query('rollback to savepoint wb_door'); continue; }
      for (let t = h.from + 10 * MIN; ; t = Math.min(h.from + 14 * HOUR + 10 * MIN, t + 10 * MIN)) {
        const r = await huntSettle(db, M, door, t);
        if (r && (r.skipped === 'no_hunt' || (r.body && r.body.error === 'no_hunt'))) break;
        await sweep(db);
        if (t >= h.from + 14 * HOUR + 10 * MIN) break;
      }
      const s = (await q(db, `select end_reason, floor(extract(epoch from ended_at) * 1000)::bigint::text as ended,
        floor(extract(epoch from hunt_from) * 1000)::bigint::text as from_ms from public.hunt_sessions where id = $1`, [h.sid]))[0];
      const rows = await blockRows(db, HUID(), 'hunt');
      const want = [1, 2].map((n) => blockPrice({ kind: 'hunt', level: 25, n }));
      ends[door] = js({ reason: s && s.end_reason, after: s && Number(s.ended) - Number(s.from_ms), paid: rows.map((r) => r.intent) });
      if (rows.length !== 2 || rows.some((r, i) => r.intent !== 'time_buy:hunt:' + want[i] || r.meta.auto !== true)) p.push(door + ': the sweep bought ' + js(rows) + ', want two at ' + want.join(' and '));
      else if (!(rows[0].meta.from_ms < TB.STANDING.leadMin.hunt * MIN)) p.push(door + ': the first block was bought with ' + rows[0].meta.from_ms + ' ms in the pool, want under one block');
      if (!s || s.end_reason !== 'stamina' || Number(s.ended) !== Number(s.from_ms) + 14 * HOUR) p.push(door + ': the hunt ended ' + js(s) + ', want `stamina` at exactly 14 h');
      await db.query('rollback to savepoint wb_door');
    }
    if (ends.fire && ends.viewed && ends.fire !== ends.viewed) p.push('the two doors differ: closed ' + ends.fire + ', viewed ' + ends.viewed);
    return p;
  },

  'WB-OFFER': async (db) => {
    const p = [];
    const u = await makeHero(db);
    await makeHero(db, u, 1);
    await setPurse(db, u, 0);
    const { cs, account } = viewedClient(db, u);
    await cs.load();
    if (timeOfferOf(cs)) p.push('an empty purse is offered ' + js(timeOfferOf(cs)));
    await setPurse(db, u, 10000000000);
    await cs.load();
    const o = timeOfferOf(cs);
    if (!o || o.kind !== TB.STANDING.offerKind || js(o.choices) !== js([...TB.STANDING.offerChoices])) { p.push('a full purse is offered ' + js(o)); return p; }
    const r = await answerTimeOffer(account, cs, 2);
    const rules = await q(db, "select slot, up_to from public.hero_time_rules where user_id = $1 and kind = 'hunt' order by slot", [u]);
    if (!r || r.ok !== true || js(rules) !== js([{ slot: 0, up_to: 2 }, { slot: 1, up_to: 2 }]) || timeOfferOf(cs) || !timeRuleOf(cs, 'hunt') || timeRuleOf(cs, 'hunt').upTo !== 2) {
      p.push('"Up to 2" answered ' + js(r) + ', the rules read ' + js(rules) + ', the offer ' + js(timeOfferOf(cs)));
    }
    await clear(db);
    const again = await as(db, u, 'select public.hr_time_offer_answer(0, 1, $1::uuid) as r', [idem()]);
    if (!again || again.error !== 'offer_answered') p.push('a second answer answered ' + js(again));
    const off = await setTimeRule(account, cs, 'hunt', 0);
    const rules2 = await q(db, "select slot, up_to from public.hero_time_rules where user_id = $1 and kind = 'hunt' order by slot", [u]);
    if (!off || off.ok !== true || js(rules2) !== js([{ slot: 1, up_to: 2 }]) || timeRuleOf(cs, 'hunt').upTo !== 0) p.push('hero 0 turning its rule off answered ' + js(off) + ', the rules read ' + js(rules2));
    const u2 = await makeHero(db);
    await setPurse(db, u2, 10000000000);
    await clear(db);
    const not = await as(db, u2, 'select public.hr_time_offer_answer(0, 0, $1::uuid) as r', [idem()]);
    const left = await one(db, 'select public.hr_time_offer_of($1::uuid)', [u2]);
    if (!not || not.ok !== true || (await q(db, 'select 1 from public.hero_time_rules where user_id = $1', [u2])).length || left) p.push('Not now answered ' + js(not) + ' and the offer reads ' + js(left));
    return p;
  },

  'WB-SURFACE': async (db) => {
    const p = [];
    const u = await makeHero(db);
    const env = await one(db, 'select public.hr_state_of($1::uuid, 0)', [u]);
    if (!env.time_blocks || env.time_blocks.hunt.auto !== null || env.time_blocks.work.auto !== null) p.push('a new hero\'s rules read ' + js(env.time_blocks));
    await clear(db);
    const past = await as(db, u, "select public.hr_time_auto_set('hunt', 0, 3, null, $1::uuid) as r", [idem()]);
    if (!past || past.error !== 'bad_intent') p.push('a hunting rule of 3 a day answered ' + js(past));
    await clear(db);
    const kind = await as(db, u, "select public.hr_time_auto_set('rest', 0, 1, null, $1::uuid) as r", [idem()]);
    if (!kind || kind.error !== 'bad_kind') p.push('a kind with no branch answered ' + js(kind));
    const anon = await as(db, u, "select public.hr_time_auto_set('work', 0, 1, null, $1::uuid) as r", [idem()], 'anon');
    const anon2 = await as(db, u, 'select public.hr_time_offer_answer(0, 1, $1::uuid) as r', [idem()], 'anon');
    const anon3 = await as(db, u, 'select public.hr_time_auto_sweep(5) as r', [], 'authenticated');
    for (const [w, r] of [['anon set', anon], ['anon answer', anon2], ['a client sweep', anon3]]) {
      if (!r || !r.thrown || !/permission denied/.test(r.thrown)) p.push(w + ' reached the server: ' + js(r));
    }
    return p;
  },
};

async function runArms(db, M, edge, only) {
  const out = {};
  for (const name of Object.keys(ARMS)) {
    if (only && !only.includes(name)) continue;
    try { out[name] = await H.inTx(db, () => ARMS[name](db, M, edge)); } catch (e) { out[name] = [(e && e.harness ? 'harness: ' : 'threw: ') + String(e && e.message).slice(0, 400)]; }
  }
  return out;
}

/* SQL MUTANTS, planted in the live body (each anchor found exactly once), and the arm that must go red. */
const MUTANTS = [
  { arm: 'WB-FOUR', name: 'the work cap off by one (a fifth block sold)', fn: 'public.hr_work_block_quote(uuid,integer)',
    find: "when v_bought >= v_per then 'block_limit'", repl: "when v_bought > v_per then 'block_limit'" },
  { arm: 'WB-FOUR', name: 'the work block answers no envelope (the client reads the hero again)', fn: 'public.hr_time_buy(text,integer,bigint,uuid)',
    find: "'time_blocks', public.hr_time_blocks_view(v_uid, p_slot), 'envelope', v_a);", repl: "'time_blocks', public.hr_time_blocks_view(v_uid, p_slot), 'envelope', null);" },
  { arm: 'WB-DAY-END', name: 'a work block sold whatever is left of the day', fn: 'public.hr_work_block_quote(uuid,integer)',
    find: "when greatest(0, v_cap - v_used) + v_block > v_room then 'day_ending'", repl: "when false then 'day_ending'" },
  { arm: 'WB-RULE-WORK', name: 'the rule buys past its count', fn: 'public.hr_time_auto_buy(uuid,integer,text)',
    find: "if (v_q->>'bought')::int >= v_up then return", repl: "if false then return" },
  { arm: 'WB-RULE-WORK', name: 'the rule spends under the reserve', fn: 'public.hr_time_auto_buy(uuid,integer,text)',
    find: 'if public.hr_purse_of(p_user) - v_price < v_res then', repl: 'if false then' },
  { arm: 'WB-RULE-WORK', name: 'a town block never due (the job stops at the free day)', fn: 'public.hr_time_auto_buy(uuid,integer,text)',
    find: "else (v_q->>'left_ms')::bigint <= v_lead end;", repl: 'else false end;' },
  { arm: 'WB-RULE-HUNT', name: 'the rule charges and never writes the pool', fn: 'public.hr_time_auto_buy(uuid,integer,text)',
    find: '    update public.player_state set stamina_ms = (v_q->>\'ms\')::bigint + (v_q->>\'block_ms\')::bigint, stamina_at = v_at\n     where user_id = p_user and slot = p_slot;',
    repl: '    update public.player_state set stamina_ms = (v_q->>\'ms\')::bigint + (v_q->>\'block_ms\')::bigint, stamina_at = v_at\n     where false;' },
  { arm: 'WB-RULE-HUNT', name: 'a hunting block bought at once, not when the pool runs low', fn: 'public.hr_time_auto_buy(uuid,integer,text)',
    find: "then (v_q->>'ms')::bigint < v_lead", repl: 'then true' },
  { arm: 'WB-OFFER', name: 'an answered offer is shown again', fn: 'public.hr_time_offer_of(uuid)',
    find: 'if exists (select 1 from public.account_time_offers o where o.user_id = p_user and o.kind = s.offer_kind) then return null; end if;',
    repl: 'if false then return null; end if;' },
  { arm: 'WB-OFFER', name: 'the answer sets only the hero that saw the card', fn: 'public.hr_time_offer_answer(integer,integer,uuid)',
    find: "    for h in select ps.slot from public.player_state ps where ps.user_id = v_uid order by ps.slot loop\n      perform public.hr_time_rule_write",
    repl: "    for h in select p_slot as slot loop\n      perform public.hr_time_rule_write" },
  { arm: 'WB-SURFACE', name: 'a rule past the kind\'s daily cap accepted', fn: 'public.hr_time_auto_set(text,integer,integer,bigint,uuid)',
    find: 'if p_up_to is not null and (p_up_to < 0 or p_up_to > v_per) then', repl: 'if false then' },
  /* the UTC midnight (1075-work-blocks-midnight.sql): each of the fix's four server parts, taken away alone */
  { arm: 'WB-MIDNIGHT', name: 'hr_apply folds yesterday on the free day (no earlier day\'s blocks)', fn: 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)',
    find: '                  public.hr_work_bought(v_uid, v_slot, v_st.accrued_to));', repl: "                  '{}'::jsonb);" },
  { arm: 'WB-MIDNIGHT', name: 'the engine\'s read forgets an earlier day\'s blocks', fn: 'public.hr_work_state(uuid,integer)',
    find: "'bought', case when ps.active_kind = any (public.hr_work_kinds())", repl: "'bought', case when false" },
  { arm: 'WB-MIDNIGHT', name: 'the bought read skips the watermark\'s own day', fn: 'public.hr_work_bought(uuid,integer,timestamp with time zone)',
    find: 'and l.at >= v_d0 and l.at < least(', repl: "and l.at >= v_d0 + interval '1 day' and l.at < least(" },
  { arm: 'WB-MIDNIGHT', name: 'the fold ignores an earlier day\'s bought work',
    fn: 'public.hr_work_fold(date,bigint,timestamp with time zone,timestamp with time zone,bigint,bigint,date,jsonb)',
    find: "when jsonb_typeof(v_b) = 'number' and v_b::text ~ '^[0-9]{1,15}$' then (v_b::text)::bigint", repl: 'when false then 0' },
];

/* JS MUTANTS, planted in a temporary copy of the engine (src/core, src/data and the edge): the arm runs on that copy's two doors. */
const JS_MUTANTS = [
  { arm: 'WB-MIDNIGHT', name: 'the engine caps an earlier UTC day at the free day (boughtMs never read)', file: 'src/core/work-day.js',
    from: "  return b && typeof b === 'object' && Object.prototype.hasOwnProperty.call(b, dayMs) ? nat(b[dayMs]) : 0;", to: '  return 0;' },
];
const townDoors = async (dir) => ({ tick: await import(pathToFileURL(join(dir, FN, 'tick.js')).href),
  sa: await import(pathToFileURL(join(dir, FN, 'set-activity.js')).href) });

/* A CLOCK MUTANT of 1075's §6 text (WB-MIDNIGHT-CHECK reads the file): the window's end taken as a fixed minute past midnight, not the
   server's now, so in a day's first minute the probe proposes an instant past now and the check refuses its own apply at that hour. */
let S6_PLANT = null;
const S6_MUTANTS = [
  { arm: 'WB-MIDNIGHT-CHECK', name: 'the self-check\'s window ends past now in a day\'s first minute (an hour that refuses the apply)',
    file: 'supabase/migrations/1075-work-blocks-midnight.sql',
    from: "    v_end := least(now(), v_t + interval '1 minute');", to: "    v_end := v_t + interval '1 minute';" },
];

async function main() {
  let db;
  try { ({ db } = await bootReplay()); } catch (e) { console.error('✗ the chain would not replay: ' + String(e.message).slice(0, 600)); process.exit(2); }
  await H.pinDice(db);
  const M = await H.loadEdge(H.ROOT);
  const edge = await townDoors(ROOT);
  await db.query('update public.hr_hunt_config set enabled = true where id');
  await db.query("insert into public.hr_flags (key, enabled, note) values ('town_presence', true, 'work-blocks') on conflict (key) do update set enabled = true");
  await db.query("update public.hr_flags set enabled = false where key = 'beta_premium'");
  await db.query('update public.hr_tick_config set enabled = true where id');
  await db.query("update public.hr_tick_config set armed_channels = (select array_agg(distinct x) from unnest(armed_channels || 'gather'::text) x) where id");
  if (MUTATE) {
    let bad = 0;
    const clean = await runArms(db, M, edge);
    for (const [name, pr] of Object.entries(clean)) if (pr.length) { console.error('✗ harness: ' + name + ' is red on the clean chain: ' + pr[0]); bad++; }
    if (bad) process.exit(1);
    for (const m of MUTANTS) {
      const def = String(await one(db, 'select pg_get_functiondef($1::regprocedure)', [m.fn])).replace(/\r/g, '');
      if (def.split(m.find).length !== 2) { console.error('✗ mutant "' + m.name + '": its anchor is not found exactly once in ' + m.fn); bad++; continue; }
      await db.exec(def.replace(m.find, () => m.repl));
      try {
        const first = ((await runArms(db, M, edge, [m.arm]))[m.arm] || [])[0];
        if (!first) { console.error('✗ ' + m.arm + ' stayed GREEN on: ' + m.name); bad++; }
        else if (/^threw|^harness/.test(first)) { console.error('✗ harness: ' + m.arm + ' broke on: ' + m.name + ' (' + first.slice(0, 200) + ')'); bad++; }
        else console.log('✓ ' + m.arm + ' goes red on: ' + m.name + '  (' + first.slice(0, 110) + ')');
      } finally { await db.exec(def); }
    }
    for (const m of JS_MUTANTS) {
      const dir = mkdtempSync(join(tmpdir(), 'hr-wblocks-'));
      try {
        for (const d of ['src/core', 'src/data', FN]) cpSync(join(ROOT, d), join(dir, d), { recursive: true });
        cpSync(join(ROOT, 'src/build-info.js'), join(dir, 'src/build-info.js'));
        const f = join(dir, m.file);
        const src = readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
        if (src.split(m.from).length !== 2) { console.error('✗ JS mutant "' + m.name + '": its anchor is not found exactly once in ' + m.file); bad++; continue; }
        writeFileSync(f, src.replace(m.from, () => m.to));
        const first = ((await runArms(db, M, await townDoors(dir), [m.arm]))[m.arm] || [])[0];
        if (!first) { console.error('✗ ' + m.arm + ' stayed GREEN on: ' + m.name); bad++; }
        else if (/^threw|^harness/.test(first)) { console.error('✗ harness: ' + m.arm + ' broke on: ' + m.name + ' (' + first.slice(0, 200) + ')'); bad++; }
        else console.log('✓ ' + m.arm + ' goes red on: ' + m.name + '  (' + first.slice(0, 110) + ')');
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }
    for (const m of S6_MUTANTS) {
      S6_PLANT = m;
      try {
        const first = ((await runArms(db, M, edge, [m.arm]))[m.arm] || [])[0];
        if (!first) { console.error('✗ ' + m.arm + ' stayed GREEN on: ' + m.name); bad++; }
        else if (/^threw|^harness/.test(first)) { console.error('✗ harness: ' + m.arm + ' broke on: ' + m.name + ' (' + first.slice(0, 200) + ')'); bad++; }
        else console.log('✓ ' + m.arm + ' goes red on: ' + m.name + '  (' + first.slice(0, 110) + ')');
      } finally { S6_PLANT = null; }
    }
    console.log(bad ? 'work-blocks --mutate: ' + bad + ' failure(s)' : 'work-blocks --mutate: all ' + (MUTANTS.length + JS_MUTANTS.length + S6_MUTANTS.length) + ' mutants killed');
    process.exit(bad ? 1 : 0);
  }
  const oi = process.argv.indexOf('--only');
  const res = await runArms(db, M, edge, oi > 0 ? process.argv[oi + 1].split(',') : null);
  let red = 0;
  for (const [name, problems] of Object.entries(res)) {
    if (problems.length) { red++; for (const pr of problems) console.error('✗ ' + name + ': ' + pr); }
    else console.log('✓ ' + name);
  }
  console.log(red ? 'work-blocks: ' + red + ' arm(s) red' : 'work-blocks: all ' + Object.keys(res).length + ' arms green');
  process.exit(red ? 1 : 0);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
