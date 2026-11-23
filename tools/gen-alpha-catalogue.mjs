#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-alpha-catalogue.mjs — THE SERVER CATALOGUE OF THE ALPHA SHOP,
// THE STAMINA REFILL (lane S2; the Blessings left it on 2026-11-22, below).
//
// Three data files are the only source of these numbers; Postgres needs them
// to price a purchase by itself (a client never names a price):
//   src/data/supply-basics.js   SUPPLY_SHOP_OFFERS  -> hr_shop_supply_offers
//   src/data/stamina-refill.js  STAMINA_REFILL      -> hr_stamina_refill_rule
// THE BLESSINGS LEFT THIS CATALOGUE (lane/level-costs, 2026-11-22): one Blessing priced in hours of the wage at
// the hero's Level replaced the three tiers; its row is hr_level_costs (tools/gen-level-costs.mjs) and
// 1063-level-costs.sql drops hr_blessing_rule and hr_blessing_tiers, so this file writes neither.
//
//   Regenerate:  node tools/gen-alpha-catalogue.mjs
//   Verify:      node tools/gen-alpha-catalogue.mjs --check     (exit 1 on drift)
//   Selftest:    node tools/gen-alpha-catalogue.mjs --selftest  (every refusal bites)
//
// REFUSES (throws, nothing written): a supply offer for an unknown item, for an
// item that is not a packable hunt supply (src/data/supplies.js), whose kind is
// not the item's own, whose basic row is unknown or not its partner, a price
// that is not the designer's rate (designerPrice: the basic's gold a point x the
// item's own points; a shot at its basic's price), a duplicate item; a tool that is not a
// tier-1 gathering tool; a GEAR row (the outfitter, designer 2026-10-22) for a slot a
// walked ground drops (SHOP_GEAR_SLOTS), a piece above Level 1, a bound piece, a field-salvage
// find, or one not at the store's ask (src/data/store-kit.js storeAsk: storeCeiling x its book, K-3); a SEED row (the seed counter,
// designer 2026-10-22) for an item that is not a crop's seed, not at the store's ask, or with a basic;
// and any refill table its own validate() rejects.
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SUPPLY_SHOP_OFFERS, BASIC_INDEX, SHOP_GEAR_SLOTS } from '../src/data/supply-basics.js';
import { storeAsk } from '../src/data/store-kit.js';
import { SUPPLIES } from '../src/data/supplies.js';
import { ITEMS } from '../src/data/items.js';
import { MONSTERS } from '../src/data/monsters.js';
import { CROPS } from '../src/data/gathering.js';
import { STAMINA_REFILL, validate as validateRefill } from '../src/data/stamina-refill.js';
import { JEWEL_PIECES, JEWEL_SHOP_PRICE, JEWEL_SHOP_SLOTS } from '../src/data/jewelry.js';
import { isMain } from '../tests/_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* THE FORWARD FILE: 2026-10-25- and 2026-11-03-alpha-catalogue.generated.sql are APPLIED history, never regenerated.
   The outfitter's gear rows (lane/b-gold-sinks) and the seed counter (designer 2026-10-22, lane/b-orphan-sources) land
   in ONE forward file (the v0.2.30 integration collapsed the never-applied 11-20 and 11-21 files into it), the same
   full delete+insert replace, with the kind check widened to 'seed'. */
/* v0.2.31 integration: ONE forward file per generator after the newest APPLIED (2026-11-20). */
/* THE FIRST SHIELD (lane b-spell-roles, Tyler 2026-10-23: a basic shield at the Shop outfitter): 2026-11-22 is APPLIED
   history; the Bronze-Rimmed Shield joins the outfitter's gear rows (hr_shop_supply_offers) in ONE forward file, applied
   after 2027-01-13-items-catalogue.generated.sql (hr_items first): the same full delete+insert replace. */
/* GOLD MATTERS (lane/c-gold-matters, designer 2026-11-03): 2027-01-13 is APPLIED history; the stamina refill's first buy moves to 1,000 g + 250 g a Level
   in this forward file, the same full delete+insert replace. No shop, seed or Blessing row moves. */
