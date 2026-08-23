#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-unlock-offers.mjs — THE UNLOCK PRICE + PREREQUISITE CATALOGUE.
//
//   node tools/gen-unlock-offers.mjs            → (re)write the generated migration
//   node tools/gen-unlock-offers.mjs --check    → exit 1 if the committed file differs
//   node tools/gen-unlock-offers.mjs --report   → print the extraction
//
// ── WHY THIS ONE IS IN SQL WHEN shop_buy's PRICE IS IN JS ───────────────
// The 2026-08-15 architecture decision is "rules → JavaScript, bookkeeping →
// a database function", and it stands. This is the bookkeeping side of it, and
// the reason is the merge rule rather than the price:
//
//   `shop_buy` proposes `gold: -N` and hr_apply re-validates the ONE invariant
//   that matters for an item purchase — the balance may not go negative. An
//   over-cheap price would be an Edge bug bounded by the ledger.
//
//   A ROOM RUNG IS A LEVEL. Its invariant is not "the balance stays positive",
//   it is "value = GREATEST(existing, granted), on the ladder, above the
//   prerequisite" — and `hr_apply` structurally cannot express it, which is why
//   'unlock' is deliberately absent from its delta allowlist. The verb needs a
//   second writer, and a second writer that ACCEPTED A PRICE would make the
//   Edge Function the author of a permanent capability's cost. So the RPC takes
//   an OFFER ID and reads the price here. The Edge cannot propose a cheaper
//   Kitchen because it cannot propose a price at all.
//
// ── WHAT IT EMITS ───────────────────────────────────────────────────────
//   public.hr_unlock_offers — one row per AUTHORED unlock-granting offer:
//     price (gold + item lines), the unlock id and RUNG it grants, and — for
//     the sellable ones — the two prerequisites the server enforces:
//       req_property_tier  the homestead tier the purchase needs
//       req_item           the dungeon blueprint it consumes, if any
//     Unsellable offers are rows too, carrying `refusal`, so a real offer this
//     build cannot sell is refused BY NAME rather than as "unknown".
//
// ── THE THREE SOURCES, AND WHY THE PREREQUISITES CANNOT LIVE IN THE EDGE ─
//   supabase/functions/hr-accrue/unlock-catalogue.js
//                             THE ELIGIBILITY PREDICATE. Imported, never
//                             restated — the Edge module and this table are one
//                             derivation read twice.
//   src/legacy.js   ROOMS     each rung's own `tier` gate (b227's ladder: L4
//                             needs a Manor, L5 a Castle or a Keep).
//   src/features/homestead.js TIERS
//                             which property tier first opens each room, and the
//                             tier ladder itself.
//   Both of the last two are CLASSIC SCRIPTS. Deno cannot import them and ESM
//   cannot either — which is exactly why src/data/shops.js and src/data/perks.js
//   exist as generated copies. The prerequisites therefore cannot be checked in
//   the Edge Function at all, and that is the better outcome: they are checked
//   in SQL against the character's own server-side property tier, under the same
//   lock as the gold debit, where the Edge cannot forget them.
//
// ⚠ NOT ONE GAME MAGNITUDE IS COPIED. No bonus, no noBurn, no rung payload.
//   A price and a prerequisite edge are bookkeeping: they say what a purchase
//   COSTS and what it REQUIRES, never what it DOES.
//
// PURE ESM, Node only. Writes one file.
// ════════════════════════════════════════════════════════════════════════

import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sliceLiteral, makeDie } from './lib/slice-literal.mjs';
import { SHOP_OFFERS } from '../src/data/shops.js';
import { ITEMS } from '../src/data/items.js';
import {
  UNLOCK_OFFERS, UNLOCK_REFUSALS, ALL_UNLOCK_OFFER_IDS,
} from '../supabase/functions/hr-accrue/unlock-catalogue.js';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const OUT = join(ROOT, 'supabase', 'migrations', '2026-08-16-unlock-offers.generated.sql');
const die = makeDie('gen-unlock-offers');

const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
const REPORT = argv.includes('--report');

const read = (rel) => readFile(join(ROOT, rel), 'utf8');

/* ══════════════════════════════════════════════════════════════════════════
   1 · THE PREREQUISITES, EXTRACTED FROM THE TWO CLASSIC SCRIPTS
   ══════════════════════════════════════════════════════════════════════════ */
