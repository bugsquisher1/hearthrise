#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/unlock-buy.mjs — INTENT #5, END TO END, THROUGH THE REAL DRIVER.
//
// THE CLAIM UNDER TEST, in one line:
//   a player who BUYS a Kitchen rung through the real Edge module ends up with
//   a server row that hr_perks_of reports and that the REAL simulateArtisanSpan
//   then cooks with — burning NOTHING — and no second call, replay or forged
//   request can climb that ladder or move gold twice.
//
// Everything runs for real: a real PostgreSQL (PGlite/WASM, in process) with
// THE WHOLE MIGRATION CHAIN applied verbatim from tests/schema-apply-order.json
// — so 2026-08-16-unlock-offers.generated.sql's and 2026-08-16-unlock-buy.sql's
// own self-verifying blocks (§0 refuse-to-install, §3 structural, §5 hygiene,
// §6 behavioural) EXECUTE on every run of this file — and the real Edge module
// bytes behind their one injected seam, `exec`, run as `hr_engine`.
//
//   runUnlockBuy (real unlock-buy.js)
//     → public.hr_unlock_buy       (real SECURITY DEFINER RPC, real catalogue)
//     → player_progress row        (real table, real guard trigger)
//     → public.hr_perks_of         (real seam)
//     → makeBonus('noBurn')        (real src/core/perks.js)
//     → simulateArtisanSpan        (real src/core/artisan-sim.js) — 0 burns
//
// ── WHAT THIS FILE DOES NOT PROVE ───────────────────────────────────────
//   · TRUE CONCURRENCY. PGlite is one backend; the advisory lock in
//     hr_unlock_buy is EXERCISED and contended by nothing. The version check is
//     driven directly instead (U7), which is the property a race would surface.
//   · The PostgREST/Deno request path. index.ts is not imported here; the verb
//     is a pure ESM module precisely so this test drives the exact bytes.
//
// ── MUTATION ────────────────────────────────────────────────────────────
//   node tests/unlock-buy.mjs --list        the mutation catalogue
//   node tests/unlock-buy.mjs --selftest    every mutation must be CAUGHT
//   node tests/unlock-buy.mjs --mutate=<id>
// A mutation nothing catches is reported as SLIPPED and exits 1: a guard that
// cannot demonstrate it sees failure is treated as broken, not as a pass.
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { bootReplay, ROOT } from './schema-replay.mjs';
import { ARTISAN_RECIPES } from '../src/data/recipes.js';
import { ITEMS } from '../src/data/items.js';
import { recipeInputs } from '../src/core/artisan.js';
import { mulberry32, rngFrom } from '../src/core/rng.js';
import { xpForLevel } from '../src/core/xp.js';

/* An UNGATED cooking recipe for the burn measurement, chosen by the PROPERTY
   that matters — cheapest inputs, so a long span never runs dry — rather than
   by name or array position. Cooking is the only bench that burns, which is
   why `noBurn` is the perk the whole unlock program was unblocked for. */
const BURN_RECIPE = (ARTISAN_RECIPES.cooking || [])
  .filter((r) => r && !r.gated && r.output && r.req)
  .sort((a, b) => Object.keys(recipeInputs(a)).length - Object.keys(recipeInputs(b)).length
                  || a.req - b.req || a.id.localeCompare(b.id))[0];

const FN = (f) => join(ROOT, 'supabase', 'functions', 'hr-accrue', f);

/* ── THE MUTATION CATALOGUE ─────────────────────────────────────────────────
   Each entry plants a REAL defect — in the SQL engine, in the Edge module or in
   the generated catalogue — that this suite claims to catch. `--selftest`
   demands every one of them turns the run RED. */