/* CRAFTED JEWELRY (lane/c-jewelry-sample, Tyler 2026-11-05, call 5): 2027-02-24 is APPLIED history; the plain Banded Signet joins the outfitter at
   its premium (src/data/jewelry.js JEWEL_SHOP_PRICE) in this forward file, the same full delete+insert replace. No other row moves. */
/* THE BLESSING CUT (lane/c-death-and-slots, Tyler 2026-11-10): 2027-03-14-jewelry is APPLIED history; hr_blessing_tiers.permille moves 320 / 630 / 950 ->
   250 / 500 / 750 (src/data/blessings.js BLESSING_CUT_PERMILLE) in this forward file, the same full delete+insert replace. No shop, seed or refill row moves.
   hr_blessing_take reads the row at the death, so no body and no edge waits on it: either order against the 2027-03-25 death pair and the hr-accrue. */
/* THE JEWELRY SAMPLE (lane/d-jewelry-sample, 2026-11-18): 2027-03-25-death-share is APPLIED history; the Fang Studs, the Wolfbone Necklace (3,000 g) and the
   Seam Jasper Band (12,000 g) join the outfitter at their premium (src/data/jewelry.js JEWEL_SHOP_PRICE, Tyler 2026-11-05 call 5: plain jewelry stays in
   the Shop), the same full delete+insert replace. No other row moves. ORDER: after this lane's items catalogue (the rows in hr_items). */
/* THE REFILL STEP (lane/c-approved-rows, Tyler 2026-11-20, balance call 24-1): 2027-05-09-jewelry-sample is APPLIED history; the six daily refills climb
   x1, 1.5, 2, 2.5, 3, 3.5 (src/data/stamina-refill.js stepNum 1 / stepDen 2, was 2/15) in this forward file, the same full delete+insert replace. No shop,
   seed or Blessing row moves. hr_stamina_refill reads the row at the purchase and the quote projects it, so no body and no edge waits on it. */
/* THE STORE'S DERIVED PRICES (lane/econ-levers, 2026-11-22), FOLDED INTO this still-STAGED forward file: the crafted supplies' price list follows
   src/data/store-kit.js, and every store rune's crafted partner gets its price-list row (the buy-back cap). Nothing new is sold. */
/* ONE STORE CEILING (lane/prices-wage-hours, 2026-11-23; 27-formula-overhaul.md K-3), FOLDED INTO this still-STAGED forward file: tools,
   outfitter pieces, plain jewels and seeds at src/data/store-kit.js storeAsk, and the shop's buy-back cap laid on the standing bids (a
   lowered price caps its bid in this file, so its self-check holds before 1058 re-issues the bids, and on a second apply after it). */
export const OUT_NAME = '1009-approved-rows-alpha-catalogue.generated.sql';
export const OUT = join(ROOT, 'supabase', 'migrations', OUT_NAME);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
/* The shop's word for a supply kind (what the Shop window files it under). */
const SHOP_KIND = Object.freeze({ heal: 'food', mana: 'drink', ammo: 'ammo' });

/** The designer's rate for a packed item: its basic's gold per point times the item's own
    points (heal or mana); a shot costs its basic's per-shot price. */
export function designerPrice(b, item) {
  if (b.kind === 'ammo') return b.price;
  const per = b.kind === 'heal' ? b.heals : b.mana;
  const own = b.kind === 'heal' ? Number(item.heals) : Number(item.mana);
  return Math.ceil(b.price * own / per);
}

