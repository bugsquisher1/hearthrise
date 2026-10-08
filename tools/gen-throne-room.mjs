#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-throne-room.mjs — THE THRONE ROOM LADDER MIGRATION, generated from
// src/data/throne-room.js with a drift guard against the game data it reads.
//
//   node tools/gen-throne-room.mjs           → (re)write the generated migration
//   node tools/gen-throne-room.mjs --check   → exit 1 if the committed file differs
//   node tools/gen-throne-room.mjs --report  → print the ladder
//
// ── WHAT IT EMITS ───────────────────────────────────────────────────────
// supabase/migrations/2026-10-08-throne-room.sql: ONE max-merge unlock ladder
// (`throne_room`, rungs 1..30) in public.hr_unlocks and its thirty per-rung
// PRICES + the castle PREREQUISITE in public.hr_unlock_offers, so the ONE
// existing spend RPC (public.hr_unlock_buy) sells the Throne Room with no new
// code — the slices 2-4 pattern (gen-gold-ladders, gen-companion-unlocks).
// No bonus magnitude is emitted because a furnishing has none.
//
// ── THE DRIFT GUARD ─────────────────────────────────────────────────────
// The castle gate is RE-DERIVED from src/features/homestead.js TIERS (the last
// tier, and the index the property ladder stores), every price is re-derived
// from the curve, and the ladder must strictly rise. A TIERS edit that moves
// the castle, or a price edit that skips the generator, fails --check — and
// --check is a preflight in tests/run-smoke.mjs.
//
// PURE ESM, Node only. Writes one file.
// ════════════════════════════════════════════════════════════════════════

import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sliceLiteral, makeDie } from './lib/slice-literal.mjs';
import {
  THRONE_ROOM_OFFERS, THRONE_ROOM_UNLOCK, THRONE_ROOM_PIECES, THRONE_ROOM_RUNGS,
  THRONE_ROOM_REQ_TIER, throneRoomRungPrice,
} from '../src/data/throne-room.js';
import { GOLD_LADDER_OFFER_IDS } from '../src/data/gold-ladders.js';
import { COMPANION_OFFER_IDS } from '../src/data/companion-unlocks.js';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const OUT = join(ROOT, 'supabase', 'migrations', '2026-10-08-throne-room.sql');
const die = makeDie('gen-throne-room');
const read = (rel) => readFile(join(ROOT, rel), 'utf8');

const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
const REPORT = argv.includes('--report');

// ── DRIFT GUARD ─────────────────────────────────────────────────────────────
const TIERS = sliceLiteral(await read('src/features/homestead.js'), 'var TIERS = [', 'homestead.js', die);
const castleIdx = TIERS.findIndex((t) => t && t.id === 'castle');
if (castleIdx < 0) die('homestead.js TIERS has no castle');
if (castleIdx !== TIERS.length - 1) die(`the castle is no longer the last property tier (index ${castleIdx} of ${TIERS.length})`);
if (THRONE_ROOM_REQ_TIER !== castleIdx) die(`THRONE_ROOM_REQ_TIER ${THRONE_ROOM_REQ_TIER} != castle tier index ${castleIdx}`);
if (THRONE_ROOM_OFFERS.length !== THRONE_ROOM_RUNGS || THRONE_ROOM_UNLOCK.max_value !== THRONE_ROOM_RUNGS) die('rung count drift');
let prev = 0;
for (const [i, o] of THRONE_ROOM_OFFERS.entries()) {
  const n = i + 1;
  if (o.value !== n || o.offer_id !== `throne_room.${n}`) die(`rung ${n} is out of order (${o.offer_id}=${o.value})`);
  if (o.gold !== throneRoomRungPrice(n)) die(`rung ${n} price ${o.gold} != curve ${throneRoomRungPrice(n)}`);
  if (!(o.gold > prev)) die(`rung ${n} (${o.gold}) does not rise above rung ${n - 1} (${prev})`);
  if (Object.keys(o.items).length) die(`rung ${n} carries item lines — the Throne Room is gold-only`);
  if (o.req_property_tier !== castleIdx) die(`rung ${n} is not gated on the castle`);
  prev = o.gold;
}
if (JSON.stringify([...THRONE_ROOM_UNLOCK.rungs]) !== JSON.stringify(THRONE_ROOM_PIECES.map((p) => p.n))) die('rungs drift');
// Disjoint id spaces: a collision would let the Edge forward one family as another.
const other = new Set([...GOLD_LADDER_OFFER_IDS, ...COMPANION_OFFER_IDS]);
for (const o of THRONE_ROOM_OFFERS) if (other.has(o.offer_id)) die(`offer id ${o.offer_id} collides with another ladder`);

