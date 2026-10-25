#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/skills-from-storage.mjs — TOWN SKILLS DRAW ON THE BAG, THEN THE ACCOUNT'S STORAGE
// (Tyler 2026-10-25, a universal truth: "let me do gathering/crafting skills from account storage").
//
//   node tests/skills-from-storage.mjs             the guard
//   node tests/skills-from-storage.mjs --list      the mutation catalogue
//   node tests/skills-from-storage.mjs --mutate    every mutation must be CAUGHT
//   node tests/skills-from-storage.mjs --mutate=<id>
//
// mutant-anchors: supabase/migrations/2027-01-24-skills-from-storage.sql supabase/functions/hr-accrue/envelope.js src/session/item-sections.js src/core/artisan-sim.js src/shell/windows/inventory/bury.js
//
// Ships with supabase/migrations/2027-01-24-skills-from-storage.sql and the engine/client halves. Real RPCs on a
// fully replayed PGlite chain (production untouched): the bench through the REAL edge verb (set-activity.js
// runSetActivity: start, then stop, whose collect runs the engine and hr_apply, as with the browser closed), the
// farm verbs as the player, the client's counts through the real readers over the real envelope.
//   SS-1  A BENCH FROM STORAGE ONLY: no input in the bag, all in Storage; "make 3" pays 3 actions, Storage loses
//         exactly 3 actions' inputs, the bag gets the product, the craft journal row says Storage paid (delta.st).
//   SS-2  MIXED, THE BAG FIRST: the bag holds one action's worth + 1, Storage the rest + 5; after 3 actions the
//         bag holds none and Storage exactly 6 (conservation: before - used = after).
//   SS-3  THE RACE (a stale engine read): another hero of the account withdraws from Storage between the engine's
//         read and its apply; hr_apply refuses insufficient_item {have, need, bag, storage} and NOTHING moves; the
//         next stop re-reads and pays what is left. Before - withdrawn - used = after.
//   SS-4  THE CLIENT'S COUNTS ARE BAG + STORAGE: the Work window's runs ("Makes up to N"), its blocking line, the
//         bag's Bury all label and count, from the server's envelope; with neither, the line says where it looked.
//   SS-5  PLANTING: a seed in Storage only is planted (journalled from.storage); harvest-and-replant from a Storage
//         seed buys nothing; no seed anywhere is insufficient_seed {seed, have 0, need 1, bag 0, storage 0}.
//   SS-6  A FULL BAG SAYS WHY: the product needs a new stack in a bag at its cap; the bench stops bag_full
//         (journal stopped/room_for), nothing is spent, and the Work window says "Your bag is full".
//   SS-7  THE RESUME: one action's inputs held in Storage only resume the bench after a hunt; none do not.
//   SS-8  A FORGED SETTLE CANNOT DRAIN ANOTHER ITEM: a craft delta on a line the bench does not consume, held in
//         Storage only, is refused bag-only and Storage is untouched.
//   SS-9  THE LOCK ORDER, read from the installed bodies: hr_apply takes the bench inputs (the depot key) before
//         the purse; the plant takes hero -> farm -> depot; the replant hero -> harvest -> depot -> purse -> plant.
//   SS-10 A SECOND APPLY IS A NO-OP: the schema fingerprint, the five bodies and the rows are byte-identical.
// TRUE CONCURRENCY is unverified locally (PGlite is one backend): SS-3 interleaves the statements, SS-9 pins the order.
// Exit: 0 green · 1 a red arm or a missed mutant · 2 a harness problem.
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { mkdtempSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { bootReplay, inventory, ROOT } from './schema-replay.mjs';

const MIG = '2027-01-24-skills-from-storage.sql';
const idem = () => crypto.randomUUID();

/* The file's §7 self-check would refuse most SQL mutants at apply; it is blinded so THIS guard's arms judge them. */
const GATE_BLIND = [
  ['  i_hero int; i_row int; i_farm int; i_depot int; i_take int; i_harv int; i_purse int; i_plant int; i_gold int;\nbegin\n',
   '  i_hero int; i_row int; i_farm int; i_depot int; i_take int; i_harv int; i_purse int; i_plant int; i_gold int;\nbegin\n  if true then return; end if;   -- selftest: §7 short-circuited\n'],
];
const SQL_MUTANTS = {
  apply_bag_only: {
    why: 'hr_apply takes a bench\'s inputs from the bag only (the behaviour before this file): Storage never pays',
    find: '        v_skill_take := public.hr_materials_take(v_uid, v_slot, v_skill_cost, true);',
    repl: '        v_skill_take := public.hr_materials_take(v_uid, v_slot, v_skill_cost, false);',
  },
  apply_double_debit: {
    why: 'the item loop debits the lines the take already paid: the bag is charged twice',
    find: '        if v_skill_cost ? k then continue; end if;\n',
    repl: '',
  },
  apply_any_line: {
    why: 'any spent line of a craft settle draws on Storage, not only the bench\'s own inputs (a forged delta drains Storage)',
    find: "         and coalesce(public.hr_bench_inputs() -> v_st.active_id, '{}'::jsonb) ? t.k;",
    repl: '         ;',
  },
  plant_bag_only: {
    why: 'planting takes the seed from the bag only: a Storage seed is refused',
    find: '  v_take := public.hr_materials_take(v_uid, p_slot, jsonb_build_object(v_crop.seed_item, 1), true);',
    repl: '  v_take := public.hr_materials_take(v_uid, p_slot, jsonb_build_object(v_crop.seed_item, 1), false);',
  },
  replant_buys: {
    why: 'harvest-and-replant counts the bag only and BUYS a seed while one sits in Storage',
    find: '         + coalesce((select qty from public.account_bank where user_id = v_uid and item_id = v_seed), 0)\n',
    repl: '',
  },
  resume_bag_only: {
    why: 'the bench resumes after a hunt only with the inputs in the bag (Storage ignored)',
    find: '                            + coalesce((select b.qty from public.account_bank b\n                                         where b.user_id = p_user and b.item_id = i.key), 0)\n',
    repl: '',
  },
};
/* apply_after_purse (in ALL below) is planted on the INSTALLED body: the anchored edit moved after the GOLD block
   (plantAfterPurse), the defect a later restatement of hr_apply could make. */
const JS_MUTANTS = {
  engine_bag_only: {
    why: 'the engine prices a bench against the bag only: the run makes nothing from Storage',
    file: 'supabase/functions/hr-accrue/envelope.js',
    find: "  return from && from.includes('storage') && bank && typeof bank === 'object' && !Array.isArray(bank) ? bank : null;",
    repl: '  return null;',
  },
  client_bag_only: {
    why: 'the client counts the bag only: "Makes up to N" and Bury all read less than the server spends',
    file: 'src/session/item-sections.js',
    find: '  if (drawsOnStorage(cs)) for (const r of bankOf(cs) || []) out[r.id] = (out[r.id] || 0) + r.qty;\n',
    repl: '',
  },
  no_bag_full_stop: {
    why: 'a full bag is not a stop: the engine proposes a stack the server refuses and nobody says why',
    file: 'src/core/artisan-sim.js',
    find: '  return stacks - freed + 1 > cap ? opens : null;',
    repl: '  return null;',
  },
  bury_bag_only: {
    why: 'Bury all / Cook all counts the bag only (a stack in Storage reads "Bury")',
    file: 'src/shell/windows/inventory/bury.js',
    find: 'export function buryQty(cs, id) { return heldOf(cs)[id] || 0; }',
    repl: "export function buryQty(cs, id) { return (cs.read('inventory') || {})[id] || 0; }",
  },
};
const ALL = [...Object.keys(SQL_MUTANTS), 'apply_after_purse', ...Object.keys(JS_MUTANTS)];

/* A JS mutant runs from a temp copy of src + the edge with the planted file written in: the working tree is never
   touched, and each copy is a fresh module graph (the alpha-windows tickerMutant idiom). */
function tempTree(plant) {
  const tmp = mkdtempSync(join(tmpdir(), 'hr-sfs-'));
  cpSync(join(ROOT, 'src'), join(tmp, 'src'), { recursive: true, filter: (p) => !/[\\/]vendor([\\/]|$)/.test(p.slice(ROOT.length)) });
  cpSync(join(ROOT, 'supabase', 'functions', 'hr-accrue'), join(tmp, 'supabase', 'functions', 'hr-accrue'), { recursive: true });
  if (plant) writeFileSync(join(tmp, plant.file), plant.text);
  return tmp;
}

async function run(mutant) {
  const problems = [];
  const ok = (cond, msg) => { if (!cond) problems.push(msg); };
  const sqlM = mutant && SQL_MUTANTS[mutant];
  const jsM = mutant && JS_MUTANTS[mutant];
  let base = ROOT; let tmp = null;
  if (jsM) {
    const text = (await readFile(join(ROOT, jsM.file), 'utf8')).replace(/\r\n/g, '\n');
    const n = text.split(jsM.find).length - 1;
    if (n !== 1) { const e = new Error(`mutant ${mutant}: anchor matched ${n} times in ${jsM.file}`); e.harness = true; throw e; }
    tmp = tempTree({ file: jsM.file, text: text.replace(jsM.find, () => jsM.repl) });
    base = tmp;
  }
  const { db } = await bootReplay({ patches: sqlM ? new Map([[MIG, [[sqlM.find, sqlM.repl], ...GATE_BLIND]]]) : undefined, upTo: MIG });
  try {
    if (mutant === 'apply_after_purse') await plantAfterPurse(db);
    const mod = (f) => import(pathToFileURL(join(base, f)).href);
    const SA = await mod('supabase/functions/hr-accrue/set-activity.js');
    const IS = await mod('src/session/item-sections.js');
    const TW = await mod('src/shell/town-work.js');
    const BU = await mod('src/shell/windows/inventory/bury.js');
    const { recipeInputs } = await mod('src/core/artisan.js');

    const q = async (sql, p) => (await db.query(sql, p)).rows;
    const one = async (sql, p) => { const r = (await q(sql, p))[0]; return r ? Object.values(r)[0] : undefined; };
    /* As PostgREST calls it: the JWT subject set, `set role authenticated` (session-level here: autocommit). */
    const as = async (uid, sql, params) => {
      await db.query("select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)", [uid, JSON.stringify({ sub: uid, role: 'authenticated' })]);
      await db.exec('set role authenticated');
      try { const r = (await db.query(sql, params)).rows[0]; return r ? Object.values(r)[0] : undefined; }
      finally { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claims', '', false)"); }
    };
    /* As hr-accrue runs a statement: `set role hr_engine`, no JWT. `before` runs once before the first hr_apply (SS-3). */
    const engineExec = (before) => { let pending = before || null; return async (text, params) => {
      if (pending && /hr_apply\(/.test(text)) { const f = pending; pending = null; await f(); }
      await db.exec('set role hr_engine');
      try { return (await db.query(text, params)).rows; } finally { await db.exec('reset role'); }
    }; };
    const setAct = (user, slot, activity, before) => SA.runSetActivity({ exec: engineExec(before), user, slot, intentId: idem(), activity });
    const bag = async (u, s, item) => Number(await one('select coalesce((select qty from public.player_inventory where user_id=$1 and slot=$2 and item_id=$3), 0)::text', [u, s, item]));
    const sto = async (u, item) => Number(await one('select coalesce((select qty from public.account_bank where user_id=$1 and item_id=$2), 0)::text', [u, item]));
    const put = async (u, s, item, b, st) => {
      await q('delete from public.player_inventory where user_id = $1 and item_id = $2', [u, item]);
      await q('delete from public.account_bank where user_id = $1 and item_id = $2', [u, item]);
      if (b > 0) await q('insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, $2, $3, $4)', [u, s, item, b]);
      if (st > 0) await q('insert into public.account_bank (user_id, item_id, qty) values ($1, $2, $3)', [u, item, st]);
    };
    const backdate = (u, s) => q("update public.player_state set active_since = now() - interval '30 minutes', accrued_to = now() - interval '30 minutes' where user_id = $1 and slot = $2", [u, s]);
    const lastCraft = async (u, s) => (await q("select meta from public.player_ledger where user_id = $1 and slot = $2 and kind = 'craft' order by at desc, id desc limit 1", [u, s]))[0];
    const pointer = async (u, s) => (await q('select active_kind, active_id from public.player_state where user_id = $1 and slot = $2', [u, s]))[0];
    const envOf = async (u, s) => one('select public.hr_state_of($1, $2)', [u, s]);
    const csOf = (env) => ({ read: (k) => (env ? env[k] : undefined) });
    const gate = () => q('delete from public.hr_rate_counters');

    // THE CATALOGUE ROWS, chosen by property: a level-1 bench with ONE input and a product, on a bench with no burn and
    // no free craft (cooking burns, crafting saves), that the server's generated catalogue lists; bones' rite.
    const inputsSql = await one('select public.hr_bench_inputs()');
    const benches = Object.entries(TW.BENCH_INDEX)
      .filter(([id, e]) => !['cooking', 'crafting', 'prayer'].includes(e.skill) && e.recipe.output && !e.recipe.gated
        && (e.recipe.req || 1) <= 1 && Object.keys(recipeInputs(e.recipe)).length === 1 && inputsSql[id])
      .sort(([a], [b]) => (a < b ? -1 : 1));
    if (!benches.length) { const e = new Error('HARNESS: no level-1 single-input bench'); e.harness = true; throw e; }
    const [BENCH, { skill: SKILL, recipe: REC }] = benches[0];
    const IN = Object.keys(recipeInputs(REC))[0];
    const NEED = recipeInputs(REC)[IN];
    const OUT = REC.output;
    const W = TW.workRow('artisan', BENCH);
    const crop = (await q("select c.crop_id, c.seed_item from public.hr_crops c join public.hr_crop_plot_tier t using (crop_id) where c.req_lv <= 1 and not c.regrows and t.plot_tier <= 1 order by c.crop_id limit 1"))[0];
    const other = await one("select i.item_id from public.hr_items i where not (coalesce(public.hr_bench_inputs() -> $1, '{}'::jsonb) ? i.item_id) and i.item_id <> $2 order by i.item_id limit 1", [BENCH, OUT]);
    if (!crop || !other) { const e = new Error('HARNESS: no first crop or no other item'); e.harness = true; throw e; }

    // ONE ACCOUNT, TWO NAMED HEROES (slot 1 is the sibling that races).
    const A = await one('select gen_random_uuid()::text');
    await q('insert into auth.users (id) values ($1)', [A]);
    await q("insert into public.hr_access_allowlist (user_id, note) values ($1, 'skills-from-storage') on conflict (user_id) do nothing", [A]);
    for (const s of [0, 1]) {
      await gate();
      const c = await as(A, 'select public.hr_create_character($1)', [s]);
      if (!c || c.ok !== true) { const e = new Error('HARNESS: hr_create_character refused: ' + JSON.stringify(c)); e.harness = true; throw e; }
      const nm = await as(A, 'select public.hr_character_name_set($1, $2, $3::uuid)', [s, 'Sfs ' + 'ab'[s] + 'ilver', idem()]);
      if (!nm || nm.ok !== true) { const e = new Error('HARNESS: naming refused: ' + JSON.stringify(nm)); e.harness = true; throw e; }
    }
    await q('delete from public.account_bank where user_id = $1', [A]);
    const make =async (n, tag, before) => {
      await gate();
      const s0 = await setAct(A, 0, { kind: 'artisan', id: BENCH, count: n });
      if (s0.status !== 200) { problems.push(`${tag}: the bench did not start: ${String(JSON.stringify(s0.body)).slice(0, 200)}`); return null; }
      await backdate(A, 0);
      await gate();
      return setAct(A, 0, { kind: 'idle' }, before);
    };

    // ── SS-1 ── a bench from Storage only
    {
      await put(A, 0, IN, 0, 3 * NEED + 1);
      const out0 = await bag(A, 0, OUT);
      const r = await make(3, 'SS-1');
      if (r) {
        ok(r.status === 200, 'SS-1 the stop (collect) answered ' + r.status + ' ' + String(JSON.stringify(r.body)).slice(0, 220));
        const meta = await lastCraft(A, 0);
        ok(await sto(A, IN) === 1 && await bag(A, 0, IN) === 0, `SS-1 Storage holds ${await sto(A, IN)} ${IN} and the bag ${await bag(A, 0, IN)} after 3 actions from Storage (want 1 and 0)`);
        ok(await bag(A, 0, OUT) - out0 >= 3 * (REC.outputQty || 1), `SS-1 the bag gained ${await bag(A, 0, OUT) - out0} ${OUT} (want at least ${3 * (REC.outputQty || 1)})`);
        ok(meta && meta.meta && meta.meta.delta && meta.meta.delta.st && Number(meta.meta.delta.st[IN]) === 3 * NEED && Number(meta.meta.ticks) === 3,
          'SS-1 the craft journal row does not say Storage paid ' + 3 * NEED + ': ' + String(JSON.stringify(meta && meta.meta)).slice(0, 240));
      }
    }

    // ── SS-2 ── mixed, the bag first; conservation
    {
      await put(A, 0, IN, NEED + 1, 2 * NEED + 5);
      const before = (await bag(A, 0, IN)) + (await sto(A, IN));
      const r = await make(3, 'SS-2');
      if (r) {
        ok(r.status === 200, 'SS-2 the stop answered ' + r.status + ' ' + String(JSON.stringify(r.body)).slice(0, 220));
        const after = (await bag(A, 0, IN)) + (await sto(A, IN));
        ok(await bag(A, 0, IN) === 0 && await sto(A, IN) === 6, `SS-2 not the bag first: bag ${await bag(A, 0, IN)}, Storage ${await sto(A, IN)} (want 0 and 6)`);
        ok(before - 3 * NEED === after, `SS-2 conservation: before ${before} - used ${3 * NEED} != after ${after}`);
        const meta = await lastCraft(A, 0);
        ok(meta && Number(meta.meta.delta.st && meta.meta.delta.st[IN]) === 2 * NEED - 1, 'SS-2 the journal says Storage paid ' + JSON.stringify(meta && meta.meta.delta && meta.meta.delta.st) + ', want ' + (2 * NEED - 1));
      }
    }

    // ── SS-3 ── the race: a sibling withdraws between the engine's read and its apply
    {
      await put(A, 0, IN, 0, 3 * NEED);
      const out0 = await bag(A, 0, OUT);
      const withdraw = async () => {
        await gate();
        const w = await as(A, 'select public.hr_bank_move($1, $2, $3, $4, $5::uuid)', [1, IN, 1, 'withdraw', idem()]);
        if (!w || w.ok !== true) problems.push('SS-3 HARNESS: the sibling could not withdraw: ' + JSON.stringify(w));
      };
      const r = await make(3, 'SS-3', withdraw);
      if (r) {
        const body = r.body || {};
        const det = body.detail && typeof body.detail === 'object' ? body.detail : body;
        ok(r.status !== 200 && JSON.stringify(body).includes('insufficient_item'), 'SS-3 the stale settle was not refused insufficient_item: ' + r.status + ' ' + String(JSON.stringify(body)).slice(0, 260));
        ok(JSON.stringify(body).includes('"storage"'), 'SS-3 the refusal does not carry the Storage count: ' + String(JSON.stringify(det)).slice(0, 200));
        ok(await sto(A, IN) === 3 * NEED - 1 && await bag(A, 0, IN) === 0 && await bag(A, 0, OUT) === out0,
          `SS-3 a refused settle moved something: Storage ${await sto(A, IN)}, bag ${await bag(A, 0, IN)}, product +${await bag(A, 0, OUT) - out0}`);
        // The next stop re-reads: pays what is left (2 whole actions), and the run is over.
        await gate();
        const p = await pointer(A, 0);
        const r2 = p.active_kind === 'artisan' ? await setAct(A, 0, { kind: 'idle' }) : { status: 200, body: {} };
        ok(r2.status === 200, 'SS-3 the second stop answered ' + r2.status + ' ' + String(JSON.stringify(r2.body)).slice(0, 200));
        const used = Math.floor((3 * NEED - 1) / NEED) * NEED;
        ok(await sto(A, IN) === 3 * NEED - 1 - used, `SS-3 conservation after the re-read: Storage ${await sto(A, IN)}, want ${3 * NEED} - 1 withdrawn - ${used} used`);
        ok(await bag(A, 1, IN) === 1, 'SS-3 the sibling\'s withdrawal did not land in its bag');
      }
      await put(A, 1, IN, 0, 0);
    }

    // ── SS-4 ── the client's counts are bag + Storage
    {
      await put(A, 0, IN, 1, 4 * NEED);
      const cs = csOf(await envOf(A, 0));
      const want = Math.floor((1 + 4 * NEED) / NEED);
      ok(TW.runsOf(REC, IS.heldOf(cs)) === want, `SS-4 "Makes up to" counts ${TW.runsOf(REC, IS.heldOf(cs))} runs, the bag + Storage cover ${want}`);
      ok(TW.workBlock(cs, W, false) === '', 'SS-4 the Work window blocks a bench Storage covers: ' + JSON.stringify(TW.workBlock(cs, W, false)));
      await put(A, 0, IN, 0, 0);
      const none = TW.workBlock(csOf(await envOf(A, 0)), W, false);
      ok(/in your bag or Storage\.$/.test(none), 'SS-4 with neither, the line reads ' + JSON.stringify(none) + ' (want it to say it looked in the bag and Storage)');
      const br = BU.buryRecipeOf('bones');
      if (br) {
        await put(A, 0, 'bones', 1, 5);
        const c2 = csOf(await envOf(A, 0));
        ok(BU.buryQty(c2, 'bones') === 6 && BU.buryLabel(br, BU.buryQty(c2, 'bones')) === BU.buryVerb(br) + ' all',
          `SS-4 Bury all counts ${BU.buryQty(c2, 'bones')} bones and reads ${JSON.stringify(BU.buryLabel(br, BU.buryQty(c2, 'bones')))} (1 in the bag, 5 in Storage)`);
        ok(BU.buryBlock(c2, br) === '', 'SS-4 Bury is blocked with bones in the bag and Storage: ' + JSON.stringify(BU.buryBlock(c2, br)));
        await put(A, 0, 'bones', 0, 0);
      } else problems.push('SS-4 HARNESS: bones have no rite');
    }

    // ── SS-5 ── planting from a Storage seed; replant from Storage buys nothing; no seed anywhere says so
    {
      /* Independent of the arms above: the hero is idle with nothing unpaid (the farm verbs settle first). */
      await q("update public.player_state set active_kind = 'idle', active_id = null, accrued_to = now(), active_since = now() where user_id = $1 and slot = 0", [A]);
      await put(A, 0, crop.seed_item, 0, 2);
      await gate();
      const v = await as(A, 'select public.hr_farm_plant(0, 0, $1, $2::uuid)', [crop.crop_id, idem()]);
      ok(v && v.ok === true && v.from && v.from.storage && v.from.storage[crop.seed_item] === 1, 'SS-5 planting from a Storage seed answered ' + String(JSON.stringify(v)).slice(0, 220));
      ok(await sto(A, crop.seed_item) === 1, `SS-5 Storage holds ${await sto(A, crop.seed_item)} seeds after one planted (want 1)`);
      await q("update public.account_farm_plots set planted_at = now() - interval '2000 hours' where user_id = $1 and plot_idx = 0", [A]);
      await q(`insert into public.account_wallet as w (user_id, gold) values ($1, 1000000)
               on conflict (user_id) do update set gold = excluded.gold, version = w.version + 1, updated_at = now()`, [A]);
      await gate();
      const h = await as(A, 'select public.hr_farm_harvest_replant(0, 0, $1::uuid)', [idem()]);
      ok(h && h.ok === true && h.replant && h.replant.ok === true && Number(h.replant.bought) === 0,
        'SS-5 harvest-and-replant with a Storage seed answered ' + String(JSON.stringify(h)).slice(0, 260));
      ok(Number(await one('select gold::text from public.account_wallet where user_id = $1', [A])) === 1000000 && await sto(A, crop.seed_item) === 0,
        'SS-5 the replant bought a seed while one sat in Storage, or did not spend it');
      await put(A, 0, crop.seed_item, 0, 0);
      await gate();
      const n = await as(A, 'select public.hr_farm_plant(0, 1, $1, $2::uuid)', [crop.crop_id, idem()]);
      ok(n && n.error === 'insufficient_seed' && n.seed === crop.seed_item && n.have === 0 && n.need === 1 && n.bag === 0 && n.storage === 0,
        'SS-5 no seed anywhere answered ' + JSON.stringify(n));
    }

    // ── SS-6 ── a full bag stops the bench and says why; nothing is spent
    {
      await put(A, 0, IN, 0, 3 * NEED);
      await q('delete from public.player_inventory where user_id = $1 and slot = 0 and item_id = $2', [A, OUT]);
      const stacks = Number(await one('select count(*)::text from public.player_inventory where user_id = $1 and slot = 0', [A]));
      const cap0 = Number(await one('select bank_cap::text from public.player_state where user_id = $1 and slot = 0', [A]));
      await q('update public.player_state set bank_cap = $2 where user_id = $1 and slot = 0', [A, Math.max(1, stacks)]);
      if (stacks < 1) problems.push('SS-6 HARNESS: the hero holds no stack to fill the bag with');
      const why = TW.workBlock(csOf(await envOf(A, 0)), W, false);
      ok(why === 'Your bag is full. Make room for ' + (await import(pathToFileURL(join(base, 'src/shell/widgets/bits.js')).href)).itemName(OUT) + ' first.',
        'SS-6 the Work window says ' + JSON.stringify(why) + ' for a product with no room');
      const r = await make(3, 'SS-6');
      if (r) {
        const meta = await lastCraft(A, 0);
        const p = await pointer(A, 0);
        ok(r.status === 200 && p.active_kind === 'idle', 'SS-6 the stop answered ' + r.status + ' ' + String(JSON.stringify(r.body)).slice(0, 200) + ', pointer ' + JSON.stringify(p));
        ok(await sto(A, IN) === 3 * NEED && await bag(A, 0, OUT) === 0, `SS-6 a full bag spent ${3 * NEED - await sto(A, IN)} ${IN} or made ${await bag(A, 0, OUT)} ${OUT}`);
        ok(meta && meta.meta && meta.meta.stopped === 'bag_full' && meta.meta.room_for === OUT,
          'SS-6 the journal does not say the bag was full: ' + String(JSON.stringify(meta && meta.meta)).slice(0, 220));
      }
      await q('update public.player_state set bank_cap = $2 where user_id = $1 and slot = 0', [A, cap0]);
    }

    // ── SS-7 ── the resume after a hunt counts Storage
    {
      await put(A, 0, IN, 0, NEED);
      ok(await one("select public.hr_resume_has_inputs($1, 0, 'artisan', $2)", [A, BENCH]) === true, 'SS-7 one action\'s inputs in Storage do not resume the bench');
      await put(A, 0, IN, 0, 0);
      ok(await one("select public.hr_resume_has_inputs($1, 0, 'artisan', $2)", [A, BENCH]) === false, 'SS-7 a bench with no inputs anywhere resumes');
    }

    // ── SS-8 ── a forged craft settle cannot drain an item the bench does not consume
    {
      await put(A, 0, other, 0, 5);
      await q("update public.player_state set active_kind = 'artisan', active_id = $2, active_since = now() - interval '1 minute', accrued_to = now() - interval '1 minute' where user_id = $1 and slot = 0", [A, BENCH]);
      const ver = await one('select version from public.player_state where user_id = $1 and slot = 0', [A]);
      await gate();
      const [row] = await engineExec()('select public.hr_apply($1::uuid, 0, $2::bigint, $3::uuid, $4::text::jsonb) as res',
        [A, ver, idem(), JSON.stringify({ accrued_to: 'now', items: { [other]: -1 }, journal: { kind: 'craft', intent: 'accrue' } })]);
      const res = row && row.res;
      ok(res && res.error === 'insufficient_item' && !('storage' in res) && await sto(A, other) === 5,
        'SS-8 a forged line the bench does not consume answered ' + JSON.stringify(res) + ', Storage ' + await sto(A, other));
      await q("update public.player_state set active_kind = 'idle', active_id = null where user_id = $1 and slot = 0", [A]);
      await put(A, 0, other, 0, 0);
    }

    // ── SS-9 ── the lock order, read from the installed bodies (comments stripped)
    {
      const src = async (sig) => (await one("select regexp_replace(prosrc, '--[^' || chr(10) || ']*', '', 'g') from pg_proc where oid = $1::regprocedure", [sig])) || '';
      const ap = await src('public.hr_apply(uuid,integer,bigint,uuid,jsonb)');
      const iTake = ap.indexOf('public.hr_materials_take(v_uid, v_slot, v_skill_cost, true)');
      const iPurse = ap.indexOf('public.hr_purse_move(');
      ok(iTake > 0 && iPurse > iTake, `SS-9 hr_apply takes the bench inputs at ${iTake}, the purse at ${iPurse}: the depot key must come first`);
      const pl = await src('public.hr_farm_plant(integer,integer,text,uuid)');
      const p1 = pl.indexOf("hashtextextended(v_uid::text || ':' || p_slot::text, 0)"), p2 = pl.indexOf('public.hr_farm_lock(v_uid)'), p3 = pl.indexOf('public.hr_materials_take(');
      ok(p1 > 0 && p2 > p1 && p3 > p2, `SS-9 hr_farm_plant order hero ${p1} -> farm ${p2} -> materials ${p3}`);
      const rp = await src('public.hr_farm_harvest_replant(integer,integer,uuid)');
      const r1 = rp.indexOf("hashtextextended(v_uid::text || ':' || p_slot::text, 0)"), r2 = rp.indexOf('public.hr_farm_harvest('),
        r3 = rp.indexOf("hashtextextended('hr:depot:' || v_uid::text, 0)"), r4 = rp.indexOf('public.hr_farm_purse_pay('), r5 = rp.indexOf('public.hr_farm_plant(');
      ok(r1 > 0 && r2 > r1 && r3 > r2 && r4 > r3 && r5 > r4, `SS-9 hr_farm_harvest_replant order hero ${r1} -> harvest ${r2} -> depot ${r3} -> purse ${r4} -> plant ${r5}`);
    }

    // ── SS-10 ── a second apply is a no-op: the schema fingerprint, the five bodies and this guard's rows are
    //    byte-identical (clean run only: a mutant's body is not the post-image §0 pins, so it is refused by design).
    if (!mutant) {
      const bodies = () => q(`select p.oid::regprocedure::text s, md5(replace(prosrc, chr(13), '')) m from pg_proc p
         where p.oid in (to_regprocedure('public.hr_apply(uuid,integer,bigint,uuid,jsonb)'), to_regprocedure('public.hr_resume_has_inputs(uuid,integer,text,text)'),
                         to_regprocedure('public.hr_farm_plant(integer,integer,text,uuid)'), to_regprocedure('public.hr_farm_harvest_replant(integer,integer,uuid)'),
                         to_regprocedure('public.hr_skill_inputs_view(uuid,integer)')) order by 1`);
      const rowsOf = async () => JSON.stringify([await q('select item_id, qty from public.account_bank where user_id = $1 order by 1', [A]),
        await q('select count(*)::int n from public.player_ledger where user_id = $1', [A]), await q('select key, fn from public.hr_state_sections order by 1')]);
      const before = JSON.stringify([await inventory(db), await bodies(), await rowsOf()]);
      await db.exec((await readFile(join(ROOT, 'supabase', 'migrations', MIG), 'utf8')).replace(/\r\n/g, '\n'));
      ok(JSON.stringify([await inventory(db), await bodies(), await rowsOf()]) === before, 'SS-10 a second apply changed the schema, a body or a row');
    }
  } finally {
    try { await db.close(); } catch { /* the replay owns its lifetime */ }
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  }
  return problems;
}

/* apply_after_purse: the installed hr_apply with its SKILLS-FROM-STORAGE block moved AFTER the GOLD block (the
   anchored edit planted in the wrong place), executed over the real body. */
async function plantAfterPurse(db) {
  let def = (await db.query("select pg_get_functiondef('public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure) d")).rows[0].d.replace(/\r/g, '');
  const start = def.indexOf('    -- ── SKILLS-FROM-STORAGE (2027-01-24-skills-from-storage.sql; Tyler 2026-10-25, a universal truth) ──');
  const gold = def.indexOf('    -- ── GOLD ─');
  const gems = def.indexOf('    -- ── GEMS (review S5)');
  if (start < 0 || gold < start || gems < gold) { const e = new Error('HARNESS: apply_after_purse cannot find the block'); e.harness = true; throw e; }
  const block = def.slice(start, gold);
  def = def.slice(0, start) + def.slice(gold, gems) + block + def.slice(gems);
  await db.exec(def);
}

async function main() {
  const arg = process.argv.find((a) => a.startsWith('--mutate'));
  if (process.argv.includes('--list')) {
    for (const id of ALL) console.log('  ' + id + ' — ' + ((SQL_MUTANTS[id] || JS_MUTANTS[id] || { why: 'hr_apply takes the bench inputs AFTER the purse (the depot key locked after the purse)' }).why));
    return 0;
  }
  if (!arg) {
    const p = await run(null);
    for (const x of p) console.log('  ✗ ' + x);
    console.log(p.length ? `skills-from-storage: ${p.length} RED` : 'skills-from-storage: green — benches, the resume and planting draw on the bag, then the account\'s Storage, all or nothing; the client counts what the server spends; a full bag says why');
    return p.length ? 1 : 0;
  }
  const only = arg.includes('=') ? arg.split('=')[1] : null;
  if (only && !ALL.includes(only)) { console.log('unknown mutation: ' + only); return 2; }
  const clean = await run(null);
  if (clean.length) { for (const x of clean) console.log('  ✗ clean control RED: ' + x); return 1; }
  let bad = 0;
  for (const id of (only ? [only] : ALL)) {
    const p = await run(id);
    if (p.length) console.log('  ✓ ' + id + ' — caught: ' + p[0].slice(0, 160));
    else { console.log('  ✗ ' + id + ' — NOT caught'); bad++; }
  }
  const n = only ? 1 : ALL.length;
  console.log(bad ? `skills-from-storage --mutate: ${bad} escaped` : `skills-from-storage --mutate: ${n}/${n} mutants caught`);
  return bad ? 1 : 0;
}

main().then((c) => process.exit(c), (e) => { console.error(e && e.harness ? 'HARNESS: ' + e.message : e); process.exit(2); });
