#!/usr/bin/env node
// tests/store-step.mjs — A STORE USE IS PRICED AT THE BUYER'S STORE STEP (1061-store-step-catalogue.generated.sql, 1062-store-step.sql;
//   lane/econ-followups, backend-architect, 2026-11-22; Tyler 2026-11-22: goods are priced by depth; CLAUDE.md §1, §4 both paths).
//
//   node tests/store-step.mjs            the guard
//   node tests/store-step.mjs --mutate   the proof: each SQL mutant, planted in a live body on a booted replay, turns its own arm red
//
// THE RULE (src/core/wage.js storeStepOf, src/data/store-kit.js storePriceOf, src/data/supply-basics.js storeUsePrice): on the Danger
// scale a use costs its row at the depth the hunt stands at as the settle window opens, in the wage's unit (depthStep); off it, at the
// hero's Level. A row's own made-at step prices its LIST price only.
//
// THE MEASURE: the replayed chain (PGlite), the shipped world tick and the viewed hello (tools/settle-cost.mjs prepare), the real engine.
//   SS-PRICE  the server's twin hr_store_price is the JS storeUsePrice for every store row at every step 1..1000 and every 7th to past
//             the last: the same whole gold
//   SS-TOWN   a Level 60 hero in town: hr_store_step is its Level, and the settings view's store (what the client renders) lists every
//             row at that step's price, never the list price
//   SS-BILL   BOTH PATHS: a four on Muster Barrows that last held step 760 (far past its edge, so it falls back window after window), a
//             store food on every bar, browser closed (the tick's `fire` door) and hunt viewed (the `viewed` door). Every supply_buy the
//             server journalled prices each unit at the depth the window OPENED at (the stored world's step read before the window), in
//             the wage's unit, and its gold is qty x that price. CONTROLS: food was bought, the windows opened at more than one depth, and
//             the depth price differs from the hero's Level price and from the row's list price (the arm can tell the three apart)
//   SS-READ   the hunt still open: the engine's input (hr_hunt_member_read's `basics`) and the settings view both price every row at the
//             depth the stored world stands at now: the price the next window's bill will charge
//   SS-CLASS  no public function that reads the store's rows prices a use from a row's list price (`<alias>.price` of
//             hr_hunt_basic_supplies): the one reader is hr_store_price
// Exit: 0 green · 1 a red arm or an escaped mutant · 2 a harness problem.
//
// mutant-anchors: none — every mutant is planted in a live function body read from the booted replay (pg_get_functiondef); no tracked
//   file is patched
// ci-step: Store priced at the buyer's step — the server's depth or Level, both paths
// ci-run: node tests/store-step.mjs
// ci-run: node tools/mutant-gate.mjs node tests/store-step.mjs --mutate
import { isMain } from './_is-main.mjs';
import { bootReplay } from './schema-replay.mjs';
import { prepare } from '../tools/settle-cost.mjs';
import { BASIC_SUPPLIES, BASIC_INDEX, storeUsePrice } from '../src/data/supply-basics.js';
import { depthStep, levelStep } from '../src/core/wage.js';
import { DANGER } from '../src/data/danger.js';

const ANCHOR = Date.UTC(2026, 10, 1, 12, 0, 0);
const MUSTER = 'muster_barrows';
const LEVEL = 60;
const DEEP = 760;
const FOOD = 'salted_shrimp';
/* every weapon and armor piece item Level 60 (tests/danger-db.mjs REF_KIT): at 760 it falls back rather than dying in its first pull */
const REF_KIT = Object.freeze({ helmet: 'rune_helm', body: 'rune_platebody', pants: 'rune_platelegs', boots: 'rune_boots', gloves: 'rune_gauntlets', belt: 'rune_belt',
  weapon: 'rune_sword', shield: 'coppercap_shield' });
const BAR = Object.freeze({ supply_source: 'mine', on_empty: 'switch', gold_floor: 0,
  slots: [{ action: { type: 'consume', id: FOOD }, conditions: [{ metric: 'self_hp_pct', op: 'lt', value: 97 }], join: 'and' }] });