const MUTATIONS = {
  // ── THE MERGE RULE. The arm §9 of the artisan model names by hand. ──────
  merge_is_additive: {
    migration: '2026-08-16-unlock-buy.sql',
    why: 'the GREATEST merge becomes `+=` — buying rung 1 twice stands the player in rung 2, '
       + 'i.e. the 2,000g Iron Stove for 1,000 gold. THE defect this whole design exists to '
       + 'make unreachable',
    find: '      do update set value = greatest(pp.value, excluded.value), updated_at = now();',
    repl: '      do update set value = pp.value + excluded.value, updated_at = now();',
  },
  already_owned_is_noop: {
    migration: '2026-08-16-unlock-buy.sql',
    why: 'a second purchase of an owned rung stops being refused and becomes a silent no-op that '
       + 'still charges — a refund ticket with no error anywhere',
    find: '    if v_cur >= v_off.value then',
    repl: '    if false then',
  },
  // ── THE LADDER AND THE GATE ────────────────────────────────────────────
  rung_order_off: {
    migration: '2026-08-16-unlock-buy.sql',
    why: 'the ladder stops being a ladder: rung 5 is buyable from rung 1, skipping four purchases',
    find: "    if v_cat.merge = 'max' then",
    repl: '    if false then',
  },
  prereq_tier_off: {
    migration: '2026-08-16-unlock-buy.sql',
    why: 'the homestead gate is disarmed — a rich player builds the Great Hearth from a bedroll, '
       + 'and the server is more permissive than the client it replaced',
    find: '    if coalesce(v_off.req_property_tier, 0) > 0 then',
    repl: '    if false then',
  },
  prereq_blueprint_off: {
    migration: '2026-08-16-unlock-buy.sql',
    why: 'the dungeon blueprint stops being required, so the server sells rungs 2-3 strictly '
       + 'cheaper than the client charges for them',
    find: '    if v_off.req_item is not null then\n      select coalesce(qty, 0) into v_have',
    repl: '    if false then\n      select coalesce(qty, 0) into v_have',
  },
  // ── VALUE ──────────────────────────────────────────────────────────────
  gold_not_debited: {
    migration: '2026-08-16-unlock-buy.sql',
    why: 'the rung is granted and the gold is not taken — a free permanent capability',
    find: '       set gold = gold - v_off.gold,',
    repl: '       set gold = gold,',
  },
  items_not_debited: {
    migration: '2026-08-16-unlock-buy.sql',
    why: 'the material cost is not consumed, so every room in the game costs gold only — and '
       + '`insufficient_item` becomes unreachable with it',
    find: '      if v_n <= 0 then continue; end if;',
    repl: '      if true then continue; end if;',
  },
  // ── CONCURRENCY + IDEMPOTENCY ──────────────────────────────────────────
  version_check_off: {
    migration: '2026-08-16-unlock-buy.sql',
    why: 'optimistic concurrency is gone: a caller acting on a stale read commits anyway',
    find: '    if p_version is null or p_version <> v_st.version then',
    repl: '    if false then',
  },
  replay_pays_twice: {
    migration: '2026-08-16-unlock-buy.sql',
    why: 'a replayed intent id re-runs the purchase instead of returning the first decision — '
       + 'exactly-once becomes at-least-once, and the second run charges again',
    find: '  if found then\n    if v_prev_intent is distinct from v_intent',
    repl: '  if false then\n    if v_prev_intent is distinct from v_intent',
  },
  // ── THE PRICE IS THE SERVER'S ──────────────────────────────────────────
  price_from_the_edge: {
    file: FN('unlock-buy.js'),
    why: 'the Edge Function starts naming a price. The statement takes five scalars and an offer '
       + 'id BECAUSE a caller that supplies the price owns the cost of a permanent capability',
    find: 'const BUY_SQL = `\n  select public.hr_unlock_buy($1::uuid, $2::int, $3::bigint, $4::uuid, $5::text) as res`;',
    repl: 'const BUY_SQL = `\n  select public.hr_unlock_buy($1::uuid, $2::int, $3::bigint, $4::uuid, $5::text, $6::jsonb) as res`;',
  },
  partial_debit_not_rolled_back: {
    migration: '2026-08-16-unlock-buy.sql',
    why: 'S2, reintroduced: the insufficient_item refusal RETURNS instead of raising, so every item '
       + 'line the loop had already debited stays debited and the player pays materials for a '
       + 'purchase that did not happen',
    find: "        perform public.hr_reject('insufficient_item',\n"
        + "          jsonb_build_object('item_id', k, 'have', v_have, 'need', v_n));",
    repl: "        return jsonb_build_object('ok', false, 'error', 'insufficient_item');",
  },
  // ── THE CATALOGUE'S OWN LOCKDOWN (Security C1) ─────────────────────────
  catalogue_partial_revoke: {
    migration: '2026-08-16-unlock-offers.generated.sql',
    why: 'C1 — the price catalogue goes back to a three-verb revoke, leaving service_role with '
       + 'TRUNCATE/REFERENCES/TRIGGER from the platform default ACL. TRUNCATE bypasses RLS '
       + 'entirely, so the read-only policy is not a backstop: the table every unlock decision is '
       + 'read from can be emptied',
    find: 'revoke all on public.hr_unlock_offers from public, anon, authenticated, service_role;',
    repl: 'revoke insert, update, delete on public.hr_unlock_offers from anon, authenticated, service_role;',
  },
  // ── THE SWEEP AND THE WIDENED DETECTOR (Security C3) ───────────────────
  sweep_not_applied: {
    migration: '2026-08-16-client-write-grant-sweep.sql',
    why: 'C3 — the six content catalogues keep their dead anon/authenticated write grants, held '
       + 'back only by RLS',
    find: "    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I '\n"
        + "                   'from public, anon, authenticated', t);",
    repl: '    null;',
  },
  class_member_absorbed: {
    migration: '2026-08-16-client-write-grant-sweep.sql',
    why: 'C3a — a table enters the dead-grant class BEFORE the baseline is seeded. A baseline that '
       + 'seeds itself from live reality ABSORBS it silently, and because the file is safe-to-re-run '
       + 'every later re-run re-absorbs whatever arrived since. The seed must come from a DECLARED '
       + 'list and must RAISE on anything reality holds that the list does not',
    /* The anchor is the LAST statement before the baseline block, so the probe
       table joins the class between §1's sweep and §2's seed — which is exactly
       when a table created by any other migration would join it.
       Deliberately NOT named hr__*: the residue check at the end of the file
       greps that prefix, and a mutation caught by the residue check would prove
       nothing about absorption. This is a table that simply appeared — which is
       exactly what the platform default ACL does to every new RLS-on table. */
    find: 'create table if not exists public.hr_client_write_baseline (',
    repl: 'create table public.c3a_absorbed_probe (id int primary key);\n'
        + 'alter table public.c3a_absorbed_probe enable row level security;\n'
        + 'revoke all on public.c3a_absorbed_probe from public, anon, authenticated, service_role;\n'
        + 'grant insert on public.c3a_absorbed_probe to authenticated;\n'
        + 'create table if not exists public.hr_client_write_baseline (',
  },
  detector_still_narrow: {
    migration: '2026-08-16-client-write-grant-sweep.sql',
    why: 'C3 — check (4) goes back to TRUNCATE/REFERENCES/TRIGGER only, so a client write grant on '
       + 'a table with RLS on and no write policy is invisible again',
    /* Anchored on the BASELINE JOIN, which appears only in the derived detector
       body — the class predicate itself now also appears in §2's seed block, so
       the obvious anchor matches twice and the harness refuses it. */
    find: '       and not exists (select 1 from public.hr_client_write_baseline b\n'
        + '                        where b.table_name = g.table_name and b.grantee = g.grantee)',
    repl: '       and false',
  },
  // ── THE RECEIPT IS THE SERVER'S (Security C4) ──────────────────────────
  receipt_price_from_edge: {
    file: FN('unlock-buy.js'),
    why: 'C4 — the receipt goes back to the Edge catalogue\'s price, so the number the player SEES '
       + 'is the one number nobody re-validated; a stale catalogue produces a wrong receipt on the '
       + 'SUCCESS path, silently',
    find: '        gold: -res.charged?.gold,',
    repl: '        gold: -offer.gold,',
  },
  // ── THE SHAPE HALF ─────────────────────────────────────────────────────
  offer_predicate_loosened: {
    file: FN('unlock-catalogue.js'),
    why: 'the eligibility test stops rejecting offers carrying fields this verb does not '
       + 'implement, so a skill-gated companion is sold UNGATED the day one is authored',
    find: '    if (!OFFER_FIELDS_UNDERSTOOD.includes(k)) return `unimplemented_field:${k}`;',
    repl: '    if (false) return `unimplemented_field:${k}`;',
  },
  namespace_gate_off: {
    file: FN('unlock-catalogue.js'),
    why: 'the namespace allowlist is disarmed, so plot and worker offers — whose cap is the '
       + 'property tier and lives in no server catalogue — become sellable with no cap at all',
    find: '  if (!SELLABLE_NAMESPACES.includes(ns)) return `namespace_unsupported:${ns}`;',
    repl: '  if (false) return `namespace_unsupported:${ns}`;',
  },
  refusal_is_unknown: {
    file: FN('unlock-buy.js'),
    why: 'a REAL offer this build cannot sell is reported as "unknown offer", so a player files a '
       + 'bug against the wrong system',
    find: '  const why = catalogueGet(UNLOCK_REFUSALS, offerId);\n  if (why !== undefined) {',
    repl: '  const why = catalogueGet(UNLOCK_REFUSALS, offerId);\n  if (false) {',
  },
  registry_bucket_bogus: {
    file: FN('intents.js'),
    why: 'C4 — the registry names a rate bucket the database does not have; if nothing READS the '
       + 'registry this is invisible',
    find: "  unlock_buy: Object.freeze({ bucket: 'shop', needsKey: true, collectsFirst: false }),",
    repl: "  unlock_buy: Object.freeze({ bucket: 'shoppe', needsKey: true, collectsFirst: false }),",
  },
  registry_needs_key_false: {
    file: FN('intents.js'),
    why: 'C4 — the registry says a permanent purchase needs no idempotency key',
    find: "  unlock_buy: Object.freeze({ bucket: 'shop', needsKey: true, collectsFirst: false }),",
    repl: "  unlock_buy: Object.freeze({ bucket: 'shop', needsKey: false, collectsFirst: false }),",
  },
  receipt_on_replay: {
    file: FN('unlock-buy.js'),
    why: 'a REPLAYED purchase reports a receipt for a transfer this invocation did not make',
    /* BOTH guards, because either one alone still produces the right answer —
       which is defence in depth and therefore two mutations' worth of anchor.
       Removing both is the only edit that makes a replay report a receipt. */
    find: '      receipt: (res.replayed === true || !res.charged) ? null : {',
    repl: '      receipt: {',
  },
};

// ── args ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const argOf = (n, d) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit === undefined ? d : hit.slice(n.length + 3);
};
const has = (n) => argv.includes(`--${n}`);

const UID = '00000000-0000-4000-b354-000000000001';

const FIXTURE = `
insert into auth.users (id) values ('${UID}') on conflict (id) do nothing;
`;

class Red extends Error {}
const fails = [];
function ok(cond, msg) { if (!cond) { fails.push(msg); throw new Red(msg); } }
function note(cond, msg) { if (!cond) fails.push(msg); }

const uuid = () => crypto.randomUUID();

async function boot(mutate) {
  const patchedJs = new Map();
  let sqlPatches;
  if (mutate) {
    const m = MUTATIONS[mutate];
    if (!m) { const e = new Error(`unknown mutation "${mutate}"`); e.harness = true; throw e; }
    if (m.migration) {
      sqlPatches = new Map([[m.migration, [[m.find, m.repl]]]]);
    } else {
      const src = (await readFile(m.file, 'utf8')).replace(/\r\n/g, '\n');
      const n = src.split(m.find).length - 1;
      if (n !== 1) {
        const e = new Error(`mutation "${mutate}" anchor matched ${n} times (need exactly 1) in ${m.file}`);
        e.harness = true; throw e;
      }
      const after = src.replace(m.find, m.repl);
      if (after === src) {
        const e = new Error(`mutation "${mutate}" produced identical text`); e.harness = true; throw e;
      }
      patchedJs.set(m.file, after);
    }
  }

  let db;
  try {
    ({ db } = await bootReplay(sqlPatches ? { patches: sqlPatches } : {}));
  } catch (e) {
    if (e.harness) throw e;
    /* A mutation that makes a migration REFUSE TO INSTALL is the guard working:
       the migration's own do$$ self-check is a commit gate. */
    throw new Red(`migration chain refused: ${e.message}`);
  }
  await db.exec(FIXTURE);
  const mods = await loadModules(patchedJs);
  return { db, ...mods };
}

