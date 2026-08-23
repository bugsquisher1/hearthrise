#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-gold-ladders.mjs — THE GOLD-SPEND LADDER MIGRATION (slices 2 & 3),
// generated from src/data/gold-ladders.js with a drift guard against the game
// data it mirrors.
//
//   node tools/gen-gold-ladders.mjs           → (re)write the generated migration
//   node tools/gen-gold-ladders.mjs --check   → exit 1 if committed file differs
//   node tools/gen-gold-ladders.mjs --report  → print the extraction
//
// ── WHAT IT EMITS ───────────────────────────────────────────────────────
// supabase/migrations/2026-08-19-gold-spend-slices-2-3.sql: three MAX-merge
// unlock ladders (worker_hire, plot:farm_land, bank) in public.hr_unlocks, and
// their per-rung PRICE + property-tier PREREQUISITE in public.hr_unlock_offers,
// so the ONE existing spend RPC (public.hr_unlock_buy) sells them with no new
// code. No bonus magnitude is emitted — only the rung ladder, the price and the
// gate, which is bookkeeping.
//
// ── THE DRIFT GUARD ─────────────────────────────────────────────────────
// The manifest carries constants (HIRE_COSTS, the bank curve, the flat farm
// price, the tier gates). This tool RE-DERIVES every one of them from the live
// game sources — src/features/workers.js HIRE_COSTS, src/legacy.js BANK_SPACE
// and PLOT_BUILDINGS, src/features/homestead.js TIERS — and FAILS if the
// manifest has drifted from them. So a balance change to any of those without a
// matching manifest edit stops the build, exactly like gen-shops/gen-perks.
//
// PURE ESM, Node only. Writes one file.
// ════════════════════════════════════════════════════════════════════════

import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sliceLiteral, makeDie } from './lib/slice-literal.mjs';
import {
  GOLD_LADDER_OFFERS, GOLD_LADDER_UNLOCKS,
  WORKER_HIRE_COSTS, FARM_LAND_GOLD, FARM_LAND_ITEMS,
  BANK_BASE, BANK_GROWTH, BANK_RUNGS, bankRungPrice,
} from '../src/data/gold-ladders.js';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const OUT = join(ROOT, 'supabase', 'migrations', '2026-08-19-gold-spend-slices-2-3.sql');
const die = makeDie('gen-gold-ladders');
const read = (rel) => readFile(join(ROOT, rel), 'utf8');

const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
const REPORT = argv.includes('--report');

// ── DRIFT GUARD — the manifest must equal the live game sources ─────────────
const eq = (a, b, what) => { if (JSON.stringify(a) !== JSON.stringify(b)) die(`${what} DRIFT: manifest ${JSON.stringify(a)} != game data ${JSON.stringify(b)}`); };

const TIERS = sliceLiteral(await read('src/features/homestead.js'), 'var TIERS = [', 'homestead.js', die);
const HIRE = sliceLiteral(await read('src/features/workers.js'), 'var HIRE_COSTS = [', 'workers.js', die);
const legacy = await read('src/legacy.js');
const BANK_SPACE = sliceLiteral(legacy, 'var BANK_SPACE = {', 'legacy.js', die);
const PLOT_BUILDINGS = sliceLiteral(legacy, 'const PLOT_BUILDINGS={', 'legacy.js', die);

// worker/plot caps and gates, re-derived from TIERS
const firstTierWith = (key, n) => { for (let t = 0; t < TIERS.length; t++) if ((TIERS[t][key] || 0) >= n) return t; return die(`no tier grants ${n} ${key}`); };

eq(WORKER_HIRE_COSTS, HIRE, 'HIRE_COSTS');
eq(FARM_LAND_GOLD, PLOT_BUILDINGS.farm_plot.cost.gold, 'farm plot gold');
eq(FARM_LAND_ITEMS.normal_log, PLOT_BUILDINGS.farm_plot.cost.normal_log, 'farm plot log');
eq(BANK_BASE, BANK_SPACE.gold.base, 'bank base');
eq(BANK_GROWTH, BANK_SPACE.gold.growth, 'bank growth');
// The worker ladder cannot ask for more workers than the castle grants, ditto plots.
eq(GOLD_LADDER_UNLOCKS.find((u) => u.unlock_id === 'worker_hire').max_value, TIERS[TIERS.length - 1].workers, 'worker cap');
eq(GOLD_LADDER_UNLOCKS.find((u) => u.unlock_id === 'plot:farm_land').max_value, TIERS[TIERS.length - 1].plots, 'plot cap');