// ── EMIT ────────────────────────────────────────────────────────────────────
const q = (s) => (s === null || s === undefined ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const jb = (o) => `${q(JSON.stringify(o))}::jsonb`;
const U = THRONE_ROOM_UNLOCK;
const DIGEST = createHash('sha256').update(JSON.stringify({ U, THRONE_ROOM_OFFERS })).digest('hex');
const N = THRONE_ROOM_OFFERS.length;
const offerIds = THRONE_ROOM_OFFERS.map((r) => q(r.offer_id)).join(', ');
const offerLines = THRONE_ROOM_OFFERS.map((r) =>
  `  (${q(r.offer_id)}, ${q(r.table_name)}, ${q(r.name)}, ${q(r.unlock_id)}, ${r.value}, `
  + `${r.gold}, ${jb(r.items)}, ${r.req_property_tier}, null, null, 'gen-throne-room')`).join(',\n');
const priceArr = `array[${THRONE_ROOM_OFFERS.map((r) => r.gold).join(',')}]::bigint[]`;
const TOTAL = THRONE_ROOM_OFFERS.reduce((s, r) => s + r.gold, 0);
const P1 = THRONE_ROOM_OFFERS[0].gold;
const P2 = THRONE_ROOM_OFFERS[1].gold;

const file = `-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE THRONE ROOM  (GENERATED — DO NOT EDIT BY HAND)
--   throne_room (${N} rungs, ${TOTAL} gold in all)  ·  digest ${DIGEST}
--
--   Generated by tools/gen-throne-room.mjs from src/data/throne-room.js.
--   Any hand edit is reverted by the next generation and FAILS
--   \`node tools/gen-throne-room.mjs --check\` (a preflight in tests/run-smoke.mjs).
--
-- ⚠ STAGED, NOT APPLIED. A GOLD SURFACE: Security GO before the Coordinator
--   applies it (tools/apply-migration.mjs, one file). Design + economy evidence:
--   src/data/throne-room.js header; tools/econ-sim.mjs --sweep.
--
-- ── WHAT THIS FILE DOES ─────────────────────────────────────────────────
-- Arms the castle's recurring gold sink as ONE MAX-MERGE unlock ladder so the
-- EXISTING spend RPC public.hr_unlock_buy (2026-08-16-unlock-buy.sql, restated
-- by 2026-08-19-companion-unlocks.sql) sells it WITH NO NEW CODE PATH:
--   · SERVER-PRICED: the price is read out of public.hr_unlock_offers under the
--     per-character lock; the Edge forwards an offer id and nothing else;
--   · PER CALL: one rung per call, rung order enforced (rung_skipped), a re-buy
--     refused (already_owned), a replay under the same key charged once;
--   · PER DAY: at most c_max_unlocks_per_day (32) purchases in this namespace
--     per UTC day — above the ladder's own 30, so the binding daily bound is the
--     ladder itself: no character can ever be debited more than the whole room
--     (${TOTAL} gold), in a day or in a lifetime;
--   · GATED on the character's OWN server property tier (the castle, index ${THRONE_ROOM_REQ_TIER});
--   · JOURNALLED: hr_unlock_buy writes one player_ledger row per piece
--     (kind 'shop', intent 'unlock_buy:throne_room.<n>:<n>', gold negative).
-- A furnishing GRANTS NOTHING but its rung: no gold, gems, xp, items, perk or
-- renown. It is a pure sink — the one direction a forged value cannot cross to
-- another player's economy or ranking (CLAUDE.md §1). §4(f) MEASURES that.
--
-- ── OWNERSHIP / RE-APPLY ────────────────────────────────────────────────
-- hr_unlock_offers rows carry source = 'gen-throne-room' and this file deletes
-- only those. hr_unlocks has no owner column and 2026-08-16-unlocks.generated.sql
-- refills it WHOLESALE, so this file is on the declared repair list in
-- tests/unlock-catalogue-ownership.mjs: re-apply it after any re-apply of that
-- owner (it is idempotent: upsert + scoped delete).
--
-- REVERSIBILITY
--   delete from public.hr_unlock_offers where source = 'gen-throne-room';
--   delete from public.hr_unlocks where unlock_id = 'throne_room';
--   (player_progress rows a player bought stay — they are a purchase record;
--   with the catalogue row gone the storage guard refuses any further write.)
--   No function is replaced, no policy written, no grant changed.
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
                    'a ladder it SELLS; without the seller they are inert rows.';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.player_progress'::regclass
                  and tgname = 'player_progress_unlock_guard' and not tgisinternal) then
    raise exception 'player_progress_unlock_guard is absent — apply 2026-08-16-artisan-progress-model.sql '
                    'first. It is the INDEPENDENT storage guard that refuses an off-ladder rung.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'hr_unlock_offers'
                    and column_name = 'source') then
    raise exception 'hr_unlock_offers.source is absent — this file deletes ONLY its own rows by it; '
                    'apply 2026-08-16-unlock-offers.generated.sql (patched) first';
  end if;
  if not exists (select 1 from public.hr_unlocks
                  where unlock_id = 'property:castle' and namespace = 'property'
                    and merge = 'max' and ${THRONE_ROOM_REQ_TIER} = any (rungs)) then
    raise exception 'property:castle is not rung ${THRONE_ROOM_REQ_TIER} of the property ladder — the castle '
                    'gate this file prices against would be a gate no player can meet';
  end if;
end $$;

-- ── 1. THE CATALOGUE ROW (hr_unlocks) — how the rung MERGES ──────────────
insert into public.hr_unlocks (unlock_id, namespace, merge, progress_kind, max_value, rungs)
values
  (${q(U.unlock_id)}, ${q(U.namespace)}, 'max', 'unlock', ${U.max_value}, array[${U.rungs.join(',')}]::int[])
on conflict (unlock_id) do update
  set namespace = excluded.namespace, merge = excluded.merge,
      progress_kind = excluded.progress_kind, max_value = excluded.max_value, rungs = excluded.rungs;

-- ── 2. THE OFFER ROWS (hr_unlock_offers) — the PRICE and the GATE ────────
delete from public.hr_unlock_offers where source = 'gen-throne-room';
delete from public.hr_unlock_offers where offer_id in (${offerIds});
insert into public.hr_unlock_offers
  (offer_id, table_name, name, unlock_id, value, gold, items, req_property_tier, req_item, refusal, source)
values
${offerLines};

-- ── 3. STRUCTURAL ASSERTIONS (executed, not observed) ────────────────────
do $$
declare v_n int; v_bad text; v_p oid; v_prices bigint[];
begin
  -- (a) every rung present, SELLABLE and OWNED by this file.
  select count(*) into v_n from public.hr_unlock_offers
   where refusal is null and source = 'gen-throne-room' and offer_id in (${offerIds});
  if v_n <> ${N} then
    raise exception 'expected ${N} sellable throne-room offers owned by gen-throne-room, found %', v_n;
  end if;
  select count(*) into v_n from public.hr_unlock_offers where source = 'gen-throne-room';
  if v_n <> ${N} then raise exception 'gen-throne-room owns % offer rows, expected ${N}', v_n; end if;

  -- (b) on-ladder and inside the ceiling — or hr_unlock_buy would charge for a
  --     rung the storage guard then refuses.
  select string_agg(o.offer_id, ', ') into v_bad
    from public.hr_unlock_offers o join public.hr_unlocks u on u.unlock_id = o.unlock_id
   where o.source = 'gen-throne-room'
     and (u.merge <> 'max' or u.progress_kind <> 'unlock' or u.namespace <> 'throne_room'
          or not (o.value = any (coalesce(u.rungs, array[]::int[])))
          or o.value > u.max_value);
  if v_bad is not null then raise exception 'throne-room offers off their own ladder: %', v_bad; end if;

  -- (c) THE PRICES ARE THE GENERATED ONES, IN RUNG ORDER, STRICTLY RISING, and
  --     the castle gate is on every one; gold only (no item lines, no blueprint,
  --     no skill gate).
  select array_agg(gold order by value) into v_prices
    from public.hr_unlock_offers where source = 'gen-throne-room';
  if v_prices is distinct from ${priceArr} then
    raise exception 'throne-room prices drifted from the generated ladder: %', v_prices;
  end if;
  select string_agg(offer_id, ', ') into v_bad from public.hr_unlock_offers
   where source = 'gen-throne-room'
     and (req_property_tier is distinct from ${THRONE_ROOM_REQ_TIER} or items <> '{}'::jsonb
          or req_item is not null or req_skill is not null or gold <= 0);
  if v_bad is not null then raise exception 'throne-room offers with a wrong gate or a non-gold cost: %', v_bad; end if;

  -- (d) THE SELLER IS STILL ENGINE-ONLY — a browser must not be able to call it.
  v_p := to_regprocedure('public.hr_unlock_buy(uuid,int,bigint,uuid,text)');
  foreach v_bad in array array['public','anon','authenticated','service_role'] loop
    if has_function_privilege(v_bad, v_p, 'execute') then
      raise exception 'hr_unlock_buy became executable by %', v_bad;
    end if;
  end loop;

  -- (e) no client write surface on the price table.
  select count(*) into v_n from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'hr_unlock_offers'
     and grantee in ('anon','authenticated','service_role','PUBLIC')
     and privilege_type <> 'SELECT';
  if v_n > 0 then raise exception '% client write grants on hr_unlock_offers', v_n; end if;

  raise notice 'throne-room §3 PASSED: ${N} sellable rungs, on-ladder, generated prices strictly rising, '
               'castle-gated, gold-only, seller engine-only, price table read-only.';
end $$;

-- ── 4. BEHAVIOUR — through the REAL hr_unlock_buy, every refusal paired with
--      its nearest legal control. Rolled back; leaves zero residue.
do $$
declare
  v_uid  uuid := '00000000-0000-4000-8000-0000000c4a17';
  v_r    jsonb; v_ver bigint; v_g0 bigint; v_g1 bigint; v_key uuid;
  v_xp0  numeric; v_xp1 numeric; v_inv0 bigint; v_inv1 bigint; v_gem0 bigint; v_gem1 bigint;
  v_led  int; v_prog0 int; v_prog1 int;
begin
  if to_regprocedure('public.hr_create_character(int)') is null then
    raise exception 'throne-room §4 CANNOT RUN: hr_create_character is missing — a skipped check is '
                    'not a passed one. Apply 2026-08-14-character-bootstrap.sql first.';
  end if;

  begin  -- ── subtransaction, rolled back ────────────────────────────────
    insert into auth.users (id) values (v_uid);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    v_r := public.hr_create_character(0);
    if coalesce(v_r->>'ok', v_r->>'created', 'false') <> 'true' then
      raise exception 'throne-room §4: no probe character: %', v_r;
    end if;
    update public.player_state set gold = 100000000 where user_id = v_uid and slot = 0;

    -- (a) NOT A CASTLE → refused by the SERVER's tier, not a client one.
    select version into v_ver from public.player_state where user_id=v_uid and slot=0;
    v_r := public.hr_unlock_buy(v_uid, 0, v_ver, gen_random_uuid(), 'throne_room.1');
    if v_r->>'error' is distinct from 'prereq_property_tier' then
      raise exception 'throne-room §4(a): throne_room.1 at the camp answered % (expected prereq_property_tier)', v_r;
    end if;
    -- (a') a keep (tier 4) is still not a castle.
    insert into public.player_progress (user_id, slot, kind, key, period_key, value)
      values (v_uid, 0, 'unlock', 'property:keep', '', 4);
    v_r := public.hr_unlock_buy(v_uid, 0, v_ver, gen_random_uuid(), 'throne_room.1');
    if v_r->>'error' is distinct from 'prereq_property_tier' then
      raise exception 'throne-room §4(a''): throne_room.1 at the keep answered % (expected prereq_property_tier)', v_r;
    end if;

    -- Grant the castle the way the property ladder would.
    insert into public.player_progress (user_id, slot, kind, key, period_key, value)
      values (v_uid, 0, 'unlock', 'property:castle', '', ${THRONE_ROOM_REQ_TIER});

    -- (b) the ladder is a ladder: rung 2 before rung 1 is refused by name.
    v_r := public.hr_unlock_buy(v_uid, 0, v_ver, gen_random_uuid(), 'throne_room.2');
    if v_r->>'error' is distinct from 'rung_skipped' then
      raise exception 'throne-room §4(b): throne_room.2 before .1 answered % (expected rung_skipped)', v_r;
    end if;

    -- (c) CONTROL — rung 1 LANDS at the castle and charges EXACTLY its price,
    --     with one ledger row saying so. Measure everything else around it for (f).
    select coalesce(sum(xp),0) into v_xp0 from public.player_skills where user_id=v_uid and slot=0;
    select coalesce(sum(qty),0) into v_inv0 from public.player_inventory where user_id=v_uid and slot=0;
    select gold, coalesce(gems,0) into v_g0, v_gem0 from public.player_state where user_id=v_uid and slot=0;
    select count(*) into v_prog0 from public.player_progress where user_id=v_uid and slot=0;
    v_key := gen_random_uuid();
    v_r := public.hr_unlock_buy(v_uid, 0, v_ver, v_key, 'throne_room.1');
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception 'throne-room §4(c) CONTROL FAILED: throne_room.1 refused at the castle (%)', v_r;
    end if;
    select gold, coalesce(gems,0) into v_g1, v_gem1 from public.player_state where user_id=v_uid and slot=0;
    if v_g1 <> v_g0 - ${P1} then
      raise exception 'throne-room §4(c): throne_room.1 charged %g, expected ${P1}', v_g0 - v_g1;
    end if;
    if (v_r->'charged'->>'gold')::bigint is distinct from ${P1}::bigint then
      raise exception 'throne-room §4(c): the server receipt states % (expected ${P1})', v_r->'charged';
    end if;
    select count(*) into v_led from public.player_ledger
     where user_id=v_uid and slot=0 and kind='shop' and gold = -${P1}
       and intent = 'unlock_buy:throne_room.1:1' and meta->>'unlock' = 'throne_room';
    if v_led <> 1 then
      raise exception 'throne-room §4(c): % ledger rows journal the purchase (expected exactly 1)', v_led;
    end if;

    -- (d) a REPLAY under the same key is reported and charges NOTHING.
    v_r := public.hr_unlock_buy(v_uid, 0, v_ver, v_key, 'throne_room.1');
    if coalesce(v_r->>'replayed','false') <> 'true' then
      raise exception 'throne-room §4(d): replay not reported as one (%)', v_r;
    end if;
    if (select gold from public.player_state where user_id=v_uid and slot=0) <> v_g1 then
      raise exception 'throne-room §4(d): the replay CHARGED AGAIN';
    end if;

    -- (e) the same rung under a NEW key is already_owned, never a second charge.
    select version into v_ver from public.player_state where user_id=v_uid and slot=0;
    v_r := public.hr_unlock_buy(v_uid, 0, v_ver, gen_random_uuid(), 'throne_room.1');
    if v_r->>'error' is distinct from 'already_owned' then
      raise exception 'throne-room §4(e): a second throne_room.1 answered % (expected already_owned)', v_r;
    end if;
    if (select gold from public.player_state where user_id=v_uid and slot=0) <> v_g1 then
      raise exception 'throne-room §4(e): a refused re-buy moved gold';
    end if;

    -- (f) A FURNISHING GRANTS NOTHING BUT ITS RUNG — measured, not read off the
    --     source: no xp, no item, no gem, and exactly one new progress row.
    select coalesce(sum(xp),0) into v_xp1 from public.player_skills where user_id=v_uid and slot=0;
    select coalesce(sum(qty),0) into v_inv1 from public.player_inventory where user_id=v_uid and slot=0;
    select count(*) into v_prog1 from public.player_progress where user_id=v_uid and slot=0;
    if v_xp1 <> v_xp0 or v_inv1 <> v_inv0 or v_gem1 <> v_gem0 or v_prog1 <> v_prog0 + 1 then
      raise exception 'throne-room §4(f): a furnishing moved something besides gold and its rung '
                      '(xp % -> %, items % -> %, gems % -> %, progress rows % -> %)',
                      v_xp0, v_xp1, v_inv0, v_inv1, v_gem0, v_gem1, v_prog0, v_prog1;
    end if;
    if (select value from public.player_progress where user_id=v_uid and slot=0
          and kind='unlock' and key='throne_room' and period_key='') is distinct from 1 then
      raise exception 'throne-room §4(f): the rung was not recorded as throne_room = 1';
    end if;

    -- (g) SHORT OF GOLD → refused, nothing moves; CONTROL: with the gold, rung 2 lands.
    update public.player_state set gold = ${P2 - 1} where user_id=v_uid and slot=0;
    select version into v_ver from public.player_state where user_id=v_uid and slot=0;
    v_r := public.hr_unlock_buy(v_uid, 0, v_ver, gen_random_uuid(), 'throne_room.2');
    if v_r->>'error' is distinct from 'insufficient_gold' then
      raise exception 'throne-room §4(g): throne_room.2 with %g answered % (expected insufficient_gold)', ${P2 - 1}, v_r;
    end if;
    if (select value from public.player_progress where user_id=v_uid and slot=0
          and kind='unlock' and key='throne_room' and period_key='') <> 1 then
      raise exception 'throne-room §4(g): a refused buy moved the rung';
    end if;
    update public.player_state set gold = ${P2} where user_id=v_uid and slot=0;
    select version into v_ver from public.player_state where user_id=v_uid and slot=0;
    v_r := public.hr_unlock_buy(v_uid, 0, v_ver, gen_random_uuid(), 'throne_room.2');
    if coalesce(v_r->>'ok','false') <> 'true'
       or (select gold from public.player_state where user_id=v_uid and slot=0) <> 0 then
      raise exception 'throne-room §4(g) CONTROL FAILED: throne_room.2 with exactly its price (%)', v_r;
    end if;

    -- (h) THE STORAGE GUARD is the independent backstop: a rung off the ladder
    --     written straight to player_progress is refused whatever the seller says.
    begin
      update public.player_progress set value = ${THRONE_ROOM_RUNGS + 1}
       where user_id=v_uid and slot=0 and kind='unlock' and key='throne_room' and period_key='';
      raise exception 'throne-room §4(h): the storage guard ACCEPTED throne_room = ${THRONE_ROOM_RUNGS + 1}';
    exception when check_violation or raise_exception then
      if sqlerrm like 'throne-room §4(h)%' then raise; end if;
    end;

    raise exception using errcode = 'HRB19', message = 'throne-room §4 complete — rolling back';
  exception when sqlstate 'HRB19' then
    null;
  end;

  if exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'throne-room §4 LEAKED a probe row';
  end if;

  raise notice 'THRONE ROOM OK — refused below the castle (camp and keep), refused out of order, '
               'charged exactly its price once with one ledger row, a replay charged nothing, a re-buy '
               'is already_owned, a furnishing moves no xp/items/gems, short gold refuses and moves '
               'nothing, the storage guard refuses an off-ladder rung. Zero residue.';
end $$;

do $$
begin
  raise notice 'THE THRONE ROOM INSTALLED — throne_room (${N} rungs, ${TOTAL} gold) sellable through '
               'hr_unlock_buy, gated on the server-owned castle.';
end $$;
`;

// ── OUTPUT MODE ──────────────────────────────────────────────────────────
if (REPORT) {
  console.log(`gen-throne-room: ${N} rungs, ${TOTAL} gold, digest ${DIGEST.slice(0, 12)}…`);
  for (const p of THRONE_ROOM_PIECES) console.log(`  ${String(p.n).padStart(2)} ${p.name.padEnd(24)} ${String(p.gold).padStart(9)}g${p.hall ? `  → ${p.hall}` : ''}`);
} else if (CHECK) {
  const existing = await readFile(OUT, 'utf8').catch(() => null);
  if (existing === null) { console.error(`throne-room drift: ${OUT} is missing. Run: node tools/gen-throne-room.mjs`); process.exit(1); }
  const norm = (s) => s.replace(/\r\n/g, '\n');
  if (norm(existing) !== norm(file)) {
    console.error('throne-room drift: src/data/throne-room.js or the castle tier moved and the committed');
    console.error('  migration no longer matches. hr_unlock_buy charges out of that table.');
    console.error('  Run: node tools/gen-throne-room.mjs   (then read the diff)');
    process.exit(1);
  }
  console.log(`throne room in sync (${N} rungs, digest ${DIGEST.slice(0, 12)}…)`);
} else {
  await writeFile(OUT, file, 'utf8');
  console.log(`wrote ${OUT}`);
  console.log(`  ${N} rungs · ${TOTAL} gold · digest ${DIGEST}`);
}