const one = async (db, sql, params) => { const r = await db.query(sql, params); const row = r.rows[0]; return row ? row[Object.keys(row)[0]] : null; };
const worldStep = async (db, inst) => {
  const w = await one(db, 'select public.hr_danger_world(i.world) from public.hunt_instances i where i.id = $1', [inst]);
  if (w && typeof w.step === 'number') return w.step;
  return Number(await one(db, 'select danger from public.hunt_instances where id = $1', [inst]));
};

/* SS-PRICE */
async function twin(db) {
  const problems = [];
  const steps = [...Array.from({ length: 1000 }, (_, i) => i + 1), ...Array.from({ length: 430 }, (_, i) => 1001 + 7 * i), DANGER.stepMax, DANGER.stepMax + 1];
  const rows = (await db.query('select t.basic_id, s, public.hr_store_price(t.basic_id, s) as p from public.hr_store_terms t cross join unnest($1::int[]) s', [steps])).rows;
  if (rows.length !== BASIC_SUPPLIES.length * steps.length) problems.push('SS-PRICE CONTROL: the server holds ' + rows.length / steps.length + ' store terms, the data ' + BASIC_SUPPLIES.length);
  let bad = 0;
  for (const r of rows) {
    const want = storeUsePrice(r.basic_id, r.s);
    if (Number(r.p) !== want) { if (bad++ < 5) problems.push('SS-PRICE ' + r.basic_id + ' at step ' + r.s + ' costs ' + r.p + ' on the server, ' + want + ' in src/data/store-kit.js'); }
  }
  if (bad > 5) problems.push('SS-PRICE ... ' + (bad - 5) + ' more');
  return problems;
}