/** Validated supply offer rows, or throw. */
export function supplyRows(offers = SUPPLY_SHOP_OFFERS, { items = ITEMS, supplies = SUPPLIES, basics = BASIC_INDEX, monsters = MONSTERS, crops = CROPS } = {}) {
  const seen = new Set();
  /* item -> the monster whose field-salvage row drops it (a salvage piece is never shop stock) */
  const salvaged = new Map();
  for (const [mid, m] of Object.entries(monsters)) for (const d of (m && m.drops) || []) if (d && d.salvage) salvaged.set(d.id, mid);
  return offers.map((o) => {
    if (!o || !/^[a-z0-9_]{1,64}$/.test(o.item) || o.offer !== 'supply.' + o.item) throw new Error(`supply offer ${o && o.offer} is not supply.<item id>`);
    if (seen.has(o.item)) throw new Error(`supply offer ${o.item} is listed twice`);
    seen.add(o.item);
    if (!own(items, o.item)) throw new Error(`supply offer ${o.item} names no item`);
    if (o.kind === 'tool') {
      /* A tier-1 gathering tool (Tyler 10-18), at the store's ask over its book value (K-3: one ceiling). */
      const it = items[o.item];
      if (it.type !== 'tool' || it.toolTier !== 1 || o.basic !== null) throw new Error(`tool offer ${o.item} is not a tier-1 gathering tool with no basic`);
      if (o.price !== storeAsk(it.v)) throw new Error(`tool offer ${o.item} at ${o.price} g is not the store's ask ${storeAsk(it.v)} over its book value ${it.v}`);
      return { offer: o.offer, item: o.item, kind: o.kind, price: o.price };
    }
    /* every crafted piece the Shop lists comes here (src/data/jewelry.js JEWEL_PIECES), priced or not, so a cloak or an unpriced jewel is refused, never sold as plain gear */
    if (o.kind === 'gear' && (own(JEWEL_SHOP_PRICE, o.item) || own(JEWEL_PIECES, o.item))) {
      /* PLAIN CRAFTED JEWELRY STAYS IN THE SHOP (Tyler 2026-11-05, call 5), at the store's one ceiling over its book (K-3, its own price
         JEWEL_SHOP_PRICE), so the Shop never undercuts the crafter and buy-then-sell always loses. The one door past tier 1. */
      const it = items[o.item];
      if (!JEWEL_PIECES[o.item] || it.jewelGrade || o.basic !== null) throw new Error(`gear offer ${o.item} is not a plain crafted jewelry piece with no basic`);
      /* jewelry only (the ruling's words): a crafted cloak has no Shop premium, so the Shop sells none past the Traveler Cape */
      if (!JEWEL_SHOP_SLOTS.includes(it.slot)) throw new Error(`gear offer ${o.item} is a crafted ${it.slot}, not jewelry: no Shop premium`);
      if (o.price !== JEWEL_SHOP_PRICE[o.item] || o.price !== storeAsk(it.v)) throw new Error(`gear offer ${o.item} at ${o.price} g is not its shop price (${JEWEL_SHOP_PRICE[o.item]} g, the store's ask ${storeAsk(it.v)} over its book ${it.v})`);
      if (it.bop || !(Number(it.v) > 0)) throw new Error(`gear offer ${o.item} is bound or has no book value`);
      return { offer: o.offer, item: o.item, kind: o.kind, price: o.price };
    }
    if (o.kind === 'gear') {
      /* The outfitter (designer 2026-10-22): a Level-1, unbound piece for a slot no walked ground drops, at the
         premium over its book value (the vendor pays at most half the shop price: buy-then-sell loses). */
      const it = items[o.item];
      if (!SHOP_GEAR_SLOTS.includes(it.slot) || o.basic !== null) throw new Error(`gear offer ${o.item} (slot ${it.slot}) is not an outfitter slot (${SHOP_GEAR_SLOTS.join(', ')}) with no basic`);
      if ((Number(it.reqLv) || 1) > 1 || (Number(it.tier) || 1) > 1) throw new Error(`gear offer ${o.item} is above tier 1 / Level 1: better pieces come from drops and crafting`);
      if (it.bop || !(Number(it.v) > 0)) throw new Error(`gear offer ${o.item} is bound or has no book value`);
      if (salvaged.has(o.item)) throw new Error(`gear offer ${o.item} is a field-salvage find (${salvaged.get(o.item)}): never shop stock (tests/field-salvage.mjs (a))`);
      if (o.price !== storeAsk(it.v)) throw new Error(`gear offer ${o.item} at ${o.price} g is not the store's ask ${storeAsk(it.v)} over its book value ${it.v}`);
      return { offer: o.offer, item: o.item, kind: o.kind, price: o.price };
    }
    if (o.kind === 'seed') {
      /* The seed counter (designer 2026-10-22): a crop's own seed, unbound, at the store's ask over its book value (K-3; the vendor
         pays at most half the cheapest shop unit, so buy-then-sell loses). */
      const it = items[o.item];
      const crop = it && it.seed && own(crops, it.seed) ? crops[it.seed] : null;
      if (!crop || crop.seed !== o.item || o.basic !== null) throw new Error(`seed offer ${o.item} is not a crop's own seed (src/data/gathering.js CROPS) with no basic`);
      if (it.bop || !(Number(it.v) > 0)) throw new Error(`seed offer ${o.item} is bound or has no book value`);
      if (o.price !== storeAsk(it.v)) throw new Error(`seed offer ${o.item} at ${o.price} g is not the store's ask ${storeAsk(it.v)} over its book value ${it.v}`);
      return { offer: o.offer, item: o.item, kind: o.kind, price: o.price };
    }
    if (!own(supplies, o.item)) throw new Error(`supply offer ${o.item} is not a packable hunt supply (src/data/supplies.js)`);
    if (SHOP_KIND[supplies[o.item].kind] !== o.kind) throw new Error(`supply offer ${o.item} is filed as ${o.kind}, the item is a ${supplies[o.item].kind}`);
    const b = basics[o.basic];
    if (!b || b.partner !== o.item) throw new Error(`supply offer ${o.item} names basic ${o.basic}, which is not its partner`);
    if (!Number.isSafeInteger(o.price) || o.price < 1) throw new Error(`supply offer ${o.item} has no positive integer price`);
    const want = designerPrice(b, items[o.item]);
    if (o.price !== want) throw new Error(`supply offer ${o.item} at ${o.price} g is not the designer's rate (${b.id}: ${want} g)`);
    return { offer: o.offer, item: o.item, kind: o.kind, price: o.price };
  });
}

