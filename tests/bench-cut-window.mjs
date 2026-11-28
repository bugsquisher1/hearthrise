#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/bench-cut-window.mjs — THE CUT'S EDGE ON THE DATABASE JUST BEFORE THE CUT (lane/bench-cut-edge;
//   docs/design/redesign/09-crafting.md 4.17, the order: the release's one hr-accrue deploy lands before
//   1079-one-town-work-cut.sql applies).
//
//   node tests/bench-cut-window.mjs            the guard (the chain up to the file before 1079, the shipped edge)
//   node tests/bench-cut-window.mjs --mutate   every planted defect (an edge copy) must turn its arm red
//
// mutant-anchors: supabase/functions/hr-accrue/catalogue.js, supabase/functions/hr-accrue/set-activity.js, supabase/functions/hr-accrue/accrue-artisan.js, supabase/functions/hr-accrue/tick.js
//
// ci-step: db-replay-17 | Bench cut window - the cut's edge on the hr_apply just before 1079, nothing minted or paid twice, one hero never stops the tick
// ci-run: node tests/bench-cut-window.mjs
// ci-run: node tools/mutant-gate.mjs node tests/bench-cut-window.mjs --mutate
//
// Between the deploy and the apply a hero still holds a gather or a bench pointer, on an hr_apply that prices a bench
// and refuses a taxed window with no `bench_tax` (`bench_tax_missing`). Tyler (2026-11-28): everyone starts over at the
// launch, so nothing carries such a hero: it may sit stuck or go idle, and its unpaid work is dropped. What must hold is
// SAFETY, at every door the edge has (the player's own stop and switch, the accrue poll, the world tick):
//
//   W-REAL    the fixture is the real window: this chain's hr_apply does refuse the taxed bench `bench_tax_missing`,
//             and does list the gather node and both benches (else every arm below proves nothing)
//   W-SAFE    a gather, a taxed bench and an untaxed bench pointer move NO goods at any door, asked twice: bag,
//             Storage, gold, XP and worn items are identical and no ledger row moves a value
//   W-TICK    those heroes first in the roster, one of them throwing on its read, do not stop the fire: the fuel hero
//             behind them is settled in the same fire, with the catch-up dial up too
//   W-FUEL    the fuel run pays at every door, once: the fuel burnt is the actions journalled, and a second settle of
//             the same window burns and pays nothing
//   W-COUNT   "Burn" (a count of one, which this hr_apply keeps as active_left) burns one, the browser open or closed
//
// The accrue poll is driven through the engine and hr_apply directly (index.ts's own loop is Deno's, and
// tests/accrual-engine.mjs holds its call site to the collect's): a stated limit. This guard's subject ends when 1079
// applies; it retires then, with the file that owns the cut.
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { bootReplay, chainFiles, ROOT } from './schema-replay.mjs';

const MUTATE = process.argv.includes('--mutate') || process.argv.includes('--selftest');
const CONTROL = Boolean(process.env.HR_MUTANT_CONTROL);
const FN = 'supabase/functions/hr-accrue';
const CUT = '1079-one-town-work-cut.sql';
const RUN = 'fuel_bones';
const FUEL = 'bones';
const COLORS = '{"head": 13, "body": 5, "legs": 3, "feet": 0}';

let seq = 0;
const nextUid = () => `000000c7-0000-4000-8000-0000000c${String(++seq).padStart(4, '0')}`;
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
/* The seam index.ts hands the engine: one statement, its own transaction, as hr_engine. `bad` throws on any statement
   that names it: a hero whose read fails. */
const engineExec = (db, bad = null) => async (text, params) => {
  if (bad && (params || []).some((p) => String(p).includes(bad))) throw new Error('planted: this hero cannot be read');
  await db.exec('begin'); await db.exec('set local role hr_engine');
  try { return (await db.query(text, params)).rows; } finally { await db.exec('commit'); }
};

