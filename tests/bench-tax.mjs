#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/bench-tax.mjs — THE WORK BENCH TAX, PLAYED ON THE REPLAYED CHAIN WITH THE SHIPPED ENGINE (Tyler 2026-11-01;
//   src/data/bench-tax.js, src/core/bench-tax.js, supabase/migrations/2027-02-19-bench-tax.sql).
//
//   node tests/bench-tax.mjs            the guard
//   node tests/bench-tax.mjs --mutate   every planted defect (edge copy or SQL) must turn its arm red or fail the file's §5
//
// mutant-anchors: supabase/migrations/2027-02-19-bench-tax.sql, src/core/bench-tax.js, src/core/artisan-sim.js, supabase/functions/hr-accrue/accrual.js
//
//   T-VIEWED   a hero stops a bench job: it pays permille x bid x count per craft, to the milligold, from the account's purse
//   T-CLOSED   the same job with the browser closed (the world tick) charges the same gold, the same carry, the same materials
//   T-GOLD     out of gold, both doors: the job stops, says why, spends no material on the craft it could not pay, never under 0
//   T-KEEP     a hero who set "Keep at least" stops above it; one who never touched it keeps nothing here
//   T-HOUSE    another hero of the account owns the room: no fee, no gold, no count in the ledger's fee block
//   T-FORGED   a request's fee, rate, gold or flag changes nothing, and no client role can reach the doors
//   T-LEDGER   every charged craft is on a ledger row: over a chain of windows, gold x 1000 + carry = crafts x fee
//   T-RACE     another hero empties the purse after the engine read: refused and released, the next settle re-reads and stops
//   T-FREE     gathering, the Great Hearth, a good with no bid and the cheap goods line take nothing, even with an empty purse
//   T-RATES    the server's fee equals the data's for every bench recipe (vendorPriceOf and hr_hunt_vendor_value agree)
//   T-SPLIT    any cut of a run into windows charges the same gold (the arithmetic, over many cuts)
//   T-WORDS    the Work window's sentences, from the server's numbers, and the stack it names to sell
//   T-IDEM     a second apply of both files moves nothing
//
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { bootReplay, ROOT, LAST_PATCHED } from './schema-replay.mjs';
import { ARTISAN_RECIPES } from '../src/data/recipes.js';
import { ITEMS } from '../src/data/items.js';
import { BENCH_TAX, BENCH_TAX_FREE_UNDER_MG } from '../src/data/bench-tax.js';
import { recipeInputs } from '../src/core/artisan.js';
import { feeMgOf, taxFor, payCraft, canPayNext, craftsCovered } from '../src/core/bench-tax.js';
import { vendorPriceOf } from '../supabase/functions/hr-accrue/catalogue.js';

const MUTATE = process.argv.includes('--mutate') || process.argv.includes('--selftest');
const CONTROL = Boolean(process.env.HR_MUTANT_CONTROL);
const FN = 'supabase/functions/hr-accrue';
const MIG = '2027-02-19-bench-tax.sql';
const RATES = '2027-02-19-bench-tax-rates.generated.sql';
const COLORS = '{"head": 13, "body": 5, "legs": 3, "feet": 0}';

const recipeMaking = (skill, output) => ARTISAN_RECIPES[skill].find((r) => r.output === output && !r.gated);
const IRON = recipeMaking('smithing', 'iron_bar');       // a fractional fee
const COPPER = recipeMaking('smithing', 'copper_bar');   // under the cheap goods line
const ARROWS = recipeMaking('crafting', 'bronze_arrows'); // no shop bid
const feeOf = (skill, r) => feeMgOf(BENCH_TAX[skill], vendorPriceOf(ITEMS, r.output), r.outputQty || 1, BENCH_TAX_FREE_UNDER_MG);
const IRON_MG = feeOf('smithing', IRON);

let seq = 0;
const nextUid = () => `000000c2-0000-4000-8000-0000000b${String(++seq).padStart(4, '0')}`;
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
const engineExec = (db) => async (text, params) => {
  await db.exec('begin'); await db.exec('set local role hr_engine');
  try { return (await db.query(text, params)).rows; } finally { await db.exec('commit'); }
};

async function makeHero(db, uid, slot) {
  const name = 'Taxpayer' + String.fromCharCode(97 + (seq % 26)) + String.fromCharCode(97 + Math.floor(seq / 26) % 26) + 'abcdef'[slot];
  const h = await as(db, uid, 'select public.hr_create_hero($1, $2, $3::jsonb, $4::uuid)', [slot, name, COLORS, idem()]);
  if (!h || h.ok !== true) throw Object.assign(new Error('hr_create_hero refused: ' + js(h)), { harness: true });
}

