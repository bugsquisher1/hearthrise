#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-gold-ladders.mjs — THE GOLD-SPEND LADDER CATALOGUE, generated from
// src/data/gold-ladders.js.
//
//   node tools/gen-gold-ladders.mjs           → (re)write the newest STAGED file it owns
//   node tools/gen-gold-ladders.mjs --new <YYYY-MM-DD-name>.generated.sql → start a forward file
//   node tools/gen-gold-ladders.mjs --check   → exit 1 if the newest file it owns differs
//   node tools/gen-gold-ladders.mjs --report  → print the extraction
//
// ── WHAT IT EMITS ───────────────────────────────────────────────────────
// The bank ladder (30 MAX-merge rungs) in public.hr_unlocks and its per-rung
// PRICE in public.hr_unlock_offers, so the ONE spend RPC (public.hr_unlock_buy)
// sells it with no new code. No bonus magnitude is emitted, only the rung
// ladder and the price, which is bookkeeping.
//
// THE OUTPUT is the newest migration this tool wrote, in apply order
// (tools/lib/generated-target.mjs). 2026-08-19-gold-spend-slices-2-3.sql is its
// APPLIED history: it sold worker_hire (6), plot:farm_land (12) and bank (30).
// lane/c-dead-plot-deed (2026-11-07) cut the first two (no reader: the crew's
// doors left with 2027-01-18-dead-surfaces-cut.sql, and the field's size is the
// property ladder plus the Garden). Every file this tool writes now DELETES the
// rows it owns and no longer emits (RETIRED_LADDERS below), so a cut ladder
// cannot linger in the table hr_unlock_buy charges out of.
//
// PURE ESM, Node only. Writes one file.
// ════════════════════════════════════════════════════════════════════════

import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, normalize, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeDie } from './lib/slice-literal.mjs';
import { generatedTarget } from './lib/generated-target.mjs';
import {
  GOLD_LADDER_OFFERS, GOLD_LADDER_UNLOCKS, BANK_STACKS_PER_RUNG,
  bankRungPrice,
} from '../src/data/gold-ladders.js';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const die = makeDie('gen-gold-ladders');

const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
const REPORT = argv.includes('--report');
const OUT = generatedTarget(ROOT, 'gen-gold-ladders.mjs', argv, { write: !CHECK && !REPORT, die });

/* THE LADDERS THIS TOOL ONCE SOLD AND NO LONGER DOES (lane/c-dead-plot-deed, 2026-11-07). Their hr_unlocks rows are
   deleted by id; their offers fall to the scoped delete of every gen-gold-ladders row outside the emitted set. A retired
   ladder that is still emitted fails generation. */
const RETIRED_LADDERS = Object.freeze(['worker_hire', 'plot:farm_land']);
for (const id of RETIRED_LADDERS) {
  if (GOLD_LADDER_UNLOCKS.some((u) => u.unlock_id === id) || GOLD_LADDER_OFFERS.some((r) => r.unlock_id === id)) {
    die(`retired ladder ${id} is still in src/data/gold-ladders.js: take it off RETIRED_LADDERS or remove its rows`);
  }
}

// ── THE MANIFEST'S OWN SHAPE ─────────────────────────────────────────────
const eq = (a, b, what) => { if (JSON.stringify(a) !== JSON.stringify(b)) die(`${what}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`); };
for (const u of GOLD_LADDER_UNLOCKS) {
  const rungs = GOLD_LADDER_OFFERS.filter((r) => r.unlock_id === u.unlock_id).map((r) => r.value).sort((a, b) => a - b);
  eq([...u.rungs], rungs, `${u.unlock_id} ladder rungs vs its offers`);
  eq(u.max_value, rungs[rungs.length - 1], `${u.unlock_id} ceiling`);
}
for (const r of GOLD_LADDER_OFFERS) {
  if (!GOLD_LADDER_UNLOCKS.some((u) => u.unlock_id === r.unlock_id)) die(`offer ${r.offer_id} sells ${r.unlock_id}, which has no ladder row`);
  if (r.unlock_id === 'bank') {
    eq(r.gold, bankRungPrice(r.value - 1), `bank rung ${r.value} price`);
    eq(r.req_property_tier, 0, `bank rung ${r.value} tier gate`);
  }
}
const bank0 = GOLD_LADDER_OFFERS.find((r) => r.offer_id === 'bank.0');
if (!bank0) die('no bank.0 rung: the behaviour probe has no anchor');

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
const retiredIds = RETIRED_LADDERS.map(q).join(', ');
const nSell = GOLD_LADDER_OFFERS.length;
const nUnlock = GOLD_LADDER_UNLOCKS.length;
const summary = GOLD_LADDER_UNLOCKS.map((u) => `${u.unlock_id} (${GOLD_LADDER_OFFERS.filter((r) => r.unlock_id === u.unlock_id).length})`).join(' · ');