/* A hero made the real way, its bag `items`, put on `kind`/`id` the way the settle writes it, `agoS` ago. */
async function hero(db, kind, id, items, agoS = 600) {
  const uid = nextUid();
  await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [uid]);
  await db.query('insert into public.profiles (id, display_name) values ($1, $2) on conflict (id) do update set display_name = excluded.display_name', [uid, 'Window ' + seq]);
  const name = 'Window' + String.fromCharCode(97 + (seq % 26)) + String.fromCharCode(97 + Math.floor(seq / 26) % 26);
  const h = await as(db, uid, 'select public.hr_create_hero(0, $1, $2::jsonb, $3::uuid)', [name, COLORS, idem()]);
  if (!h || h.ok !== true) throw Object.assign(new Error('hr_create_hero refused: ' + js(h)), { harness: true });
  for (const [item, n] of Object.entries(items)) {
    await db.query(`insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, $2, $3)
                    on conflict (user_id, slot, item_id) do update set qty = excluded.qty`, [uid, item, n]);
  }
  await db.query('update public.account_wallet set gold = 5000 where user_id = $1', [uid]);
  await db.query(`update public.player_state set active_kind = $2, active_id = $3, active_since = now(), accrued_to = now(), last_seen_at = null
                   where user_id = $1 and slot = 0`, [uid, kind, id]);
  await db.query('select public.hr_tick_enrol(200)');
  await rewind(db, uid, agoS);
  return uid;
}
async function rewind(db, uid, agoS) {
  await db.query(`update public.player_state set active_since = active_since - make_interval(secs => $2), accrued_to = accrued_to - make_interval(secs => $2)
                   where user_id = $1 and slot = 0`, [uid, agoS]);
  await db.query('update public.hr_return_anchor set real_return_at = real_return_at - make_interval(secs => $2) where user_id = $1 and slot = 0', [uid, agoS]);
}

/* Everything a hero can hold, and every ledger row that moved a value. */
const goods = async (db, uid) => js(await one(db, `select jsonb_build_object(
  'bag',  (select jsonb_object_agg(item_id, qty order by item_id) from public.player_inventory where user_id = $1),
  'bank', (select jsonb_object_agg(item_id, qty order by item_id) from public.account_bank where user_id = $1),
  'gold', (select gold from public.account_wallet where user_id = $1),
  'xp',   (select jsonb_object_agg(slot || ':' || skill_id, xp order by slot, skill_id) from public.player_skills where user_id = $1),
  'worn', (select jsonb_object_agg(slot || ':' || equip_slot, item_id order by slot, equip_slot) from public.player_equipment where user_id = $1),
  'valued', (select count(*) from public.player_ledger where user_id = $1
              and (coalesce(gold, 0) <> 0 or coalesce(gold_in, 0) <> 0 or coalesce(xp_in, 0) <> 0 or coalesce(qty_in, 0) <> 0)))`, [uid]));
const point = async (db, uid) => (await db.query(`select active_kind as kind, active_id as id, active_left as left, version, accrued_to
  from public.player_state where user_id = $1 and slot = 0`, [uid])).rows[0];
const bones = async (db, uid) => Number(await one(db, `select coalesce(sum(qty), 0) from public.player_inventory where user_id = $1 and item_id = '${FUEL}'`, [uid]));
const flame = async (db, uid) => Number(await one(db, "select coalesce(sum(xp), 0) from public.player_skills where user_id = $1 and skill_id = 'inner_flame'", [uid]));
/* The actions its craft rows say it burnt. */
const ticksOf = async (db, uid) => Number(await one(db, "select coalesce(sum((meta->>'ticks')::int), 0) from public.player_ledger where user_id = $1 and kind = 'craft'", [uid]));

/* ── THE DOORS ──────────────────────────────────────────────────────────── */
async function fire(db, edge, uids, over = {}) {
  await db.query('select public.hr_tick_enrol(200)');
  const holder = await one(db, "select left('cron:' || coalesce(current_database(), 'db'), 64)");
  await db.query('select count(*) from public.hr_tick_roster((select channels from public.hr_tick_config where id), 0, 200, $1, 30000, null, null, null)', [holder]);
  try {
    return (await edge.tick.runTick({ exec: engineExec(db, over.bad), body: { op: 'tick', roster: uids.map((u) => ({ user_id: u, slot: 0 })),
      cadence_ms: 10000, flush_ms: 90000, ...(over.body || {}) } })).body;
  } catch (e) { return { RAISED: String(e.message).slice(0, 200) }; }
}
const set = (db, edge, uid, activity) => edge.setActivity({ exec: engineExec(db), user: uid, slot: 0, intentId: idem(), activity })
  .catch((e) => ({ status: 0, body: { RAISED: String(e.message).slice(0, 160) } }));