const ROOMS = sliceLiteral(await read('src/legacy.js'), 'const ROOMS={', 'src/legacy.js', die);
const TIERS = sliceLiteral(
  await read('src/features/homestead.js'), 'var TIERS = [', 'src/features/homestead.js', die);

/** The property tier at which room `id` may first be built — homestead.js
    `roomMinTier`, which is the SAME function `upgradeRoom` gates with. */
function roomMinTier(id) {
  for (let i = 0; i < TIERS.length; i++) {
    if ((TIERS[i].rooms || []).indexOf(id) >= 0) return i;
  }
  /* homestead.js returns 1 for an unknown/legacy room. Here that would be a
     GUESS about a gate, on a purchase the server is about to own, so it is a
     build failure instead. */
  return die(`room "${id}" is opened by no property tier in homestead.js TIERS — `
    + 'roomMinTier would default it to 1, which is a guess about a gate this table exists to state.');
}

/** The whole gate on `room:<id>` rung `n`: the room's own minimum tier, then
    the rung's own if it asks for more (b227 — `roomRungGate`). */
function roomRungTier(id, n) {
  const r = ROOMS[id];
  if (!r || !Array.isArray(r.levels)) die(`src/legacy.js ROOMS has no room "${id}"`);
  const rung = r.levels[n - 1];
  if (!rung) die(`ROOMS.${id} sells no rung ${n}, but src/data/shops.js prices one`);
  return Math.max(roomMinTier(id), Number(rung.tier) || 0);
}

/** The blueprint item a room rung REQUIRES and CONSUMES, or null. Derived from
    ITEMS' own `unlocks: '<room>.<rung>'`, exactly as `upgradeRoom` reads it —
    the "housing blueprints were INERT" P0 in reverse: a server that sold the
    rung without the blueprint would sell it strictly cheaper than the client. */
function blueprintFor(roomId, n) {
  const key = `${roomId}.${n}`;
  const hits = Object.keys(ITEMS).filter((k) => ITEMS[k] && ITEMS[k].unlocks === key);
  if (hits.length > 1) die(`two blueprints claim ${key}: ${hits.join(', ')}`);
  return hits[0] || null;
}

/* ── C5(b) — TWO PRICE SOURCES, PROVEN EQUAL ────────────────────────────────
   `src/data/shops.js` is generated from `src/legacy.js` ROOMS by
   tools/gen-shops.mjs; this file reads the SAME ROOMS table for the tier gate.
   That makes the rung's cost visible from BOTH sides here, once, and a price
   the server charges that is not the price the room table states is the exact
   `unifyObject` failure this whole program exists to prevent. Observed equal is
   not proven equal, so it is asserted at generation time — the only moment both
   objects are in one process. */
function assertRoomCostMatches(o, roomId) {
  const rung = ROOMS[roomId].levels[o.value - 1];
  const want = rung && rung.cost ? rung.cost : null;
  if (!want) die(`ROOMS.${roomId} rung ${o.value} has no cost, but the shop prices one`);
  const have = { gold: o.gold, ...o.items };
  const keys = [...new Set([...Object.keys(want), ...Object.keys(have)])].sort();
  const diff = keys
    .filter((k) => Number(want[k] || 0) !== Number(have[k] || 0))
    .map((k) => `${k}: legacy ROOMS says ${want[k] ?? 0}, the offer catalogue says ${have[k] ?? 0}`);
  if (diff.length) {
    die(`${o.id} — THE TWO PRICE SOURCES DISAGREE:\n    ${diff.join('\n    ')}\n`
      + '  src/data/shops.js is GENERATED from src/legacy.js ROOMS, so this can only mean one of\n'
      + '  them is stale. Re-run node tools/gen-shops.mjs and read the diff. Shipping this table\n'
      + '  would make the server charge a price the room screen does not show.');
  }
}

/** The prerequisite pair for one sellable offer. */
function prereqOf(o) {
  const ns = o.unlockId.slice(0, o.unlockId.indexOf(':'));
  if (ns === 'room') {
    const roomId = o.unlockId.slice('room:'.length);
    assertRoomCostMatches(o, roomId);
    return { tier: roomRungTier(roomId, o.value), item: blueprintFor(roomId, o.value) };
  }
  if (ns === 'property') {
    /* THE SPINE. Tier k requires tier k-1, and that is the ONLY thing standing
       between a rich player and buying Hearthrise Castle from a bedroll: each
       property tier is its own unlock id with a ONE-RUNG ladder, so
       hr_unlocks' rung check is vacuous here by construction. Stated as an
       edge, in a table, rather than as a special case in the RPC. */
    return { tier: o.value - 1, item: null };
  }
  return die(`no prerequisite rule for namespace "${ns}" — every sellable namespace needs one, `
    + 'or the server sells a gate it cannot see');
}