/* SS-CLASS */
async function theClass(db) {
  const bad = (await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosrc like '%hr_hunt_basic_supplies%' and p.prosrc ~ '[a-z_]\\.price\\M' order by 1`)).rows.map((r) => r.proname);
  return bad.length ? ['SS-CLASS ' + bad.join(', ') + ' price a use from a store row\'s list price, not hr_store_price at the buyer\'s step'] : [];
}

/* One door on Muster: a four from step DEEP, the store food on every bar; SS-TOWN before it enters, SS-BILL per window, SS-READ at the end. */
async function door(db, which, o = {}) {
  const problems = [];
  const tag = (arm) => arm + ' ' + which + ':';
  let town = null;
  const run = await prepare({ heroes: 4, windows: o.windows || 3, windowMs: o.windowMs || 90000, hunt: MUSTER, door: which, db, level: LEVEL, anchorMs: ANCHOR, gear: REF_KIT,
    beforeEnter: async ({ db: d, uids, asUser, one: q, idem }) => {
      for (const uid of uids) {
        await d.query('insert into public.hunt_density (user_id, slot, hunt_id, density, danger_held) values ($1, 0, $2, 0, $3) on conflict (user_id, slot, hunt_id) do update set danger_held = excluded.danger_held', [uid, MUSTER, DEEP]);
        await asUser(uid);
        const r = await q(d, 'select public.hr_action_set_options(0, 0, $1::jsonb, $2::uuid)', [JSON.stringify(BAR), idem()]);
        if (!r || r.ok !== true) throw new Error('HARNESS: the store bar was refused: ' + JSON.stringify(r).slice(0, 200));
      }
      /* SS-TOWN: the first hero, in town, before it enters */
      const lv = Number(await q(d, 'select public.hr_level_of($1::uuid, 0)', [uids[0]]));
      const step = Number(await q(d, 'select public.hr_store_step(null, $1::uuid, 0)', [uids[0]]));
      const store = await q(d, "select public.hr_hunt_settings_view($1::uuid, 0)->'store'", [uids[0]]);
      town = { lv, step, store };
    } });
  const inst = await one(db, 'select instance_id from public.hunt_sessions where hunt_id = $1 and ended_at is null limit 1', [MUSTER]);
  const uids = (await db.query('select user_id from public.hunt_sessions where instance_id = $1 order by seat', [inst])).rows.map((r) => r.user_id);
  if (!town) problems.push(tag('SS-TOWN') + ' HARNESS: the town read never ran');
  else {
    if (town.lv !== LEVEL || town.step !== levelStep(LEVEL)) problems.push(tag('SS-TOWN') + ' a Level ' + town.lv + ' hero in town prices at step ' + town.step + ', want its Level ' + LEVEL);
    const off = (town.store || []).filter((r) => r.price !== storeUsePrice(r.id, levelStep(LEVEL))).map((r) => r.id + ' ' + r.price + ' (want ' + storeUsePrice(r.id, levelStep(LEVEL)) + ')');
    if (!Array.isArray(town.store) || town.store.length !== BASIC_SUPPLIES.length || off.length) problems.push(tag('SS-TOWN') + ' the settings view lists ' + (off.slice(0, 4).join(', ') || (town.store || []).length + ' rows'));
  }
  /* SS-BILL: each window's opening depth, then the rows it journalled */
  const opened = [];
  let after = Number(await one(db, 'select coalesce(max(id), 0) from public.player_ledger'));
  let units = 0;
  const check = async () => {
    const rows = (await db.query(`select l.id, l.meta, l.gold from public.player_ledger l join public.hunt_sessions s on s.id = l.session_id
       where s.instance_id = $1 and l.intent = 'supply_buy' and l.id > $2 order by l.id`, [inst, after])).rows;
    const at = opened[opened.length - 1];
    const step = depthStep(MUSTER, at);
    for (const r of rows) {
      let gold = 0;
      for (const [id, x] of Object.entries((r.meta && r.meta.items) || {})) {
        const want = storeUsePrice(id, step);
        if (Number(x.price) !== want) problems.push(tag('SS-BILL') + ' ' + id + ' sold at ' + x.price + ' in a window that opened at step ' + at + ' (wage step ' + step + ': ' + want + ' g)');
        gold += Number(x.qty) * Number(x.price);
        units += Number(x.qty);
      }
      if (Number(r.gold) !== -gold) problems.push(tag('SS-BILL') + ' a supply_buy row debits ' + r.gold + ', its items price ' + gold);
    }
    after = Number(await one(db, 'select coalesce(max(id), 0) from public.player_ledger'));
  };
  opened.push(await worldStep(db, inst));
  await run.warm();
  await check();
  for (let w = 2; w <= (o.windows || 3) + 1; w++) {
    opened.push(await worldStep(db, inst));
    await run.step(w);
    await check();
  }
  const refused = Number(await one(db, 'select refusals from public.hunt_instances where id = $1', [inst]));
  if (refused !== 0) problems.push(tag('SS-BILL') + ' ' + refused + ' window(s) refused');
  if (!(units > 0)) problems.push(tag('SS-BILL') + ' CONTROL: the four bought no store food');
  if (new Set(opened).size < 2) problems.push(tag('SS-BILL') + ' CONTROL: every window opened at step ' + opened[0] + ' (no fall back: the arm cannot tell the window\'s depth from the start)');
  const deep = storeUsePrice(FOOD, depthStep(MUSTER, opened[0]));
  if (deep === storeUsePrice(FOOD, levelStep(LEVEL)) || deep === BASIC_INDEX[FOOD].price) problems.push(tag('SS-BILL') + ' CONTROL: at step ' + opened[0] + ' the food costs ' + deep + ', the same as its Level or list price');
  /* SS-READ: the engine's input and the view, now */
  const now = await worldStep(db, inst);
  const want = Object.fromEntries(BASIC_SUPPLIES.map((b) => [b.id, storeUsePrice(b.id, depthStep(MUSTER, now))]));
  const basics = await one(db, "select public.hr_hunt_member_read(s)->'basics' from public.hunt_sessions s where s.instance_id = $1 and s.user_id = $2", [inst, uids[0]]);
  const offRead = Object.entries(basics || {}).filter(([id, b]) => b.price !== want[id]).map(([id, b]) => id + ' ' + b.price + ' (want ' + want[id] + ')');
  if (!basics || Object.keys(basics).length !== BASIC_SUPPLIES.length || offRead.length) problems.push(tag('SS-READ') + ' the engine is handed ' + (offRead.slice(0, 4).join(', ') || Object.keys(basics || {}).length + ' rows') + ' at step ' + now);
  const view = await one(db, "select public.hr_hunt_settings_view($1::uuid, 0)->'store'", [uids[0]]);
  const offView = (view || []).filter((r) => r.price !== want[r.id]).map((r) => r.id + ' ' + r.price + ' (want ' + want[r.id] + ')');
  if (!Array.isArray(view) || view.length !== BASIC_SUPPLIES.length || offView.length) problems.push(tag('SS-READ') + ' the settings view lists ' + (offView.slice(0, 4).join(', ') || (view || []).length + ' rows') + ' at step ' + now);
  return { problems, opened, units };
}

async function bothPaths(boot, doors = ['fire', 'viewed']) {
  const problems = [];
  const seen = {};
  for (const which of doors) {
    const r = await door((await boot()).db, which);
    problems.push(...r.problems);
    seen[which] = r;
  }
  return { problems, seen };
}

/* SQL mutants, patched into the booted replay: the body as it landed, one change. `want`: the arm that must turn red. */
const MUTANTS = [
  { name: 'the bill charges the row\'s list price', fn: 'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)',
    find: 'select public.hr_store_price(q.basic_id, v_sstep), q.kind into v_price', repl: 'select q.price, q.kind into v_price', want: /^SS-(BILL|CLASS) / },
  { name: 'the bill prices at the step after the window (taken after the credits)', fn: 'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)',
    find: 'select public.hr_store_price(q.basic_id, v_sstep), q.kind into v_price', repl: 'select public.hr_store_price(q.basic_id, public.hr_store_step(p_instance, p_user, p_slot) + 7), q.kind into v_price', want: /^SS-BILL / },
  { name: 'the engine is handed the row\'s list price', fn: 'public.hr_hunt_member_read(public.hunt_sessions)',
    find: "'price', public.hr_store_price(b.basic_id, (select public.hr_store_step(p_s.instance_id, p_s.user_id, p_s.slot))),", repl: "'price', b.price,", want: /^SS-(READ|CLASS) / },
  { name: 'the step is the frozen start, not the window\'s depth', fn: 'public.hr_store_step(uuid,uuid,integer)',
    find: "then floor((v_w->>'step')::numeric) else v_i.danger end", repl: 'then v_i.danger else v_i.danger end', want: /^SS-(BILL|READ) / },
  { name: 'the step has no pay ceiling (gap_max)', fn: 'public.hr_store_step(uuid,uuid,integer)',
    find: 'least(v_step - v_g.ref_step, v_g.gap_max::numeric)', repl: '(v_step - v_g.ref_step)', want: /^SS-(BILL|READ) / },
  { name: 'the scale prices by the hero\'s Level', fn: 'public.hr_store_step(uuid,uuid,integer)',
    find: "if v_w is null or coalesce(v_w->>'risk', '') <> '' then", repl: 'if false then', want: /^SS-(BILL|READ) / },
  { name: 'the scale prices at the raw Danger step', fn: 'public.hr_store_step(uuid,uuid,integer)',
    find: 'greatest(1::numeric, v_g.ref_wage_step + least(v_step - v_g.ref_step, v_g.gap_max::numeric))', repl: 'greatest(1::numeric, v_step)', want: /^SS-(BILL|READ) / },
  { name: 'town prices at step 1', fn: 'public.hr_store_step(uuid,uuid,integer)',
    find: 'return least(v_max, greatest(1, coalesce(v_lv, 1)));', repl: 'return 1;', want: /^SS-TOWN / },
  { name: 'the twin rounds down', fn: 'public.hr_store_price(text,integer)',
    find: 'if v_x - v_f >= 0.5::float8 then v_f := v_f + 1; end if;', repl: '', want: /^SS-PRICE / },
  { name: 'the twin drops the floor', fn: 'public.hr_store_price(text,integer)',
    find: 'return greatest(t.floor_gold, v_f::bigint);', repl: 'return greatest(1, v_f::bigint);', want: /^SS-PRICE / },
  { name: 'the view lists the row\'s list price', fn: 'public.hr_hunt_settings_view(uuid,integer)',
    find: 'public.hr_store_price(b.basic_id, (select public.hr_store_step(null, p_user, p_slot))) as price_at', repl: 'b.price as price_at', want: /^SS-(TOWN|READ|CLASS) / },
  { name: 'gold_out is proven at the list price', fn: 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)',
    find: 'max(public.hr_store_price(q.basic_id, (select public.hr_store_step(v_s.instance_id, p_user, p_slot))))', repl: 'max(q.price)', want: /^SS-CLASS / },
  { name: 'a called room plans at the list price', fn: 'public.hr_boss_call_plan(uuid,jsonb,timestamp with time zone)',
    find: '* public.hr_store_price(q.basic_id, (select public.hr_store_step(p_instance, v_m.user_id, v_m.slot)))', repl: '* q.price', want: /^SS-CLASS / },
];
/* the arms a mutant's own target needs: the twin and the class alone are cheap; a hunt is played only for what reads one */
const needsDoor = (m) => /BILL|TOWN|READ/.test(m.want.source);

async function plain(boot, doors, log = () => {}) {
  const b = await boot();
  const problems = [...await twin(b.db), ...await theClass(b.db)];
  if (doors.length) {
    const r = await bothPaths(boot, doors);
    problems.push(...r.problems);
    for (const [which, s] of Object.entries(r.seen)) log('  ' + which + ': windows opened at steps ' + s.opened.join(' / ') + ' (wage steps ' + s.opened.map((x) => depthStep(MUSTER, x)).join(' / ') + '), ' + s.units + ' store units bought');
  }
  return problems;
}

async function main() {
  if (process.argv.includes('--mutate')) {
    let escaped = 0;
    for (const m of MUTANTS) {
      const boot = async () => {
        const b = await bootReplay();
        const def = await one(b.db, 'select pg_get_functiondef($1::regprocedure)', [m.fn]);
        if (!def || !def.replace(/\r/g, '').includes(m.find)) throw new Error('HARNESS: ' + m.fn + ' has no ' + JSON.stringify(m.find.slice(0, 70)));
        await b.db.exec(def.replace(/\r/g, '').replace(m.find, () => m.repl));
        return b;
      };
      let got = [];
      try { got = await plain(boot, needsDoor(m) ? ['fire'] : []); } catch (e) { got = ['THREW ' + String(e && e.message).slice(0, 200)]; }
      if (got.some((p) => /HARNESS/.test(p))) { console.log('  HARNESS ' + m.name + ': ' + got.find((p) => /HARNESS/.test(p))); process.exitCode = 2; return; }
      const hit = got.some((p) => m.want.test(p));
      if (!hit) escaped++;
      console.log('  ' + (hit ? 'caught ' : 'ESCAPED') + ' ' + m.name + ': ' + (got.find((p) => m.want.test(p)) || got[0] || 'every check held').slice(0, 170));
    }
    console.log(escaped ? 'store-step --mutate: ' + escaped + ' ESCAPED' : 'store-step --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' caught');
    process.exitCode = escaped ? 1 : 0;
    return;
  }
  const problems = await plain(() => bootReplay(), ['fire', 'viewed'], (line) => console.log(line));
  for (const p of problems) console.log('FAIL  ' + p);
  console.log(problems.length ? 'store-step: ' + problems.length + ' FAILED' : 'store-step: green (the twin at every step, town at the Level, the bill at each window\'s depth both paths, the engine\'s and the view\'s prices, one reader of the price)');
  process.exitCode = problems.length ? 1 : 0;
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