async function loadModules(patched) {
  const { writeFile, mkdtemp, cp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { pathToFileURL } = await import('node:url');

  const importAll = async (dir, base) => {
    const bust = `?t=${Date.now()}${Math.random()}`;
    return {
      buy: await import(pathToFileURL(join(dir, 'unlock-buy.js')).href + bust),
      cat: await import(pathToFileURL(join(dir, 'unlock-catalogue.js')).href + bust),
      it: await import(pathToFileURL(join(dir, 'intents.js')).href + bust),
      req: await import(pathToFileURL(join(dir, 'request.js')).href + bust),
      perks: await import(pathToFileURL(join(base, 'src', 'core', 'perks.js')).href + bust),
      artisan: await import(pathToFileURL(join(base, 'src', 'core', 'artisan-sim.js')).href + bust),
      fnDir: dir,
    };
  };
  if (!patched.size) return importAll(FN(''), ROOT);

  /* A mutated module has to be imported FROM DISK, and it imports its siblings
     by relative path — so the whole function directory is copied to a temp dir
     at the same depth relative to ROOT, the patched file is overwritten there,
     and the copy is imported. Same depth matters: unlock-catalogue.js reaches
     ../../../src/data/**. */
  const base = await mkdtemp(join(tmpdir(), 'hr-b354-'));
  const dir = join(base, 'supabase', 'functions', 'hr-accrue');
  await cp(FN(''), dir, { recursive: true });
  await cp(join(ROOT, 'src'), join(base, 'src'), { recursive: true });
  for (const [file, text] of patched) {
    await writeFile(join(dir, file.split(/[\\/]/).pop()), text, 'utf8');
  }
  return importAll(dir, base);
}

/** THE SEAM. One statement, rows out — exactly what index.ts hands the module,
    run as `hr_engine`: the role holds ZERO table privileges, so a verb that
    tried to touch a table directly would be refused here as it is in
    production. */
function makeExec(db) {
  return async (text, params) => {
    await db.exec('set role hr_engine');
    try {
      return (await db.query(text, params)).rows;
    } finally {
      await db.exec('reset role');
    }
  };
}

const state = async (db, uid, slot = 0) => (await db.query(
  'select * from public.player_state where user_id = $1 and slot = $2', [uid, slot])).rows[0];
const rungOf = async (db, uid, key, slot = 0) => Number(((await db.query(
  "select value from public.player_progress where user_id=$1 and slot=$2 and kind='unlock' "
  + "and key=$3 and period_key=''", [uid, slot, key])).rows[0] || { value: 0 }).value);
const invOf = async (db, uid, id, slot = 0) => Number(((await db.query(
  'select qty from public.player_inventory where user_id=$1 and slot=$2 and item_id=$3',
  [uid, slot, id])).rows[0] || { qty: 0 }).qty);
const ledger = async (db, uid, slot = 0) => (await db.query(
  'select kind, intent, gold, gold_in, xp_in, qty_in, meta from public.player_ledger '
  + 'where user_id = $1 and slot = $2 order by at, id', [uid, slot])).rows;

// ════════════════════════════════════════════════════════════════════════
async function run(mutate) {
  fails.length = 0;
  const { db, buy, cat, it, req, perks, artisan, fnDir } = await boot(mutate);
  const exec = makeExec(db);
  const doBuy = (o) => buy.runUnlockBuy({ exec, user: UID, slot: 0, ...o });
  const clearGate = () => db.query('delete from public.hr_rate_counters where user_id = $1', [UID]);

  /* The character, created through the REAL bootstrap RPC. */
  await db.exec(`
    do $$ begin
      perform set_config('request.jwt.claim.sub', '${UID}', true);
      perform public.hr_create_character(0);
    end $$;`);

  /** Stock the character so a purchase is about the RULES, never about supply. */
  const stock = async () => {
    await db.query('update public.player_state set gold = 5000000 where user_id = $1', [UID]);
    await db.exec(`
      insert into public.player_inventory (user_id, slot, item_id, qty)
      select distinct '${UID}'::uuid, 0, k, 10000
        from public.hr_unlock_offers o, jsonb_object_keys(coalesce(o.items,'{}'::jsonb)) k
       where o.refusal is null
      on conflict (user_id, slot, item_id) do update set qty = 10000;
      insert into public.player_inventory (user_id, slot, item_id, qty)
      select distinct '${UID}'::uuid, 0, o.req_item, 5 from public.hr_unlock_offers o
       where o.refusal is null and o.req_item is not null
      on conflict (user_id, slot, item_id) do update set qty = 5;`);
  };
  await stock();

  const ver = async () => Number((await state(db, UID)).version);
  const gold = async () => Number((await state(db, UID)).gold);

  /* ── THE REAL SPAN ──────────────────────────────────────────────────────
     src/core/artisan-sim.js, driven with the bonus stack built from the
     SERVER's own hr_perks_of envelope. `envPerks === null` is the SAME seeded
     span with no server rung at all, which is the control that keeps "it burns
     nothing" from being a statement about the seed.

     ⚠ SUPPLY-LIMITED, NOT TIME-LIMITED. A Kitchen rung also pays `cookSpeed`,
       so a fixed WINDOW yields a different tick COUNT with and without it and
       the two burn counts would not be comparable — the false failure
       tests/artisan-progress-model.mjs recorded on its first draft. Exactly
       `ticks` cooks' worth of input makes both spans stop on SUPPLIES at the
       same tick, so the only variable left is the burn roll. */
  const RECIPE_INDEX = artisan.indexArtisanRecipes(ARTISAN_RECIPES);
  const cook = (art, envPerks, ticks = 300, seed = 0xb354) => {
    const inputs = recipeInputs(BURN_RECIPE);
    const inventory = {};
    for (const id of Object.keys(inputs)) inventory[id] = inputs[id] * ticks;
    const st = {
      activeSkill: 'cooking',
      skillTargetId: BURN_RECIPE.id,
      /* EXACTLY the recipe's req level, never 99: burn relief is also paid per
         cooking level above req (BURN_PER_LEVEL_RELIEF), so a maxed cook burns
         nothing whatever the Kitchen says — and the control below would then
         pass vacuously while measuring mastery instead of the purchase. */
      skills: { cooking: xpForLevel(BURN_RECIPE.req) },
      inventory,
      equipment: {},
      unlockedRecipes: null,
      toolCarry: {},
      stats: {},
    };
    const fx = {
      addItem: (id, n) => { st.inventory[id] = (st.inventory[id] || 0) + n; },
      removeItem: (id, n) => { st.inventory[id] = (st.inventory[id] || 0) - n; },
      addXp: () => {},
    };
    const from = Date.UTC(2026, 7, 16, 0, 0, 0);
    const s = art.simulateArtisanSpan(st, {
      fromMs: from,
      toMs: from + ticks * ((BURN_RECIPE.ms || 3000) + 1) * 20,
      recipes: RECIPE_INDEX,
      items: ITEMS,
      rng: rngFrom(mulberry32(seed)),
      bonus: perks.makeBonus(envPerks),
      fx,
      away: true,
    });
    return { cooked: s.produced + s.burnt, burned: s.burnt };
  };

  // ── U1 · THE CATALOGUE IS THE SERVER'S, AND THE TWO COPIES AGREE ───────
  try {
    const rows = (await db.query(
      'select offer_id, gold, value, unlock_id, req_property_tier, req_item, items '
      + 'from public.hr_unlock_offers where refusal is null order by offer_id')).rows;
    ok(rows.length > 0, 'U1: hr_unlock_offers has no sellable row — the verb would be inert');
    const jsIds = Object.keys(cat.UNLOCK_OFFERS).sort();
    const sqlIds = rows.map((r) => r.offer_id).sort();
    ok(JSON.stringify(jsIds) === JSON.stringify(sqlIds),
      `U1: the Edge catalogue sells [${jsIds.length}] offers and the SQL table sells [${sqlIds.length}]. `
      + 'They are ONE derivation read twice; a divergence means the shape half and the price half '
      + 'disagree about what is buyable.');
    for (const r of rows) {
      const js = cat.UNLOCK_OFFERS[r.offer_id];
      note(Number(r.gold) === js.gold && Number(r.value) === js.value && r.unlock_id === js.unlockId,
        `U1: ${r.offer_id} — SQL says ${r.gold}g rung ${r.value} of ${r.unlock_id}, the Edge module `
        + `says ${js.gold}g rung ${js.value} of ${js.unlockId}`);
    }
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ── U1b · THE PREDICATE IS A RULE, NOT DECORATION ──────────────────────
  // Driven with SYNTHETIC offers, and that is not test convenience: no authored
  // offer today is a room rung WITH a skill gate, so the field allowlist has
  // nothing live to reject and would be unobservable — free to rot until the day
  // somebody authors exactly that row. catalogue.js's `offerIneligibility` is
  // exercised the same way and for the same reason.
  try {
    const base = {
      id: 'room.kitchen.9', table: 'room', name: 'probe',
      cost: [{ kind: 'currency', id: 'gold', amount: 100 }],
      grant: [{ kind: 'unlock', id: 'room:kitchen', amount: 1 }],
    };
    ok(cat.unlockOfferIneligibility(base) === null,
      `U1b CONTROL: a plain room offer was refused as ${cat.unlockOfferIneligibility(base)} — every `
      + 'refusal below would then prove nothing');
    const cases = [
      [{ ...base, reqSkill: 'cooking', reqLv: 30 }, 'unimplemented_field:reqSkill',
        'a SKILL-GATED offer would be sold UNGATED — the gate is a field this verb does not implement'],
      [{ ...base, period: 'month' }, 'unimplemented_field:period',
        'a SUBSCRIPTION would be sold as a one-off purchase'],
      [{ ...base, authority: 'platform' }, 'unimplemented_field:authority',
        'an offer the app store charges for would be sold for gold'],
      [{ ...base, cost: [{ kind: 'currency', id: 'gems', amount: 5 }] }, 'unpayable_cost:currency:gems',
        'a gem price would be charged as gold'],
      [{ ...base, cost: [{ kind: 'currency', id: 'gold', amount: 0 }] }, 'non_positive_price',
        'a 0-gold offer is a FREE permanent capability'],
      [{ ...base, cost: [] }, 'no_cost', 'an offer with no cost line at all'],
      [{ ...base, grant: [{ kind: 'unlock', id: 'room:kitchen', amount: 1 },
        { kind: 'unlock', id: 'room:forge', amount: 1 }] }, 'multi_line_grant',
        'two ladders and one price, written to one row'],
      [{ ...base, grant: [{ kind: 'unlock', id: 'plot:scarecrow', amount: 1 }] },
        'namespace_unsupported:plot',
        'a namespace whose cap is the property tier and lives in no server catalogue'],
      [{ ...base, cost: [{ kind: 'currency', id: 'gold', amount: 100 },
        { kind: 'item', id: 'not_an_item', amount: 1 }] }, 'unknown_item:not_an_item',
        'a cost line naming an item that does not exist'],
    ];
    for (const [offer, want, why] of cases) {
      const got = cat.unlockOfferIneligibility(offer);
      ok(got === want,
        `U1b: the predicate answered ${JSON.stringify(got)} instead of ${JSON.stringify(want)} — ${why}`);
    }
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ── U2 · THE REAL PURCHASE LANDS, AND THE SERVER OWNS THE PRICE ────────
  let k1;
  try {
    k1 = (await db.query(
      "select * from public.hr_unlock_offers where refusal is null and unlock_id='room:kitchen' "
      + 'and value = 1')).rows[0];
    ok(k1, 'U2: room:kitchen rung 1 is not sellable — the rung noBurn lives on');

    /* The homestead first: the Kitchen is gated on it, and buying it THROUGH THE
       VERB is what proves the property spine is server-owned too. */
    const home = (await db.query(
      "select offer_id from public.hr_unlock_offers where unlock_id='property:homestead' "
      + 'and refusal is null')).rows[0];
    ok(home, 'U2: property:homestead is not sellable — the Kitchen gate could not be satisfied '
      + 'through the verb, only by writing a row behind it');
    const g0 = await gold();
    const rHome = await doBuy({ intentId: uuid(), offer: home.offer_id });
    ok(rHome.status === 200 && rHome.body.ok === true,
      `U2: the homestead purchase was refused: ${JSON.stringify(rHome.body)}`);

    const gBefore = await gold();
    const invBefore = {};
    for (const itemId of Object.keys(k1.items)) invBefore[itemId] = await invOf(db, UID, itemId);
    const r = await doBuy({ intentId: uuid(), offer: k1.offer_id });
    ok(r.status === 200 && r.body.ok === true,
      `U2: the Kitchen purchase was refused: ${JSON.stringify(r.body)}`);
    ok(await gold() === gBefore - Number(k1.gold),
      `U2: gold moved ${gBefore} -> ${await gold()} for a ${k1.gold} gold rung`);
    ok(await rungOf(db, UID, 'room:kitchen') === 1,
      'U2: the purchase did not write room:kitchen = 1');
    /* THE MATERIALS TOO. A room rung costs gold AND logs; a server that took
       only the gold would sell every room in the game at a discount the client
       never offered. */
    for (const [itemId, n] of Object.entries(k1.items)) {
      ok(await invOf(db, UID, itemId) === invBefore[itemId] - Number(n),
        `U2: ${itemId} went ${invBefore[itemId]} -> ${await invOf(db, UID, itemId)} on a purchase `
        + `costing ${n} — the material half of the price was not taken`);
    }
    ok(r.body.receipt && r.body.receipt.gold === -Number(k1.gold) && r.body.receipt.rung === 1,
      `U2: the receipt does not state what the server charged: ${JSON.stringify(r.body.receipt)}`);
    note(g0 > gBefore, 'U2: the homestead purchase took no gold');
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ── U3 · THE PURCHASED RUNG REACHES THE PERK ENVELOPE ──────────────────
  // Read back through the REAL seam, not out of the table: a row nothing reads
  // is a purchase that pays nothing.
  try {
    const [{ perks: envPerks }] = (await db.query(
      'select public.hr_perks_of($1::uuid, 0) as perks', [UID])).rows;
    ok(envPerks && envPerks.ok === true, `U3: hr_perks_of refused: ${JSON.stringify(envPerks)}`);
    ok(Number(envPerks.rooms.kitchen) === 1,
      `U3: hr_perks_of reports kitchen = ${JSON.stringify(envPerks.rooms)} after a purchase of `
      + 'rung 1 — the rung does not reach the engine and noBurn stays 0');
    ok(Number(envPerks.propertyTier) === 1,
      `U3: the homestead purchase did not reach propertyTier (${envPerks.propertyTier})`);
    ok(perks.makeBonus(envPerks)('noBurn') > 0,
      'U3: a Kitchen 1 read out of the SERVER envelope produces noBurn 0 — a cooked night would '
      + "destroy input the player's Hearthstone says it keeps");
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ── U4 · A DOUBLE BUY IS REFUSED BY NAME, WITH GOLD MEASURED ───────────
  // THE GREATEST-vs-+= ARM. Under an additive merge this call stands the player
  // in a rung they did not pay for.
  try {
    await db.query(
      "update public.player_progress set value = 1 where user_id=$1 and kind='unlock' "
      + "and key='room:kitchen'", [UID]);
    await clearGate();
    const g = await gold();
    const before = await rungOf(db, UID, 'room:kitchen');
    const r = await doBuy({ intentId: uuid(), offer: k1.offer_id });
    ok(r.body.ok === false, `U4: the same rung was sold twice: ${JSON.stringify(r.body)}`);
    ok(r.body.error === 'already_owned',
      `U4: expected already_owned, got ${r.body.error} — refused for the wrong reason means the `
      + 'protection is accidental');
    ok(await gold() === g, `U4: a REFUSED purchase moved gold ${g} -> ${await gold()}`);
    ok(await rungOf(db, UID, 'room:kitchen') === before,
      `U4: THE MERGE IS ADDITIVE — room:kitchen went ${before} -> `
      + `${await rungOf(db, UID, 'room:kitchen')} on a second purchase of the SAME rung. `
      + 'GREATEST(existing, granted) is the contract; `+=` sells the rung above for the rung '
      + "below's price.");
    ok(r.body.version !== undefined || r.body.state !== undefined,
      'U4: the refusal carries no state envelope, so "reconcile to what the envelope says" is '
      + 'unexecutable on exactly the path that needs it');
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ── U5 · A SKIPPED RUNG IS REFUSED BY NAME ─────────────────────────────
  try {
    await clearGate();
    const k3 = (await db.query(
      "select * from public.hr_unlock_offers where refusal is null and unlock_id='room:kitchen' "
      + 'and value = 3')).rows[0];
    const g = await gold();
    const r = await doBuy({ intentId: uuid(), offer: k3.offer_id });
    ok(r.body.ok === false && r.body.error === 'rung_skipped',
      `U5: rung 3 was sold to a character holding rung 1: ${JSON.stringify(r.body)}`);
    ok(await gold() === g, 'U5: a refused skip moved gold');
    ok(await rungOf(db, UID, 'room:kitchen') === 1, 'U5: a refused skip granted the rung');
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ── U6 · REPLAY IS EXACTLY ONCE, AND THE RECEIPT SAYS SO ───────────────
  try {
    await clearGate();
    const k2 = (await db.query(
      "select * from public.hr_unlock_offers where refusal is null and unlock_id='room:kitchen' "
      + 'and value = 2')).rows[0];
    const key = uuid();
    const first = await doBuy({ intentId: key, offer: k2.offer_id });
    ok(first.body.ok === true, `U6 CONTROL FAILED: rung 2 was refused: ${JSON.stringify(first.body)}`);
    const gAfter = await gold();
    const bpAfter = k2.req_item ? await invOf(db, UID, k2.req_item) : null;

    const again = await doBuy({ intentId: key, offer: k2.offer_id });
    ok(again.body.ok === true && again.body.replayed === true,
      `U6: the replay was not reported as one: ${JSON.stringify(again.body)}`);
    ok(await gold() === gAfter,
      `U6: THE REPLAY CHARGED AGAIN — gold ${gAfter} -> ${await gold()}. Exactly-once is the whole `
      + 'contract of an idempotency key.');
    ok(await rungOf(db, UID, 'room:kitchen') === 2, 'U6: the replay climbed the ladder');
    if (bpAfter !== null) {
      ok(await invOf(db, UID, k2.req_item) === bpAfter, 'U6: the replay consumed a second blueprint');
    }
    ok(again.body.receipt === null,
      'U6: a REPLAYED purchase reported a receipt for a transfer this invocation did not make');

    // …and the SAME key for a DIFFERENT offer is loud, not silent.
    await clearGate();
    const k3 = (await db.query(
      "select offer_id from public.hr_unlock_offers where refusal is null "
      + "and unlock_id='room:kitchen' and value = 3")).rows[0];
    const mism = await doBuy({ intentId: key, offer: k3.offer_id });
    ok(mism.body.ok === false && mism.body.error === 'intent_mismatch',
      `U6: one key reused for a DIFFERENT rung answered ${JSON.stringify(mism.body)} — a silent `
      + 'replay here charges for one rung while the client believes it bought another');
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ── U7 · A STALE VERSION IS REFUSED, AND THE KEY IS RELEASED ───────────
  try {
    await clearGate();
    const k3 = (await db.query(
      "select offer_id from public.hr_unlock_offers where refusal is null "
      + "and unlock_id='room:kitchen' and value = 3")).rows[0];
    const key = uuid();
    const [row] = await exec(
      'select public.hr_unlock_buy($1::uuid, 0, $2::bigint, $3::uuid, $4::text) as res',
      [UID, 1, key, k3.offer_id]);
    ok(row.res.ok === false && row.res.error === 'version_conflict',
      `U7: a stale version was accepted: ${JSON.stringify(row.res)}`);
    const held = (await db.query(
      'select 1 from public.player_intents where user_id=$1 and intent_id=$2', [UID, key])).rows;
    ok(held.length === 0,
      'U7: the key was NOT released after a version conflict — every retry with it answers the '
      + 'same refusal for up to 25 hours (b346), and a derived key cannot change');
    // CONTROL: the release is NARROW. A non-version rejection stays sticky.
    const key2 = uuid();
    const k1id = k1.offer_id;
    await exec('select public.hr_unlock_buy($1::uuid, 0, $2::bigint, $3::uuid, $4::text) as res',
      [UID, await ver(), key2, k1id]);   // already_owned
    const held2 = (await db.query(
      'select 1 from public.player_intents where user_id=$1 and intent_id=$2', [UID, key2])).rows;
    note(held2.length === 1,
      'U7 CONTROL: a NON-version rejection was released too. The release must be narrow, or U7 '
      + 'proves nothing about version_conflict specifically.');
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ── U8 · THE PREREQUISITES BITE, ON A CHARACTER THAT HAS NEITHER ───────
  try {
    const UID2 = '00000000-0000-4000-b354-000000000002';
    await db.exec(`
      insert into auth.users (id) values ('${UID2}') on conflict (id) do nothing;
      do $$ begin
        perform set_config('request.jwt.claim.sub', '${UID2}', true);
        perform public.hr_create_character(0);
      end $$;
      update public.player_state set gold = 5000000 where user_id = '${UID2}';`);
    const doBuy2 = (o) => buy.runUnlockBuy({ exec, user: UID2, slot: 0, ...o });

    const r = await doBuy2({ intentId: uuid(), offer: k1.offer_id });
    ok(r.body.ok === false && r.body.error === 'prereq_property_tier',
      `U8: a Kitchen was sold at property tier 0: ${JSON.stringify(r.body)} — the homestead gate is `
      + 'the only thing between a rich player and every room in the game');

    // The blueprint arm, on a character that HAS the tier and the gold and the
    // materials but not the blueprint.
    const bp = (await db.query(
      "select * from public.hr_unlock_offers where refusal is null and req_item is not null "
      + 'order by offer_id limit 1')).rows[0];
    ok(bp, 'U8: no offer requires a blueprint — the arm cannot run');
    await db.exec(`
      insert into public.player_progress (user_id, slot, kind, key, period_key, value)
      select distinct '${UID2}'::uuid, 0, 'unlock', u.unlock_id, '', u.max_value
        from public.hr_unlocks u where u.namespace='property' and u.max_value = 5
      on conflict do nothing;
      insert into public.player_inventory (user_id, slot, item_id, qty)
      select distinct '${UID2}'::uuid, 0, k, 10000
        from public.hr_unlock_offers o, jsonb_object_keys(coalesce(o.items,'{}'::jsonb)) k
       where o.refusal is null
      on conflict (user_id, slot, item_id) do update set qty = 10000;`);
    // Climb to the rung below the blueprint one, so `rung_skipped` cannot be
    // the reason this call is refused.
    await db.query(
      "insert into public.player_progress (user_id, slot, kind, key, period_key, value) "
      + "values ($1, 0, 'unlock', $2, '', $3)"
      + ' on conflict (user_id, slot, kind, key, period_key) do update set value = excluded.value',
      [UID2, bp.unlock_id, Number(bp.value) - 1]);
    await clearGate();
    const r2 = await doBuy2({ intentId: uuid(), offer: bp.offer_id });
    ok(r2.body.ok === false && r2.body.error === 'prereq_item',
      `U8: ${bp.offer_id} was sold without its ${bp.req_item}: ${JSON.stringify(r2.body)} — the `
      + 'server would sell rungs 2-3 strictly cheaper than the client charges for them');

    // CONTROL: with the blueprint in the bag the SAME call succeeds, and the
    // blueprint is CONSUMED.
    await db.query(
      'insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, $2, 1) '
      + 'on conflict (user_id, slot, item_id) do update set qty = 1', [UID2, bp.req_item]);
    const r3 = await doBuy2({ intentId: uuid(), offer: bp.offer_id });
    ok(r3.body.ok === true,
      `U8 CONTROL FAILED: with the blueprint held, the purchase was still refused: `
      + `${JSON.stringify(r3.body)}`);
    ok(await invOf(db, UID2, bp.req_item) === 0,
      'U8: the blueprint was NOT consumed — src/legacy.js upgradeRoom consumes it, so the server '
      + 'would be strictly cheaper');
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ── U9 · POVERTY, AND HOSTILE BODIES ───────────────────────────────────
  try {
    await clearGate();
    await db.query('update public.player_state set gold = 1 where user_id = $1', [UID]);
    const k3 = (await db.query(
      "select offer_id from public.hr_unlock_offers where refusal is null "
      + "and unlock_id='room:kitchen' and value = 3")).rows[0];
    const r = await doBuy({ intentId: uuid(), offer: k3.offer_id });
    ok(r.body.ok === false && r.body.error === 'insufficient_gold',
      `U9: expected insufficient_gold, got ${JSON.stringify(r.body)}`);
    ok(await rungOf(db, UID, 'room:kitchen') === 2, 'U9: a refused purchase granted the rung anyway');
    await db.query('update public.player_state set gold = 5000000 where user_id = $1', [UID]);

    /* HOSTILE OFFER IDS. Every one of these is a real shape an attacker sends,
       and the two that matter most are the prototype walkers: `constructor` is
       truthy on a plain object and its `.gold` is `undefined` — a free
       permanent capability — which is why every lookup goes through
       catalogueGet. */
    const hostile = [
      null, undefined, '', 42, {}, [], true,
      'constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty',
      'room.kitchen.1 ', ' room.kitchen.1', 'ROOM.KITCHEN.1',
      "room.kitchen.1'; drop table player_state; --",
      'room.kitchen.99', 'room.not_a_room.1', 'x'.repeat(500),
      'theme.winter', 'equip.iron_sword', 'plot.scarecrow',
    ];
    for (const h of hostile) {
      await clearGate();
      const rr = await doBuy({ intentId: uuid(), offer: h });
      ok(rr.body.ok === false,
        `U9: hostile offer ${JSON.stringify(h)} was ACCEPTED: ${JSON.stringify(rr.body)}`);
      ok(['bad_offer', 'unknown_offer', 'offer_unsupported'].includes(rr.body.error),
        `U9: hostile offer ${JSON.stringify(h)} produced ${rr.body.error} — a shape refusal must be `
        + 'one of the three named codes, not an internal error');
    }
    ok(Number((await db.query('select count(*) as n from public.player_state')).rows[0].n) >= 2,
      'U9: player_state did not survive the hostile bodies');

    /* AND THE REAL-BUT-UNSELLABLE ONES ARE NAMED. `theme.winter` is a real
       purchase; telling a player it does not exist sends them to the wrong bug
       report. */
    await clearGate();
    const themed = await doBuy({ intentId: uuid(), offer: 'theme.winter' });
    ok(themed.body.error === 'offer_unsupported' && themed.body.reason,
      `U9: a real offer this build cannot sell answered ${JSON.stringify(themed.body)} — it must `
      + 'be refused BY NAME with the reason attached');
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ── U9b · THE WHOLE POINT: A BOUGHT RUNG MAKES A REAL SPAN BURN NOTHING ─
  // Rung 3 is the burn-proof rung. It is BOUGHT here, through the verb, and the
  // burn count comes out of the REAL src/core/artisan-sim.js driven with the
  // bonus stack built from the SERVER's own envelope — not from a row read back.
  try {
    await clearGate();
    const k3 = (await db.query(
      "select offer_id from public.hr_unlock_offers where refusal is null "
      + "and unlock_id='room:kitchen' and value = 3")).rows[0];
    const r = await doBuy({ intentId: uuid(), offer: k3.offer_id });
    ok(r.body.ok === true, `U9b: rung 3 was refused: ${JSON.stringify(r.body)}`);

    const [{ perks: envPerks }] = (await db.query(
      'select public.hr_perks_of($1::uuid, 0) as perks', [UID])).rows;
    ok(Number(envPerks.rooms.kitchen) === 3,
      `U9b: hr_perks_of reports kitchen = ${JSON.stringify(envPerks.rooms)} after buying rung 3`);
    ok(perks.makeBonus(envPerks)('noBurn') >= 0.25,
      `U9b: Kitchen 3 is the burn-proof rung and noBurn reads ${perks.makeBonus(envPerks)('noBurn')}`);

    const paid = cook(artisan, envPerks);
    const unpaid = cook(artisan, null);
    ok(paid.cooked > 0 && unpaid.cooked > 0,
      `U9b: the span produced nothing (${paid.cooked}/${unpaid.cooked}) — the burn comparison below `
      + 'would pass vacuously');
    ok(paid.burned === 0,
      `U9b: THE BOUGHT RUNG DOES NOT REACH THE SIMULATION — a Cast-Iron Range cooked ${paid.burned} `
      + `burns out of ${paid.cooked}. That is a quarter of the input destroyed on a server that the `
      + "player's own client would have kept.");
    ok(unpaid.burned > 0,
      `U9b CONTROL: the SAME seeded span with NO server rung burned ${unpaid.burned} — if it burns `
      + 'nothing either way, the assertion above proves nothing about the purchase');
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ── U10 · THE JOURNAL, AND WHAT IT MAY NOT SAY ─────────────────────────
  try {
    const rows = (await ledger(db, UID)).filter((r) => String(r.intent || '').startsWith('unlock_buy:'));
    ok(rows.length >= 2, `U10: the ledger holds ${rows.length} unlock_buy rows — a value transfer `
      + 'that is not journalled is not auditable and not reversible');
    for (const r of rows) {
      ok(r.kind === 'shop', `U10: an unlock purchase filed under kind='${r.kind}'`);
      ok(Number(r.gold) < 0, `U10: an unlock purchase journalled gold ${r.gold} — it is a DEBIT`);
      ok(Number(r.gold_in) === 0 && Number(r.xp_in) === 0 && Number(r.qty_in) === 0,
        'U10: an unlock purchase stamped a non-zero daily-budget inflow — it mints nothing and '
        + 'must say so, or purchases consume the ceiling that exists to bound minting');
      ok(r.meta && r.meta.offer && r.meta.unlock,
        `U10: a journal row does not say what was bought: ${JSON.stringify(r.meta)}`);
    }
    /* NOT ONE ROW PER REFUSAL. Six refusals ran above; a journalled rejection
       would rebuild game_events under a new name (1.6M rows / 229 MB from six
       players in four days). */
    ok(rows.length <= 6,
      `U10: ${rows.length} journal rows for at most six successful purchases — refusals are being `
      + 'journalled, which is the game_events mistake at ledger scale');
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ── U11 · THE SOURCE PROPERTIES NOTHING ELSE CAN SEE ───────────────────
  try {
    const src = (await readFile(join(fnDir, 'unlock-buy.js'), 'utf8')).replace(/\r\n/g, '\n');
    /* (a) THE STATEMENT BINDS NO jsonb. This is the T6 property restated for a
           verb T6 cannot grade: T6 requires `::text::jsonb` on hr_apply's last
           argument because a pre-stringified delta bound to a bare `$n::jsonb`
           is double-encoded by postgres.js (the 2026-08-15 P0). This verb has
           no delta, so the correct rule is that it binds NO json parameter at
           all — which also means it cannot start sending one without failing
           here. */
    const stmt = /const BUY_SQL = `([\s\S]*?)`;/.exec(src);
    ok(stmt, 'U11: BUY_SQL could not be located — the source assertions below are blind');
    ok(!/::jsonb/.test(stmt[1]),
      'U11: the commit statement binds a jsonb parameter. This verb sends an OFFER ID and five '
      + 'scalars; a json parameter is either a price crossing the boundary or the double-encoding '
      + 'hazard tests/delta-transport.mjs T6 exists for.');
    ok(!/hr_apply/.test(stmt[1]),
      'U11: the commit statement calls hr_apply, which structurally cannot write a level');
    /* (b) NO PRICE IS COMPUTED HERE. A `* qty`, a `gold:` delta or an
           arithmetic operator on a catalogue price would mean the Edge Function
           had started authoring a cost. */
    ok(!/offer\.gold\s*\*/.test(src),
      'U11: the module multiplies a catalogue price — the server owns the arithmetic on a '
      + 'permanent capability');
    /* (c) THE BUCKET IS READ FROM THE REGISTRY, not a literal (C4). The gate
           itself lives in spend.js; what this file must not do is bypass it. */
    ok(/gateAndRead\(/.test(src),
      'U11: the verb no longer uses spend.js gateAndRead — the rate gate, the bucket lookup and '
      + 'the envelope-carrying refusal would then be four implementations instead of one');
    ok(/collectsFirst\(/.test(src),
      'U11: the registry column collectsFirst has no reader in this verb — a rule nothing reads '
      + 'is not a rule (C4)');
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ── U12 · THE REGISTRY AND THE PARSER AGREE ────────────────────────────
  try {
    ok(it.isKnownVerb('unlock_buy'), 'U12: the registry has no row for unlock_buy');
    ok(req.VERBS.includes('unlock_buy'),
      'U12: request.js does not admit unlock_buy — the verb is unreachable from the wire');
    ok(it.rateBucketFor('unlock_buy') === 'shop',
      `U12: unlock_buy spends the '${it.rateBucketFor('unlock_buy')}' bucket; the shop surface is `
      + 'one budget, and an unknown bucket fails closed as a 429');
    ok(it.requiresKey('unlock_buy') === true,
      'U12: a permanent purchase without a required idempotency key retries into a double charge');
    ok(it.collectsFirst('unlock_buy') === false,
      'U12: unlock_buy claims to collect first and implements no collect — the read FAILS CLOSED, '
      + 'so this would refuse every purchase in the game');
    const parsed = req.parseIntent({ verb: 'unlock_buy', slot: 0, intentId: uuid(), offer: 'room.kitchen.1' });
    ok(parsed && parsed.verb === 'unlock_buy' && parsed.offer === 'room.kitchen.1',
      `U12: the parser did not carry the verb and offer through: ${JSON.stringify(parsed)}`);
    ok(parsed.qty === null || parsed.qty === undefined || Number.isSafeInteger(parsed.qty),
      'U12: qty escaped its shape');
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ── U13 · A MISSING KEY IS REFUSED BEFORE ANY DATABASE WORK ────────────
  try {
    let statements = 0;
    const counting = async (text, params) => { statements += 1; return exec(text, params); };
    const r = await buy.runUnlockBuy({
      exec: counting, user: UID, slot: 0, intentId: null, offer: k1.offer_id,
    });
    ok(r.body.error === 'missing_intent_id', `U13: expected missing_intent_id, got ${r.body.error}`);
    ok(statements === 0,
      `U13: a keyless call issued ${statements} statements. A malformed client must not be able to `
      + "spend a real player's rate budget by looping on garbage.");
    let s2 = 0;
    const counting2 = async (text, params) => { s2 += 1; return exec(text, params); };
    await buy.runUnlockBuy({
      exec: counting2, user: UID, slot: 0, intentId: uuid(), offer: 'nope.nope.nope',
    });
    ok(s2 === 0, `U13: an unknown offer issued ${s2} statements — the catalogue answer is in-process`);
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ── U14 · THE DEAD CLIENT WRITE GRANT, BEFORE AND AFTER (Security C3) ──
  // The six catalogues are swept by 2026-08-16-client-write-grant-sweep.sql, so
  // on a replayed database they are already clean — which proves nothing on its
  // own. So the grants are REPRODUCED here, the detector must NAME all six, and
  // the revoke must make them vanish. A check that only ever sees the fixed
  // state cannot tell "it is fixed" from "it stopped looking".
  const SIX = ['hr_castle_board_tasks', 'hr_castle_buildings', 'hr_castle_items',
    'hr_castle_tiers', 'hr_hunt_bosses', 'hr_hunt_tiers'];
  try {
    const report = async () => {
      const [{ r }] = (await db.query('select public.hr_assert_grant_hygiene(false) as r')).rows;
      return JSON.stringify(r.client_truncate_grants);
    };
    const clean = await report();
    for (const t of SIX) {
      ok(!clean.includes(t),
        `U14: ${t} is reported BEFORE anything is reproduced — the sweep migration did not run or `
        + 'did not revoke');
    }
    ok((await db.query('select public.hr_assert_grant_hygiene(true) as r')).rows.length === 1,
      'U14: strict mode fails on a swept database');

    for (const t of SIX) {
      await db.query(`grant insert, update, delete on public.${t} to anon, authenticated`);
    }
    const dirty = await report();
    for (const t of SIX) {
      ok(dirty.includes(`${t}:authenticated:INSERT`),
        `U14: ${t} carries an authenticated INSERT grant with RLS on and no write policy, and the `
        + `detector did NOT name it. report=${dirty}`);
    }
    let strictFailed = false;
    try { await db.query('select public.hr_assert_grant_hygiene(true) as r'); }
    catch { strictFailed = true; }
    ok(strictFailed,
      'U14: strict mode returned normally with six dead client write grants live — the nightly cron '
      + 'run would report success');

    for (const t of SIX) {
      await db.query(`revoke insert, update, delete on public.${t} from anon, authenticated`);
    }
    const again = await report();
    for (const t of SIX) {
      ok(!again.includes(t), `U14: ${t} is still reported after the revoke. report=${again}`);
    }

    /* C3a — THE BASELINE IS THE DECLARED LIST, AND IT MATCHES REALITY EXACTLY.
       Both directions: a class member missing from the baseline is a grant the
       detector would (correctly) shout about forever, and a baseline row with
       no live grant is a claim that has outlived its subject. The migration
       raises on the first and warns on the second; this measures the state it
       actually left behind. */
    const classNow = (await db.query(`
      select g.table_name || ':' || g.grantee as k
        from information_schema.role_table_grants g
        join pg_class c on c.relname = g.table_name and c.relnamespace = 'public'::regnamespace
       where g.table_schema = 'public' and g.grantee in ('anon','authenticated','PUBLIC')
         and g.privilege_type in ('INSERT','UPDATE','DELETE') and c.relrowsecurity
         and not exists (select 1 from pg_policies p
                          where p.schemaname='public' and p.tablename = g.table_name
                            and p.cmd in ('INSERT','UPDATE','DELETE','ALL'))
       group by 1 order by 1`)).rows.map((r) => r.k);
    const based = (await db.query(
      "select table_name || ':' || grantee as k from public.hr_client_write_baseline order by 1"))
      .rows.map((r) => r.k);
    /* ⚠ THE CLASS IS ALLOWED TO BE EMPTY, since sweep batch 4 — and this control
       had to change with it. It used to be `classNow.length > 0`, whose purpose
       was "the class predicate has not gone blind". Batch 4 sweeps the last
       seventeen tables, so an EMPTY class (and an empty baseline) is now the
       correct end state and that assertion fails on a FINISHED programme —
       exactly the pressure that gets a guard loosened instead of fixed. So the
       property is proven directly instead: plant a table with RLS on, no write
       policy and an authenticated INSERT grant, and demand the very same query
       NAMES it. That tests the predicate rather than the size of its output. */
    await db.query('savepoint u14cls');
    await db.query('create table public.hr__u14_probe (id int primary key)');
    await db.query('alter table public.hr__u14_probe enable row level security');
    await db.query('revoke all on public.hr__u14_probe from public, anon, authenticated, service_role');
    await db.query('grant insert on public.hr__u14_probe to authenticated');
    const clsProbe = (await db.query(`
      select g.table_name || ':' || g.grantee as k
        from information_schema.role_table_grants g
        join pg_class c on c.relname = g.table_name and c.relnamespace = 'public'::regnamespace
       where g.table_schema = 'public' and g.grantee in ('anon','authenticated','PUBLIC')
         and g.privilege_type in ('INSERT','UPDATE','DELETE') and c.relrowsecurity
         and not exists (select 1 from pg_policies p
                          where p.schemaname='public' and p.tablename = g.table_name
                            and p.cmd in ('INSERT','UPDATE','DELETE','ALL'))
       group by 1`)).rows.map((r) => r.k);
    await db.query('rollback to savepoint u14cls');
    await db.query('release savepoint u14cls').catch(() => {});
    ok(clsProbe.includes('hr__u14_probe:authenticated'),
      'U14 CONTROL: the dead-grant class predicate did NOT name a freshly-created table with RLS '
      + 'on, no write policy and an authenticated INSERT grant. The predicate has gone blind, so '
      + `the comparison below is vacuous. saw=${clsProbe.join(', ') || '(nothing)'}`);
    ok(JSON.stringify(classNow) === JSON.stringify(based),
      `U14 (C3a): the declared baseline and reality disagree.\n    class only: `
      + `${classNow.filter((k) => !based.includes(k)).join(', ') || '(none)'}\n    baseline only: `
      + `${based.filter((k) => !classNow.includes(k)).join(', ') || '(none)'}`);
    for (const t of SIX) {
      ok(!based.some((k) => k.startsWith(`${t}:`)),
        `U14: ${t} was BASELINED instead of swept — the finding recorded as accepted`);
    }
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ── U15 · THE RECEIPT IS THE SERVER'S, NOT THE EDGE CATALOGUE'S (C4) ───
  // The price is moved IN THE TABLE ONLY, so the Edge module's copy is now
  // provably wrong. A receipt built from `res.charged` stays correct; one built
  // from `UNLOCK_OFFERS` reports a price the player was not charged — silently,
  // on the success path, which is the worst place for a wrong number.
  try {
    await clearGate();
    const farm = (await db.query(
      "select * from public.hr_unlock_offers where refusal is null "
      + "and unlock_id='property:farmstead'")).rows[0];
    ok(farm, 'U15: property:farmstead is not sellable — the arm cannot run');
    const edgeGold = cat.UNLOCK_OFFERS[farm.offer_id].gold;
    const serverGold = Number(farm.gold) + 4321;
    await db.query('update public.hr_unlock_offers set gold = $1 where offer_id = $2',
      [serverGold, farm.offer_id]);
    ok(edgeGold !== serverGold, 'U15 CONTROL: the two prices are identical, so the arm proves nothing');

    const g0 = await gold();
    const r = await doBuy({ intentId: uuid(), offer: farm.offer_id });
    ok(r.body.ok === true, `U15: the purchase was refused: ${JSON.stringify(r.body)}`);
    ok(await gold() === g0 - serverGold,
      `U15: the SERVER charged ${g0 - (await gold())} against a table price of ${serverGold}`);
    ok(r.body.receipt.gold === -serverGold,
      `U15: the receipt says ${r.body.receipt.gold} while the server took ${serverGold} — it is `
      + `being built from the Edge catalogue (${edgeGold}), which is a copy nobody re-validates`);
    await db.query('update public.hr_unlock_offers set gold = $1 where offer_id = $2',
      [Number(farm.gold), farm.offer_id]);
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ── U16 · A PARTIAL ITEM DEBIT ROLLS BACK IN FULL (Security C5a) ───────
  // Starve ONE line of a multi-line offer. `jsonb_each_text` has no defined key
  // order, so the starved line may be processed first or last — which is the
  // point: every OTHER line must read exactly what it read before, whichever
  // order the loop took, and the gold must not have moved either.
  try {
    const UID2 = '00000000-0000-4000-b354-000000000002';
    const multi = (await db.query(
      "select * from public.hr_unlock_offers where refusal is null and unlock_id='room:kitchen' "
      + 'and jsonb_array_length(to_jsonb(array(select jsonb_object_keys(items)))) >= 3 '
      + 'order by value limit 1')).rows[0];
    ok(multi, 'U16: no kitchen rung costs three item lines — the arm cannot run');

    // Put UID2 one rung below it, with the blueprint if one is needed.
    await db.query(
      "insert into public.player_progress (user_id, slot, kind, key, period_key, value) "
      + "values ($1, 0, 'unlock', 'room:kitchen', '', $2) "
      + 'on conflict (user_id, slot, kind, key, period_key) do update set value = excluded.value',
      [UID2, Number(multi.value) - 1]);
    await db.query('update public.player_state set gold = 5000000 where user_id = $1', [UID2]);
    if (multi.req_item) {
      await db.query(
        'insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, $2, 1) '
        + 'on conflict (user_id, slot, item_id) do update set qty = 1', [UID2, multi.req_item]);
    }
    const lines = Object.keys(multi.items);
    /* ⚠ THE **LAST** LINE, and the first draft got this wrong. `jsonb_each_text`
       walks a jsonb object in its stored key order (length, then bytewise),
       which is the same order `Object.keys` gives here — so starving the FIRST
       key means nothing has been debited yet when the refusal fires, and the
       rollback assertion below passes against a function that never rolls back.
       Measured: with the starved line first, the S2 mutation
       (`partial_debit_not_rolled_back`) SLIPPED. */
    const starved = lines[lines.length - 1];
    for (const id of lines) {
      await db.query(
        'insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, $2, $3) '
        + 'on conflict (user_id, slot, item_id) do update set qty = excluded.qty',
        [UID2, id, id === starved ? Number(multi.items[id]) - 1 : Number(multi.items[id]) * 3]);
    }
    const before = {};
    for (const id of lines) before[id] = await invOf(db, UID2, id);
    const bpBefore = multi.req_item ? await invOf(db, UID2, multi.req_item) : null;
    const goldBefore = Number((await state(db, UID2)).gold);

    await clearGate();
    const r = await buy.runUnlockBuy({
      exec, user: UID2, slot: 0, intentId: uuid(), offer: multi.offer_id,
    });
    ok(r.body.ok === false && r.body.error === 'insufficient_item',
      `U16: expected insufficient_item, got ${JSON.stringify(r.body)}`);
    ok(Number((await state(db, UID2)).gold) === goldBefore,
      `U16: gold moved ${goldBefore} -> ${(await state(db, UID2)).gold} on a REFUSED purchase`);
    for (const id of lines) {
      ok(await invOf(db, UID2, id) === before[id],
        `U16: ${id} went ${before[id]} -> ${await invOf(db, UID2, id)} on a refused purchase. An `
        + 'item line processed BEFORE the starved one was debited and not restored — the player '
        + 'paid materials for a purchase that did not happen.');
    }
    if (bpBefore !== null) {
      ok(await invOf(db, UID2, multi.req_item) === bpBefore,
        'U16: the blueprint was consumed by a refused purchase');
    }
    ok(await rungOf(db, UID2, 'room:kitchen') === Number(multi.value) - 1,
      'U16: a refused purchase granted the rung anyway');
  } catch (e) { if (!(e instanceof Red)) throw e; }

  await db.close?.();
  return fails;
}

// ── THE GUARD SEAM ──────────────────────────────────────────────────────
/** Run the whole file and return the problems, for tests/run-smoke.mjs. */
export async function unlockBuyGuard() {
  try { return await run(null); }
  catch (e) { return [`unlock-buy guard failed to run — ${e?.message || e}`]; }
}

// ── CLI ─────────────────────────────────────────────────────────────────
// ⚠ EVERYTHING BELOW IS MAIN-ONLY. This module is IMPORTED by run-smoke, and a
//   top-level run on import would boot a second PostgreSQL nobody asked for.
const isMain = import.meta.url === pathToFileURL(process.argv[1] || '').href;
if (isMain) {
  if (has('list')) {
    for (const [id, m] of Object.entries(MUTATIONS)) {
      console.log(`  ${id.padEnd(26)} ${m.migration || m.file.split(/[\\/]/).pop()}`);
      console.log(`  ${' '.repeat(26)} ${m.why}`);
    }
    process.exit(0);
  }

  if (has('selftest')) {
    let slipped = 0;
    for (const id of Object.keys(MUTATIONS)) {
      let caught = false;
      let detail = '';
      try {
        const f = await run(id);
        caught = f.length > 0;
        detail = f[0] || '';
      } catch (e) {
        if (e.harness) { console.error(`  HARNESS  ${id}: ${e.message}`); process.exit(1); }
        caught = true; detail = e.message;
      }
      if (caught) {
        console.log(`  CAUGHT   ${id}  — ${String(detail).split('\n')[0].slice(0, 110)}`);
      } else {
        console.error(`  SLIPPED  ${id}  — ${MUTATIONS[id].why}`);
        slipped += 1;
      }
    }
    if (slipped) {
      console.error(`\n${slipped} mutation(s) SLIPPED. A guard that cannot demonstrate it sees `
        + 'failure is broken, not passing.');
      process.exit(1);
    }
    console.log(`\nall ${Object.keys(MUTATIONS).length} mutations caught`);
    process.exit(0);
  }

  const mutate = argOf('mutate', null);
  let failures;
  try {
    failures = await run(mutate);
  } catch (e) {
    if (e.harness) { console.error(`unlock-buy: HARNESS: ${e.message}`); process.exit(1); }
    console.error(`unlock-buy: ${e.message}`);
    process.exit(1);
  }
  if (failures.length) {
    for (const f of failures) console.error(`  x ${f}`);
    console.error(`\nunlock-buy: ${failures.length} failure(s)`);
    process.exit(1);
  }
  console.log('unlock-buy: OK — the purchase lands, the rung reaches the engine, and nothing about it '
    + 'can be bought twice, skipped, replayed for value or priced by the caller.');
}