/* ══════════════════════════════════════════════════════════════════════════
   2 · THE ROWS
   ══════════════════════════════════════════════════════════════════════════ */
const rows = [];
for (const id of [...ALL_UNLOCK_OFFER_IDS].sort()) {
  const sell = Object.prototype.hasOwnProperty.call(UNLOCK_OFFERS, id) ? UNLOCK_OFFERS[id] : null;
  if (!sell) {
    const authored = SHOP_OFFERS.find((o) => o.id === id);
    const g = (authored.grant || []).find((x) => x && x.kind === 'unlock');
    rows.push({
      offer_id: id,
      table_name: authored.table,
      name: authored.name,
      unlock_id: g ? g.id : null,
      value: g && Number.isFinite(g.amount) ? g.amount : null,
      gold: null,
      items: null,
      req_property_tier: null,
      req_item: null,
      refusal: UNLOCK_REFUSALS[id],
    });
    continue;
  }
  const pre = prereqOf(sell);
  if (pre.item && !ITEMS[pre.item]) die(`blueprint ${pre.item} is not in src/data/items.js`);
  rows.push({
    offer_id: id,
    table_name: sell.table,
    name: sell.name,
    unlock_id: sell.unlockId,
    value: sell.value,
    gold: sell.gold,
    items: sell.items,
    req_property_tier: pre.tier,
    req_item: pre.item,
    refusal: null,
  });
}

const sellableRows = rows.filter((r) => r.refusal === null);
if (!sellableRows.length) die('no sellable unlock offer survived the predicate — the verb would ship inert');
if (!sellableRows.some((r) => r.unlock_id === 'room:kitchen')) {
  die('no Kitchen rung is sellable. That is the rung `noBurn` lives on and the whole reason this '
    + "verb exists (§9(3) of 2026-08-16-artisan-progress-model.sql). Do not ship the table without it.");
}

/* ══════════════════════════════════════════════════════════════════════════
   3 · EMIT
   ══════════════════════════════════════════════════════════════════════════ */