/* A hero made the real way, on a bench with enough for `crafts` of `recipe`, its window `agoS` old, browser closed. */
async function benchHero(db, recipe, crafts, purse, agoS = 600) {
  const uid = nextUid();
  await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [uid]);
  await db.query('insert into public.profiles (id, display_name) values ($1, $2) on conflict (id) do update set display_name = excluded.display_name', [uid, 'Taxpayer ' + seq]);
  await makeHero(db, uid, 0);
  await db.query('delete from public.player_inventory where user_id = $1 and slot = 0', [uid]);
  for (const [id, n] of Object.entries(recipeInputs(recipe))) {
    await db.query('insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, $2, $3)', [uid, id, n * crafts]);
  }
  await db.query('update public.account_wallet set gold = $2 where user_id = $1', [uid, purse]);
  await db.query(`update public.player_state set active_kind = 'artisan', active_id = $2, active_since = now(), accrued_to = now(), last_seen_at = null
                   where user_id = $1 and slot = 0`, [uid, recipe.id]);
  await db.query('select public.hr_tick_enrol(200)');
  await rewind(db, uid, agoS);
  return uid;
}
async function rewind(db, uid, agoS) {
  await db.query('update public.player_state set active_since = active_since - make_interval(secs => $2), accrued_to = accrued_to - make_interval(secs => $2) where user_id = $1 and slot = 0', [uid, agoS]);
  await db.query('update public.hr_return_anchor set real_return_at = real_return_at - make_interval(secs => $2) where user_id = $1 and slot = 0', [uid, agoS]);
}

const viewOf = async (db, uid, recipe) => {
  const r = (await db.query(`select ps.active_kind, ps.active_id, ps.bench_tax_carry_mg as carry, ps.bench_tax_run as run,
      (select gold from public.account_wallet w where w.user_id = ps.user_id)::bigint as purse, ps.version
      from public.player_state ps where ps.user_id = $1 and ps.slot = 0`, [uid])).rows[0];
  const inv = (await db.query('select item_id, qty from public.player_inventory where user_id = $1 and slot = 0', [uid])).rows;
  r.bag = Object.fromEntries(inv.map((x) => [x.item_id, Number(x.qty)]));
  r.purse = Number(r.purse);
  if (recipe) r.out = r.bag[recipe.output] || 0;
  return r;
};
const craftRows = async (db, uid) => (await db.query(
  "select gold::bigint as gold, gold_kind, purse, meta from public.player_ledger where user_id = $1 and slot = 0 and kind = 'craft' order by at, id", [uid])).rows;
const stop = (db, setActivity, uid, extra) => setActivity({ exec: engineExec(db), user: uid, slot: 0, intentId: idem(), activity: { kind: 'idle', id: null, ...(extra || {}) } });

async function fire(db, tick, uids) {
  await db.query('select public.hr_tick_enrol(200)');
  const holder = await one(db, "select left('cron:' || coalesce(current_database(), 'db'), 64)");
  await db.query('select count(*) from public.hr_tick_roster((select channels from public.hr_tick_config where id), 0, 200, $1, 30000, null, null, null)', [holder]);
  try {
    return (await tick.runTick({ exec: engineExec(db), body: { op: 'tick', roster: uids.map((u) => ({ user_id: u, slot: 0 })), cadence_ms: 10000, flush_ms: 90000 } })).body;
  } catch (e) { return { RAISED: String(e.message).slice(0, 200) }; }
}
/* What N crafts at `mg` from a zero carry charge. */
const goldFor = (n, mg) => Math.floor(n * mg / 1000);