function rules() {
  const bad = validateRefill();
  if (bad.length) throw new Error('the refill table is invalid: ' + bad.join('; '));
  return { refill: STAMINA_REFILL };
}

const sq = (s) => "'" + String(s).replace(/'/g, "''") + "'";

/** md5 of the offer rows as the self-check folds them in SQL (byte order, as collate "C"). */
const offersMd5 = (offers) => createHash('md5').update([...offers]
  .sort((a, b) => Buffer.compare(Buffer.from(a.offer), Buffer.from(b.offer)))
  .map((o) => `${o.offer}:${o.item}:${o.kind}:${o.price}`).join(',')).digest('hex');

export function render(offers = supplyRows(), r = rules()) {
  const digest = createHash('sha256').update(JSON.stringify({ offers, refill: r.refill })).digest('hex');
  const R = r.refill;
  return `-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE ALPHA SHOP AND STAMINA REFILL CATALOGUE
-- (GENERATED by tools/gen-alpha-catalogue.mjs — DO NOT EDIT BY HAND; lane S2)
--
--   hr_shop_supply_offers   src/data/supply-basics.js SUPPLY_SHOP_OFFERS
--   hr_stamina_refill_rule  src/data/stamina-refill.js STAMINA_REFILL
--   digest ${digest}
--
-- Server-only: RLS on, NO policy, no client grant (the client reads src/data and
-- the envelope's quotes). Idempotent: delete + insert; nothing references these
-- rows by foreign key. Any hand edit FAILS \`node tools/gen-alpha-catalogue.mjs --check\`.
-- SUPERSEDES 2026-11-22-alpha-catalogue.generated.sql (applied history): the
-- Bronze-Rimmed Shield joins the outfitter at 140 g (lane b-spell-roles, Tyler
-- 2026-10-23: a basic shield at the Shop; src/data/shields.js). ORDER: after
-- 2027-01-13-items-catalogue.generated.sql (the shield in hr_items). Carried from
-- 11-22, which superseded 2026-11-03-alpha-catalogue.generated.sql: the
-- outfitter's six gear rows (lane/b-gold-sinks) and the seed counter's nine rows
-- (designer ruling 2026-10-22, lane/b-orphan-sources: every crop's seed, one per
-- unit, at the counter's unit price, so no vendor bid moves) join the tools; one
-- file (the v0.2.30 integration collapsed the never-applied 11-20 and 11-21 files).
-- hr_shop_view lists them: 2026-11-24-shop-outfitter.sql, 2026-11-25-shop-seeds.sql.
-- ORDER: after the v0.2.29 chain (needs hr_items, hr_hunt_supplies, hr_crops); first of v0.2.30.
-- NEW IN THIS FILE (lane/c-approved-rows, backend-architect, 2026-11-20; Tyler 2026-11-20, balance call 24-1): the six daily stamina refills
-- climb by half a first refill each, x1, 1.5, 2, 2.5, 3, 3.5 (hr_stamina_refill_rule step_num ${R.stepNum} / step_den ${R.stepDen}, was 2 / 15). The base and
-- the per-Level term do not move. hr_stamina_refill prices every purchase from this row under its lock and its quote projects the same, so no
-- body moves and the hr-accrue does not wait on it. Every other row is carried unchanged from 2027-05-09-jewelry-sample-alpha-catalogue.generated.sql.
-- CARRIED FROM 2027-05-09 (lane/d-jewelry-sample, systems-engineer, 2026-11-18; itemization plan phase 2): the crafted Fang Studs and Wolfbone
-- Necklace (3,000 g) and the Seam Jasper Band (12,000 g) join the outfitter at their premium (Tyler 2026-11-05, call 5: plain jewelry stays in the
-- Shop, at least 10x its book). Every other row is carried unchanged from 2027-03-25-death-share-alpha-catalogue.generated.sql (applied history).
-- THE BLESSINGS LEAVE (lane/level-costs, 2026-11-22): hr_blessing_rule and hr_blessing_tiers are no longer written here
-- (their last rows are 2027-05-09's, applied history); 1063-level-costs.sql restates every reader onto hr_level_costs and
-- drops both tables. Every shop, seed and refill row is carried as before.
-- No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

do $pre$
begin
  if to_regclass('public.hr_items') is null or to_regclass('public.hr_hunt_supplies') is null or to_regclass('public.hr_crops') is null then
    raise exception 'PRECONDITION: hr_items / hr_hunt_supplies / hr_crops are absent (apply the item, hunt and farm catalogues first)'; end if;
end $pre$;

create table if not exists public.hr_shop_supply_offers (
  offer_id text primary key check (offer_id ~ '^supply\\.[a-z0-9_]{1,64}$'),
  item_id  text not null unique check (item_id ~ '^[a-z0-9_]{1,64}$'),
  kind     text not null check (kind in ('food', 'drink', 'ammo', 'tool', 'gear', 'seed')),
  price    bigint not null check (price between 1 and 1000000000),
  constraint hr_shop_supply_offers_id_ck check (offer_id = 'supply.' || item_id)
);
create table if not exists public.hr_stamina_refill_rule (
  id        boolean primary key default true check (id),
  base      int not null check (base > 0),
  per_level int not null check (per_level >= 0),
  max_min   int not null check (max_min between 1 and 240),
  per_day   int not null check (per_day between 1 and 100),
  step_num  int not null check (step_num >= 0),
  step_den  int not null check (step_den > 0)
);
-- The outfitter's 'gear' and the seed counter's 'seed' kinds (designer 2026-10-22): the 10-25 table was created
-- with the four kinds before them.
alter table public.hr_shop_supply_offers drop constraint if exists hr_shop_supply_offers_kind_check;
alter table public.hr_shop_supply_offers add constraint hr_shop_supply_offers_kind_check
  check (kind in ('food', 'drink', 'ammo', 'tool', 'gear', 'seed'));
alter table public.hr_shop_supply_offers enable row level security;
alter table public.hr_stamina_refill_rule enable row level security;
revoke all on public.hr_shop_supply_offers, public.hr_stamina_refill_rule
  from public, anon, authenticated, service_role;

delete from public.hr_shop_supply_offers;
insert into public.hr_shop_supply_offers (offer_id, item_id, kind, price) values
${offers.map((o) => `  (${sq(o.offer)}, ${sq(o.item)}, ${sq(o.kind)}, ${o.price})`).join(',\n')};

-- THE BUY-BACK CAP IS THE SHOP'S (catalogue.js SHOP_BUYBACK_RATE 0.5; lane/prices-wage-hours, 2026-11-23): the vendor bids at most half
-- the shop's price for a tool, piece or seed it sells. A price this file lowers (K-3: the late seeds) caps the standing bid with it, so
-- the invariant holds whichever catalogue file replays first; the hunt-sessions catalogue re-issues every bid from the same data rule.
update public.hr_hunt_vendor_value v set unit = o.price / 2
  from public.hr_shop_supply_offers o
 where o.item_id = v.item_id and o.kind in ('tool', 'gear', 'seed') and v.unit * 2 > o.price;

delete from public.hr_stamina_refill_rule;
insert into public.hr_stamina_refill_rule (id, base, per_level, max_min, per_day, step_num, step_den)
  values (true, ${R.base}, ${R.perLevel}, ${R.maxMinPerBuy}, ${R.perDay}, ${R.stepNum}, ${R.stepDen});

-- §4 SELF-CHECK (CLAUDE.md §4): the rows are the data's, every offer sells a real
-- packable item, and no client role reaches a table.
do $chk$
declare v_role text;
begin
  if (select count(*) from public.hr_shop_supply_offers) <> ${offers.length}
     or (select count(*) from public.hr_stamina_refill_rule) <> 1 then
    raise exception 'VERIFY: the alpha catalogue row counts are not the data''s'; end if;
  if (select md5(string_agg(offer_id || ':' || item_id || ':' || kind || ':' || price, ',' order by offer_id collate "C"))
        from public.hr_shop_supply_offers) is distinct from ${sq(offersMd5(offers))} then
    raise exception 'VERIFY: the supply offers are not the data''s rows and prices'; end if;
  if exists (select 1 from public.hr_shop_supply_offers o
              where not exists (select 1 from public.hr_items i where i.item_id = o.item_id)
                 or (o.kind not in ('tool', 'gear', 'seed') and not exists (select 1 from public.hr_hunt_supplies s where s.item_id = o.item_id))
                 or (o.kind = 'seed' and not exists (select 1 from public.hr_crops c where c.seed_item = o.item_id))) then
    raise exception 'VERIFY: a supply offer sells an item that is not a packable hunt supply (or a tool, gear or a crop''s seed)'; end if;
  if exists (select 1 from public.hr_crops c where c.seed_item is not null
              and not exists (select 1 from public.hr_shop_supply_offers o where o.kind = 'seed' and o.item_id = c.seed_item)) then
    raise exception 'VERIFY: a crop''s seed is on no Shop row (nobody could plant it)'; end if;
  if exists (select 1 from public.hr_shop_supply_offers o join public.hr_hunt_vendor_value v on v.item_id = o.item_id
              where o.kind in ('tool', 'gear', 'seed') and v.unit * 2 > o.price) then
    raise exception 'VERIFY: the vendor bids more than half the shop price of a tool, gear piece or seed (buy-then-sell would pay)'; end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.hr_shop_supply_offers', 'select,insert,update,delete')
       or has_table_privilege(v_role, 'public.hr_stamina_refill_rule', 'select,insert,update,delete') then
      raise exception 'VERIFY: % reaches an alpha catalogue table', v_role; end if;
  end loop;
  if (select base || ':' || per_level || ':' || max_min || ':' || per_day || ':' || step_num || ':' || step_den from public.hr_stamina_refill_rule)
       is distinct from ${sq(`${R.base}:${R.perLevel}:${R.maxMinPerBuy}:${R.perDay}:${R.stepNum}:${R.stepDen}`)} then
    raise exception 'VERIFY: the refill rule is not the data''s row (src/data/stamina-refill.js)'; end if;
  raise notice 'alpha catalogue: % supply offers and the refill rule; all green', ${offers.length};
end $chk$;

-- §4 SELF-CHECK, THE REFILL AS A BUYER MEETS IT (EXECUTED, rolled back): a probe hero on an empty pool buys all ${R.perDay} of the day through the
-- real hr_stamina_refill at the quote's price. Each quote is the data's formula (src/data/stamina-refill.js refillPrice: base + per Level, x
-- (step_den + step_num x (n - 1)) / step_den), each purchase takes exactly that from the purse with one journal row, and the day's last answers
-- refill_limit. A sentinel exception rolls the probe back whole, so no row of it outlives this block.
do $chk$
declare
  c_u  uuid := gen_random_uuid();
  v    jsonb; v_q jsonb; v_n int; v_lv int; v_min bigint; v_want bigint; v_g0 bigint; v_seen text := '';
begin
  if to_regprocedure('public.hr_stamina_refill(integer,bigint,uuid)') is null or to_regprocedure('public.hr_stamina_refill_quote(uuid,integer)') is null
     or to_regprocedure('public.hr_create_character(integer)') is null or to_regprocedure('public.hr_purse_of(uuid)') is null then
    raise exception 'VERIFY(refill probe) CANNOT RUN: a function it executes is missing - a skipped check is not a passed one'; end if;
  begin
    insert into auth.users (id) values (c_u);
    insert into public.hr_access_allowlist (user_id, note) values (c_u, 'alpha catalogue refill probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', c_u::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', c_u, 'role', 'authenticated')::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(refill probe): hr_create_character refused: %', v; end if;
    insert into public.account_wallet as w (user_id, gold) values (c_u, 100000000)
      on conflict (user_id) do update set gold = excluded.gold;
    for v_n in 1 .. ${R.perDay} loop
      update public.player_state set stamina_ms = 0, stamina_at = now() where user_id = c_u and slot = 0;
      v_q := public.hr_stamina_refill_quote(c_u, 0);
      if not coalesce((v_q->>'available')::boolean, false) or (v_q->>'n')::int is distinct from v_n then
        raise exception 'VERIFY(refill probe): purchase % is not on offer: %', v_n, v_q; end if;
      v_lv := (v_q->>'level')::int;
      v_min := (v_q->>'restore_ms')::bigint / 60000;
      v_want := ceil(((${R.base} + ${R.perLevel} * v_lv)::numeric * (${R.stepDen} + ${R.stepNum} * (v_n - 1)) * v_min) / (${R.stepDen}::numeric * ${R.maxMinPerBuy}))::bigint;
      if (v_q->>'price')::bigint is distinct from v_want then
        raise exception 'VERIFY(refill probe): purchase % is quoted %, the data''s formula says %', v_n, v_q->>'price', v_want; end if;
      v_g0 := public.hr_purse_of(c_u);
      delete from public.hr_rate_counters where user_id = c_u;
      v := public.hr_stamina_refill(0, v_want, gen_random_uuid());
      if coalesce(v->>'ok', '') <> 'true' or public.hr_purse_of(c_u) <> v_g0 - v_want then
        raise exception 'VERIFY(refill probe): purchase % at % answered % and took %', v_n, v_want, v, v_g0 - public.hr_purse_of(c_u); end if;
      v_seen := v_seen || v_want || ' ';
    end loop;
    if (select count(*) from public.player_ledger l where l.user_id = c_u and l.kind = 'shop' and l.intent like 'stamina\\_refill:%') <> ${R.perDay} then
      raise exception 'VERIFY(refill probe): the day''s purchases are not one journal row each'; end if;
    update public.player_state set stamina_ms = 0, stamina_at = now() where user_id = c_u and slot = 0;
    v_q := public.hr_stamina_refill_quote(c_u, 0);
    if coalesce((v_q->>'available')::boolean, true) or v_q->>'why' is distinct from 'refill_limit' then
      raise exception 'VERIFY(refill probe): past the day''s ${R.perDay} the quote reads %', v_q; end if;
    raise exception using errcode = 'HRA01', message = 'refill probe: rolled back';
  exception when sqlstate 'HRA01' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  if exists (select 1 from auth.users where id = c_u) or exists (select 1 from public.player_state where user_id = c_u) then
    raise exception 'VERIFY(refill probe): LEAKED a probe row'; end if;
  raise notice 'alpha catalogue refill probe: the day''s ${R.perDay} sold at the data''s steps (% gold), then refill_limit', trim(v_seen);
end $chk$;
`;
}

/* The outfitter's refusals, each planted on the first real gear row (designer 2026-10-22). */
function gearCases(base) {
  const at = base.findIndex((o) => o.kind === 'gear');
  if (at < 0) return [['no gear row to plant on', null]];
  const g = (patch) => base.map((o, i) => (i === at ? { ...o, ...patch } : o));
  const v = (id) => storeAsk(ITEMS[id].v);
  return [
    ['gear for a slot a ground drops (a helmet)', g({ item: 'leather_helmet', offer: 'supply.leather_helmet', price: v('leather_helmet') })],
    ['gear above Level 1', g({ item: 'studded_belt', offer: 'supply.studded_belt', price: v('studded_belt') })],
    ['gear that is a field-salvage find', g({ item: 'apprentice_gloves', offer: 'supply.apprentice_gloves', price: v('apprentice_gloves') })],
    ['gear under the store ask', g({ price: v(base[at].item) - 1 })],
    ['gear over the store ask (a typed premium)', g({ price: v(base[at].item) * 2 })],
    ['gear with a basic', g({ basic: 'salted_shrimp' })],
    ['a crafted ring under its premium', g({ item: 'banded_signet', offer: 'supply.banded_signet', price: JEWEL_SHOP_PRICE.banded_signet - 1 })],
    ['a Fine ring in the Shop', g({ item: 'banded_signet_keen', offer: 'supply.banded_signet_keen', price: JEWEL_SHOP_PRICE.banded_signet })],
    ['the crafted cloak in the Shop at a jewel premium', g({ item: 'warband_bulwark', offer: 'supply.warband_bulwark', price: 12000 })],
  ];
}

/* The seed counter's refusals, each planted on the first real seed row (designer 2026-10-22). */
function seedCases(base) {
  const at = base.findIndex((o) => o.kind === 'seed');
  if (at < 0) return [['no seed row to plant on', null]];
  const g = (patch) => base.map((o, i) => (i === at ? { ...o, ...patch } : o));
  return [
    ['a seed row for an item that is not a seed (the crop itself)', g({ item: 'turnip', offer: 'supply.turnip' })],
    ['a seed row below its book value', g({ price: Number(ITEMS[base[at].item].v) - 1 })],
    ['a seed row with a basic', g({ basic: 'thin_turnip_juice' })],
  ];
}

function selftest() {
  const base = SUPPLY_SHOP_OFFERS;
  const one = (patch) => base.map((o, i) => (i === 0 ? { ...o, ...patch } : o));
  const cases = [
    ['unknown item', one({ item: 'not_an_item', offer: 'supply.not_an_item' })],
    ['not packable', one({ item: 'bronze_sword', offer: 'supply.bronze_sword' })],
    ['wrong kind', one({ kind: 'ammo' })],
    ['basic not its partner', one({ basic: 'salted_trout' })],
    ['off the designer rate', one({ price: 18 })],
    ['offer id not supply.<item>', one({ offer: 'equip.cooked_shrimp' })],
    ['duplicate item', base.concat([base[0]])],
    ...gearCases(base),
    ...seedCases(base),
  ];
  let bad = 0;
  for (const [why, rows] of cases) {
    try { supplyRows(rows); console.error(`  ✗ ${why}: NOT refused`); bad++; } catch { console.log(`  ✓ ${why}: refused`); }
  }
  try { supplyRows(); console.log('  ✓ the shipped rows pass'); } catch (e) { console.error('  ✗ the shipped rows are refused: ' + e.message); bad++; }
  if (bad) { console.error(`gen-alpha-catalogue --selftest: ${bad} case(s) wrong`); process.exit(1); }
  console.log(`gen-alpha-catalogue --selftest: all ${cases.length + 1} cases right`);
}

async function main() {
  if (process.argv.includes('--selftest')) return selftest();
  const wanted = render();
  if (process.argv.includes('--check')) {
    let have = '';
    try { have = (await readFile(OUT, 'utf8')).replace(/\r\n/g, '\n'); } catch { /* absent */ }
    if (have !== wanted) {
      console.error(`gen-alpha-catalogue --check FAILED: ${OUT_NAME} is stale. Run: node tools/gen-alpha-catalogue.mjs`);
      process.exit(1);
    }
    console.log('gen-alpha-catalogue --check: catalogue matches src/data');
    return;
  }
  await writeFile(OUT, wanted);
  console.log('wrote ' + OUT);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error('gen-alpha-catalogue: ' + e.message); process.exit(1); });