const q = (s) => (s === null || s === undefined ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const num = (n) => (n === null || n === undefined ? 'null' : String(n));
const jsonb = (o) => (o === null ? 'null' : `${q(JSON.stringify(o))}::jsonb`);

const DIGEST = createHash('sha256').update(JSON.stringify(rows)).digest('hex');

const byTable = {};
for (const r of sellableRows) (byTable[r.table_name] = byTable[r.table_name] || []).push(r);
const tableSummary = Object.keys(byTable).sort().map((t) => `${t}=${byTable[t].length}`).join(' · ');

const byRefusal = {};
for (const r of rows) {
  if (r.refusal === null) continue;
  const head = r.refusal.split(':')[0];
  byRefusal[head] = (byRefusal[head] || 0) + 1;
}
const refusalSummary = Object.keys(byRefusal).sort().map((k) => `${k}=${byRefusal[k]}`).join(' · ');

const valueLines = rows.map((r) =>
  `  (${q(r.offer_id)}, ${q(r.table_name)}, ${q(r.name)}, ${q(r.unlock_id)}, ${num(r.value)}, `
  + `${num(r.gold)}, ${jsonb(r.items)}, ${num(r.req_property_tier)}, ${q(r.req_item)}, ${q(r.refusal)}, `
  + `'gen-unlock-offers')`)
  .join(',\n');

const file = `-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE UNLOCK OFFER CATALOGUE  (GENERATED — DO NOT EDIT BY HAND)
--
--   Generated by tools/gen-unlock-offers.mjs from
--   supabase/functions/hr-accrue/unlock-catalogue.js (the eligibility
--   predicate, IMPORTED not restated), src/data/{shops,items}.js,
--   src/legacy.js ROOMS and src/features/homestead.js TIERS. Any hand edit
--   here is reverted by the next generation and FAILS
--   \`node tools/gen-unlock-offers.mjs --check\`, a preflight in tests/run-smoke.mjs.
--
--   offer digest: ${DIGEST}
--   ${rows.length} authored unlock offers · ${sellableRows.length} sellable (${tableSummary}) · refused: ${refusalSummary}
--
-- ── WHAT THIS TABLE IS ──────────────────────────────────────────────────
-- THE PRICE AND THE PREREQUISITE OF A PERMANENT UNLOCK, so that
-- \`hr_unlock_buy\` can take an OFFER ID and nothing else. There is no game
-- magnitude here — no bonus, no noBurn, no rung payload: what a rung DOES
-- lives in src/data/perks.js and is read by src/core/perks.js on both sides.
-- What it COSTS and what it REQUIRES is bookkeeping, and bookkeeping is the
-- half the 2026-08-15 architecture decision puts in the database.
--
-- ── WHY THE PRICE IS HERE AND shop_buy's IS IN JS ───────────────────────
-- A room rung is a LEVEL. Its invariant is \`value = GREATEST(existing,
-- granted)\`, on the ladder, above the prerequisite — which \`hr_apply\` cannot
-- express, which is why 'unlock' is absent from its delta allowlist. A second
-- writer that also ACCEPTED A PRICE would make the Edge Function the author of
-- a permanent capability's cost. It does not: it names the offer.
--
-- ── THE TWO PREREQUISITES, AND WHERE THEY COME FROM ─────────────────────
--   req_property_tier  src/legacy.js ROOMS (each rung's own \`tier\`) combined
--                      with src/features/homestead.js TIERS (which tier first
--                      opens the room) — i.e. exactly \`roomRungGate\`. For a
--                      property tier it is k-1: THE SPINE. Each property tier
--                      is its own unlock id with a one-rung ladder, so
--                      hr_unlocks' rung check is vacuous for it and this column
--                      is the only thing between a rich player and buying the
--                      Castle from a bedroll.
--   req_item           the dungeon BLUEPRINT a rung requires and consumes,
--                      from ITEMS' own \`unlocks: '<room>.<rung>'\`. Without it
--                      the server would sell rungs 2-3 strictly cheaper than
--                      the client charges for them.
--   Both are enforced by hr_unlock_buy in SQL, against the character's own
--   server-side state, under the same lock as the gold debit.
--
-- ── REFUSED OFFERS ARE ROWS TOO ─────────────────────────────────────────
-- \`refusal\` is non-null for a real offer this build cannot sell, so the answer
-- is \`offer_unsupported\` WITH THE REASON rather than "unknown offer". A player
-- told "no such offer" about a gem-priced cosmetic files a bug against the
-- wrong system.
--
-- CONSUMED BY: 2026-08-16-unlock-buy.sql — hr_unlock_buy reads price, grant,
-- rung and both prerequisites out of it and FAILS CLOSED if it is absent or
-- empty.
--
-- ⚠ THE REFILL IS SCOPED BY \`source\`, AND THAT IS A LIVE-INCIDENT FIX ────
-- This file used to refill with a bare \`delete from public.hr_unlock_offers\`.
-- 2026-08-19-gold-spend-slices-2-3.sql adds 48 MORE offers to the same table
-- (worker_hire · plot:farm_land · bank), and its header warned in prose that
-- "RE-APPLYING EITHER 2026-08-16 CATALOGUE ALONE WIPES THESE ROWS". It then
-- happened in production: a regen of this file deleted all three gold-ladder
-- families and every one of those purchases became \`unknown_offer\`.
-- A prose warning is not an interlock. Every row now carries the tool that
-- OWNS it, and each generator deletes only its own — so re-running either file,
-- alone or in any order, can no longer touch the other's rows.
--
-- SAFE TO RE-RUN, and safe to re-run ALONE.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.hr_unlock_offers (
  offer_id          text primary key,
  table_name        text not null,
  name              text not null,
  -- The unlock this offer grants, and the RUNG it grants — never an amount to
  -- add. NULL only on a refused row whose grant shape is why it was refused.
  unlock_id         text,
  value             int,
  -- Price. NULL on a refused row: a price this build will not charge must not
  -- sit in the table looking chargeable.
  gold              bigint,
  items             jsonb,
  -- Prerequisites. NULL on a refused row; 0 means "no gate", which is a real
  -- answer and not an absent one.
  req_property_tier int,
  req_item          text,
  -- NULL iff sellable. A sellable row must carry a price and a prerequisite;
  -- a refused row must carry neither. Stated as a CHECK so a half-filled row
  -- cannot exist at all.
  refusal           text,
  check ((refusal is null) = (gold is not null)),
  check ((refusal is null) = (req_property_tier is not null)),
  check ((refusal is null) = (items is not null)),
  check (refusal is not null or (value is not null and unlock_id is not null and value > 0)),
  check (gold is null or gold > 0),
  check (req_property_tier is null or req_property_tier >= 0)
);

-- World-readable, like every other hr_* catalogue: it holds no player data and
-- it is the same price the shop screen renders.
alter table public.hr_unlock_offers enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies
                  where schemaname='public' and tablename='hr_unlock_offers'
                    and policyname='hr_unlock_offers readable') then
    create policy "hr_unlock_offers readable" on public.hr_unlock_offers for select using (true);
  end if;
end $$;
-- IMPORTANT: "revoke all", NOT "revoke insert, update, delete" (Security C1,
-- 2026-08-16). Supabase's default ACL on public also grants TRUNCATE,
-- REFERENCES and TRIGGER, and a three-verb revoke leaves all three behind — on
-- a CATALOGUE, where TRUNCATE would empty the table every unlock decision is
-- read from, and TRUNCATE bypasses row-level security entirely so the
-- read-only policy above is not a backstop for it. PUBLIC is included because
-- a grant to PUBLIC is held by every role that exists.
revoke all on public.hr_unlock_offers from public, anon, authenticated, service_role;

-- ── ROW OWNERSHIP ────────────────────────────────────────────────────────
-- Which tool wrote a row, so a refill can be scoped to its own. Added
-- additively; the DEFAULT names this generator because every row that predates
-- the column was written by it — with ONE exception, which the same block
-- rescues by name-free derivation (any pre-existing row this generation does
-- not emit belongs to somebody else).
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'hr_unlock_offers'
                and column_name = 'source') then
    return;   -- already owned; the rescue below is strictly one-time
  end if;
  alter table public.hr_unlock_offers
    add column source text not null default 'gen-unlock-offers';
  update public.hr_unlock_offers set source = 'foreign:pre-source'
   where offer_id <> all (array[${rows.map((r) => `'${r.offer_id.replace(/'/g, "''")}'`).join(', ')}]);
  raise notice 'hr_unlock_offers.source added; % pre-existing foreign row(s) preserved',
    (select count(*) from public.hr_unlock_offers where source = 'foreign:pre-source');