for (const r of GOLD_LADDER_OFFERS) {
  if (r.unlock_id === 'worker_hire') {
    eq(r.gold, HIRE[r.value - 1], `worker rung ${r.value} price`);
    eq(r.req_property_tier, firstTierWith('workers', r.value), `worker rung ${r.value} tier gate`);
  } else if (r.unlock_id === 'plot:farm_land') {
    eq(r.gold, FARM_LAND_GOLD, `farm rung ${r.value} price`);
    eq(r.req_property_tier, firstTierWith('plots', r.value), `farm rung ${r.value} tier gate`);
  } else if (r.unlock_id === 'bank') {
    eq(r.gold, bankRungPrice(r.value - 1), `bank rung ${r.value} price`);
    eq(r.req_property_tier, 0, `bank rung ${r.value} tier gate`);
  }
}

// ── EMIT ────────────────────────────────────────────────────────────────────
const q = (s) => (s === null || s === undefined ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const num = (n) => (n === null || n === undefined ? 'null' : String(n));
const jb = (o) => `${q(JSON.stringify(o))}::jsonb`;
const iarr = (a) => `array[${a.join(',')}]::int[]`;

const DIGEST = createHash('sha256').update(JSON.stringify({ GOLD_LADDER_UNLOCKS, GOLD_LADDER_OFFERS })).digest('hex');

const unlockLines = GOLD_LADDER_UNLOCKS.map((u) =>
  `  (${q(u.unlock_id)}, ${q(u.namespace)}, 'max', 'unlock', ${num(u.max_value)}, ${iarr(u.rungs)})`).join(',\n');

const offerLines = GOLD_LADDER_OFFERS.map((r) =>
  `  (${q(r.offer_id)}, ${q(r.table_name)}, ${q(r.name)}, ${q(r.unlock_id)}, ${num(r.value)}, `
  + `${num(r.gold)}, ${jb(r.items)}, ${num(r.req_property_tier)}, null, null, `
  + `'gen-gold-ladders')`).join(',\n');

const offerIds = GOLD_LADDER_OFFERS.map((r) => q(r.offer_id)).join(', ');
const nSell = GOLD_LADDER_OFFERS.length;
const nUnlock = GOLD_LADDER_UNLOCKS.length;

const file = `-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — GOLD-SPEND SLICES 2 & 3  (GENERATED — DO NOT EDIT BY HAND)
--   worker_hire (6) · plot:farm_land (12) · bank (30)  ·  digest ${DIGEST}
--
--   Generated by tools/gen-gold-ladders.mjs from src/data/gold-ladders.js.
--   Any hand edit is reverted by the next generation and FAILS
--   \`node tools/gen-gold-ladders.mjs --check\` (a preflight in tests/run-smoke.mjs).
--
-- ── WHAT THIS FILE DOES ─────────────────────────────────────────────────
-- Arms three permanent gold-priced capabilities as MAX-MERGE unlock ladders so
-- that the EXISTING spend RPC public.hr_unlock_buy (2026-08-16-unlock-buy.sql)
-- sells them WITH NO NEW CODE PATH:
--   · the ladder / rung-order / already_owned / GREATEST-merge invariants,
--   · the per-day clamp, the advisory lock, the idempotency key,
--   · and the property-tier PREREQUISITE — which is how the designer's cap
--     ("workers <= tierDef.workers", "plots <= tierDef.plots") is enforced:
--     each rung carries req_property_tier = the first property tier whose crew /
--     land is large enough, checked in SQL against the character's OWN
--     server-side property tier. A client-sent tier never enters it.
--
-- ── WHY A LADDER, NOT A COUNT ───────────────────────────────────────────
-- Additive count is the wrong server model: concurrent buys double-increment
-- past the cap, a replay double-increments, and worker's ESCALATING price could
-- be dodged by re-buying the cheapest rung. A monotonic max ladder makes every
-- one of those structurally impossible — hr_unlock_buy already refuses a skipped
-- rung, an already-owned rung and an off-ladder value.
--
-- ⚠ APPLY-ORDER / RE-APPLY CONTRACT (READ THIS — IT CHANGED)
--   These 48 offers share public.hr_unlock_offers with the 2026-08-16 generated
--   catalogue. That file used to refill the table with a bare
--   \`delete from public.hr_unlock_offers\`, so RE-APPLYING IT ALONE WIPED THESE
--   ROWS — which is exactly what happened in production: worker_hire, farm_land
--   and bank all became \`unknown_offer\` and three gold sinks went dark. The
--   prose warning that used to sit here was not an interlock.
--   Every row now carries the tool that OWNS it (\`hr_unlock_offers.source\`) and
--   each generator deletes only its own, so either file may be re-applied ALONE,
--   in any order, without touching the other's rows. This file remains fully
--   idempotent (upsert + scoped delete).
--
-- REVERSIBILITY
--   delete from public.hr_unlock_offers where offer_id in (${GOLD_LADDER_OFFERS.length} ids below);
--   delete from public.hr_unlocks where unlock_id in ('worker_hire','plot:farm_land','bank');
--   Nothing else is touched: no function is replaced, no policy is written, no
--   grant is changed. hr_unlock_buy sells whatever these tables carry.
--
-- SAFE TO RE-RUN.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED ───────────────────────────────────────
do $$
begin
  if to_regclass('public.hr_unlocks') is null or to_regclass('public.hr_unlock_offers') is null then
    raise exception 'the unlock catalogues are absent — apply the 2026-08-16 unlock migrations first';
  end if;
  if to_regprocedure('public.hr_unlock_buy(uuid,int,bigint,uuid,text)') is null then
    raise exception 'hr_unlock_buy is absent — apply 2026-08-16-unlock-buy.sql first. This file adds '
                    'ladders it SELLS; without the seller they are inert rows.';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.player_progress'::regclass
                  and tgname = 'player_progress_unlock_guard' and not tgisinternal) then
    raise exception 'player_progress_unlock_guard is absent — apply 2026-08-16-artisan-progress-model.sql '
                    'first. It is the INDEPENDENT storage guard that refuses an off-ladder rung whatever '
                    'hr_unlock_buy proposes; these ladders rely on it as their backstop.';
  end if;
end $$;

-- ── 1. THE CATALOGUE ROWS (hr_unlocks) — how the level MERGES ────────────
-- Upsert, because worker/plot may already carry a legacy count row from a
-- 2026-08-16 catalogue; these ids are the SERVER-AUTHORITATIVE max ladders.
insert into public.hr_unlocks (unlock_id, namespace, merge, progress_kind, max_value, rungs)
values
${unlockLines}
on conflict (unlock_id) do update
  set namespace = excluded.namespace, merge = excluded.merge,
      progress_kind = excluded.progress_kind, max_value = excluded.max_value, rungs = excluded.rungs;

-- ── 2. THE OFFER ROWS (hr_unlock_offers) — the PRICE and the GATE ────────
-- Row ownership, added additively so this file can be applied against a
-- database that has not yet run the patched 2026-08-16 catalogue. The DEFAULT
-- names the OTHER generator because every row that predates the column was
-- written by it; the insert below states this file's ownership explicitly.
alter table public.hr_unlock_offers
  add column if not exists source text not null default 'gen-unlock-offers';

-- Scoped delete + insert: this file OWNS exactly these offer ids and touches no
-- other row, so it never fights the shop-derived refill — and, since the refill
-- is now scoped by \`source\`, the refill no longer fights it either.
delete from public.hr_unlock_offers where offer_id in (${offerIds});
insert into public.hr_unlock_offers
  (offer_id, table_name, name, unlock_id, value, gold, items, req_property_tier, req_item, refusal, source)
values
${offerLines};

-- ── 3. STRUCTURAL ASSERTIONS ─────────────────────────────────────────────
do $$
declare v_n int; v_bad text; v_p oid;
begin
  -- (a) Every ladder row present and SELLABLE.
  select count(*) into v_n from public.hr_unlock_offers
   where refusal is null and offer_id in (${offerIds});
  if v_n <> ${nSell} then
    raise exception 'expected ${nSell} sellable gold-ladder offers, found %', v_n;
  end if;

  -- (a2) …and every one of them OWNED BY THIS FILE. This is the interlock for
  --      the production incident: a row left tagged 'gen-unlock-offers' is a row
  --      the shop refill will delete the next time it runs, and three gold sinks
  --      go dark again with nothing in any log to explain it.
  select count(*) into v_n from public.hr_unlock_offers
   where offer_id in (${offerIds}) and source = 'gen-gold-ladders';
  if v_n <> ${nSell} then
    raise exception 'only % of ${nSell} gold-ladder offers are owned by gen-gold-ladders — the '
                    'rest would be wiped by the next shop-catalogue refill', v_n;
  end if;

  -- (b) CROSS-CATALOGUE PARITY. Every sellable rung must be a rung the merge
  --     catalogue knows AND inside its ceiling, or hr_unlock_buy would sell it
  --     and the storage guard would then refuse it — a player charged for a
  --     bad_delta. This is the join that makes the two tables agree.
  select string_agg(o.offer_id, ', ') into v_bad
    from public.hr_unlock_offers o
    join public.hr_unlocks u on u.unlock_id = o.unlock_id
   where o.offer_id in (${offerIds})
     and (u.merge <> 'max' or u.progress_kind <> 'unlock'
          or not (o.value = any (coalesce(u.rungs, array[]::int[])))
          or (u.max_value is not null and o.value > u.max_value));
  if v_bad is not null then
    raise exception 'gold-ladder offers off their own ladder: %', v_bad;
  end if;

  -- (c) THE TIER GATE IS SANE. A rung whose gate exceeds the top property tier
  --     is a purchase NO player can ever make — an unreachable rung is a dead
  --     gold sink, and a NEGATIVE gate is a client-tier leak.
  select string_agg(offer_id, ', ') into v_bad from public.hr_unlock_offers
   where offer_id in (${offerIds})
     and (req_property_tier is null or req_property_tier < 0 or req_property_tier > 5);
  if v_bad is not null then
    raise exception 'gold-ladder offers with an out-of-range property-tier gate: %', v_bad;
  end if;

  -- (d) THE SELLER IS STILL ENGINE-ONLY. This file grants nothing and replaces
  --     nothing, but it is the cheap place to re-assert that the verb these rows
  --     feed cannot be called by a browser — the whole point of the ladder.
  v_p := to_regprocedure('public.hr_unlock_buy(uuid,int,bigint,uuid,text)');
  foreach v_bad in array array['public','anon','authenticated','service_role'] loop
    if has_function_privilege(v_bad, v_p, 'execute') then
      raise exception 'hr_unlock_buy became executable by % — a client could buy the whole crew, all '
                      'the land and a maxed bank for itself with no Edge Function in the way', v_bad;
    end if;
  end loop;

  -- (e) NO CLIENT WRITE SURFACE ON THE OFFER TABLE. It is world-READABLE by
  --     design (the shop screen renders these prices); a client INSERT/UPDATE
  --     would be a client-authored price on a permanent capability.
  select count(*) into v_n from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'hr_unlock_offers'
     and grantee in ('anon','authenticated','service_role','PUBLIC')
     and privilege_type <> 'SELECT';
  if v_n > 0 then raise exception '% client write grants on hr_unlock_offers', v_n; end if;

  raise notice 'gold-ladders §3 PASSED: ${nSell} sellable rungs across ${nUnlock} ladders, all on-ladder '
               'and inside ceiling, tier gates in [0,5], the seller engine-only, the price table read-only.';
end $$;

-- ── 4. BEHAVIOUR — the gate BITES, and a legal buy LANDS ─────────────────
-- Every refusal paired with the nearest legal control, run through the REAL
-- hr_unlock_buy so this proves the ladder as the engine sells it, not as SQL
-- imagines it. Skipped (loudly) only if the character bootstrap is absent.
do $$
declare
  v_uid  uuid := '00000000-0000-4000-8000-00000000b192';
  v_r    jsonb; v_ver bigint; v_g0 bigint; v_g1 bigint; v_key uuid;
begin
  if to_regprocedure('public.hr_create_character(int)') is null then
    raise exception 'gold-ladders §4 CANNOT RUN: hr_create_character is missing — a skipped check is '
                    'not a passed one. Apply 2026-08-14-character-bootstrap.sql first.';
  end if;

  begin  -- ── subtransaction, rolled back ────────────────────────────────
    insert into auth.users (id) values (v_uid);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    v_r := public.hr_create_character(0);
    if coalesce(v_r->>'ok', v_r->>'created', 'false') <> 'true' then
      raise exception 'gold-ladders §4: no probe character: %', v_r;
    end if;
    update public.player_state set gold = 10000000 where user_id = v_uid and slot = 0;
    insert into public.player_inventory (user_id, slot, item_id, qty)
      values (v_uid, 0, 'normal_log', 1000)
    on conflict (user_id, slot, item_id) do update set qty = 1000;

    -- (a) BANK rung 1 sells at property tier 0 (no gate) and charges 3000g.
    select version, gold into v_ver, v_g0 from public.player_state where user_id=v_uid and slot=0;
    v_key := gen_random_uuid();
    v_r := public.hr_unlock_buy(v_uid, 0, v_ver, v_key, 'bank.0');
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception 'gold-ladders §4(a) CONTROL FAILED: bank.0 refused (%)', v_r;
    end if;
    select gold into v_g1 from public.player_state where user_id=v_uid and slot=0;
    if v_g1 <> v_g0 - 3000 then
      raise exception 'gold-ladders §4(a): bank.0 charged %g, expected 3000', v_g0 - v_g1;
    end if;
    -- (b) …and a replay under the same key pays EXACTLY ONCE.
    v_r := public.hr_unlock_buy(v_uid, 0, v_ver, v_key, 'bank.0');
    if coalesce(v_r->>'replayed','false') <> 'true' then
      raise exception 'gold-ladders §4(b): bank.0 replay not reported as one (%)', v_r;
    end if;
    if (select gold from public.player_state where user_id=v_uid and slot=0) <> v_g1 then
      raise exception 'gold-ladders §4(b): the bank replay CHARGED AGAIN';
    end if;

    -- (c) WORKER rung 2 before rung 1 is refused by NAME — the ladder is a ladder.
    select version into v_ver from public.player_state where user_id=v_uid and slot=0;
    v_r := public.hr_unlock_buy(v_uid, 0, v_ver, gen_random_uuid(), 'worker_hire.2');
    if v_r->>'error' is distinct from 'rung_skipped' then
      raise exception 'gold-ladders §4(c): worker_hire.2 before .1 answered % (expected rung_skipped)', v_r;
    end if;

    -- (d) WORKER rung 1 at property tier 0 is refused: a camp hires nobody, and
    --     the SERVER is the one that knows the tier.
    v_r := public.hr_unlock_buy(v_uid, 0, v_ver, gen_random_uuid(), 'worker_hire.1');
    if v_r->>'error' is distinct from 'prereq_property_tier' then
      raise exception 'gold-ladders §4(d): worker_hire.1 at tier 0 answered % (expected '
                      'prereq_property_tier) — the tier cap is the whole invariant', v_r;
    end if;

    -- Grant the homestead (tier 1) the way the property ladder would, then:
    insert into public.player_progress (user_id, slot, kind, key, period_key, value)
      values (v_uid, 0, 'unlock', 'property:homestead', '', 1);

    -- (e) CONTROL — worker_hire.1 now LANDS (tier 1 grants 1 worker).
    select version into v_ver from public.player_state where user_id=v_uid and slot=0;
    v_r := public.hr_unlock_buy(v_uid, 0, v_ver, gen_random_uuid(), 'worker_hire.1');
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception 'gold-ladders §4(e) CONTROL FAILED: worker_hire.1 refused at tier 1 (%)', v_r;
    end if;
    -- (f) …but worker_hire.2 still needs tier 2. The cap RISES with the tier and
    --     not one rung faster.
    select version into v_ver from public.player_state where user_id=v_uid and slot=0;
    v_r := public.hr_unlock_buy(v_uid, 0, v_ver, gen_random_uuid(), 'worker_hire.2');
    if v_r->>'error' is distinct from 'prereq_property_tier' then
      raise exception 'gold-ladders §4(f): worker_hire.2 at tier 1 answered % (expected '
                      'prereq_property_tier) — the crew cap outran the property', v_r;
    end if;

    -- (g) FARM land: rungs 1-4 (gates 0,0,1,1) all land at tier 1, IN ORDER,
    --     then rung 5 (needs tier 2) is refused by the TIER GATE. Note rungs 1-4
    --     must be bought first or rung 5 would be refused as rung_skipped, not
    --     by the gate — hr_unlock_buy checks rung order BEFORE the tier prereq.
    for v_g0 in 1..4 loop
      select version into v_ver from public.player_state where user_id=v_uid and slot=0;
      v_r := public.hr_unlock_buy(v_uid, 0, v_ver, gen_random_uuid(), 'farm_land.' || v_g0::text);
      if coalesce(v_r->>'ok','false') <> 'true' then
        raise exception 'gold-ladders §4(g) CONTROL FAILED: farm_land.% refused at tier 1 (%)', v_g0, v_r;
      end if;
    end loop;
    select version into v_ver from public.player_state where user_id=v_uid and slot=0;
    v_r := public.hr_unlock_buy(v_uid, 0, v_ver, gen_random_uuid(), 'farm_land.5');
    if v_r->>'error' is distinct from 'prereq_property_tier' then
      raise exception 'gold-ladders §4(g): farm_land.5 at tier 1 (holding rung 4) answered % '
                      '(expected prereq_property_tier — the land cap tracks the property tier)', v_r;
    end if;

    raise exception using errcode = 'HRB19', message = 'gold-ladders §4 complete — rolling back';
  exception when sqlstate 'HRB19' then
    null;
  end;

  if exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'gold-ladders §4 LEAKED a probe row';
  end if;

  raise notice 'GOLD-LADDERS OK — bank sells at tier 0 and replays once; the worker crew cap and the '
               'farm-land cap both track the SERVER property tier and refuse a rung the tier does not '
               'reach; the ladder refuses a skipped rung. Every refusal paired with a control. Zero residue.';
end $$;

do $$
begin
  raise notice 'gold-spend slices 2 & 3 INSTALLED — worker_hire(6) + plot:farm_land(12) + bank(30) are '
               'sellable through hr_unlock_buy, each gated on the server-owned property tier.';
end $$;
`;

// ── OUTPUT MODE ──────────────────────────────────────────────────────────
if (REPORT) {
  console.log(`gen-gold-ladders: ${GOLD_LADDER_OFFERS.length} rungs, digest ${DIGEST.slice(0, 12)}…`);
  for (const r of GOLD_LADDER_OFFERS) {
    console.log(`  ${r.offer_id.padEnd(16)} ${r.unlock_id}=${r.value}  ${String(r.gold).padStart(7)}g `
      + `${JSON.stringify(r.items)} tier>=${r.req_property_tier}`);
  }
} else if (CHECK) {
  const existing = await readFile(OUT, 'utf8').catch(() => null);
  if (existing === null) { console.error(`gold-ladder drift: ${OUT} is missing. Run: node tools/gen-gold-ladders.mjs`); process.exit(1); }
  const norm = (s) => s.replace(/\r\n/g, '\n');
  if (norm(existing) !== norm(file)) {
    console.error('gold-ladder drift: the manifest or a game-data source moved and the committed');
    console.error('  migration no longer matches. hr_unlock_buy charges out of that table.');
    console.error('  Run: node tools/gen-gold-ladders.mjs   (then read the diff)');
    process.exit(1);
  }
  console.log(`gold ladders in sync (${GOLD_LADDER_OFFERS.length} rungs, digest ${DIGEST.slice(0, 12)}…)`);
} else {
  await writeFile(OUT, file, 'utf8');
  console.log(`wrote ${OUT}`);
  console.log(`  ${GOLD_LADDER_OFFERS.length} rungs · digest ${DIGEST}`);
}