async function arms(db, tick, setActivity, opts) {
  const red = new Map();
  const arm = (id, pass, good, bad) => {
    if (!MUTATE) console.log(pass ? `  ✓ ${id} — ${good}` : `  ✗ ${id} — ${bad}`);
    if (!pass) red.set(id, bad);
  };
  await db.query('delete from public.hr_rate_counters');
  const CRAFTS = 10;

  /* ── T-VIEWED / T-CLOSED: the same ten crafts, the owner's own stop and the world tick ── */
  const v = await benchHero(db, IRON, CRAFTS, 500);
  const sv = await stop(db, setActivity, v);
  const va = await viewOf(db, v, IRON);
  const vr = await craftRows(db, v);
  const vb = (vr[0] && vr[0].meta && vr[0].meta.delta && vr[0].meta.delta.bt) || {};
  const want = goldFor(CRAFTS, IRON_MG);
  arm('T-VIEWED', sv.status === 200 && va.active_kind === 'idle' && va.purse === 500 - want && va.carry === CRAFTS * IRON_MG % 1000 && va.out >= CRAFTS
      && Number(vr[0] && vr[0].gold) === -want && vr[0].gold_kind === 'bench_tax' && Number(vb.c) === CRAFTS && Number(vb.mg) === IRON_MG,
    `the owner's stop: ${CRAFTS} ${IRON.id} at ${IRON_MG} mg took ${want} g, carried ${va.carry} mg, one bench_tax row`,
    `the viewed path: ${js({ status: sv.status, err: sv.body && sv.body.error, va, row: vr[0] }).slice(0, 500)}`);

  const c = await benchHero(db, IRON, CRAFTS, 500);
  const fc = await fire(db, tick, [c]);
  const ca = await viewOf(db, c, IRON);
  const cr = await craftRows(db, c);
  arm('T-CLOSED', ca.active_kind === 'idle' && ca.purse === va.purse && ca.carry === va.carry && js(ca.bag[Object.keys(recipeInputs(IRON))[0]]) === js(va.bag[Object.keys(recipeInputs(IRON))[0]])
      && cr.length === 1 && cr[0].meta.src === 'tick' && Number(cr[0].gold) === -want,
    `the world tick with the browser closed charged the same ${want} g and carry on one row`,
    `the tick and the owner's stop disagree: ${js({ fire: fc, ca, va, rows: cr.length }).slice(0, 500)}`);

  /* ── T-GOLD: 3 g covers four crafts at 900 mg (0.9, 1.8, 2.7, 3.6: 3 g); the fifth's whole gold cannot be paid ── */
  const covered = craftsCovered(taxFor({ carry_mg: 0, keep: 0 }, IRON_MG, 3));
  const inputId = Object.keys(recipeInputs(IRON))[0];
  const per = recipeInputs(IRON)[inputId];
  const g1 = await benchHero(db, IRON, 100, 3);
  await stop(db, setActivity, g1);
  const ga = await viewOf(db, g1, IRON);
  const gr = await craftRows(db, g1);
  const g2 = await benchHero(db, IRON, 100, 3);
  await fire(db, tick, [g2]);
  const gb = await viewOf(db, g2, IRON);
  const gt = await craftRows(db, g2);
  const atGold = (h, rows) => h.active_kind === 'idle' && h.purse >= 0 && h.purse === 3 - goldFor(covered, IRON_MG)
    && h.bag[inputId] === (100 - covered) * per && h.out >= covered && rows.length === 1 && rows[0].meta.stopped === 'gold'
    && h.run && h.run.e === 'gold' && Number(h.run.c) === covered && Number(h.run.g) === goldFor(covered, IRON_MG);
  arm('T-GOLD', covered > 0 && atGold(ga, gr) && atGold(gb, gt),
    `both doors stopped after ${covered} crafts, purse ${ga.purse}, ${100 - covered} crafts' materials untouched, the end reason on the row and the run`,
    `the out-of-gold stop: ${js({ covered, per, stop: { ga, row: gr[0] && gr[0].meta }, tick: { gb, row: gt[0] && gt[0].meta } }).slice(0, 900)}`);

  /* ── T-KEEP ── */
  const k1 = await benchHero(db, IRON, 100, 102);
  const set = await one(db, 'select public.hr_hunt_active_set($1, 0)', [k1]);
  await db.query(`insert into public.player_action_sets (user_id, slot, preset, name, slots, options) values ($1, 0, $2, 'Kept', '[]'::jsonb, '{"gold_floor": 100}'::jsonb)
                  on conflict (user_id, slot, preset) do update set options = public.player_action_sets.options || '{"gold_floor": 100}'::jsonb`, [k1, set]);
  await stop(db, setActivity, k1);
  const ka = await viewOf(db, k1, IRON);
  const k2 = await benchHero(db, IRON, CRAFTS, 50);
  const keep0 = await one(db, "select (public.hr_bench_tax_view($1, 0)->>'keep')::int", [k2]);
  await stop(db, setActivity, k2);
  const kb = await viewOf(db, k2, IRON);
  arm('T-KEEP', ka.purse === 100 && ka.run && ka.run.e === 'gold' && keep0 === 0 && kb.purse === 50 - want,
    'a hero who set Keep at least 100 stopped with 100 left; a hero who never touched it pays out of a purse of 50, under the hunt\'s default',
    `the keep rule: ${js({ ka, keep0, kb }).slice(0, 500)}`);

  /* ── T-HOUSE: the room is filed on the OTHER hero; the home is the account's ── */
  const h = await benchHero(db, IRON, CRAFTS, 500);
  await makeHero(db, h, 1);
  await db.query('update public.account_wallet set gold = 500 where user_id = $1', [h]);
  await db.query(`insert into public.player_progress (user_id, slot, kind, key, period_key, value)
                  select $1, 1, u.progress_kind, 'room:forge', '', 1 from public.hr_unlocks u where u.unlock_id = 'room:forge'`, [h]);
  const sect = await one(db, 'select public.hr_bench_tax_view($1, 0)', [h]);
  const sh = await stop(db, setActivity, h);
  const ha = await viewOf(db, h, IRON);
  const hr = await craftRows(db, h);
  arm('T-HOUSE', sect.rooms.smithing.free === true && Number(sect.now_mg) === 0 && !(IRON.id in sect.fees) && sh.status === 200 && ha.purse === 500 && ha.carry === 0 && ha.out >= CRAFTS
      && Number(hr[0].gold) === 0 && hr[0].gold_kind === null && !(hr[0].meta.delta && hr[0].meta.delta.bt),
    `another hero's Forge rung 1 frees this hero: ${CRAFTS} crafts, purse still 500, no fee on the row`,
    `the house bench: ${js({ sect: sect && sect.rooms, now: sect && sect.now_mg, status: sh.status, ha, row: hr[0] }).slice(0, 500)}`);

  /* ── T-FORGED: what a request can carry changes nothing; the doors are shut to a client ── */
  const f = await benchHero(db, IRON, CRAFTS, 500);
  await stop(db, setActivity, f, { fee: 0, gold: 999999, mg: 0, now_mg: 0, free: true, bench_tax: { crafts: 0 }, keep: 0, carry_mg: 999 });
  const fa = await viewOf(db, f, IRON);
  const refused = [];
  for (const [name, sql, params] of [
    ['hr_apply', 'select public.hr_apply($1::uuid, 0, 1, gen_random_uuid(), \'{"gold": 0}\'::jsonb)', [f]],
    ['hr_bench_tax_view', 'select public.hr_bench_tax_view($1::uuid, 0)', [f]],
    ['hr_bench_tax_due_mg', "select public.hr_bench_tax_due_mg($1::uuid, 0, 'x')", [f]],
    ['hr_bench_tax_rates', 'select count(*) from public.hr_bench_tax_rates where $1::uuid is not null', [f]],
    ['hr_bench_tax_fees', 'select count(*) from public.hr_bench_tax_fees where $1::uuid is not null', [f]],
  ]) {
    try { await as(db, f, sql, params); } catch (e) { refused.push(name); }
  }
  arm('T-FORGED', fa.purse === va.purse && fa.carry === va.carry && refused.length === 5,
    `a forged fee, gold, rate, flag, count and carry in the request charged the same ${want} g; a client role reaches neither door nor table`,
    `forged values moved the fee or a door is open: ${js({ fa, va, refused })}`);

  /* ── T-LEDGER: a chain of windows on a long run: every craft is on a row and the sum holds to the milligold ── */
  const l = await benchHero(db, IRON, 500, 5000, 300);
  const before = await viewOf(db, l, IRON);
  await fire(db, tick, [l]);
  await fire(db, tick, [l]);
  await fire(db, tick, [l]);
  const la = await viewOf(db, l, IRON);
  const lr = await craftRows(db, l);
  const crafts = lr.reduce((s, r) => s + Number(r.meta.delta.bt.c), 0);
  const gold = lr.reduce((s, r) => s - Number(r.gold), 0);
  const spent = before.bag[inputId] - la.bag[inputId];
  arm('T-LEDGER', lr.length >= 2 && crafts > 0 && gold * 1000 + la.carry === crafts * IRON_MG && before.purse - la.purse === gold && spent === crafts * per
      && lr.every((r) => Number(r.gold) === 0 ? r.gold_kind === null : r.gold_kind === 'bench_tax') && Number(la.run.c) === crafts && Number(la.run.g) === gold,
    `${lr.length} windows, ${crafts} crafts: ${gold} g x 1000 + carry ${la.carry} = ${crafts * IRON_MG} mg, every craft on a row, the materials and the run's tally agree`,
    `the ledger does not add up: ${js({ rows: lr.length, crafts, gold, carry: la.carry, spent, per, mg: IRON_MG, run: la.run }).slice(0, 500)}`);

  /* ── T-RACE: another hero spends the purse between the engine's read and the apply ── */
  const r = await benchHero(db, IRON, 100, 50);
  let drained = false;
  const racing = async (text, params) => {
    if (!drained && /hr_apply\(/.test(text)) { drained = true; await db.query('update public.account_wallet set gold = 1 where user_id = $1', [r]); }
    return engineExec(db)(text, params);
  };
  const r1 = await setActivity({ exec: racing, user: r, slot: 0, intentId: idem(), activity: { kind: 'idle', id: null } });
  const rmid = await viewOf(db, r, IRON);
  const r2 = await stop(db, setActivity, r);
  const ra = await viewOf(db, r, IRON);
  arm('T-RACE', r1.status === 409 && r1.body.error === 'bench_tax_purse' && rmid.purse === 1 && rmid.bag[inputId] === 100 * per && rmid.active_kind === 'artisan'
      && r2.status === 200 && ra.active_kind === 'idle' && ra.purse >= 0 && ra.run && ra.run.e === 'gold',
    'the stale settle was refused bench_tax_purse with nothing moved, and the next one re-read the purse and stopped for gold (the same derived key was free)',
    `the race: ${js({ r1: r1.status, e1: r1.body && r1.body.error, rmid, r2: r2.status, e2: r2.body && r2.body.error, ra }).slice(0, 600)}`);

  /* ── T-FREE ── */
  const a0 = await benchHero(db, COPPER, CRAFTS, 0);
  const s0 = await stop(db, setActivity, a0);
  const a0a = await viewOf(db, a0, COPPER);
  const a1 = await benchHero(db, ARROWS, CRAFTS, 0);
  const s1 = await stop(db, setActivity, a1);
  const a1a = await viewOf(db, a1, ARROWS);
  const fuelMg = await one(db, "select public.hr_bench_tax_mg('fuel_bones')::int");
  /* Gathering: a window on a node at an empty purse. */
  const gat = nextUid();
  await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [gat]);
  await db.query("insert into public.profiles (id, display_name) values ($1, 'Gatherer') on conflict (id) do nothing", [gat]);
  await makeHero(db, gat, 0);
  await db.query('update public.account_wallet set gold = 0 where user_id = $1', [gat]);
  await db.query(`update public.player_state set active_kind = 'gather', active_id = 'normal_tree', active_since = now() - interval '5 minutes', accrued_to = now() - interval '5 minutes'
                   where user_id = $1 and slot = 0`, [gat]);
  const sg = await stop(db, setActivity, gat);
  const ga0 = await viewOf(db, gat);
  const gatherRows = (await db.query("select gold::bigint as gold, kind from public.player_ledger where user_id = $1 and kind = 'gather'", [gat])).rows;
  arm('T-FREE', s0.status === 200 && a0a.purse === 0 && a0a.out >= CRAFTS && s1.status === 200 && a1a.purse === 0 && a1a.out >= CRAFTS && fuelMg === 0
      && sg.status === 200 && ga0.purse === 0 && gatherRows.length >= 1 && gatherRows.every((x) => Number(x.gold) === 0) && ga0.bag.normal_log > 0,
    'with an empty purse: Copper Bars (cheap goods line), Bronze Arrows (no bid) and gathered logs all ran free, and the Great Hearth has no fee',
    `a free job charged or stopped: ${js({ s0: s0.status, a0a, s1: s1.status, a1a, fuelMg, sg: sg.status, ga0, gatherRows }).slice(0, 700)}`);

  /* ── T-RATES: every bench recipe, the server's number against the data's ── */
  const server = Object.fromEntries((await db.query('select r.recipe_id, public.hr_bench_tax_mg(r.recipe_id)::int as mg from public.hr_bench_tax_rates r')).rows.map((x) => [x.recipe_id, x.mg]));
  const off = [];
  let n = 0;
  const seen = new Set();
  for (const skill of Object.keys(ARTISAN_RECIPES)) for (const rec of ARTISAN_RECIPES[skill]) {
    if (seen.has(rec.id)) continue;
    seen.add(rec.id);
    n++;
    const mine = skill in BENCH_TAX && rec.output ? feeOf(skill, rec) : 0;
    const theirs = rec.id in server ? server[rec.id] : 0;
    if (mine !== theirs) off.push(`${rec.id}: data ${mine}, server ${theirs}`);
    /* The designer's bound: no single craft's whole gold exceeds what the job's output sells for. */
    const worst = Math.ceil(mine / 1000);
    if (mine > 0 && worst > vendorPriceOf(ITEMS, rec.output) * (rec.outputQty || 1)) off.push(`${rec.id}: a craft can charge ${worst} g, more than it sells for`);
  }
  const reqSkill = (await db.query(`select r.recipe_id from public.hr_bench_tax_rates r join public.hr_activities a on a.kind = 'artisan' and a.activity_id = r.recipe_id where a.req_skill <> r.skill`)).rows;
  arm('T-RATES', off.length === 0 && n > 100 && reqSkill.length === 0,
    `the server's fee equals permille x vendorPriceOf x count for all ${n} bench recipes, and no craft's charge exceeds what it sells for`,
    `fees disagree: ${off.slice(0, 8).join('; ')} ${js(reqSkill)}`);

  /* ── T-SPLIT: the arithmetic over many cuts, from any carry ── */
  let splitBad = null;
  for (const mg of [500, 750, 900, 1000, 1250, 9750]) {
    const whole = taxFor({ carry_mg: 137, keep: 0 }, mg, 1e9);
    for (let i = 0; i < 97; i++) payCraft(whole);
    for (const cut of [1, 2, 3, 7, 31]) {
      let carry = 137, paid = 0, left = 97;
      while (left > 0) {
        const t = taxFor({ carry_mg: carry, keep: 0 }, mg, 1e9);
        const m = Math.min(cut, left);
        for (let i = 0; i < m; i++) payCraft(t);
        carry = t.carry; paid += t.paid; left -= m;
      }
      if (paid !== whole.paid || carry !== whole.carry) splitBad = { mg, cut, paid, carry, whole };
    }
    const lean = taxFor({ carry_mg: 0, keep: 2 }, mg, 7);
    if (craftsCovered(lean) !== (() => { const t = { ...lean }; let k = 0; while (canPayNext(t) && k < 1e5) { payCraft(t); k++; } return k; })()) splitBad = { mg, covered: craftsCovered(lean) };
  }
  arm('T-SPLIT', splitBad === null && taxFor(null, 900, 100) === null && taxFor({}, 0, 100) === null,
    'any cut of a run into windows charges the same gold and the same carry; craftsCovered agrees with the craft-by-craft stop; no section means no tax',
    `a cut changed the bill: ${js(splitBad)}`);

  /* ── T-WORDS ── */
  if (opts && opts.fee) {
    const F = opts.fee;
    const hat = recipeMaking('smithing', 'iron_hatchets');
    const cs = (purse, keep, bag) => ({ read: (k) => (k === 'bench_tax' ? { rooms: { smithing: { permille: 150, room: 'forge', free: false } }, fees: { [hat.id]: 9750, [IRON.id]: 900, [COPPER.id + '_x']: 3000 }, carry_mg: 0, keep, run: { r: IRON.id, s: '2026-11-01T00:00:00Z', c: 4, g: 3, e: 'gold', at: '2026-11-01T00:01:00Z' } }
      : k === 'state' ? { gold: purse, gold_v: 1 } : k === 'shop' ? { offers: [], bids: { iron_bar: 6, copper_bar: 3 } } : k === 'inventory' ? bag : null) });
    const w = { kind: 'artisan', id: hat.id, skill: 'smithing', row: hat };
    const low = cs(3, 0, { iron_bar: 40, copper_bar: 2 });
    const none = cs(0, 0, {});
    const recap = F.benchStopRecapOf(low, () => 'Iron Bar');
    const words = [F.feeRowWords(low, w), F.feeFullWords(low, w), F.feeHeadWords(low, 'smithing'), F.feeBlock(low, w), F.feeBlock(none, w), F.feeBlock(cs(500, 0, {}), w), F.benchEndWords(low, () => 'Iron Bar')];
    const goodWords = words[0] === 'The public bench takes about 10 gold a craft.'
      && words[1] === 'The public bench takes about 10 gold a craft. A forge in your house takes none.'
      && /15% .*A forge in your house takes none\./.test(words[2])
      && /Sell your 40 Iron Bar at the shop, or gather something: gathering is free\./.test(words[3]) && /wants 9 gold/.test(words[3])
      && /Gather something and sell it: gathering is free\./.test(words[4]) && words[5] === ''
      && /Iron Bar stopped after 4: out of gold for the bench fee\. 3 gold paid/.test(words[6]) && !/_|bench_tax/.test(words.join(' '))
      && F.feeWords(450) === 'about 1 gold every 2 crafts' && F.feeWords(3000) === '3 gold a craft'
      && F.benchPaidWords(low, IRON.id, Date.parse('2026-11-01T00:00:00Z')) === '3 gold to the public bench'
      && !!recap && recap.kind === 'away' && recap.id.startsWith('bench-gold:') && recap.text === words[6];
    arm('T-WORDS', goodWords, 'the row, the start screen, the refusal and the end line say the server\'s numbers in plain words and name the stack to sell',
      `the words: ${js(words)}`);
  }
  return red;
}