end $$;

-- Refilled inside the migration's transaction, SCOPED TO THIS GENERATOR'S OWN
-- ROWS. A family another migration owns is untouched — see the header.
delete from public.hr_unlock_offers where source = 'gen-unlock-offers';
insert into public.hr_unlock_offers
  (offer_id, table_name, name, unlock_id, value, gold, items, req_property_tier, req_item, refusal, source)
values
${valueLines};

-- ── SELF-CHECK ───────────────────────────────────────────────────────────
do $$
declare v_n int; v_bad text;
begin
  -- Scoped to THIS generator's rows: another migration's families live in the
  -- same table and are none of this count's business.
  select count(*) into v_n from public.hr_unlock_offers where source = 'gen-unlock-offers';
  if v_n <> ${rows.length} then
    raise exception 'hr_unlock_offers holds % gen-unlock-offers rows, expected ${rows.length} — the insert was partial', v_n;
  end if;
  select count(*) into v_n from public.hr_unlock_offers
   where source = 'gen-unlock-offers' and refusal is null;
  if v_n <> ${sellableRows.length} then
    raise exception 'hr_unlock_offers holds % sellable gen-unlock-offers rows, expected ${sellableRows.length}', v_n;
  end if;
  -- ⚠ THE INTERLOCK. A refill that deleted a family this file does not own is
  --   the production incident this scoping exists to prevent, and an assertion
  --   is the only thing that notices if the scoping is ever "simplified" away.
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'hr_unlock_offers'
                and column_name = 'source' and column_default is null) then
    raise exception 'hr_unlock_offers.source lost its default — a row inserted without an owner '
                    'would be deleted by the next refill of whichever tool guessed first';
  end if;

  -- ⚠ THE CROSS-CATALOGUE JOIN. This table says what a purchase costs;
  --   hr_unlocks says how the row it writes MERGES. A sellable offer whose
  --   unlock id is not in hr_unlocks, or is not stored as a level, would be
  --   sold and then refused by the storage guard — a player charged for a
  --   bad_delta. Checked here rather than trusted, because the two files are
  --   generated by two tools from two sources.
  if to_regclass('public.hr_unlocks') is null then
    raise exception 'hr_unlocks is absent — apply 2026-08-16-unlocks.generated.sql first. This '
                    'table prices grants whose MERGE RULE lives there; without it every sellable '
                    'row is unverifiable.';
  end if;
  select string_agg(o.offer_id, ', ') into v_bad
    from public.hr_unlock_offers o
    left join public.hr_unlocks u on u.unlock_id = o.unlock_id
   where o.refusal is null
     and (u.unlock_id is null or u.progress_kind is null
          or not (o.value = any (coalesce(u.rungs, array[]::int[])))
          or (u.max_value is not null and o.value > u.max_value));
  if v_bad is not null then
    raise exception 'sellable offers whose grant is not a rung the unlock catalogue knows: %', v_bad;
  end if;

  -- Every item this table can charge, and every blueprint it can consume, must
  -- be an item the apply engine's catalogue knows — otherwise the debit is a
  -- charge for something that does not exist.
  if to_regclass('public.hr_items') is not null then
    select string_agg(x.offer_id, ', ') into v_bad from (
      select o.offer_id, k as item_id
        from public.hr_unlock_offers o, jsonb_object_keys(coalesce(o.items,'{}'::jsonb)) k
       where o.refusal is null
      union all
      select o.offer_id, o.req_item from public.hr_unlock_offers o where o.req_item is not null) x
     where not exists (select 1 from public.hr_items i where i.item_id = x.item_id);
    if v_bad is not null then
      raise exception 'unlock offers costing items that are not in hr_items: %', v_bad;
    end if;
  end if;

  -- THE KITCHEN IS SELLABLE. Everything downstream of this file exists so that
  -- a server-owned Kitchen rung can make 'artisan' payable; a table that lost
  -- it would still pass every check above.
  select count(*) into v_n from public.hr_unlock_offers
   where refusal is null and unlock_id = 'room:kitchen';
  if v_n < 1 then
    raise exception 'no sellable room:kitchen rung — noBurn has no server-owned writer and '
                    '''artisan'' cannot become payable';
  end if;

  raise notice 'hr_unlock_offers OK — % rows, % sellable (${tableSummary})', ${rows.length}, ${sellableRows.length};
end $$;
`;

// ── OUTPUT MODE ──────────────────────────────────────────────────────────
if (REPORT) {
  console.log(`gen-unlock-offers: ${rows.length} authored, ${sellableRows.length} sellable, `
    + `digest ${DIGEST.slice(0, 12)}…`);
  for (const r of sellableRows) {
    console.log(`  ${r.offer_id.padEnd(22)} ${r.unlock_id}=${r.value}  ${String(r.gold).padStart(7)}g `
      + `${JSON.stringify(r.items)} tier>=${r.req_property_tier}${r.req_item ? ` +${r.req_item}` : ''}`);
  }
  const refused = rows.filter((r) => r.refusal);
  console.log(`  refused (${refused.length}):`);
  for (const r of refused) console.log(`    ${r.offer_id.padEnd(24)} ${r.refusal}`);
} else if (CHECK) {
  const existing = await readFile(OUT, 'utf8').catch(() => null);
  if (existing === null) {
    console.error(`unlock-offer drift: ${OUT} is missing. Run: node tools/gen-unlock-offers.mjs`);
    process.exit(1);
  }
  const norm = (s) => s.replace(/\r\n/g, '\n');
  if (norm(existing) !== norm(file)) {
    const was = /offer digest: ([0-9a-f]{64})/.exec(existing);
    const committed = was ? was[1] : '(none)';
    if (committed === DIGEST) {
      console.error('unlock-offer drift: the generated migration was EDITED BY HAND.');
      console.error('  The extraction is unchanged (same digest) but the committed file is not.');
    } else {
      console.error('unlock-offer drift: a price, a gate or the eligibility predicate moved.');
      console.error(`  committed digest ${committed}`);
      console.error(`  extracted digest ${DIGEST}`);
      console.error('  ⚠ hr_unlock_buy CHARGES OUT OF THIS TABLE. Until it is regenerated and');
      console.error('    re-applied, the server charges the OLD price for the NEW shop row.');
    }
    console.error('  Run: node tools/gen-unlock-offers.mjs   (then read the diff)');
    process.exit(1);
  }
  console.log(`unlock offers in sync (${rows.length} authored, ${sellableRows.length} sellable, `
    + `digest ${DIGEST.slice(0, 12)}…)`);
} else {
  await writeFile(OUT, file, 'utf8');
  console.log(`wrote ${OUT}`);
  console.log(`  ${rows.length} authored · ${sellableRows.length} sellable · ${tableSummary}`);
  console.log(`  digest ${DIGEST}`);
}