const file = `-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE GOLD-SPEND LADDER CATALOGUE  (GENERATED — DO NOT EDIT BY HAND)
--   ${summary}  ·  digest ${DIGEST}
--   retired: ${RETIRED_LADDERS.join(' · ')}
--
--   Generated by tools/gen-gold-ladders.mjs from src/data/gold-ladders.js.
--   Any hand edit is reverted by the next generation and FAILS
--   \`node tools/gen-gold-ladders.mjs --check\` (a preflight in tests/run-smoke.mjs).
--
-- ── WHAT THIS FILE DOES ─────────────────────────────────────────────────
-- Upserts the bank ladder (hr_unlocks) and its prices (hr_unlock_offers), which
-- the EXISTING spend RPC public.hr_unlock_buy sells with no new code path (the
-- ladder / rung-order / already_owned / GREATEST-merge invariants, the per-day
-- clamp, the advisory lock, the idempotency key). And it RETIRES the two ladders
-- that bought nothing (lane/c-dead-plot-deed, 2026-11-07):
--   · worker_hire      the crew size. Its readers, the hire and assign doors,
--                      left with 2027-01-18-dead-surfaces-cut.sql.
--   · plot:farm_land   never read: the field's size is the property ladder plus
--                      the Garden's beds (hr_farm_plot_cap).
-- No window offered either; a hand-made \`unlock_buy\` paid gold for them. Their
-- offers go with the scoped delete below (every gen-gold-ladders row outside the
-- emitted set) and their hr_unlocks rows by id. A rung a player already holds is
-- NOT deleted (it bought nothing and still does nothing; never evict on
-- uncertainty): §0 counts them in a NOTICE.
--
-- ⚠ ROW OWNERSHIP. hr_unlock_offers is written by four generators; every row
--   carries its owner (\`source\`) and each deletes only its own, so any of them
--   may be re-applied ALONE, in any order.
--
-- REVERSIBILITY
--   Re-apply 2026-08-19-gold-spend-slices-2-3.sql's top-level hr_unlocks and
--   hr_unlock_offers statements (they upsert the retired ladders). Nothing else is
--   touched: no function is replaced, no policy written, no grant changed.
--
-- SAFE TO RE-RUN.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED ───────────────────────────────────────
do $$
declare v_n int;
begin
  if to_regclass('public.hr_unlocks') is null or to_regclass('public.hr_unlock_offers') is null then
    raise exception 'the unlock catalogues are absent — apply the 2026-08-16 unlock migrations first';
  end if;
  if to_regprocedure('public.hr_unlock_buy(uuid,int,bigint,uuid,text)') is null then
    raise exception 'hr_unlock_buy is absent — apply 2026-08-16-unlock-buy.sql first';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.player_progress'::regclass
                  and tgname = 'player_progress_unlock_guard' and not tgisinternal) then
    raise exception 'player_progress_unlock_guard is absent — apply 2026-08-16-artisan-progress-model.sql first';
  end if;
  select count(*) into v_n from public.player_progress
   where key = any (array[${retiredIds}]::text[]) and value > 0;
  if v_n > 0 then
    raise notice 'gold-ladders §0: % held rung row(s) of a retired ladder stay in player_progress, inert (no reader, no catalogue row)', v_n;
  end if;
end $$;

-- ── 1. THE CATALOGUE ROWS (hr_unlocks) — how the level MERGES ────────────
insert into public.hr_unlocks (unlock_id, namespace, merge, progress_kind, max_value, rungs)
values
${unlockLines}
on conflict (unlock_id) do update
  set namespace = excluded.namespace, merge = excluded.merge,
      progress_kind = excluded.progress_kind, max_value = excluded.max_value, rungs = excluded.rungs;
delete from public.hr_unlocks where unlock_id = any (array[${retiredIds}]::text[]);

-- ── 2. THE OFFER ROWS (hr_unlock_offers) — the PRICE and the GATE ────────
alter table public.hr_unlock_offers
  add column if not exists source text not null default 'gen-unlock-offers';
-- Scoped: every row THIS tool owns is deleted and the emitted set re-inserted, so a
-- rung it no longer emits leaves; no other generator's row is touched.
delete from public.hr_unlock_offers where source = 'gen-gold-ladders';
insert into public.hr_unlock_offers
  (offer_id, table_name, name, unlock_id, value, gold, items, req_property_tier, req_item, refusal, source)
values
${offerLines};

-- ── 3. STRUCTURAL ASSERTIONS ─────────────────────────────────────────────
do $$
declare v_n int; v_bad text; v_p oid;
begin
  -- (a) Every emitted rung present, SELLABLE and owned by this tool, and nothing else owned by it.
  select count(*) into v_n from public.hr_unlock_offers
   where refusal is null and source = 'gen-gold-ladders' and offer_id in (${offerIds});
  if v_n <> ${nSell} then
    raise exception 'expected ${nSell} sellable gold-ladder offers owned by gen-gold-ladders, found %', v_n;
  end if;
  select count(*) into v_n from public.hr_unlock_offers where source = 'gen-gold-ladders';
  if v_n <> ${nSell} then
    raise exception 'gen-gold-ladders owns % offer rows, expected exactly the ${nSell} it emits', v_n;
  end if;

  -- (a2) THE RETIRED LADDERS ARE GONE: no catalogue row, no offer naming one, from any owner.
  select string_agg(unlock_id, ', ') into v_bad from public.hr_unlocks where unlock_id = any (array[${retiredIds}]::text[]);
  if v_bad is not null then raise exception 'hr_unlocks still holds the retired ladder(s) %', v_bad; end if;
  select string_agg(offer_id, ', ') into v_bad from public.hr_unlock_offers where unlock_id = any (array[${retiredIds}]::text[]);
  if v_bad is not null then raise exception 'hr_unlock_offers still sells a retired ladder: %', v_bad; end if;

  -- (b) CROSS-CATALOGUE PARITY: every sellable rung is a rung the merge catalogue knows, inside its ceiling.
  select string_agg(o.offer_id, ', ') into v_bad
    from public.hr_unlock_offers o
    left join public.hr_unlocks u on u.unlock_id = o.unlock_id
   where o.source = 'gen-gold-ladders'
     and (u.unlock_id is null or u.merge <> 'max' or u.progress_kind <> 'unlock'
          or not (o.value = any (coalesce(u.rungs, array[]::int[])))
          or (u.max_value is not null and o.value > u.max_value));
  if v_bad is not null then
    raise exception 'gold-ladder offers off their own ladder: %', v_bad;
  end if;

  -- (c) THE TIER GATE IS SANE.
  select string_agg(offer_id, ', ') into v_bad from public.hr_unlock_offers
   where source = 'gen-gold-ladders'
     and (req_property_tier is null or req_property_tier < 0 or req_property_tier > 5);
  if v_bad is not null then
    raise exception 'gold-ladder offers with an out-of-range property-tier gate: %', v_bad;
  end if;

  -- (d) THE SELLER IS STILL ENGINE-ONLY.
  v_p := to_regprocedure('public.hr_unlock_buy(uuid,int,bigint,uuid,text)');
  foreach v_bad in array array['public','anon','authenticated','service_role'] loop
    if has_function_privilege(v_bad, v_p, 'execute') then
      raise exception 'hr_unlock_buy became executable by % — a client could buy a maxed bank for itself '
                      'with no Edge Function in the way', v_bad;
    end if;
  end loop;

  -- (e) NO CLIENT WRITE SURFACE ON THE OFFER TABLE.
  select count(*) into v_n from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'hr_unlock_offers'
     and grantee in ('anon','authenticated','service_role','PUBLIC')
     and privilege_type <> 'SELECT';
  if v_n > 0 then raise exception '% client write grants on hr_unlock_offers', v_n; end if;

  raise notice 'gold-ladders §3 PASSED: ${nSell} sellable rungs across ${nUnlock} ladder(s), on-ladder and inside '
               'ceiling; the retired ladders are gone; the seller engine-only; the price table read-only.';
end $$;

-- ── 4. BEHAVIOUR — the bank rung LANDS, a retired rung is UNKNOWN ────────
-- Run through the REAL hr_unlock_buy on a probe account, rolled back.
do $$
declare
  v_uid  uuid := '00000000-0000-4000-8000-00000000b193';
  v_r    jsonb; v_ver bigint; v_g0 bigint; v_g1 bigint; v_cap0 int; v_key uuid; v_off text;
begin
  if to_regprocedure('public.hr_create_character(int)') is null then
    raise exception 'gold-ladders §4 CANNOT RUN: hr_create_character is missing — a skipped check is not a passed one';
  end if;

  begin  -- ── subtransaction, rolled back ────────────────────────────────
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_uid, 'gold-ladders §4 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    v_r := public.hr_create_character(0);
    if coalesce(v_r->>'ok', v_r->>'created', 'false') <> 'true' then
      raise exception 'gold-ladders §4: no probe character: %', v_r;
    end if;
    insert into public.account_wallet as w (user_id, gold) values (v_uid, 10000000)
      on conflict (user_id) do update set gold = excluded.gold, version = w.version + 1, updated_at = now();

    -- (a) BANK rung 1 sells at property tier 0, charges ${bank0.gold}g and raises the bag cap by ${BANK_STACKS_PER_RUNG}.
    select version, bank_cap into v_ver, v_cap0 from public.player_state where user_id = v_uid and slot = 0;
    select gold into v_g0 from public.account_wallet where user_id = v_uid;
    v_key := gen_random_uuid();
    v_r := public.hr_unlock_buy(v_uid, 0, v_ver, v_key, 'bank.0');
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      raise exception 'gold-ladders §4(a) CONTROL FAILED: bank.0 refused (%)', v_r;
    end if;
    select gold into v_g1 from public.account_wallet where user_id = v_uid;
    if v_g1 <> v_g0 - ${bank0.gold} then
      raise exception 'gold-ladders §4(a): bank.0 charged %g, expected ${bank0.gold}', v_g0 - v_g1;
    end if;
    if (select bank_cap from public.player_state where user_id = v_uid and slot = 0) <> v_cap0 + ${BANK_STACKS_PER_RUNG} then
      raise exception 'gold-ladders §4(a): bank.0 moved the bag cap % -> %, expected +${BANK_STACKS_PER_RUNG}',
        v_cap0, (select bank_cap from public.player_state where user_id = v_uid and slot = 0);
    end if;
    -- (b) …and a replay under the same key pays EXACTLY ONCE.
    v_r := public.hr_unlock_buy(v_uid, 0, v_ver, v_key, 'bank.0');
    if coalesce(v_r->>'replayed', 'false') <> 'true' then
      raise exception 'gold-ladders §4(b): bank.0 replay not reported as one (%)', v_r;
    end if;
    if (select gold from public.account_wallet where user_id = v_uid) <> v_g1 then
      raise exception 'gold-ladders §4(b): the bank replay CHARGED AGAIN';
    end if;

    -- (c) A RETIRED RUNG IS AN UNKNOWN OFFER and costs nothing (the old file sold both for gold).
    foreach v_off in array array['worker_hire.1', 'farm_land.1'] loop
      select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
      v_r := public.hr_unlock_buy(v_uid, 0, v_ver, gen_random_uuid(), v_off);
      if v_r->>'error' is distinct from 'unknown_offer' then
        raise exception 'gold-ladders §4(c): the retired % answered % (expected unknown_offer)', v_off, v_r;
      end if;
    end loop;
    if (select gold from public.account_wallet where user_id = v_uid) <> v_g1 then
      raise exception 'gold-ladders §4(c): a retired rung moved the purse';
    end if;

    raise exception using errcode = 'HRB19', message = 'gold-ladders §4 complete — rolling back';
  exception when sqlstate 'HRB19' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);

  if exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from public.account_wallet where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'gold-ladders §4 LEAKED a probe row';
  end if;

  raise notice 'GOLD-LADDERS OK — the bank sells at tier 0, raises the bag cap and replays once; a retired '
               'worker_hire or farm_land rung is an unknown offer and costs nothing. Zero residue.';
end $$;
`;