/* The accrue poll: the engine over hr_state_of's own envelope as `accrue`, and hr_apply as hr_engine if it proposes. */
async function accrue(db, edge, uid) {
  const r = (await db.query('select public.hr_state_of($1, 0) as env, public.hr_accrue_cap_ms($1, 0) as cap, extract(epoch from now()) * 1000 as ms', [uid])).rows[0];
  const out = edge.accrual.computeAccrual({ userId: uid, slot: 0, nowMs: Math.floor(Number(r.ms)), ...edge.envelope.engineInputsFromEnvelope(r.env, Math.floor(Number(r.ms))),
    capMs: Number(r.cap), actionBudget: null, caller: 'accrue', callerAuthority: edge.accrual.CALLER_AUTHORITY, huntOpen: false, seed: 1, perks: null,
    items: edge.items, monsters: {}, recipes: edge.catalogue.FUEL_RUNS });
  if (!out.accrued) return { reason: out.reason };
  const [a] = await engineExec(db)('select public.hr_apply($1::uuid, 0, $2::bigint, $3::uuid, $4::text::jsonb) as res', [uid, r.env.version, idem(), JSON.stringify(out.delta)]);
  return { applied: a && a.res && (a.res.ok === true ? 'ok' : a.res.error) };
}
const DOORS = {
  accrue: (db, edge, uid) => accrue(db, edge, uid),
  tick: (db, edge, uid) => fire(db, edge, [uid]),
  switch: (db, edge, uid) => set(db, edge, uid, { kind: 'artisan', id: 'fuel_big_bones' }),
  stop: (db, edge, uid) => set(db, edge, uid, { kind: 'idle', id: null }),
};
const said = (r) => (r && r.body ? `${r.status} ${r.body.error || (r.body.forfeited ? 'ok, window dropped: ' + r.body.forfeited.reason : 'ok')}`
  : r && r.reason ? r.reason : r && r.reasons ? Object.keys(r.reasons).join(',') || 'ok' : js(r)).slice(0, 80);