async function loadEdge(dir) {
  const tick = await import(pathToFileURL(join(dir, FN, 'tick.js')).href + `?m=${seq}`);
  const sa = await import(pathToFileURL(join(dir, FN, 'set-activity.js')).href + `?m=${seq}`);
  return { tick, setActivity: sa.runSetActivity };
}
async function prepare(db) {
  await db.query("insert into public.hr_flags (key, enabled, note) values ('town_presence', true, 'bench-tax') on conflict (key) do update set enabled = true");
  await db.query('update public.hr_tick_config set enabled = true where id');
}

const JS_MUTANTS = [
  { id: 'no_stop', arm: 'T-GOLD', file: 'src/core/artisan-sim.js', why: 'a craft runs with its fee unpaid (materials spent, then the apply refuses)',
    from: "        if (!c.tax || canPayNext(c.tax)) return false;", to: '        return false;' },
  { id: 'no_carry', arm: 'T-VIEWED', file: 'src/core/bench-tax.js', why: 'the carry is dropped: a fee under a gold is free however many crafts run',
    from: '  tax.carry = (tax.carry + tax.mg) % 1000;', to: '  tax.carry = 0;' },
  { id: 'no_tax', arm: 'T-VIEWED', file: `${FN}/accrual.js`, why: 'the engine proposes no tax at all (hr_apply refuses it, owed, never free)',
    from: '  const tax = taxFor(inp.benchTax, inp.benchTax && inp.benchTax.now_mg, inp.gold);', to: '  const tax = null;' },
  { id: 'runs_on', arm: 'T-GOLD', file: `${FN}/accrual.js`, why: 'a gold stop leaves the pointer on the bench',
    from: '                || summary.stoppedBy === ARTISAN_STOP.GOLD\n', to: '' },
  { id: 'purse_ignored', arm: 'T-GOLD', file: `${FN}/accrual.js`, why: 'the engine reads an endless purse',
    from: 'inp.benchTax.now_mg, inp.gold);', to: 'inp.benchTax.now_mg, 1e12);' },
];
/* On the migration: caught when its own §5 refuses the file, or by the arm on the chain it built. */
const SQL_MUTANTS = [
  { id: 'room_ignored', arm: 'T-HOUSE', expect: /bench-tax §5\(g\)/, why: 'owning the room takes nothing off',
    edits: [["  return (select case when exists (select 1 from public.hr_bench_tax_rates r\n", "  return (select case when false and exists (select 1 from public.hr_bench_tax_rates r\n"]] },
  { id: 'keep_ignored', arm: 'T-KEEP', expect: /bench-tax §5\(f\)/, why: 'the fee takes what the hero set to keep',
    edits: [["    if v_fee > 0 then v_keep := public.hr_bench_tax_keep(p_user, p_slot); end if;\n", "    v_keep := 0;\n"]] },
  { id: 'kept_key', arm: 'T-RACE', expect: /bench-tax §5\((b|f)\)/, why: 'a refused window keeps its key, so the re-read replays the refusal for a day',
    edits: [["          or v_out->>'error' like 'bench\\_tax\\_%') then\n", "          or false) then\n"]] },
  { id: 'any_gold', arm: 'T-VIEWED', expect: /bench-tax §5\(c\)/, why: 'the database takes whatever gold the engine proposes',
    edits: [["    if v_gold <> -v_fee then\n", "    if false then\n"]] },
  { id: 'count_believed', arm: 'T-VIEWED', expect: /bench-tax §5\(c\)/, why: 'a count below the spent materials is believed',
    edits: [["        if v_per > 0 and v_c * v_per < e.qty then\n", "        if false then\n"]] },
  { id: 'wrong_kind', arm: 'T-LEDGER', expect: /bench-tax §5\(e\)/, why: 'the tax files as town work, no sink line',
    edits: [["when p_kind = ''craft'' then ''bench_tax''", "when p_kind = ''craft'' then ''town_work''"]] },
  { id: 'no_cheap_line', arm: 'T-FREE', why: 'the cheap goods line is not read: Copper Bars are charged',
    edits: [["         case when r.permille::bigint * v.unit * r.qty < r.free_under_mg then 0::bigint else", "         case when false then 0::bigint else"]] },
  { id: 'carry_lost', arm: 'T-LEDGER', expect: /bench-tax §5\(d\)/, why: 'the carry is not written back',
    edits: [["           bench_tax_carry_mg = coalesce((v_tax->>'carry')::int, bench_tax_carry_mg),\n", "           bench_tax_carry_mg = bench_tax_carry_mg,\n"]] },
];