// ── OUTPUT MODE ──────────────────────────────────────────────────────────
if (REPORT) {
  console.log(`gen-gold-ladders: ${GOLD_LADDER_OFFERS.length} rungs, digest ${DIGEST.slice(0, 12)}…, retired ${RETIRED_LADDERS.join(', ')}`);
  for (const r of GOLD_LADDER_OFFERS) {
    console.log(`  ${r.offer_id.padEnd(16)} ${r.unlock_id}=${r.value}  ${String(r.gold).padStart(7)}g `
      + `${JSON.stringify(r.items)} tier>=${r.req_property_tier}`);
  }
} else if (CHECK) {
  const existing = await readFile(OUT, 'utf8').catch(() => null);
  if (existing === null) { console.error(`gold-ladder drift: ${OUT} is missing. Run: node tools/gen-gold-ladders.mjs`); process.exit(1); }
  const norm = (s) => s.replace(/\r\n/g, '\n');
  if (norm(existing) !== norm(file)) {
    console.error(`gold-ladder drift: src/data/gold-ladders.js moved and ${basename(OUT)} no longer matches.`);
    console.error('  hr_unlock_buy charges out of that table. Run: node tools/gen-gold-ladders.mjs   (then read the diff)');
    process.exit(1);
  }
  console.log(`gold ladders in sync (${GOLD_LADDER_OFFERS.length} rungs, digest ${DIGEST.slice(0, 12)}…)`);
} else {
  await writeFile(OUT, file, 'utf8');
  console.log(`wrote ${OUT}`);
  console.log(`  ${GOLD_LADDER_OFFERS.length} rungs · digest ${DIGEST}`);
}