async function arms(db, edge, fx) {
  const red = new Map();
  const arm = (id, pass, good, bad) => {
    if (!MUTATE) console.log(pass ? `  ✓ ${id} — ${good}` : `  ✗ ${id} — ${bad}`);
    if (!pass) red.set(id, bad);
  };
  await db.query('delete from public.hr_rate_counters');

  /* ── W-REAL ── */
  const t = await hero(db, 'artisan', fx.taxed.id, fx.taxed.bag);
  const ver = await one(db, 'select version from public.player_state where user_id = $1 and slot = 0', [t]);
  const [raw] = await engineExec(db)('select public.hr_apply($1::uuid, 0, $2::bigint, $3::uuid, $4::text::jsonb) as res',
    [t, ver, idem(), JSON.stringify({ accrued_to: 'now', items: { [fx.taxed.input]: -1 }, journal: { kind: 'craft', intent: 'accrue' } })]);
  const listed = await one(db, `select count(*)::int from public.hr_activities where (kind = 'gather' and activity_id = $1) or (kind = 'artisan' and activity_id = any($2::text[]))`,
    [fx.gather, [fx.taxed.id, fx.free.id]]);
  arm('W-REAL', raw.res && raw.res.error === 'bench_tax_missing' && listed === 3,
    `this hr_apply refuses the taxed bench (${fx.taxed.id}) bench_tax_missing and still lists ${fx.gather} and both benches`,
    `the fixture is not the window before ${CUT}: ${js({ answered: raw.res && raw.res.error, listed })}`);

  /* ── W-SAFE ── every cut pointer, every door, each asked twice; the same hero walks the doors in order, so a door's
     residue is the next one's input. The outcome is printed, never asserted: stuck or idle are both accepted. */
  const cut = [['gather', 'gather', fx.gather, { [FUEL]: 50 }], ['taxed bench', 'artisan', fx.taxed.id, fx.taxed.bag], ['untaxed bench', 'artisan', fx.free.id, fx.free.bag]];
  const moved = []; const ends = [];
  for (const [label, kind, id, bag] of cut) {
    for (const door of Object.keys(DOORS)) {
      const u = await hero(db, kind, id, bag);
      const before = await goods(db, u);
      const r1 = await DOORS[door](db, edge, u);
      const r2 = await DOORS[door](db, edge, u);
      /* what a switch that went through started is the new run's, not the old pointer's */
      const after = await goods(db, u);
      if (after !== before) moved.push(`${label} at ${door}: ${before} -> ${after}`);
      if (js(r1).includes('RAISED') || js(r2).includes('RAISED')) moved.push(`${label} at ${door} raised: ${js([r1, r2]).slice(0, 200)}`);
      const p = await point(db, u);
      ends.push(`${label} at ${door}: ${said(r1)} -> ${p.kind}${p.id ? '/' + p.id : ''}`);
    }
  }
  arm('W-SAFE', moved.length === 0,
    'gather, taxed bench and untaxed bench pointers moved no goods at any door, asked twice',
    `A CUT POINTER MOVED GOODS: ${moved.join(' | ').slice(0, 700)}`);
  if (!MUTATE) for (const e of ends) console.log(`      ${e}`);

  /* ── W-TICK ── the cut heroes first, the last of them throwing on its read, the fuel hero behind them. */
  const firesOk = [];
  for (const body of [{}, { catchup_windows: 4 }]) {
    const g = await hero(db, 'gather', fx.gather, {});
    const b = await hero(db, 'artisan', fx.taxed.id, fx.taxed.bag);
    const n = await hero(db, 'artisan', fx.free.id, fx.free.bag);
    const bad = await hero(db, 'artisan', RUN, { [FUEL]: 5 });
    const f = await hero(db, 'artisan', RUN, { [FUEL]: 20 });
    const before = await Promise.all([goods(db, g), goods(db, b), goods(db, n)]);
    const r = await fire(db, edge, [g, b, n, bad, f], { bad, body });
    const after = [await goods(db, g), await goods(db, b), await goods(db, n)];
    firesOk.push({ raised: r.RAISED || null, fuelLeft: await bones(db, f), still: js(before) === js(after), reasons: r.reasons });
  }
  arm('W-TICK', firesOk.every((x) => !x.raised && x.fuelLeft === 0 && x.still),
    `three cut heroes and one that throws did not stop the fire: the fuel hero behind them was settled (${js(firesOk.map((x) => x.reasons)).slice(0, 220)})`,
    `ONE HERO STOPPED THE TICK (or moved goods): ${js(firesOk).slice(0, 500)}`);

  /* ── W-FUEL ── every door pays the same run once. */
  const bad = [];
  for (const door of Object.keys(DOORS)) {
    const u = await hero(db, 'artisan', RUN, { [FUEL]: 1000 });
    const b0 = await bones(db, u); const x0 = await flame(db, u);
    await DOORS[door](db, edge, u);
    const b1 = await bones(db, u); const x1 = await flame(db, u); const t1 = await ticksOf(db, u);
    if (!(b0 - b1 > 0 && x1 > x0 && b0 - b1 === t1)) bad.push(`${door}: burnt ${b0 - b1}, journalled ${t1}, XP +${x1 - x0}`);
    /* the same window asked again, by every door: at most the seconds this test took can be owed (one 640 ms action each). */
    const t0 = Date.now();
    for (const again of ['accrue', 'stop']) await DOORS[again](db, edge, u);
    const spare = Math.ceil((Date.now() - t0 + 2000) / 640);
    const b2 = await bones(db, u); const t2 = await ticksOf(db, u);
    /* a tick settles one 90 s flush a fire and leaves the rest OWED: the second settle pays that remainder, so what is
       bounded is the total, the whole ten-minute window once. */
    const whole = Math.floor(600000 / 640) + spare + Math.ceil((Date.now() - t0) / 640);
    if (b0 - b2 !== t2 || b0 - b2 > whole) bad.push(`${door}, asked again: burnt ${b0 - b2}, journalled ${t2}, the window holds ${whole}`);
  }
  arm('W-FUEL', bad.length === 0, 'the fuel run pays at every door, the fuel burnt is the actions journalled, and no window is paid twice',
    `THE FUEL RUN: ${bad.join(' | ')}`);

  /* ── W-COUNT ── "Burn", started through the verb, its window settled viewed and closed. */
  const counts = [];
  for (const door of ['accrue', 'tick', 'stop']) {
    const u = await hero(db, 'idle', null, { [FUEL]: 50 }, 0);
    const s = await set(db, edge, u, { kind: 'artisan', id: RUN, count: 1 });
    const kept = await point(db, u);
    await db.query('select public.hr_tick_enrol(200)');
    await rewind(db, u, 600);
    const r = await DOORS[door](db, edge, u);
    const p = await point(db, u);
    const left = await bones(db, u);
    counts.push({ door, start: s.status, kept: kept.left, left, end: p.kind, answered: said(r) });
  }
  arm('W-COUNT', counts.every((c) => c.start === 200 && Number(c.kept) === 1 && c.left === 49 && c.end === 'idle'),
    '"Burn" burns one of fifty and goes idle, polled, stopped and with the browser closed',
    `A COUNT OF ONE: ${js(counts)}`);
  return red;
}