async function words() {
  const F = await import(pathToFileURL(join(ROOT, 'src/shell/bench-fee.js')).href);
  return F;
}

async function main() {
  let db;
  if (!MUTATE) {
    try { ({ db } = await bootReplay()); } catch (e) { console.error(`bench-tax: HARNESS — ${String(e.message).split('\n').slice(0, 3).join(' ').slice(0, 900)}`); process.exit(2); }
    try {
      await prepare(db);
      const { tick, setActivity } = await loadEdge(ROOT);
      console.log('\nbench-tax — a public bench takes a share of what a job sells for, viewed or with the browser closed\n');
      const SNAP = `select md5(replace(pg_get_functiondef('public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure), chr(13), '')) a,
                           md5(pg_get_functiondef('public.hr_gold_kind(text,text,uuid)'::regprocedure)) k,
                           (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.player_ledger'::regclass and conname = 'player_ledger_gold_kind') c,
                           (select md5(string_agg(t::text, ',' order by recipe_id)) from public.hr_bench_tax_rates t) r`;
      const s1 = js((await db.query(SNAP)).rows);
      let again = null;
      for (const f of [RATES, MIG]) {
        const src = readFileSync(join(ROOT, 'supabase', 'migrations', f), 'utf8').replace(/\r\n/g, '\n');
        try { await db.exec(`begin;\n${src}\ncommit;`); } catch (e) { await db.exec('rollback').catch(() => {}); again = f + ': ' + String(e.message).split('\n')[0]; }
      }
      const s2 = js((await db.query(SNAP)).rows);
      const idemOk = again === null && s1 === s2;
      console.log(idemOk ? '  ✓ T-IDEM — a second apply of both files (their self-checks included) moves nothing' : `  ✗ T-IDEM — ${again || 'the second apply moved state'}`);
      const red = await arms(db, tick, setActivity, { fee: await words() });
      if (!idemOk) red.set('T-IDEM', 'second apply');
      console.log(red.size ? `\nbench-tax: RED (${red.size})` : '\nbench-tax: green');
      process.exitCode = red.size ? 1 : 0;
    } catch (e) {
      console.error(`bench-tax: HARNESS — ${String(e.stack || e.message).slice(0, 700)}`); process.exitCode = 2;
    } finally { await db.close().catch(() => {}); }
    return;
  }
  console.log('\nbench-tax --mutate\n');
  let survived = 0;
  try { ({ db } = await bootReplay()); } catch (e) { console.error(`bench-tax: HARNESS — ${e.message}`); process.exit(2); }
  try {
    await prepare(db);
    for (const mu of JS_MUTANTS) {
      const dir = mkdtempSync(join(tmpdir(), 'hr-benchtax-'));
      try {
        for (const d of ['src/core', 'src/data', FN]) cpSync(join(ROOT, d), join(dir, d), { recursive: true });
        cpSync(join(ROOT, 'src/build-info.js'), join(dir, 'src/build-info.js'));
        const p = join(dir, mu.file);
        const src = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
        if (src.split(mu.from).length !== 2) { console.error(`bench-tax: HARNESS — mutant ${mu.id}: anchor not found once in ${mu.file}`); process.exit(2); }
        if (!CONTROL) writeFileSync(p, src.replace(mu.from, () => mu.to));
        const { tick, setActivity } = await loadEdge(dir);
        const red = await arms(db, tick, setActivity);
        const caught = red.has(mu.arm);
        console.log(caught ? `  ✓ ${mu.id} — caught by ${mu.arm} (${mu.why})` : `  ✗ ${mu.id} — SURVIVED (${mu.why}); red: ${[...red.keys()].join(', ') || 'none'}`);
        if (!caught) survived++;
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }
  } finally { await db.close().catch(() => {}); }
  for (const mu of SQL_MUTANTS) {
    let mdb;
    try { ({ db: mdb } = await bootReplay(CONTROL ? {} : { patches: new Map([[mu.file || MIG, mu.edits]]), upTo: LAST_PATCHED })); }
    catch (e) {
      if (e && e.harness) { console.error(`bench-tax: HARNESS — mutant ${mu.id}: ${e.message}`); process.exit(2); }
      const msg = String(e.message);
      const hit = msg.includes(`${mu.file || MIG} failed to apply`) && (mu.expect || /bench-tax §5/).test(msg);
      console.log(hit ? `  ✓ ${mu.id} — refused by the file's own §5 (${mu.why})` : `  ✗ ${mu.id} — the chain failed for another reason: ${msg.split('\n').slice(0, 2).join(' ').slice(0, 240)}`);
      if (!hit) survived++;
      continue;
    }
    try {
      await prepare(mdb);
      const { tick, setActivity } = await loadEdge(ROOT);
      const red = await arms(mdb, tick, setActivity);
      const caught = red.has(mu.arm);
      console.log(caught ? `  ✓ ${mu.id} — caught by ${mu.arm} (${mu.why})` : `  ✗ ${mu.id} — SURVIVED (${mu.why}); red: ${[...red.keys()].join(', ') || 'none'}`);
      if (!caught) survived++;
    } finally { await mdb.close().catch(() => {}); }
  }
  const total = JS_MUTANTS.length + SQL_MUTANTS.length;
  console.log(survived ? `\nbench-tax --mutate: ${survived} survived` : `\nbench-tax --mutate: ${total}/${total} caught`);
  process.exitCode = survived ? 1 : 0;
}

await main();