async function loadEdge(dir) {
  const imp = (p) => import(pathToFileURL(join(dir, p)).href + `?w=${++seq}`);
  const [tick, sa, accrual, envelope, catalogue, items] = [await imp(`${FN}/tick.js`), await imp(`${FN}/set-activity.js`), await imp(`${FN}/accrual.js`),
    await imp(`${FN}/envelope.js`), await imp(`${FN}/catalogue.js`), await imp('src/data/items.js')];
  return { tick, setActivity: sa.runSetActivity, accrual, envelope, catalogue, items: items.ITEMS };
}

/* The pointers of the window, read from THIS chain's own catalogue (the data lane deletes the bench rows from src/data). */
async function fixture(db) {
  await db.query("insert into public.hr_flags (key, enabled, note) values ('town_presence', true, 'bench-cut-window') on conflict (key) do update set enabled = true");
  await db.query('update public.hr_tick_config set enabled = true where id');
  const inputs = await one(db, 'select public.hr_bench_inputs()');
  const rows = (await db.query(`select a.activity_id as id, public.hr_bench_tax_mg(a.activity_id)::int as mg from public.hr_activities a
     where a.kind = 'artisan' and a.req_skill is distinct from 'inner_flame' order by a.req_lv nulls first, a.activity_id`)).rows.filter((r) => inputs[r.id]);
  const of = (r) => r && { id: r.id, input: Object.keys(inputs[r.id])[0], bag: Object.fromEntries(Object.entries(inputs[r.id]).map(([k, n]) => [k, Number(n) * 1000])) };
  const fx = { taxed: of(rows.find((r) => r.mg > 0)), free: of(rows.find((r) => !(r.mg > 0))),
    gather: await one(db, "select activity_id from public.hr_activities where kind = 'gather' order by req_lv nulls first, activity_id limit 1") };
  if (!fx.taxed || !fx.free || !fx.gather) throw Object.assign(new Error('no taxed bench, untaxed bench or gather node on this chain: ' + js(fx)), { harness: true });
  return fx;
}

const MUTANTS = [
  { id: 'bench_priced', arm: 'W-SAFE', file: `${FN}/catalogue.js`, why: 'the engine prices a bench again, as a fuel: its inputs burn for XP',
    from: 'export const FUEL_RUNS = indexFuelRuns(ARTISAN_RECIPES);',
    to: 'export const FUEL_RUNS = new Proxy(indexFuelRuns(ARTISAN_RECIPES), { get: (t, k) => t[k] || { skill: "inner_flame", recipe: { id: k, input: globalThis.__W_INPUT[k], output: null, xp: 9, ms: 400 } }, getOwnPropertyDescriptor: (t, k) => Reflect.getOwnPropertyDescriptor(t, k) || { value: 1, configurable: true, enumerable: true } });' },
  { id: 'drop_pays', arm: 'W-SAFE', file: `${FN}/set-activity.js`, why: 'the window a Stop drops pays something for it',
    from: "    accrued_to: 'now',\n    journal: {", to: "    accrued_to: 'now',\n    items: { bones: 5 },\n    journal: {" },
  { id: 'one_stops_all', arm: 'W-TICK', file: `${FN}/tick.js`, why: 'one hero\'s failure ends the fire',
    from: "      v = { outcome: 'refused', reason: 'error:' + String((e && e.message) || e).slice(0, 64) };\n    }\n    counts[v.outcome]",
    to: "      throw e;\n    }\n    counts[v.outcome]" },
  { id: 'watermark_held', arm: 'W-FUEL', file: `${FN}/accrue-artisan.js`, why: 'a paid window leaves the watermark where it was: the next settle pays it again',
    from: '  const settledTo = runOver ? nowMs : settledWatermarkMs(', to: '  const settledTo = runOver ? nowMs : credit.fromMs; void (' },
  { id: 'journal_short', arm: 'W-FUEL', file: `${FN}/accrue-artisan.js`, why: 'the journal states fewer actions than the fuel burnt',
    from: 'ms: grantMs, ticks: summary.ticks, capped,', to: 'ms: grantMs, ticks: Math.floor(summary.ticks / 2), capped,' },
  { id: 'count_unread', arm: 'W-COUNT', file: `${FN}/accrue-artisan.js`, why: '"Burn" burns the stack',
    from: '    maxActions: runCap(inp.actionBudget, left0),', to: '    maxActions: inp.actionBudget,' },
];

async function main() {
  let db; let fx;
  try {
    const files = (await chainFiles()).map(([f]) => f);
    const at = files.indexOf(CUT);
    const upTo = at > 0 ? files[at - 1] : files[files.length - 1];
    ({ db } = await bootReplay({ upTo }));
    fx = await fixture(db);
    globalThis.__W_INPUT = { [fx.taxed.id]: fx.taxed.input, [fx.free.id]: fx.free.input };
    console.log(`\nbench-cut-window${MUTATE ? ' --mutate' : ''} — the cut's edge on the chain up to ${upTo}\n`);
  } catch (e) { console.error(`bench-cut-window: HARNESS — ${String(e.message).split('\n').slice(0, 2).join(' ')}`); process.exit(2); }
  try {
    if (!MUTATE) {
      const red = await arms(db, await loadEdge(ROOT), fx);
      console.log(red.size ? `\nbench-cut-window: RED (${red.size})` : '\nbench-cut-window: green');
      process.exitCode = red.size ? 1 : 0;
      return;
    }
    const clean = await arms(db, await loadEdge(ROOT), fx);
    if (clean.size) { console.error(`bench-cut-window: HARNESS — the unmutated edge is red: ${[...clean.values()].join(' | ').slice(0, 400)}`); process.exitCode = 2; return; }
    let survived = 0;
    for (const mu of MUTANTS) {
      const dir = mkdtempSync(join(tmpdir(), 'hr-cutwin-'));
      try {
        for (const d of ['src/core', 'src/data', FN]) cpSync(join(ROOT, d), join(dir, d), { recursive: true });
        cpSync(join(ROOT, 'src/build-info.js'), join(dir, 'src/build-info.js'));
        const p = join(dir, mu.file);
        const src = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
        if (src.split(mu.from).length !== 2) { console.error(`bench-cut-window: HARNESS — mutant ${mu.id}: anchor not found once in ${mu.file}`); process.exitCode = 2; return; }
        if (!CONTROL) writeFileSync(p, src.replace(mu.from, () => mu.to));
        const red = await arms(db, await loadEdge(dir), fx);
        const caught = red.has(mu.arm);
        console.log(caught ? `  ✓ ${mu.id} — caught by ${mu.arm} (${mu.why})` : `  ✗ ${mu.id} — SURVIVED (${mu.why}); red: ${[...red.keys()].join(', ') || 'none'}`);
        if (!caught) survived++;
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }
    console.log(survived ? `\nbench-cut-window --mutate: ${survived} survived` : `\nbench-cut-window --mutate: ${MUTANTS.length}/${MUTANTS.length} caught`);
    process.exitCode = survived ? 1 : 0;
  } catch (e) {
    console.error(`bench-cut-window: HARNESS — ${String(e && e.stack || e).slice(0, 500)}`); process.exitCode = 2;
  } finally { await db.close().catch(() => {}); }
}

await main();
